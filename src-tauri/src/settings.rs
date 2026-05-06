use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    /// Folder where daily task files are stored. Point this at a Google Drive
    /// synced folder (or any cloud-synced folder) for automatic backup.
    pub data_dir: String,
    /// "daily" | "weekly" — granularity for task files.
    pub file_granularity: String,
    /// Show Dock/taskbar icon in addition to tray? (macOS mostly)
    pub show_in_dock: bool,
}

impl Settings {
    pub fn defaults(app: &AppHandle) -> Self {
        let default_dir = default_data_dir(app);
        Self {
            data_dir: default_dir.to_string_lossy().to_string(),
            file_granularity: "daily".to_string(),
            show_in_dock: true,
        }
    }
}

pub struct SettingsState(pub Mutex<Settings>);

fn config_path(app: &AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_config_dir()
        .expect("app_config_dir not available");
    std::fs::create_dir_all(&dir).ok();
    dir.join("settings.json")
}

fn default_data_dir(app: &AppHandle) -> PathBuf {
    let dir = app
        .path()
        .document_dir()
        .or_else(|_| app.path().app_data_dir())
        .expect("no documents dir");
    dir.join("TaskTracker")
}

pub fn load(app: &AppHandle) -> Settings {
    let path = config_path(app);
    if let Ok(text) = std::fs::read_to_string(&path) {
        if let Ok(s) = serde_json::from_str::<Settings>(&text) {
            std::fs::create_dir_all(&s.data_dir).ok();
            return s;
        }
    }
    let s = Settings::defaults(app);
    std::fs::create_dir_all(&s.data_dir).ok();
    save(app, &s).ok();
    s
}

pub fn save(app: &AppHandle, settings: &Settings) -> std::io::Result<()> {
    let path = config_path(app);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let text = serde_json::to_string_pretty(settings)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    std::fs::write(path, text)
}
