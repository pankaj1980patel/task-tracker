import { api, on, fmtBucket, escapeHtml, toast } from "./lib/api.js";
import { fmtReminder, openReminderMenu } from "./lib/reminders.js";

const els = {};
let state = {
  bucket: null,
  today: null,
  tasks: [],
  buckets: [],
};

function init() {
  els.title = document.getElementById("applet-title");
  els.priority = document.getElementById("applet-priority");
  els.form = document.getElementById("applet-form");
  els.list = document.getElementById("applet-list");
  els.summary = document.getElementById("applet-summary");
  els.openMain = document.getElementById("applet-open");
  els.settings = document.getElementById("applet-settings");
  els.label = document.getElementById("applet-label");
  els.labelMain = els.label.querySelector(".main");
  els.labelSub = document.getElementById("applet-sub");
  els.prev = document.getElementById("applet-prev");
  els.next = document.getElementById("applet-next");
  els.todayBtn = document.getElementById("applet-today");
  els.addBtn = els.form.querySelector("button[type=submit]");

  els.form.addEventListener("submit", onAdd);
  els.openMain.addEventListener("click", () => api.openMain());
  els.settings.addEventListener("click", () => api.openSettings());
  els.list.addEventListener("click", onListClick);
  els.prev.addEventListener("click", () => stepBucket(-1));
  els.next.addEventListener("click", () => stepBucket(1));
  els.todayBtn.addEventListener("click", goToToday);
  els.label.addEventListener("click", (e) => openBucketDropdown(e.currentTarget));

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") api.closeWindow();
  });

  on("tasks:changed", () => refresh());
  on("settings:updated", () => refresh());

  window.addEventListener("focus", () => {
    els.title?.focus();
    refresh();
  });

  refresh();
}

async function refresh() {
  state.today = await api.currentBucket();
  const buckets = await api.listBuckets();
  if (!buckets.includes(state.today)) buckets.unshift(state.today);
  state.buckets = buckets;
  if (!state.bucket || !state.buckets.includes(state.bucket)) {
    state.bucket = state.today;
  }
  await loadBucket(state.bucket);
}

async function loadBucket(bucket) {
  state.bucket = bucket;
  const res = await api.getTasks(bucket);
  state.tasks = res.tasks;
  renderHeader();
  renderList();
}

function renderHeader() {
  const label = fmtBucket(state.bucket);
  els.labelMain.textContent = label;
  els.labelSub.textContent = state.bucket === label ? "" : state.bucket;
  // Disable next when at most-recent bucket
  const idx = state.buckets.indexOf(state.bucket);
  els.prev.disabled = idx === state.buckets.length - 1;
  els.next.disabled = idx <= 0;
  els.prev.style.opacity = els.prev.disabled ? "0.35" : "";
  els.next.style.opacity = els.next.disabled ? "0.35" : "";
  // Update add button label when not on today
  const onToday = state.bucket === state.today;
  els.addBtn.textContent = onToday ? "Add" : `Add to ${fmtBucket(state.bucket)}`;
}

function renderList() {
  const order = { high: 0, normal: 1, low: 2 };
  const sorted = [...state.tasks].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return (order[a.priority] ?? 1) - (order[b.priority] ?? 1);
  });
  if (!sorted.length) {
    els.list.innerHTML = `<div class="empty" style="padding:24px 8px">No tasks for ${escapeHtml(
      fmtBucket(state.bucket)
    )}.</div>`;
  } else {
    els.list.innerHTML = sorted.map(taskHTML).join("");
  }
  const open = state.tasks.filter((t) => !t.done).length;
  const done = state.tasks.length - open;
  els.summary.textContent = `${done}/${state.tasks.length} done`;
}

function taskHTML(t) {
  const rem = t.reminder_at
    ? `<span class="rem ${t.reminder_fired ? "fired" : ""}" title="${
        t.reminder_fired ? "Reminder fired" : "Reminder pending"
      }">🔔 ${escapeHtml(fmtReminder(t.reminder_at))}</span>`
    : "";
  return `
    <div class="task ${t.done ? "done" : ""}" data-id="${escapeHtml(t.id)}">
      <span class="check" data-action="toggle"></span>
      <div class="body">
        <div class="title">${escapeHtml(t.title)}</div>
        <div class="meta">
          <span class="pri ${escapeHtml(t.priority)}">${escapeHtml(t.priority)}</span>
          ${rem}
        </div>
      </div>
      <div class="actions">
        <button class="icon ${t.reminder_at ? "has-reminder" : ""}" data-action="remind" title="Reminder">🔔</button>
        <button class="icon" data-action="delete" title="Delete">✕</button>
      </div>
    </div>`;
}

async function onAdd(e) {
  e.preventDefault();
  const title = els.title.value.trim();
  if (!title) return;
  const task = {
    title,
    priority: els.priority.value,
    tags: [],
    notes: "",
  };
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
  const action = e.target.dataset.action || e.target.closest("[data-action]")?.dataset.action;
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return;
  if (action === "toggle") {
    await api.updateTask({ bucket: state.bucket, id, done: !task.done });
  } else if (action === "delete") {
    await api.deleteTask(state.bucket, id);
  } else if (action === "remind") {
    const anchor = e.target.closest("[data-action=remind]");
    openReminderMenu(anchor, task, state.bucket);
  }
}

function stepBucket(delta) {
  const idx = state.buckets.indexOf(state.bucket);
  if (idx === -1) return;
  // buckets are sorted descending — left arrow → older (idx + 1)
  const next = state.buckets[idx - delta];
  if (next) loadBucket(next);
}

function goToToday() {
  if (state.today) loadBucket(state.today);
}

let dropdown = null;
function closeDropdown() {
  if (dropdown) {
    dropdown.remove();
    document.removeEventListener("mousedown", outsideDropdownClick, true);
    dropdown = null;
  }
}
function outsideDropdownClick(e) {
  if (dropdown && !dropdown.contains(e.target) && !els.label.contains(e.target)) {
    closeDropdown();
  }
}
function openBucketDropdown(anchor) {
  if (dropdown) {
    closeDropdown();
    return;
  }
  dropdown = document.createElement("div");
  dropdown.className = "bucket-dropdown";
  dropdown.innerHTML = state.buckets
    .map(
      (b) =>
        `<button data-bucket="${escapeHtml(b)}" class="${
          b === state.bucket ? "active" : ""
        }">${escapeHtml(fmtBucket(b))}<span style="float:right;color:var(--text-dim);font-size:10px">${escapeHtml(
          b
        )}</span></button>`
    )
    .join("");
  document.body.appendChild(dropdown);
  const rect = anchor.getBoundingClientRect();
  dropdown.style.left = `${Math.max(8, rect.left)}px`;
  dropdown.style.top = `${rect.bottom + 4}px`;
  setTimeout(
    () => document.addEventListener("mousedown", outsideDropdownClick, true),
    0
  );
  dropdown.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-bucket]");
    if (!btn) return;
    const b = btn.dataset.bucket;
    closeDropdown();
    loadBucket(b);
  });
}

window.addEventListener("DOMContentLoaded", init);
