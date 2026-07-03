# Optional — Event Emit & Channel IPC

> 도입 시점: Backend → Frontend 로 비동기 상태 변화를 통보하거나 장기 실행 작업의 진행률을 스트리밍해야 하는 시점.
> 뼈대 단계에서는 사용하지 않는다.

---

## 1. 두 방식의 선택 기준

| 상황                                       | 방식                 |
| ------------------------------------------ | -------------------- |
| 단발성 상태 변화 (세션 만료, 설정 갱신 등) | `emit_to` + `listen` |
| 장기 실행 작업의 진행률 / 스트리밍         | `Channel<T>`         |

---

## 2. Event Emit (단발성)

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

## 3. Channel IPC (스트리밍)

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

## 4. 이벤트 이름 / payload 규약

- 이벤트 이름은 `<feature>-<action>` 형식 (kebab-case): `auth-session-cleared`, `sync-progress`.
- emit/listen 이벤트 이름 상수는 `src-tauri/src/shared/config.rs` 에 `EVENT_*` 로 등록한다.
- payload struct 는 feature `model.rs` 에 두고, frontend 는 동일 이름의 type/Zod schema 를 가진다.

---

## 5. capability

- listen/emit 사용 시 `core:event:default` permission 을 `capabilities/default.json` 에 추가한다 (granular 하게 좁히려면 `core:event:allow-listen` / `core:event:allow-unlisten`). deep-link 등 다른 문서와 표기를 `core:event:default` 로 통일한다.

---

## 6. 도입 체크리스트

| #   | 항목                                                                        | 확인 |
| :-- | :-------------------------------------------------------------------------- | :--- |
| 1   | 이벤트 이름 상수를 `shared/config.rs` 에 `EVENT_*` 로 추가                  | □    |
| 2   | payload struct 에 `Serialize + Clone` derive                                | □    |
| 3   | emit 실패를 `log::warn!` 로만 처리 (`Err` 반환하지 않음)                    | □    |
| 4   | Frontend listener 가 `safeParse` 거친 후 cache 갱신                         | □    |
| 5   | `useEffect` cleanup 에서 `unlisten()` 호출                                  | □    |
| 6   | (Channel 사용 시) Frontend 에서 `new Channel<T>()` 생성 후 `onmessage` 등록 | □    |
| 7   | capability 에 event permission 등록                                         | □    |
