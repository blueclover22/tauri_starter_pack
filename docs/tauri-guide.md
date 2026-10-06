# Tauri Guide

이 문서는 Tauri v2 기반 데스크톱·모바일 애플리케이션에서 Tauri 고유 메커니즘의 구현 방법과 운영 규칙을 정리한다. 구조 전반은 [architecture.md](./architecture.md), 코드 작성 규칙은 [coding-rules.md](./coding-rules.md) 를 기준으로 한다.

본 문서는 **뼈대 기준**으로 작성되었다. 추가 기능별 가이드(`docs/optional/*.md`) 목록은 [`AGENTS.md` §참조 문서](../AGENTS.md#참조-문서) 를 따른다.

---

## 1. Core Rules

component 에서 `invoke` 를 직접 호출하지 않고 모든 Tauri 호출은 feature API layer 를 통해서만 진행한다. Rust command handler 는 얇게 유지하고 비즈니스 로직은 `service.rs` 에 둔다. 입력/출력 계약은 Rust `model` 과 TS 타입을 함께 관리한다 (`coding-rules.md §5`·`§10`).

---

## 2. Folder Structure 요약

폴더 구조와 핵심 파일 역할(`ipc.rs`, `response.rs`, `state.rs`, `lifecycle.rs`, `lib.rs`, `invoke.ts`, `ipc.ts`)은 `architecture.md §7.4`·`§7.5` 를 기준으로 한다.

---

## 3. Layer Responsibilities

계층별 역할은 `architecture.md §2`(관심사 분리)·`§3`(Process Model) 을 기준으로 한다. Tauri 관점의 추가 규칙: Component 는 `invoke`/`fetch`/parsing 을 직접 하지 않고, API 는 command 이름·payload 를 결정하며 invoke helper 를 사용하고, Rust Command 는 입력 수신 → service 호출 → `IpcResult<T>` 포장만 한다 (분기·로직 없음).

---

## 4. Type Sync (Rust ↔ TS)

Rust 와 TypeScript 의 계약 타입은 항상 일치하게 유지한다. 새 command 를 추가하면 request/response 타입을 먼저 정의한다. Rust struct 에는 `#[serde(rename_all = "camelCase")]` 를 적용한다. 공용 contract(`IpcResult`/`IpcResponse`/`AppError`) 정의는 `architecture.md §6`, 샘플 타입(`PingRequest`/`PingInfo`)은 `tauri-commands.md` 를 참조한다.

---

## 5. Shared Invoke Wrapper

공통 invoke helper 는 `invoke` 호출 감싸기, IPC 실패의 `AppError` 정규화, `IpcResponse.success` 검사, 실패 response 의 공통 error 변환을 담당한다.

```ts
// src/shared/lib/tauri/invoke.ts
import { invoke } from "@tauri-apps/api/core";
import type { IpcResponse, AppError } from "@/shared/types/ipc";

export async function invokeTauri<TResponse>(
  command: string,
  args?: Record<string, unknown>,
): Promise<TResponse> {
  let result: IpcResponse<TResponse>;
  try {
    result = await invoke<IpcResponse<TResponse>>(command, args);
  } catch (invokeErr) {
    throw {
      code: "ERROR_TAURI_INVOKE_FAILED",
      message: invokeErr instanceof Error ? invokeErr.message : String(invokeErr),
      retryable: true,
    } satisfies AppError;
  }

  if (!result.success) {
    throw (
      result.error ??
      ({
        code: "ERROR_TAURI_COMMAND_FAILED",
        message: "알 수 없는 오류",
        retryable: true,
      } satisfies AppError)
    );
  }

  return result.data;
}
```

처리 흐름: ① `invoke()` 자체 실패 → `AppError` 로 감싸 throw. ② `result.success` false → `result.error` throw. ③ 성공 → `result.data` 반환.

> **주의**: throw 되는 값은 `Error` 인스턴스가 아닌 plain object(`AppError`) 이다. `e instanceof Error` 는 false 이므로 `(e as AppError).code` 로 접근한다.

---

## 6. API Layer Convention

샘플 API 코드(`appApi.ts`)는 `tauri-commands.md` 를 참조한다.

- wrapper 는 `unknown` 으로 받고, 응답 형태 검증·정규화는 parser 로 분리한다 (Zod 도입 시 `docs/optional/server-state.md §3`).
- Feature API(`[feature]Api.ts`: command 이름·payload 계약) 와 parser(`[feature]Parsers.ts`: 응답 파싱·정규화) 는 `src/features/[feature]/api/` 에 두고, shared wrapper 는 `src/shared/lib/tauri/invoke.ts` 를 쓴다.

---

## 7. Command Design

- command 이름은 `[feature]_[action]` 형식을 사용한다.
- 입력 필드가 여러 개면 struct request model 을 우선한다. output 은 named response model 로 관리한다.
- 직렬화는 공통 `response::ok()` helper 로 통일한다. command 별 error code 는 feature `config.rs` 에 모으고 §8 분류표의 카테고리를 쓴다 (카테고리는 도메인이 아니라 에러의 처리 방식으로 고른다).
- Ok-Only: 비즈니스 에러도 `Ok(IpcResult::err(...))` 로 반환한다. service 는 `Result<_, String>`(Err=message) 을 반환하고, command 가 code·retryable 을 부여한다.
- 샘플 command(`app_ping`)의 코드는 `tauri-commands.md` 를 참조한다.

```rust
// lib.rs — command 등록
tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
        features::app::commands::app_ping,
        // 새 도메인 command 추가 시 여기에 등록
    ])
```

---

## 8. Error Handling

### Ok-Only 패턴

비즈니스 에러를 포함한 모든 결과를 `Ok(IpcResult<T>)` 로 반환한다. command 는 `Err` 를 반환하지 않는다 — `Err()` 를 반환하면 Tauri 가 JS 의 `Promise.reject` 로 전달하여 비즈니스 실패와 시스템 예외를 구분하기 어렵다. lock poison 등 인프라 실패도 `Ok(IpcResult::err(...))` 로 반환한다.

| 오류 유형           | Rust 반환                                  | TypeScript 처리                                                                                   |
| :------------------ | :----------------------------------------- | :------------------------------------------------------------------------------------------------ |
| **인프라 실패**     | `Ok(IpcResult::err(...))` (lock poison 등) | `AppError` 로 정규화                                                                              |
| **비즈니스 에러**   | `Ok(IpcResult::err(...))`                  | `AppError` 로 정규화                                                                              |
| **성공**            | `Ok(IpcResult::ok(...))`                   | `data` 반환                                                                                       |
| **예상 못한 panic** | (반환 없음)                                | invoke reject 또는 무응답(hang) 가능 → reject 시 wrapper 가 `ERROR_TAURI_INVOKE_FAILED` 로 정규화 |

### AppError prefix 분류

모든 도메인은 prefix 를 재사용하고, 새 에러는 동일 prefix 안에서 suffix 만 확장한다.

| 분류         | code prefix                           | `retryable`                                    | frontend 대응             |
| :----------- | :------------------------------------ | :--------------------------------------------- | :------------------------ |
| `auth`       | `ERROR_AUTH_*` / `ERROR_AUTH_EXPIRED` | `false`                                        | 로그인 인라인 / 세션 정리 |
| `network`    | `ERROR_NETWORK_*`                     | Timeout/Refused/5xx → `true`, Decode → `false` | 재시도 버튼 + 토스트      |
| `validation` | `ERROR_VALIDATION_*`                  | `false`                                        | 필드 인라인 에러          |
| `config`     | `ERROR_CONFIG_*`                      | `false`                                        | 토스트 + 원인 안내        |
| `io`         | `ERROR_IO_*`                          | `true`                                         | 재시도 토스트 + 원인 안내 |
| `unknown`    | `ERROR_UNKNOWN` / `ERROR_TAURI_*`     | `true`                                         | 재시도 + 로그 수집        |

규약: ① 모든 code 는 `ERROR_<카테고리>_<상세>` 형식이며, 카테고리는 도메인이 아니라 에러의 처리 방식으로 고른다 (한 도메인이 여러 카테고리를 쓸 수 있다). `io` 는 로컬 파일·DB·창 I/O 실패에 쓴다. ② `retryable` 은 UI 재시도 버튼 표시 기준이자 (TanStack Query 도입 시) `retry` 판단 기준. ③ frontend 는 `ERROR_` 다음 카테고리 세그먼트(`<카테고리>`) 로 분기할 수 있어야 한다.

---

## 9. Persistence

비민감 설정 영속화는 `tauri-plugin-store` 를 사용한다 (도입 시 helper 를 `shared/persistence/store.rs` 에 둔다 — 뼈대에는 아직 없는 경로). store 파일명·key 상수는 `shared/config.rs` 에서 관리하고, 접근은 helper 함수를 통해 수행한다 (command/service 에서 `StoreExt::store()` 직접 호출 금지).

> 뼈대 단계에서는 `tauri-plugin-store` 를 등록하지 않는다. 도입 시 `Cargo.toml` 의존성 + `lib.rs` 의 `.plugin(...)` + `capabilities/default.json` 의 `store:default` 권한을 함께 추가한다.

데이터 유형별 저장소 선택은 `architecture.md §8` 을 따른다. 민감 데이터(JWT 토큰 등)는 `tauri-plugin-store` / SQLite 에 저장하지 않는다.

---

## 10. Blocking I/O

파일·저장소 접근처럼 블로킹 성격의 작업은 async runtime 을 직접 막지 않게 처리한다.

```rust
// ✅ spawn_blocking 으로 격리 (tokio 직접 의존 없이 Tauri runtime 사용)
let result = tauri::async_runtime::spawn_blocking(move || {
    // blocking 작업
    Ok::<_, Box<dyn std::error::Error>>(value)
}).await;

// ❌ async fn 에서 직접 블로킹 I/O 호출 → 런타임 스레드 차단
```

timeout·retry·config 값은 `config.rs` 에 두고, `Cargo.toml` 의 tokio feature 는 필요한 범위만 명시한다.

---

## 11. Setup / Lifecycle

초기화 로직은 `.setup()` 안에 배치한다. `app.manage()` 는 background task `spawn()` 이전에 호출하고, 초기화 실패는 `?` 로 전파한다.

### BootStage

`shared/runtime/lifecycle.rs` 의 `BootStage` enum 이 단계를 식별한다. `run_boot` 는 순서대로 실행하고 치명적 단계 실패 시 앱을 중단한다.

뼈대 단계의 단계 (다른 stage 는 기능 도입 시 추가):

| `BootStage`     | 내용                          | 실패 정책 |
| :-------------- | :---------------------------- | :-------- |
| `InitPlugins`   | 런타임 plugin 초기화 (log 등) | **중단**  |
| `PrepareState`  | `AppState` 구성               | **중단**  |
| `RegisterState` | `app.manage(state)`           | **중단**  |

도입 시 추가되는 stage 예시:

| `BootStage`               | 내용                        | 실패 정책    | 도입 시점                    |
| :------------------------ | :-------------------------- | :----------- | :--------------------------- |
| `LoadPersistedConfig`     | 영속 설정 로드              | 경고 후 계속 | `tauri-plugin-store` 도입 시 |
| `StartBackgroundServices` | background task spawn       | 경고 후 계속 | 백그라운드 작업 도입 시      |
| `ConnectDatabase`         | DB pool 초기화              | **중단**     | `docs/optional/sqlite.md`    |
| `RestoreAuthSession`      | secure store → session 복원 | 경고 후 계속 | `docs/optional/auth.md`      |

```rust
// lib.rs
.setup(|app| {
    lifecycle::run_boot(app).map_err(|e| format!("[{:?}] {}", e.stage, e.message))?;
    Ok(())
})
```

### Teardown

`AppState.teardown: Arc<TeardownRegistry>` 에 도메인별 cleanup 을 등록한다. `fire()` 는 멱등이므로 `CloseRequested` / `RunEvent::Exit` 양쪽에서 호출해도 안전하다. `RunEvent::Exit` 까지 잡으려면 `Builder::build(ctx)?.run(closure)` 분리 패턴이 필요하다.

장기 실행 async task 는 `Arc<AtomicBool>` cancel 신호를 받고, teardown 훅에서 `store(true)` 로 종료 신호를 전달한다.

---

## 12. Capability 권한

Tauri v2 는 capability 기반 권한 관리를 사용한다. 필요한 권한만 `capabilities/default.json` 에 선언한다 (최소 권한 원칙). plugin 추가 시 해당 plugin 의 permission 을 함께 등록하고, 불필요해진 권한은 즉시 제거한다.

뼈대 단계의 기본 권한:

| plugin / 영역 | permission     | 용도            |
| :------------ | :------------- | :-------------- |
| `core`        | `core:default` | Tauri 기본 기능 |
| `log`         | `log:default`  | 로그 출력       |

도입 시 추가되는 권한은 해당 plugin 가이드에서 관리한다: `store:default`(§9 Persistence), `opener`·`window-state`(`docs/optional/desktop-ux.md`), `updater`(`docs/optional/updater.md`), `dialog`/`fs`(`docs/optional/dialog-fs.md`), `notification`·`deep-link`(`docs/optional/notification-deeplink.md`).

> `core:event:default` 는 `core:default` 에 이미 포함되어 있다. event 권한을 좁힐 때만 개별 지정한다.

### CSP

`tauri.conf.json` 의 `app.security.csp` 는 뼈대 단계부터 원격 리소스를 쓰지 않는 최소 CSP(`default-src 'self'` 기반, IPC·asset 프로토콜만 허용)로 활성화되어 있다. Tauri 가 번들 자산의 스크립트·스타일에 hash/nonce 를 자동 추가하므로 앱 고유 항목만 관리한다. 외부 origin(API 서버·폰트·CDN 등)이 필요해지면 해당 지시자(`connect-src`, `font-src` 등)에만 필요한 origin 을 화이트리스트하고, `null` 로 되돌리지 않는다.

---

## 13. Logging

로깅은 `tauri-plugin-log` + Rust `log` crate 를 사용한다 (`println!`/`eprintln!` 금지). 레벨: `error`(복구 불가) / `warn`(복구 가능, emit 실패 등) / `info`(주요 흐름) / `debug`(개발용). 구조화 접두사를 권장한다 (`[auth]`, `[monitor]`). Frontend 는 `[ui:domain]` 접두사를 사용한다.

민감 정보 로깅 금지: JWT 토큰, 인증 헤더 값, 비밀번호, secure store entry 값. 위 값을 포함하는 구조체 전체를 `{:?}` / `Debug` 로 덤프하지 않는다 — 필요한 필드만 출력한다. Frontend 도 로그인 응답 DTO 원문·form state 전체 덤프를 금지하고 식별자만 출력한다.

---

## 14. Mobile 빌드 (iOS / Android)

모바일(iOS/Android) 빌드 설정·명령·제약은 [docs/optional/mobile.md](./optional/mobile.md) 를 따른다. 단 `[lib] crate-type = ["staticlib", "cdylib", "rlib"]` 와 `#[cfg_attr(mobile, tauri::mobile_entry_point)]` 는 뼈대 기본으로 유지한다.

---

## 15. Anti-patterns

구조·계층 관련 금지 패턴(component 의 직접 `invoke()`/`fetch`, command 의 과도한 로직, `serde_json::Value` 남용 등)은 `architecture.md §16` 을 따른다. 본 문서 주제의 금지 패턴:

| 패턴                                            | 이유                                      |
| ----------------------------------------------- | ----------------------------------------- |
| API layer 없이 command 이름을 UI 에서 직접 호출 | 계약 분리 불가                            |
| Rust command 에서 `Err(String)` 반환            | 비즈니스/시스템 에러 구분 불가            |
| `await` 를 걸친 채 `Mutex`/`RwLock` guard 유지  | 데드락 위험 (clippy `await_holding_lock`) |
| async fn 에서 직접 블로킹 I/O 호출              | tokio async runtime 차단                  |
| capabilities 에 불필요한 권한 등록              | 최소 권한 원칙 위반                       |
