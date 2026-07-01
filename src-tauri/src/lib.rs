mod commands;
mod domain;
mod executor;
mod risk;
mod storage;
mod validation;

use commands::*;
use chrono::Utc;
use domain::TaskTrigger;
use std::sync::Mutex;
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

#[derive(Default)]
struct TaskShortcutRegistry(Mutex<Vec<(Shortcut, String)>>);

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(TaskShortcutRegistry::default())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }
                    if shortcut.matches(Modifiers::ALT, Code::Space) {
                        toggle_quick_panel(app);
                        return;
                    }
                    let task_id = app
                        .state::<TaskShortcutRegistry>()
                        .0
                        .lock()
                        .ok()
                        .and_then(|registry| {
                            registry
                                .iter()
                                .find(|(registered, _)| shortcut == registered)
                                .map(|(_, task_id)| task_id.clone())
                        });
                    if let Some(task_id) = task_id {
                        trigger_task_shortcut(app, task_id);
                    }
                })
                .build(),
        )
        .setup(|app| {
            ensure_quick_panel(app.handle())?;
            register_default_shortcut(app.handle())?;
            if let Ok(config) = storage::load_config(app.handle()) {
                refresh_task_shortcuts(app.handle(), &config).map_err(|err| tauri::Error::Anyhow(anyhow::anyhow!(err)))?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_config,
            save_config,
            validate_task,
            validate_action,
            analyze_risk,
            analyze_action_risk,
            run_task,
            run_task_action,
            preview_action,
            load_execution_logs,
            update_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn ensure_quick_panel(app: &tauri::AppHandle) -> tauri::Result<()> {
    if app.get_webview_window("quick-panel").is_some() {
        return Ok(());
    }

    WebviewWindowBuilder::new(app, "quick-panel", WebviewUrl::App("/?window=quick".into()))
        .title("快捷搜索")
        .inner_size(720.0, 520.0)
        .resizable(false)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false)
        .build()?;

    Ok(())
}

fn register_default_shortcut(app: &tauri::AppHandle) -> tauri::Result<()> {
    let shortcut = Shortcut::new(Some(Modifiers::ALT), Code::Space);
    app.global_shortcut()
        .register(shortcut)
        .map_err(|err| tauri::Error::Anyhow(anyhow::anyhow!(err.to_string())))?;

    Ok(())
}

pub fn refresh_task_shortcuts(app: &tauri::AppHandle, config: &domain::AppConfig) -> Result<(), String> {
    let registry_state = app.state::<TaskShortcutRegistry>();
    let mut registry = registry_state
        .0
        .lock()
        .map_err(|_| "无法更新事项快捷键注册表".to_string())?;

    for (shortcut, _) in registry.iter() {
        let _ = app.global_shortcut().unregister(*shortcut);
    }
    registry.clear();

    for task in config.tasks.iter().filter(|task| task.enabled) {
        for trigger in &task.triggers {
            if let TaskTrigger::Shortcut { enabled: true, shortcut } = trigger {
                let parsed: Shortcut = shortcut.parse().map_err(|_| format!("快捷键格式无效：{shortcut}"))?;
                app.global_shortcut()
                    .register(parsed)
                    .map_err(|err| format!("无法注册事项快捷键 {shortcut}：{err}"))?;
                registry.push((parsed, task.id.clone()));
            }
        }
    }

    Ok(())
}

fn toggle_quick_panel(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("quick-panel") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.center();
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

fn trigger_task_shortcut(app: &tauri::AppHandle, task_id: String) {
    let app = app.clone();
    std::thread::spawn(move || {
        let mut config = match storage::load_config(&app) {
            Ok(config) => config,
            Err(_) => return,
        };
        let task_index = match config.tasks.iter().position(|task| task.id == task_id) {
            Some(index) => index,
            None => return,
        };
        let task = config.tasks[task_index].clone();
        if !task.enabled {
            return;
        }
        let validation = validation::validate_task_model(&task, &config.tasks);
        if !validation.valid {
            return;
        }
        let risk = risk::analyze_task_risk(&task);
        if risk.requires_confirmation {
            let _ = app.emit(
                "task-execution",
                serde_json::json!({
                    "taskId": task.id,
                    "taskName": task.name,
                    "status": "failed",
                    "message": "该事项需要二次确认，请在主窗口中手动运行"
                }),
            );
            return;
        }
        if let Ok(summary) = executor::execute_task(&app, &task) {
            let finished_at = summary.finished_at.clone();
            config.tasks[task_index].last_run_at = Some(finished_at.clone());
            config.tasks[task_index].updated_at = finished_at;
        } else {
            let now = Utc::now().to_rfc3339();
            config.tasks[task_index].updated_at = now;
        }
        let _ = storage::save_config(&app, &config);
    });
}
