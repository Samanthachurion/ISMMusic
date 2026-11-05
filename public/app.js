// ISM Music — front end. Talks only to our own Netlify Functions (/api/*),
// which hold the Suno API key on the server.

const $ = (id) => document.getElementById(id);
const STORE_KEY = "ism-music-tasks-v1";
const PW_KEY = "ism-music-pw";
const POLL_MS = 6000;
const MAX_POLL_MS = 10 * 60 * 1000; // give up after 10 minutes

let mode = "simple";
const pollers = new Map();

/* ---------- storage ---------- */
function safeGet(key, fallback) {
  try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
}
function safeSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}
let tasks = safeGet(STORE_KEY, []);
const saveTasks = () => safeSet(STORE_KEY, tasks);

/* ---------- API ---------- */
async function api(path, options = {}) {
  const headers = { "content-type": "application/json" };
  const pw = safeGet(PW_KEY, "");
  if (pw) headers["x-app-password"] = pw;
  const res = await fetch(`/api/${path}`, { ...options, headers });
  let data;
  try { data = await res.json(); } catch { data = { code: res.status, msg: `Request failed (HTTP ${res.status})` }; }
  if (res.status === 401 && data.msg && /password/i.test(data.msg)) {
    await askPassword();
    return api(path, options);
  }
  if (data.code !== 200) throw new Error(friendlyError(data));
  return data.data;
}

function friendlyError({ code, msg }) {
  const map = {
    400: "Some settings weren't accepted.",
    401: "The Suno API key was rejected. Check SUNO_API_KEY in Netlify.",
    405: "Too many requests. Please wait a moment.",
    413: "Your description or lyrics are too long.",
    429: "Out of Suno credits. Top up at sunoapi.org.",
    430: "You're going too fast. Please try again shortly.",
    455: "Suno is under maintenance. Try again later.",
  };
  return msg && msg !== "success" ? `${map[code] ? map[code] + " " : ""}(${msg})` : map[code] || "Something went wrong.";
}

let pwPrompt = null;
function askPassword() {
  if (pwPrompt) return pwPrompt;
  return (pwPrompt = new Promise((resolve) => {
    const dlg = $("pwDialog");
    $("pwInput").value = "";
    dlg.showModal();
    dlg.addEventListener("close", function onClose() {
      dlg.removeEventListener("close", onClose);
      safeSet(PW_KEY, $("pwInput").value);
      $("lockBtn").hidden = false;
      pwPrompt = null;
      resolve();
    });
  }));
}

async function loadCredits() {
  try {
    const credits = await api("credits");
    $("credits").textContent = `Credits: ${credits}`;
  } catch {
    $("credits").textContent = "Credits: —";
  }
}

/* ---------- form ---------- */
document.querySelectorAll(".tab").forEach((tab) =>
  tab.addEventListener("click", () => {
    mode = tab.dataset.mode;
    document.querySelectorAll(".tab").forEach((t) => {
      t.classList.toggle("active", t === tab);
      t.setAttribute("aria-selected", t === tab);
    });
    document.querySelector(".mode-simple").hidden = mode !== "simple";
    document.querySelector(".mode-custom").hidden = mode !== "custom";
  })
);

document.querySelectorAll("[data-idea]").forEach((b) =>
  b.addEventListener("click", () => {
    $("prompt").value = b.dataset.idea;
    $("promptCount").textContent = b.dataset.idea.length;
  })
);

const counter = (input, out) => input.addEventListener("input", () => (out.textContent = input.value.length));
counter($("prompt"), $("promptCount"));
counter($("lyrics"), $("lyricsCount"));

$("instrumental").addEventListener("change", () => {
  const inst = $("instrumental").checked;
  $("lyrics").disabled = inst;
  $("aiLyricsBtn").disabled = inst;
  $("lyrics").placeholder = inst ? "Instrumental — no lyrics needed" : "[Verse]\nNeon lights on the highway\n\n[Chorus]\nWe're driving into the night...";
});

const VARIETY = ["Off", "Normal", "High", "Extra", "Max"];
const bindRange = (id, outId, fmt) => {
  const el = $(id), out = $(outId);
  const update = () => (out.textContent = fmt(Number(el.value)));
  el.addEventListener("input", update);
  update();
};
bindRange("duration", "durationOut", (v) => (v === 0 ? "auto" : `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`));
bindRange("styleWeight", "styleWeightOut", (v) => v.toFixed(2));
bindRange("weirdness", "weirdnessOut", (v) => v.toFixed(2));
bindRange("variety", "varietyOut", (v) => VARIETY[v]);

function showError(msg) {
  const el = $("formError");
  el.textContent = msg;
  el.hidden = !msg;
}

$("genForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  showError("");
  const instrumental = $("instrumental").checked;
  const model = $("model").value;
  let payload, label;

  if (mode === "simple") {
    const prompt = $("prompt").value.trim();
    if (!prompt) return showError("Describe the song you'd like to hear.");
    payload = { customMode: false, instrumental, model, prompt };
    label = prompt;
  } else {
    const style = $("style").value.trim();
    const lyrics = instrumental ? "" : $("lyrics").value.trim();
    const negativeTags = $("negativeTags").value.trim();
    if (!style && !lyrics && !negativeTags) return showError("Add a style of music or some lyrics.");
    const duration = Number($("duration").value);
    payload = {
      customMode: true, instrumental, model,
      title: $("title").value.trim(), style, lyrics, negativeTags,
      vocalGender: $("vocalGender").value,
      styleWeight: Number($("styleWeight").value),
      weirdnessConstraint: Number($("weirdness").value),
      variety: Number($("variety").value),
      ...(duration ? { duration } : {}),
    };
    label = payload.title || style || "Custom song";
  }

  const btn = $("genBtn");
  btn.disabled = true;
  btn.textContent = "Sending to the studio…";
  try {
    const { taskId } = await api("generate", { method: "POST", body: JSON.stringify(payload) });
    const task = { taskId, label, model, instrumental, createdAt: Date.now(), status: "PENDING", tracks: [] };
    tasks.unshift(task);
    saveTasks();
    render();
    poll(task);
    document.querySelector(".lib-head").scrollIntoView({ behavior: "smooth" });
  } catch (err) {
    showError(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "🎵 Create song";
  }
});

/* ---------- AI lyrics ---------- */
$("aiLyricsBtn").addEventListener("click", () => {
  $("aiLyricsBox").hidden = !$("aiLyricsBox").hidden;
  if (!$("aiLyricsBox").hidden) $("lyricsIdea").focus();
});

$("aiLyricsGo").addEventListener("click", async () => {
  const prompt = $("lyricsIdea").value.trim();
  if (!prompt) return $("lyricsIdea").focus();
  const go = $("aiLyricsGo");
  const box = $("lyricsOptions");
  go.disabled = true;
  go.textContent = "Writing…";
  box.hidden = true;
  showError("");
  try {
    const { taskId } = await api("lyrics", { method: "POST", body: JSON.stringify({ prompt }) });
    const started = Date.now();
    let info;
    while (Date.now() - started < 3 * 60 * 1000) {
      await new Promise((r) => setTimeout(r, 4000));
      info = await api(`lyrics?taskId=${encodeURIComponent(taskId)}`);
      if (info.status !== "PENDING") break;
    }
    if (!info || info.status !== "SUCCESS") throw new Error(statusText(info?.status, info?.errorMessage).text);
    const options = (info.response?.data || []).filter((o) => o.text);
    box.innerHTML = "";
    options.forEach((o, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "lyrics-option";
      const strong = document.createElement("strong");
      strong.textContent = `Option ${i + 1}${o.title ? ` — ${o.title}` : ""} (click to use)`;
      b.append(strong, document.createTextNode(o.text));
      b.addEventListener("click", () => {
        $("lyrics").value = o.text;
        $("lyricsCount").textContent = o.text.length;
        if (o.title && !$("title").value) $("title").value = o.title.slice(0, 80);
        box.hidden = true;
        $("aiLyricsBox").hidden = true;
      });
      box.append(b);
    });
    box.hidden = options.length === 0;
  } catch (err) {
    showError(`Couldn't write lyrics: ${err.message}`);
  } finally {
    go.disabled = false;
    go.textContent = "Generate";
  }
});

/* ---------- polling ---------- */
const DONE = new Set(["SUCCESS", "CREATE_TASK_FAILED", "GENERATE_AUDIO_FAILED", "GENERATE_LYRICS_FAILED", "CALLBACK_EXCEPTION", "SENSITIVE_WORD_ERROR", "TIMEOUT"]);

function poll(task) {
  if (DONE.has(task.status) || pollers.has(task.taskId)) return;
  const tick = async () => {
    try {
      const info = await api(`status?taskId=${encodeURIComponent(task.taskId)}`);
      task.status = info.status || task.status;
      task.errorMessage = info.errorMessage || "";
      const data = info.response?.sunoData || [];
      if (data.length) task.tracks = data;
    } catch (err) {
      task.lastError = err.message;
    }
    if (!DONE.has(task.status) && Date.now() - task.createdAt > MAX_POLL_MS) task.status = "TIMEOUT";
    saveTasks();
    renderTask(task);
    if (DONE.has(task.status)) {
      pollers.delete(task.taskId);
      loadCredits();
    } else {
      pollers.set(task.taskId, setTimeout(tick, POLL_MS));
    }
  };
  pollers.set(task.taskId, setTimeout(tick, 1500));
}

function statusText(status, errorMessage) {
  switch (status) {
    case "PENDING": return { text: "Composing…", cls: "wait", pct: 15 };
    case "TEXT_SUCCESS": return { text: "Lyrics ready, recording…", cls: "wait", pct: 40 };
    case "FIRST_SUCCESS": return { text: "First version ready…", cls: "wait", pct: 75 };
    case "SUCCESS": return { text: "Ready", cls: "ok", pct: 100 };
    case "SENSITIVE_WORD_ERROR": return { text: "Blocked: contains words that aren't allowed", cls: "err", pct: 100 };
    case "TIMEOUT": return { text: "Took too long — try again", cls: "err", pct: 100 };
    case undefined: case null: return { text: "Something went wrong", cls: "err", pct: 100 };
    default: return { text: errorMessage ? `Failed: ${errorMessage}` : "Generation failed", cls: "err", pct: 100 };
  }
}

/* ---------- rendering ---------- */
function render() {
  const lib = $("library");
  lib.innerHTML = "";
  tasks.forEach((t) => lib.append(buildTask(t)));
  $("emptyLib").hidden = tasks.length > 0;
  $("clearBtn").hidden = tasks.length === 0;
}

function renderTask(task) {
  const old = document.querySelector(`[data-task="${CSS.escape(task.taskId)}"]`);
  if (!old) return render();
  // Keep audio that's currently playing from being interrupted
  const playing = [...old.querySelectorAll("audio")].some((a) => !a.paused);
  if (playing && task.status !== "SUCCESS") return;
  old.replaceWith(buildTask(task));
}

function buildTask(task) {
  const el = $("taskTpl").content.firstElementChild.cloneNode(true);
  el.dataset.task = task.taskId;
  el.querySelector(".task-title").textContent = truncate(task.label, 90);
  el.querySelector(".task-meta").textContent =
    `${new Date(task.createdAt).toLocaleString()} · ${task.model}${task.instrumental ? " · Instrumental" : ""}`;

  const s = statusText(task.status, task.errorMessage);
  const badge = el.querySelector(".status");
  badge.textContent = s.text;
  badge.classList.add(s.cls);

  const prog = el.querySelector(".progress");
  if (s.cls === "wait") {
    el.querySelector(".bar").style.width = `${s.pct}%`;
    if (task.status === "PENDING") prog.classList.add("indeterminate");
  } else {
    prog.hidden = true;
  }

  const tracksEl = el.querySelector(".tracks");
  task.tracks.forEach((tr) => tracksEl.append(buildTrack(tr)));

  if (s.cls === "err" && !task.tracks.length) {
    const p = document.createElement("p");
    p.className = "task-error";
    p.textContent = "No credits are usually charged for failed songs. Try changing your description and creating again.";
    tracksEl.append(p);
  }
  return el;
}

function buildTrack(tr) {
  const el = $("trackTpl").content.firstElementChild.cloneNode(true);
  const img = el.querySelector(".cover");
  const placeholder = () => {
    const div = document.createElement("div");
    div.className = "cover";
    img.replaceWith(div);
  };
  if (tr.image_url) {
    img.src = tr.image_url;
    img.addEventListener("error", placeholder, { once: true });
  } else {
    placeholder();
  }
  el.querySelector(".track-title").textContent = tr.title || "Untitled";
  el.querySelector(".track-tags").textContent = [tr.tags, tr.duration ? fmtTime(tr.duration) : ""].filter(Boolean).join(" · ");

  const audio = el.querySelector("audio");
  const src = tr.audio_url || tr.stream_audio_url;
  if (src) audio.src = src;
  else audio.hidden = true;

  const dl = el.querySelector(".dl");
  if (tr.audio_url) {
    dl.href = tr.audio_url;
    dl.setAttribute("download", `${(tr.title || "song").replace(/[^\w\- ]+/g, "")}.mp3`);
  } else {
    dl.hidden = true;
  }

  const lyr = el.querySelector(".track-lyrics");
  const lyrBtn = el.querySelector(".show-lyrics");
  if (tr.prompt) {
    lyr.textContent = tr.prompt;
    lyrBtn.addEventListener("click", () => (lyr.hidden = !lyr.hidden));
  } else {
    lyrBtn.hidden = true;
  }
  return el;
}

const truncate = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + "…" : s || "");
const fmtTime = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;

$("clearBtn").addEventListener("click", () => {
  if (!confirm("Remove all songs from this list? (Download any you want to keep first.)")) return;
  pollers.forEach((t) => clearTimeout(t));
  pollers.clear();
  tasks = [];
  saveTasks();
  render();
});

$("lockBtn").addEventListener("click", async () => {
  await askPassword();
  loadCredits();
});
$("lockBtn").hidden = !safeGet(PW_KEY, "");

/* ---------- start ---------- */
render();
tasks.forEach(poll);
loadCredits();
