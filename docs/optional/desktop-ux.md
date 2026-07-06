# Optional — Desktop UX (Tray · Window State · Single Instance · Opener)

> 도입 시점: 데스크톱 상주형 앱의 UX(트레이 상주, 창 상태 복원, 중복 실행 방지, 외부 열기)가 필요한 시점.
> 트레이/창 상태/단일 인스턴스는 **데스크톱 전용**(`#[cfg(desktop)]`). opener 는 공통.
> 뼈대 단계에서는 사용하지 않는다.

---

## 1. 아키텍처 위치 · 구성 흐름

네 요소는 대부분 **Rust builder / `.setup()` 의 데스크톱 분기에서 구성**된다. Renderer 가 직접 닿는 건 opener 뿐이고, 나머지는 창·프로세스 수명에 관한 Rust 측 설정이다.

```text
- Single Instance : builder 의 첫 plugin (#[cfg(desktop)]) — 2차 실행 → 기존 창 포커스 콜백
- Window State    : builder plugin (#[cfg(desktop)]) — 종료 시 크기·위치 저장, 재실행 복원
- Tray + Menu     : .setup()(또는 run_boot) 의 #[cfg(desktop)] 분기 — on_menu_event 로 동작 연결
- Opener          : builder plugin (공통) → frontend openUrl/openPath (feature api 경유)
```

등록 순서에 민감한 것은 single-instance 이므로 §7 을 반드시 확인한다.

---

## 2. 뼈대 통합 접점

| 접점                        | 뼈대 현재 상태              | 도입 시 변경                                                                   |
| :-------------------------- | :-------------------------- | :----------------------------------------------------------------------------- |
| `Cargo.toml`                | `tauri = { version = "2" }` | 트레이 사용 시 `features = ["tray-icon"]` 추가                                 |
| `lib.rs` builder            | log plugin + `app_ping`     | single-instance(첫) → window-state → opener, 데스크톱 전용은 `#[cfg(desktop)]` |
| `.setup()` / `run_boot`     | `run_boot` 3단계            | 데스크톱 분기에서 `TrayIconBuilder` 구성                                       |
| `capabilities/default.json` | `core:default`              | `window-state:default`, `opener:default`                                       |
| feature 폴더                | `app` 샘플                  | opener 호출은 `features/<f>/api` 경유                                          |

---

## 3. System Tray + Menu (core 기능)

플러그인이 아니라 Tauri core 기능이며, `tauri` crate 의 `tray-icon` feature 가 필요하다.

```toml
# Cargo.toml
tauri = { version = "2", features = ["tray-icon"] }
```

```rust
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
};

#[cfg(desktop)]
{
    let quit = MenuItem::with_id(app, "quit", "종료", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&quit])?;
    TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| {
            if event.id.as_ref() == "quit" {
                app.exit(0);
            }
        })
        .build(app)?;
}
```

트레이 구성은 `.setup()`(또는 lifecycle `run_boot`)의 데스크톱 분기에 둔다.

---

## 4. Window State (`tauri-plugin-window-state`)

창 크기·위치를 종료 시 저장하고 다음 실행에 복원한다.

```rust
#[cfg(desktop)]
{
    builder = builder.plugin(tauri_plugin_window_state::Builder::default().build());
}
```

capability: `window-state:default`.

---

## 5. Single Instance (`tauri-plugin-single-instance`)

중복 실행을 막고, 두 번째 실행 시 기존 창을 포커스한다. **가장 먼저 등록**한다(딥링크와 함께 쓰면 특히 중요 — `docs/optional/notification-deeplink.md §2.2`).

```rust
#[cfg(desktop)]
{
    builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
        if let Some(w) = app.get_webview_window("main") {
            let _ = w.set_focus();
        }
    }));
}
```

---

## 6. Opener (`tauri-plugin-opener`)

URL·파일·폴더를 OS 기본 앱으로 연다(데스크톱·모바일 공통).

```rust
.plugin(tauri_plugin_opener::init())
```

```ts
import { openUrl, openPath, revealItemInDir } from "@tauri-apps/plugin-opener";

await openUrl("https://example.com");
await openPath("/path/to/file.pdf");
await revealItemInDir("/path/to/file.pdf");
```

capability: `opener:default` (또는 scope 로 허용 대상 제한).

---

## 7. 등록 순서 주의

데스크톱 plugin 들의 등록 순서는 **single-instance → (deep-link) → 나머지** 가 안전하다. 트레이/창 복원은 순서 영향이 적다.

---

## 8. 안티패턴 · 경계 주의

| 패턴                                           | 이유 / 올바른 방향                                                        |
| :--------------------------------------------- | :------------------------------------------------------------------------ |
| 데스크톱 전용 plugin 을 모바일에도 등록        | 빌드/런타임 오류 → tray·window-state·single-instance 는 `#[cfg(desktop)]` |
| single-instance 를 나중에 등록                 | 2차 실행 인자·딥링크 유실 → **첫 plugin** 으로 등록                       |
| opener 를 무제한 scope 로 허용                 | 임의 URL/경로 열기 → scope 로 허용 대상 제한                              |
| "닫으면 트레이로" 를 기대하나 override 안 함   | 기본은 종료 → `CloseRequested` 에서 `hide()` 로 처리                      |
| window-state plugin 과 수동 위치 저장 병행     | 이중 관리·충돌 → 한쪽만 사용                                              |
| 트레이 메뉴 동작을 `on_menu_event` 밖에서 처리 | 이벤트 누락 → 핸들러 안에서 `event.id` 로 분기                            |

---

## 9. 도입 체크리스트

| #   | 항목                                                                      | 확인 |
| :-- | :------------------------------------------------------------------------ | :--- |
| 1   | (트레이) `tauri` 의 `tray-icon` feature 활성화 + `TrayIconBuilder` 구성   | □    |
| 2   | (창 상태) `tauri-plugin-window-state` + capability `window-state:default` | □    |
| 3   | (단일 인스턴스) `tauri-plugin-single-instance` 를 **첫 plugin** 으로 등록 | □    |
| 4   | (opener) `tauri-plugin-opener` + capability `opener:default`              | □    |
| 5   | 데스크톱 전용 plugin 은 모두 `#[cfg(desktop)]` 로 분기                    | □    |
| 6   | 트레이 메뉴 동작(종료/표시 등)을 `on_menu_event` 로 연결                  | □    |
