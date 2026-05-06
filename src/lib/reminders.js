import { api, toast } from "./api.js";

export function fmtReminder(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow =
    d.getFullYear() === tomorrow.getFullYear() &&
    d.getMonth() === tomorrow.getMonth() &&
    d.getDate() === tomorrow.getDate();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return time;
  if (isTomorrow) return `Tomorrow ${time}`;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  }) + ` ${time}`;
}

function presetIso(kind) {
  const now = new Date();
  switch (kind) {
    case "30m":
      return new Date(now.getTime() + 30 * 60_000).toISOString();
    case "1h":
      return new Date(now.getTime() + 60 * 60_000).toISOString();
    case "3h":
      return new Date(now.getTime() + 3 * 60 * 60_000).toISOString();
    case "tomorrow9": {
      const t = new Date(now);
      t.setDate(t.getDate() + 1);
      t.setHours(9, 0, 0, 0);
      return t.toISOString();
    }
    case "tonight": {
      const t = new Date(now);
      t.setHours(20, 0, 0, 0);
      if (t <= now) t.setDate(t.getDate() + 1);
      return t.toISOString();
    }
    default:
      return null;
  }
}

function localDatetimeValue(iso) {
  // Convert ISO UTC string to value compatible with <input type="datetime-local">.
  const d = iso ? new Date(iso) : new Date(Date.now() + 60 * 60_000);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

let openMenu = null;
function closeMenu() {
  if (openMenu) {
    openMenu.remove();
    document.removeEventListener("mousedown", outsideClick, true);
    openMenu = null;
  }
}
function outsideClick(e) {
  if (openMenu && !openMenu.contains(e.target)) closeMenu();
}

export function openReminderMenu(anchor, task, bucket, onChanged) {
  closeMenu();

  const menu = document.createElement("div");
  menu.className = "reminder-menu";
  const hasReminder = !!task.reminder_at;
  menu.innerHTML = `
    <button data-kind="30m">In 30 minutes</button>
    <button data-kind="1h">In 1 hour</button>
    <button data-kind="3h">In 3 hours</button>
    <button data-kind="tonight">Tonight 8 PM</button>
    <button data-kind="tomorrow9">Tomorrow 9 AM</button>
    <div class="rm-sep"></div>
    <label class="rm-label">Custom</label>
    <div class="rm-custom">
      <input type="datetime-local" value="${localDatetimeValue(task.reminder_at)}" />
      <button data-kind="custom" class="primary">Set</button>
    </div>
    ${
      hasReminder
        ? `<div class="rm-sep"></div><button data-kind="clear" class="danger">Clear reminder</button>`
        : ""
    }
  `;

  document.body.appendChild(menu);

  // Position under the anchor, clamped to viewport.
  const rect = anchor.getBoundingClientRect();
  const mw = 240;
  let left = rect.right - mw;
  if (left < 8) left = 8;
  if (left + mw > window.innerWidth - 8) left = window.innerWidth - mw - 8;
  menu.style.left = `${left}px`;
  menu.style.top = `${rect.bottom + 4}px`;

  openMenu = menu;
  setTimeout(() => document.addEventListener("mousedown", outsideClick, true), 0);

  menu.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const kind = btn.dataset.kind;
    if (!kind) return;
    let dueAt = null;
    if (kind === "custom") {
      const input = menu.querySelector("input[type=datetime-local]");
      if (!input.value) {
        toast("Pick a date and time first");
        return;
      }
      dueAt = new Date(input.value).toISOString();
    } else if (kind === "clear") {
      dueAt = null;
    } else {
      dueAt = presetIso(kind);
    }
    closeMenu();
    try {
      await api.setReminder(bucket, task.id, dueAt);
      toast(dueAt ? `Reminder set: ${fmtReminder(dueAt)}` : "Reminder cleared");
      onChanged?.();
    } catch (err) {
      toast(`Error: ${err}`);
    }
  });
}
