# Optional — Event Emit & Channel IPC

> 도입 시점: Backend → Frontend 로 비동기 상태 변화를 통보하거나 장기 실행 작업의 진행률을 스트리밍해야 하는 시점.
> 뼈대 단계에서는 사용하지 않는다.

---

## 1. 아키텍처 위치 · End-to-end 흐름

일반 command 는 "Frontend 가 물으면 Backend 가 답하는" 요청/응답이다. 이 문서의 두 방식은 그 반대 방향, 즉 **Backend 가 먼저 말을 거는** 통로를 다룬다. 상태 변화 통지는 `emit`/`listen`, 진행률 스트리밍은 `Channel<T>` 를 쓴다.

```text
[단발 통지 — emit / listen]
Backend service (상태 변화 감지)
  → app.emit_to("main", EVENT_*, payload)
  ── IPC ──▶ Frontend listen(EVENT_*) → safeParse → 캐시 무효화 / 상태 갱신
  등록: 전역 이벤트는 app/providers, feature 한정은 feature model/ 의 useEffect
  해제: useEffect return 에서 unlisten()

[스트리밍 — Channel<T>]
Frontend new Channel<T>()
  → invoke("job_run", { onEvent: channel })
  → command 이 on_event.send(...) 로 진행률을 다회 전송
  → channel.onmessage 로 수신 → 진행률 state (hook 로컬)
```

- `emit`/`listen` 은 앱 전역 브로드캐스트라 이벤트 이름 상수와 payload 계약이 SSOT 로 관리돼야 한다(§6).
- `Channel<T>` 은 특정 invoke 호출에 묶인 1:1 스트림이라 이벤트 이름이 없고, 별도 event permission 도 필요 없다(§7).

---

## 2. 뼈대 통합 접점

| 접점                            | 뼈대 현재 상태        | 도입 시 변경                                                              |
| :------------------------------ | :-------------------- | :------------------------------------------------------------------------ |
| `shared/config.rs`              | `ERROR_*` / `EVENT_*` | `EVENT_*` 이벤트 이름 상수 추가                                           |
| `capabilities/default.json`     | `core:default`        | `emit`/`listen` 시 `core:event:default` 추가 (Channel 만 쓰면 불요)       |
| payload 타입                    | —                     | feature `model.rs` struct(`Serialize`+`Clone`) ↔ frontend type/Zod schema |
| listener 등록 위치              | —                     | 전역은 `app/providers`, 도메인 한정은 feature `model/` (useEffect)        |
| `AppState`/`BootStage`/`lib.rs` | —                     | **변경 없음** (Emitter 는 `AppHandle` 에서 바로 사용)                     |
| 의존 문서                       | —                     | `server-state.md §3.4`(listener payload `safeParse`)                      |

---

## 3. 두 방식의 선택 기준

| 상황                                       | 방식                 |
| ------------------------------------------ | -------------------- |
| 단발성 상태 변화 (세션 만료, 설정 갱신 등) | `emit_to` + `listen` |
| 장기 실행 작업의 진행률 / 스트리밍         | `Channel<T>`         |

---

## 4. Event Emit (단발성)

```rust
use tauri::Emitter;

if let Err(error) = app.emit_to("main", "auth-session-cleared", payload) {
    log::warn!("[auth] failed to emit auth-session-cleared: {error}");
}
```

- emit payload struct 는 `Serialize + Clone` 을 derive 한다.
- emit 실패는 `log::warn!` 으로 남기고 command 결과를 깨뜨리지 않는다 (best-effort).
- Frontend 는 `listen()` 으로 구독하고 cleanup 은 `useEffect` return 에서 `unlisten()` 으로 처리한다.
- listener 는 raw payload 를 그대로 cache 에 넣지 않고 `safeParse` 를 거친 뒤 `setQueryData` 한다 (`docs/optional/server-state.md §3.4` 참조).

---

## 5. Channel IPC (스트리밍)

단일 응답이 아닌 진행률·중간 결과가 필요하면 `tauri::ipc::Channel<T>` 를 사용한다.

```rust
use tauri::ipc::Channel;

#[derive(Clone, Serialize)]
#[serde(tag = "event", content = "data", rename_all = "camelCase")]
pub enum SyncEvent {
    Progress { current: u32, total: u32 },
    Finished,
}

#[tauri::command]
pub async fn job_run(on_event: Channel<SyncEvent>) -> Result<IpcResult<()>, String> {
    on_event.send(SyncEvent::Progress { current: 1, total: 10 }).ok();
    // ... 작업 ...
    on_event.send(SyncEvent::Finished).ok();
    Ok(response::ok(()))
}
```

```ts
// frontend
import { Channel } from "@tauri-apps/api/core";

const channel = new Channel<SyncEvent>();
channel.onmessage = (msg) => {
  if (msg.event === "progress") setProgress(msg.data.current, msg.data.total);
};
await invokeTauri("job_run", { onEvent: channel });
```

---

## 6. 이벤트 이름 / payload 규약

- 이벤트 이름은 `<feature>-<action>` 형식 (kebab-case): `auth-session-cleared`, `sync-progress`.
- emit/listen 이벤트 이름 상수는 `src-tauri/src/shared/config.rs` 에 `EVENT_*` 로 등록한다.
- payload struct 는 feature `model.rs` 에 두고, frontend 는 동일 이름의 type/Zod schema 를 가진다.

---

## 7. capability

- listen/emit 사용 시 `core:event:default` permission 을 `capabilities/default.json` 에 추가한다 (granular 하게 좁히려면 `core:event:allow-listen` / `core:event:allow-unlisten`). deep-link 등 다른 문서와 표기를 `core:event:default` 로 통일한다.
- `Channel<T>` 은 invoke 반환 채널을 통하므로 event permission 이 **필요 없다**.

---

## 8. 안티패턴 · 경계 주의

| 패턴                                       | 이유 / 올바른 방향                                                |
| :----------------------------------------- | :---------------------------------------------------------------- |
| `useEffect` cleanup 에서 `unlisten()` 누락 | 재마운트마다 리스너 중복 구독·누수 → return 에서 반드시 해제      |
| raw payload 를 검증 없이 cache/상태 반영   | 위조·형태 불일치 → `safeParse` 후 반영 (`server-state.md §3.4`)   |
| emit 실패를 `Err` 로 command 를 실패 처리  | 통지는 best-effort → `log::warn!` 만, command 결과는 유지         |
| 이벤트 이름 문자열을 여러 곳에 하드코딩    | 오타·drift → `EVENT_*` 상수 1곳(Rust) + frontend 동기             |
| 단발 통지에 `Channel` / 진행률에 `emit`    | 방식 오용 → §3 선택 기준을 따름                                   |
| 고빈도 진행률을 매 tick `emit`             | 전역 브로드캐스트 flooding → throttle 하거나 `Channel<T>` 로 전환 |

---

## 9. 도입 체크리스트

| #   | 항목                                                                        | 확인 |
| :-- | :-------------------------------------------------------------------------- | :--- |
| 1   | 이벤트 이름 상수를 `shared/config.rs` 에 `EVENT_*` 로 추가                  | □    |
| 2   | payload struct 에 `Serialize + Clone` derive                                | □    |
| 3   | emit 실패를 `log::warn!` 로만 처리 (`Err` 반환하지 않음)                    | □    |
| 4   | Frontend listener 가 `safeParse` 거친 후 cache 갱신                         | □    |
| 5   | `useEffect` cleanup 에서 `unlisten()` 호출                                  | □    |
| 6   | (Channel 사용 시) Frontend 에서 `new Channel<T>()` 생성 후 `onmessage` 등록 | □    |
| 7   | capability 에 event permission 등록                                         | □    |
