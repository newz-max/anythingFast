use crate::domain::{ActionType, RiskActionSummary, RiskAnalysis, RiskLevel, TaskAction, TaskItem};
use regex::Regex;

pub fn derive_action_risk(action: &TaskAction) -> RiskLevel {
    if action.action_type != ActionType::RunCommand {
        return RiskLevel::Low;
    }

    if command_source(action) == "script" {
        return RiskLevel::High;
    }

    let command = action
        .params
        .get("command")
        .and_then(|value| value.as_str())
        .unwrap_or_default()
        .to_lowercase();

    let dangerous = Regex::new(
        r"(?i)\b(rm|del|erase|rmdir|rd|format|shutdown|reg\s+delete|takeown|icacls|install|npm\s+i|pnpm\s+add|yarn\s+add|remove-item|set-executionpolicy)\b|--force|-force|>\s*|runas",
    )
    .expect("valid risk regex");

    if dangerous.is_match(&command) {
        RiskLevel::High
    } else {
        RiskLevel::Medium
    }
}

pub fn derive_task_risk(task: &TaskItem) -> RiskLevel {
    task.actions
        .iter()
        .filter(|action| action.enabled)
        .map(derive_action_risk)
        .max_by_key(risk_weight)
        .unwrap_or(RiskLevel::Low)
}

pub fn analyze_task_risk(task: &TaskItem) -> RiskAnalysis {
    let high_risk_actions: Vec<RiskActionSummary> = task
        .actions
        .iter()
        .filter(|action| action.enabled)
        .filter_map(|action| {
            let risk = derive_action_risk(action);
            if risk != RiskLevel::High {
                return None;
            }
            Some(RiskActionSummary {
                action_id: action.id.clone(),
                name: action
                    .name
                    .clone()
                    .unwrap_or_else(|| "未命名动作".to_string()),
                action_type: action.action_type.clone(),
                risk_level: risk,
                detail: action_detail(action),
            })
        })
        .collect();

    let has_command = task
        .actions
        .iter()
        .any(|action| action.enabled && action.action_type == ActionType::RunCommand);

    let mut reasons = Vec::new();
    if !high_risk_actions.is_empty() {
        reasons.push("包含高风险动作".to_string());
    }
    if has_command && task.last_run_at.is_none() {
        reasons.push("首次执行包含命令动作的事项".to_string());
    }

    RiskAnalysis {
        task_id: task.id.clone(),
        requires_confirmation: !reasons.is_empty(),
        reasons,
        high_risk_actions,
    }
}

pub fn action_detail(action: &TaskAction) -> String {
    match action.action_type {
        ActionType::OpenUrl => action
            .params
            .get("url")
            .and_then(|value| value.as_str())
            .unwrap_or("")
            .to_string(),
        ActionType::RunCommand => {
            if command_source(action) == "script" {
                action
                    .params
                    .get("scriptPath")
                    .and_then(|value| value.as_str())
                    .unwrap_or("")
                    .to_string()
            } else {
                action
                    .params
                    .get("command")
                    .and_then(|value| value.as_str())
                    .unwrap_or("")
                    .to_string()
            }
        }
        ActionType::Delay => action
            .params
            .get("durationMs")
            .and_then(|value| value.as_u64())
            .map(|duration| format!("{duration} ms"))
            .unwrap_or_default(),
        _ => action
            .params
            .get("path")
            .and_then(|value| value.as_str())
            .unwrap_or("")
            .to_string(),
    }
}

fn command_source(action: &TaskAction) -> &str {
    let source = action
        .params
        .get("source")
        .and_then(|value| value.as_str())
        .unwrap_or("inline");
    if source == "script" {
        "script"
    } else {
        "inline"
    }
}

fn risk_weight(risk: &RiskLevel) -> u8 {
    match risk {
        RiskLevel::Low => 1,
        RiskLevel::Medium => 2,
        RiskLevel::High => 3,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn detects_high_risk_commands() {
        let action = TaskAction {
            id: "a".into(),
            action_type: ActionType::RunCommand,
            name: None,
            params: json!({ "command": "Remove-Item -Recurse dist", "workingDir": "D:\\Project", "shell": "powershell" }),
            enabled: true,
            timeout_ms: None,
            continue_on_error: None,
            risk_level: RiskLevel::Medium,
        };

        assert_eq!(derive_action_risk(&action), RiskLevel::High);
    }

    #[test]
    fn treats_script_commands_as_high_risk() {
        let action = TaskAction {
            id: "a".into(),
            action_type: ActionType::RunCommand,
            name: None,
            params: json!({
                "source": "script",
                "command": "",
                "workingDir": "D:\\Project",
                "shell": "powershell",
                "scriptPath": "D:\\Project\\start.ps1"
            }),
            enabled: true,
            timeout_ms: None,
            continue_on_error: None,
            risk_level: RiskLevel::Medium,
        };

        assert_eq!(derive_action_risk(&action), RiskLevel::High);
        assert_eq!(action_detail(&action), "D:\\Project\\start.ps1");
    }
}
