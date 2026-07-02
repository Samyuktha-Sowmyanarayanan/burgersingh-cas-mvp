// ── Auth & Init ───────────────────────────────────────────────────────────────
let session = null;
let perfDateFilter = null; // active date search query, applied in Performance > History
let allHistoryData = [];   // cache of full conversation history (with full transcript + evaluation)
                            // so any row (Dashboard or Performance) can open the detail modal by id

async function init() {
  try {
    const res = await fetch("/api/auth/me");
    if (!res.ok) return redirect("/login.html");
    session = await res.json();

    if (session.role?.toLowerCase() !== "employee") return redirect("/manager.html");

    const initials = session.name
      ? session.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
      : "—";

    if (document.getElementById("user-avatar"))   document.getElementById("user-avatar").textContent   = initials;
    if (document.getElementById("user-name"))     document.getElementById("user-name").textContent     = session.name || "User";
    if (document.getElementById("topnav-avatar")) document.getElementById("topnav-avatar").textContent = initials;
    if (document.getElementById("topnav-name"))   document.getElementById("topnav-name").textContent   = (session.name || "User").split(" ")[0];

    ri();
    setupNav();
    setupConvoModal();
    loadDashboard();
  } catch (err) {
    console.error("Init error:", err);
    redirect("/login.html");
  }
}

function redirect(path) { window.location.href = path; }
function ri() { if (window.lucide) lucide.createIcons(); }

// ── Logout ────────────────────────────────────────────────────────────────────
document.getElementById("logout-btn")?.addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST" });
  redirect("/login.html");
});

// ── Help ──────────────────────────────────────────────────────────────────────
document.getElementById("help-btn")?.addEventListener("click", () => {
  alert(
    "Burger Joint Operational Support:\n\n" +
    "For system access or dashboard errors, please email:\n" +
    "it-support@burgerjoint.com\n\n" +
    "Response time is usually within 2 hours."
  );
});

// ── Navigation ─────────────────────────────────────────────────────────────────
const sectionMap = {
  dashboard:         { load: loadDashboard },
  "audio-analysis":  { load: null },
  "live-sessions":   { load: loadLiveSessions },
  performance:       { load: loadPerformance },
  intelligence:      { load: loadIntelligence },
};

function setupNav() {
  // Sidebar nav items
  document.querySelectorAll(".nav-item[data-section]").forEach((btn) => {
    btn.addEventListener("click", () => activateSection(btn.dataset.section));
  });

  // Inner performance sub-tabs
  document.querySelectorAll(".inner-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".inner-tab").forEach((t)  => t.classList.toggle("active", t === tab));
      document.querySelectorAll(".inner-panel").forEach((p) => p.classList.toggle("active", p.id === tab.dataset.subtab));
    });
  });

  // Topnav Quick Analysis button → Audio Analysis
  document.getElementById("topnav-quick-btn")?.addEventListener("click", () => {
    activateSection("audio-analysis");
  });

  // Dashboard action cards
  document.getElementById("card-upload")?.addEventListener("click", () => activateSection("audio-analysis"));
  document.getElementById("card-live")?.addEventListener("click",   () => activateSection("live-sessions"));
  document.getElementById("view-all-link")?.addEventListener("click", () => activateSection("performance"));

  // Search (Enter key)
// Search (Enter key) — filters Performance > History by date
  document.getElementById("topnav-search")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const q = e.target.value.trim();
      if (q) {
        perfDateFilter = q;
        activateSection("performance");
      }
    }
  });

  // Notification dropdown
  setupNotifications();
}

// Single, clean activateSection — no duplicates
function activateSection(key) {
  if (!sectionMap[key]) return;

  document.querySelectorAll(".nav-item[data-section]").forEach((b) =>
    b.classList.toggle("active", b.dataset.section === key)
  );
  document.querySelectorAll(".content-section").forEach((s) =>
    s.classList.toggle("active", s.id === `section-${key}`)
  );
  if (key !== "performance") perfDateFilter = null;
  if (sectionMap[key].load) sectionMap[key].load();
}

// ── Notification dropdown ─────────────────────────────────────────────────────
function setupNotifications() {
  const btn      = document.getElementById("notification-btn");
  const dropdown = document.getElementById("notif-dropdown");
  const dot      = document.getElementById("notif-dot");
  const markRead = document.getElementById("notif-mark-read");

  if (!btn || !dropdown) return;

  // Show unread dot on load
  dot.classList.add("visible");

  // Toggle dropdown on bell click
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = !dropdown.classList.contains("hidden");
    dropdown.classList.toggle("hidden", isOpen);
    // Remove unread dot when opened
    if (!isOpen) dot.classList.remove("visible");
    ri();
  });

  // Mark all read
  markRead?.addEventListener("click", () => {
    document.querySelectorAll(".notif-item.unread").forEach((item) => {
      item.classList.remove("unread");
    });
    dot.classList.remove("visible");
  });

  // Close when clicking outside
  document.addEventListener("click", (e) => {
    if (!dropdown.contains(e.target) && e.target !== btn) {
      dropdown.classList.add("hidden");
    }
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}
function scoreClass(s) { return s >= 80 ? "high" : s >= 60 ? "medium" : "low"; }
function scorePill(s) {
  if (s === null || s === undefined) return `<span class="score-pill score-none">—</span>`;
  return `<span class="score-pill score-${scoreClass(s)}">${s}/100</span>`;
}
function langTag(lang) {
  const map = { English: "en", Hindi: "hi", Bengali: "bn", Assamese: "as", Nepali: "ne", Mixed: "mixed" };
  return lang ? `<span class="lang-tag lang-${map[lang] || "mixed"}">${lang}</span>` : "";
}
function yesNo(v) {
  return v
    ? `<span style="color:var(--success);font-weight:700;">Yes</span>`
    : `<span style="color:var(--danger);font-weight:700;">No</span>`;
}
function fmtDate(ts) {
  return new Date(ts).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}
function trunc(str, n) { return str && str.length > n ? str.slice(0, n) + "…" : (str || ""); }
function fmtSecs(s) {
  return `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
}
function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : "—"; }
function fmtComplaint(v) { return !v || v === "N/A" ? "N/A" : `${v}/10`; }
function loading() { return `<div class="spinner-wrap"><div class="spinner"></div><span>Loading...</span></div>`; }
function empty(msg = "No data available.") {
  return `<div class="empty-state"><i data-lucide="inbox"></i><p>${msg}</p></div>`;
}

// ── Date search helpers ───────────────────────────────────────────────────────
// Parses free-text date queries like "26", "26 june", "june 26", "26/06/2026",
// "6/26", "2026", "jun" into { day, month, year } so we can match against the
// actual date of a conversation rather than doing a naive substring match on
// the formatted date string (which would wrongly match every 2026 row when
// searching "26", since "2026" itself contains "26").
const MONTH_NAMES = ["january","february","march","april","may","june","july","august","september","october","november","december"];
const MONTH_ABBR  = MONTH_NAMES.map((m) => m.slice(0, 3));

function parseDateQuery(query) {
  const tokens = query.toLowerCase().trim().split(/[^a-z0-9]+/).filter(Boolean);
  let day = null, month = null, year = null;
  const numTokens = [];

  tokens.forEach((tok) => {
    if (/^\d+$/.test(tok)) {
      const n = parseInt(tok, 10);
      if (tok.length === 4 || n >= 1000) year = n;
      else numTokens.push(n);
    } else {
      const mi = MONTH_NAMES.indexOf(tok);
      const ai = MONTH_ABBR.indexOf(tok);
      if (mi !== -1) month = mi + 1;
      else if (ai !== -1) month = ai + 1;
    }
  });

  if (numTokens.length === 1) {
    const n = numTokens[0];
    if (n <= 31) day = n;
  } else if (numTokens.length >= 2) {
    const [a, b] = numTokens;
    if (month !== null) {
      day = a <= 31 ? a : b;
    } else if (a <= 31 && b <= 12) {
      day = a; month = b;
    } else if (b <= 31 && a <= 12) {
      day = b; month = a;
    } else if (a <= 31) {
      day = a;
    }
  }

  return { day, month, year };
}

function matchesDateQuery(timestamp, query) {
  const q = (query || "").trim();
  if (!q) return true;
  const { day, month, year } = parseDateQuery(q);
  if (day !== null || month !== null || year !== null) {
    const d = new Date(timestamp);
    if (day   !== null && d.getDate() !== day) return false;
    if (month !== null && (d.getMonth() + 1) !== month) return false;
    if (year  !== null && d.getFullYear() !== year) return false;
    return true;
  }
  // Fallback for text that isn't a date at all (weekday names, "am"/"pm", etc.)
  return fmtDate(timestamp).toLowerCase().includes(q.toLowerCase());
}

// ═══════════════════════════════════════════════════════════
// CONVERSATION DETAIL MODAL — "interconnectivity"
// Clicking any history row (Dashboard or Performance) opens the full
// record: complete transcript, full scorecard, and recommendations.
// No extra API call is needed — /api/employees/me/history already
// returns the full transcript + evaluation per row (see storage.js
// formatRow()), we just cache it and render on click.
// ═══════════════════════════════════════════════════════════
function cacheHistory(history) {
  // Merge/replace by id so data from either Dashboard or Performance fetches is available
  const byId = new Map(allHistoryData.map((c) => [c.id, c]));
  history.forEach((c) => byId.set(c.id, c));
  allHistoryData = Array.from(byId.values());
}

function setupConvoModal() {
  const overlay = document.getElementById("convo-modal-overlay");
  const closeBtn = document.getElementById("convo-modal-close");
  if (!overlay) return;

  closeBtn?.addEventListener("click", closeConvoDetail);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeConvoDetail();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlay.classList.contains("hidden")) closeConvoDetail();
  });
}

function openConvoDetail(id) {
  const c = allHistoryData.find((x) => x.id === id);
  const overlay = document.getElementById("convo-modal-overlay");
  if (!overlay) return;

  if (!c) {
    // Fallback: shouldn't normally happen since rows only render for cached ids
    document.getElementById("convo-modal-body").innerHTML = `<div class="form-error">Could not load this conversation.</div>`;
    overlay.classList.remove("hidden");
    return;
  }

  const ev = c.evaluation || {};
  const sc = scoreClass(ev.overallScore);

  document.getElementById("convo-modal-title").textContent = `Conversation #${c.id}`;
  document.getElementById("convo-modal-meta").innerHTML =
    `${fmtDate(c.timestamp)} &nbsp;&middot;&nbsp; ${langTag(c.detectedLanguage)} &nbsp;&middot;&nbsp; Employee ${c.employeeId || "—"}`;

  document.getElementById("convo-modal-body").innerHTML = `
    ${buildScorecard({
      title: "Conversation Scorecard",
      meta: `ID #${c.id} &nbsp;&middot;&nbsp; ${langTag(c.detectedLanguage)}`,
      score: ev.overallScore, sc, ev,
    })}
    <div class="card" style="margin-top:12px;">
      <div class="card-header"><h3>Recommendations</h3></div>
      <div class="card-body">
        ${(ev.recommendations || []).map((r) =>
          `<div class="rec-item"><span class="rec-icon"><i data-lucide="lightbulb"></i></span>${r}</div>`
        ).join("") || `<p class="text-muted text-sm">No specific recommendations.</p>`}
      </div>
    </div>
    <div class="card" style="margin-top:12px;">
      <div class="card-header"><h3>Full Transcript</h3><span>${langTag(c.detectedLanguage)}</span></div>
      <div class="card-body"><div class="transcript-box">${c.transcript || "—"}</div></div>
    </div>
    ${c.englishTranscript && c.detectedLanguage !== "English" ? `
    <div class="card" style="margin-top:12px;">
      <div class="card-header"><h3>English Translation</h3></div>
      <div class="card-body"><div class="transcript-box">${c.englishTranscript}</div></div>
    </div>` : ""}
  `;

  overlay.classList.remove("hidden");
  ri();
}

function closeConvoDetail() {
  document.getElementById("convo-modal-overlay")?.classList.add("hidden");
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
async function loadDashboard() {
  const firstName = session?.name?.split(" ")[0] || "there";
  document.getElementById("hero-greeting").textContent = `${greeting()}, ${firstName}.`;

  try {
    const [avgRes, histRes, trendRes] = await Promise.all([
      fetch("/api/employees/me/average"),
      fetch("/api/employees/me/history"),
      fetch("/api/employees/me/trends"),
    ]);
    const avgData   = await avgRes.json();
    const histData  = await histRes.json();
    const trendData = await trendRes.json();

    const history = histData.history || [];
    const trends  = trendData.trends  || [];
    cacheHistory(history);

    // Hero subtitle
    const subEl = document.getElementById("hero-subtitle");
    if (subEl) {
      subEl.innerHTML = avgData.averageScore !== null
        ? `Your average score is <strong>${avgData.averageScore}/100</strong> across ${avgData.conversationCount} analyzed conversations.`
        : "No conversations analyzed yet. Upload an audio file to get started.";
    }

    // Stat strip
    const weekAgo  = new Date(Date.now() - 7 * 86400000);
    const thisWeek = history.filter((h) => new Date(h.timestamp) > weekAgo).length;
    const recCount = [...new Set(history.flatMap((c) => c.evaluation?.recommendations || []))].length;
    document.getElementById("strip-avg").textContent     = avgData.averageScore !== null ? `${avgData.averageScore}/100` : "—";
    document.getElementById("strip-total").textContent   = avgData.conversationCount ?? 0;
    document.getElementById("strip-week").textContent    = thisWeek;
    document.getElementById("strip-actions").textContent = `0${recCount}`.slice(-2);

    // Recent history table
    const recentEl = document.getElementById("dashboard-recent");
    if (history.length === 0) {
      recentEl.innerHTML = empty("No conversations yet. Upload an audio file to get started.");
      ri(); return;
    }
    recentEl.innerHTML = `
      <table class="data-table">
        <thead><tr>
          <th>Analysis Date</th>
          <th>Type</th>
          <th>Score</th>
          <th>Actions</th>
        </tr></thead>
        <tbody>
          ${history.slice(0, 6).map((c) => `<tr class="row-clickable" onclick="openConvoDetail(${c.id})">
            <td style="color:var(--gray-500);font-size:12.5px;">${fmtDate(c.timestamp)}</td>
            <td>${langTag(c.detectedLanguage) || `<span class="badge badge-gray">Upload</span>`}</td>
            <td>${scorePill(c.evaluation?.overallScore)}</td>
            <td><span class="tbl-link" onclick="event.stopPropagation(); openConvoDetail(${c.id})">View Details</span></td>
          </tr>`).join("")}
        </tbody>
      </table>`;

    // Trend bars
    const recentTrends = trends.slice(-8);
    const barEl = document.getElementById("trend-bars");
    const lblEl = document.getElementById("trend-x-labels");
    if (recentTrends.length === 0) {
      barEl.innerHTML = `<span style="font-size:11px;color:var(--gray-400);align-self:center;">No trend data yet</span>`;
    } else {
      barEl.innerHTML = recentTrends.map((t) => {
        const color = t.overallScore >= 80 ? "var(--success)" : t.overallScore >= 60 ? "var(--warning)" : "var(--danger)";
        return `<div class="trend-bar" style="height:${t.overallScore}%;background:${color};" title="${t.overallScore}"></div>`;
      }).join("");
      lblEl.innerHTML = recentTrends.map((t) =>
        `<span class="trend-x-label">${new Date(t.timestamp).getDate()}</span>`
      ).join("");
    }

    // Recommendations
    const recItems  = history.flatMap((c) => c.evaluation?.recommendations || []).slice(0, 5);
    const recColors = ["var(--danger)", "var(--warning)", "var(--brand)", "var(--info)", "var(--success)"];
    const recsEl    = document.getElementById("dashboard-recs");
    recsEl.innerHTML = recItems.length === 0
      ? `<p style="font-size:12px;color:var(--gray-400);">Recommendations appear after analysis.</p>`
      : recItems.map((r, i) => `
          <div class="side-rec-item">
            <div class="side-rec-indicator" style="background:${recColors[i % recColors.length]};"></div>
            <div>
              <div class="side-rec-text">${r}</div>
              <div class="side-rec-meta">Coaching insight</div>
            </div>
          </div>`).join("");

    ri();
  } catch (err) {
    console.error("Dashboard error:", err.message);
    const subEl = document.getElementById("hero-subtitle");
    if (subEl) subEl.textContent = "Unable to load performance data.";
  }
}

// ── Upload ────────────────────────────────────────────────────────────────────
const audioInput = document.getElementById("audio-input");
const uploadZone = document.getElementById("upload-zone");
const uploadLabel = document.getElementById("upload-label-text");
const analyzeBtn  = document.getElementById("analyze-btn");
const uploadFb    = document.getElementById("upload-feedback");
const resultCon   = document.getElementById("result-container");

uploadZone?.addEventListener("click", () => audioInput.click());
audioInput?.addEventListener("change", () => {
  if (audioInput.files.length > 0) {
    uploadLabel.textContent = audioInput.files[0].name;
    uploadZone.classList.add("has-file");
    uploadFb.innerHTML = "";
  }
});
analyzeBtn?.addEventListener("click", runAnalysis);

async function runAnalysis() {
  if (!audioInput.files.length) { showUpErr("Please select an audio file first."); return; }
  uploadFb.innerHTML = "";
  resultCon.classList.add("hidden");
  setUploading(true, "Uploading audio file...");
  const fd = new FormData();
  fd.append("audio", audioInput.files[0]);
  try {
    setUploading(true, "Transcribing and analyzing — this may take 30–60 seconds...");
    const res  = await fetch("/api/analyze", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Analysis failed.");
    uploadFb.innerHTML = "";
    renderResult(data);
  } catch (err) {
    uploadFb.innerHTML = "";
    showUpErr(err.message);
  } finally {
    analyzeBtn.disabled = false;
  }
}
function setUploading(active, text) {
  analyzeBtn.disabled = active;
  if (active) uploadFb.innerHTML = `<div class="status-bar" style="margin-top:10px;"><div class="spinner" style="width:16px;height:16px;border-width:2px;flex-shrink:0;"></div><span>${text}</span></div>`;
}
function showUpErr(msg) { uploadFb.innerHTML = `<div class="form-error" style="margin-top:10px;">${msg}</div>`; }

function renderResult(data) {
  const ev = data.evaluation;
  const sc = scoreClass(ev.overallScore);
  document.getElementById("scorecard-wrap").innerHTML = buildScorecard({
    title: "Conversation Scorecard",
    meta: `ID #${data.conversationId} &nbsp;&middot;&nbsp; ${langTag(data.detectedLanguage)}`,
    score: ev.overallScore, sc, ev,
  });
  document.getElementById("result-recs").innerHTML = (ev.recommendations || []).map((r) =>
    `<div class="rec-item"><span class="rec-icon"><i data-lucide="lightbulb"></i></span>${r}</div>`
  ).join("") || `<p class="text-muted text-sm">No specific recommendations.</p>`;
  document.getElementById("result-lang-badge").innerHTML = langTag(data.detectedLanguage);
  document.getElementById("result-transcript").textContent = data.transcript;
  resultCon.classList.remove("hidden");
  resultCon.scrollIntoView({ behavior: "smooth", block: "start" });
  ri();
}

function buildScorecard({ title, meta, score, sc, ev }) {
  return `
    <div class="scorecard-wrap">
      <div class="scorecard-head">
        <div>
          <div class="scorecard-title">${title}</div>
          <div class="scorecard-meta">${meta}</div>
        </div>
        <div class="scorecard-score-badge ${sc}">
          <span class="scorecard-num">${score}</span>
          <span class="scorecard-den">/100</span>
        </div>
      </div>
      <div class="scorecard-metrics">
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
  return `<div class="sc-metric"><div class="sc-metric-label">${label}</div><div class="sc-metric-value">${value}</div></div>`;
}

// ── Performance ───────────────────────────────────────────────────────────────
async function loadPerformance() {
  loadPerfHistory();
  loadPerfTrends();
}

async function loadPerfHistory() {
  const el = document.getElementById("history-content");
  el.innerHTML = loading();
  try {
    const res  = await fetch("/api/employees/me/history");
    const data = await res.json();
    let history = data.history || [];
    cacheHistory(history);

    if (history.length === 0) { el.innerHTML = empty("No conversations yet."); ri(); return; }

    // Apply active date filter (set from topnav search)
    let filterBanner = "";
    if (perfDateFilter) {
      const filtered = history.filter((c) => matchesDateQuery(c.timestamp, perfDateFilter));
      filterBanner = `
        <div class="search-filter-banner">
          <i data-lucide="filter"></i>
          <span>Showing results for "<strong>${perfDateFilter}</strong>" — ${filtered.length} conversation${filtered.length !== 1 ? "s" : ""}</span>
          <button id="clear-date-filter">Clear</button>
        </div>`;
      history = filtered;
    }

    if (history.length === 0) {
      el.innerHTML = filterBanner + empty(`No conversations found for "${perfDateFilter}".`);
      ri();
      document.getElementById("clear-date-filter")?.addEventListener("click", () => {
        perfDateFilter = null; loadPerfHistory();
      });
      return;
    }

    el.innerHTML = filterBanner + `
      <table class="data-table">
        <thead><tr>
          <th>Date &amp; Time</th><th>Language</th><th>Score</th>
          <th>Politeness</th><th>Upselling</th><th>Engagement</th><th>Transcript</th>
        </tr></thead>
        <tbody>
          ${history.map((c) => `<tr class="row-clickable" onclick="openConvoDetail(${c.id})" title="Click to view full conversation">
            <td style="color:var(--gray-500);white-space:nowrap;">${fmtDate(c.timestamp)}</td>
            <td>${langTag(c.detectedLanguage)}</td>
            <td>${scorePill(c.evaluation?.overallScore)}</td>
            <td style="color:var(--gray-600);">${c.evaluation?.politeness}/10</td>
            <td style="color:var(--gray-600);">${c.evaluation?.upselling}/10</td>
            <td style="color:var(--gray-600);">${c.evaluation?.customerEngagement}/10</td>
            <td style="color:var(--gray-400);font-size:12px;">${trunc(c.transcript, 48)}</td>
          </tr>`).join("")}
        </tbody>
      </table>`;
    ri();
    document.getElementById("clear-date-filter")?.addEventListener("click", () => {
      perfDateFilter = null; loadPerfHistory();
    });
  } catch (err) { el.innerHTML = `<div style="padding:16px;"><div class="form-error">${err.message}</div></div>`; }
}

async function loadPerfTrends() {
  const el = document.getElementById("trends-content");
  el.innerHTML = loading();
  try {
    const [tRes, aRes] = await Promise.all([
      fetch("/api/employees/me/trends"),
      fetch("/api/employees/me/average"),
    ]);
    const tData = await tRes.json();
    const aData = await aRes.json();
    document.getElementById("trends-avg").textContent   = aData.averageScore !== null ? `${aData.averageScore}/100` : "—";
    document.getElementById("trends-count").textContent = aData.conversationCount ?? 0;
    const trends = tData.trends || [];
    if (trends.length === 0) { el.innerHTML = empty("No trend data yet."); ri(); return; }
    el.innerHTML = `
      <table class="data-table">
        <thead><tr><th>#</th><th>Date &amp; Time</th><th>Score</th><th>Performance</th></tr></thead>
        <tbody>
          ${trends.map((t, i) => {
            const color = t.overallScore >= 80 ? "var(--success)" : t.overallScore >= 60 ? "var(--warning)" : "var(--danger)";
            return `<tr>
              <td style="color:var(--gray-400);font-size:12px;">${i + 1}</td>
              <td style="color:var(--gray-500);white-space:nowrap;">${fmtDate(t.timestamp)}</td>
              <td>${scorePill(t.overallScore)}</td>
              <td>
                <div style="display:flex;align-items:center;gap:8px;">
                  <div style="width:90px;height:4px;background:var(--gray-200);border-radius:2px;">
                    <div style="width:${t.overallScore}%;height:4px;background:${color};border-radius:2px;"></div>
                  </div>
                  <span style="font-size:11px;color:var(--gray-400);">${t.overallScore}</span>
                </div>
              </td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>`;
    ri();
  } catch (err) { el.innerHTML = `<div style="padding:16px;"><div class="form-error">${err.message}</div></div>`; }
}

// ── Intelligence ──────────────────────────────────────────────────────────────
async function loadIntelligence() {
  const el = document.getElementById("recs-content");
  el.innerHTML = loading();
  try {
    const res  = await fetch("/api/employees/me/history");
    const data = await res.json();
    const history = data.history || [];
    if (history.length === 0) { el.innerHTML = empty("Complete your first analysis to see recommendations."); ri(); return; }
    const counts = {};
    history.forEach((c) => {
      (c.evaluation?.recommendations || []).forEach((r) => { counts[r] = (counts[r] || 0) + 1; });
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    el.innerHTML = sorted.length === 0 ? empty("No recommendations recorded yet.") :
      sorted.map(([rec, count]) => `
        <div class="rec-item">
          <span class="rec-icon"><i data-lucide="lightbulb"></i></span>
          <span style="flex:1;">${rec}</span>
          <span class="badge badge-gray">${count}x</span>
        </div>`).join("");
    ri();
  } catch (err) { el.innerHTML = `<div class="form-error">${err.message}</div>`; }
}

// ═══════════════════════════════════════════════════════════
// LIVE SESSION
// ═══════════════════════════════════════════════════════════
let mediaRecorder = null, audioChunks = [], timerInterval = null;
let elapsedSeconds = 0, currentSessionId = null, isPaused = false;
const MIN_DURATION = 15;

const recDot       = document.getElementById("rec-dot");
const liveLabel    = document.getElementById("live-status-label");
const liveTimer    = document.getElementById("live-timer");
const waveformEl   = document.getElementById("waveform");
const sessionMeta  = document.getElementById("session-meta");
const durationWarn = document.getElementById("duration-warning");
const liveFb       = document.getElementById("live-feedback");
const liveResEl    = document.getElementById("live-result-container");
const btnStart     = document.getElementById("btn-start-recording");
const btnPause     = document.getElementById("btn-pause-recording");
const btnResume    = document.getElementById("btn-resume-recording");
const btnStop      = document.getElementById("btn-stop-recording");
const btnCancel    = document.getElementById("btn-cancel-recording");

function startTimer() {
  elapsedSeconds = 0;
  timerInterval  = setInterval(() => {
    if (!isPaused) { elapsedSeconds++; liveTimer.textContent = fmtSecs(elapsedSeconds); }
  }, 1000);
}
function stopTimer() { clearInterval(timerInterval); timerInterval = null; }

function setLiveUI(state) {
  const cfg = {
    idle:       { dot: "",           label: "Ready to Record", lc: "",           wc: "",       meta: false, s: true,  p: false, r: false, st: false, c: false },
    recording:  { dot: "active",     label: "Recording",       lc: "recording",  wc: "active", meta: true,  s: false, p: true,  r: false, st: true,  c: true  },
    paused:     { dot: "paused",     label: "Paused",          lc: "paused",     wc: "paused", meta: true,  s: false, p: false, r: true,  st: true,  c: true  },
    processing: { dot: "processing", label: "Analyzing...",    lc: "processing", wc: "",       meta: true,  s: false, p: false, r: false, st: false, c: false },
  };
  const x = cfg[state] || cfg.idle;
  if (recDot)     recDot.className      = `rec-dot ${x.dot}`;
  if (liveLabel)  { liveLabel.textContent = x.label; liveLabel.className = `live-status-label ${x.lc}`; }
  if (waveformEl) waveformEl.className   = `waveform ${x.wc}`;
  if (sessionMeta) sessionMeta.classList.toggle("hidden", !x.meta);
  [[btnStart, x.s],[btnPause, x.p],[btnResume, x.r],[btnStop, x.st],[btnCancel, x.c]]
    .forEach(([el, v]) => { if (el) el.classList.toggle("hidden", !v); });
  ri();
}

btnStart?.addEventListener("click", async () => {
  if (liveResEl)    liveResEl.classList.add("hidden");
  if (durationWarn) durationWarn.classList.add("hidden");
  if (liveFb)       liveFb.innerHTML = "";
  if (liveTimer)    liveTimer.textContent = "00:00";

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    if (liveFb) liveFb.innerHTML = `<div class="form-error" style="margin-top:10px;">Microphone access denied. Please allow microphone access and try again.</div>`;
    return;
  }

  try {
    const res = await fetch("/api/live/start", { method: "POST" });
    const d   = await res.json();
    if (!res.ok) throw new Error(d.error);
    currentSessionId = d.sessionId;
    const chipId  = document.getElementById("chip-session-id");
    const chipEmp = document.getElementById("chip-employee");
    if (chipId)  chipId.textContent  = currentSessionId.slice(0, 8) + "…";
    if (chipEmp) chipEmp.textContent = session?.employeeId || "—";
  } catch (err) {
    stream.getTracks().forEach((t) => t.stop());
    if (liveFb) liveFb.innerHTML = `<div class="form-error" style="margin-top:10px;">${err.message}</div>`;
    return;
  }

  audioChunks = []; isPaused = false;
  const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
    ? "audio/webm;codecs=opus"
    : MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")
      ? "audio/ogg;codecs=opus" : "";

  mediaRecorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
  mediaRecorder.ondataavailable = (e) => { if (e.data?.size > 0) audioChunks.push(e.data); };
  mediaRecorder.start(500);
  startTimer();
  setLiveUI("recording");
});

btnPause?.addEventListener("click", () => {
  if (mediaRecorder?.state === "recording") { mediaRecorder.pause(); isPaused = true; setLiveUI("paused"); }
});

btnResume?.addEventListener("click", () => {
  if (mediaRecorder?.state === "paused") { mediaRecorder.resume(); isPaused = false; setLiveUI("recording"); }
});

btnStop?.addEventListener("click", () => {
  if (!mediaRecorder) return;
  if (elapsedSeconds < MIN_DURATION && durationWarn) durationWarn.classList.remove("hidden");
  mediaRecorder.stop();
  mediaRecorder.stream.getTracks().forEach((t) => t.stop());
  stopTimer();
  setLiveUI("processing");
  if (liveFb) liveFb.innerHTML = `<div class="status-bar" style="margin-top:10px;"><div class="spinner" style="width:16px;height:16px;border-width:2px;flex-shrink:0;"></div><span>Transcribing and analyzing — this may take 30–60 seconds...</span></div>`;

  mediaRecorder.onstop = async () => {
    const mime = audioChunks[0]?.type || "audio/webm";
    const blob = new Blob(audioChunks, { type: mime });
    const fd   = new FormData();
    fd.append("audio", blob, `session.${mime.split("/")[1].split(";")[0]}`);
    try {
      const res  = await fetch(`/api/live/stop/${currentSessionId}`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed.");
      if (liveFb) liveFb.innerHTML = "";
      if (durationWarn) durationWarn.classList.add("hidden");
      renderLiveResult(data);
      loadLiveSessions();
    } catch (err) {
      if (liveFb) liveFb.innerHTML = `<div class="form-error" style="margin-top:10px;">${err.message}</div>`;
    } finally {
      setLiveUI("idle"); currentSessionId = null; audioChunks = [];
    }
  };
});

btnCancel?.addEventListener("click", async () => {
  if (mediaRecorder) { mediaRecorder.stream.getTracks().forEach((t) => t.stop()); mediaRecorder = null; }
  stopTimer();
  if (liveTimer)    liveTimer.textContent = "00:00";
  audioChunks = []; isPaused = false;
  if (durationWarn) durationWarn.classList.add("hidden");
  if (liveFb)       liveFb.innerHTML = "";
  setLiveUI("idle");
  if (currentSessionId) {
    try { await fetch(`/api/live/cancel/${currentSessionId}`, { method: "POST" }); } catch (_) {}
    currentSessionId = null;
  }
});

function renderLiveResult(data) {
  const ev = data.evaluation;
  const sc = scoreClass(ev.overallScore);
  const wrap = document.getElementById("live-scorecard-wrap");
  if (wrap) wrap.innerHTML = buildScorecard({
    title: "Live Session Scorecard",
    meta:  `Conversation #${data.conversationId} &middot; ${langTag(data.detectedLanguage)} &middot; Duration ${fmtSecs(elapsedSeconds)}`,
    score: ev.overallScore, sc, ev,
  });
  const recsEl = document.getElementById("live-result-recs");
  if (recsEl) recsEl.innerHTML = (ev.recommendations || []).map((r) =>
    `<div class="rec-item"><span class="rec-icon"><i data-lucide="lightbulb"></i></span>${r}</div>`
  ).join("") || `<p class="text-muted text-sm">No specific recommendations.</p>`;
  const langBadge  = document.getElementById("live-result-lang-badge");
  const transcript = document.getElementById("live-result-transcript");
  if (langBadge)  langBadge.innerHTML = langTag(data.detectedLanguage);
  if (transcript) transcript.textContent = data.transcript;
  if (liveResEl)  liveResEl.classList.remove("hidden");
  liveResEl?.scrollIntoView({ behavior: "smooth", block: "start" });
  ri();
}

async function loadLiveSessions() {
  const el = document.getElementById("live-sessions-history");
  if (!el) return;
  el.innerHTML = loading();
  try {
    const res  = await fetch("/api/live/my-sessions");
    const data = await res.json();
    const sessions = data.sessions || [];
    if (sessions.length === 0) { el.innerHTML = empty("No live sessions recorded yet."); ri(); return; }
    el.innerHTML = `
      <table class="data-table">
        <thead><tr>
          <th>Date &amp; Time</th><th>Status</th><th>Duration</th><th>Score</th><th>Branch</th>
        </tr></thead>
        <tbody>
          ${sessions.map((s) => `<tr>
            <td style="color:var(--gray-500);white-space:nowrap;">${fmtDate(s.startedAt)}</td>
            <td><span class="session-status-pill ${s.status}">${capitalize(s.status)}</span></td>
            <td style="color:var(--gray-600);">${s.durationSeconds !== null ? fmtSecs(s.durationSeconds) : "—"}</td>
            <td>${s.overallScore !== null ? scorePill(s.overallScore) : "—"}</td>
            <td style="color:var(--gray-500);">${s.branchName || "—"}</td>
          </tr>`).join("")}
        </tbody>
      </table>`;
    ri();
  } catch (err) {
    el.innerHTML = `<div style="padding:12px;"><div class="form-error">${err.message}</div></div>`;
  }
}

init();