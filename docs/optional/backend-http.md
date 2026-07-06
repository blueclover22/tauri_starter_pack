# Optional — Backend HTTP (reqwest)

> 도입 시점: Rust 측에서 외부 API 호출이 필요해진 시점.
> 뼈대 단계에서는 사용하지 않는다.

Frontend 에서 직접 `fetch` 로 백엔드를 호출하지 않는다 (토큰 노출 / CORS / 응답 정규화 문제). 외부 HTTP 호출은 Rust `service.rs` 에서 공유 `HttpClient` 로 수행한다.

---

## 1. 아키텍처 위치 · End-to-end 흐름

Renderer 는 외부 API 를 **직접 호출하지 않는다**. HTTP 는 전적으로 Rust service layer 의 책임이며, Renderer 는 그 결과(정규화된 도메인 데이터 또는 `AppError`)만 IPC 로 받는다. 이 경계 덕분에 토큰·엔드포인트·재시도 정책이 Renderer 에 노출되지 않고, 뼈대의 보안 모델(`architecture.md §9`)·레이어 규칙과 어긋나지 않는다.

호출 1건의 전체 경로:

```text
Component
  → feature hook (model/use*.ts)
  → feature api/<f>Api.ts            # command 이름·payload 계약
  → shared invoke wrapper            # src/shared/lib/tauri/invoke.ts
  ── Tauri IPC ──
  → Rust command (features/<f>/commands.rs)    # 얇은 진입점, IpcResult 포장만
  → Rust service (features/<f>/service.rs)     # 비즈니스 로직
  → state.http_client (공유 HttpClient)        # reqwest, connection pool 공유
  → 외부 API
  ← HttpResponseEnvelope / NetworkErrorKind
  → AppError 매핑 (shared/lib/network_error.rs)
  → IpcResult<T> (response::ok 또는 IpcResult::err)
  ── Tauri IPC ──
  → feature api/<f>Parsers.ts        # 응답 파싱·AppError 정규화
  → hook → Component
```

- 성공은 `response::ok(data)`, 네트워크 실패는 `NetworkErrorKind` → `AppError` 로 매핑해 `Ok(IpcResult::err(...))` 로 반환한다 (Ok-Only, `tauri-guide.md §8`). command 에서 `Err(String)` 으로 흘리지 않는다.
- `retryable` 은 `NetworkErrorKind::retryable()` 이 결정하고, 이 값이 UI 재시도 버튼과 (도입 시) TanStack Query `retry` 판단(`docs/optional/server-state.md §1.2`)으로 그대로 이어진다.
- 인증 토큰이 필요한 호출은 `HttpClient` 가 요청에 토큰을 주입한다 (§4). 토큰의 저장·수명은 `docs/optional/auth.md` 가 소유한다.

---

## 2. 뼈대 통합 접점

이 기능은 새 plugin 이 아니라 **`AppState` 에 공유 client 를 얹는** 방식으로 뼈대에 붙는다. 아래 접점 외의 파일은 건드리지 않는다.

| 접점                                 | 뼈대 현재 상태                                   | 도입 시 변경                                                                       |
| :----------------------------------- | :----------------------------------------------- | :--------------------------------------------------------------------------------- |
| `AppState` (`store/state.rs`)        | `teardown` 필드만                                | `http_client: Arc<HttpClient>` 필드 추가                                           |
| `BootStage` (`runtime/lifecycle.rs`) | `InitPlugins` / `PrepareState` / `RegisterState` | `PrepareState` 에서 `HttpClient` 생성해 `AppState` 에 주입 (stage 추가 불요)       |
| `lib.rs` builder                     | log plugin + `app_ping` 등록                     | **변경 없음** — reqwest 는 Tauri plugin 이 아니다                                  |
| `capabilities/default.json`          | `core:default` (+ `log:default`)                 | **추가 없음** — HTTP 는 Rust 내부에서만 발생 (frontend 권한 불요)                  |
| `shared/config.rs`                   | `ERROR_*` / `EVENT_*` 상수                       | base URL · timeout · 기본 헤더 상수 추가                                           |
| 신규 파일                            | —                                                | `shared/api/services.rs`(HttpClient), `shared/lib/network_error.rs`(AppError 매핑) |
| 호출 feature                         | `app` 샘플                                       | `service.rs` 가 `state.http_client` 사용, (선택) `api.rs` = HTTP 어댑터            |

> `PrepareState` 에서 client 를 만든다는 것은 `AppState::new()` 가 `http_client` 를 함께 구성한다는 의미다. `reqwest::Client::builder()...build()` 가 실패할 수 있으면 이 지점에서 `BootError` 로 전파해 부팅을 중단한다.

---

## 3. 구조

- 위치: `src-tauri/src/shared/api/services.rs` (또는 `shared/http/client.rs`)
- 등록: `AppState.http_client: Arc<HttpClient>` 로 lifecycle `PrepareState` 단계에서 등록.
- 사용: 모든 feature `service.rs` 가 `state.http_client` 를 통해 동일 인스턴스 공유 (connection pool 재사용).

```rust
pub struct HttpClient {
    pub client: Client,                          // reqwest::Client (Clone-able)
    pub auth_token: Mutex<Option<String>>,
}

impl HttpClient {
    pub fn set_auth_token(&self, token: Option<String>);
    pub fn get_with_auth(&self, url: &str) -> RequestBuilder;
    pub fn post_with_auth(&self, url: &str) -> RequestBuilder;
    pub async fn send_with_auth(
        &self, req: RequestBuilder, auth: &AuthState, url_path: &str,
    ) -> Result<HttpResponseEnvelope, NetworkErrorKind>;
}
```

`reqwest::Client` 는 내부 connection pool 을 가지며 `Clone` 이 cheap 한 thread-safe 핸들이다. 기본 헤더·timeout(예: 5초)은 client 생성 시 설정한다.

---

## 4. 토큰 관리

- 로그인 성공 시 `state.http_client.set_auth_token(Some(token))` 호출.
- 로그아웃 / 인증 만료 시 `set_auth_token(None)`.
- 토큰은 Rust `AppState` 내부에서만 관리하며 **Frontend 에 노출하지 않는다** (`docs/optional/auth.md` 참조).

---

## 5. NetworkErrorKind

`retryable()` 과 `code()` 가 UI 재시도 정책과 `AppError.code` 를 동시에 결정한다.

| 에러 유형        | `NetworkErrorKind`  | retryable | code 예시               |
| ---------------- | ------------------- | --------- | ----------------------- |
| 타임아웃         | `Timeout`           | true      | `ERROR_NETWORK_TIMEOUT` |
| 연결 실패        | `ConnectionRefused` | true      | `ERROR_NETWORK_REFUSED` |
| DNS 실패         | `DnsFailure`        | true      | `ERROR_NETWORK_DNS`     |
| HTTP 5xx         | `ServerError`       | true      | `ERROR_NETWORK_SERVER`  |
| 인증 만료        | `AuthExpired`       | false     | `ERROR_AUTH_EXPIRED`    |
| 응답 디코드 실패 | `Decode`            | false     | `ERROR_NETWORK_DECODE`  |
| 기타             | `Unknown`           | false     | `ERROR_NETWORK_UNKNOWN` |

retry 는 **opt-in** — 호출부가 명시적으로 필요한 경우에만 사용한다. `retryable() == false` 분류는 즉시 실패로 전파한다.

---

## 6. Cargo.toml 변경

```toml
[dependencies]
reqwest = { version = "0.12", default-features = false, features = ["json", "rustls-tls"] }
serde_json = "1"
```

---

## 7. 안티패턴 · 경계 주의

| 패턴                                                                    | 이유 / 올바른 방향                                                               |
| :---------------------------------------------------------------------- | :------------------------------------------------------------------------------- |
| Renderer 에서 `fetch` / `@tauri-apps/plugin-http` 로 외부 API 직접 호출 | 토큰·엔드포인트 노출, CORS, 응답 정규화 이중화 → 모든 HTTP 는 Rust `service.rs`  |
| feature 마다 `reqwest::Client` 새로 생성                                | connection pool·TLS 세션 재사용 불가 → `state.http_client` 공유 인스턴스 1개     |
| service async 흐름에서 timeout 없이 요청                                | 무한 대기로 async runtime 점유 → client 생성 시 timeout 필수 (§3)                |
| raw `reqwest::Error` 를 command 밖으로 그대로 반환                      | Renderer 가 해석·retryable 판단 불가 → `NetworkErrorKind` → `AppError` 매핑 경유 |
| HTTP 실패를 `Err(String)` 으로 반환                                     | 비즈니스/시스템 에러 구분 불가 → `Ok(IpcResult::err(...))` (Ok-Only)             |
| base URL·토큰을 command 인자로 Renderer 에서 전달                       | 계약·보안 붕괴 → URL 은 `config.rs` 상수, 토큰은 Rust 내부 관리 (`auth.md`)      |
| `capabilities` 에 `http:default` 추가                                   | frontend HTTP 를 여는 권한 → 본 구조에서는 불필요, 추가 시 보안 모델 약화        |

---

## 8. 도입 체크리스트

| #   | 항목                                                                                                   | 확인 |
| :-- | :----------------------------------------------------------------------------------------------------- | :--- |
| 1   | `reqwest` 의존성 추가 (TLS feature 선택: `rustls-tls` 권장, OpenSSL 회피)                              | □    |
| 2   | `shared/api/services.rs` 에 `HttpClient` 정의                                                          | □    |
| 3   | `AppState.http_client: Arc<HttpClient>` 등록 (lifecycle `PrepareState`)                                | □    |
| 4   | `NetworkErrorKind` enum + `retryable()` / `code()` 구현                                                | □    |
| 5   | `shared/lib/network_error.rs` 에서 `AppError` 매핑 helper                                              | □    |
| 6   | base URL / timeout / 기본 헤더를 `shared/config.rs` 상수로 분리                                        | □    |
| 7   | `capabilities/default.json` 의 `http:default` 권한은 **필요 없음** — 모든 HTTP 호출은 Rust 측에서 처리 | □    |
