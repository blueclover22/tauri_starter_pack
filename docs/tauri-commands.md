# Tauri Commands

이 문서는 Tauri command 계약의 **공통 규칙**과 뼈대에 포함된 **샘플 command** 를 정리한다.

- **공통 규칙** 은 동일 아키텍처를 사용하는 모든 프로젝트에 공용으로 적용한다.
- **도메인별 command 예시** (auth / notes / fs / system) 는 `docs/optional/command-examples.md` 에서 별도 관리한다.
- 새 command 를 추가하거나 입출력 타입이 바뀌면 본 문서 또는 `docs/optional/command-examples.md` 를 먼저 갱신한다.

---

## 공통 규칙

> 아키텍처 표준 — 모든 프로젝트 공용

- 모든 command 는 `Result<IpcResult<T>, String>` 형태를 반환한다.
- 응답 형식: `IpcResult<T> = { success: boolean; data?: T; error?: AppError }`
- 에러 형식: `AppError = { code: string; message: string; retryable: boolean }`
- 공용 타입 정의는 `src/shared/types/ipc.ts` 와 `src-tauri/src/shared/types/ipc.rs` 를 SSOT 로 한다.
- command 이름은 `[feature]_[action]` 형식 (예: `auth_login`, `notes_create`, `app_ping`).
- command 별 error code 는 feature `config.rs` 에 `ERROR_<카테고리>_<상세>` 형식 상수로 관리한다.
- 비즈니스 에러를 포함한 모든 결과는 `Ok(IpcResult<T>)` 로 감싼다 (Ok-Only). 시스템 panic 만 `Err(String)` (`tauri-guide.md §8`).

---

## 뼈대 샘플 Command

| Command    | Input                  | Output                                                | Error codes             | Retryable |
| :--------- | :--------------------- | :---------------------------------------------------- | :---------------------- | :-------- |
| `app_ping` | `request: PingRequest` | `PingInfo = { message: string; echoedNote?: string }` | `ERROR_APP_PING_FAILED` | true      |

샘플 command 는 IPC 파이프(Renderer → invoke wrapper → Rust command → response::ok → IpcResult → Renderer parser)가 끝에서 끝까지 동작함을 검증하는 용도다. 실제 기능을 추가하면 제거해도 무방하다.

```ts
// src/features/app/api/appApi.ts
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

```rust
// src-tauri/src/features/app/commands.rs
#[tauri::command]
pub async fn app_ping(
    request: PingRequest,
) -> Result<IpcResult<PingInfo>, String> {
    let info = PingInfo {
        message: "pong".to_string(),
        echoed_note: request.note,
    };
    Ok(response::ok(info))
}
```

---

## 공통 에러 케이스

> 본 표는 도메인 command 도입 시점에 필요한 케이스만 채택한다. 도메인 예시는 `docs/optional/command-examples.md`.

| 유형            | 조건                           | 응답 (요약)                                                         |
| --------------- | ------------------------------ | ------------------------------------------------------------------- |
| IPC invoke 실패 | Tauri IPC 호출 자체 실패       | invoke wrapper `catch` 경로 — `ERROR_TAURI_INVOKE_FAILED` 로 정규화 |
| 비즈니스 에러   | service 내부 도메인 로직 실패  | `IpcResult::err(code, message, retryable)` (Ok-Only)                |
| 시스템 Panic    | unwrap / 데드락 등 시스템 예외 | `Err(String)` — invoke wrapper 의 `catch` 경로                      |

---

## 참조

| 주제                       | 문서                                |
| :------------------------- | :---------------------------------- |
| command 설계 / Ok-Only     | `tauri-guide.md §7-8`               |
| error code prefix 분류     | `tauri-guide.md §8`                 |
| 도메인 command 예시        | `docs/optional/command-examples.md` |
| HTTP 호출이 필요한 command | `docs/optional/backend-http.md`     |
| 인증 command               | `docs/optional/auth.md`             |
| 로컬 DB command            | `docs/optional/sqlite.md`           |
| 진행률·스트리밍 IPC        | `docs/optional/events-channels.md`  |
