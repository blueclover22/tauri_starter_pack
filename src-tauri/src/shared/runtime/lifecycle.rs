use std::sync::Mutex;

use tauri::{App, AppHandle, Manager};

use crate::shared::store::state::AppState;

/// 부팅 단계 식별자. 기능 추가 시 stage 를 확장한다
/// (LoadPersistedConfig / ConnectDatabase / RestoreAuthSession 등 — docs/optional/* 참조).
/// 뼈대 단계에서는 실패하는 stage 가 없어 일부 variant 가 미사용이다.
#[derive(Debug, Clone, Copy)]
#[allow(dead_code)]
pub enum BootStage {
    InitPlugins,
    PrepareState,
    RegisterState,
}

#[derive(Debug)]
pub struct BootError {
    pub stage: BootStage,
    pub message: String,
}

impl BootError {
    /// 부팅 stage 가 실패할 때 사용한다 (기능 도입 시 fallible stage 에서 호출).
    #[allow(dead_code)]
    fn new(stage: BootStage, message: impl Into<String>) -> Self {
        Self {
            stage,
            message: message.into(),
        }
    }
}

/// 부팅 순서를 실행한다. 치명적 단계 실패 시 BootError 로 전파하여 앱을 중단한다.
pub fn run_boot(app: &mut App) -> Result<(), BootError> {
    // InitPlugins: 플러그인은 builder 체인에서 이미 등록됨. 추가 런타임 초기화 자리.
    log::info!("[boot] InitPlugins");

    // PrepareState: AppState 구성.
    log::info!("[boot] PrepareState");
    let state = AppState::new();

    // RegisterState: app.manage 로 전역 등록.
    log::info!("[boot] RegisterState");
    app.manage(state);

    Ok(())
}

#[allow(dead_code)]
type TeardownHook = Box<dyn Fn(&AppHandle) + Send + Sync>;

/// 종료 시 정리 작업 레지스트리. fire() 는 멱등이다.
pub struct TeardownRegistry {
    hooks: Mutex<Vec<TeardownHook>>,
    fired: Mutex<bool>,
}

impl TeardownRegistry {
    pub fn new() -> Self {
        Self {
            hooks: Mutex::new(Vec::new()),
            fired: Mutex::new(false),
        }
    }

    /// 도메인별 cleanup 훅 등록 (예: db_pool.close, background task cancel).
    #[allow(dead_code)]
    pub fn register<F>(&self, hook: F)
    where
        F: Fn(&AppHandle) + Send + Sync + 'static,
    {
        if let Ok(mut hooks) = self.hooks.lock() {
            hooks.push(Box::new(hook));
        }
    }

    /// 등록된 훅을 1회만 실행한다. CloseRequested / Exit 양쪽에서 호출해도 안전하다.
    pub fn fire(&self, app: &AppHandle) {
        let mut fired = match self.fired.lock() {
            Ok(guard) => guard,
            Err(_) => return,
        };
        if *fired {
            return;
        }
        *fired = true;

        if let Ok(hooks) = self.hooks.lock() {
            for hook in hooks.iter() {
                hook(app);
            }
        }
    }
}

impl Default for TeardownRegistry {
    fn default() -> Self {
        Self::new()
    }
}
