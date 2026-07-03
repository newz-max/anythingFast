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
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

const OUTPUT_LIMIT_CHARS: usize = 8192;

pub fn execute_task(app: &AppHandle, task: &TaskItem) -> Result<TaskExecutionSummary, String> {
    let run_id = Uuid::new_v4().to_string();
    let started_at = Utc::now().to_rfc3339();
    let total_actions = task.actions.len();
    emit_event(
        app,
        EventContext {
            run_id: &run_id,
            task,
            scope: ExecutionScope::Task,
            status: "started",
            current_index: None,
            total_actions,
            action: None,
            result: None,
            message: Some("事项开始执行".into()),
        },
    );

    let mut results = Vec::new();
    let mut failed = false;

    for (index, action) in task.actions.iter().enumerate() {
        let current_index = index + 1;
        if !action.enabled {
            let timestamp = Utc::now().to_rfc3339();
            let result = action_result(
                action,
                ExecutionStatus::Skipped,
                Some("动作已停用".into()),
                Some(timestamp.clone()),
                Some(timestamp),
                Some(0),
                ActionRunOutput::default(),
            );
            emit_event(
                app,
                EventContext {
                    run_id: &run_id,
                    task,
                    scope: ExecutionScope::Task,
                    status: "action-skipped",
                    current_index: Some(current_index),
                    total_actions,
                    action: Some(action),
                    result: Some(&result),
                    message: result.message.clone(),
                },
            );
            results.push(result);
            continue;
        }

        emit_event(
            app,
            EventContext {
                run_id: &run_id,
                task,
                scope: ExecutionScope::Task,
                status: "action-started",
                current_index: Some(current_index),
                total_actions,
                action: Some(action),
                result: None,
                message: Some(action_name(action)),
            },
        );
        let action_started_at = Utc::now();
        let timer = Instant::now();
        match execute_action(action) {
            Ok(output) => {
                let finished_at = Utc::now();
                let result = action_result(
                    action,
                    ExecutionStatus::Success,
                    Some(output.message.clone()),
                    Some(action_started_at.to_rfc3339()),
                    Some(finished_at.to_rfc3339()),
                    Some(timer.elapsed().as_millis() as u64),
                    output,
                );
                emit_event(
                    app,
                    EventContext {
                        run_id: &run_id,
                        task,
                        scope: ExecutionScope::Task,
                        status: "action-success",
                        current_index: Some(current_index),
                        total_actions,
                        action: Some(action),
                        result: Some(&result),
                        message: result.message.clone(),
                    },
                );
                results.push(result);
            }
            Err(output) => {
                let finished_at = Utc::now();
                let result = action_result(
                    action,
                    ExecutionStatus::Failed,
                    Some(output.message.clone()),
                    Some(action_started_at.to_rfc3339()),
                    Some(finished_at.to_rfc3339()),
                    Some(timer.elapsed().as_millis() as u64),
                    output,
                );
                emit_event(
                    app,
                    EventContext {
                        run_id: &run_id,
                        task,
                        scope: ExecutionScope::Task,
                        status: "action-failed",
                        current_index: Some(current_index),
                        total_actions,
                        action: Some(action),
                        result: Some(&result),
                        message: result.message.clone(),
                    },
                );
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
    emit_event(
        app,
        EventContext {
            run_id: &run_id,
            task,
            scope: ExecutionScope::Task,
            status: "finished",
            current_index: Some(summary.actions.len()),
            total_actions,
            action: None,
            result: None,
            message: Some(if summary.status == ExecutionStatus::Success {
                "事项执行完成".into()
            } else {
                "事项执行失败".into()
            }),
        },
    );

    Ok(summary)
}

pub fn execute_task_action(
    app: &AppHandle,
    task: &TaskItem,
    action: &TaskAction,
) -> Result<TaskExecutionSummary, String> {
    let run_id = Uuid::new_v4().to_string();
    let started_at = Utc::now().to_rfc3339();
    emit_event(
        app,
        EventContext {
            run_id: &run_id,
            task,
            scope: ExecutionScope::Action,
            status: "started",
            current_index: None,
            total_actions: 1,
            action: Some(action),
            result: None,
            message: Some("动作开始执行".into()),
        },
    );
    emit_event(
        app,
        EventContext {
            run_id: &run_id,
            task,
            scope: ExecutionScope::Action,
            status: "action-started",
            current_index: Some(1),
            total_actions: 1,
            action: Some(action),
            result: None,
            message: Some(action_name(action)),
        },
    );

    let action_started_at = Utc::now();
    let timer = Instant::now();
    let result = match execute_action(action) {
        Ok(output) => {
            let finished_at = Utc::now();
            let result = action_result(
                action,
                ExecutionStatus::Success,
                Some(output.message.clone()),
                Some(action_started_at.to_rfc3339()),
                Some(finished_at.to_rfc3339()),
                Some(timer.elapsed().as_millis() as u64),
                output,
            );
            emit_event(
                app,
                EventContext {
                    run_id: &run_id,
                    task,
                    scope: ExecutionScope::Action,
                    status: "action-success",
                    current_index: Some(1),
                    total_actions: 1,
                    action: Some(action),
                    result: Some(&result),
                    message: result.message.clone(),
                },
            );
            result
        }
        Err(output) => {
            let finished_at = Utc::now();
            let result = action_result(
                action,
                ExecutionStatus::Failed,
                Some(output.message.clone()),
                Some(action_started_at.to_rfc3339()),
                Some(finished_at.to_rfc3339()),
                Some(timer.elapsed().as_millis() as u64),
                output,
            );
            emit_event(
                app,
                EventContext {
                    run_id: &run_id,
                    task,
                    scope: ExecutionScope::Action,
                    status: "action-failed",
                    current_index: Some(1),
                    total_actions: 1,
                    action: Some(action),
                    result: Some(&result),
                    message: result.message.clone(),
                },
            );
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
    emit_event(
        app,
        EventContext {
            run_id: &run_id,
            task,
            scope: ExecutionScope::Action,
            status: "finished",
            current_index: Some(1),
            total_actions: 1,
            action: Some(action),
            result: None,
            message: Some(if summary.status == ExecutionStatus::Success {
                "动作执行完成".into()
            } else {
                "动作执行失败".into()
            }),
        },
    );

    Ok(summary)
}

fn execute_action(action: &TaskAction) -> Result<ActionRunOutput, ActionRunOutput> {
    match action.action_type {
        ActionType::OpenProgram => open_program(action).map(ok_output).map_err(failed_output),
        ActionType::OpenUrl | ActionType::OpenFile | ActionType::OpenFolder => {
            open_target(action).map(ok_output).map_err(failed_output)
        }
        ActionType::RunCommand => run_command(action),
        ActionType::Delay => delay(action).map(ok_output).map_err(failed_output),
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

fn run_command(action: &TaskAction) -> Result<ActionRunOutput, ActionRunOutput> {
    let working_dir = string_param(action, "workingDir").map_err(failed_output)?;
    if !Path::new(working_dir).is_dir() {
        return Err(failed_output(format!("工作目录不存在：{working_dir}")));
    }

    let show_terminal = show_terminal(action);
    let should_close_terminal = should_close_terminal_on_finish(action);
    let mut command = if command_source(action) == "script" {
        script_command(action, should_close_terminal).map_err(failed_output)?
    } else {
        inline_command(action, should_close_terminal).map_err(failed_output)?
    };

    command.current_dir(working_dir);
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
            failed_output(err.to_string())
        })?;
        if status.success() {
            return Ok(ActionRunOutput {
                message: "命令执行成功".into(),
                exit_code: status.code(),
                ..Default::default()
            });
        }
        let exit_code = status.code().unwrap_or(-1);
        dev_log_error(
            "Run command action failed",
            format!(
                "actionId={}, actionName={}, type={:?}, workingDir={}, showTerminal=true, exitCode={}",
                action.id,
                action.name.clone().unwrap_or_else(|| "未命名动作".into()),
                action.action_type,
                working_dir,
                exit_code
            ),
        );
        return Err(ActionRunOutput {
            message: format!(
                "命令执行失败，退出码：{exit_code}，显示终端模式未捕获 stdout/stderr，请查看弹出的终端输出"
            ),
            exit_code: Some(exit_code),
            ..Default::default()
        });
    }

    let output = command.output().map_err(|err| {
        dev_log_error(
            "Run command action failed to capture output",
            format!(
                "actionId={}, workingDir={}, error={err}",
                action.id, working_dir
            ),
        );
        failed_output(err.to_string())
    })?;
    let exit_code = output.status.code().unwrap_or(-1);
    let stdout = truncate_output(&String::from_utf8_lossy(&output.stdout));
    let stderr = truncate_output(&String::from_utf8_lossy(&output.stderr));
    if output.status.success() {
        Ok(ActionRunOutput {
            message: "命令执行成功".into(),
            exit_code: Some(exit_code),
            stdout,
            stderr,
        })
    } else {
        dev_log_error(
            "Run command action failed",
            format!(
                "actionId={}, actionName={}, type={:?}, workingDir={}, showTerminal=false, exitCode={}, stdout={}, stderr={}",
                action.id,
                action.name.clone().unwrap_or_else(|| "未命名动作".into()),
                action.action_type,
                working_dir,
                exit_code,
                stdout.as_deref().unwrap_or("").trim(),
                stderr.as_deref().unwrap_or("").trim()
            ),
        );
        let detail = stderr
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .or_else(|| {
                stdout
                    .as_deref()
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
            })
            .unwrap_or("无输出");
        Err(ActionRunOutput {
            message: format!("命令执行失败，退出码：{exit_code}，{detail}"),
            exit_code: Some(exit_code),
            stdout,
            stderr,
        })
    }
}

fn show_terminal(action: &TaskAction) -> bool {
    action
        .params
        .get("showTerminal")
        .and_then(|value| value.as_bool())
        .unwrap_or(false)
}

fn close_terminal_on_finish(action: &TaskAction) -> bool {
    action
        .params
        .get("closeTerminalOnFinish")
        .and_then(|value| value.as_bool())
        .unwrap_or(true)
}

fn should_close_terminal_on_finish(action: &TaskAction) -> bool {
    !show_terminal(action) || close_terminal_on_finish(action)
}

fn inline_command(action: &TaskAction, close_terminal_on_finish: bool) -> Result<Command, String> {
    let command_text = string_param(action, "command")?;
    let shell = action
        .params
        .get("shell")
        .and_then(|value| value.as_str())
        .unwrap_or("powershell");

    if shell == "cmd" {
        let mut cmd = Command::new("cmd");
        cmd.args([cmd_keep_open_flag(close_terminal_on_finish), command_text]);
        Ok(cmd)
    } else {
        let mut ps = Command::new(powershell_program(shell));
        if !close_terminal_on_finish {
            ps.arg("-NoExit");
        }
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

fn script_command(action: &TaskAction, close_terminal_on_finish: bool) -> Result<Command, String> {
    let script_path = string_param(action, "scriptPath")?;
    if !Path::new(script_path).is_file() {
        return Err(format!("脚本文件不存在：{script_path}"));
    }

    let extension = script_extension(script_path)
        .ok_or_else(|| "脚本文件必须是 ps1、cmd 或 bat".to_string())?;
    if extension == "ps1" {
        let shell = action
            .params
            .get("shell")
            .and_then(|value| value.as_str())
            .unwrap_or("powershell");
        if shell == "cmd" {
            return Err("ps1 脚本必须使用 pwsh 或 powershell".to_string());
        }
        let mut ps = Command::new(powershell_program(shell));
        if !close_terminal_on_finish {
            ps.arg("-NoExit");
        }
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
        cmd.args([cmd_keep_open_flag(close_terminal_on_finish), script_path]);
        cmd.args(script_args(action));
        Ok(cmd)
    }
}

fn cmd_keep_open_flag(close_terminal_on_finish: bool) -> &'static str {
    if close_terminal_on_finish { "/C" } else { "/K" }
}

fn powershell_program(shell: &str) -> &str {
    if shell == "pwsh" {
        "pwsh"
    } else {
        "powershell"
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
    started_at: Option<String>,
    finished_at: Option<String>,
    duration_ms: Option<u64>,
    output: ActionRunOutput,
) -> ActionExecutionResult {
    ActionExecutionResult {
        action_id: action.id.clone(),
        action_name: action_name(action),
        action_type: action.action_type.clone(),
        status,
        message,
        started_at,
        finished_at,
        duration_ms,
        exit_code: output.exit_code,
        stdout: output.stdout,
        stderr: output.stderr,
    }
}

#[derive(Debug, Default)]
struct ActionRunOutput {
    message: String,
    exit_code: Option<i32>,
    stdout: Option<String>,
    stderr: Option<String>,
}

fn ok_output(message: String) -> ActionRunOutput {
    ActionRunOutput {
        message,
        ..Default::default()
    }
}

fn failed_output(message: String) -> ActionRunOutput {
    ActionRunOutput {
        message,
        ..Default::default()
    }
}

fn action_name(action: &TaskAction) -> String {
    action.name.clone().unwrap_or_else(|| "未命名动作".into())
}

fn truncate_output(value: &str) -> Option<String> {
    if value.is_empty() {
        return None;
    }

    let mut truncated = String::new();
    for (index, character) in value.chars().enumerate() {
        if index >= OUTPUT_LIMIT_CHARS {
            truncated.push_str("\n[输出已截断，完整内容超过 8192 字符]");
            return Some(truncated);
        }
        truncated.push(character);
    }
    Some(truncated)
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExecutionEvent<'a> {
    run_id: &'a str,
    task_id: &'a str,
    task_name: &'a str,
    scope: ExecutionScope,
    status: &'a str,
    current_index: Option<usize>,
    total_actions: usize,
    action_id: Option<&'a str>,
    action_name: Option<String>,
    action_type: Option<ActionType>,
    message: Option<String>,
    result: Option<&'a ActionExecutionResult>,
}

struct EventContext<'a> {
    run_id: &'a str,
    task: &'a TaskItem,
    scope: ExecutionScope,
    status: &'static str,
    current_index: Option<usize>,
    total_actions: usize,
    action: Option<&'a TaskAction>,
    result: Option<&'a ActionExecutionResult>,
    message: Option<String>,
}

fn emit_event(app: &AppHandle, context: EventContext<'_>) {
    if let Err(err) = app.emit(
        "task-execution",
        ExecutionEvent {
            run_id: context.run_id,
            task_id: &context.task.id,
            task_name: &context.task.name,
            scope: context.scope,
            status: context.status,
            current_index: context.current_index,
            total_actions: context.total_actions,
            action_id: context.action.map(|action| action.id.as_str()),
            action_name: context.action.map(action_name),
            action_type: context.action.map(|action| action.action_type.clone()),
            message: context.message,
            result: context.result,
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

        let result = action_result(
            &action,
            ExecutionStatus::Skipped,
            Some("动作已停用".into()),
            Some("2026-07-03T00:00:00Z".into()),
            Some("2026-07-03T00:00:00Z".into()),
            Some(0),
            ActionRunOutput::default(),
        );
        assert_eq!(result.status, ExecutionStatus::Skipped);
        assert_eq!(result.duration_ms, Some(0));
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
    fn close_terminal_on_finish_defaults_to_true() {
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

        assert!(close_terminal_on_finish(&action));
    }

    #[test]
    fn close_terminal_on_finish_reads_explicit_false() {
        let action = TaskAction {
            id: "a".into(),
            action_type: ActionType::RunCommand,
            name: Some("command".into()),
            params: json!({
                "command": "echo ok",
                "workingDir": "D:\\Project\\anythingFast",
                "showTerminal": true,
                "closeTerminalOnFinish": false,
                "shell": "powershell"
            }),
            enabled: true,
            timeout_ms: None,
            continue_on_error: None,
            risk_level: crate::domain::RiskLevel::Medium,
        };

        assert!(!close_terminal_on_finish(&action));
    }

    #[test]
    fn hidden_terminal_always_closes_on_finish() {
        let action = TaskAction {
            id: "a".into(),
            action_type: ActionType::RunCommand,
            name: Some("command".into()),
            params: json!({
                "command": "echo ok",
                "workingDir": "D:\\Project\\anythingFast",
                "showTerminal": false,
                "closeTerminalOnFinish": false,
                "shell": "powershell"
            }),
            enabled: true,
            timeout_ms: None,
            continue_on_error: None,
            risk_level: crate::domain::RiskLevel::Medium,
        };

        assert!(should_close_terminal_on_finish(&action));
    }

    #[test]
    fn inline_powershell_keeps_terminal_open_with_no_exit() {
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

        let command = inline_command(&action, false).expect("inline command");
        let args: Vec<String> = command
            .get_args()
            .map(|arg| arg.to_string_lossy().to_string())
            .collect();

        assert_eq!(command.get_program().to_string_lossy(), "powershell");
        assert!(args.iter().any(|arg| arg == "-NoExit"));
        assert!(args.iter().any(|arg| arg == "-Command"));
    }

    #[test]
    fn inline_cmd_keeps_terminal_open_with_k_flag() {
        let action = TaskAction {
            id: "a".into(),
            action_type: ActionType::RunCommand,
            name: Some("command".into()),
            params: json!({
                "command": "echo ok",
                "workingDir": "D:\\Project\\anythingFast",
                "shell": "cmd"
            }),
            enabled: true,
            timeout_ms: None,
            continue_on_error: None,
            risk_level: crate::domain::RiskLevel::Medium,
        };

        let command = inline_command(&action, false).expect("inline command");
        let args: Vec<String> = command
            .get_args()
            .map(|arg| arg.to_string_lossy().to_string())
            .collect();

        assert_eq!(command.get_program().to_string_lossy(), "cmd");
        assert_eq!(args.first().map(String::as_str), Some("/K"));
    }

    #[test]
    fn show_terminal_failure_message_mentions_uncaptured_output() {
        let working_dir = std::env::current_dir()
            .unwrap()
            .to_string_lossy()
            .to_string();
        let action = TaskAction {
            id: "a".into(),
            action_type: ActionType::RunCommand,
            name: Some("command".into()),
            params: json!({
                "command": "exit 7",
                "workingDir": working_dir,
                "showTerminal": true,
                "shell": "powershell"
            }),
            enabled: true,
            timeout_ms: None,
            continue_on_error: None,
            risk_level: crate::domain::RiskLevel::Medium,
        };

        let output = run_command(&action).unwrap_err();

        assert_eq!(output.exit_code, Some(7));
        assert!(output.message.contains("退出码：7"));
        assert!(output.message.contains("未捕获 stdout/stderr"));
    }

    #[test]
    fn script_command_uses_pwsh_for_ps1_when_requested() {
        let temp_dir = std::env::temp_dir().join(format!("anything-fast-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir).expect("create temp dir");
        let script_path = temp_dir.join("start.ps1");
        std::fs::write(&script_path, "Write-Output 'ok'").expect("write script");
        let action = TaskAction {
            id: "a".into(),
            action_type: ActionType::RunCommand,
            name: Some("script".into()),
            params: json!({
                "source": "script",
                "command": "",
                "workingDir": temp_dir.to_string_lossy(),
                "shell": "pwsh",
                "scriptPath": script_path.to_string_lossy(),
                "scriptArgs": ["dev"]
            }),
            enabled: true,
            timeout_ms: None,
            continue_on_error: None,
            risk_level: crate::domain::RiskLevel::High,
        };

        let command = script_command(&action, true).expect("script command");
        let args: Vec<String> = command
            .get_args()
            .map(|arg| arg.to_string_lossy().to_string())
            .collect();

        assert_eq!(command.get_program().to_string_lossy(), "pwsh");
        assert!(args.iter().any(|arg| arg == "-File"));
        assert!(args.iter().any(|arg| arg == "dev"));
        let _ = std::fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn script_cmd_keeps_terminal_open_with_k_flag() {
        let temp_dir = std::env::temp_dir().join(format!("anything-fast-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir).expect("create temp dir");
        let script_path = temp_dir.join("start.cmd");
        std::fs::write(&script_path, "echo ok").expect("write script");
        let action = TaskAction {
            id: "a".into(),
            action_type: ActionType::RunCommand,
            name: Some("script".into()),
            params: json!({
                "source": "script",
                "command": "",
                "workingDir": temp_dir.to_string_lossy(),
                "shell": "cmd",
                "scriptPath": script_path.to_string_lossy(),
                "scriptArgs": ["dev"]
            }),
            enabled: true,
            timeout_ms: None,
            continue_on_error: None,
            risk_level: crate::domain::RiskLevel::High,
        };

        let command = script_command(&action, false).expect("script command");
        let args: Vec<String> = command
            .get_args()
            .map(|arg| arg.to_string_lossy().to_string())
            .collect();

        assert_eq!(command.get_program().to_string_lossy(), "cmd");
        assert_eq!(args.first().map(String::as_str), Some("/K"));
        assert!(args.iter().any(|arg| arg == "dev"));
        let _ = std::fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn script_command_rejects_cmd_shell_for_ps1() {
        let temp_dir = std::env::temp_dir().join(format!("anything-fast-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir).expect("create temp dir");
        let script_path = temp_dir.join("start.ps1");
        std::fs::write(&script_path, "Write-Output 'ok'").expect("write script");
        let action = TaskAction {
            id: "a".into(),
            action_type: ActionType::RunCommand,
            name: Some("script".into()),
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
            risk_level: crate::domain::RiskLevel::High,
        };

        let err = script_command(&action, true).unwrap_err();

        assert!(err.contains("ps1 脚本必须使用"));
        let _ = std::fs::remove_dir_all(temp_dir);
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

        let output = run_command(&action).unwrap_err();

        assert_eq!(output.exit_code, Some(7));
        assert!(output.message.contains("退出码：7"));
        assert!(output.message.contains("bad"));
        assert!(output.stderr.unwrap_or_default().contains("bad"));
    }

    #[test]
    fn command_success_captures_stdout_when_hidden() {
        let working_dir = std::env::current_dir()
            .unwrap()
            .to_string_lossy()
            .to_string();
        let action = TaskAction {
            id: "a".into(),
            action_type: ActionType::RunCommand,
            name: Some("command".into()),
            params: json!({
                "command": "Write-Output 'hello'",
                "workingDir": working_dir,
                "shell": "powershell"
            }),
            enabled: true,
            timeout_ms: None,
            continue_on_error: None,
            risk_level: crate::domain::RiskLevel::Medium,
        };

        let output = run_command(&action).unwrap();

        assert_eq!(output.exit_code, Some(0));
        assert!(output.stdout.unwrap_or_default().contains("hello"));
    }

    #[test]
    fn truncate_output_limits_persisted_command_text() {
        let text = "x".repeat(OUTPUT_LIMIT_CHARS + 3);
        let output = truncate_output(&text).unwrap();

        assert!(output.len() > OUTPUT_LIMIT_CHARS);
        assert!(output.contains("输出已截断"));
    }
}
