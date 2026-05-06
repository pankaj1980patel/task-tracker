import { api, on, fmtBucket, escapeHtml, toast } from "./lib/api.js";
import { fmtReminder, openReminderMenu } from "./lib/reminders.js";

const els = {};
let state = {
  bucket: null,
  tasks: [],
  buckets: [],
  today: null,
};

function init() {
  els.title = document.getElementById("add-title");
  els.priority = document.getElementById("add-priority");
  els.form = document.getElementById("add-form");
  els.list = document.getElementById("task-list");
  els.bucketSelect = document.getElementById("bucket-select");
  els.prev = document.getElementById("prev-bucket");
  els.next = document.getElementById("next-bucket");
  els.today = document.getElementById("today-btn");
  els.summary = document.getElementById("summary");
  els.settings = document.getElementById("settings-btn");
  els.reveal = document.getElementById("reveal-btn");
  els.rolloverBar = document.getElementById("rollover-bar");
  els.rolloverBtn = document.getElementById("rollover-btn");

  els.form.addEventListener("submit", onAdd);
  els.bucketSelect.addEventListener("change", () => loadBucket(els.bucketSelect.value));
  els.prev.addEventListener("click", () => stepBucket(-1));
  els.next.addEventListener("click", () => stepBucket(1));
  els.today.addEventListener("click", goToToday);
  els.settings.addEventListener("click", () => api.openSettings());
  els.reveal.addEventListener("click", () => api.revealDataDir());
  els.rolloverBtn.addEventListener("click", onRollover);

  els.list.addEventListener("click", onListClick);

  on("tasks:changed", () => refresh());
  on("settings:updated", () => refresh());

  refresh().then(() => goToToday());
}

async function refresh() {
  state.today = await api.currentBucket();
  const buckets = await api.listBuckets();
  // Always include today in the picker even if empty.
  if (!buckets.includes(state.today)) buckets.unshift(state.today);
  state.buckets = buckets;
  renderBucketPicker();
  if (state.bucket && state.buckets.includes(state.bucket)) {
    await loadBucket(state.bucket);
  } else {
    await loadBucket(state.today);
  }
}

function renderBucketPicker() {
  els.bucketSelect.innerHTML = state.buckets
    .map(
      (b) =>
        `<option value="${escapeHtml(b)}">${escapeHtml(fmtBucket(b))} — ${escapeHtml(b)}</option>`
    )
    .join("");
}

async function loadBucket(bucket) {
  state.bucket = bucket;
  els.bucketSelect.value = bucket;
  const res = await api.getTasks(bucket);
  state.tasks = res.tasks;
  renderTasks();
  renderSummary();
  renderRollover();
}

function renderTasks() {
  if (!state.tasks.length) {
    els.list.innerHTML = `<div class="empty">No tasks yet for ${escapeHtml(
      fmtBucket(state.bucket)
    )}. Add one above.</div>`;
    return;
  }
  // Sort: not done first, then by priority (high → low), then created.
  const order = { high: 0, normal: 1, low: 2 };
  const sorted = [...state.tasks].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    const p = (order[a.priority] ?? 1) - (order[b.priority] ?? 1);
    if (p) return p;
    return new Date(a.created_at) - new Date(b.created_at);
  });
  els.list.innerHTML = sorted.map(renderTaskHTML).join("");
}

function renderTaskHTML(t) {
  const tags = (t.tags || [])
    .map((tag) => `<span class="tag">#${escapeHtml(tag)}</span>`)
    .join("");
  const time = new Date(t.created_at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const rem = t.reminder_at
    ? `<span class="rem ${t.reminder_fired ? "fired" : ""}" title="${
        t.reminder_fired ? "Reminder fired" : "Reminder pending"
      }">🔔 ${escapeHtml(fmtReminder(t.reminder_at))}</span>`
    : "";
  return `
    <div class="task ${t.done ? "done" : ""}" data-id="${escapeHtml(t.id)}">
      <span class="check" data-action="toggle"></span>
      <div class="body">
        <div class="title" data-action="edit-title" title="Click to edit">${escapeHtml(
          t.title
        )}</div>
        <div class="meta">
          <span class="pri ${escapeHtml(t.priority)}">${escapeHtml(t.priority)}</span>
          <span>${time}</span>
          ${rem}
          ${tags}
        </div>
      </div>
      <div class="actions">
        <button class="icon ${t.reminder_at ? "has-reminder" : ""}" data-action="remind" title="Reminder">🔔</button>
        <button class="icon" data-action="delete" title="Delete">✕</button>
      </div>
    </div>`;
}

function renderSummary() {
  const total = state.tasks.length;
  const done = state.tasks.filter((t) => t.done).length;
  els.summary.innerHTML = `
    <span><strong>${done}</strong>/${total} done</span>
    <span>${total - done} open</span>
  `;
}

function renderRollover() {
  const isPast = state.bucket && state.bucket < state.today;
  const hasUnfinished = state.tasks.some((t) => !t.done);
  els.rolloverBar.style.display = isPast && hasUnfinished ? "block" : "none";
}

async function onAdd(e) {
  e.preventDefault();
  const title = els.title.value.trim();
  if (!title) return;
  const priority = els.priority.value;

  const task = { title, priority, tags: [], notes: "" };
  // If viewing a non-today bucket, file it under that bucket's date.
  if (state.bucket && /^\d{4}-\d{2}-\d{2}$/.test(state.bucket)) {
    task.date = state.bucket;
  }
  try {
    await api.addTask(task);
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
  const action =
    e.target.dataset.action || e.target.closest("[data-action]")?.dataset.action;
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return;

  if (action === "toggle") {
    await api.updateTask({ bucket: state.bucket, id, done: !task.done });
  } else if (action === "delete") {
    if (confirm(`Delete "${task.title}"?`)) {
      await api.deleteTask(state.bucket, id);
    }
  } else if (action === "edit-title") {
    const next = prompt("Edit task", task.title);
    if (next != null && next.trim() && next !== task.title) {
      await api.updateTask({ bucket: state.bucket, id, title: next.trim() });
    }
  } else if (action === "remind") {
    const anchor = e.target.closest("[data-action=remind]");
    openReminderMenu(anchor, task, state.bucket);
  }
}

function stepBucket(delta) {
  const idx = state.buckets.indexOf(state.bucket);
  if (idx === -1) return;
  // buckets are sorted descending (newest first)
  const next = state.buckets[idx - delta];
  if (next) loadBucket(next);
}

function goToToday() {
  if (state.today) loadBucket(state.today);
}

async function onRollover() {
  const moved = await api.moveUnfinishedToToday(state.bucket);
  toast(`Moved ${moved} task${moved === 1 ? "" : "s"} to today`);
  await refresh();
  goToToday();
}

window.addEventListener("DOMContentLoaded", init);
