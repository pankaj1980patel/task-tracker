// Thin wrapper over the Tauri invoke API.
const TAURI = window.__TAURI__;
const invoke = TAURI?.core?.invoke;
const listen = TAURI?.event?.listen;

export async function call(name, args) {
  if (!invoke) throw new Error("Tauri API unavailable");
  return invoke(name, args);
}

export async function on(event, handler) {
  if (!listen) return () => {};
  return listen(event, (e) => handler(e.payload));
}

export const api = {
  getSettings: () => call("get_settings"),
  updateSettings: (settings) => call("update_settings", { settings }),
  currentBucket: () => call("current_bucket"),
  listBuckets: () => call("list_buckets"),
  getTasks: (bucket) => call("get_tasks", { bucket: bucket ?? null }),
  addTask: (task) => call("add_task", { task }),
  updateTask: (payload) => call("update_task", { payload }),
  deleteTask: (bucket, id) => call("delete_task", { bucket, id }),
  moveUnfinishedToToday: (fromBucket) =>
    call("move_unfinished_to_today", { fromBucket }),
  setReminder: (bucket, id, dueAt) =>
    call("set_reminder", { bucket, id, dueAt: dueAt ?? null }),
  openSettings: () => call("open_settings"),
  openMain: () => call("open_main"),
  closeWindow: () => call("close_window"),
  revealDataDir: () => call("reveal_data_dir"),
};

export function fmtBucket(bucket) {
  if (!bucket) return "";
  if (bucket.includes("-W")) {
    const [year, week] = bucket.split("-W");
    return `Week ${parseInt(week, 10)}, ${year}`;
  }
  const d = new Date(bucket + "T00:00:00");
  if (Number.isNaN(d.getTime())) return bucket;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d - today) / 86400000);
  if (diff === 0) return "Today";
  if (diff === -1) return "Yesterday";
  if (diff === 1) return "Tomorrow";
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: d.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

export function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function toast(msg, parent = document.body) {
  let el = parent.querySelector(".toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    parent.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), 1800);
}
