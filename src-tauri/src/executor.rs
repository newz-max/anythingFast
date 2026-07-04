use crate::diagnostics::dev_log_error;
use crate::domain::{
    ActionExecutionResult, ActionType, ExecutionLogSummary, ExecutionScope, ExecutionStatus,
    TaskAction, TaskExecutionSummary, TaskItem,
};
use crate::risk::derive_action_risk;
use crate::storage;
use crate::validation::validate_action_model;
use crate::variables::{self, ActionOutputSnapshot, RuntimeVariableContext};
use chrono::Utc;
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

const OUTPUT_LIMIT_CHARS: usize = 8192;
const WINDOWS_CONTROL_C_EXIT_CODE: i32 = -1073741510;

pub fn execute_task(
    app: &AppHandle,
    task: &TaskItem,
    runtime_variables: &HashMap<String, String>,
    risk_confirmed: bool,
) -> Result<TaskExecutionSummary, String> {
    let mut variable_context = RuntimeVariableContext::from_task(task, runtime_variables)?;
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
    let mut stop_status: Option<ExecutionStatus> = None;

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
                &variable_context,
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

        let resolved_action =
            match prepare_action_for_execution(action, &variable_context, risk_confirmed) {
                Ok(action) => action,
                Err(message) => {
                    let timestamp = Utc::now().to_rfc3339();
                    let result = action_result(
                        action,
                        ExecutionStatus::Failed,
                        Some(message.clone()),
                        Some(timestamp.clone()),
                        Some(timestamp),
                        Some(0),
                        failed_output(message),
                        &variable_context,
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
                    stop_status = Some(ExecutionStatus::Failed);
                    break;
                }
            };

        emit_event(
            app,
            EventContext {
                run_id: &run_id,
                task,
                scope: ExecutionScope::Task,
                status: "action-started",
                current_index: Some(current_index),
                total_actions,
                action: Some(&resolved_action),
                result: None,
                message: Some(action_name(&resolved_action)),
            },
        );
        let action_started_at = Utc::now();
        let timer = Instant::now();
        match execute_action(&resolved_action) {
            Ok(output) => {
                let finished_at = Utc::now();
                let binding_snapshot = output.snapshot();
                let binding_error = variable_context
                    .bind_output(&resolved_action, &binding_snapshot)
                    .err();
                let result = action_result(
                    &resolved_action,
                    if binding_error.is_some() {
                        ExecutionStatus::Failed
                    } else {
                        ExecutionStatus::Success
                    },
                    Some(binding_error.clone().unwrap_or_else(|| output.message.clone())),
                    Some(action_started_at.to_rfc3339()),
                    Some(finished_at.to_rfc3339()),
                    Some(timer.elapsed().as_millis() as u64),
                    output,
                    &variable_context,
                );
                emit_event(
                    app,
                    EventContext {
                        run_id: &run_id,
                        task,
                        scope: ExecutionScope::Task,
                        status: if binding_error.is_some() {
                            "action-failed"
                        } else {
                            "action-success"
                        },
                        current_index: Some(current_index),
                        total_actions,
                        action: Some(&resolved_action),
                        result: Some(&result),
                        message: result.message.clone(),
                    },
                );
                results.push(result);
                if binding_error.is_some() {
                    stop_status = Some(ExecutionStatus::Failed);
                    break;
                }
            }
            Err(output) => {
                let status = action_failure_status(&output);
                let finished_at = Utc::now();
                let result = action_result(
                    &resolved_action,
                    status.clone(),
                    Some(output.message.clone()),
                    Some(action_started_at.to_rfc3339()),
                    Some(finished_at.to_rfc3339()),
                    Some(timer.elapsed().as_millis() as u64),
                    output,
                    &variable_context,
                );
                emit_event(
                    app,
                    EventContext {
                        run_id: &run_id,
                        task,
                        scope: ExecutionScope::Task,
                        status: action_event_status(&status),
                        current_index: Some(current_index),
                        total_actions,
                        action: Some(&resolved_action),
                        result: Some(&result),
                        message: result.message.clone(),
                    },
                );
                results.push(result);
                if should_stop_after_failure(&status, &resolved_action) {
                    stop_status = Some(status);
                    break;
                }
            }
        }
    }

    let finished_at = Utc::now().to_rfc3339();
    let status = final_task_status(stop_status);
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
            message: Some(summary_message(&summary.status, "事项")),
        },
    );

    Ok(summary)
}

pub fn execute_task_action(
    app: &AppHandle,
    task: &TaskItem,
    action: &TaskAction,
    runtime_variables: &HashMap<String, String>,
    risk_confirmed: bool,
) -> Result<TaskExecutionSummary, String> {
    let mut variable_context = RuntimeVariableContext::from_task(task, runtime_variables)?;
    let resolved_action = prepare_action_for_execution(action, &variable_context, risk_confirmed)?;
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
            action: Some(&resolved_action),
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
            action: Some(&resolved_action),
            result: None,
            message: Some(action_name(&resolved_action)),
        },
    );

    let action_started_at = Utc::now();
    let timer = Instant::now();
    let result = match execute_action(&resolved_action) {
        Ok(output) => {
            let finished_at = Utc::now();
            let binding_snapshot = output.snapshot();
            let binding_error = variable_context
                .bind_output(&resolved_action, &binding_snapshot)
                .err();
            let result = action_result(
                &resolved_action,
                if binding_error.is_some() {
                    ExecutionStatus::Failed
                } else {
                    ExecutionStatus::Success
                },
                Some(binding_error.clone().unwrap_or_else(|| output.message.clone())),
                Some(action_started_at.to_rfc3339()),
                Some(finished_at.to_rfc3339()),
                Some(timer.elapsed().as_millis() as u64),
                output,
                &variable_context,
            );
            emit_event(
                app,
                EventContext {
                    run_id: &run_id,
                    task,
                    scope: ExecutionScope::Action,
                    status: if binding_error.is_some() {
                        "action-failed"
                    } else {
                        "action-success"
                    },
                    current_index: Some(1),
                    total_actions: 1,
                    action: Some(&resolved_action),
                    result: Some(&result),
                    message: result.message.clone(),
                },
            );
            result
        }
        Err(output) => {
            let status = action_failure_status(&output);
            let finished_at = Utc::now();
            let result = action_result(
                &resolved_action,
                status.clone(),
                Some(output.message.clone()),
                Some(action_started_at.to_rfc3339()),
                Some(finished_at.to_rfc3339()),
                Some(timer.elapsed().as_millis() as u64),
                output,
                &variable_context,
            );
            emit_event(
                app,
                EventContext {
                    run_id: &run_id,
                    task,
                    scope: ExecutionScope::Action,
                    status: action_event_status(&status),
                    current_index: Some(1),
                    total_actions: 1,
                    action: Some(&resolved_action),
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
        action_id: Some(resolved_action.id.clone()),
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
            action: Some(&resolved_action),
            result: None,
            message: Some(summary_message(&summary.status, "动作")),
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

fn prepare_action_for_execution(
    action: &TaskAction,
    variable_context: &RuntimeVariableContext,
    risk_confirmed: bool,
) -> Result<TaskAction, String> {
    let resolved_action = variables::resolve_action(action, variable_context)?;
    let validation = validate_action_model(&resolved_action);
    if !validation.valid {
        return Err(validation
            .issues
            .into_iter()
            .map(|issue| issue.message)
            .collect::<Vec<_>>()
            .join("; "));
    }
    if derive_action_risk(&resolved_action) == crate::domain::RiskLevel::High && !risk_confirmed {
        return Err("解析变量后的动作需要二次确认".into());
    }
    Ok(resolved_action)
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
    let command_envs = command_envs(action);
    if show_terminal {
        let mut terminal_command =
            terminal_command(action, close_terminal_on_finish(action)).map_err(failed_output)?;
        terminal_command.command.current_dir(working_dir);
        terminal_command.command.envs(command_envs);
        configure_terminal_process(&mut terminal_command.command);

        let status = terminal_command.command.status().map_err(|err| {
            cleanup_temp_paths(&terminal_command.temp_paths);
            dev_log_error(
                "Run command action failed to start",
                format!(
                    "actionId={}, workingDir={}, error={err}",
                    action.id, working_dir
                ),
            );
            failed_output(err.to_string())
        })?;
        cleanup_temp_paths(&terminal_command.temp_paths);
        let exit_code = status.code().unwrap_or(-1);
        if status.success() {
            return Ok(ActionRunOutput {
                message: "命令执行成功".into(),
                exit_code: status.code(),
                ..Default::default()
            });
        }
        if is_interrupted_exit_code(exit_code) {
            return Err(cancelled_output(Some(exit_code), None, None));
        }
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
                "命令执行失败，退出码：{exit_code}，显示终端模式不记录 stdout/stderr，失败输出已在终端中停留供查看"
            ),
            exit_code: Some(exit_code),
            ..Default::default()
        });
    }

    let should_close_terminal = should_close_terminal_on_finish(action);
    let mut command = if command_source(action) == "script" {
        script_command(action, should_close_terminal).map_err(failed_output)?
    } else {
        inline_command(action, should_close_terminal).map_err(failed_output)?
    };

    command.current_dir(working_dir);
    hide_command_window(&mut command);
    command.envs(command_envs);

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
            ..Default::default()
        })
    } else if is_interrupted_exit_code(exit_code) {
        Err(cancelled_output(Some(exit_code), stdout, stderr))
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
            ..Default::default()
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

fn command_envs(action: &TaskAction) -> HashMap<String, String> {
    action
        .params
        .get("env")
        .and_then(|value| value.as_object())
        .map(|env_map| {
            env_map
                .iter()
                .filter_map(|(key, value)| {
                    value.as_str().map(|text| (key.clone(), text.to_string()))
                })
                .collect()
        })
        .unwrap_or_default()
}

struct TerminalCommand {
    command: Command,
    temp_paths: Vec<PathBuf>,
}

fn terminal_command(
    action: &TaskAction,
    close_on_success: bool,
) -> Result<TerminalCommand, String> {
    if command_source(action) == "script" {
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
            powershell_terminal_command(
                powershell_program(shell),
                script_path,
                &script_args(action),
                close_on_success,
                Vec::new(),
            )
        } else {
            cmd_terminal_command(
                script_path,
                &script_args(action),
                close_on_success,
                Vec::new(),
            )
        }
    } else {
        let command_text = string_param(action, "command")?;
        let shell = action
            .params
            .get("shell")
            .and_then(|value| value.as_str())
            .unwrap_or("powershell");

        if shell == "cmd" {
            let user_script_path = temp_runner_path("cmd");
            write_cmd_script(
                &user_script_path,
                &format!("@echo off\r\n{command_text}\r\nexit /b %ERRORLEVEL%\r\n"),
            )?;
            let user_script_path_text = user_script_path.to_string_lossy().to_string();
            cmd_terminal_command(
                &user_script_path_text,
                &[],
                close_on_success,
                vec![user_script_path],
            )
        } else {
            let user_script_path = temp_runner_path("ps1");
            write_powershell_script(&user_script_path, command_text)?;
            let user_script_path_text = user_script_path.to_string_lossy().to_string();
            powershell_terminal_command(
                powershell_program(shell),
                &user_script_path_text,
                &[],
                close_on_success,
                vec![user_script_path],
            )
        }
    }
}

fn powershell_terminal_command(
    shell_program: &str,
    script_path: &str,
    script_args: &[String],
    close_on_success: bool,
    mut temp_paths: Vec<PathBuf>,
) -> Result<TerminalCommand, String> {
    let runner_path = temp_runner_path("ps1");
    let invocation = powershell_script_invocation(script_path, script_args);
    let pause_on_success = if close_on_success { "$false" } else { "$true" };
    let runner_script = format!(
        r#"$ErrorActionPreference = 'Continue'
{invocation}
if ($null -ne $LASTEXITCODE) {{
  $exitCode = [int]$LASTEXITCODE
}} elseif ($?) {{
  $exitCode = 0
}} else {{
  $exitCode = 1
}}
if ($exitCode -ne 0) {{
  Write-Host ''
  Write-Host "命令执行失败，退出码：$exitCode"
  Read-Host '按 Enter 关闭终端' | Out-Null
}} elseif ({pause_on_success}) {{
  Write-Host ''
  Write-Host "命令执行成功，退出码：$exitCode"
  Read-Host '按 Enter 关闭终端' | Out-Null
}}
exit $exitCode
"#
    );
    write_powershell_script(&runner_path, &runner_script)?;

    let mut command = Command::new(shell_program);
    command.args([
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        &runner_path.to_string_lossy(),
    ]);
    temp_paths.push(runner_path);
    Ok(TerminalCommand {
        command,
        temp_paths,
    })
}

fn cmd_terminal_command(
    script_path: &str,
    script_args: &[String],
    close_on_success: bool,
    mut temp_paths: Vec<PathBuf>,
) -> Result<TerminalCommand, String> {
    let runner_path = temp_runner_path("cmd");
    let invocation = cmd_invocation(script_path, script_args);
    let pause_success_block = if close_on_success {
        String::new()
    } else {
        "\r\n) else (\r\n  echo.\r\n  echo 命令执行成功，退出码：%exitCode%\r\n  set /p \"=按 Enter 关闭终端\"\r\n".to_string()
    };
    let runner_script = format!(
        "@echo off\r\ncmd /C \"{invocation}\"\r\nset \"exitCode=%ERRORLEVEL%\"\r\nif not \"%exitCode%\"==\"0\" (\r\n  echo.\r\n  echo 命令执行失败，退出码：%exitCode%\r\n  set /p \"=按 Enter 关闭终端\"{pause_success_block})\r\nexit /b %exitCode%\r\n"
    );
    write_cmd_script(&runner_path, &runner_script)?;

    let mut command = Command::new("cmd");
    command.args(["/C", &runner_path.to_string_lossy()]);
    temp_paths.push(runner_path);
    Ok(TerminalCommand {
        command,
        temp_paths,
    })
}

fn temp_runner_path(extension: &str) -> PathBuf {
    std::env::temp_dir().join(format!(
        "anything-fast-runner-{}.{}",
        Uuid::new_v4(),
        extension
    ))
}

fn write_powershell_script(path: &Path, content: &str) -> Result<(), String> {
    let mut bytes = vec![0xEF, 0xBB, 0xBF];
    bytes.extend_from_slice(content.as_bytes());
    fs::write(path, bytes).map_err(|err| err.to_string())
}

fn write_cmd_script(path: &Path, content: &str) -> Result<(), String> {
    fs::write(path, content).map_err(|err| err.to_string())
}

fn cleanup_temp_paths(paths: &[PathBuf]) {
    for path in paths {
        if let Err(err) = fs::remove_file(path) {
            dev_log_error(
                "Clean command runner temp file failed",
                format!("path={}, error={err}", path.display()),
            );
        }
    }
}

fn powershell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

fn powershell_script_invocation(script_path: &str, script_args: &[String]) -> String {
    let mut parts = vec!["&".to_string(), powershell_quote(script_path)];
    parts.extend(script_args.iter().map(|arg| powershell_quote(arg)));
    parts.join(" ")
}

fn powershell_exit_code_script(invocation: &str) -> String {
    format!(
        r#"{invocation}
if ($null -ne $LASTEXITCODE) {{
  exit [int]$LASTEXITCODE
}}
if ($?) {{
  exit 0
}}
exit 1
"#
    )
}

fn cmd_invocation(script_path: &str, script_args: &[String]) -> String {
    let mut parts = vec![cmd_quote(script_path)];
    parts.extend(script_args.iter().map(|arg| cmd_quote(arg)));
    parts.join(" ")
}

fn cmd_quote(value: &str) -> String {
    format!("\"{}\"", value.replace('"', "\"\""))
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
        let script_args = script_args(action);
        let invocation = powershell_script_invocation(script_path, &script_args);
        ps.args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &powershell_exit_code_script(&invocation),
        ]);
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

#[cfg(windows)]
fn configure_terminal_process(command: &mut Command) {
    use std::os::windows::process::CommandExt;

    const CREATE_NEW_CONSOLE: u32 = 0x00000010;
    const CREATE_NEW_PROCESS_GROUP: u32 = 0x00000200;
    command.creation_flags(CREATE_NEW_CONSOLE | CREATE_NEW_PROCESS_GROUP);
}

#[cfg(not(windows))]
fn configure_terminal_process(_command: &mut Command) {}

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
    variable_context: &RuntimeVariableContext,
) -> ActionExecutionResult {
    ActionExecutionResult {
        action_id: action.id.clone(),
        action_name: action_name(action),
        action_type: action.action_type.clone(),
        status,
        message: variable_context.mask_optional_text(message),
        started_at,
        finished_at,
        duration_ms,
        exit_code: output.exit_code,
        stdout: variable_context.mask_optional_text(output.stdout),
        stderr: variable_context.mask_optional_text(output.stderr),
    }
}

#[derive(Debug, Default)]
struct ActionRunOutput {
    message: String,
    exit_code: Option<i32>,
    stdout: Option<String>,
    stderr: Option<String>,
    failure_status: Option<ExecutionStatus>,
}

impl ActionRunOutput {
    fn snapshot(&self) -> ActionOutputSnapshot {
        ActionOutputSnapshot {
            exit_code: self.exit_code,
            stdout: self.stdout.clone(),
            stderr: self.stderr.clone(),
        }
    }
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
        failure_status: Some(ExecutionStatus::Failed),
        ..Default::default()
    }
}

fn cancelled_output(
    exit_code: Option<i32>,
    stdout: Option<String>,
    stderr: Option<String>,
) -> ActionRunOutput {
    ActionRunOutput {
        message: "命令执行已取消：终端窗口被关闭或进程收到中断信号".into(),
        exit_code,
        stdout,
        stderr,
        failure_status: Some(ExecutionStatus::Cancelled),
    }
}

fn action_failure_status(output: &ActionRunOutput) -> ExecutionStatus {
    output
        .failure_status
        .clone()
        .unwrap_or(ExecutionStatus::Failed)
}

fn should_stop_after_failure(status: &ExecutionStatus, action: &TaskAction) -> bool {
    *status == ExecutionStatus::Cancelled || !action.continue_on_error.unwrap_or(false)
}

fn final_task_status(stop_status: Option<ExecutionStatus>) -> ExecutionStatus {
    stop_status.unwrap_or(ExecutionStatus::Success)
}

fn action_event_status(status: &ExecutionStatus) -> &'static str {
    match status {
        ExecutionStatus::Success => "action-success",
        ExecutionStatus::Failed => "action-failed",
        ExecutionStatus::Skipped => "action-skipped",
        ExecutionStatus::Cancelled => "action-cancelled",
        ExecutionStatus::Pending | ExecutionStatus::Running => "action-started",
    }
}

fn summary_message(status: &ExecutionStatus, label: &str) -> String {
    match status {
        ExecutionStatus::Success => format!("{label}执行完成"),
        ExecutionStatus::Cancelled => format!("{label}执行已取消"),
        _ => format!("{label}执行失败"),
    }
}

fn is_interrupted_exit_code(exit_code: i32) -> bool {
    exit_code == WINDOWS_CONTROL_C_EXIT_CODE
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
            output_binding: None,
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
            &RuntimeVariableContext::from_task(&test_task(Vec::new()), &HashMap::new()).unwrap(),
        );
        assert_eq!(result.status, ExecutionStatus::Skipped);
        assert_eq!(result.duration_ms, Some(0));
    }

    #[test]
    fn resolved_high_risk_command_requires_confirmation() {
        let task = test_task(vec![crate::domain::TaskVariable {
            key: "command".into(),
            label: "Command".into(),
            default_value: "Remove-Item -Recurse dist".into(),
            required: true,
            secret: false,
        }]);
        let context = RuntimeVariableContext::from_task(&task, &HashMap::new()).unwrap();
        let action = TaskAction {
            id: "a".into(),
            action_type: ActionType::RunCommand,
            name: Some("command".into()),
            params: json!({
                "command": "{{command}}",
                "workingDir": std::env::current_dir().unwrap().to_string_lossy(),
                "shell": "powershell"
            }),
            enabled: true,
            timeout_ms: None,
            continue_on_error: None,
            output_binding: None,
            risk_level: crate::domain::RiskLevel::Medium,
        };

        let blocked = prepare_action_for_execution(&action, &context, false).unwrap_err();
        let allowed = prepare_action_for_execution(&action, &context, true).unwrap();

        assert!(blocked.contains("二次确认"));
        assert_eq!(derive_action_risk(&allowed), crate::domain::RiskLevel::High);
    }

    #[test]
    fn interrupted_exit_code_maps_to_cancelled_output() {
        assert!(is_interrupted_exit_code(WINDOWS_CONTROL_C_EXIT_CODE));

        let output = cancelled_output(Some(WINDOWS_CONTROL_C_EXIT_CODE), None, None);

        assert_eq!(action_failure_status(&output), ExecutionStatus::Cancelled);
        assert_eq!(output.exit_code, Some(WINDOWS_CONTROL_C_EXIT_CODE));
        assert!(output.message.contains("命令执行已取消"));
    }

    #[test]
    fn cancelled_failure_stops_and_sets_task_status() {
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
            continue_on_error: Some(true),
            output_binding: None,
            risk_level: crate::domain::RiskLevel::Medium,
        };

        assert!(should_stop_after_failure(
            &ExecutionStatus::Cancelled,
            &action
        ));
        assert_eq!(
            final_task_status(Some(ExecutionStatus::Cancelled)),
            ExecutionStatus::Cancelled
        );
        assert_eq!(
            action_event_status(&ExecutionStatus::Cancelled),
            "action-cancelled"
        );
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
            output_binding: None,
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
            output_binding: None,
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
            output_binding: None,
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
            output_binding: None,
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
            output_binding: None,
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
            output_binding: None,
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
            output_binding: None,
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
            output_binding: None,
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
    fn show_terminal_failure_message_mentions_retained_terminal_output() {
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
            output_binding: None,
            risk_level: crate::domain::RiskLevel::Medium,
        };

        let output = run_command(&action).unwrap_err();

        assert_eq!(output.exit_code, Some(7));
        assert!(output.message.contains("退出码：7"));
        assert!(output.message.contains("不记录 stdout/stderr"));
        assert!(output.message.contains("失败输出已在终端中停留"));
    }

    #[test]
    fn show_terminal_auto_close_runner_pauses_only_on_failure() {
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
                "closeTerminalOnFinish": true,
                "shell": "powershell"
            }),
            enabled: true,
            timeout_ms: None,
            continue_on_error: None,
            output_binding: None,
            risk_level: crate::domain::RiskLevel::Medium,
        };

        let terminal = terminal_command(&action, true).expect("terminal command");
        let runner_path = terminal.temp_paths.last().expect("runner path");
        let runner =
            String::from_utf8_lossy(&std::fs::read(runner_path).expect("read runner")).to_string();

        assert!(runner.contains("if ($exitCode -ne 0)"));
        assert!(runner.contains("Read-Host '按 Enter 关闭终端'"));
        assert!(runner.contains("elseif ($false)"));
        assert!(runner.contains("exit $exitCode"));
        cleanup_temp_paths(&terminal.temp_paths);
    }

    #[test]
    fn show_terminal_keep_open_runner_pauses_on_success_and_failure() {
        let working_dir = std::env::current_dir()
            .unwrap()
            .to_string_lossy()
            .to_string();
        let action = TaskAction {
            id: "a".into(),
            action_type: ActionType::RunCommand,
            name: Some("command".into()),
            params: json!({
                "command": "echo ok",
                "workingDir": working_dir,
                "showTerminal": true,
                "closeTerminalOnFinish": false,
                "shell": "powershell"
            }),
            enabled: true,
            timeout_ms: None,
            continue_on_error: None,
            output_binding: None,
            risk_level: crate::domain::RiskLevel::Medium,
        };

        let terminal = terminal_command(&action, false).expect("terminal command");
        let runner_path = terminal.temp_paths.last().expect("runner path");
        let runner =
            String::from_utf8_lossy(&std::fs::read(runner_path).expect("read runner")).to_string();

        assert!(runner.contains("if ($exitCode -ne 0)"));
        assert!(runner.contains("elseif ($true)"));
        assert!(runner.contains("命令执行成功，退出码"));
        assert!(runner.contains("exit $exitCode"));
        cleanup_temp_paths(&terminal.temp_paths);
    }

    #[test]
    fn show_terminal_cmd_runner_preserves_exit_code() {
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
                "closeTerminalOnFinish": true,
                "shell": "cmd"
            }),
            enabled: true,
            timeout_ms: None,
            continue_on_error: None,
            output_binding: None,
            risk_level: crate::domain::RiskLevel::Medium,
        };

        let terminal = terminal_command(&action, true).expect("terminal command");
        let runner_path = terminal.temp_paths.last().expect("runner path");
        let runner = std::fs::read_to_string(runner_path).expect("read runner");

        assert!(runner.contains("set \"exitCode=%ERRORLEVEL%\""));
        assert!(runner.contains("if not \"%exitCode%\"==\"0\""));
        assert!(runner.contains("set /p \"=按 Enter 关闭终端\""));
        assert!(runner.contains("exit /b %exitCode%"));
        cleanup_temp_paths(&terminal.temp_paths);
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
            output_binding: None,
            risk_level: crate::domain::RiskLevel::High,
        };

        let command = script_command(&action, true).expect("script command");
        let args: Vec<String> = command
            .get_args()
            .map(|arg| arg.to_string_lossy().to_string())
            .collect();

        assert_eq!(command.get_program().to_string_lossy(), "pwsh");
        assert!(args.iter().any(|arg| arg == "-Command"));
        assert!(
            args.iter()
                .any(|arg| arg.contains("&") && arg.contains("start.ps1") && arg.contains("'dev'"))
        );
        let _ = std::fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn powershell_script_command_preserves_psscriptroot_in_param_default() {
        let temp_dir = std::env::temp_dir().join(format!("anything-fast-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir).expect("create temp dir");
        let script_path = temp_dir.join("start.ps1");
        std::fs::write(
            &script_path,
            r#"[CmdletBinding()]
param(
    [string]$ConfigPath = (Join-Path $PSScriptRoot 'x.psd1')
)
Write-Output "root=$PSScriptRoot"
Write-Output "config=$ConfigPath"
"#,
        )
        .expect("write script");
        let action = TaskAction {
            id: "a".into(),
            action_type: ActionType::RunCommand,
            name: Some("script".into()),
            params: json!({
                "source": "script",
                "command": "",
                "workingDir": temp_dir.to_string_lossy(),
                "shell": "powershell",
                "scriptPath": script_path.to_string_lossy(),
                "scriptArgs": []
            }),
            enabled: true,
            timeout_ms: None,
            continue_on_error: None,
            output_binding: None,
            risk_level: crate::domain::RiskLevel::High,
        };

        let output = run_command(&action).expect("run command");

        let stdout = output.stdout.unwrap_or_default();
        let temp_dir_name = temp_dir
            .file_name()
            .expect("temp dir name")
            .to_string_lossy()
            .to_string();
        assert!(stdout.contains("root="));
        assert!(stdout.contains(&temp_dir_name));
        assert!(stdout.contains("x.psd1"));
        let _ = std::fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn powershell_terminal_runner_invokes_script_directly() {
        let temp_dir = std::env::temp_dir().join(format!("anything-fast-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir).expect("create temp dir");
        let script_path = temp_dir.join("start.ps1");
        std::fs::write(&script_path, "Write-Output $PSScriptRoot").expect("write script");
        let action = TaskAction {
            id: "a".into(),
            action_type: ActionType::RunCommand,
            name: Some("script".into()),
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
            risk_level: crate::domain::RiskLevel::High,
        };

        let terminal = terminal_command(&action, true).expect("terminal command");
        let runner_path = terminal.temp_paths.last().expect("runner path");
        let runner =
            String::from_utf8_lossy(&std::fs::read(runner_path).expect("read runner")).to_string();

        assert!(runner.contains("&"));
        assert!(runner.contains("start.ps1"));
        assert!(runner.contains("'dev'"));
        assert!(!runner.contains("-File"));
        cleanup_temp_paths(&terminal.temp_paths);
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
            output_binding: None,
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
            output_binding: None,
            risk_level: crate::domain::RiskLevel::High,
        };

        let err = script_command(&action, true).unwrap_err();

        assert!(err.contains("ps1 脚本必须使用"));
        let _ = std::fs::remove_dir_all(temp_dir);
    }

    fn test_task(variables: Vec<crate::domain::TaskVariable>) -> TaskItem {
        TaskItem {
            id: "task".into(),
            name: "Task".into(),
            category: None,
            keywords: None,
            description: None,
            variables,
            actions: Vec::new(),
            risk_level: crate::domain::RiskLevel::Low,
            enabled: true,
            favorite: false,
            tag_ids: Vec::new(),
            triggers: vec![crate::domain::TaskTrigger::Manual { enabled: true }],
            last_run_at: None,
            created_at: "2026-07-01T00:00:00Z".into(),
            updated_at: "2026-07-01T00:00:00Z".into(),
        }
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
            output_binding: None,
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
            output_binding: None,
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
