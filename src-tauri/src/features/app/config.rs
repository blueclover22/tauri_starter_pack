//! app feature 의 도메인 상수. 한 도메인 = 한 에러 카테고리(ERROR_APP_*).

/// app_ping 검증/처리 실패 에러 코드.
pub const ERROR_APP_PING_FAILED: &str = "ERROR_APP_PING_FAILED";

/// note 최대 길이 (검증 예시 — 실제 기능에 맞게 교체한다).
pub const MAX_NOTE_LEN: usize = 100;
