# Tauri Commands

이 문서는 Tauri command 계약의 **공통 규칙**과 뼈대에 포함된 **샘플 command** 를 정리한다.

- **공통 규칙** 은 동일 아키텍처를 사용하는 모든 프로젝트에 공용으로 적용한다.
- 새 command 를 추가하거나 입출력 타입이 바뀌면 본 문서 또는 `docs/optional/command-examples.md` 를 먼저 갱신한다.

---

## 공통 규칙

> 아키텍처 표준 — 모든 프로젝트 공용

- 모든 command 는 `Result<IpcResult<T>, String>` 형태를 반환한다.
- 응답·에러 형식(`IpcResult<T>` / `AppError`)과 공용 타입 정의(`src/shared/types/ipc.ts`, `src-tauri/src/shared/types/ipc.rs`)는 `architecture.md §6` 을 SSOT 로 한다.
- command 이름은 `[feature]_[action]` 형식 (예: `auth_login`, `notes_create`, `app_ping`).
- command 별 error code 는 feature `config.rs` 에 `ERROR_<카테고리>_<상세>` 형식 상수로 관리한다.
- 비즈니스 에러를 포함한 모든 결과는 `Ok(IpcResult<T>)` 로 감싼다 (Ok-Only, `Err` 미반환 — `tauri-guide.md §8`).

---

## 뼈대 샘플 Command

| Command    | Input                                      | Output                                                | Error codes                    | Retryable |
| :--------- | :----------------------------------------- | :---------------------------------------------------- | :----------------------------- | :-------- |
| `app_ping` | `request: PingRequest = { note?: string }` | `PingInfo = { message: string; echoedNote?: string }` | `ERROR_VALIDATION_PING_FAILED` | false     |

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
// command 는 얇은 진입점 — 로직은 service, 에러 코드는 config 에 둔다 (Ok-Only).
// service 는 Result<_, String>(Err=message), command 가 code·retryable 을 부여한다.
// config.rs: pub const ERROR_VALIDATION_PING_FAILED: &str = "ERROR_VALIDATION_PING_FAILED";
#[tauri::command]
pub async fn app_ping(request: PingRequest) -> Result<IpcResult<PingInfo>, String> {
    match service::ping(&request) {
        Ok(info) => Ok(response::ok(info)),
        Err(message) => Ok(IpcResult::err(config::ERROR_VALIDATION_PING_FAILED, message, false)),
    }
}
```

---

## 참조

| 주제                                                                            | 문서                                |
| :------------------------------------------------------------------------------ | :---------------------------------- |
| command 설계 / Ok-Only                                                          | `tauri-guide.md §7-8`               |
| 에러 유형별 응답·error code prefix 분류 (IPC invoke 실패·비즈니스·인프라·panic) | `tauri-guide.md §5·§8`              |
| 도메인 command 예시                                                             | `docs/optional/command-examples.md` |
| HTTP 호출이 필요한 command                                                      | `docs/optional/backend-http.md`     |
| 인증 command                                                                    | `docs/optional/auth.md`             |
| 로컬 DB command                                                                 | `docs/optional/sqlite.md`           |
| 진행률·스트리밍 IPC                                                             | `docs/optional/events-channels.md`  |
