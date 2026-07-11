use crate::diagnostics::dev_log_error;
use crate::context::ClipboardContextSnapshot;
use crate::domain::{
    AppConfig, AppSettings, ExecutionLogSummary, ExportBundleRequest, ImportPreview,
    KeybindingOverride, KeybindingsLoadResult, PathInspection, PathInspectionKind, PreviewAction,
    RiskAnalysis, RiskLevel, ShortcutStatus, TaskAction, TaskExecutionSummary, TaskExportBundle,
    TaskItem, UpdateProxyResolution, ValidationResult,
};
use crate::executor;
use crate::import_export;
use crate::risk::{action_detail, analyze_task_risk, derive_action_risk, normalize_config_risk};
use crate::storage;
use crate::validation::{
    normalize_task, validate_action_model, validate_config_model, validate_task_model,
    validate_template_model,
};
use crate::variables::{self, RuntimeVariableContext};
use std::collections::HashMap;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

#[tauri::command]
pub fn load_config(app: AppHandle) -> Result<AppConfig, String> {
    storage::load_config(&app).map_err(|err| log_command_error("load_config failed", err))
}

#[tauri::command]
pub fn save_config(app: AppHandle, config: AppConfig) -> Result<AppConfig, String> {
    let mut normalized = config;
    let original_tasks = normalized.tasks.clone();
    normalized.tags = normalized
        .tags
        .into_iter()
        .map(|mut tag| {
            tag.name = tag.name.trim().to_string();
            tag
        })
        .collect();
    normalized.tasks = normalized.tasks.into_iter().map(normalize_task).collect();
    normalized.templates = normalized
        .templates
        .into_iter()
        .map(import_export::normalize_template)
        .collect();
    normalized = normalize_config_risk(normalized);

    let mut issues = Vec::new();
    issues.extend(validate_config_model(&normalized));
    for task in &normalized.tasks {
        let validation = validate_task_model(task, &original_tasks);
        if !validation.valid {
            issues.extend(validation.issues);
        }
    }
    for template in &normalized.templates {
        let validation = validate_template_model(template);
        if !validation.valid {
            issues.extend(validation.issues);
        }
    }
    if !issues.is_empty() {
        let message = issues
            .into_iter()
            .map(|issue| format!("{}: {}", issue.field, issue.message))
            .collect::<Vec<_>>()
            .join("; ");
        dev_log_error("save_config validation failed", &message);
        return Err(message);
    }

    crate::refresh_task_shortcuts(&app, &normalized)
        .map_err(|err| log_command_error("save_config refresh shortcuts failed", err))?;
    storage::save_config(&app, &normalized)
        .map_err(|err| log_command_error("save_config storage write failed", err))?;
    crate::scheduler::refresh_scheduled_triggers(&app, &normalized)
        .map_err(|err| log_command_error("save_config refresh schedules failed", err))?;
    crate::emit_config_updated(&app, crate::CONFIG_UPDATED_SAVE_CONFIG);
    storage::load_config(&app).map_err(|err| log_command_error("save_config reload failed", err))
}

#[tauri::command]
pub fn validate_task(task: TaskItem) -> ValidationResult {
    validate_task_model(&task, &[])
}

#[tauri::command]
pub fn validate_action(action: TaskAction) -> ValidationResult {
    validate_action_model(&action)
}

#[tauri::command]
pub fn analyze_risk(
    app: AppHandle,
    task_id: String,
    runtime_variables: Option<HashMap<String, String>>,
) -> Result<RiskAnalysis, String> {
    let config = storage::load_config(&app)
        .map_err(|err| log_command_error("analyze_risk load config failed", err))?;
    let task = config
        .tasks
        .iter()
        .find(|item| item.id == task_id)
        .ok_or_else(|| log_command_error("analyze_risk find task failed", "事项不存在"))?;
    Ok(analyze_task_risk_for_runtime(
        task,
        runtime_variables.unwrap_or_default(),
    ))
}

#[tauri::command]
pub fn analyze_action_risk(
    app: AppHandle,
    task_id: String,
    action_id: String,
    runtime_variables: Option<HashMap<String, String>>,
) -> Result<RiskAnalysis, String> {
    let config = storage::load_config(&app)
        .map_err(|err| log_command_error("analyze_action_risk load config failed", err))?;
    let task = config
        .tasks
        .iter()
        .find(|item| item.id == task_id)
        .ok_or_else(|| log_command_error("analyze_action_risk find task failed", "事项不存在"))?;
    let action = task
        .actions
        .iter()
        .find(|item| item.id == action_id)
        .ok_or_else(|| log_command_error("analyze_action_risk find action failed", "动作不存在"))?;

    let runtime_variables = runtime_variables.unwrap_or_default();
    let resolved_action = RuntimeVariableContext::from_task(task, &runtime_variables)
        .and_then(|context| variables::resolve_action(action, &context))
        .unwrap_or_else(|_| action.clone());
    let action_risk = derive_action_risk(&resolved_action);
    let mut reasons = Vec::new();
    let mut high_risk_actions = Vec::new();
    if action_risk == RiskLevel::High {
        reasons.push("包含高风险动作".to_string());
        high_risk_actions.push(crate::domain::RiskActionSummary {
            action_id: action.id.clone(),
            name: action.name.clone().unwrap_or_else(|| "未命名动作".into()),
            action_type: action.action_type.clone(),
            risk_level: action_risk,
            detail: action_detail(&resolved_action),
        });
    }
    if action.action_type == crate::domain::ActionType::RunCommand && task.last_run_at.is_none() {
        reasons.push("首次执行包含命令动作的事项".to_string());
    }

    Ok(RiskAnalysis {
        task_id: task.id.clone(),
        requires_confirmation: !reasons.is_empty(),
        reasons,
        high_risk_actions,
    })
}

#[tauri::command]
pub async fn run_task(
    app: AppHandle,
    task_id: String,
    confirmation_token: Option<String>,
    runtime_variables: Option<HashMap<String, String>>,
) -> Result<TaskExecutionSummary, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_task_blocking(
            app,
            task_id,
            confirmation_token,
            runtime_variables.unwrap_or_default(),
        )
    })
    .await
    .map_err(|err| log_command_error("run_task blocking task failed", err))?
}

fn run_task_blocking(
    app: AppHandle,
    task_id: String,
    confirmation_token: Option<String>,
    runtime_variables: HashMap<String, String>,
) -> Result<TaskExecutionSummary, String> {
    let config = storage::load_config(&app)
        .map_err(|err| log_command_error("run_task load config failed", err))?;
    let task_index = config
        .tasks
        .iter()
        .position(|item| item.id == task_id)
        .ok_or_else(|| log_command_error("run_task find task failed", "事项不存在"))?;
    let task = config.tasks[task_index].clone();

    if !task.enabled {
        return Err("事项已停用".into());
    }
    if task.actions.is_empty() {
        return Err("事项没有可执行动作".into());
    }

    let validation = validate_task_model(&task, &config.tasks);
    if !validation.valid {
        let message = validation
            .issues
            .into_iter()
            .map(|issue| issue.message)
            .collect::<Vec<_>>()
            .join("; ");
        dev_log_error("run_task validation failed", &message);
        return Err(message);
    }

    let risk = analyze_task_risk_for_runtime(&task, runtime_variables.clone());
    if risk.requires_confirmation && confirmation_token.as_deref() != Some("confirmed") {
        return Err("该事项需要二次确认".into());
    }

    let summary = executor::execute_task(
        &app,
        &task,
        &runtime_variables,
        confirmation_token.as_deref() == Some("confirmed"),
    )
    .map_err(|err| log_command_error("run_task execute failed", err))?;
    storage::update_task_run_metadata(&app, &summary.task_id, summary.finished_at.clone())
        .map_err(|err| log_command_error("run_task save run metadata failed", err))?;
    crate::emit_config_updated(&app, crate::CONFIG_UPDATED_RUN_METADATA);
    Ok(summary)
}

#[tauri::command]
pub async fn run_task_action(
    app: AppHandle,
    task_id: String,
    action_id: String,
    confirmation_token: Option<String>,
    runtime_variables: Option<HashMap<String, String>>,
) -> Result<TaskExecutionSummary, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_task_action_blocking(
            app,
            task_id,
            action_id,
            confirmation_token,
            runtime_variables.unwrap_or_default(),
        )
    })
    .await
    .map_err(|err| log_command_error("run_task_action blocking task failed", err))?
}

fn run_task_action_blocking(
    app: AppHandle,
    task_id: String,
    action_id: String,
    confirmation_token: Option<String>,
    runtime_variables: HashMap<String, String>,
) -> Result<TaskExecutionSummary, String> {
    let config = storage::load_config(&app)
        .map_err(|err| log_command_error("run_task_action load config failed", err))?;
    let task_index = config
        .tasks
        .iter()
        .position(|item| item.id == task_id)
        .ok_or_else(|| log_command_error("run_task_action find task failed", "事项不存在"))?;
    let task = config.tasks[task_index].clone();

    if !task.enabled {
        return Err("事项已停用".into());
    }

    let action = task
        .actions
        .iter()
        .find(|item| item.id == action_id)
        .cloned()
        .ok_or_else(|| log_command_error("run_task_action find action failed", "动作不存在"))?;

    if !action.enabled {
        return Err("动作已停用".into());
    }

    let validation = validate_action_model(&action);
    if !validation.valid {
        let message = validation
            .issues
            .into_iter()
            .map(|issue| issue.message)
            .collect::<Vec<_>>()
            .join("; ");
        dev_log_error("run_task_action validation failed", &message);
        return Err(message);
    }

    let risk = analyze_action_risk(
        app.clone(),
        task_id.clone(),
        action_id.clone(),
        Some(runtime_variables.clone()),
    )?;
    if risk.requires_confirmation && confirmation_token.as_deref() != Some("confirmed") {
        return Err("该动作需要二次确认".into());
    }

    let summary = executor::execute_task_action(
        &app,
        &task,
        &action,
        &runtime_variables,
        confirmation_token.as_deref() == Some("confirmed"),
    )
    .map_err(|err| log_command_error("run_task_action execute failed", err))?;
    storage::update_task_run_metadata(&app, &summary.task_id, summary.finished_at.clone())
        .map_err(|err| log_command_error("run_task_action save run metadata failed", err))?;
    crate::emit_config_updated(&app, crate::CONFIG_UPDATED_RUN_METADATA);
    Ok(summary)
}

#[tauri::command]
pub fn preview_action(action: TaskAction) -> PreviewAction {
    let risk_level = derive_action_risk(&action);
    PreviewAction {
        label: action.name.clone().unwrap_or_else(|| "未命名动作".into()),
        detail: action_detail(&action),
        risk_level,
    }
}

#[tauri::command]
pub fn export_task_bundle(
    app: AppHandle,
    request: ExportBundleRequest,
) -> Result<TaskExportBundle, String> {
    let config = storage::load_config(&app)
        .map_err(|err| log_command_error("export_task_bundle load config failed", err))?;
    import_export::create_export_bundle(&config, request)
        .map_err(|err| log_command_error("export_task_bundle create bundle failed", err))
}

#[tauri::command]
pub fn save_task_bundle_file(
    app: AppHandle,
    request: ExportBundleRequest,
    path: String,
) -> Result<TaskExportBundle, String> {
    let config = storage::load_config(&app)
        .map_err(|err| log_command_error("save_task_bundle_file load config failed", err))?;
    let bundle = import_export::create_export_bundle(&config, request)
        .map_err(|err| log_command_error("save_task_bundle_file create bundle failed", err))?;
    import_export::write_bundle_file(&path, &bundle)
        .map_err(|err| log_command_error("save_task_bundle_file write failed", err))?;
    Ok(bundle)
}

#[tauri::command]
pub fn preview_import_bundle(app: AppHandle, bundle_json: String) -> Result<ImportPreview, String> {
    let config = storage::load_config(&app)
        .map_err(|err| log_command_error("preview_import_bundle load config failed", err))?;
    import_export::process_import(&bundle_json, &config)
        .map(|processed| processed.preview)
        .map_err(|err| log_command_error("preview_import_bundle process failed", err))
}

#[tauri::command]
pub fn preview_import_bundle_file(app: AppHandle, path: String) -> Result<ImportPreview, String> {
    let content = import_export::read_bundle_file(&path)
        .map_err(|err| log_command_error("preview_import_bundle_file read failed", err))?;
    preview_import_bundle(app, content)
}

#[tauri::command]
pub fn confirm_import_bundle(app: AppHandle, bundle_json: String) -> Result<AppConfig, String> {
    let config = storage::load_config(&app)
        .map_err(|err| log_command_error("confirm_import_bundle load config failed", err))?;
    let next_config = normalize_config_risk(
        import_export::confirm_import(&bundle_json, &config)
            .map_err(|err| log_command_error("confirm_import_bundle process failed", err))?,
    );
    crate::refresh_task_shortcuts(&app, &next_config)
        .map_err(|err| log_command_error("confirm_import_bundle refresh shortcuts failed", err))?;
    storage::save_config(&app, &next_config)
        .map_err(|err| log_command_error("confirm_import_bundle save failed", err))?;
    crate::scheduler::refresh_scheduled_triggers(&app, &next_config)
        .map_err(|err| log_command_error("confirm_import_bundle refresh schedules failed", err))?;
    crate::emit_config_updated(&app, crate::CONFIG_UPDATED_IMPORT_CONFIG);
    storage::load_config(&app)
        .map_err(|err| log_command_error("confirm_import_bundle reload failed", err))
}

#[tauri::command]
pub fn confirm_import_bundle_file(app: AppHandle, path: String) -> Result<AppConfig, String> {
    let content = import_export::read_bundle_file(&path)
        .map_err(|err| log_command_error("confirm_import_bundle_file read failed", err))?;
    confirm_import_bundle(app, content)
}

#[tauri::command]
pub fn open_main_window_create_task(app: AppHandle) -> Result<(), String> {
    crate::request_main_window_create_task(&app)
}

#[tauri::command]
pub fn get_clipboard_context() -> ClipboardContextSnapshot {
    crate::context::get_clipboard_context()
}

#[tauri::command]
pub fn inspect_path_input(input: String) -> Result<PathInspection, String> {
    inspect_path_input_value(input)
}

#[tauri::command]
pub fn get_default_working_dir() -> Result<String, String> {
    default_working_dir()
        .map(|path| path.to_string_lossy().to_string())
        .map_err(|err| log_command_error("get_default_working_dir failed", err))
}

#[tauri::command]
pub fn load_execution_logs(
    app: AppHandle,
    limit: usize,
) -> Result<Vec<ExecutionLogSummary>, String> {
    storage::load_logs(&app, limit)
        .map_err(|err| log_command_error("load_execution_logs failed", err))
}

#[tauri::command]
pub fn load_shortcut_status(app: AppHandle) -> ShortcutStatus {
    crate::shortcut_status(&app)
}

#[tauri::command]
pub fn load_keybindings(app: AppHandle) -> Result<KeybindingsLoadResult, String> {
    storage::load_keybindings(&app).map_err(|err| log_command_error("load_keybindings failed", err))
}

#[tauri::command]
pub fn save_keybindings(
    app: AppHandle,
    overrides: Vec<KeybindingOverride>,
) -> Result<KeybindingsLoadResult, String> {
    storage::save_keybindings(&app, &overrides)
        .map_err(|err| log_command_error("save_keybindings failed", err))
}

#[tauri::command]
pub fn reset_keybindings(app: AppHandle) -> Result<KeybindingsLoadResult, String> {
    storage::reset_keybindings(&app)
        .map_err(|err| log_command_error("reset_keybindings failed", err))
}

#[tauri::command]
pub fn open_keybindings_file(app: AppHandle) -> Result<(), String> {
    let path = storage::ensure_keybindings_file(&app)
        .map_err(|err| log_command_error("open_keybindings_file ensure file failed", err))?;
    app.opener()
        .open_path(path.to_string_lossy().to_string(), None::<&str>)
        .map_err(|err| log_command_error("open_keybindings_file opener failed", err))
}

#[tauri::command]
pub fn resolve_update_proxy() -> UpdateProxyResolution {
    crate::updater_proxy::resolve_update_proxy()
}

#[tauri::command]
pub fn update_settings(app: AppHandle, settings: AppSettings) -> Result<AppConfig, String> {
    let mut config = storage::load_config(&app)
        .map_err(|err| log_command_error("update_settings load config failed", err))?;
    let shortcut = settings.global_shortcut.trim().to_string();
    if shortcut.is_empty() {
        return Err("全局快捷键不能为空".to_string());
    }
    config.settings = settings;
    let issues = validate_config_model(&config);
    if !issues.is_empty() {
        let message = issues
            .into_iter()
            .map(|issue| format!("{}: {}", issue.field, issue.message))
            .collect::<Vec<_>>()
            .join("; ");
        dev_log_error("update_settings validation failed", &message);
        return Err(message);
    }
    crate::register_global_shortcut(&app, &shortcut)
        .map_err(|err| log_command_error("update_settings register shortcut failed", err))?;
    storage::save_config(&app, &config)
        .map_err(|err| log_command_error("update_settings save config failed", err))?;
    crate::emit_config_updated(&app, crate::CONFIG_UPDATED_UPDATE_SETTINGS);
    storage::load_config(&app)
        .map_err(|err| log_command_error("update_settings reload failed", err))
}

#[allow(dead_code)]
fn _risk_level_used(_: RiskLevel) {}

fn log_command_error(context: &str, error: impl ToString) -> String {
    let message = error.to_string();
    dev_log_error(context, &message);
    message
}

fn inspect_path_input_value(input: String) -> Result<PathInspection, String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err(log_command_error("inspect_path_input failed", "路径不能为空"));
    }

    let path = PathBuf::from(trimmed);
    match std::fs::metadata(&path) {
        Ok(metadata) => {
            let kind = if metadata.is_file() {
                PathInspectionKind::File
            } else if metadata.is_dir() {
                PathInspectionKind::Folder
            } else {
                PathInspectionKind::Unknown
            };
            let normalized_path = path
                .canonicalize()
                .unwrap_or_else(|_| path.clone())
                .to_string_lossy()
                .to_string();
            let message = if kind == PathInspectionKind::Unknown {
                Some("路径存在，但不是普通文件或文件夹".to_string())
            } else {
                None
            };
            Ok(PathInspection {
                input: trimmed.to_string(),
                exists: true,
                kind,
                normalized_path,
                message,
            })
        }
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(PathInspection {
            input: trimmed.to_string(),
            exists: false,
            kind: PathInspectionKind::Unknown,
            normalized_path: trimmed.to_string(),
            message: Some("路径不存在".to_string()),
        }),
        Err(err) => Err(log_command_error("inspect_path_input metadata failed", err)),
    }
}

fn default_working_dir() -> Result<PathBuf, std::io::Error> {
    if let Some(home) = home_dir() {
        if home.is_dir() {
            return Ok(home);
        }
    }
    std::env::current_dir()
}

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE")
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .or_else(|| {
            let drive = std::env::var_os("HOMEDRIVE")?;
            let path = std::env::var_os("HOMEPATH")?;
            let mut home = PathBuf::from(drive);
            home.push(path);
            Some(home)
        })
        .or_else(|| std::env::var_os("HOME").filter(|value| !value.is_empty()).map(PathBuf::from))
}

fn analyze_task_risk_for_runtime(
    task: &TaskItem,
    runtime_variables: HashMap<String, String>,
) -> RiskAnalysis {
    let resolved_task = RuntimeVariableContext::from_task(task, &runtime_variables)
        .ok()
        .map(|context| {
            let mut resolved = task.clone();
            resolved.actions = task
                .actions
                .iter()
                .map(|action| {
                    variables::resolve_action(action, &context).unwrap_or_else(|_| action.clone())
                })
                .collect();
            resolved
        });
    let mut analysis = analyze_task_risk(resolved_task.as_ref().unwrap_or(task));

    let has_command_reference = task
        .actions
        .iter()
        .any(|action| action.enabled && variables::command_has_variable_reference(action));
    if has_command_reference {
        analysis.requires_confirmation = true;
        if !analysis
            .reasons
            .iter()
            .any(|reason| reason == "命令动作包含变量引用")
        {
            analysis.reasons.push("命令动作包含变量引用".to_string());
        }
    }
    analysis
}

#[cfg(test)]
mod command_tests {
    use super::*;
    use std::fs;

    #[test]
    fn inspect_path_input_reports_file() {
        let dir = std::env::temp_dir().join(format!("anything-fast-test-{}", uuid()));
        fs::create_dir_all(&dir).expect("create temp dir");
        let file = dir.join("sample.txt");
        fs::write(&file, "sample").expect("write temp file");

        let inspection = inspect_path_input_value(file.to_string_lossy().to_string()).expect("inspect file");

        assert!(inspection.exists);
        assert_eq!(inspection.kind, PathInspectionKind::File);
        assert!(inspection.normalized_path.ends_with("sample.txt"));

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn inspect_path_input_reports_folder() {
        let dir = std::env::temp_dir().join(format!("anything-fast-test-{}", uuid()));
        fs::create_dir_all(&dir).expect("create temp dir");

        let inspection = inspect_path_input_value(dir.to_string_lossy().to_string()).expect("inspect folder");

        assert!(inspection.exists);
        assert_eq!(inspection.kind, PathInspectionKind::Folder);

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn inspect_path_input_reports_missing_path() {
        let missing = std::env::temp_dir().join(format!("anything-fast-missing-{}", uuid()));

        let inspection = inspect_path_input_value(missing.to_string_lossy().to_string()).expect("inspect missing");

        assert!(!inspection.exists);
        assert_eq!(inspection.kind, PathInspectionKind::Unknown);
        assert_eq!(inspection.message.as_deref(), Some("路径不存在"));
    }

    #[test]
    fn inspect_path_input_rejects_empty_input() {
        let result = inspect_path_input_value("  ".to_string());

        assert!(result.is_err());
    }

    #[test]
    fn default_working_dir_returns_existing_folder() {
        let dir = default_working_dir().expect("default working dir");

        assert!(dir.is_dir());
    }

    fn uuid() -> String {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system time")
            .as_nanos()
            .to_string()
    }
}
