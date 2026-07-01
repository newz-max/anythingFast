use crate::domain::{
    AppConfig, AppSettings, ExecutionLogSummary, PreviewAction, RiskAnalysis, RiskLevel, TaskAction, TaskExecutionSummary, TaskItem,
    ValidationResult,
};
use crate::executor;
use crate::risk::{action_detail, analyze_task_risk, derive_action_risk};
use crate::storage;
use crate::validation::{normalize_task, validate_action_model, validate_config_model, validate_task_model};
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
    normalized.tags = normalized
        .tags
        .into_iter()
        .map(|mut tag| {
            tag.name = tag.name.trim().to_string();
            tag
        })
        .collect();
    normalized.tasks = normalized.tasks.into_iter().map(normalize_task).collect();

    let mut issues = Vec::new();
    issues.extend(validate_config_model(&normalized));
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

    crate::refresh_task_shortcuts(&app, &normalized)?;
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
pub fn analyze_action_risk(app: AppHandle, task_id: String, action_id: String) -> Result<RiskAnalysis, String> {
    let config = storage::load_config(&app).map_err(|err| err.to_string())?;
    let task = config
        .tasks
        .iter()
        .find(|item| item.id == task_id)
        .ok_or_else(|| "事项不存在".to_string())?;
    let action = task
        .actions
        .iter()
        .find(|item| item.id == action_id)
        .ok_or_else(|| "动作不存在".to_string())?;

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
pub fn run_task_action(
    app: AppHandle,
    task_id: String,
    action_id: String,
    confirmation_token: Option<String>,
) -> Result<TaskExecutionSummary, String> {
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

    let action = task
        .actions
        .iter()
        .find(|item| item.id == action_id)
        .cloned()
        .ok_or_else(|| "动作不存在".to_string())?;

    if !action.enabled {
        return Err("动作已停用".into());
    }

    let validation = validate_action_model(&action);
    if !validation.valid {
        return Err(validation
            .issues
            .into_iter()
            .map(|issue| issue.message)
            .collect::<Vec<_>>()
            .join("; "));
    }

    let risk = analyze_action_risk(app.clone(), task_id.clone(), action_id.clone())?;
    if risk.requires_confirmation && confirmation_token.as_deref() != Some("confirmed") {
        return Err("该动作需要二次确认".into());
    }

    let summary = executor::execute_task_action(&app, &task, &action)?;
    let finished_at = summary.finished_at.clone();
    config.tasks[task_index].last_run_at = Some(finished_at.clone());
    config.tasks[task_index].updated_at = finished_at;
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
