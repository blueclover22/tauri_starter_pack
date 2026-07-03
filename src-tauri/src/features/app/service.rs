use super::model::{PingInfo, PingRequest};

/// 샘플 비즈니스 로직. 실제 기능 추가 시 이 패턴(command → service)을 따른다.
pub fn ping(request: &PingRequest) -> PingInfo {
    PingInfo {
        message: "pong".to_string(),
        echoed_note: request.note.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ping_echoes_note() {
        let info = ping(&PingRequest {
            note: Some("hi".to_string()),
        });
        assert_eq!(info.message, "pong");
        assert_eq!(info.echoed_note.as_deref(), Some("hi"));
    }

    #[test]
    fn ping_without_note_returns_none() {
        let info = ping(&PingRequest { note: None });
        assert_eq!(info.message, "pong");
        assert!(info.echoed_note.is_none());
    }
}
