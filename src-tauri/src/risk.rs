use crate::domain::{
    ActionType, AppConfig, RiskActionSummary, RiskAnalysis, RiskLevel, TaskAction, TaskItem,
    TaskTemplate, TaskTemplateAction,
};
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

pub fn normalize_action_risk(mut action: TaskAction) -> TaskAction {
    action.risk_level = derive_action_risk(&action);
    action
}

pub fn normalize_task_risk(mut task: TaskItem) -> TaskItem {
    task.actions = task
        .actions
        .into_iter()
        .map(normalize_action_risk)
        .collect();
    task.risk_level = derive_task_risk(&task);
    task
}

pub fn normalize_template_risk(mut template: TaskTemplate) -> TaskTemplate {
    template.actions = template
        .actions
        .into_iter()
        .map(normalize_template_action_risk)
        .collect();
    template
}

pub fn normalize_config_risk(mut config: AppConfig) -> AppConfig {
    config.tasks = config.tasks.into_iter().map(normalize_task_risk).collect();
    config.templates = config
        .templates
        .into_iter()
        .map(normalize_template_risk)
        .collect();
    config
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

fn normalize_template_action_risk(mut action: TaskTemplateAction) -> TaskTemplateAction {
    let task_action = TaskAction {
        id: "template".into(),
        action_type: action.action_type.clone(),
        name: action.name.clone(),
        params: action.params.clone(),
        enabled: action.enabled,
        timeout_ms: action.timeout_ms,
        continue_on_error: action.continue_on_error,
        output_binding: action.output_binding.clone(),
        condition: action.condition.clone(),
        risk_level: action.risk_level.clone(),
    };
    action.risk_level = derive_action_risk(&task_action);
    action
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

    #[derive(Debug, serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct RiskCase {
        name: String,
        action: TaskAction,
        expected_risk: RiskLevel,
    }

    #[test]
    fn shared_risk_cases_match_backend_rules() {
        let cases: Vec<RiskCase> =
            serde_json::from_str(include_str!("../../fixtures/risk-cases.json"))
                .expect("risk cases fixture should deserialize");

        for case in cases {
            assert_eq!(
                derive_action_risk(&case.action),
                case.expected_risk,
                "{}",
                case.name
            );
        }
    }

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
            output_binding: None,
            condition: None,
            risk_level: RiskLevel::Medium,
        };

        assert_eq!(derive_action_risk(&action), RiskLevel::High);
    }

    #[test]
    fn analyzes_displayable_reasons_for_high_risk_and_first_command() {
        let task = TaskItem {
            id: "task".into(),
            name: "Task".into(),
            category: None,
            keywords: None,
            description: None,
            variables: Vec::new(),
            actions: vec![TaskAction {
                id: "a".into(),
                action_type: ActionType::RunCommand,
                name: Some("删除目录".into()),
                params: json!({
                    "source": "inline",
                    "command": "Remove-Item -Recurse dist",
                    "workingDir": "D:\\Project",
                    "shell": "powershell"
                }),
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
            triggers: Vec::new(),
            last_run_at: None,
            created_at: "2026-07-01T00:00:00Z".into(),
            updated_at: "2026-07-01T00:00:00Z".into(),
        };

        let analysis = analyze_task_risk(&task);

        assert!(analysis.requires_confirmation);
        assert!(
            analysis
                .reasons
                .iter()
                .any(|reason| reason == "包含高风险动作")
        );
        assert!(
            analysis
                .reasons
                .iter()
                .any(|reason| reason == "首次执行包含命令动作的事项")
        );
        assert_eq!(analysis.high_risk_actions.len(), 1);
        assert_eq!(analysis.high_risk_actions[0].name, "删除目录");
        assert_eq!(
            analysis.high_risk_actions[0].detail,
            "Remove-Item -Recurse dist"
        );
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
            output_binding: None,
            condition: None,
            risk_level: RiskLevel::Medium,
        };

        assert_eq!(derive_action_risk(&action), RiskLevel::High);
        assert_eq!(action_detail(&action), "D:\\Project\\start.ps1");
    }

    #[test]
    fn normalizes_stale_task_and_template_risk_metadata() {
        let command_action = TaskAction {
            id: "a".into(),
            action_type: ActionType::RunCommand,
            name: None,
            params: json!({
                "source": "inline",
                "command": "Remove-Item -Recurse dist",
                "workingDir": "D:\\Project",
                "shell": "powershell"
            }),
            enabled: true,
            timeout_ms: None,
            continue_on_error: None,
            output_binding: None,
            condition: None,
            risk_level: RiskLevel::Low,
        };
        let task = TaskItem {
            id: "task".into(),
            name: "Task".into(),
            category: None,
            keywords: None,
            description: None,
            variables: Vec::new(),
            actions: vec![command_action.clone()],
            risk_level: RiskLevel::Low,
            enabled: true,
            favorite: false,
            tag_ids: Vec::new(),
            triggers: Vec::new(),
            last_run_at: None,
            created_at: "2026-07-01T00:00:00Z".into(),
            updated_at: "2026-07-01T00:00:00Z".into(),
        };
        let template = TaskTemplate {
            id: "template".into(),
            name: "Template".into(),
            category: None,
            keywords: None,
            description: None,
            variables: Vec::new(),
            actions: vec![TaskTemplateAction {
                action_type: command_action.action_type,
                name: command_action.name,
                params: command_action.params,
                enabled: command_action.enabled,
                timeout_ms: command_action.timeout_ms,
                continue_on_error: command_action.continue_on_error,
                output_binding: command_action.output_binding,
                condition: command_action.condition,
                risk_level: RiskLevel::Low,
            }],
        };
        let config = AppConfig {
            tasks: vec![task],
            templates: vec![template],
            ..AppConfig::default()
        };

        let normalized = normalize_config_risk(config);

        assert_eq!(normalized.tasks[0].actions[0].risk_level, RiskLevel::High);
        assert_eq!(normalized.tasks[0].risk_level, RiskLevel::High);
        assert_eq!(
            normalized.templates[0].actions[0].risk_level,
            RiskLevel::High
        );
    }
}
