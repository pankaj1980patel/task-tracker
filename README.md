# Task Tracker

A small, local-first desktop task tracker built with **Tauri 2 + Rust + vanilla JS**.

It is designed for the way most people actually keep track of work day-to-day:

- One file per day (e.g. `2026-05-06.json`) — small, diff-friendly, easy to back up.
- A **menu-bar / tray applet** for instant capture and quick view of today's list.
- A **main window** for browsing past days and managing tasks.
- A **settings panel** to pick where files are stored — point it at a Google Drive,
  iCloud, or Dropbox folder and the daily files sync as you create them.

## Why daily files?

The single-file approach popular with Markdown-based to-do tools doesn't play
well with cloud sync — every change rewrites the whole file, conflicts happen,
and old data never archives off. Per-day files mean:

- Past days never change after the day is over → no false sync conflicts.
- Today's file is tiny → uploads are instant.
- Restoring from backup is just copying the folder.
- Weekly mode (`2026-W19.json`) is available for those who prefer fewer files.

## Project layout

```
task-tracker/
├── src/                 # frontend (no build step — plain HTML/CSS/JS)
│   ├── index.html       # main window
│   ├── applet.html      # tray popover (quick add + today)
│   ├── settings.html    # settings panel
│   ├── main.js / applet.js / settings.js
│   ├── lib/api.js       # thin wrapper around invoke()
│   └── styles.css
└── src-tauri/
    ├── Cargo.toml
    ├── tauri.conf.json
    ├── capabilities/default.json
    └── src/
        ├── main.rs
        ├── lib.rs       # builder, tray, windows
        ├── commands.rs  # invoke handlers
        ├── storage.rs   # daily/weekly JSON files
        └── settings.rs  # settings persistence
```

## Storage format

Each day is one file at `<data_dir>/YYYY-MM-DD.json`:

```json
{
  "bucket": "2026-05-06",
  "tasks": [
    {
      "id": "...",
      "title": "Ship task tracker MVP",
      "notes": "",
      "done": false,
      "priority": "high",
      "tags": [],
      "created_at": "2026-05-06T12:34:56Z",
      "completed_at": null,
      "bucket": "2026-05-06"
    }
  ]
}
```

Settings live in the OS app config dir (e.g. `~/Library/Application Support/com.tasktracker.app/settings.json`).

## Running it

Requires Rust and Node.js.

```bash
npm install
npm run tauri dev      # dev with hot-reload
npm run tauri build    # production .app / .dmg / .msi / .deb
```

The app runs as a tray-resident application:

- **Click the tray icon** → applet pops up under the icon for quick add.
- **Tray menu** → "Open Tracker" for the full window, "Settings…" for config.
- Closing windows hides them; quit from the tray menu.

## Settings

Open **Settings…** from the tray menu (or the gear icon in the app):

- **Storage folder** — where daily files are written. Set this to a Google
  Drive / iCloud / Dropbox synced folder for free backup & multi-device sync.
- **File granularity** — daily (default) or weekly.
- **Show in Dock / taskbar** — toggle visibility outside the menu bar.

## Backup / restore

Backup = copy the storage folder. Restore = put the folder back and point the
**Storage folder** setting at it. That's the entire workflow.
