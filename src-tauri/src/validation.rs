use crate::domain::{ActionType, FieldIssue, RiskLevel, TaskAction, TaskItem, ValidationResult};
use crate::risk::{derive_action_risk, derive_task_risk};
use std::path::Path;

pub fn validate_task_model(task: &TaskItem, all_tasks: &[TaskItem]) -> ValidationResult {
    let mut issues = Vec::new();

    if task.name.trim().is_empty() {
        issues.push(issue("name", "事项名称不能为空"));
    }

    if all_tasks
        .iter()
        .any(|item| item.id != task.id && item.name.trim() == task.name.trim())
    {
        issues.push(issue("name", "事项名称建议保持唯一"));
    }

    if task.actions.is_empty() {
        issues.push(issue("actions", "至少需要一个动作"));
    }

    for (index, action) in task.actions.iter().enumerate() {
        for action_issue in validate_action_model(action).issues {
            issues.push(issue(
                &format!("actions.{index}.{}", action_issue.field),
                &action_issue.message,
            ));
        }
    }

    ValidationResult {
        valid: issues.is_empty(),
        issues,
        risk_level: Some(derive_task_risk(task)),
    }
}

pub fn validate_action_model(action: &TaskAction) -> ValidationResult {
    let mut issues = Vec::new();

    if matches!(action.timeout_ms, Some(0)) {
        issues.push(issue("timeoutMs", "超时时间必须大于 0"));
    }

    match action.action_type {
        ActionType::OpenProgram => {
            let path = string_param(action, "path");
            if path.trim().is_empty() {
                issues.push(issue("path", "程序路径不能为空"));
            } else if !Path::new(path).exists() {
                issues.push(issue("path", "程序路径不存在"));
            }
        }
        ActionType::OpenUrl => {
            let url = string_param(action, "url");
            if !(url.starts_with("http://") || url.starts_with("https://")) {
                issues.push(issue("url", "URL 必须是 http 或 https 地址"));
            }
        }
        ActionType::OpenFile => {
            let path = string_param(action, "path");
            if path.trim().is_empty() {
                issues.push(issue("path", "文件路径不能为空"));
            } else if !Path::new(path).is_file() {
                issues.push(issue("path", "文件不存在"));
            }
        }
        ActionType::OpenFolder => {
            let path = string_param(action, "path");
            if path.trim().is_empty() {
                issues.push(issue("path", "文件夹路径不能为空"));
            } else if !Path::new(path).is_dir() {
                issues.push(issue("path", "文件夹不存在"));
            }
        }
        ActionType::RunCommand => {
            if string_param(action, "command").trim().is_empty() {
                issues.push(issue("command", "命令内容不能为空"));
            }
            let working_dir = string_param(action, "workingDir");
            if working_dir.trim().is_empty() {
                issues.push(issue("workingDir", "工作目录不能为空"));
            } else if !Path::new(working_dir).is_dir() {
                issues.push(issue("workingDir", "工作目录不存在"));
            }
            let shell = string_param(action, "shell");
            if shell != "powershell" && shell != "cmd" {
                issues.push(issue("shell", "Shell 必须是 powershell 或 cmd"));
            }
        }
        ActionType::Delay => {
            if action
                .params
                .get("durationMs")
                .and_then(|value| value.as_u64())
                .unwrap_or(0)
                == 0
            {
                issues.push(issue("durationMs", "等待时长必须大于 0"));
            }
        }
    }

    ValidationResult {
        valid: issues.is_empty(),
        issues,
        risk_level: Some(derive_action_risk(action)),
    }
}

pub fn normalize_task(mut task: TaskItem) -> TaskItem {
    task.category = Some(task.category.unwrap_or_else(|| "未分类".into()).trim().to_string());
    task.risk_level = derive_task_risk(&task);
    task.actions = task
        .actions
        .into_iter()
        .map(|mut action| {
            action.risk_level = derive_action_risk(&action);
            action
        })
        .collect();
    task
}

fn string_param<'a>(action: &'a TaskAction, key: &str) -> &'a str {
    action.params.get(key).and_then(|value| value.as_str()).unwrap_or_default()
}

fn issue(field: &str, message: &str) -> FieldIssue {
    FieldIssue {
        field: field.to_string(),
        message: message.to_string(),
    }
}

#[allow(dead_code)]
fn _risk_level_used(_: RiskLevel) {}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn rejects_empty_task_name() {
        let task = TaskItem {
            id: "task".into(),
            name: "".into(),
            category: None,
            keywords: None,
            description: None,
            actions: Vec::new(),
            risk_level: RiskLevel::Low,
            enabled: true,
            last_run_at: None,
            created_at: "2026-07-01T00:00:00Z".into(),
            updated_at: "2026-07-01T00:00:00Z".into(),
        };

        let result = validate_task_model(&task, &[]);
        assert!(!result.valid);
        assert_eq!(result.issues.len(), 2);
    }

    #[test]
    fn validates_url_scheme() {
        let action = TaskAction {
            id: "a".into(),
            action_type: ActionType::OpenUrl,
            name: None,
            params: json!({ "url": "ftp://example.com" }),
            enabled: true,
            timeout_ms: None,
            continue_on_error: None,
            risk_level: RiskLevel::Low,
        };

        assert!(!validate_action_model(&action).valid);
    }
}
