# Tauri Guide

이 문서는 Tauri v2 기반 데스크톱·모바일 애플리케이션에서 Tauri 고유 메커니즘의 구현 방법과 운영 규칙을 정리한다. 구조 전반은 [architecture.md](./architecture.md), 코드 작성 규칙은 [coding-rules.md](./coding-rules.md) 를 기준으로 한다.

본 문서는 **뼈대 기준**으로 작성되었다. 추가 기능별 가이드는 `docs/optional/` 하위 문서를 참조한다.

---

## 목차

| #   | 섹션                   | 내용                 |
| :-- | :--------------------- | :------------------- |
| 1   | Core Rules             | 핵심 원칙            |
| 2   | Folder Structure 요약  | 폴더 구조 요약       |
| 3   | Layer Responsibilities | 레이어별 역할        |
| 4   | Type Sync (Rust ↔ TS)  | 타입 계약 동기화     |
| 5   | Shared Invoke Wrapper  | 공통 IPC wrapper     |
| 6   | API Layer Convention   | feature API 규칙     |
| 7   | Command Design         | command 설계 규칙    |
| 8   | Error Handling         | 에러 처리 (Ok-Only)  |
| 9   | Persistence            | 설정 영속화          |
| 10  | Blocking I/O           | 블로킹 I/O           |
| 11  | Setup / Lifecycle      | 초기화·lifecycle     |
| 12  | Capability 권한        | 권한 관리            |
| 13  | Logging                | 로깅                 |
| 14  | Mobile 빌드            | 모바일 (iOS/Android) |
| 15  | Anti-patterns          | 금지 패턴            |

### 추가 도입 가이드

| 주제                           | 문서                                     |
| :----------------------------- | :--------------------------------------- |
| TanStack Query / Zustand / Zod | `docs/optional/server-state.md`          |
| Backend HTTP (reqwest)         | `docs/optional/backend-http.md`          |
| Auth & Secure Store            | `docs/optional/auth.md`                  |
| SQLite                         | `docs/optional/sqlite.md`                |
| Event / Channel                | `docs/optional/events-channels.md`       |
| Command Examples               | `docs/optional/command-examples.md`      |
| Auto Updater                   | `docs/optional/updater.md`               |
| Dialog & File System           | `docs/optional/dialog-fs.md`             |
| Notification & Deep Link       | `docs/optional/notification-deeplink.md` |
| Desktop UX (트레이·창 상태 등) | `docs/optional/desktop-ux.md`            |

---

## 1. Core Rules

- component 에서 `invoke` 를 직접 호출하지 않는다. 모든 Tauri 호출은 feature API layer 를 통해서만 진행한다.
- Rust command handler 는 얇게 유지하고 실제 비즈니스 로직은 `service.rs` 에 둔다.
- 입력/출력 계약은 Rust `model` 과 TS 타입을 함께 관리한다.

---

## 2. Folder Structure 요약

`architecture.md §7` 을 기준으로 한다. 핵심 파일 역할:

| 파일                                        | 역할                                        |
| ------------------------------------------- | ------------------------------------------- |
| `src-tauri/src/shared/types/ipc.rs`         | `IpcResult<T>`, `AppError` 공용 타입        |
| `src-tauri/src/shared/lib/response.rs`      | `response::ok(data)` helper                 |
| `src-tauri/src/shared/store/state.rs`       | `AppState` 정의                             |
| `src-tauri/src/shared/runtime/lifecycle.rs` | `BootStage`, `run_boot`, `TeardownRegistry` |
| `src-tauri/src/lib.rs`                      | command 등록 (`generate_handler!`)          |
| `src/shared/lib/tauri/invoke.ts`            | 공통 invoke wrapper                         |
| `src/shared/types/ipc.ts`                   | `IpcResponse<T>`, `AppError`                |

---

## 3. Layer Responsibilities

| 계층             | 역할                                                                    |
| :--------------- | :---------------------------------------------------------------------- |
| **Component**    | UI 렌더링·event 연결. `invoke`/`fetch`/parsing 을 직접 하지 않는다.     |
| **Hook**         | 화면 조합·로컬 state.                                                   |
| **API**          | Tauri command 호출 경계. command 이름·payload 결정. invoke helper 사용. |
| **Parser**       | response parsing, error normalization, 매핑 로직.                       |
| **Rust Command** | 입력 수신 → service 호출 → `IpcResult<T>` 포장. 분기·로직 없음.         |
| **Rust Service** | 실제 비즈니스 로직.                                                     |
| **Rust Model**   | request/response 계약 기준. frontend 타입과 1:1.                        |

---

## 4. Type Sync (Rust ↔ TS)

Rust 와 TypeScript 의 계약 타입은 항상 일치하게 유지한다. 새 command 를 추가하면 request/response 타입을 먼저 정의한다. Rust struct 에는 `#[serde(rename_all = "camelCase")]` 를 적용한다.

```rust
// model.rs
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PingRequest { pub note: Option<String> }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PingInfo { pub message: String, pub echoed_note: Option<String> }
```

```ts
// types
export type PingRequest = { note?: string };
export type PingInfo = { message: string; echoedNote?: string };
```

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

  return result.data as TResponse;
}
```

처리 흐름: ① `invoke()` 자체 실패 → `AppError` 로 감싸 throw. ② `result.success` false → `result.error` throw. ③ 성공 → `result.data` 반환.

> **주의**: throw 되는 값은 `Error` 인스턴스가 아닌 plain object(`AppError`) 이다. `e instanceof Error` 는 false 이므로 `(e as AppError).code` 로 접근한다.

---

## 6. API Layer Convention

```ts
// src/features/app/api/appApi.ts (뼈대 샘플)
import { invokeTauri } from "@/shared/lib/tauri/invoke";
import { parsePingInfo } from "./appParsers";
import type { PingInfo } from "./appParsers";

export type PingRequest = { note?: string };

export const appApi = {
  ping: async (note?: string): Promise<PingInfo> => {
    const raw = await invokeTauri<unknown>("app_ping", {
      request: { note } satisfies PingRequest,
    });
    return parsePingInfo(raw);
  },
};
```

- wrapper 는 `unknown` 으로 받고, 응답 형태 검증·정규화는 parser 로 분리한다 (Zod 도입 시 `docs/optional/server-state.md §3`).

- Feature API: `src/features/[feature]/api/[feature]Api.ts` (command 이름·payload 계약)
- Feature parser: `src/features/[feature]/api/[feature]Parsers.ts` (응답 파싱·정규화)
- Shared wrapper: `src/shared/lib/tauri/invoke.ts`

서버 상태 캐싱 (TanStack Query) 은 도입 시 `docs/optional/server-state.md` 참조.

---

## 7. Command Design

- command 이름은 `[feature]_[action]` 형식을 사용한다.
- 입력 필드가 여러 개면 struct request model 을 우선한다. output 은 named response model 로 관리한다.
- 직렬화는 공통 `response::ok()` helper 로 통일한다. command 별 error code 는 feature `config.rs` 에 모은다.

```rust
// config.rs
pub const ERROR_APP_PING_FAILED: &str = "ERROR_APP_PING_FAILED";

// commands.rs
#[tauri::command]
pub async fn app_ping(
    request: PingRequest,
) -> Result<IpcResult<PingInfo>, String> {
    let response = match service::ping(&request).await {
        Ok(info) => response::ok(info),
        Err(error) => IpcResult::err(ERROR_APP_PING_FAILED, error, true),
    };
    Ok(response)
}
```

```rust
// lib.rs — command 등록
tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
        features::app::commands::app_ping,
        // 새 도메인 command 추가 시 여기에 등록
    ])
```

도메인별 command 예시는 `docs/optional/command-examples.md` 참조.

---

## 8. Error Handling

### Ok-Only 패턴

비즈니스 에러를 포함한 모든 결과를 `Ok(IpcResult<T>)` 로 반환한다. `Err()` 를 반환하면 Tauri 가 JS 의 `Promise.reject` 로 전달하여 비즈니스 실패와 시스템 예외를 구분하기 어렵다.

| 오류 유형         | Rust 반환                 | TypeScript 처리           |
| :---------------- | :------------------------ | :------------------------ |
| **시스템 Panic**  | `Err(String)`             | invoke wrapper 의 `catch` |
| **비즈니스 에러** | `Ok(IpcResult::err(...))` | `AppError` 로 정규화      |
| **성공**          | `Ok(IpcResult::ok(...))`  | `data` 반환               |

### AppError prefix 분류

모든 도메인은 prefix 를 재사용하고, 새 에러는 동일 prefix 안에서 suffix 만 확장한다.

| 분류         | code prefix                           | `retryable`                                    | frontend 대응             |
| :----------- | :------------------------------------ | :--------------------------------------------- | :------------------------ |
| `auth`       | `ERROR_AUTH_*` / `ERROR_AUTH_EXPIRED` | `false`                                        | 로그인 인라인 / 세션 정리 |
| `network`    | `ERROR_NETWORK_*`                     | Timeout/Refused/5xx → `true`, Decode → `false` | 재시도 버튼 + 토스트      |
| `validation` | `ERROR_VALIDATION_*`                  | `false`                                        | 필드 인라인 에러          |
| `config`     | `ERROR_CONFIG_*`                      | `false`                                        | 토스트 + 원인 안내        |
| `unknown`    | `ERROR_UNKNOWN` / `ERROR_TAURI_*`     | `true`                                         | 재시도 + 로그 수집        |

규약: ① 모든 code 는 `ERROR_<카테고리>_<상세>` 형식이며, 하나의 도메인은 하나의 카테고리만 쓴다. ② `retryable` 은 UI 재시도 버튼 표시 기준이자 (TanStack Query 도입 시) `retry` 판단 기준. ③ frontend 는 `ERROR_` 다음 카테고리 세그먼트(`<카테고리>`) 로 분기할 수 있어야 한다.

---

## 9. Persistence

비민감 설정 영속화는 `tauri-plugin-store` 를 사용한다 (도입 시 helper 를 `shared/persistence/store.rs` 에 둔다 — 뼈대에는 아직 없는 경로). store 파일명·key 상수는 `shared/config.rs` 에서 관리하고, 접근은 helper 함수를 통해 수행한다 (command/service 에서 `StoreExt::store()` 직접 호출 금지).

> 뼈대 단계에서는 `tauri-plugin-store` 를 등록하지 않는다. 도입 시 `Cargo.toml` 의존성 + `lib.rs` 의 `.plugin(...)` + `capabilities/default.json` 의 `store:default` 권한을 함께 추가한다.

| 데이터 유형        | 저장소                                | 가이드                    |
| :----------------- | :------------------------------------ | :------------------------ |
| 비민감 설정        | `tauri-plugin-store`                  | 본 절                     |
| 구조적 로컬 데이터 | SQLite                                | `docs/optional/sqlite.md` |
| 민감 데이터 (토큰) | Rust `AppState` 메모리 / secure store | `docs/optional/auth.md`   |

민감 데이터(JWT 토큰 등)는 `tauri-plugin-store` / SQLite 에 저장하지 않는다.

---

## 10. Blocking I/O

파일·저장소 접근처럼 블로킹 성격의 작업은 async runtime 을 직접 막지 않게 처리한다.

```rust
// ✅ spawn_blocking 으로 격리
let result = tokio::task::spawn_blocking(move || {
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
    lifecycle::run_boot(app).map_err(|e| format!("[{:?}] {}", e.stage, e.message).into())
})
```

### Teardown

`AppState.teardown: Arc<TeardownRegistry>` 에 도메인별 cleanup 을 등록한다. `fire()` 는 멱등이므로 `CloseRequested` / `RunEvent::Exit` 양쪽에서 호출해도 안전하다. `RunEvent::Exit` 까지 잡으려면 `Builder::build(ctx)?.run(closure)` 분리 패턴이 필요하다.

장기 실행 async task 는 `Arc<AtomicBool>` cancel 신호를 받고, teardown 훅에서 `store(true)` 로 종료 신호를 전달한다.

---

## 12. Capability 권한

Tauri v2 는 capability 기반 권한 관리를 사용한다. 필요한 권한만 `capabilities/default.json` 에 선언한다 (최소 권한 원칙). plugin 추가 시 해당 plugin 의 permission 을 함께 등록하고, 불필요해진 권한은 즉시 제거한다.

뼈대 단계의 기본 권한:

| plugin / 영역   | permission     | 용도            |
| :-------------- | :------------- | :-------------- |
| `core`          | `core:default` | Tauri 기본 기능 |
| `log` (도입 시) | `log:default`  | 로그 출력       |

도입 시 추가되는 권한 예시 (각 가이드는 `docs/optional/` 참조):

| plugin         | permission                                 | 용도                 | 가이드                                   |
| :------------- | :----------------------------------------- | :------------------- | :--------------------------------------- |
| `store`        | `store:default`                            | 설정 영속화          | §9 Persistence                           |
| `opener`       | `opener:default`                           | 외부 링크 열기       | `docs/optional/desktop-ux.md`            |
| `window-state` | `window-state:default`                     | 창 상태 복원         | `docs/optional/desktop-ux.md`            |
| `updater`      | `updater:default`                          | 자동 업데이트        | `docs/optional/updater.md`               |
| `dialog`/`fs`  | `dialog:default` / `fs:*`                  | 파일 다이얼로그·접근 | `docs/optional/dialog-fs.md`             |
| `notification` | `notification:default`                     | OS 알림              | `docs/optional/notification-deeplink.md` |
| `deep-link`    | `deep-link:default` + `core:event:default` | 딥링크               | `docs/optional/notification-deeplink.md` |

### CSP

`tauri.conf.json` 의 `app.security.csp` 는 뼈대 단계에서 `null`(비활성) 이다. 배포 전 `default-src 'self'` 기반의 명시적 CSP 로 강화하고, 외부 origin·인라인 스크립트 허용은 필요한 것만 화이트리스트한다. 원격 리소스를 쓰지 않는 앱이라면 `null` 유지보다 최소 CSP 명시가 안전하다.

---

## 13. Logging

로깅은 `tauri-plugin-log` + Rust `log` crate 를 사용한다 (`println!`/`eprintln!` 금지). 레벨: `error`(복구 불가) / `warn`(복구 가능, emit 실패 등) / `info`(주요 흐름) / `debug`(개발용). 구조화 접두사를 권장한다 (`[auth]`, `[monitor]`). Frontend 는 `[ui:domain]` 접두사를 사용한다.

민감 정보 로깅 금지: JWT 토큰, 인증 헤더 값, 비밀번호, secure store entry 값. 위 값을 포함하는 구조체 전체를 `{:?}` / `Debug` 로 덤프하지 않는다 — 필요한 필드만 출력한다. Frontend 도 로그인 응답 DTO 원문·form state 전체 덤프를 금지하고 식별자만 출력한다.

---

## 14. Mobile 빌드 (iOS / Android)

Tauri v2 는 동일 코드베이스에서 데스크톱·모바일을 함께 빌드한다.

### 14.1 `Cargo.toml` 필수 설정

```toml
[lib]
name = "app_lib"
crate-type = ["staticlib", "cdylib", "rlib"]
```

`staticlib` / `cdylib` 가 모바일 (iOS / Android) 빌드의 필수 출력이다. `rlib` 는 데스크톱·내부 의존성용.

### 14.2 `src/lib.rs` 의 mobile entry point

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 빌더 체인
}
```

`src/main.rs` 는 데스크톱 entry 로 `app_lib::run()` 만 호출한다. 모바일 빌드에서는 `lib.rs` 의 `run()` 이 entry 가 된다.

### 14.3 초기화 / 빌드 명령

| 작업                | 명령                       |
| :------------------ | :------------------------- |
| Android 초기화      | `pnpm tauri android init`  |
| iOS 초기화          | `pnpm tauri ios init`      |
| Android 개발 실행   | `pnpm tauri android dev`   |
| iOS 개발 실행       | `pnpm tauri ios dev`       |
| Android 릴리스 빌드 | `pnpm tauri android build` |
| iOS 릴리스 빌드     | `pnpm tauri ios build`     |

초기화로 생성되는 `src-tauri/gen/android/` , `src-tauri/gen/apple/` 디렉토리는 `.gitignore` 에 포함되어 있다 (재생성 가능).

### 14.4 모바일 사전 요구사항

| 플랫폼  | 요구                                                                           |
| :------ | :----------------------------------------------------------------------------- |
| Android | Android Studio + SDK + NDK + JAVA_HOME / ANDROID_HOME 환경 변수                |
| iOS     | Xcode + Command Line Tools + CocoaPods + Apple Developer 계정 (실기기 배포 시) |

상세 환경 setup 은 [Tauri v2 모바일 가이드](https://v2.tauri.app/start/prerequisites/) 참조.

### 14.5 모바일 한정 plugin 제약

일부 plugin (예: `tauri-plugin-window-state`) 은 데스크톱 전용이다. plugin 의 `cfg` 분기로 모바일에서는 제외한다.

```rust
#[cfg(desktop)]
builder = builder.plugin(tauri_plugin_window_state::Builder::default().build());
```

---

## 15. Anti-patterns

| 패턴                                            | 이유                                        |
| ----------------------------------------------- | ------------------------------------------- |
| Component 에서 직접 `invoke()` 호출             | 레이어 규칙 위반                            |
| API layer 없이 command 이름을 UI 에서 직접 호출 | 계약 분리 불가                              |
| Frontend 에서 `fetch` 로 백엔드 직접 호출       | 토큰 노출, 보안 모델 붕괴                   |
| Rust command 에 비즈니스 로직 과도 작성         | command 는 얇은 진입점, 로직은 `service.rs` |
| `serde_json::Value` 를 계약 타입처럼 남용       | 타입 안전성 손실                            |
| Rust command 에서 `Err(String)` 반환            | 비즈니스/시스템 에러 구분 불가              |
| `await` 를 걸친 채 `Mutex`/`RwLock` guard 유지  | 데드락 위험 (clippy `await_holding_lock`)   |
| async fn 에서 직접 블로킹 I/O 호출              | tokio async runtime 차단                    |
| capabilities 에 불필요한 권한 등록              | 최소 권한 원칙 위반                         |
| `[lib]` crate-type 에 `cdylib`/`staticlib` 누락 | 모바일 빌드 불가                            |
