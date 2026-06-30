mod commands;
mod domain;
mod executor;
mod risk;
mod storage;
mod validation;

use commands::*;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            ensure_quick_panel(app.handle())?;
            register_default_shortcut(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_config,
            save_config,
            validate_task,
            validate_action,
            analyze_risk,
            run_task,
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
    let app_handle = app.clone();
    app.global_shortcut()
        .on_shortcut(shortcut, move |_app, shortcut, event| {
            if event.state() != ShortcutState::Pressed {
                return;
            }
            if shortcut.matches(Modifiers::ALT, Code::Space) {
                if let Some(window) = app_handle.get_webview_window("quick-panel") {
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.hide();
                    } else {
                        let _ = window.center();
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
        })
        .map_err(|err| tauri::Error::Anyhow(anyhow::anyhow!(err.to_string())))?;

    Ok(())
}
