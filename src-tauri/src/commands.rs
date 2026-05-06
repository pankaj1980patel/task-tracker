use crate::settings::{self, Settings, SettingsState};
use crate::storage::{self, Task};
use chrono::{NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager, State};

fn data_dir(state: &State<SettingsState>) -> PathBuf {
    let s = state.0.lock().unwrap();
    PathBuf::from(&s.data_dir)
}

fn granularity(state: &State<SettingsState>) -> String {
    state.0.lock().unwrap().file_granularity.clone()
}

#[derive(Debug, Deserialize)]
pub struct NewTask {
    pub title: String,
    #[serde(default)]
    pub notes: String,
    #[serde(default = "default_priority")]
    pub priority: String,
    #[serde(default)]
    pub tags: Vec<String>,
    /// Optional explicit bucket date (YYYY-MM-DD). Defaults to today.
    #[serde(default)]
    pub date: Option<String>,
}

fn default_priority() -> String {
    "normal".into()
}

#[derive(Debug, Serialize)]
pub struct TasksResponse {
    pub bucket: String,
    pub tasks: Vec<Task>,
}

#[tauri::command]
pub fn get_settings(state: State<'_, SettingsState>) -> Settings {
    state.0.lock().unwrap().clone()
}

#[tauri::command]
pub fn update_settings(
    app: AppHandle,
    state: State<'_, SettingsState>,
    settings: Settings,
) -> Result<Settings, String> {
    std::fs::create_dir_all(&settings.data_dir).map_err(|e| e.to_string())?;
    settings::save(&app, &settings).map_err(|e| e.to_string())?;
    {
        let mut s = state.0.lock().unwrap();
        *s = settings.clone();
    }
    let _ = app.emit("settings:updated", &settings);
    let _ = app.emit("tasks:changed", ());
    Ok(settings)
}

#[tauri::command]
pub fn current_bucket(state: State<'_, SettingsState>) -> String {
    storage::current_bucket(&granularity(&state))
}

#[tauri::command]
pub fn list_buckets(state: State<'_, SettingsState>) -> Result<Vec<String>, String> {
    storage::list_buckets(&data_dir(&state)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_tasks(
    state: State<'_, SettingsState>,
    bucket: Option<String>,
) -> Result<TasksResponse, String> {
    let g = granularity(&state);
    let bucket = bucket.unwrap_or_else(|| storage::current_bucket(&g));
    let day = storage::load_bucket(&data_dir(&state), &bucket).map_err(|e| e.to_string())?;
    Ok(TasksResponse {
        bucket: day.bucket,
        tasks: day.tasks,
    })
}

#[tauri::command]
pub fn add_task(
    app: AppHandle,
    state: State<'_, SettingsState>,
    task: NewTask,
) -> Result<Task, String> {
    let g = granularity(&state);
    let bucket = match task.date {
        Some(d) => {
            let parsed = NaiveDate::parse_from_str(&d, "%Y-%m-%d")
                .map_err(|e| format!("invalid date: {e}"))?;
            storage::bucket_for_date(&g, parsed)
        }
        None => storage::current_bucket(&g),
    };

    let dir = data_dir(&state);
    let mut day = storage::load_bucket(&dir, &bucket).map_err(|e| e.to_string())?;

    let new_task = Task {
        id: uuid::Uuid::new_v4().to_string(),
        title: task.title.trim().to_string(),
        notes: task.notes,
        done: false,
        priority: task.priority,
        tags: task.tags,
        created_at: Utc::now(),
        completed_at: None,
        bucket: bucket.clone(),
    };

    if new_task.title.is_empty() {
        return Err("title cannot be empty".into());
    }

    day.tasks.push(new_task.clone());
    storage::save_bucket(&dir, &day).map_err(|e| e.to_string())?;
    let _ = app.emit("tasks:changed", &bucket);
    Ok(new_task)
}

#[derive(Debug, Deserialize)]
pub struct UpdatePayload {
    pub bucket: String,
    pub id: String,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub notes: Option<String>,
    #[serde(default)]
    pub priority: Option<String>,
    #[serde(default)]
    pub tags: Option<Vec<String>>,
    #[serde(default)]
    pub done: Option<bool>,
}

#[tauri::command]
pub fn update_task(
    app: AppHandle,
    state: State<'_, SettingsState>,
    payload: UpdatePayload,
) -> Result<Task, String> {
    let dir = data_dir(&state);
    let mut day = storage::load_bucket(&dir, &payload.bucket).map_err(|e| e.to_string())?;
    let task = day
        .tasks
        .iter_mut()
        .find(|t| t.id == payload.id)
        .ok_or_else(|| "task not found".to_string())?;

    if let Some(t) = payload.title {
        task.title = t;
    }
    if let Some(n) = payload.notes {
        task.notes = n;
    }
    if let Some(p) = payload.priority {
        task.priority = p;
    }
    if let Some(tags) = payload.tags {
        task.tags = tags;
    }
    if let Some(d) = payload.done {
        if d && !task.done {
            task.completed_at = Some(Utc::now());
        } else if !d {
            task.completed_at = None;
        }
        task.done = d;
    }

    let result = task.clone();
    storage::save_bucket(&dir, &day).map_err(|e| e.to_string())?;
    let _ = app.emit("tasks:changed", &payload.bucket);
    Ok(result)
}

#[tauri::command]
pub fn delete_task(
    app: AppHandle,
    state: State<'_, SettingsState>,
    bucket: String,
    id: String,
) -> Result<(), String> {
    let dir = data_dir(&state);
    let mut day = storage::load_bucket(&dir, &bucket).map_err(|e| e.to_string())?;
    let before = day.tasks.len();
    day.tasks.retain(|t| t.id != id);
    if day.tasks.len() == before {
        return Err("task not found".into());
    }
    storage::save_bucket(&dir, &day).map_err(|e| e.to_string())?;
    let _ = app.emit("tasks:changed", &bucket);
    Ok(())
}

#[tauri::command]
pub fn move_unfinished_to_today(
    app: AppHandle,
    state: State<'_, SettingsState>,
    from_bucket: String,
) -> Result<usize, String> {
    let dir = data_dir(&state);
    let g = granularity(&state);
    let today = storage::current_bucket(&g);
    if today == from_bucket {
        return Ok(0);
    }
    let mut from = storage::load_bucket(&dir, &from_bucket).map_err(|e| e.to_string())?;
    let mut to = storage::load_bucket(&dir, &today).map_err(|e| e.to_string())?;

    let (keep, moved): (Vec<_>, Vec<_>) = from.tasks.drain(..).partition(|t| t.done);
    let count = moved.len();
    for mut t in moved {
        t.bucket = today.clone();
        to.tasks.push(t);
    }
    from.tasks = keep;

    storage::save_bucket(&dir, &from).map_err(|e| e.to_string())?;
    storage::save_bucket(&dir, &to).map_err(|e| e.to_string())?;
    let _ = app.emit("tasks:changed", &today);
    Ok(count)
}

#[tauri::command]
pub fn open_settings(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("settings") {
        w.show().map_err(|e| e.to_string())?;
        w.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn open_main(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("main") {
        w.show().map_err(|e| e.to_string())?;
        w.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn close_window(window: tauri::Window) -> Result<(), String> {
    window.hide().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn reveal_data_dir(app: AppHandle, state: State<'_, SettingsState>) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let dir = data_dir(&state);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.to_string_lossy().to_string();
    app.opener()
        .open_path(path, None::<&str>)
        .map_err(|e| e.to_string())
}
