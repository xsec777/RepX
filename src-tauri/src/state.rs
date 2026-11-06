//! 全局应用状态：管理当前活动项目、Cookie Jar 与事件广播

use std::sync::{Arc, Mutex, RwLock};
use reqwest::cookie::Jar;
use tauri::{AppHandle, Emitter};
use crate::db::{ProjectDb, ProjectInfo};

pub struct AppState {
    pub db: RwLock<Arc<ProjectDb>>,
    pub jar: Mutex<Arc<Jar>>,
    pub app_handle: Mutex<Option<AppHandle>>,
    pub active_port: Mutex<u16>,
}

impl AppState {
    pub fn new_with_temp() -> Result<Self, String> {
        let temp_db = ProjectDb::open_temp()?;
        Ok(Self {
            db: RwLock::new(Arc::new(temp_db)),
            jar: Mutex::new(Arc::new(Jar::default())),
            app_handle: Mutex::new(None),
            active_port: Mutex::new(18080),
        })
    }

    pub fn set_active_port(&self, port: u16) {
        if let Ok(mut lock) = self.active_port.lock() {
            *lock = port;
        }
    }

    pub fn get_active_port(&self) -> u16 {
        self.active_port.lock().map(|p| *p).unwrap_or(18080)
    }

    pub fn set_app_handle(&self, handle: AppHandle) {
        if let Ok(mut lock) = self.app_handle.lock() {
            *lock = Some(handle);
        }
    }

    pub fn jar(&self) -> Result<Arc<Jar>, String> {
        self.jar
            .lock()
            .map(|g| g.clone())
            .map_err(|_| "Cookie 状态锁异常".to_string())
    }

    pub fn reset_cookies(&self) -> Result<(), String> {
        let mut guard = self.jar.lock().map_err(|_| "Cookie 锁异常".to_string())?;
        *guard = Arc::new(Jar::default());
        Ok(())
    }

    pub fn active_db(&self) -> Arc<ProjectDb> {
        self.db.read().unwrap().clone()
    }

    /// 切换活动项目（新建磁盘项目 / 打开已有项目 / 切换临时项目）
    pub fn switch_project(&self, new_db: ProjectDb) -> Result<ProjectInfo, String> {
        let info = new_db.info.clone();
        {
            let mut lock = self.db.write().unwrap();
            *lock = Arc::new(new_db);
        }
        // 清空当前项目的 Cookie Jar
        let _ = self.reset_cookies();

        // 通知前端 UI 项目已切换
        if let Ok(lock) = self.app_handle.lock() {
            if let Some(app) = &*lock {
                let _ = app.emit("repx://project-switched", &info);
            }
        }

        Ok(info)
    }

    /// 广播新流量产生（前端实时刷新表格）
    pub fn emit_history_updated(&self, history_id: i64) {
        if let Ok(lock) = self.app_handle.lock() {
            if let Some(app) = &*lock {
                let _ = app.emit("repx://history-updated", history_id);
            }
        }
    }
}
