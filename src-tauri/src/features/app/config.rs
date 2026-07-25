//! app feature 의 도메인 상수. 에러 코드는 카테고리 분류(tauri-guide §8)를 따른다 — 한 도메인 = 한 카테고리(여기서는 VALIDATION).

/// app_ping 입력 검증 실패 에러 코드.
pub const ERROR_VALIDATION_PING_FAILED: &str = "ERROR_VALIDATION_PING_FAILED";

/// note 최대 길이 (검증 예시 — 실제 기능에 맞게 교체한다).
pub const MAX_NOTE_LEN: usize = 100;
