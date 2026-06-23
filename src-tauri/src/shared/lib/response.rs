use serde::Serialize;

use crate::shared::types::ipc::IpcResult;

/// command 성공 응답 helper. 직렬화 형태를 모든 command 에서 통일한다.
pub fn ok<T: Serialize>(data: T) -> IpcResult<T> {
    IpcResult::ok(data)
}
