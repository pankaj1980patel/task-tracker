import { api, toast } from "./lib/api.js";

const els = {};
let original = null;

async function init() {
  els.dataDir = document.getElementById("data-dir");
  els.granularity = document.getElementById("granularity");
  els.showInDock = document.getElementById("show-in-dock");
  els.save = document.getElementById("save");
  els.cancel = document.getElementById("cancel");
  els.reveal = document.getElementById("reveal");
  els.status = document.getElementById("status");

  els.save.addEventListener("click", onSave);
  els.cancel.addEventListener("click", () => api.closeWindow());
  els.reveal.addEventListener("click", () => api.revealDataDir());

  await load();
}

async function load() {
  const s = await api.getSettings();
  original = s;
  els.dataDir.value = s.data_dir || "";
  els.granularity.value = s.file_granularity || "daily";
  els.showInDock.checked = !!s.show_in_dock;
}

async function onSave() {
  const dataDir = els.dataDir.value.trim();
  if (!dataDir) {
    toast("Storage folder is required");
    return;
  }
  const settings = {
    data_dir: dataDir,
    file_granularity: els.granularity.value,
    show_in_dock: els.showInDock.checked,
  };
  els.save.disabled = true;
  els.status.textContent = "Saving…";
  try {
    await api.updateSettings(settings);
    els.status.textContent = "Saved";
    setTimeout(() => (els.status.textContent = ""), 1500);
  } catch (err) {
    els.status.textContent = "";
    toast(`Error: ${err}`);
  } finally {
    els.save.disabled = false;
  }
}

window.addEventListener("DOMContentLoaded", init);
