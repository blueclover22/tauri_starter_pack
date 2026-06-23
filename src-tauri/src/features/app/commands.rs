use crate::shared::lib::response;
use crate::shared::types::ipc::IpcResult;

use super::model::{PingInfo, PingRequest};
use super::service;

/// IPC 파이프 확인용 샘플 command. 실제 기능 추가 시 제거 가능.
#[tauri::command]
pub async fn app_ping(request: PingRequest) -> Result<IpcResult<PingInfo>, String> {
    let info = service::ping(&request);
    Ok(response::ok(info))
}
