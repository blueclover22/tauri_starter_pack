use super::model::{PingInfo, PingRequest};

/// 샘플 비즈니스 로직. 실제 기능 추가 시 이 패턴(command → service)을 따른다.
pub fn ping(request: &PingRequest) -> PingInfo {
    PingInfo {
        message: "pong".to_string(),
        echoed_note: request.note.clone(),
    }
}
