mod commands;
mod settings;
mod storage;

use std::path::PathBuf;
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

use chrono::Utc;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, PhysicalPosition, WindowEvent,
};
use tauri_plugin_notification::NotificationExt;

use crate::settings::SettingsState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let handle = app.handle().clone();
            let initial = settings::load(&handle);
            app.manage(SettingsState(Mutex::new(initial)));

            let scan_handle = handle.clone();
            thread::spawn(move || loop {
                thread::sleep(Duration::from_secs(30));
                if let Err(e) = scan_reminders(&scan_handle) {
                    eprintln!("reminder scan error: {e}");
                }
            });

            let quick_add = MenuItem::with_id(app, "quick-add", "Quick Add", true, None::<&str>)?;
            let open_main = MenuItem::with_id(app, "open-main", "Open Tracker", true, None::<&str>)?;
            let settings_item = MenuItem::with_id(app, "settings", "Settings…", true, None::<&str>)?;
            let separator = tauri::menu::PredefinedMenuItem::separator(app)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(
                app,
                &[&quick_add, &open_main, &settings_item, &separator, &quit_item],
            )?;

            let _tray = TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .icon_as_template(true)
                .tooltip("Task Tracker")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quick-add" => {
                        toggle_applet(app, None);
                    }
                    "open-main" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.unminimize();
                            let _ = w.set_focus();
                        }
                    }
                    "settings" => {
                        if let Some(w) = app.get_webview_window("settings") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        position,
                        ..
                    } = event
                    {
                        toggle_applet(tray.app_handle(), Some(position));
                    }
                })
                .build(app)?;

            // Hide main on close instead of quitting (tray-resident app).
            if let Some(main) = app.get_webview_window("main") {
                let main_clone = main.clone();
                main.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = main_clone.hide();
                    }
                });
            }
            if let Some(settings_w) = app.get_webview_window("settings") {
                let s_clone = settings_w.clone();
                settings_w.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = s_clone.hide();
                    }
                });
            }
            if let Some(applet) = app.get_webview_window("applet") {
                let a_clone = applet.clone();
                applet.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = a_clone.hide();
                    }
                    if let WindowEvent::Focused(false) = event {
                        let _ = a_clone.hide();
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_settings,
            commands::update_settings,
            commands::current_bucket,
            commands::list_buckets,
            commands::get_tasks,
            commands::add_task,
            commands::update_task,
            commands::delete_task,
            commands::move_unfinished_to_today,
            commands::set_reminder,
            commands::open_settings,
            commands::open_main,
            commands::close_window,
            commands::reveal_data_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn toggle_applet(app: &tauri::AppHandle, near: Option<PhysicalPosition<f64>>) {
    let Some(window) = app.get_webview_window("applet") else {
        return;
    };
    let visible = window.is_visible().unwrap_or(false);
    if visible {
        let _ = window.hide();
        return;
    }

    if let Some(pos) = near {
        if let Ok(monitor) = window.current_monitor() {
            let size = window.outer_size().ok();
            let mut x = pos.x as i32;
            let mut y = pos.y as i32;

            if let (Some(monitor), Some(size)) = (monitor, size) {
                let mpos = monitor.position();
                let msize = monitor.size();
                x -= (size.width as i32) / 2;
                let max_x = mpos.x + (msize.width as i32) - (size.width as i32) - 8;
                let min_x = mpos.x + 8;
                x = x.clamp(min_x, max_x);
                // On macOS the menu bar is at the top — drop the window slightly below
                // the cursor so it doesn't cover the tray icon.
                y += 12;
            }
            let _ = window.set_position(PhysicalPosition::new(x, y));
        }
    }

    let _ = window.show();
    let _ = window.set_focus();
}

fn scan_reminders(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let dir = {
        let state = app.state::<SettingsState>();
        let s = state.0.lock().unwrap();
        PathBuf::from(&s.data_dir)
    };
    if !dir.exists() {
        return Ok(());
    }
    let buckets = storage::list_buckets(&dir)?;
    let now = Utc::now();
    for bucket in buckets {
        let mut day = storage::load_bucket(&dir, &bucket)?;
        let mut changed = false;
        let mut to_fire: Vec<(String, String)> = vec![];
        for task in day.tasks.iter_mut() {
            if task.done || task.reminder_fired {
                continue;
            }
            if let Some(due) = task.reminder_at {
                if due <= now {
                    to_fire.push((task.title.clone(), task.priority.clone()));
                    task.reminder_fired = true;
                    changed = true;
                }
            }
        }
        if changed {
            storage::save_bucket(&dir, &day)?;
            let _ = app.emit("tasks:changed", &bucket);
        }
        for (title, priority) in to_fire {
            let body = if priority == "high" {
                format!("[High priority] {title}")
            } else {
                title
            };
            let _ = app
                .notification()
                .builder()
                .title("Task reminder")
                .body(body)
                .show();
        }
    }
    Ok(())
}
