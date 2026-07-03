use crate::diagnostics::dev_log_error;
use crate::domain::{
    ActionExecutionResult, ActionType, ExecutionLogSummary, ExecutionScope, ExecutionStatus,
    TaskAction, TaskExecutionSummary, TaskItem,
};
use crate::storage;
use chrono::Utc;
use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;
use std::process::Command;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

pub fn execute_task(app: &AppHandle, task: &TaskItem) -> Result<TaskExecutionSummary, String> {
    let started_at = Utc::now().to_rfc3339();
    emit_event(app, task, "started", None, None);

    let mut results = Vec::new();
    let mut failed = false;

    for action in task.actions.iter() {
        if !action.enabled {
            results.push(action_result(
                action,
                ExecutionStatus::Skipped,
                Some("动作已停用".into()),
            ));
            continue;
        }

        emit_event(app, task, "running", None, Some(action));
        match execute_action(action) {
            Ok(message) => {
                let result = action_result(action, ExecutionStatus::Success, Some(message));
                emit_event(app, task, "action-success", Some(&result), Some(action));
                results.push(result);
            }
            Err(message) => {
                let result = action_result(action, ExecutionStatus::Failed, Some(message));
                emit_event(app, task, "failed", Some(&result), Some(action));
                results.push(result);
                if !action.continue_on_error.unwrap_or(false) {
                    failed = true;
                    break;
                }
            }
        }
    }

    let finished_at = Utc::now().to_rfc3339();
    let status = if failed {
        ExecutionStatus::Failed
    } else {
        ExecutionStatus::Success
    };
    let summary = TaskExecutionSummary {
        task_id: task.id.clone(),
        task_name: task.name.clone(),
        scope: ExecutionScope::Task,
        action_id: None,
        started_at,
        finished_at,
        status: status.clone(),
        actions: results,
    };

    let log = ExecutionLogSummary {
        id: Uuid::new_v4().to_string(),
        task_id: summary.task_id.clone(),
        task_name: summary.task_name.clone(),
        scope: summary.scope.clone(),
        action_id: summary.action_id.clone(),
        started_at: summary.started_at.clone(),
        finished_at: summary.finished_at.clone(),
        status,
        actions: summary.actions.clone(),
    };
    if let Err(err) = storage::append_log(app, log) {
        dev_log_error("Append task execution log failed", &err);
    }
    emit_event(app, task, "finished", None, None);

    Ok(summary)
}

pub fn execute_task_action(
    app: &AppHandle,
    task: &TaskItem,
    action: &TaskAction,
) -> Result<TaskExecutionSummary, String> {
    let started_at = Utc::now().to_rfc3339();
    emit_event(app, task, "started", None, None);
    emit_event(app, task, "running", None, Some(action));

    let result = match execute_action(action) {
        Ok(message) => {
            let result = action_result(action, ExecutionStatus::Success, Some(message));
            emit_event(app, task, "action-success", Some(&result), Some(action));
            result
        }
        Err(message) => {
            let result = action_result(action, ExecutionStatus::Failed, Some(message));
            emit_event(app, task, "failed", Some(&result), Some(action));
            result
        }
    };

    let finished_at = Utc::now().to_rfc3339();
    let status = result.status.clone();
    let summary = TaskExecutionSummary {
        task_id: task.id.clone(),
        task_name: task.name.clone(),
        scope: ExecutionScope::Action,
        action_id: Some(action.id.clone()),
        started_at,
        finished_at,
        status: status.clone(),
        actions: vec![result],
    };

    let log = ExecutionLogSummary {
        id: Uuid::new_v4().to_string(),
        task_id: summary.task_id.clone(),
        task_name: summary.task_name.clone(),
        scope: summary.scope.clone(),
        action_id: summary.action_id.clone(),
        started_at: summary.started_at.clone(),
        finished_at: summary.finished_at.clone(),
        status,
        actions: summary.actions.clone(),
    };
    if let Err(err) = storage::append_log(app, log) {
        dev_log_error("Append action execution log failed", &err);
    }
    emit_event(app, task, "finished", None, None);

    Ok(summary)
}

fn execute_action(action: &TaskAction) -> Result<String, String> {
    match action.action_type {
        ActionType::OpenProgram => open_program(action),
        ActionType::OpenUrl | ActionType::OpenFile | ActionType::OpenFolder => open_target(action),
        ActionType::RunCommand => run_command(action),
        ActionType::Delay => delay(action),
    }
}

fn open_program(action: &TaskAction) -> Result<String, String> {
    let path = string_param(action, "path")?;
    if !Path::new(path).exists() {
        return Err(format!("程序路径不存在：{path}"));
    }

    let mut command = Command::new(path);
    if let Some(args) = action.params.get("args").and_then(|value| value.as_array()) {
        command.args(args.iter().filter_map(|arg| arg.as_str()));
    }
    if let Some(working_dir) = action
        .params
        .get("workingDir")
        .and_then(|value| value.as_str())
    {
        if !working_dir.trim().is_empty() {
            command.current_dir(working_dir);
        }
    }
    command.spawn().map_err(|err| {
        dev_log_error(
            "Open program action failed",
            format!("actionId={}, path={}, error={err}", action.id, path),
        );
        err.to_string()
    })?;
    Ok("程序已启动".into())
}

fn open_target(action: &TaskAction) -> Result<String, String> {
    let target = match action.action_type {
        ActionType::OpenUrl => string_param(action, "url")?,
        _ => string_param(action, "path")?,
    };
    if matches!(action.action_type, ActionType::OpenFile) && !Path::new(target).is_file() {
        return Err(format!("文件不存在：{target}"));
    }
    if matches!(action.action_type, ActionType::OpenFolder) && !Path::new(target).is_dir() {
        return Err(format!("文件夹不存在：{target}"));
    }
    open::that(target).map_err(|err| {
        dev_log_error(
            "Open target action failed",
            format!("actionId={}, target={}, error={err}", action.id, target),
        );
        err.to_string()
    })?;
    Ok("已打开".into())
}

fn run_command(action: &TaskAction) -> Result<String, String> {
    let working_dir = string_param(action, "workingDir")?;
    if !Path::new(working_dir).is_dir() {
        return Err(format!("工作目录不存在：{working_dir}"));
    }

    let mut command = if command_source(action) == "script" {
        script_command(action)?
    } else {
        inline_command(action)?
    };

    command.current_dir(working_dir);
    let show_terminal = show_terminal(action);
    if !show_terminal {
        hide_command_window(&mut command);
    }

    if let Some(env_map) = action.params.get("env").and_then(|value| value.as_object()) {
        let envs: HashMap<String, String> = env_map
            .iter()
            .filter_map(|(key, value)| value.as_str().map(|text| (key.clone(), text.to_string())))
            .collect();
        command.envs(envs);
    }

    if show_terminal {
        let status = command.status().map_err(|err| {
            dev_log_error(
                "Run command action failed to start",
                format!(
                    "actionId={}, workingDir={}, error={err}",
                    action.id, working_dir
                ),
            );
            err.to_string()
        })?;
        if status.success() {
            return Ok("命令执行成功".into());
        }
        dev_log_error(
            "Run command action failed",
            format!(
                "actionId={}, actionName={}, type={:?}, workingDir={}, showTerminal=true, exitCode={}",
                action.id,
                action.name.clone().unwrap_or_else(|| "未命名动作".into()),
                action.action_type,
                working_dir,
                status.code().unwrap_or(-1)
            ),
        );
        return Err(format!(
            "命令执行失败，退出码：{}",
            status.code().unwrap_or(-1)
        ));
    }

    let output = command.output().map_err(|err| {
        dev_log_error(
            "Run command action failed to capture output",
            format!(
                "actionId={}, workingDir={}, error={err}",
                action.id, working_dir
            ),
        );
        err.to_string()
    })?;
    if output.status.success() {
        Ok("命令执行成功".into())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        dev_log_error(
            "Run command action failed",
            format!(
                "actionId={}, actionName={}, type={:?}, workingDir={}, showTerminal=false, exitCode={}, stdout={}, stderr={}",
                action.id,
                action.name.clone().unwrap_or_else(|| "未命名动作".into()),
                action.action_type,
                working_dir,
                output.status.code().unwrap_or(-1),
                stdout.trim(),
                stderr.trim()
            ),
        );
        Err(format!(
            "命令执行失败，退出码：{}，{}",
            output.status.code().unwrap_or(-1),
            stderr.trim()
        ))
    }
}

fn show_terminal(action: &TaskAction) -> bool {
    action
        .params
        .get("showTerminal")
        .and_then(|value| value.as_bool())
        .unwrap_or(false)
}

fn inline_command(action: &TaskAction) -> Result<Command, String> {
    let command_text = string_param(action, "command")?;
    let shell = action
        .params
        .get("shell")
        .and_then(|value| value.as_str())
        .unwrap_or("powershell");

    if shell == "cmd" {
        let mut cmd = Command::new("cmd");
        cmd.args(["/C", command_text]);
        Ok(cmd)
    } else {
        let mut ps = Command::new("powershell");
        ps.args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            command_text,
        ]);
        Ok(ps)
    }
}

fn script_command(action: &TaskAction) -> Result<Command, String> {
    let script_path = string_param(action, "scriptPath")?;
    if !Path::new(script_path).is_file() {
        return Err(format!("脚本文件不存在：{script_path}"));
    }

    let extension = script_extension(script_path)
        .ok_or_else(|| "脚本文件必须是 ps1、cmd 或 bat".to_string())?;
    if extension == "ps1" {
        let mut ps = Command::new("powershell");
        ps.args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            script_path,
        ]);
        ps.args(script_args(action));
        Ok(ps)
    } else {
        let mut cmd = Command::new("cmd");
        cmd.args(["/C", script_path]);
        cmd.args(script_args(action));
        Ok(cmd)
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

fn script_extension(path: &str) -> Option<String> {
    let extension = Path::new(path).extension()?.to_str()?.to_ascii_lowercase();
    match extension.as_str() {
        "ps1" | "cmd" | "bat" => Some(extension),
        _ => None,
    }
}

fn script_args(action: &TaskAction) -> Vec<String> {
    action
        .params
        .get("scriptArgs")
        .and_then(|value| value.as_array())
        .map(|args| {
            args.iter()
                .filter_map(|arg| arg.as_str().map(ToString::to_string))
                .collect()
        })
        .unwrap_or_default()
}

#[cfg(windows)]
fn hide_command_window(command: &mut Command) {
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x08000000;
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
fn hide_command_window(_command: &mut Command) {}

fn delay(action: &TaskAction) -> Result<String, String> {
    let duration = action
        .params
        .get("durationMs")
        .and_then(|value| value.as_u64())
        .unwrap_or(0);
    if duration > 0 {
        thread::sleep(Duration::from_millis(duration));
    }
    Ok(format!("已等待 {duration} ms"))
}

fn string_param<'a>(action: &'a TaskAction, key: &str) -> Result<&'a str, String> {
    action
        .params
        .get(key)
        .and_then(|value| value.as_str())
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| format!("缺少参数：{key}"))
}

fn action_result(
    action: &TaskAction,
    status: ExecutionStatus,
    message: Option<String>,
) -> ActionExecutionResult {
    ActionExecutionResult {
        action_id: action.id.clone(),
        action_name: action.name.clone().unwrap_or_else(|| "未命名动作".into()),
        action_type: action.action_type.clone(),
        status,
        message,
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExecutionEvent<'a> {
    task_id: &'a str,
    task_name: &'a str,
    status: &'a str,
    message: Option<String>,
    action: Option<&'a ActionExecutionResult>,
}

fn emit_event(
    app: &AppHandle,
    task: &TaskItem,
    status: &'static str,
    action_result: Option<&ActionExecutionResult>,
    action: Option<&TaskAction>,
) {
    let message = action.map(|item| item.name.clone().unwrap_or_else(|| "未命名动作".into()));
    if let Err(err) = app.emit(
        "task-execution",
        ExecutionEvent {
            task_id: &task.id,
            task_name: &task.name,
            status,
            message,
            action: action_result,
        },
    ) {
        dev_log_error("Emit task execution event failed", &err);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn skips_disabled_action_result() {
        let action = TaskAction {
            id: "a".into(),
            action_type: ActionType::Delay,
            name: Some("wait".into()),
            params: json!({ "durationMs": 1 }),
            enabled: false,
            timeout_ms: None,
            continue_on_error: None,
            risk_level: crate::domain::RiskLevel::Low,
        };

        let result = action_result(&action, ExecutionStatus::Skipped, None);
        assert_eq!(result.status, ExecutionStatus::Skipped);
    }

    #[test]
    fn delay_without_duration_succeeds_as_zero_ms() {
        let action = TaskAction {
            id: "a".into(),
            action_type: ActionType::Delay,
            name: Some("wait".into()),
            params: json!({}),
            enabled: true,
            timeout_ms: None,
            continue_on_error: None,
            risk_level: crate::domain::RiskLevel::Low,
        };

        let result = delay(&action);

        assert_eq!(result, Ok("已等待 0 ms".into()));
    }

    #[test]
    fn show_terminal_defaults_to_false() {
        let action = TaskAction {
            id: "a".into(),
            action_type: ActionType::RunCommand,
            name: Some("command".into()),
            params: json!({
                "command": "echo ok",
                "workingDir": "D:\\Project\\anythingFast",
                "shell": "powershell"
            }),
            enabled: true,
            timeout_ms: None,
            continue_on_error: None,
            risk_level: crate::domain::RiskLevel::Medium,
        };

        assert!(!show_terminal(&action));
    }

    #[test]
    fn show_terminal_reads_explicit_true() {
        let action = TaskAction {
            id: "a".into(),
            action_type: ActionType::RunCommand,
            name: Some("command".into()),
            params: json!({
                "command": "echo ok",
                "workingDir": "D:\\Project\\anythingFast",
                "showTerminal": true,
                "shell": "powershell"
            }),
            enabled: true,
            timeout_ms: None,
            continue_on_error: None,
            risk_level: crate::domain::RiskLevel::Medium,
        };

        assert!(show_terminal(&action));
    }

    #[test]
    fn command_failure_message_keeps_exit_code_and_stderr() {
        let working_dir = std::env::current_dir()
            .unwrap()
            .to_string_lossy()
            .to_string();
        let action = TaskAction {
            id: "a".into(),
            action_type: ActionType::RunCommand,
            name: Some("command".into()),
            params: json!({
                "command": "Write-Error 'bad'; exit 7",
                "workingDir": working_dir,
                "shell": "powershell"
            }),
            enabled: true,
            timeout_ms: None,
            continue_on_error: None,
            risk_level: crate::domain::RiskLevel::Medium,
        };

        let message = run_command(&action).unwrap_err();

        assert!(message.contains("退出码：7"));
        assert!(message.contains("bad"));
    }
}
