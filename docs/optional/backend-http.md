# Optional — Backend HTTP (reqwest)

> 도입 시점: Rust 측에서 외부 API 호출이 필요해진 시점.
> 뼈대 단계에서는 사용하지 않는다.

Frontend 에서 직접 `fetch` 로 백엔드를 호출하지 않는다 (토큰 노출 / CORS / 응답 정규화 문제). 외부 HTTP 호출은 Rust `service.rs` 에서 공유 `HttpClient` 로 수행한다.

---

## 1. 구조

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

## 2. 토큰 관리

- 로그인 성공 시 `state.http_client.set_auth_token(Some(token))` 호출.
- 로그아웃 / 인증 만료 시 `set_auth_token(None)`.
- 토큰은 Rust `AppState` 내부에서만 관리하며 **Frontend 에 노출하지 않는다** (`docs/optional/auth.md` 참조).

---

## 3. NetworkErrorKind

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

## 4. Cargo.toml 변경

```toml
[dependencies]
reqwest = { version = "0.12", default-features = false, features = ["json", "rustls-tls"] }
serde_json = "1"
```

---

## 5. 도입 체크리스트

| #   | 항목                                                                                                   | 확인 |
| :-- | :----------------------------------------------------------------------------------------------------- | :--- |
| 1   | `reqwest` 의존성 추가 (TLS feature 선택: `rustls-tls` 권장, OpenSSL 회피)                              | □    |
| 2   | `shared/api/services.rs` 에 `HttpClient` 정의                                                          | □    |
| 3   | `AppState.http_client: Arc<HttpClient>` 등록 (lifecycle `PrepareState`)                                | □    |
| 4   | `NetworkErrorKind` enum + `retryable()` / `code()` 구현                                                | □    |
| 5   | `shared/lib/network_error.rs` 에서 `AppError` 매핑 helper                                              | □    |
| 6   | base URL / timeout / 기본 헤더를 `shared/config.rs` 상수로 분리                                        | □    |
| 7   | `capabilities/default.json` 의 `http:default` 권한은 **필요 없음** — 모든 HTTP 호출은 Rust 측에서 처리 | □    |
