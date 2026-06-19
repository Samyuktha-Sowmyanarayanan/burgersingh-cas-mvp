// ── Auth & Init ───────────────────────────────────────────────────────────────
let session = null;

async function init() {
  try {
    const res = await fetch("/api/auth/me");
    if (!res.ok) return redirect("/login.html");
    session = await res.json();
    if (session.role !== "employee") return redirect("/manager.html");

    const initials = session.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
    document.getElementById("user-avatar").textContent = initials;
    document.getElementById("user-name").textContent   = session.name;
    document.getElementById("topbar-branch").textContent = `🏢 ${session.employeeId}`;

    setupNav();
    loadOverview();
  } catch {
    redirect("/login.html");
  }
}

function redirect(path) { window.location.href = path; }

document.getElementById("logout-btn").addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST" });
  redirect("/login.html");
});

// ── Navigation ────────────────────────────────────────────────────────────────
const sections = {
  overview:        { el: document.getElementById("section-overview"),        label: "Overview",            load: loadOverview },
  upload:          { el: document.getElementById("section-upload"),          label: "Upload Conversation", load: null },
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
  document.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.section === key));
  Object.entries(sections).forEach(([k, s]) => s.el.classList.toggle("active", k === key));
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

function formatDate(ts) {
  return new Date(ts).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function truncate(str, n) { return str && str.length > n ? str.slice(0, n) + "…" : (str || ""); }

function loading() {
  return `<div class="spinner-wrap"><div class="spinner"></div><span>Loading...</span></div>`;
}

function empty(msg = "No data yet.") {
  return `<div class="empty-state"><div class="empty-icon">📭</div><p>${msg}</p></div>`;
}

// ── Overview ──────────────────────────────────────────────────────────────────
async function loadOverview() {
  try {
    const [avgRes, histRes] = await Promise.all([
      fetch("/api/employees/me/average"),
      fetch("/api/employees/me/history"),
    ]);
    const avgData = await avgRes.json();
    const histData = await histRes.json();
    const history = histData.history || [];

    document.getElementById("stat-total").textContent = avgData.conversationCount ?? 0;
    document.getElementById("stat-avg").textContent   = avgData.averageScore !== null ? `${avgData.averageScore}/100` : "—";
    document.getElementById("stat-last").textContent  = history[0] ? `${history[0].evaluation.overallScore}/100` : "—";

    const weekAgo  = new Date(Date.now() - 7 * 86400000);
    const thisWeek = history.filter((h) => new Date(h.timestamp) > weekAgo).length;
    document.getElementById("stat-week").textContent = thisWeek;

    const recentEl = document.getElementById("overview-recent");
    recentEl.innerHTML = history.length === 0
      ? empty("No conversations yet. Upload one to get started.")
      : history.slice(0, 5).map((c) => `
          <div class="history-item">
            <span class="history-date">${formatDate(c.timestamp)}</span>
            <span class="history-preview">${truncate(c.transcript, 80)}</span>
            ${langTag(c.detectedLanguage)}
            ${scorePill(c.evaluation.overallScore)}
          </div>`).join("");

    const latestRecs = history.flatMap((c) => c.evaluation.recommendations).slice(0, 4);
    document.getElementById("overview-recs").innerHTML = latestRecs.length === 0
      ? empty("Recommendations will appear after your first analysis.")
      : `<div class="recs-list">${latestRecs.map((r) =>
          `<div class="rec-item"><span class="rec-icon">💡</span>${r}</div>`).join("")}</div>`;
  } catch (err) {
    console.error("Overview load error:", err.message);
  }
}

// ── Upload ────────────────────────────────────────────────────────────────────
const audioInput      = document.getElementById("audio-input");
const uploadZone      = document.getElementById("upload-zone");
const uploadLabelText = document.getElementById("upload-label-text");
const analyzeBtn      = document.getElementById("analyze-btn");
const uploadFeedback  = document.getElementById("upload-feedback");
const resultContainer = document.getElementById("result-container");

// Clicking anywhere on the upload zone opens the system file picker
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
  if (!audioInput.files.length) {
    showError("Please select an audio file first.");
    return;
  }

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

/*
  These three functions are the core fix.
  Nothing is hidden — content is created when needed and removed when not.
  No element with a background colour or padding sits in the DOM while invisible.
*/
function setUploading(active, text = "") {
  analyzeBtn.disabled = active;
  if (active) {
    uploadFeedback.innerHTML = `
      <div class="status-bar" style="margin-top:16px;">
        <div class="spinner" style="width:18px;height:18px;border-width:2px;flex-shrink:0;"></div>
        <span>${text}</span>
      </div>`;
  }
}

function showError(msg) {
  uploadFeedback.innerHTML =
    `<div class="form-error" style="margin-top:12px;">${msg}</div>`;
}

function clearFeedback() {
  uploadFeedback.innerHTML = "";
}

// ── Result Rendering ──────────────────────────────────────────────────────────
function renderResult(data) {
  const ev = data.evaluation;

  document.getElementById("scorecard-wrap").innerHTML = `
    <div class="scorecard-header">
      <div>
        <div class="scorecard-title">Conversation Scorecard</div>
        <div class="scorecard-meta">
          ID #${data.conversationId} &nbsp;·&nbsp; ${langTag(data.detectedLanguage)}
        </div>
      </div>
      <div class="scorecard-score">
        <div class="scorecard-score-value">${ev.overallScore}</div>
        <div class="scorecard-score-label">out of 100</div>
      </div>
    </div>
    <div class="metrics-row">
      ${mc("Greeting",       ev.greeting ? "✓ Yes" : "✗ No")}
      ${mc("Politeness",     `${ev.politeness}/10`)}
      ${mc("Engagement",     `${ev.customerEngagement}/10`)}
      ${mc("Upselling",      `${ev.upselling}/10`)}
      ${mc("Combo",          ev.comboRecommendation ? "✓ Yes" : "✗ No")}
      ${mc("Discount",       ev.discountMentioned ? "✓ Yes" : "✗ No")}
      ${mc("Complaint",      fmtComplaint(ev.complaintHandling))}
      ${mc("Professionalism",`${ev.professionalism}/10`)}
    </div>`;

  document.getElementById("result-recs").innerHTML = ev.recommendations.length
    ? ev.recommendations.map((r) =>
        `<div class="rec-item"><span class="rec-icon">💡</span>${r}</div>`).join("")
    : "<p class='text-muted text-sm'>No specific recommendations.</p>";

  document.getElementById("result-lang-badge").innerHTML = langTag(data.detectedLanguage);
  document.getElementById("result-transcript").textContent = data.transcript;

  resultContainer.classList.remove("hidden");
  resultContainer.scrollIntoView({ behavior: "smooth", block: "start" });
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

    if (history.length === 0) { el.innerHTML = empty("No conversations recorded yet."); return; }

    el.innerHTML = `
      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr>
            <th>Date & Time</th>
            <th>Language</th>
            <th>Score</th>
            <th>Politeness</th>
            <th>Upselling</th>
            <th>Engagement</th>
            <th>Transcript Preview</th>
          </tr></thead>
          <tbody>
            ${history.map((c) => `<tr>
              <td>${formatDate(c.timestamp)}</td>
              <td>${langTag(c.detectedLanguage)}</td>
              <td>${scorePill(c.evaluation.overallScore)}</td>
              <td>${c.evaluation.politeness}/10</td>
              <td>${c.evaluation.upselling}/10</td>
              <td>${c.evaluation.customerEngagement}/10</td>
              <td class="text-muted text-sm">${truncate(c.transcript, 60)}</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>`;
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
    if (trends.length === 0) { el.innerHTML = empty("No trend data yet."); return; }

    el.innerHTML = `
      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr>
            <th>#</th><th>Date & Time</th><th>Score</th><th>Performance</th>
          </tr></thead>
          <tbody>
            ${trends.map((t, i) => {
              const color = t.overallScore >= 80
                ? "var(--success)"
                : t.overallScore >= 60
                  ? "var(--warning)"
                  : "var(--danger)";
              return `<tr>
                <td class="text-muted">${i + 1}</td>
                <td>${formatDate(t.timestamp)}</td>
                <td>${scorePill(t.overallScore)}</td>
                <td>
                  <div style="height:6px;background:var(--border);border-radius:4px;width:120px;">
                    <div style="height:6px;border-radius:4px;width:${t.overallScore}%;background:${color};"></div>
                  </div>
                </td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>`;
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
      return;
    }

    const counts = {};
    history.forEach((c) => {
      (c.evaluation.recommendations || []).forEach((r) => {
        counts[r] = (counts[r] || 0) + 1;
      });
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);

    el.innerHTML = sorted.length === 0
      ? empty("No recommendations recorded yet.")
      : `<div class="recs-list">
          ${sorted.map(([rec, count]) => `
            <div class="rec-item">
              <span class="rec-icon">💡</span>
              <span style="flex:1">${rec}</span>
              <span class="badge badge-gray">${count}x</span>
            </div>`).join("")}
         </div>`;
  } catch (err) {
    el.innerHTML = `<p class="form-error">${err.message}</p>`;
  }
}

init();