use crate::domain::{
    ActionType, AppConfig, FieldIssue, RiskLevel, TaskAction, TaskItem, TaskTrigger,
    ValidationResult,
};
use crate::risk::{derive_action_risk, derive_task_risk};
use std::collections::HashSet;
use std::path::Path;

pub fn validate_config_model(config: &AppConfig) -> Vec<FieldIssue> {
    let mut issues = Vec::new();
    let mut tag_names = HashSet::new();
    let mut tag_ids = HashSet::new();
    let mut shortcuts = HashSet::new();

    for tag in &config.tags {
        if tag.name.trim().is_empty() {
            issues.push(issue("tags", "标签名称不能为空"));
        }
        if !tag_names.insert(tag.name.trim().to_string()) {
            issues.push(issue("tags", "标签名称不能重复"));
        }
        tag_ids.insert(tag.id.as_str());
    }

    for task in &config.tasks {
        for tag_id in &task.tag_ids {
            if !tag_ids.contains(tag_id.as_str()) {
                issues.push(issue("tagIds", "事项引用了不存在的标签"));
            }
        }

        for trigger in &task.triggers {
            if let TaskTrigger::Shortcut { enabled, shortcut } = trigger {
                let normalized = normalize_shortcut(shortcut);
                if *enabled && normalized.is_empty() {
                    issues.push(issue("triggers", "快捷键不能为空"));
                }
                if *enabled && normalized == normalize_shortcut(&config.settings.global_shortcut) {
                    issues.push(issue("triggers", "事项快捷键不能与全局快捷键冲突"));
                }
                if *enabled && !is_supported_shortcut(shortcut) {
                    issues.push(issue("triggers", "快捷键格式无效"));
                }
                if *enabled && !shortcuts.insert(normalized) {
                    issues.push(issue("triggers", "事项快捷键不能重复"));
                }
            }
        }
    }

    issues
}

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
            let source = command_source(action);
            if source == "script" {
                let script_path = string_param(action, "scriptPath");
                if script_path.trim().is_empty() {
                    issues.push(issue("scriptPath", "脚本文件不能为空"));
                } else if !Path::new(script_path).is_file() {
                    issues.push(issue("scriptPath", "脚本文件不存在"));
                } else if !is_supported_script_path(script_path) {
                    issues.push(issue("scriptPath", "脚本文件必须是 ps1、cmd 或 bat"));
                }
            } else if string_param(action, "command").trim().is_empty() {
                issues.push(issue("command", "命令内容不能为空"));
            }
            let working_dir = string_param(action, "workingDir");
            if working_dir.trim().is_empty() {
                issues.push(issue("workingDir", "工作目录不能为空"));
            } else if !Path::new(working_dir).is_dir() {
                issues.push(issue("workingDir", "工作目录不存在"));
            }
            if source != "script" {
                let shell = string_param(action, "shell");
                if shell != "powershell" && shell != "cmd" {
                    issues.push(issue("shell", "Shell 必须是 powershell 或 cmd"));
                }
            }
        }
        ActionType::Delay => {
            if let Some(duration) = action.params.get("durationMs") {
                if !duration.is_null() {
                    match duration.as_u64() {
                        Some(0) | None => issues.push(issue("durationMs", "等待时长必须大于 0")),
                        Some(_) => {}
                    }
                }
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
    task.category = Some(
        task.category
            .unwrap_or_else(|| "未分类".into())
            .trim()
            .to_string(),
    );
    task.tag_ids.sort();
    task.tag_ids.dedup();
    if task.triggers.is_empty() {
        task.triggers = vec![TaskTrigger::Manual { enabled: true }];
    }
    task.triggers = task
        .triggers
        .into_iter()
        .map(|trigger| match trigger {
            TaskTrigger::Shortcut { enabled, shortcut } => TaskTrigger::Shortcut {
                enabled,
                shortcut: shortcut.trim().to_string(),
            },
            manual => manual,
        })
        .collect();
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
    action
        .params
        .get(key)
        .and_then(|value| value.as_str())
        .unwrap_or_default()
}

fn command_source(action: &TaskAction) -> &str {
    let source = string_param(action, "source");
    if source == "script" {
        "script"
    } else {
        "inline"
    }
}

fn is_supported_script_path(path: &str) -> bool {
    Path::new(path)
        .extension()
        .and_then(|value| value.to_str())
        .map(|extension| {
            matches!(
                extension.to_ascii_lowercase().as_str(),
                "ps1" | "cmd" | "bat"
            )
        })
        .unwrap_or(false)
}

fn issue(field: &str, message: &str) -> FieldIssue {
    FieldIssue {
        field: field.to_string(),
        message: message.to_string(),
    }
}

fn normalize_shortcut(value: &str) -> String {
    value.split_whitespace().collect::<String>().to_lowercase()
}

fn is_supported_shortcut(value: &str) -> bool {
    let parts: Vec<String> = value
        .split('+')
        .map(|part| part.trim().to_lowercase())
        .filter(|part| !part.is_empty())
        .collect();
    if parts.len() < 2 {
        return false;
    }
    let key = parts.last().map(String::as_str).unwrap_or_default();
    let has_modifier = parts[..parts.len() - 1].iter().any(|part| {
        matches!(
            part.as_str(),
            "alt"
                | "ctrl"
                | "control"
                | "shift"
                | "cmd"
                | "command"
                | "cmdorctrl"
                | "commandorcontrol"
        )
    });
    has_modifier
        && (key.len() == 1 && key.chars().all(|ch| ch.is_ascii_alphanumeric()) || key == "space")
}

#[allow(dead_code)]
fn _risk_level_used(_: RiskLevel) {}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::fs;
    use std::path::PathBuf;
    use uuid::Uuid;

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
            favorite: false,
            tag_ids: Vec::new(),
            triggers: vec![TaskTrigger::Manual { enabled: true }],
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

    #[test]
    fn rejects_unknown_task_tag_reference() {
        let mut config = AppConfig::default();
        config.tasks.push(TaskItem {
            id: "task".into(),
            name: "事项".into(),
            category: None,
            keywords: None,
            description: None,
            actions: Vec::new(),
            risk_level: RiskLevel::Low,
            enabled: true,
            favorite: false,
            tag_ids: vec!["missing".into()],
            triggers: vec![TaskTrigger::Manual { enabled: true }],
            last_run_at: None,
            created_at: "2026-07-01T00:00:00Z".into(),
            updated_at: "2026-07-01T00:00:00Z".into(),
        });

        let issues = validate_config_model(&config);

        assert!(issues.iter().any(|issue| issue.field == "tagIds"));
    }

    #[test]
    fn rejects_duplicate_tag_names() {
        let mut config = AppConfig::default();
        config.tags.push(crate::domain::TaskTag {
            id: "a".into(),
            name: "工作".into(),
        });
        config.tags.push(crate::domain::TaskTag {
            id: "b".into(),
            name: "工作".into(),
        });

        let issues = validate_config_model(&config);

        assert!(issues.iter().any(|issue| issue.field == "tags"));
    }

    #[test]
    fn validates_script_command_file() {
        let temp_dir = temp_validation_dir();
        let script_path = temp_dir.join("start.ps1");
        fs::write(&script_path, "Write-Output 'ok'").expect("write script");
        let action = TaskAction {
            id: "a".into(),
            action_type: ActionType::RunCommand,
            name: None,
            params: json!({
                "source": "script",
                "command": "",
                "workingDir": temp_dir.to_string_lossy(),
                "shell": "powershell",
                "scriptPath": script_path.to_string_lossy(),
                "scriptArgs": ["dev"]
            }),
            enabled: true,
            timeout_ms: None,
            continue_on_error: None,
            risk_level: RiskLevel::High,
        };

        assert!(validate_action_model(&action).valid);
        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn rejects_unsupported_script_extension() {
        let temp_dir = temp_validation_dir();
        let script_path = temp_dir.join("start.txt");
        fs::write(&script_path, "echo ok").expect("write script");
        let action = TaskAction {
            id: "a".into(),
            action_type: ActionType::RunCommand,
            name: None,
            params: json!({
                "source": "script",
                "command": "",
                "workingDir": temp_dir.to_string_lossy(),
                "shell": "powershell",
                "scriptPath": script_path.to_string_lossy()
            }),
            enabled: true,
            timeout_ms: None,
            continue_on_error: None,
            risk_level: RiskLevel::High,
        };

        let result = validate_action_model(&action);

        assert!(!result.valid);
        assert!(
            result
                .issues
                .iter()
                .any(|issue| issue.field == "scriptPath")
        );
        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn rejects_missing_script_file() {
        let temp_dir = temp_validation_dir();
        let action = TaskAction {
            id: "a".into(),
            action_type: ActionType::RunCommand,
            name: None,
            params: json!({
                "source": "script",
                "command": "",
                "workingDir": temp_dir.to_string_lossy(),
                "shell": "powershell",
                "scriptPath": temp_dir.join("missing.ps1").to_string_lossy()
            }),
            enabled: true,
            timeout_ms: None,
            continue_on_error: None,
            risk_level: RiskLevel::High,
        };

        let result = validate_action_model(&action);

        assert!(!result.valid);
        assert!(
            result
                .issues
                .iter()
                .any(|issue| issue.field == "scriptPath")
        );
        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn allows_missing_delay_duration() {
        let action = TaskAction {
            id: "a".into(),
            action_type: ActionType::Delay,
            name: None,
            params: json!({}),
            enabled: true,
            timeout_ms: None,
            continue_on_error: None,
            risk_level: RiskLevel::Low,
        };

        assert!(validate_action_model(&action).valid);
    }

    #[test]
    fn allows_null_delay_duration() {
        let action = TaskAction {
            id: "a".into(),
            action_type: ActionType::Delay,
            name: None,
            params: json!({ "durationMs": null }),
            enabled: true,
            timeout_ms: None,
            continue_on_error: None,
            risk_level: RiskLevel::Low,
        };

        assert!(validate_action_model(&action).valid);
    }

    fn temp_validation_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("anything-fast-validation-{}", Uuid::new_v4()));
        fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }
}
