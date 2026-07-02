mod commands;
mod domain;
mod executor;
mod risk;
mod storage;
mod validation;

use commands::*;
use chrono::Utc;
use domain::{ShortcutStatus, TaskTrigger};
use std::sync::Mutex;
use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

#[derive(Default)]
struct TaskShortcutRegistry(Mutex<Vec<(Shortcut, String)>>);

#[derive(Default)]
struct GlobalShortcutState(Mutex<GlobalShortcutRegistration>);

struct GlobalShortcutRegistration {
    shortcut: Option<Shortcut>,
    label: String,
    status: ShortcutStatus,
}

impl Default for GlobalShortcutRegistration {
    fn default() -> Self {
        Self {
            shortcut: None,
            label: String::new(),
            status: ShortcutStatus {
                shortcut: String::new(),
                registered: false,
                message: None,
            },
        }
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(TaskShortcutRegistry::default())
        .manage(GlobalShortcutState::default())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }
                    if is_global_shortcut(app, shortcut) {
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
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .setup(|app| {
            ensure_quick_panel(app.handle())?;
            setup_tray(app)?;
            let config = storage::load_config(app.handle()).unwrap_or_default();
            let global_shortcut = config.settings.global_shortcut.trim();
            if let Err(message) = register_global_shortcut(app.handle(), global_shortcut) {
                set_global_shortcut_status(app.handle(), None, global_shortcut, Some(message));
            }
            refresh_task_shortcuts(app.handle(), &config).map_err(|err| tauri::Error::Anyhow(anyhow::anyhow!(err)))?;
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
            load_shortcut_status,
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

fn setup_tray(app: &mut tauri::App) -> tauri::Result<()> {
    let open_main = MenuItemBuilder::with_id("open-main", "打开主窗口").build(app)?;
    let open_quick = MenuItemBuilder::with_id("open-quick", "快捷搜索").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "退出").build(app)?;
    let menu = MenuBuilder::new(app)
        .items(&[&open_main, &open_quick, &quit])
        .build()?;

    let mut tray = TrayIconBuilder::with_id("main-tray")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("事项入口管理器")
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open-main" => show_main_window(app),
            "open-quick" => show_quick_panel(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        });

    tray = tray.icon(app_tray_icon());

    tray.build(app)?;
    Ok(())
}

fn app_tray_icon() -> Image<'static> {
    tauri::include_image!("icons/32x32.png").clone()
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

pub fn register_global_shortcut(app: &tauri::AppHandle, shortcut_label: &str) -> Result<(), String> {
    let trimmed = shortcut_label.trim();
    let parsed: Shortcut = trimmed.parse().map_err(|_| format!("全局快捷键格式无效：{trimmed}"))?;

    let state = app.state::<GlobalShortcutState>();
    let mut registration = state
        .0
        .lock()
        .map_err(|_| "无法更新全局快捷键注册表".to_string())?;

    if registration.shortcut.as_ref() == Some(&parsed) {
        registration.status = ShortcutStatus {
            shortcut: trimmed.to_string(),
            registered: true,
            message: None,
        };
        emit_shortcut_status(app, registration.status.clone());
        return Ok(());
    }

    if let Err(err) = app.global_shortcut().register(parsed) {
        let message = format_shortcut_registration_error(trimmed, &err.to_string());
        registration.status = ShortcutStatus {
            shortcut: trimmed.to_string(),
            registered: false,
            message: Some(message.clone()),
        };
        emit_shortcut_status(app, registration.status.clone());
        return Err(message);
    }

    if let Some(previous) = registration.shortcut {
        if previous != parsed {
            let _ = app.global_shortcut().unregister(previous);
        }
    }

    registration.shortcut = Some(parsed);
    registration.label = trimmed.to_string();
    registration.status = ShortcutStatus {
        shortcut: trimmed.to_string(),
        registered: true,
        message: None,
    };
    emit_shortcut_status(app, registration.status.clone());
    Ok(())
}

pub fn shortcut_status(app: &tauri::AppHandle) -> ShortcutStatus {
    app.state::<GlobalShortcutState>()
        .0
        .lock()
        .map(|registration| registration.status.clone())
        .unwrap_or_else(|_| ShortcutStatus {
            shortcut: String::new(),
            registered: false,
            message: Some("无法读取全局快捷键状态".to_string()),
        })
}

fn set_global_shortcut_status(app: &tauri::AppHandle, shortcut: Option<Shortcut>, label: &str, message: Option<String>) {
    if let Ok(mut registration) = app.state::<GlobalShortcutState>().0.lock() {
        registration.shortcut = shortcut;
        registration.label = label.trim().to_string();
        registration.status = ShortcutStatus {
            shortcut: registration.label.clone(),
            registered: registration.shortcut.is_some() && message.is_none(),
            message,
        };
        emit_shortcut_status(app, registration.status.clone());
    }
}

fn is_global_shortcut(app: &tauri::AppHandle, shortcut: &Shortcut) -> bool {
    app.state::<GlobalShortcutState>()
        .0
        .lock()
        .map(|registration| registration.shortcut.as_ref() == Some(shortcut))
        .unwrap_or(false)
}

fn emit_shortcut_status(app: &tauri::AppHandle, status: ShortcutStatus) {
    let _ = app.emit("shortcut-status", status);
}

fn format_shortcut_registration_error(shortcut: &str, raw_error: &str) -> String {
    let lower = raw_error.to_lowercase();
    if lower.contains("already registered") || lower.contains("hotkey already registered") {
        format!("无法注册全局快捷键 {shortcut}：该快捷键已被占用")
    } else {
        format!("无法注册全局快捷键 {shortcut}：{raw_error}")
    }
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn show_quick_panel(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("quick-panel") {
        let _ = window.center();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn toggle_quick_panel(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("quick-panel") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            show_quick_panel(app);
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
