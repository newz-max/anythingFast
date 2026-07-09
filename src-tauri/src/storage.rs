use crate::diagnostics::dev_log_error;
use crate::domain::{AppConfig, ExecutionLogSummary, KeybindingOverride, KeybindingsLoadResult};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use thiserror::Error;

static CONFIG_WRITE_LOCK: Mutex<()> = Mutex::new(());
static KEYBINDINGS_WRITE_LOCK: Mutex<()> = Mutex::new(());
static LOG_WRITE_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Error)]
pub enum StorageError {
    #[error("无法解析应用数据目录")]
    AppDir,
    #[error("IO 错误：{0}")]
    Io(#[from] std::io::Error),
    #[error("JSON 错误：{0}")]
    Json(#[from] serde_json::Error),
    #[error("存储锁不可用：{0}")]
    Lock(&'static str),
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
    let _guard = CONFIG_WRITE_LOCK
        .lock()
        .map_err(|_| StorageError::Lock("config"))?;
    let path = config_path(app)?;
    write_config_file(&path, config)
}

pub fn load_keybindings(app: &AppHandle) -> StorageResult<KeybindingsLoadResult> {
    let path = keybindings_path(app)?;
    read_keybindings_file(&path)
}

fn read_keybindings_file(path: &PathBuf) -> StorageResult<KeybindingsLoadResult> {
    if !path.exists() {
        return Ok(KeybindingsLoadResult {
            overrides: Vec::new(),
            path: path.to_string_lossy().to_string(),
            warning: None,
        });
    }

    let content = fs::read_to_string(&path)?;
    if content.trim().is_empty() {
        return Ok(KeybindingsLoadResult {
            overrides: Vec::new(),
            path: path.to_string_lossy().to_string(),
            warning: None,
        });
    }

    match serde_json::from_str::<Vec<KeybindingOverride>>(&content) {
        Ok(overrides) => Ok(KeybindingsLoadResult {
            overrides,
            path: path.to_string_lossy().to_string(),
            warning: None,
        }),
        Err(err) => Ok(KeybindingsLoadResult {
            overrides: Vec::new(),
            path: path.to_string_lossy().to_string(),
            warning: Some(format!(
                "keybindings.json 无法读取，已使用默认快捷键：{err}"
            )),
        }),
    }
}

pub fn save_keybindings(
    app: &AppHandle,
    overrides: &[KeybindingOverride],
) -> StorageResult<KeybindingsLoadResult> {
    let _guard = KEYBINDINGS_WRITE_LOCK
        .lock()
        .map_err(|_| StorageError::Lock("keybindings"))?;
    let path = keybindings_path(app)?;
    write_keybindings_file(&path, overrides)?;
    Ok(KeybindingsLoadResult {
        overrides: overrides.to_vec(),
        path: path.to_string_lossy().to_string(),
        warning: None,
    })
}

pub fn reset_keybindings(app: &AppHandle) -> StorageResult<KeybindingsLoadResult> {
    let _guard = KEYBINDINGS_WRITE_LOCK
        .lock()
        .map_err(|_| StorageError::Lock("keybindings"))?;
    let path = keybindings_path(app)?;
    reset_keybindings_file(&path)
}

fn reset_keybindings_file(path: &PathBuf) -> StorageResult<KeybindingsLoadResult> {
    if path.exists() {
        fs::remove_file(path)?;
    }
    Ok(KeybindingsLoadResult {
        overrides: Vec::new(),
        path: path.to_string_lossy().to_string(),
        warning: None,
    })
}

pub fn ensure_keybindings_file(app: &AppHandle) -> StorageResult<PathBuf> {
    let path = keybindings_path(app)?;
    if !path.exists() {
        write_keybindings_file(&path, &[])?;
    }
    Ok(path)
}

pub fn update_task_run_metadata(
    app: &AppHandle,
    task_id: &str,
    finished_at: String,
) -> StorageResult<()> {
    let path = config_path(app)?;
    update_task_run_metadata_file(&path, task_id, finished_at)
}

fn update_task_run_metadata_file(
    path: &PathBuf,
    task_id: &str,
    finished_at: String,
) -> StorageResult<()> {
    let _guard = CONFIG_WRITE_LOCK
        .lock()
        .map_err(|_| StorageError::Lock("config"))?;
    let mut config = read_config_file(&path)?;
    config.settings.config_path = Some(path.to_string_lossy().to_string());
    if let Some(task) = config.tasks.iter_mut().find(|task| task.id == task_id) {
        task.last_run_at = Some(finished_at.clone());
        task.updated_at = finished_at;
    }
    write_config_file(&path, &config)
}

fn write_config_file(path: &PathBuf, config: &AppConfig) -> StorageResult<()> {
    ensure_parent(path)?;
    let temp_path = path.with_extension("json.tmp");
    let content = serde_json::to_string_pretty(config)?;
    fs::write(&temp_path, content)?;
    fs::rename(temp_path, path)?;
    Ok(())
}

fn write_keybindings_file(path: &PathBuf, overrides: &[KeybindingOverride]) -> StorageResult<()> {
    ensure_parent(path)?;
    let temp_path = path.with_extension("json.tmp");
    let content = serde_json::to_string_pretty(overrides)?;
    fs::write(&temp_path, content)?;
    fs::rename(temp_path, path)?;
    Ok(())
}

fn read_config_file(path: &PathBuf) -> StorageResult<AppConfig> {
    if !path.exists() {
        return Ok(AppConfig::default());
    }
    let content = fs::read_to_string(path)?;
    if content.trim().is_empty() {
        return Ok(AppConfig::default());
    }
    Ok(serde_json::from_str(&content)?)
}

pub fn load_logs(app: &AppHandle, limit: usize) -> StorageResult<Vec<ExecutionLogSummary>> {
    let path = logs_path(app)?;
    read_logs_file(&path, limit)
}

fn read_logs_file(path: &PathBuf, limit: usize) -> StorageResult<Vec<ExecutionLogSummary>> {
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
    append_log_file(&path, log)
}

fn append_log_file(path: &PathBuf, log: ExecutionLogSummary) -> StorageResult<()> {
    let _guard = LOG_WRITE_LOCK
        .lock()
        .map_err(|_| StorageError::Lock("logs"))?;
    ensure_parent(&path)?;
    let mut logs = match read_logs_file(path, 200) {
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

pub fn keybindings_path(app: &AppHandle) -> StorageResult<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|_| StorageError::AppDir)?;
    Ok(dir.join("keybindings.json"))
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
    use crate::domain::{
        ActionType, ExecutionScope, ExecutionStatus, RiskLevel, TaskItem, TaskTrigger,
    };
    use std::fs;
    use std::thread;
    use uuid::Uuid;

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
        let keybindings_path = PathBuf::from("keybindings.json");
        assert_eq!(
            keybindings_path.with_extension("json.tmp"),
            PathBuf::from("keybindings.json.tmp")
        );
        let _ = fs::remove_file("config.json.tmp");
        let _ = fs::remove_file("keybindings.json.tmp");
    }

    #[test]
    fn concurrent_run_metadata_updates_preserve_other_tasks() {
        let dir = temp_storage_dir();
        let path = dir.join("config.json");
        let mut config = AppConfig::default();
        config.tasks = vec![task("task-1"), task("task-2")];
        write_config_file(&path, &config).expect("write config");

        let first_path = path.clone();
        let second_path = path.clone();
        let first = thread::spawn(move || {
            update_task_run_metadata_file(&first_path, "task-1", "2026-07-01T00:00:01Z".into())
                .expect("update first task")
        });
        let second = thread::spawn(move || {
            update_task_run_metadata_file(&second_path, "task-2", "2026-07-01T00:00:02Z".into())
                .expect("update second task")
        });

        first.join().expect("join first");
        second.join().expect("join second");

        let restored = read_config_file(&path).expect("read config");
        assert_eq!(
            restored
                .tasks
                .iter()
                .find(|task| task.id == "task-1")
                .and_then(|task| task.last_run_at.clone()),
            Some("2026-07-01T00:00:01Z".into())
        );
        assert_eq!(
            restored
                .tasks
                .iter()
                .find(|task| task.id == "task-2")
                .and_then(|task| task.last_run_at.clone()),
            Some("2026-07-01T00:00:02Z".into())
        );

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn concurrent_log_appends_preserve_both_entries() {
        let dir = temp_storage_dir();
        let path = dir.join("execution-logs.json");

        let first_path = path.clone();
        let second_path = path.clone();
        let first = thread::spawn(move || {
            append_log_file(&first_path, log("log-1", "task-1")).expect("append first log")
        });
        let second = thread::spawn(move || {
            append_log_file(&second_path, log("log-2", "task-2")).expect("append second log")
        });

        first.join().expect("join first");
        second.join().expect("join second");

        let logs = read_logs_file(&path, 20).expect("read logs");
        assert_eq!(logs.len(), 2);
        assert!(logs.iter().any(|log| log.id == "log-1"));
        assert!(logs.iter().any(|log| log.id == "log-2"));

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn keybindings_roundtrip_json_shape() {
        let dir = temp_storage_dir();
        let path = dir.join("keybindings.json");
        let overrides = vec![
            KeybindingOverride {
                command: "main.focusSearch".into(),
                key: Some("Alt+F".into()),
                disabled: false,
            },
            KeybindingOverride {
                command: "main.addAction".into(),
                key: None,
                disabled: true,
            },
        ];

        write_keybindings_file(&path, &overrides).expect("write keybindings");
        let result = read_keybindings_file(&path).expect("read keybindings");

        assert_eq!(result.overrides.len(), 2);
        assert_eq!(result.overrides[0].command, "main.focusSearch");
        assert_eq!(result.overrides[0].key.as_deref(), Some("Alt+F"));
        assert!(result.overrides[1].disabled);

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn reset_keybindings_removes_override_file() {
        let dir = temp_storage_dir();
        let path = dir.join("keybindings.json");
        write_keybindings_file(
            &path,
            &[KeybindingOverride {
                command: "main.focusSearch".into(),
                key: Some("Alt+F".into()),
                disabled: false,
            }],
        )
        .expect("write keybindings");

        let result = reset_keybindings_file(&path).expect("reset keybindings");

        assert!(result.overrides.is_empty());
        assert!(!path.exists());

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn invalid_keybindings_json_falls_back_to_defaults() {
        let dir = temp_storage_dir();
        let path = dir.join("keybindings.json");
        fs::write(&path, "{invalid").expect("write invalid keybindings");

        let result = read_keybindings_file(&path).expect("read invalid keybindings");

        assert!(result.overrides.is_empty());
        assert!(result.warning.unwrap().contains("已使用默认快捷键"));

        let _ = fs::remove_dir_all(dir);
    }

    fn temp_storage_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("anything-fast-storage-{}", Uuid::new_v4()));
        fs::create_dir_all(&dir).expect("create temp storage dir");
        dir
    }

    fn task(id: &str) -> TaskItem {
        TaskItem {
            id: id.into(),
            name: id.into(),
            category: None,
            keywords: None,
            description: None,
            variables: Vec::new(),
            actions: Vec::new(),
            risk_level: RiskLevel::Low,
            enabled: true,
            favorite: false,
            tag_ids: Vec::new(),
            triggers: vec![TaskTrigger::Manual { enabled: true }],
            last_run_at: None,
            created_at: "2026-07-01T00:00:00Z".into(),
            updated_at: "2026-07-01T00:00:00Z".into(),
        }
    }

    fn log(id: &str, task_id: &str) -> ExecutionLogSummary {
        ExecutionLogSummary {
            id: id.into(),
            task_id: task_id.into(),
            task_name: task_id.into(),
            scope: ExecutionScope::Task,
            action_id: None,
            started_at: format!("2026-07-01T00:00:0{}Z", if id == "log-1" { 1 } else { 2 }),
            finished_at: "2026-07-01T00:00:03Z".into(),
            status: ExecutionStatus::Success,
            actions: vec![crate::domain::ActionExecutionResult {
                action_id: "action-1".into(),
                action_name: "动作".into(),
                action_type: ActionType::Delay,
                status: ExecutionStatus::Success,
                message: None,
                skip_reason: None,
                started_at: None,
                finished_at: None,
                duration_ms: None,
                exit_code: None,
                stdout: None,
                stderr: None,
            }],
        }
    }
}
