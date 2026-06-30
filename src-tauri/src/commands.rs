use crate::domain::{
    AppConfig, AppSettings, ExecutionLogSummary, PreviewAction, RiskAnalysis, RiskLevel, TaskAction, TaskExecutionSummary, TaskItem,
    ValidationResult,
};
use crate::executor;
use crate::risk::{action_detail, analyze_task_risk, derive_action_risk};
use crate::storage;
use crate::validation::{normalize_task, validate_action_model, validate_task_model};
use chrono::Utc;
use tauri::AppHandle;

#[tauri::command]
pub fn load_config(app: AppHandle) -> Result<AppConfig, String> {
    storage::load_config(&app).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn save_config(app: AppHandle, config: AppConfig) -> Result<AppConfig, String> {
    let mut normalized = config;
    let original_tasks = normalized.tasks.clone();
    normalized.tasks = normalized.tasks.into_iter().map(normalize_task).collect();

    let mut issues = Vec::new();
    for task in &normalized.tasks {
        let validation = validate_task_model(task, &original_tasks);
        if !validation.valid {
            issues.extend(validation.issues);
        }
    }
    if !issues.is_empty() {
        return Err(issues
            .into_iter()
            .map(|issue| format!("{}: {}", issue.field, issue.message))
            .collect::<Vec<_>>()
            .join("; "));
    }

    storage::save_config(&app, &normalized).map_err(|err| err.to_string())?;
    storage::load_config(&app).map_err(|err| err.to_string())
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
    let config = storage::load_config(&app).map_err(|err| err.to_string())?;
    let task = config
        .tasks
        .iter()
        .find(|item| item.id == task_id)
        .ok_or_else(|| "事项不存在".to_string())?;
    Ok(analyze_task_risk(task))
}

#[tauri::command]
pub fn run_task(app: AppHandle, task_id: String, confirmation_token: Option<String>) -> Result<TaskExecutionSummary, String> {
    let mut config = storage::load_config(&app).map_err(|err| err.to_string())?;
    let task_index = config
        .tasks
        .iter()
        .position(|item| item.id == task_id)
        .ok_or_else(|| "事项不存在".to_string())?;
    let task = config.tasks[task_index].clone();

    if !task.enabled {
        return Err("事项已停用".into());
    }
    if task.actions.is_empty() {
        return Err("事项没有可执行动作".into());
    }

    let validation = validate_task_model(&task, &config.tasks);
    if !validation.valid {
        return Err(validation
            .issues
            .into_iter()
            .map(|issue| issue.message)
            .collect::<Vec<_>>()
            .join("; "));
    }

    let risk = analyze_task_risk(&task);
    if risk.requires_confirmation && confirmation_token.as_deref() != Some("confirmed") {
        return Err("该事项需要二次确认".into());
    }

    let summary = executor::execute_task(&app, &task)?;
    config.tasks[task_index].last_run_at = Some(Utc::now().to_rfc3339());
    config.tasks[task_index].updated_at = Utc::now().to_rfc3339();
    storage::save_config(&app, &config).map_err(|err| err.to_string())?;
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
pub fn load_execution_logs(app: AppHandle, limit: usize) -> Result<Vec<ExecutionLogSummary>, String> {
    storage::load_logs(&app, limit).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn update_settings(app: AppHandle, settings: AppSettings) -> Result<AppConfig, String> {
    let mut config = storage::load_config(&app).map_err(|err| err.to_string())?;
    config.settings = settings;
    storage::save_config(&app, &config).map_err(|err| err.to_string())?;
    storage::load_config(&app).map_err(|err| err.to_string())
}

#[allow(dead_code)]
fn _risk_level_used(_: RiskLevel) {}
