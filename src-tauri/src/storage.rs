use chrono::{DateTime, Datelike, Local, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub done: bool,
    /// "low" | "normal" | "high"
    #[serde(default = "default_priority")]
    pub priority: String,
    #[serde(default)]
    pub tags: Vec<String>,
    pub created_at: DateTime<Utc>,
    #[serde(default)]
    pub completed_at: Option<DateTime<Utc>>,
    /// The date this task is filed under: YYYY-MM-DD (or YYYY-Www for weekly).
    pub bucket: String,
}

fn default_priority() -> String {
    "normal".into()
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DayFile {
    pub bucket: String,
    pub tasks: Vec<Task>,
}

pub fn current_bucket(granularity: &str) -> String {
    let now = Local::now();
    match granularity {
        "weekly" => {
            let iso = now.iso_week();
            format!("{}-W{:02}", iso.year(), iso.week())
        }
        _ => now.format("%Y-%m-%d").to_string(),
    }
}

pub fn bucket_for_date(granularity: &str, date: NaiveDate) -> String {
    match granularity {
        "weekly" => {
            let iso = date.iso_week();
            format!("{}-W{:02}", iso.year(), iso.week())
        }
        _ => date.format("%Y-%m-%d").to_string(),
    }
}

fn file_for_bucket(data_dir: &Path, bucket: &str) -> PathBuf {
    data_dir.join(format!("{bucket}.json"))
}

pub fn load_bucket(data_dir: &Path, bucket: &str) -> std::io::Result<DayFile> {
    std::fs::create_dir_all(data_dir)?;
    let path = file_for_bucket(data_dir, bucket);
    if !path.exists() {
        return Ok(DayFile {
            bucket: bucket.to_string(),
            tasks: vec![],
        });
    }
    let text = std::fs::read_to_string(&path)?;
    let mut day: DayFile = serde_json::from_str(&text)
        .unwrap_or_else(|_| DayFile { bucket: bucket.to_string(), tasks: vec![] });
    if day.bucket.is_empty() {
        day.bucket = bucket.to_string();
    }
    Ok(day)
}

pub fn save_bucket(data_dir: &Path, day: &DayFile) -> std::io::Result<()> {
    std::fs::create_dir_all(data_dir)?;
    let path = file_for_bucket(data_dir, &day.bucket);
    let text = serde_json::to_string_pretty(day)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    std::fs::write(path, text)
}

pub fn list_buckets(data_dir: &Path) -> std::io::Result<Vec<String>> {
    std::fs::create_dir_all(data_dir)?;
    let mut out = vec![];
    for entry in std::fs::read_dir(data_dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) == Some("json") {
            if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                out.push(stem.to_string());
            }
        }
    }
    out.sort();
    out.reverse();
    Ok(out)
}
