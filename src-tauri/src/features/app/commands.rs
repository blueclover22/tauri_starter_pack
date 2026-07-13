use crate::shared::lib::response;
use crate::shared::types::ipc::IpcResult;

use super::config;
use super::model::{PingInfo, PingRequest};
use super::service;

/// IPC 파이프 확인용 샘플 command. 실제 기능 추가 시 제거 가능.
///
/// Ok-Only 규약: 비즈니스 에러도 `Err(String)` 이 아니라 `Ok(IpcResult::err(...))` 로 반환한다.
#[tauri::command]
pub async fn app_ping(request: PingRequest) -> Result<IpcResult<PingInfo>, String> {
    match service::ping(&request) {
        Ok(info) => Ok(response::ok(info)),
        Err(message) => Ok(IpcResult::err(
            config::ERROR_APP_PING_FAILED,
            message,
            false,
        )),
    }
}
