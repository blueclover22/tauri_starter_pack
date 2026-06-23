mod features;
mod shared;

use tauri::{Manager, RunEvent, WindowEvent};

use crate::shared::runtime::lifecycle;
use crate::shared::store::state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 데스크톱 전용 plugin(window-state 등)을 추가하려면 `let mut builder = ...` 로 바꾸고
    // `#[cfg(desktop)] { builder = builder.plugin(...); }` 형태로 분기한다.
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            features::app::commands::app_ping,
            // 새 도메인 command 추가 시 여기에 등록
        ])
        .setup(|app| {
            lifecycle::run_boot(app).map_err(|e| format!("[{:?}] {}", e.stage, e.message))?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { .. } = event {
                let app = window.app_handle();
                if let Some(state) = app.try_state::<AppState>() {
                    state.teardown.fire(app);
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if let RunEvent::Exit = event {
            if let Some(state) = app_handle.try_state::<AppState>() {
                state.teardown.fire(app_handle);
            }
        }
    });
}
