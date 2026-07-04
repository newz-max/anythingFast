use crate::diagnostics::dev_log_error;
use crate::domain::{AppConfig, ExecutionLogSummary};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum StorageError {
    #[error("无法解析应用数据目录")]
    AppDir,
    #[error("IO 错误：{0}")]
    Io(#[from] std::io::Error),
    #[error("JSON 错误：{0}")]
    Json(#[from] serde_json::Error),
}

pub type StorageResult<T> = Result<T, StorageError>;

pub fn load_config(app: &AppHandle) -> StorageResult<AppConfig> {
    let path = config_path(app)?;
    if !path.exists() {
        let mut config = AppConfig::default();
        config.settings.config_path = Some(path.to_string_lossy().to_string());
        save_config(app, &config)?;
        return Ok(config);
    }

    let content = fs::read_to_string(&path)?;
    if content.trim().is_empty() {
        return Ok(AppConfig::default());
    }
    let mut config: AppConfig = serde_json::from_str(&content)?;
    config.settings.config_path = Some(path.to_string_lossy().to_string());
    Ok(config)
}

pub fn save_config(app: &AppHandle, config: &AppConfig) -> StorageResult<()> {
    let path = config_path(app)?;
    ensure_parent(&path)?;
    let temp_path = path.with_extension("json.tmp");
    let content = serde_json::to_string_pretty(config)?;
    fs::write(&temp_path, content)?;
    fs::rename(temp_path, path)?;
    Ok(())
}

pub fn load_logs(app: &AppHandle, limit: usize) -> StorageResult<Vec<ExecutionLogSummary>> {
    let path = logs_path(app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content = fs::read_to_string(path)?;
    if content.trim().is_empty() {
        return Ok(Vec::new());
    }
    let mut logs: Vec<ExecutionLogSummary> = serde_json::from_str(&content)?;
    logs.sort_by(|left, right| right.started_at.cmp(&left.started_at));
    logs.truncate(limit);
    Ok(logs)
}

pub fn append_log(app: &AppHandle, log: ExecutionLogSummary) -> StorageResult<()> {
    let path = logs_path(app)?;
    ensure_parent(&path)?;
    let mut logs = match load_logs(app, 200) {
        Ok(logs) => logs,
        Err(err) => {
            dev_log_error("Read existing execution logs failed", &err);
            Vec::new()
        }
    };
    logs.insert(0, log);
    logs.truncate(200);
    fs::write(path, serde_json::to_string_pretty(&logs)?)?;
    Ok(())
}

pub fn config_path(app: &AppHandle) -> StorageResult<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|_| StorageError::AppDir)?;
    Ok(dir.join("config.json"))
}

fn logs_path(app: &AppHandle) -> StorageResult<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|_| StorageError::AppDir)?;
    Ok(dir.join("execution-logs.json"))
}

fn ensure_parent(path: &PathBuf) -> StorageResult<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn app_config_roundtrip_json_shape() {
        let config = AppConfig::default();
        let content = serde_json::to_string_pretty(&config).unwrap();
        let restored: AppConfig = serde_json::from_str(&content).unwrap();
        assert_eq!(restored.version, 2);
        assert_eq!(restored.settings.global_shortcut, "Alt+Space");
        assert!(!restored.settings.launch_on_startup);
        assert!(restored.templates.is_empty());
    }

    #[test]
    fn old_task_without_favorite_defaults_to_false() {
        let content = r#"{
            "version": 1,
            "tasks": [{
                "id": "task",
                "name": "旧事项",
                "category": "未分类",
                "keywords": [],
                "description": "",
                "actions": [],
                "riskLevel": "low",
                "enabled": true,
                "createdAt": "2026-07-01T00:00:00Z",
                "updatedAt": "2026-07-01T00:00:00Z"
            }],
            "settings": {
                "globalShortcut": "Alt+Space"
            }
        }"#;
        let restored: AppConfig = serde_json::from_str(content).unwrap();
        assert!(!restored.tasks[0].favorite);
        assert!(restored.tasks[0].tag_ids.is_empty());
        assert_eq!(restored.tasks[0].triggers.len(), 1);
        assert!(restored.templates.is_empty());
        assert!(matches!(
            restored.settings.theme,
            crate::domain::AppTheme::Dark
        ));
        assert!(!restored.settings.launch_on_startup);
    }

    #[test]
    fn temp_extension_is_predictable() {
        let path = PathBuf::from("config.json");
        assert_eq!(
            path.with_extension("json.tmp"),
            PathBuf::from("config.json.tmp")
        );
        let _ = fs::remove_file("config.json.tmp");
    }
}
