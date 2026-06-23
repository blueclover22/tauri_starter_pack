use std::sync::Arc;

use crate::shared::runtime::lifecycle::TeardownRegistry;

/// 앱 전역 공유 상태. 기능 추가 시 필드를 확장한다
/// (예: http_client, db_pool, auth_state — docs/optional/* 참조).
#[derive(Clone)]
pub struct AppState {
    pub teardown: Arc<TeardownRegistry>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            teardown: Arc::new(TeardownRegistry::new()),
        }
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}
