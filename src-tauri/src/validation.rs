use crate::domain::{
    ActionCondition, ActionType, AppConfig, FieldIssue, PreviousActionStatusConditionValue,
    RiskLevel, ScheduleMisfirePolicy, ScheduleMode, TaskAction, TaskItem, TaskTrigger,
    ValidationResult,
};
use crate::risk::{derive_action_risk, derive_task_risk};
use crate::variables::{
    is_valid_variable_key, validate_action_output_binding, validate_task_variables,
};
use std::collections::HashSet;
use std::path::Path;

pub const MIN_SCHEDULE_INTERVAL_MINUTES: u32 = 5;

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
            match trigger {
                TaskTrigger::Shortcut { enabled, shortcut } => {
                    let normalized = normalize_shortcut(shortcut);
                    if *enabled && normalized.is_empty() {
                        issues.push(issue("triggers", "快捷键不能为空"));
                    }
                    if *enabled
                        && normalized == normalize_shortcut(&config.settings.global_shortcut)
                    {
                        issues.push(issue("triggers", "事项快捷键不能与全局快捷键冲突"));
                    }
                    if *enabled && !is_supported_shortcut(shortcut) {
                        issues.push(issue("triggers", "快捷键格式无效"));
                    }
                    if *enabled && !shortcuts.insert(normalized) {
                        issues.push(issue("triggers", "事项快捷键不能重复"));
                    }
                }
                TaskTrigger::Schedule { .. } => {
                    issues.extend(validate_schedule_trigger(trigger));
                }
                TaskTrigger::Manual { .. } => {}
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

    issues.extend(validate_task_variables(task));
    let mut variable_keys: HashSet<String> = task
        .variables
        .iter()
        .map(|variable| variable.key.trim().to_string())
        .collect();
    for action in &task.actions {
        if let Some(binding) = &action.output_binding {
            add_binding_key(&mut variable_keys, &binding.stdout_variable);
            add_binding_key(&mut variable_keys, &binding.stderr_variable);
            add_binding_key(&mut variable_keys, &binding.exit_code_variable);
        }
    }

    for (index, action) in task.actions.iter().enumerate() {
        for action_issue in validate_action_model(action).issues {
            issues.push(issue(
                &format!("actions.{index}.{}", action_issue.field),
                &action_issue.message,
            ));
        }
        if let Some(condition_variable) = condition_variable_key(&action.condition) {
            if !variable_keys.contains(condition_variable) {
                issues.push(issue(
                    &format!("actions.{index}.condition.variable"),
                    &format!("引用了未定义变量：{condition_variable}"),
                ));
            }
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

    issues.extend(validate_action_output_binding(action));
    issues.extend(validate_action_condition(&action.condition));

    validate_action_params(action, &mut issues);

    ValidationResult {
        valid: issues.is_empty(),
        issues,
        risk_level: Some(derive_action_risk(action)),
    }
}

fn validate_action_params(action: &TaskAction, issues: &mut Vec<FieldIssue>) {
    match action.action_type {
        ActionType::OpenProgram => validate_open_program_action(action, issues),
        ActionType::OpenUrl => validate_open_url_action(action, issues),
        ActionType::OpenFile => validate_open_file_action(action, issues),
        ActionType::OpenFolder => validate_open_folder_action(action, issues),
        ActionType::RunCommand => validate_run_command_action(action, issues),
        ActionType::Delay => validate_delay_action(action, issues),
    }
}

fn validate_open_program_action(action: &TaskAction, issues: &mut Vec<FieldIssue>) {
    let path = string_param(action, "path");
    if path.trim().is_empty() {
        issues.push(issue("path", "程序路径不能为空"));
    }
}

fn validate_open_url_action(action: &TaskAction, issues: &mut Vec<FieldIssue>) {
    let url = string_param(action, "url");
    if !has_variable_reference(url) && !(url.starts_with("http://") || url.starts_with("https://"))
    {
        issues.push(issue("url", "URL 必须是 http 或 https 地址"));
    }
}

fn validate_open_file_action(action: &TaskAction, issues: &mut Vec<FieldIssue>) {
    let path = string_param(action, "path");
    if path.trim().is_empty() {
        issues.push(issue("path", "文件路径不能为空"));
    }
}

fn validate_open_folder_action(action: &TaskAction, issues: &mut Vec<FieldIssue>) {
    let path = string_param(action, "path");
    if path.trim().is_empty() {
        issues.push(issue("path", "文件夹路径不能为空"));
    }
}

fn validate_run_command_action(action: &TaskAction, issues: &mut Vec<FieldIssue>) {
    let source = command_source(action);
    if source == "script" {
        validate_script_command_action(action, issues);
    } else if string_param(action, "command").trim().is_empty() {
        issues.push(issue("command", "命令内容不能为空"));
    }

    let working_dir = string_param(action, "workingDir");
    if working_dir.trim().is_empty() {
        issues.push(issue("workingDir", "工作目录不能为空"));
    }

    let shell = string_param(action, "shell");
    if !is_supported_command_shell(shell) {
        issues.push(issue(
            "shell",
            "Shell 必须是 terminal、pwsh、powershell 或 cmd",
        ));
    }

    let show_terminal = action
        .params
        .get("showTerminal")
        .and_then(|value| value.as_bool())
        .unwrap_or(false);
    let terminal_host = string_param(action, "terminalHost");
    if shell == "terminal" && (!show_terminal || terminal_host == "direct") {
        issues.push(issue("shell", "终端默认配置只能在显示系统终端时使用"));
    }

    if !terminal_host.is_empty() && !is_supported_terminal_host(terminal_host) {
        issues.push(issue(
            "terminalHost",
            "终端宿主必须是 systemTerminal 或 direct",
        ));
    }
}

fn validate_script_command_action(action: &TaskAction, issues: &mut Vec<FieldIssue>) {
    let script_path = string_param(action, "scriptPath");
    if script_path.trim().is_empty() {
        issues.push(issue("scriptPath", "脚本文件不能为空"));
    } else if !has_variable_reference(script_path) && !is_supported_script_path(script_path) {
        issues.push(issue("scriptPath", "脚本文件必须是 ps1、cmd 或 bat"));
    } else if !has_variable_reference(script_path)
        && is_powershell_script_path(script_path)
        && string_param(action, "shell") == "cmd"
    {
        issues.push(issue("shell", "ps1 脚本必须使用 pwsh 或 powershell"));
    }
}

fn validate_delay_action(action: &TaskAction, issues: &mut Vec<FieldIssue>) {
    if let Some(duration) = action.params.get("durationMs") {
        if !duration.is_null() {
            match duration.as_u64() {
                Some(0) | None => issues.push(issue("durationMs", "等待时长必须大于 0")),
                Some(_) => {}
            }
        }
    }
}

fn validate_action_condition(condition: &Option<ActionCondition>) -> Vec<FieldIssue> {
    let mut issues = Vec::new();
    let Some(condition) = condition else {
        return issues;
    };

    match condition {
        ActionCondition::Always => {}
        ActionCondition::FileExists { path } => {
            if path.trim().is_empty() {
                issues.push(issue("condition.path", "条件文件路径不能为空"));
            }
        }
        ActionCondition::FolderExists { path } => {
            if path.trim().is_empty() {
                issues.push(issue("condition.path", "条件文件夹路径不能为空"));
            }
        }
        ActionCondition::VariableEquals { variable, .. }
        | ActionCondition::VariableNotEmpty { variable } => {
            if !is_valid_variable_key(variable.trim()) {
                issues.push(issue("condition.variable", "条件变量 key 无效"));
            }
        }
        ActionCondition::PreviousActionStatus { status } => match status {
            PreviousActionStatusConditionValue::Success
            | PreviousActionStatusConditionValue::Failed
            | PreviousActionStatusConditionValue::Skipped => {}
        },
    }
    issues
}

fn condition_variable_key(condition: &Option<ActionCondition>) -> Option<&str> {
    match condition {
        Some(ActionCondition::VariableEquals { variable, .. })
        | Some(ActionCondition::VariableNotEmpty { variable }) => Some(variable.trim()),
        _ => None,
    }
}

fn add_binding_key(keys: &mut HashSet<String>, value: &Option<String>) {
    let Some(key) = value
        .as_deref()
        .map(str::trim)
        .filter(|key| !key.is_empty())
    else {
        return;
    };
    if is_valid_variable_key(key) {
        keys.insert(key.to_string());
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
            TaskTrigger::Schedule {
                enabled,
                mode,
                interval_minutes,
                time_of_day,
                mut weekdays,
                misfire_policy,
                prevent_overlap,
                next_run_at,
                last_scheduled_at,
            } => {
                weekdays.sort();
                weekdays.dedup();
                weekdays.retain(|weekday| (1..=7).contains(weekday));
                TaskTrigger::Schedule {
                    enabled,
                    mode,
                    interval_minutes,
                    time_of_day: time_of_day.map(|value| value.trim().to_string()),
                    weekdays,
                    misfire_policy,
                    prevent_overlap,
                    next_run_at,
                    last_scheduled_at,
                }
            }
            manual => manual,
        })
        .collect();
    task.risk_level = derive_task_risk(&task);
    for variable in &mut task.variables {
        variable.key = variable.key.trim().to_string();
        variable.label = variable.label.trim().to_string();
    }
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

fn is_powershell_script_path(path: &str) -> bool {
    Path::new(path)
        .extension()
        .and_then(|value| value.to_str())
        .map(|extension| extension.eq_ignore_ascii_case("ps1"))
        .unwrap_or(false)
}

fn is_supported_command_shell(shell: &str) -> bool {
    matches!(shell, "terminal" | "pwsh" | "powershell" | "cmd")
}

fn is_supported_terminal_host(value: &str) -> bool {
    matches!(value, "systemTerminal" | "direct")
}

fn has_variable_reference(value: &str) -> bool {
    value.contains("{{") || value.contains("}}")
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

fn validate_schedule_trigger(trigger: &TaskTrigger) -> Vec<FieldIssue> {
    let mut issues = Vec::new();
    let TaskTrigger::Schedule {
        enabled: _,
        mode,
        interval_minutes,
        time_of_day,
        weekdays,
        misfire_policy,
        prevent_overlap: _,
        next_run_at: _,
        last_scheduled_at: _,
    } = trigger
    else {
        return issues;
    };

    match mode {
        ScheduleMode::Interval => {
            if interval_minutes.unwrap_or_default() < MIN_SCHEDULE_INTERVAL_MINUTES {
                issues.push(issue(
                    "triggers.intervalMinutes",
                    &format!("间隔不能小于 {MIN_SCHEDULE_INTERVAL_MINUTES} 分钟"),
                ));
            }
        }
        ScheduleMode::Daily => {
            if !is_valid_time_of_day(time_of_day.as_deref().unwrap_or_default()) {
                issues.push(issue("triggers.timeOfDay", "执行时间必须是 HH:mm 格式"));
            }
        }
        ScheduleMode::Weekly => {
            if !is_valid_time_of_day(time_of_day.as_deref().unwrap_or_default()) {
                issues.push(issue("triggers.timeOfDay", "执行时间必须是 HH:mm 格式"));
            }
            if weekdays.is_empty() {
                issues.push(issue("triggers.weekdays", "每周触发至少选择一天"));
            }
            if weekdays.iter().any(|weekday| !(1..=7).contains(weekday)) {
                issues.push(issue("triggers.weekdays", "星期值必须在 1 到 7 之间"));
            }
        }
    }

    match misfire_policy {
        ScheduleMisfirePolicy::Skip | ScheduleMisfirePolicy::RunOnce => {}
    }
    issues
}

pub fn is_valid_time_of_day(value: &str) -> bool {
    let Some((hour, minute)) = value.trim().split_once(':') else {
        return false;
    };
    if hour.len() != 2 || minute.len() != 2 {
        return false;
    }
    let Ok(hour) = hour.parse::<u8>() else {
        return false;
    };
    let Ok(minute) = minute.parse::<u8>() else {
        return false;
    };
    hour <= 23 && minute <= 59
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
            output_binding: None,
            condition: None,
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
            variables: Vec::new(),
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
    fn validates_schedule_trigger_settings() {
        let mut config = AppConfig::default();
        config.tasks.push(TaskItem {
            id: "task".into(),
            name: "周期事项".into(),
            category: None,
            keywords: None,
            description: None,
            variables: Vec::new(),
            actions: Vec::new(),
            risk_level: RiskLevel::Low,
            enabled: true,
            favorite: false,
            tag_ids: Vec::new(),
            triggers: vec![TaskTrigger::Schedule {
                enabled: true,
                mode: ScheduleMode::Weekly,
                interval_minutes: Some(1),
                time_of_day: Some("25:00".into()),
                weekdays: Vec::new(),
                misfire_policy: ScheduleMisfirePolicy::Skip,
                prevent_overlap: true,
                next_run_at: None,
                last_scheduled_at: None,
            }],
            last_run_at: None,
            created_at: "2026-07-01T00:00:00Z".into(),
            updated_at: "2026-07-01T00:00:00Z".into(),
        });

        let issues = validate_config_model(&config);

        assert!(
            issues
                .iter()
                .any(|issue| issue.field == "triggers.timeOfDay")
        );
        assert!(
            issues
                .iter()
                .any(|issue| issue.field == "triggers.weekdays")
        );
    }

    #[test]
    fn normalize_task_preserves_schedule_trigger_fields() {
        let task = TaskItem {
            id: "task".into(),
            name: "周期事项".into(),
            category: None,
            keywords: None,
            description: None,
            variables: Vec::new(),
            actions: Vec::new(),
            risk_level: RiskLevel::Low,
            enabled: true,
            favorite: false,
            tag_ids: Vec::new(),
            triggers: vec![TaskTrigger::Schedule {
                enabled: true,
                mode: ScheduleMode::Weekly,
                interval_minutes: Some(60),
                time_of_day: Some(" 09:30 ".into()),
                weekdays: vec![3, 1, 3, 8],
                misfire_policy: ScheduleMisfirePolicy::RunOnce,
                prevent_overlap: true,
                next_run_at: Some("2026-07-06T01:30:00Z".into()),
                last_scheduled_at: None,
            }],
            last_run_at: None,
            created_at: "2026-07-01T00:00:00Z".into(),
            updated_at: "2026-07-01T00:00:00Z".into(),
        };

        let normalized = normalize_task(task);

        assert!(matches!(
            &normalized.triggers[0],
            TaskTrigger::Schedule {
                mode: ScheduleMode::Weekly,
                time_of_day: Some(time),
                weekdays,
                misfire_policy: ScheduleMisfirePolicy::RunOnce,
                prevent_overlap: true,
                next_run_at: Some(_),
                ..
            } if time == "09:30" && weekdays == &vec![1, 3]
        ));
    }

    #[test]
    fn schedule_trigger_deserializes_default_policy_fields() {
        let task: TaskItem = serde_json::from_value(json!({
            "id": "task",
            "name": "周期事项",
            "actions": [],
            "riskLevel": "low",
            "enabled": true,
            "favorite": false,
            "tagIds": [],
            "triggers": [{
                "type": "schedule",
                "enabled": true,
                "mode": "daily",
                "timeOfDay": "09:00"
            }],
            "createdAt": "2026-07-01T00:00:00Z",
            "updatedAt": "2026-07-01T00:00:00Z"
        }))
        .expect("scheduled task");

        assert!(matches!(
            &task.triggers[0],
            TaskTrigger::Schedule {
                misfire_policy: ScheduleMisfirePolicy::Skip,
                prevent_overlap: true,
                ..
            }
        ));
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
            output_binding: None,
            condition: None,
            risk_level: RiskLevel::High,
        };

        assert!(validate_action_model(&action).valid);
        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn validates_script_command_with_pwsh_shell() {
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
                "shell": "pwsh",
                "scriptPath": script_path.to_string_lossy()
            }),
            enabled: true,
            timeout_ms: None,
            continue_on_error: None,
            output_binding: None,
            condition: None,
            risk_level: RiskLevel::High,
        };

        assert!(validate_action_model(&action).valid);
        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn rejects_unsupported_script_command_shell() {
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
                "shell": "bash",
                "scriptPath": script_path.to_string_lossy()
            }),
            enabled: true,
            timeout_ms: None,
            continue_on_error: None,
            output_binding: None,
            condition: None,
            risk_level: RiskLevel::High,
        };

        let result = validate_action_model(&action);

        assert!(!result.valid);
        assert!(result.issues.iter().any(|issue| issue.field == "shell"));
        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn rejects_unsupported_terminal_host() {
        let action = TaskAction {
            id: "a".into(),
            action_type: ActionType::RunCommand,
            name: None,
            params: json!({
                "source": "inline",
                "command": "Write-Output 'ok'",
                "workingDir": "D:\\Project",
                "shell": "powershell",
                "terminalHost": "classic"
            }),
            enabled: true,
            timeout_ms: None,
            continue_on_error: None,
            output_binding: None,
            condition: None,
            risk_level: RiskLevel::Medium,
        };

        let result = validate_action_model(&action);

        assert!(!result.valid);
        assert!(
            result
                .issues
                .iter()
                .any(|issue| issue.field == "terminalHost")
        );
    }

    #[test]
    fn validates_terminal_default_shell_only_for_system_terminal() {
        let action = TaskAction {
            id: "a".into(),
            action_type: ActionType::RunCommand,
            name: None,
            params: json!({
                "source": "inline",
                "command": "Write-Output 'ok'",
                "workingDir": "D:\\Project",
                "showTerminal": true,
                "terminalHost": "systemTerminal",
                "shell": "terminal"
            }),
            enabled: true,
            timeout_ms: None,
            continue_on_error: None,
            output_binding: None,
            condition: None,
            risk_level: RiskLevel::Medium,
        };

        assert!(validate_action_model(&action).valid);

        let hidden_action = TaskAction {
            params: json!({
                "source": "inline",
                "command": "Write-Output 'ok'",
                "workingDir": "D:\\Project",
                "showTerminal": false,
                "terminalHost": "systemTerminal",
                "shell": "terminal"
            }),
            ..action.clone()
        };
        let result = validate_action_model(&hidden_action);

        assert!(!result.valid);
        assert!(result.issues.iter().any(|issue| issue.field == "shell"));
    }

    #[test]
    fn rejects_cmd_shell_for_powershell_script() {
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
                "shell": "cmd",
                "scriptPath": script_path.to_string_lossy()
            }),
            enabled: true,
            timeout_ms: None,
            continue_on_error: None,
            output_binding: None,
            condition: None,
            risk_level: RiskLevel::High,
        };

        let result = validate_action_model(&action);

        assert!(!result.valid);
        assert!(result.issues.iter().any(|issue| issue.field == "shell"));
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
            output_binding: None,
            condition: None,
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
    fn allows_missing_script_file_for_portable_config() {
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
            output_binding: None,
            condition: None,
            risk_level: RiskLevel::High,
        };

        let result = validate_action_model(&action);

        assert!(result.valid);
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
            output_binding: None,
            condition: None,
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
            output_binding: None,
            condition: None,
            risk_level: RiskLevel::Low,
        };

        assert!(validate_action_model(&action).valid);
    }

    #[test]
    fn rejects_invalid_action_condition() {
        let mut action = TaskAction {
            id: "a".into(),
            action_type: ActionType::OpenFile,
            name: None,
            params: json!({ "path": "D:\\Project\\input.txt" }),
            enabled: true,
            timeout_ms: None,
            continue_on_error: None,
            output_binding: None,
            condition: Some(ActionCondition::FileExists { path: " ".into() }),
            risk_level: RiskLevel::Low,
        };

        let result = validate_action_model(&action);
        assert!(!result.valid);
        assert!(
            result
                .issues
                .iter()
                .any(|issue| issue.field == "condition.path")
        );

        action.condition = Some(ActionCondition::VariableNotEmpty {
            variable: "1bad".into(),
        });
        let result = validate_action_model(&action);
        assert!(!result.valid);
        assert!(
            result
                .issues
                .iter()
                .any(|issue| issue.field == "condition.variable")
        );
    }

    #[test]
    fn allows_condition_variable_from_output_binding() {
        let task = TaskItem {
            id: "task".into(),
            name: "条件事项".into(),
            category: None,
            keywords: None,
            description: None,
            variables: Vec::new(),
            actions: vec![
                TaskAction {
                    id: "a".into(),
                    action_type: ActionType::RunCommand,
                    name: None,
                    params: json!({
                        "command": "echo path",
                        "workingDir": "D:\\Project",
                        "shell": "powershell"
                    }),
                    enabled: true,
                    timeout_ms: None,
                    continue_on_error: None,
                    output_binding: Some(crate::domain::TaskActionOutputBinding {
                        stdout_variable: Some("generatedPath".into()),
                        stderr_variable: None,
                        exit_code_variable: None,
                    }),
                    condition: None,
                    risk_level: RiskLevel::Medium,
                },
                TaskAction {
                    id: "b".into(),
                    action_type: ActionType::OpenFolder,
                    name: None,
                    params: json!({ "path": "{{generatedPath}}" }),
                    enabled: true,
                    timeout_ms: None,
                    continue_on_error: None,
                    output_binding: None,
                    condition: Some(ActionCondition::VariableNotEmpty {
                        variable: "generatedPath".into(),
                    }),
                    risk_level: RiskLevel::Low,
                },
            ],
            risk_level: RiskLevel::Medium,
            enabled: true,
            favorite: false,
            tag_ids: Vec::new(),
            triggers: vec![TaskTrigger::Manual { enabled: true }],
            last_run_at: None,
            created_at: "2026-07-01T00:00:00Z".into(),
            updated_at: "2026-07-01T00:00:00Z".into(),
        };

        let result = validate_task_model(&task, &[]);

        assert!(result.valid);
    }

    fn temp_validation_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("anything-fast-validation-{}", Uuid::new_v4()));
        fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }
}
