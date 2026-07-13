use super::config::MAX_NOTE_LEN;
use super::model::{PingInfo, PingRequest};

/// 샘플 비즈니스 로직. 실제 기능 추가 시 이 패턴(command → service)을 따른다.
///
/// 성공은 `Ok(PingInfo)`, 비즈니스 에러는 `Err(message)` 로 반환한다.
/// command 계층이 이 message 에 에러 코드·retryable 을 부여해 `IpcResult::err` 로 포장한다(Ok-Only).
pub fn ping(request: &PingRequest) -> Result<PingInfo, String> {
    if let Some(note) = &request.note {
        if note.chars().count() > MAX_NOTE_LEN {
            return Err(format!("note 는 {MAX_NOTE_LEN}자를 넘을 수 없습니다."));
        }
    }

    Ok(PingInfo {
        message: "pong".to_string(),
        echoed_note: request.note.clone(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ping_echoes_note() {
        let info = ping(&PingRequest {
            note: Some("hi".to_string()),
        })
        .unwrap();
        assert_eq!(info.message, "pong");
        assert_eq!(info.echoed_note.as_deref(), Some("hi"));
    }

    #[test]
    fn ping_without_note_returns_none() {
        let info = ping(&PingRequest { note: None }).unwrap();
        assert_eq!(info.message, "pong");
        assert!(info.echoed_note.is_none());
    }

    #[test]
    fn ping_rejects_too_long_note() {
        let long = "a".repeat(MAX_NOTE_LEN + 1);
        let err = ping(&PingRequest { note: Some(long) }).unwrap_err();
        assert!(err.contains("넘을 수 없습니다"));
    }
}
