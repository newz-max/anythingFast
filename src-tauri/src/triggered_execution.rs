use crate::diagnostics::dev_log_error;
use crate::domain::{
    ActionType, ExecutionLogSummary, ExecutionScope, ExecutionStatus, RiskAnalysis, RiskLevel,
    TaskExecutionSummary, TaskItem,
};
use crate::executor;
use crate::risk::{action_detail, analyze_task_risk, derive_action_risk};
use crate::storage;
use crate::validation::validate_task_model;
use crate::variables::{self, RuntimeVariableContext};
use chrono::Utc;
use serde::Serialize;
use std::collections::HashMap;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

pub fn execute_unattended_task(
    app: &AppHandle,
    task_id: &str,
) -> Result<TaskExecutionSummary, String> {
    let config = storage::load_config(app).map_err(|err| format!("读取配置失败：{err}"))?;
    let task = config
        .tasks
        .iter()
        .find(|item| item.id == task_id)
        .cloned()
        .ok_or_else(|| format!("事项不存在：{task_id}"))?;

    if !task.enabled {
        let message = "事项已停用".to_string();
        record_blocked_task(app, &task, &message);
        return Err(message);
    }
    if task.actions.is_empty() {
        let message = "事项没有可执行动作".to_string();
        record_blocked_task(app, &task, &message);
        return Err(message);
    }

    let validation = validate_task_model(&task, &config.tasks);
    if !validation.valid {
        let message = validation
            .issues
            .into_iter()
            .map(|issue| issue.message)
            .collect::<Vec<_>>()
            .join("; ");
        record_blocked_task(app, &task, &message);
        return Err(message);
    }

    if task_requires_runtime_input(&task) {
        let message = "该事项需要运行变量输入，请在主窗口中手动运行".to_string();
        record_blocked_task(app, &task, &message);
        return Err(message);
    }

    let runtime_variables = variables::empty_runtime_values();
    let risk = analyze_task_risk_for_unattended(&task, runtime_variables.clone());
    if risk.requires_confirmation {
        let message = "该事项需要二次确认，请在主窗口中手动运行".to_string();
        record_blocked_task(app, &task, &message);
        return Err(message);
    }

    let summary = executor::execute_task(app, &task, &runtime_variables, false)?;
    storage::update_task_run_metadata(app, &summary.task_id, summary.finished_at.clone())
        .map_err(|err| format!("保存执行结果失败：{err}"))?;
    Ok(summary)
}

pub fn record_blocked_task_by_id(app: &AppHandle, task_id: &str, message: &str) {
    match storage::load_config(app) {
        Ok(config) => {
            if let Some(task) = config.tasks.iter().find(|task| task.id == task_id) {
                record_blocked_task(app, task, message);
            } else {
                dev_log_error(
                    "Record blocked task failed",
                    format!("task id not found: {task_id}"),
                );
            }
        }
        Err(err) => dev_log_error("Load config for blocked task failed", &err),
    }
}

pub(crate) fn task_requires_runtime_input(task: &TaskItem) -> bool {
    task.variables.iter().any(|variable| {
        (variable.required || variable.default_value.is_empty())
            && variable.default_value.is_empty()
    })
}

pub(crate) fn analyze_task_risk_for_unattended(
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

    if task
        .actions
        .iter()
        .any(|action| action.enabled && action.action_type == ActionType::RunCommand)
        && task.last_run_at.is_none()
    {
        analysis.requires_confirmation = true;
        if !analysis
            .reasons
            .iter()
            .any(|reason| reason == "首次执行包含命令动作的事项")
        {
            analysis
                .reasons
                .push("首次执行包含命令动作的事项".to_string());
        }
    }

    let high_risk_actions = task
        .actions
        .iter()
        .filter(|action| action.enabled && derive_action_risk(action) == RiskLevel::High)
        .map(|action| crate::domain::RiskActionSummary {
            action_id: action.id.clone(),
            name: action.name.clone().unwrap_or_else(|| "未命名动作".into()),
            action_type: action.action_type.clone(),
            risk_level: RiskLevel::High,
            detail: action_detail(action),
        })
        .collect::<Vec<_>>();
    if !high_risk_actions.is_empty() {
        analysis.high_risk_actions = high_risk_actions;
    }
    analysis
}

fn record_blocked_task(app: &AppHandle, task: &TaskItem, message: &str) {
    let run_id = Uuid::new_v4().to_string();
    let started_at = Utc::now().to_rfc3339();
    let finished_at = started_at.clone();
    emit_event(
        app,
        &run_id,
        task,
        "started",
        None,
        Some("准备执行".to_string()),
    );
    emit_event(
        app,
        &run_id,
        task,
        "action-failed",
        Some(0),
        Some(message.to_string()),
    );
    emit_event(
        app,
        &run_id,
        task,
        "finished",
        None,
        Some(message.to_string()),
    );

    let log = ExecutionLogSummary {
        id: Uuid::new_v4().to_string(),
        task_id: task.id.clone(),
        task_name: task.name.clone(),
        scope: ExecutionScope::Task,
        action_id: None,
        started_at,
        finished_at,
        status: ExecutionStatus::Failed,
        actions: Vec::new(),
    };
    if let Err(err) = storage::append_log(app, log) {
        dev_log_error("Append blocked task execution log failed", &err);
    }
}

fn emit_event(
    app: &AppHandle,
    run_id: &str,
    task: &TaskItem,
    status: &'static str,
    current_index: Option<usize>,
    message: Option<String>,
) {
    if let Err(err) = app.emit(
        "task-execution",
        ExecutionEvent {
            run_id,
            task_id: &task.id,
            task_name: &task.name,
            scope: ExecutionScope::Task,
            status,
            current_index,
            total_actions: task.actions.len(),
            message,
        },
    ) {
        dev_log_error("Emit unattended execution event failed", &err);
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExecutionEvent<'a> {
    run_id: &'a str,
    task_id: &'a str,
    task_name: &'a str,
    scope: ExecutionScope,
    status: &'static str,
    current_index: Option<usize>,
    total_actions: usize,
    message: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::{ActionType, RiskLevel, TaskAction, TaskTrigger, TaskVariable};
    use serde_json::json;

    #[test]
    fn detects_variables_requiring_unattended_input() {
        let task = task_with_variables(vec![TaskVariable {
            key: "projectDir".into(),
            label: "Project".into(),
            default_value: String::new(),
            required: true,
            secret: false,
        }]);

        assert!(task_requires_runtime_input(&task));
    }

    #[test]
    fn allows_unattended_variables_with_defaults() {
        let task = task_with_variables(vec![TaskVariable {
            key: "projectDir".into(),
            label: "Project".into(),
            default_value: "D:\\Project".into(),
            required: true,
            secret: false,
        }]);

        assert!(!task_requires_runtime_input(&task));
    }

    #[test]
    fn command_variable_reference_requires_unattended_confirmation() {
        let mut task = task_with_variables(vec![TaskVariable {
            key: "command".into(),
            label: "Command".into(),
            default_value: "Write-Output ok".into(),
            required: true,
            secret: false,
        }]);
        task.actions = vec![TaskAction {
            id: "action".into(),
            action_type: ActionType::RunCommand,
            name: Some("命令".into()),
            params: json!({
                "command": "{{command}}",
                "workingDir": "D:\\Project",
                "shell": "powershell"
            }),
            enabled: true,
            timeout_ms: None,
            continue_on_error: None,
            output_binding: None,
            condition: None,
            risk_level: RiskLevel::Medium,
        }];
        task.last_run_at = Some("2026-07-01T00:00:00Z".into());

        let risk = analyze_task_risk_for_unattended(&task, HashMap::new());

        assert!(risk.requires_confirmation);
        assert!(
            risk.reasons
                .iter()
                .any(|reason| reason == "命令动作包含变量引用")
        );
    }

    fn task_with_variables(variables: Vec<TaskVariable>) -> TaskItem {
        TaskItem {
            id: "task".into(),
            name: "Task".into(),
            category: None,
            keywords: None,
            description: None,
            variables,
            actions: vec![TaskAction {
                id: "action".into(),
                action_type: ActionType::OpenUrl,
                name: Some("打开".into()),
                params: json!({ "url": "https://example.com" }),
                enabled: true,
                timeout_ms: None,
                continue_on_error: None,
                output_binding: None,
                condition: None,
                risk_level: RiskLevel::Low,
            }],
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
}
