# Optional — Desktop UX (Tray · Window State · Single Instance · Opener)

> 도입 시점: 데스크톱 상주형 앱의 UX(트레이 상주, 창 상태 복원, 중복 실행 방지, 외부 열기)가 필요한 시점.
> 트레이/창 상태/단일 인스턴스는 **데스크톱 전용**(`#[cfg(desktop)]`). opener 는 공통.
> 뼈대 단계에서는 사용하지 않는다.

---

## 1. System Tray + Menu (core 기능)

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

## 2. Window State (`tauri-plugin-window-state`)

창 크기·위치를 종료 시 저장하고 다음 실행에 복원한다.

```rust
#[cfg(desktop)]
{
    builder = builder.plugin(tauri_plugin_window_state::Builder::default().build());
}
```

capability: `window-state:default`.

---

## 3. Single Instance (`tauri-plugin-single-instance`)

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

## 4. Opener (`tauri-plugin-opener`)

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

## 5. 등록 순서 주의

데스크톱 plugin 들의 등록 순서는 **single-instance → (deep-link) → 나머지** 가 안전하다. 트레이/창 복원은 순서 영향이 적다.

---

## 6. 도입 체크리스트

| #   | 항목                                                                      | 확인 |
| :-- | :------------------------------------------------------------------------ | :--- |
| 1   | (트레이) `tauri` 의 `tray-icon` feature 활성화 + `TrayIconBuilder` 구성   | □    |
| 2   | (창 상태) `tauri-plugin-window-state` + capability `window-state:default` | □    |
| 3   | (단일 인스턴스) `tauri-plugin-single-instance` 를 **첫 plugin** 으로 등록 | □    |
| 4   | (opener) `tauri-plugin-opener` + capability `opener:default`              | □    |
| 5   | 데스크톱 전용 plugin 은 모두 `#[cfg(desktop)]` 로 분기                    | □    |
| 6   | 트레이 메뉴 동작(종료/표시 등)을 `on_menu_event` 로 연결                  | □    |
