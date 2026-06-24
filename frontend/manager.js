// ── Auth & Init ───────────────────────────────────────────────────────────────
let session     = null;
let allBranches = [];
let allRegions  = [];
let currentRegion = null;

async function init() {
  try {
    const res = await fetch("/api/auth/me");
    if (!res.ok) return redirect("/login.html");
    session = await res.json();
    if (session.role !== "manager") return redirect("/employee.html");

    const initials = session.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
    document.getElementById("user-avatar").textContent = initials;
    document.getElementById("user-name").textContent   = session.name;

    renderIcons();
    await loadStaticData();
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

async function loadStaticData() {
  try {
    const [branchRes, regionRes] = await Promise.all([
      fetch("/api/branches"),
      fetch("/api/regional/regions"),
    ]);
    const bd = await branchRes.json();
    const rd = await regionRes.json();
    allBranches = bd.branches || [];
    allRegions  = rd.regions  || [];

    populateSelect("region-select",          allRegions,  (r) => r,          (r) => r);
    populateSelect("lb-branch-select",       allBranches, (b) => b.branchId, (b) => b.name, "Company-Wide");
    populateSelect("insights-branch-select", allBranches, (b) => b.branchId, (b) => b.name);

    currentRegion = allRegions[0] || null;
    if (currentRegion) document.getElementById("region-select").value = currentRegion;

    document.getElementById("region-select").addEventListener("change", (e) => {
      currentRegion = e.target.value;
      loadRegionDeepDive(currentRegion);
    });
    document.getElementById("lb-branch-select").addEventListener("change", (e) => {
      const val = e.target.value;
      loadLeaderboard(val ? "branch" : "company", val || null);
    });
    document.getElementById("lb-company-btn").addEventListener("click", () => {
      document.getElementById("lb-branch-select").value = "";
      loadLeaderboard("company", null);
    });
    document.getElementById("insights-branch-select").addEventListener("change", (e) => {
      loadBranchInsights(e.target.value);
    });
    document.getElementById("gen-insights-btn").addEventListener("click", () => {
      if (currentRegion) loadRegionalInsights(currentRegion);
    });
  } catch (err) {
    console.error("Static data error:", err.message);
  }
}

function populateSelect(id, items, valFn, labelFn, placeholder = null) {
  const sel = document.getElementById(id);
  if (!sel) return;
  sel.innerHTML = placeholder ? `<option value="">${placeholder}</option>` : "";
  items.forEach((item) => {
    const opt = document.createElement("option");
    opt.value = valFn(item);
    opt.textContent = labelFn(item);
    sel.appendChild(opt);
  });
}

// ── Navigation ────────────────────────────────────────────────────────────────
const sectionLoaders = {
  overview:    loadOverview,
  branches:    loadBranches,
  regional:    () => { loadRegionalOverview(); if (currentRegion) loadRegionDeepDive(currentRegion); },
  rankings:    loadRankings,
  leaderboard: () => loadLeaderboard("company", null),
  training:    loadTraining,
  language:    loadLanguage,
  "live-ops":  () => initLiveOps(),
};
const sectionLabels = {
  overview:    "Overview",
  branches:    "Branch Analytics",
  regional:    "Regional Intelligence",
  rankings:    "Franchise Rankings",
  leaderboard: "Employee Leaderboard",
  training:    "Training Insights",
  language:    "Language Analytics",
  "live-ops":  "Live Operations",
};
const loadedSections = {};

function setupNav() {
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.section;
      document.querySelectorAll(".nav-item").forEach((b) =>
        b.classList.toggle("active", b.dataset.section === key)
      );
      document.querySelectorAll(".content-section").forEach((s) =>
        s.classList.toggle("active", s.id === `section-${key}`)
      );
      document.getElementById("page-title").textContent = sectionLabels[key];
      if (!loadedSections[key] && sectionLoaders[key]) {
        sectionLoaders[key]();
        loadedSections[key] = true;
      }
    });
  });
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
function loading(msg = "Loading...") {
  return `<div class="spinner-wrap"><div class="spinner"></div><span>${msg}</span></div>`;
}
function empty(msg = "No data available.") {
  return `<div class="empty-state"><i data-lucide="inbox"></i><p>${msg}</p></div>`;
}
function capitalize(str) { return str ? str.charAt(0).toUpperCase() + str.slice(1) : "—"; }
function miniTable(rows) {
  return rows.map(([label, value]) => `
    <div class="mini-table-row">
      <span class="mini-table-label">${label}</span>
      <span class="mini-table-value">${value}</span>
    </div>`).join("");
}
function formatLiveDuration(s) {
  return `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
}

// ── Overview ──────────────────────────────────────────────────────────────────
async function loadOverview() {
  try {
    const res  = await fetch("/api/dashboard/summary");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    document.getElementById("ov-total").textContent = data.totalConversations ?? "—";
    document.getElementById("ov-avg").textContent   = data.averageScore !== null ? `${data.averageScore}/100` : "—";
    document.getElementById("ov-best").textContent  = data.bestEmployee
      ? `${data.bestEmployee.employeeId} (${data.bestEmployee.averageScore})` : "—";
    document.getElementById("ov-low").textContent   = data.lowestEmployee
      ? `${data.lowestEmployee.employeeId} (${data.lowestEmployee.averageScore})` : "—";

    const recs = data.mostCommonRecommendations || [];
    document.getElementById("ov-recs").innerHTML = recs.length === 0
      ? empty("No recommendations data yet.")
      : `<div class="recs-list">${recs.map((r) => `
          <div class="rec-item">
            <span class="rec-icon"><i data-lucide="lightbulb"></i></span>
            <span style="flex:1;">${r.recommendation}</span>
            <span class="badge badge-gray">${r.count}x</span>
          </div>`).join("")}</div>`;
    renderIcons();
  } catch (err) { console.error("Overview error:", err.message); }
}

// ── Branches ──────────────────────────────────────────────────────────────────
async function loadBranches() {
  const el = document.getElementById("branch-table-wrap");
  el.innerHTML = loading();
  try {
    const res  = await fetch("/api/branches/compare");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    el.innerHTML = `
      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr>
            <th>Region</th><th>Branch</th>
            <th>Conversations</th><th>Avg Score</th><th>Performance</th>
          </tr></thead>
          <tbody>${data.branches.map((b) => `<tr>
            <td style="color:var(--text-2);">${b.region}</td>
            <td style="font-weight:500;">${b.name}</td>
            <td style="color:var(--text-2);">${b.totalConversations}</td>
            <td>${scorePill(b.averageScore)}</td>
            <td>${b.averageScore !== null
              ? `<div style="display:flex;align-items:center;gap:8px;">
                   <div style="width:90px;height:4px;background:var(--border);border-radius:2px;">
                     <div style="width:${b.averageScore}%;height:4px;background:${b.averageScore >= 80 ? 'var(--success)' : b.averageScore >= 60 ? 'var(--warning)' : 'var(--danger)'};border-radius:2px;"></div>
                   </div>
                   <span style="font-size:11px;color:var(--text-3);">${b.averageScore}</span>
                 </div>`
              : '<span style="color:var(--text-3);font-size:12px;">No data</span>'}
            </td>
          </tr>`).join("")}</tbody>
        </table>
      </div>`;
    renderIcons();
  } catch (err) {
    el.innerHTML = `<div class="card-body"><p class="form-error">${err.message}</p></div>`;
  }
}

// ── Regional Overview ─────────────────────────────────────────────────────────
async function loadRegionalOverview() {
  const el = document.getElementById("regional-overview-wrap");
  el.innerHTML = loading();
  try {
    const res  = await fetch("/api/regional/overview");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    el.innerHTML = `
      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr>
            <th>Region</th><th>Conversations</th><th>Avg Score</th>
            <th>Engagement</th><th>Upselling</th><th>Combo Rate</th><th>Discount Rate</th>
          </tr></thead>
          <tbody>${data.overview.map((r) => `<tr>
            <td style="font-weight:600;">${r.region}</td>
            <td style="color:var(--text-2);">${r.totalConversations}</td>
            <td>${scorePill(r.averageScore)}</td>
            <td style="color:var(--text-2);">${r.avgEngagement !== null ? `${r.avgEngagement}/10` : "—"}</td>
            <td style="color:var(--text-2);">${r.avgUpselling !== null ? `${r.avgUpselling}/10` : "—"}</td>
            <td style="color:var(--text-2);">${r.comboRate !== null ? `${r.comboRate}%` : "—"}</td>
            <td style="color:var(--text-2);">${r.discountRate !== null ? `${r.discountRate}%` : "—"}</td>
          </tr>`).join("")}</tbody>
        </table>
      </div>`;
    renderIcons();
  } catch (err) {
    el.innerHTML = `<div class="card-body"><p class="form-error">${err.message}</p></div>`;
  }
}

// ── Region Deep Dive ──────────────────────────────────────────────────────────
async function loadRegionDeepDive(region) {
  loadRegionBehaviour(region);
  loadRegionSales(region);
  loadRegionLanguage(region);
  document.getElementById("regional-insights-body").innerHTML =
    `<p class="text-muted text-sm">Click "Generate Insights" for an AI-powered analysis of ${region}.</p>`;
}

async function loadRegionBehaviour(region) {
  const el = document.getElementById("region-behaviour");
  el.innerHTML = loading();
  try {
    const res  = await fetch(`/api/regional/${encodeURIComponent(region)}/behaviour`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    const b = data.behaviour;
    el.innerHTML = miniTable([
      ["Conversations",    b.totalConversations],
      ["Avg Score",        b.averageScore !== null ? `${b.averageScore}/100` : "—"],
      ["Avg Engagement",   b.avgEngagement !== null ? `${b.avgEngagement}/10` : "—"],
      ["Avg Politeness",   b.avgPoliteness !== null ? `${b.avgPoliteness}/10` : "—"],
      ["Professionalism",  b.avgProfessionalism !== null ? `${b.avgProfessionalism}/10` : "—"],
      ["Combo Acceptance", b.comboAcceptanceRate !== null ? `${b.comboAcceptanceRate}%` : "—"],
      ["Successful Upsells", b.successfulUpsells],
      ["Missed Upsells",   b.missedUpsells],
    ]);
  } catch (err) {
    el.innerHTML = `<p class="form-error text-sm">${err.message}</p>`;
  }
}

async function loadRegionSales(region) {
  const el = document.getElementById("region-sales");
  el.innerHTML = loading();
  try {
    const res  = await fetch(`/api/regional/${encodeURIComponent(region)}/sales`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    const s = data.sales;
    el.innerHTML = miniTable([
      ["Total Conversations", s.totalConversations],
      ["Successful Upsells",  s.successfulUpsells],
      ["Missed Upsells",      s.missedUpsells],
      ["Upsell Conversion",   s.upsellConversionRate !== null ? `${s.upsellConversionRate}%` : "—"],
      ["Combo Rate",          s.comboRate !== null ? `${s.comboRate}%` : "—"],
      ["Discount Mention",    s.discountRate !== null ? `${s.discountRate}%` : "—"],
    ]);
  } catch (err) {
    el.innerHTML = `<p class="form-error text-sm">${err.message}</p>`;
  }
}

async function loadRegionLanguage(region) {
  const el = document.getElementById("region-language");
  el.innerHTML = loading();
  try {
    const res  = await fetch(`/api/regional/${encodeURIComponent(region)}/language`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    const langs = data.languages || [];
    el.innerHTML = langs.length === 0
      ? `<p style="font-size:12px;color:var(--text-3);">No language data for this region yet.</p>`
      : langs.map((l) => `
          <div style="display:flex;align-items:center;gap:8px;padding:4px 0;">
            ${langTag(l.language)}
            <span style="font-size:12px;color:var(--text-2);">${l.count} conversation${l.count !== 1 ? "s" : ""}</span>
          </div>`).join("");
  } catch (err) {
    el.innerHTML = `<p class="form-error text-sm">${err.message}</p>`;
  }
}

async function loadRegionalInsights(region) {
  const el  = document.getElementById("regional-insights-body");
  const btn = document.getElementById("gen-insights-btn");
  el.innerHTML = loading("Generating AI insights...");
  btn.disabled = true;
  try {
    const res  = await fetch(`/api/regional/${encodeURIComponent(region)}/insights`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    if (!data.insights) { el.innerHTML = `<p class="text-muted text-sm">${data.message}</p>`; return; }
    const ins = data.insights;
    const ul  = (items) => items?.length
      ? `<ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>`
      : "";

    el.innerHTML = `
      <div class="insights-panel">
        <p class="insights-meta-text">Based on ${data.totalConversations} conversation(s) in ${region}</p>
        <div class="insight-h success"><i data-lucide="check-circle"></i>Strengths</div>${ul(ins.strengths)}
        <div class="insight-h warning"><i data-lucide="alert-triangle"></i>Weaknesses</div>${ul(ins.weaknesses)}
        <div class="insight-h info"><i data-lucide="megaphone"></i>Marketing Opportunities</div>${ul(ins.marketingOpportunities)}
        <div class="insight-h purple"><i data-lucide="book-open"></i>Training Recommendations</div>${ul(ins.trainingRecommendations)}
        ${ins.languageInsights ? `<div class="insight-h brand"><i data-lucide="globe"></i>Language Insights</div><p>${ins.languageInsights}</p>` : ""}
      </div>`;
    renderIcons();
  } catch (err) {
    el.innerHTML = `<p class="form-error">${err.message}</p>`;
  } finally {
    btn.disabled = false;
  }
}

// ── Rankings ──────────────────────────────────────────────────────────────────
async function loadRankings() {
  const topEl = document.getElementById("top-branches-list");
  const lowEl = document.getElementById("low-branches-list");
  topEl.innerHTML = loading();
  lowEl.innerHTML = loading();
  try {
    const res  = await fetch("/api/branches/rankings");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    const renderList = (branches, el) => {
      if (branches.length === 0) { el.innerHTML = empty("Minimum 3 conversations per branch required for ranking."); renderIcons(); return; }
      el.innerHTML = branches.map((b, i) => `
        <div class="rank-item">
          <div class="rank-number ${i < 3 ? `rank-${i + 1}` : "rank-n"}">${i + 1}</div>
          <div class="rank-info">
            <div class="rank-name">${b.region}</div>
            <div class="rank-sub">${b.name} &middot; ${b.totalConversations} conversation${b.totalConversations !== 1 ? "s" : ""}</div>
          </div>
          ${scorePill(b.averageScore)}
        </div>`).join("");
    };

    renderList(data.topBranches,    topEl);
    renderList(data.lowestBranches, lowEl);
    renderIcons();
  } catch (err) {
    topEl.innerHTML = `<div class="card-body"><p class="form-error">${err.message}</p></div>`;
  }
}

// ── Leaderboard ───────────────────────────────────────────────────────────────
async function loadLeaderboard(mode, branchId) {
  const el  = document.getElementById("leaderboard-content");
  el.innerHTML = loading();
  const url = (mode === "branch" && branchId)
    ? `/api/leaderboard/branch/${branchId}`
    : "/api/leaderboard/company";
  try {
    const res  = await fetch(url);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    const list = data.leaderboard || [];
    if (list.length === 0) { el.innerHTML = empty("No employee data yet."); renderIcons(); return; }

    el.innerHTML = `
      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr>
            <th>#</th><th>Name</th><th>ID</th>
            <th>Region</th><th>Conversations</th><th>Avg Score</th>
          </tr></thead>
          <tbody>${list.map((emp, i) => `<tr>
            <td><span class="rank-number ${i < 3 ? `rank-${i + 1}` : "rank-n"}" style="display:inline-flex;">${i + 1}</span></td>
            <td style="font-weight:600;">${emp.name}</td>
            <td style="color:var(--text-3);font-size:12px;">${emp.employeeId}</td>
            <td style="color:var(--text-2);">${emp.region || "—"}</td>
            <td style="color:var(--text-2);">${emp.conversationCount}</td>
            <td>${scorePill(emp.averageScore)}</td>
          </tr>`).join("")}</tbody>
        </table>
      </div>`;
    renderIcons();
  } catch (err) {
    el.innerHTML = `<div class="card-body"><p class="form-error">${err.message}</p></div>`;
  }
}

// ── Training ──────────────────────────────────────────────────────────────────
async function loadTraining() {
  const recsEl = document.getElementById("training-recs");
  recsEl.innerHTML = loading();
  try {
    const res  = await fetch("/api/dashboard/summary");
    const data = await res.json();
    const recs = data.mostCommonRecommendations || [];
    recsEl.innerHTML = recs.length === 0
      ? empty("No recommendations data yet.")
      : `<div class="recs-list">${recs.map((r) => `
          <div class="rec-item">
            <span class="rec-icon"><i data-lucide="lightbulb"></i></span>
            <span style="flex:1;">${r.recommendation}</span>
            <span class="badge badge-gray">${r.count}x</span>
          </div>`).join("")}</div>`;
    renderIcons();
    if (allBranches.length > 0) loadBranchInsights(allBranches[0].branchId);
  } catch (err) {
    recsEl.innerHTML = `<p class="form-error">${err.message}</p>`;
  }
}

async function loadBranchInsights(branchId) {
  const el = document.getElementById("branch-insights-body");
  el.innerHTML = loading();
  try {
    const res  = await fetch(`/api/branches/${branchId}/insights`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    if (data.totalConversations === 0) { el.innerHTML = empty("No conversations for this branch yet."); renderIcons(); return; }

    const ul = (items) => items?.length
      ? `<ul>${items.map((i) =>
          `<li>${typeof i === "object" ? `${i.label}: ${i.value}/100` : i}</li>`
        ).join("")}</ul>`
      : `<p style="font-size:12px;color:var(--text-3);">None identified.</p>`;

    el.innerHTML = `
      <div class="insights-panel">
        <div class="insight-h success"><i data-lucide="check-circle"></i>Strengths</div>${ul(data.strengths)}
        <div class="insight-h warning"><i data-lucide="alert-triangle"></i>Weaknesses</div>${ul(data.weaknesses)}
        <div class="insight-h purple"><i data-lucide="book-open"></i>Training Opportunities</div>${ul(data.trainingOpportunities)}
      </div>`;
    renderIcons();
  } catch (err) {
    el.innerHTML = `<p class="form-error">${err.message}</p>`;
  }
}

// ── Language Analytics ────────────────────────────────────────────────────────
async function loadLanguage() {
  const el = document.getElementById("language-table-wrap");
  el.innerHTML = loading();
  try {
    const res  = await fetch("/api/regional/language");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    const dist    = data.distribution || {};
    const regions = Object.keys(dist);
    if (regions.length === 0) { el.innerHTML = empty("No language data yet. Language detection runs on new conversation uploads."); renderIcons(); return; }

    let rows = "";
    regions.forEach((region) => {
      dist[region].forEach((entry, i) => {
        rows += `<tr>
          <td style="font-weight:${i === 0 ? "600" : "400"};color:var(--text-${i === 0 ? "1" : "3"});">${i === 0 ? region : ""}</td>
          <td>${langTag(entry.language)}</td>
          <td style="color:var(--text-2);">${entry.count}</td>
        </tr>`;
      });
    });

    el.innerHTML = `
      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr><th>Region</th><th>Language</th><th>Conversations</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
    renderIcons();
  } catch (err) {
    el.innerHTML = `<div class="card-body"><p class="form-error">${err.message}</p></div>`;
  }
}

// ═══════════════════════════════════════════════════════════
// LIVE OPERATIONS
// ═══════════════════════════════════════════════════════════
let liveOpsInterval = null;

async function initLiveOps() {
  await refreshLiveOps();
  liveOpsInterval = setInterval(() => {
    if (document.getElementById("section-live-ops").classList.contains("active")) {
      refreshLiveOps();
    } else {
      clearInterval(liveOpsInterval);
      liveOpsInterval = null;
    }
  }, 10000);
}

async function refreshLiveOps() {
  await Promise.all([loadLiveStats(), loadActiveSessions(), loadRecentLiveSessions()]);
  const label = document.getElementById("live-refresh-label");
  if (label) {
    const now = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    label.textContent = `Last refreshed ${now} &middot; Auto-refresh every 10s`;
  }
}

async function loadLiveStats() {
  try {
    const res  = await fetch("/api/live/stats");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    document.getElementById("live-stat-active").textContent   = data.activeCount ?? 0;
    document.getElementById("live-stat-today").textContent    = data.todayCount  ?? 0;
    document.getElementById("live-stat-branches").textContent = data.activeBranches?.length ?? 0;

    const breakdownEl = document.getElementById("live-branch-breakdown");
    if (!data.activeBranches || data.activeBranches.length === 0) {
      breakdownEl.innerHTML = empty("No active sessions at any branch right now.");
      renderIcons(); return;
    }
    breakdownEl.innerHTML = `
      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr><th>Branch</th><th>Region</th><th>Active Sessions</th></tr></thead>
          <tbody>${data.activeBranches.map((b) => `<tr>
            <td style="font-weight:600;">${b.branchName || b.branchId}</td>
            <td style="color:var(--text-2);">${b.region || "—"}</td>
            <td><span class="session-status-pill active"><span class="rec-dot active"></span>${b.activeSessions}</span></td>
          </tr>`).join("")}</tbody>
        </table>
      </div>`;
    renderIcons();
  } catch (err) { console.error("Live stats error:", err.message); }
}

async function loadActiveSessions() {
  const el = document.getElementById("live-active-sessions");
  try {
    const res  = await fetch("/api/live/active");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    const sessions = data.sessions || [];
    if (sessions.length === 0) {
      el.innerHTML = empty("No employees are currently recording.");
      renderIcons(); return;
    }
    el.innerHTML = `
      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr>
            <th>Employee</th><th>ID</th>
            <th>Branch</th><th>Region</th>
            <th>Started</th><th>Status</th>
          </tr></thead>
          <tbody>${sessions.map((s) => `<tr>
            <td style="font-weight:600;">${s.employeeName || "—"}</td>
            <td style="color:var(--text-3);font-size:12px;">${s.employeeId}</td>
            <td style="color:var(--text-2);">${s.branchName || "—"}</td>
            <td style="color:var(--text-2);">${s.region || "—"}</td>
            <td style="color:var(--text-2);white-space:nowrap;">${formatDate(s.startedAt)}</td>
            <td><span class="session-status-pill ${s.status}"><span class="rec-dot ${s.status}"></span>${capitalize(s.status)}</span></td>
          </tr>`).join("")}</tbody>
        </table>
      </div>`;
    renderIcons();
  } catch (err) {
    el.innerHTML = `<div class="card-body"><p class="form-error">${err.message}</p></div>`;
  }
}

async function loadRecentLiveSessions() {
  const el = document.getElementById("live-recent-sessions");
  try {
    const res  = await fetch("/api/live/recent");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    const sessions = data.sessions || [];
    if (sessions.length === 0) { el.innerHTML = empty("No completed sessions yet."); renderIcons(); return; }

    el.innerHTML = `
      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr>
            <th>Employee</th><th>Branch</th><th>Region</th>
            <th>Date &amp; Time</th><th>Duration</th><th>Score</th><th>Status</th>
          </tr></thead>
          <tbody>${sessions.map((s) => `<tr>
            <td style="font-weight:600;">${s.employeeName || s.employeeId}</td>
            <td style="color:var(--text-2);">${s.branchName || "—"}</td>
            <td style="color:var(--text-2);">${s.region || "—"}</td>
            <td style="color:var(--text-2);white-space:nowrap;">${formatDate(s.startedAt)}</td>
            <td style="color:var(--text-2);">${s.durationSeconds !== null ? formatLiveDuration(s.durationSeconds) : "—"}</td>
            <td>${s.overallScore !== null ? scorePill(s.overallScore) : "—"}</td>
            <td><span class="session-status-pill ${s.status}">${capitalize(s.status)}</span></td>
          </tr>`).join("")}</tbody>
        </table>
      </div>`;
    renderIcons();
  } catch (err) {
    el.innerHTML = `<div class="card-body"><p class="form-error">${err.message}</p></div>`;
  }
}

init();