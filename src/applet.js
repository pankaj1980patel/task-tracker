import { api, on, escapeHtml, toast } from "./lib/api.js";

const els = {};
let state = { bucket: null, tasks: [] };

function init() {
  els.title = document.getElementById("applet-title");
  els.priority = document.getElementById("applet-priority");
  els.form = document.getElementById("applet-form");
  els.list = document.getElementById("applet-list");
  els.summary = document.getElementById("applet-summary");
  els.openMain = document.getElementById("applet-open");
  els.settings = document.getElementById("applet-settings");
  els.date = document.getElementById("applet-date");

  els.form.addEventListener("submit", onAdd);
  els.openMain.addEventListener("click", () => api.openMain());
  els.settings.addEventListener("click", () => api.openSettings());
  els.list.addEventListener("click", onListClick);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") api.closeWindow();
  });

  on("tasks:changed", () => refresh());
  on("settings:updated", () => refresh());

  // Refocus on show — Tauri runs the script once but the window may be hidden/shown.
  window.addEventListener("focus", () => {
    els.title?.focus();
    refresh();
  });

  refresh();
}

async function refresh() {
  state.bucket = await api.currentBucket();
  els.date.textContent = state.bucket;
  const res = await api.getTasks(state.bucket);
  state.tasks = res.tasks;
  render();
}

function render() {
  const order = { high: 0, normal: 1, low: 2 };
  const sorted = [...state.tasks].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return (order[a.priority] ?? 1) - (order[b.priority] ?? 1);
  });
  if (!sorted.length) {
    els.list.innerHTML = `<div class="empty" style="padding:24px 8px">No tasks yet today.</div>`;
  } else {
    els.list.innerHTML = sorted.map(taskHTML).join("");
  }
  const open = state.tasks.filter((t) => !t.done).length;
  const done = state.tasks.length - open;
  els.summary.textContent = `${done}/${state.tasks.length} done`;
}

function taskHTML(t) {
  return `
    <div class="task ${t.done ? "done" : ""}" data-id="${escapeHtml(t.id)}">
      <span class="check" data-action="toggle"></span>
      <div class="body">
        <div class="title">${escapeHtml(t.title)}</div>
        <div class="meta">
          <span class="pri ${escapeHtml(t.priority)}">${escapeHtml(t.priority)}</span>
        </div>
      </div>
      <div class="actions">
        <button class="ghost" data-action="delete" title="Delete">✕</button>
      </div>
    </div>`;
}

async function onAdd(e) {
  e.preventDefault();
  const title = els.title.value.trim();
  if (!title) return;
  try {
    await api.addTask({
      title,
      priority: els.priority.value,
      tags: [],
      notes: "",
    });
    els.title.value = "";
    els.title.focus();
  } catch (err) {
    toast(`Error: ${err}`);
  }
}

async function onListClick(e) {
  const taskEl = e.target.closest(".task");
  if (!taskEl) return;
  const id = taskEl.dataset.id;
  const action = e.target.dataset.action;
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return;
  if (action === "toggle") {
    await api.updateTask({ bucket: state.bucket, id, done: !task.done });
  } else if (action === "delete") {
    await api.deleteTask(state.bucket, id);
  }
}

window.addEventListener("DOMContentLoaded", init);
