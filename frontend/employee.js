// ── Auth & Init ───────────────────────────────────────────────────────────────
let session = null;

async function init() {
  try {
    const res = await fetch("/api/auth/me");
    if (!res.ok) return redirect("/login.html");
    session = await res.json();
    if (session.role !== "employee") return redirect("/manager.html");

    const initials = session.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
    document.getElementById("user-avatar").textContent    = initials;
    document.getElementById("user-name").textContent      = session.name;
    document.getElementById("topbar-user-id").textContent = session.employeeId;

    renderIcons();
    setupNav();
    loadOverview();
  } catch {
    redirect("/login.html");
  }
}

function redirect(path) { window.location.href = path; }
function renderIcons() { if (window.lucide) lucide.createIcons(); }

document.getElementById("logout-btn").addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST" });
  redirect("/login.html");
});

// ── Navigation ────────────────────────────────────────────────────────────────
const sections = {
  overview:        { el: document.getElementById("section-overview"),        label: "Overview",            load: loadOverview },
  upload:          { el: document.getElementById("section-upload"),          label: "Upload Conversation", load: null },
  live:            { el: document.getElementById("section-live"),            label: "Live Session",        load: loadLiveSessions },
  history:         { el: document.getElementById("section-history"),         label: "History",             load: loadHistory },
  trends:          { el: document.getElementById("section-trends"),          label: "Trends",              load: loadTrends },
  recommendations: { el: document.getElementById("section-recommendations"), label: "Recommendations",     load: loadRecommendations },
};

function setupNav() {
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => activateSection(btn.dataset.section));
  });
}

function activateSection(key) {
  document.querySelectorAll(".nav-item").forEach((b) =>
    b.classList.toggle("active", b.dataset.section === key)
  );
  Object.entries(sections).forEach(([k, s]) =>
    s.el.classList.toggle("active", k === key)
  );
  document.getElementById("page-title").textContent = sections[key].label;
  if (sections[key].load) sections[key].load();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function scoreClass(s) { return s >= 80 ? "high" : s >= 60 ? "medium" : "low"; }

function scorePill(s) {
  return s !== null && s !== undefined
    ? `<span class="score-pill score-${scoreClass(s)}">${s}/100</span>`
    : `<span class="score-pill score-neutral">—</span>`;
}

function langTag(lang) {
  const map = { English: "en", Hindi: "hi", Bengali: "bn", Assamese: "as", Nepali: "ne", Mixed: "mixed" };
  const cls = map[lang] || "mixed";
  return lang ? `<span class="lang-tag lang-${cls}">${lang}</span>` : "";
}

function yesNo(v) {
  return v
    ? `<span style="color:var(--success);font-weight:700;">Yes</span>`
    : `<span style="color:var(--danger);font-weight:700;">No</span>`;
}

function formatDate(ts) {
  return new Date(ts).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function truncate(str, n) { return str && str.length > n ? str.slice(0, n) + "…" : (str || ""); }

function loading() {
  return `<div class="spinner-wrap"><div class="spinner"></div><span>Loading...</span></div>`;
}

function empty(msg = "No data available.") {
  return `<div class="empty-state">
    <i data-lucide="inbox"></i>
    <p>${msg}</p>
  </div>`;
}

// ── Overview ──────────────────────────────────────────────────────────────────
async function loadOverview() {
  try {
    const [avgRes, histRes] = await Promise.all([
      fetch("/api/employees/me/average"),
      fetch("/api/employees/me/history"),
    ]);
    const avgData  = await avgRes.json();
    const histData = await histRes.json();
    const history  = histData.history || [];

    document.getElementById("stat-total").textContent = avgData.conversationCount ?? 0;
    document.getElementById("stat-avg").textContent   = avgData.averageScore !== null ? `${avgData.averageScore}/100` : "—";
    document.getElementById("stat-last").textContent  = history[0] ? `${history[0].evaluation.overallScore}/100` : "—";

    const weekAgo = new Date(Date.now() - 7 * 86400000);
    document.getElementById("stat-week").textContent =
      history.filter((h) => new Date(h.timestamp) > weekAgo).length;

    const recentEl = document.getElementById("overview-recent");
    recentEl.innerHTML = history.length === 0
      ? empty("No conversations yet. Upload one to get started.")
      : history.slice(0, 6).map((c) => `
          <div class="history-item">
            <span class="history-date">${formatDate(c.timestamp)}</span>
            <span class="history-preview">${truncate(c.transcript, 70)}</span>
            ${langTag(c.detectedLanguage)}
            ${scorePill(c.evaluation.overallScore)}
          </div>`).join("");

    const latestRecs = history.flatMap((c) => c.evaluation.recommendations).slice(0, 5);
    document.getElementById("overview-recs").innerHTML = latestRecs.length === 0
      ? empty("Recommendations appear after your first analysis.")
      : `<div class="recs-list">${latestRecs.map((r) => `
          <div class="rec-item">
            <span class="rec-icon"><i data-lucide="lightbulb"></i></span>${r}
          </div>`).join("")}</div>`;

    renderIcons();
  } catch (err) {
    console.error("Overview error:", err.message);
  }
}

// ── Upload ────────────────────────────────────────────────────────────────────
const audioInput      = document.getElementById("audio-input");
const uploadZone      = document.getElementById("upload-zone");
const uploadLabelText = document.getElementById("upload-label-text");
const analyzeBtn      = document.getElementById("analyze-btn");
const uploadFeedback  = document.getElementById("upload-feedback");
const resultContainer = document.getElementById("result-container");

uploadZone.addEventListener("click", () => audioInput.click());
audioInput.addEventListener("change", () => {
  if (audioInput.files.length > 0) {
    uploadLabelText.textContent = audioInput.files[0].name;
    uploadZone.classList.add("has-file");
    clearFeedback();
  }
});
analyzeBtn.addEventListener("click", runAnalysis);

async function runAnalysis() {
  if (!audioInput.files.length) { showError("Please select an audio file first."); return; }
  clearFeedback();
  resultContainer.classList.add("hidden");
  setUploading(true, "Uploading audio file...");
  const formData = new FormData();
  formData.append("audio", audioInput.files[0]);
  try {
    setUploading(true, "Transcribing and analyzing — this may take 30–60 seconds...");
    const res  = await fetch("/api/analyze", { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Analysis failed.");
    clearFeedback();
    renderResult(data);
  } catch (err) {
    clearFeedback();
    showError(err.message);
  } finally {
    analyzeBtn.disabled = false;
  }
}

function setUploading(active, text = "") {
  analyzeBtn.disabled = active;
  if (active) {
    uploadFeedback.innerHTML = `
      <div class="status-bar" style="margin-top:12px;">
        <div class="spinner" style="width:16px;height:16px;border-width:2px;flex-shrink:0;"></div>
        <span>${text}</span>
      </div>`;
  }
}
function showError(msg) {
  uploadFeedback.innerHTML = `<div class="form-error" style="margin-top:10px;">${msg}</div>`;
}
function clearFeedback() { uploadFeedback.innerHTML = ""; }

function renderResult(data) {
  const ev = data.evaluation;
  const sc = scoreClass(ev.overallScore);

  document.getElementById("scorecard-wrap").innerHTML = buildScorecard({
    title:     "Conversation Scorecard",
    meta:      `ID #${data.conversationId} &nbsp;&middot;&nbsp; ${langTag(data.detectedLanguage)}`,
    score:     ev.overallScore,
    scoreClass: sc,
    evaluation: ev,
  });

  document.getElementById("result-recs").innerHTML = ev.recommendations.length
    ? ev.recommendations.map((r) => `
        <div class="rec-item">
          <span class="rec-icon"><i data-lucide="lightbulb"></i></span>${r}
        </div>`).join("")
    : `<p class="text-muted text-sm">No specific recommendations.</p>`;

  document.getElementById("result-lang-badge").innerHTML = langTag(data.detectedLanguage);
  document.getElementById("result-transcript").textContent = data.transcript;

  resultContainer.classList.remove("hidden");
  resultContainer.scrollIntoView({ behavior: "smooth", block: "start" });
  renderIcons();
}

function buildScorecard({ title, meta, score, scoreClass, evaluation: ev }) {
  return `
    <div class="card">
      <div class="scorecard-header">
        <div>
          <div class="scorecard-title">${title}</div>
          <div class="scorecard-meta">${meta}</div>
        </div>
        <div class="scorecard-score">
          <div class="scorecard-score-value s-${scoreClass}">${score}</div>
          <div class="scorecard-score-label">out of 100</div>
        </div>
      </div>
      <div class="metrics-row">
        ${mc("Greeting",       yesNo(ev.greeting))}
        ${mc("Politeness",     `${ev.politeness}/10`)}
        ${mc("Engagement",     `${ev.customerEngagement}/10`)}
        ${mc("Upselling",      `${ev.upselling}/10`)}
        ${mc("Combo",          yesNo(ev.comboRecommendation))}
        ${mc("Discount",       yesNo(ev.discountMentioned))}
        ${mc("Complaint",      fmtComplaint(ev.complaintHandling))}
        ${mc("Professionalism",`${ev.professionalism}/10`)}
      </div>
    </div>`;
}

function mc(label, value) {
  return `<div class="metric-cell">
    <div class="metric-cell-label">${label}</div>
    <div class="metric-cell-value">${value}</div>
  </div>`;
}
function fmtComplaint(v) {
  return v === "N/A" || v === null || v === undefined ? "N/A" : `${v}/10`;
}

// ── History ───────────────────────────────────────────────────────────────────
async function loadHistory() {
  const el = document.getElementById("history-content");
  el.innerHTML = loading();
  try {
    const res  = await fetch("/api/employees/me/history");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    const history = data.history || [];
    if (history.length === 0) { el.innerHTML = empty("No conversations recorded yet."); renderIcons(); return; }

    el.innerHTML = `
      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr>
            <th>Date &amp; Time</th>
            <th>Language</th>
            <th>Score</th>
            <th>Politeness</th>
            <th>Upselling</th>
            <th>Engagement</th>
            <th>Transcript</th>
          </tr></thead>
          <tbody>
            ${history.map((c) => `<tr>
              <td style="white-space:nowrap;color:var(--text-2);">${formatDate(c.timestamp)}</td>
              <td>${langTag(c.detectedLanguage)}</td>
              <td>${scorePill(c.evaluation.overallScore)}</td>
              <td style="color:var(--text-2);">${c.evaluation.politeness}/10</td>
              <td style="color:var(--text-2);">${c.evaluation.upselling}/10</td>
              <td style="color:var(--text-2);">${c.evaluation.customerEngagement}/10</td>
              <td style="color:var(--text-3);font-size:12px;">${truncate(c.transcript, 55)}</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>`;
    renderIcons();
  } catch (err) {
    el.innerHTML = `<div class="card-body"><p class="form-error">${err.message}</p></div>`;
  }
}

// ── Trends ────────────────────────────────────────────────────────────────────
async function loadTrends() {
  const el = document.getElementById("trends-content");
  el.innerHTML = loading();
  try {
    const [trendsRes, avgRes] = await Promise.all([
      fetch("/api/employees/me/trends"),
      fetch("/api/employees/me/average"),
    ]);
    const trendsData = await trendsRes.json();
    const avgData    = await avgRes.json();

    document.getElementById("trends-avg").textContent   = avgData.averageScore !== null ? `${avgData.averageScore}/100` : "—";
    document.getElementById("trends-count").textContent = avgData.conversationCount ?? 0;

    const trends = trendsData.trends || [];
    if (trends.length === 0) { el.innerHTML = empty("No trend data yet."); renderIcons(); return; }

    el.innerHTML = `
      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr>
            <th>#</th>
            <th>Date &amp; Time</th>
            <th>Score</th>
            <th>Performance</th>
          </tr></thead>
          <tbody>
            ${trends.map((t, i) => {
              const color = t.overallScore >= 80 ? "var(--success)"
                          : t.overallScore >= 60 ? "var(--warning)"
                          : "var(--danger)";
              return `<tr>
                <td style="color:var(--text-3);font-size:12px;">${i + 1}</td>
                <td style="color:var(--text-2);white-space:nowrap;">${formatDate(t.timestamp)}</td>
                <td>${scorePill(t.overallScore)}</td>
                <td>
                  <div style="display:flex;align-items:center;gap:8px;">
                    <div style="width:100px;height:4px;background:var(--border);border-radius:2px;flex-shrink:0;">
                      <div style="width:${t.overallScore}%;height:4px;background:${color};border-radius:2px;"></div>
                    </div>
                    <span style="font-size:11.5px;color:var(--text-3);">${t.overallScore}</span>
                  </div>
                </td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>`;
    renderIcons();
  } catch (err) {
    el.innerHTML = `<div class="card-body"><p class="form-error">${err.message}</p></div>`;
  }
}

// ── Recommendations ───────────────────────────────────────────────────────────
async function loadRecommendations() {
  const el = document.getElementById("recs-content");
  el.innerHTML = loading();
  try {
    const res  = await fetch("/api/employees/me/history");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    const history = data.history || [];
    if (history.length === 0) {
      el.innerHTML = empty("Complete your first analysis to see recommendations.");
      renderIcons(); return;
    }
    const counts = {};
    history.forEach((c) => {
      (c.evaluation.recommendations || []).forEach((r) => { counts[r] = (counts[r] || 0) + 1; });
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    el.innerHTML = sorted.length === 0
      ? empty("No recommendations recorded yet.")
      : `<div class="recs-list">
          ${sorted.map(([rec, count]) => `
            <div class="rec-item">
              <span class="rec-icon"><i data-lucide="lightbulb"></i></span>
              <span style="flex:1;">${rec}</span>
              <span class="badge badge-gray">${count}x</span>
            </div>`).join("")}
         </div>`;
    renderIcons();
  } catch (err) {
    el.innerHTML = `<p class="form-error">${err.message}</p>`;
  }
}

// ═══════════════════════════════════════════════════════════
// LIVE SESSION
// ═══════════════════════════════════════════════════════════
let mediaRecorder    = null;
let audioChunks      = [];
let timerInterval    = null;
let elapsedSeconds   = 0;
let currentSessionId = null;
let isPaused         = false;
const MIN_DURATION   = 15;

const recDot           = document.getElementById("rec-dot");
const liveStatusLabel  = document.getElementById("live-status-label");
const liveTimer        = document.getElementById("live-timer");
const waveform         = document.getElementById("waveform");
const sessionMeta      = document.getElementById("session-meta");
const durationWarning  = document.getElementById("duration-warning");
const liveFeedback     = document.getElementById("live-feedback");
const liveResultContainer = document.getElementById("live-result-container");
const btnStart   = document.getElementById("btn-start-recording");
const btnPause   = document.getElementById("btn-pause-recording");
const btnResume  = document.getElementById("btn-resume-recording");
const btnStop    = document.getElementById("btn-stop-recording");
const btnCancel  = document.getElementById("btn-cancel-recording");

function startTimer() {
  elapsedSeconds = 0;
  timerInterval = setInterval(() => {
    if (!isPaused) { elapsedSeconds++; liveTimer.textContent = formatSeconds(elapsedSeconds); }
  }, 1000);
}
function stopTimer() { clearInterval(timerInterval); timerInterval = null; }
function formatSeconds(s) {
  return `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
}

function setLiveUIState(state) {
  const states = {
    idle:       { dot: "",          label: "Ready to Record",  lc: "",           wc: "",       meta: false, start: true,  pause: false, resume: false, stop: false, cancel: false },
    recording:  { dot: "active",    label: "Recording",        lc: "recording",  wc: "active", meta: true,  start: false, pause: true,  resume: false, stop: true,  cancel: true  },
    paused:     { dot: "paused",    label: "Paused",           lc: "paused",     wc: "paused", meta: true,  start: false, pause: false, resume: true,  stop: true,  cancel: true  },
    processing: { dot: "processing",label: "Analyzing...",     lc: "processing", wc: "",       meta: true,  start: false, pause: false, resume: false, stop: false, cancel: false },
  };
  const s = states[state] || states.idle;
  recDot.className          = `rec-dot ${s.dot}`;
  liveStatusLabel.textContent = s.label;
  liveStatusLabel.className  = `live-status-label ${s.lc}`;
  waveform.className         = `waveform ${s.wc}`;
  sessionMeta.classList.toggle("hidden", !s.meta);
  [btnStart, btnPause, btnResume, btnStop, btnCancel].forEach((btn, i) => {
    const show = [s.start, s.pause, s.resume, s.stop, s.cancel][i];
    btn.classList.toggle("hidden", !show);
  });
  renderIcons();
}

function setSessionChips(sessionId) {
  document.getElementById("chip-session-id").textContent = sessionId ? sessionId.slice(0, 8) + "…" : "—";
  document.getElementById("chip-employee").textContent   = session ? session.employeeId : "—";
}

function setLiveFeedback(type, text) {
  if (type === "status") {
    liveFeedback.innerHTML = `
      <div class="status-bar" style="margin-top:12px;">
        <div class="spinner" style="width:16px;height:16px;border-width:2px;flex-shrink:0;"></div>
        <span>${text}</span>
      </div>`;
  } else if (type === "error") {
    liveFeedback.innerHTML = `<div class="form-error" style="margin-top:10px;">${text}</div>`;
  } else {
    liveFeedback.innerHTML = "";
  }
}

btnStart.addEventListener("click", async () => {
  liveResultContainer.classList.add("hidden");
  durationWarning.classList.add("hidden");
  setLiveFeedback("clear");
  liveTimer.textContent = "00:00";

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    setLiveFeedback("error", "Microphone access denied. Please allow microphone access and try again.");
    return;
  }

  try {
    const res  = await fetch("/api/live/start", { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not start session.");
    currentSessionId = data.sessionId;
    setSessionChips(currentSessionId);
  } catch (err) {
    stream.getTracks().forEach((t) => t.stop());
    setLiveFeedback("error", err.message);
    return;
  }

  audioChunks = [];
  isPaused    = false;
  const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
    ? "audio/webm;codecs=opus"
    : MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")
      ? "audio/ogg;codecs=opus" : "";

  mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) audioChunks.push(e.data); };
  mediaRecorder.start(500);
  startTimer();
  setLiveUIState("recording");
});

btnPause.addEventListener("click", () => {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.pause(); isPaused = true; setLiveUIState("paused");
  }
});

btnResume.addEventListener("click", () => {
  if (mediaRecorder && mediaRecorder.state === "paused") {
    mediaRecorder.resume(); isPaused = false; setLiveUIState("recording");
  }
});

btnStop.addEventListener("click", () => {
  if (!mediaRecorder) return;
  if (elapsedSeconds < MIN_DURATION) durationWarning.classList.remove("hidden");
  mediaRecorder.stop();
  mediaRecorder.stream.getTracks().forEach((t) => t.stop());
  stopTimer();
  setLiveUIState("processing");
  setLiveFeedback("status", "Transcribing and analyzing — this may take 30–60 seconds...");

  mediaRecorder.onstop = async () => {
    const mimeType = audioChunks[0]?.type || "audio/webm";
    const audioBlob = new Blob(audioChunks, { type: mimeType });
    const formData = new FormData();
    formData.append("audio", audioBlob, `session.${mimeType.split("/")[1].split(";")[0]}`);

    try {
      const res  = await fetch(`/api/live/stop/${currentSessionId}`, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed.");
      setLiveFeedback("clear");
      durationWarning.classList.add("hidden");
      renderLiveResult(data);
      loadLiveSessions();
    } catch (err) {
      setLiveFeedback("error", err.message);
    } finally {
      setLiveUIState("idle");
      currentSessionId = null;
      audioChunks = [];
    }
  };
});

btnCancel.addEventListener("click", async () => {
  if (mediaRecorder) { mediaRecorder.stream.getTracks().forEach((t) => t.stop()); mediaRecorder = null; }
  stopTimer();
  liveTimer.textContent = "00:00";
  audioChunks = []; isPaused = false;
  durationWarning.classList.add("hidden");
  setLiveFeedback("clear");
  setLiveUIState("idle");
  if (currentSessionId) {
    try { await fetch(`/api/live/cancel/${currentSessionId}`, { method: "POST" }); } catch (_) {}
    currentSessionId = null;
  }
});

function renderLiveResult(data) {
  const ev = data.evaluation;
  const sc = scoreClass(ev.overallScore);

  document.getElementById("live-scorecard-wrap").innerHTML = buildScorecard({
    title:     "Live Session Scorecard",
    meta:      `Conversation #${data.conversationId} &nbsp;&middot;&nbsp; ${langTag(data.detectedLanguage)} &nbsp;&middot;&nbsp; Duration ${formatSeconds(elapsedSeconds)}`,
    score:     ev.overallScore,
    scoreClass: sc,
    evaluation: ev,
  });

  document.getElementById("live-result-recs").innerHTML = ev.recommendations.length
    ? ev.recommendations.map((r) => `
        <div class="rec-item">
          <span class="rec-icon"><i data-lucide="lightbulb"></i></span>${r}
        </div>`).join("")
    : `<p class="text-muted text-sm">No specific recommendations.</p>`;

  document.getElementById("live-result-lang-badge").innerHTML = langTag(data.detectedLanguage);
  document.getElementById("live-result-transcript").textContent = data.transcript;

  liveResultContainer.classList.remove("hidden");
  liveResultContainer.scrollIntoView({ behavior: "smooth", block: "start" });
  renderIcons();
}

async function loadLiveSessions() {
  const el = document.getElementById("live-sessions-history");
  el.innerHTML = loading();
  try {
    const res  = await fetch("/api/live/my-sessions");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    const sessions = data.sessions || [];
    if (sessions.length === 0) { el.innerHTML = empty("No live sessions recorded yet."); renderIcons(); return; }

    el.innerHTML = `
      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr>
            <th>Date &amp; Time</th>
            <th>Status</th>
            <th>Duration</th>
            <th>Score</th>
            <th>Branch</th>
          </tr></thead>
          <tbody>
            ${sessions.map((s) => `<tr>
              <td style="color:var(--text-2);white-space:nowrap;">${formatDate(s.startedAt)}</td>
              <td><span class="session-status-pill ${s.status}">${capitalize(s.status)}</span></td>
              <td style="color:var(--text-2);">${s.durationSeconds !== null ? formatSeconds(s.durationSeconds) : "—"}</td>
              <td>${s.overallScore !== null ? scorePill(s.overallScore) : "—"}</td>
              <td style="color:var(--text-2);">${s.branchName || "—"}</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>`;
    renderIcons();
  } catch (err) {
    el.innerHTML = `<div class="card-body"><p class="form-error">${err.message}</p></div>`;
  }
}

function capitalize(str) { return str ? str.charAt(0).toUpperCase() + str.slice(1) : "—"; }

init();