use crate::diagnostics::dev_log_error;
use crate::domain::{
    AppConfig, AppSettings, ExecutionLogSummary, ExportBundleRequest, ImportPreview, PreviewAction,
    RiskAnalysis, RiskLevel, ShortcutStatus, TaskAction, TaskExecutionSummary, TaskExportBundle,
    TaskItem, ValidationResult,
};
use crate::executor;
use crate::import_export;
use crate::risk::{action_detail, analyze_task_risk, derive_action_risk};
use crate::storage;
use crate::validation::{
    normalize_task, validate_action_model, validate_config_model, validate_task_model,
};
use chrono::Utc;
use tauri::AppHandle;

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

    let mut issues = Vec::new();
    issues.extend(validate_config_model(&normalized));
    for task in &normalized.tasks {
        let validation = validate_task_model(task, &original_tasks);
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
pub fn analyze_risk(app: AppHandle, task_id: String) -> Result<RiskAnalysis, String> {
    let config = storage::load_config(&app)
        .map_err(|err| log_command_error("analyze_risk load config failed", err))?;
    let task = config
        .tasks
        .iter()
        .find(|item| item.id == task_id)
        .ok_or_else(|| log_command_error("analyze_risk find task failed", "事项不存在"))?;
    Ok(analyze_task_risk(task))
}

#[tauri::command]
pub fn analyze_action_risk(
    app: AppHandle,
    task_id: String,
    action_id: String,
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

    let action_risk = derive_action_risk(action);
    let mut reasons = Vec::new();
    let mut high_risk_actions = Vec::new();
    if action_risk == RiskLevel::High {
        reasons.push("包含高风险动作".to_string());
        high_risk_actions.push(crate::domain::RiskActionSummary {
            action_id: action.id.clone(),
            name: action.name.clone().unwrap_or_else(|| "未命名动作".into()),
            action_type: action.action_type.clone(),
            risk_level: action_risk,
            detail: action_detail(action),
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
) -> Result<TaskExecutionSummary, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_task_blocking(app, task_id, confirmation_token)
    })
    .await
    .map_err(|err| log_command_error("run_task blocking task failed", err))?
}

fn run_task_blocking(
    app: AppHandle,
    task_id: String,
    confirmation_token: Option<String>,
) -> Result<TaskExecutionSummary, String> {
    let mut config = storage::load_config(&app)
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

    let risk = analyze_task_risk(&task);
    if risk.requires_confirmation && confirmation_token.as_deref() != Some("confirmed") {
        return Err("该事项需要二次确认".into());
    }

    let summary = executor::execute_task(&app, &task)
        .map_err(|err| log_command_error("run_task execute failed", err))?;
    config.tasks[task_index].last_run_at = Some(Utc::now().to_rfc3339());
    config.tasks[task_index].updated_at = Utc::now().to_rfc3339();
    storage::save_config(&app, &config)
        .map_err(|err| log_command_error("run_task save config failed", err))?;
    Ok(summary)
}

#[tauri::command]
pub async fn run_task_action(
    app: AppHandle,
    task_id: String,
    action_id: String,
    confirmation_token: Option<String>,
) -> Result<TaskExecutionSummary, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_task_action_blocking(app, task_id, action_id, confirmation_token)
    })
    .await
    .map_err(|err| log_command_error("run_task_action blocking task failed", err))?
}

fn run_task_action_blocking(
    app: AppHandle,
    task_id: String,
    action_id: String,
    confirmation_token: Option<String>,
) -> Result<TaskExecutionSummary, String> {
    let mut config = storage::load_config(&app)
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

    let risk = analyze_action_risk(app.clone(), task_id.clone(), action_id.clone())?;
    if risk.requires_confirmation && confirmation_token.as_deref() != Some("confirmed") {
        return Err("该动作需要二次确认".into());
    }

    let summary = executor::execute_task_action(&app, &task, &action)
        .map_err(|err| log_command_error("run_task_action execute failed", err))?;
    let finished_at = summary.finished_at.clone();
    config.tasks[task_index].last_run_at = Some(finished_at.clone());
    config.tasks[task_index].updated_at = finished_at;
    storage::save_config(&app, &config)
        .map_err(|err| log_command_error("run_task_action save config failed", err))?;
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
    let next_config = import_export::confirm_import(&bundle_json, &config)
        .map_err(|err| log_command_error("confirm_import_bundle process failed", err))?;
    crate::refresh_task_shortcuts(&app, &next_config)
        .map_err(|err| log_command_error("confirm_import_bundle refresh shortcuts failed", err))?;
    storage::save_config(&app, &next_config)
        .map_err(|err| log_command_error("confirm_import_bundle save failed", err))?;
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
pub fn create_task_from_template(template: crate::domain::TaskTemplate) -> TaskItem {
    import_export::template_to_task(&template)
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
