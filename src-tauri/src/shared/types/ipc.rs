use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppError {
    pub code: String,
    pub message: String,
    pub retryable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IpcResult<T: Serialize = serde_json::Value> {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<AppError>,
}

impl<T: Serialize> IpcResult<T> {
    pub fn ok(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
        }
    }

    /// 비즈니스 에러 응답 helper. 도메인 command 추가 시 사용한다 (뼈대 단계 미사용).
    #[allow(dead_code)]
    pub fn err(code: &str, message: impl Into<String>, retryable: bool) -> Self {
        Self {
            success: false,
            data: None,
            error: Some(AppError {
                code: code.to_string(),
                message: message.into(),
                retryable,
            }),
        }
    }
}
