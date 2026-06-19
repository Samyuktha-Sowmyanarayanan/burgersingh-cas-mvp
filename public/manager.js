// ── Auth & Init ───────────────────────────────────────────────────────────────
let session = null;
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
    document.getElementById("user-name").textContent = session.name;

    await loadStaticData();
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

    // Populate selects
    populateSelect("region-select",         allRegions,  (r) => r, (r) => r);
    populateSelect("lb-branch-select",      allBranches, (b) => b.branchId, (b) => b.name, "Company-Wide");
    populateSelect("insights-branch-select",allBranches, (b) => b.branchId, (b) => b.name);

    currentRegion = allRegions[0] || null;
    if (currentRegion) document.getElementById("region-select").value = currentRegion;

    document.getElementById("region-select").addEventListener("change", (e) => {
      currentRegion = e.target.value;
      loadRegionDeepDive(currentRegion);
    });

    document.getElementById("lb-branch-select").addEventListener("change", (e) => {
      const val = e.target.value;
      loadLeaderboard(val || "company", val || null);
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
    console.error("Static data load error:", err.message);
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
};
const sectionLabels = {
  overview: "Overview", branches: "Branch Analytics", regional: "Regional Intelligence",
  rankings: "Franchise Rankings", leaderboard: "Employee Leaderboard",
  training: "Training Insights", language: "Language Analytics",
};

let loadedSections = {};

function setupNav() {
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.section;
      document.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.section === key));
      document.querySelectorAll(".content-section").forEach((s) => s.classList.toggle("active", s.id === `section-${key}`));
      document.getElementById("page-title").textContent = sectionLabels[key];
      if (!loadedSections[key] && sectionLoaders[key]) {
        sectionLoaders[key]();
        loadedSections[key] = true;
      }
    });
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function scoreClass(s)  { return s >= 80 ? "high" : s >= 60 ? "medium" : "low"; }
function scorePill(s)   {
  if (s === null || s === undefined) return `<span class="score-pill score-neutral">—</span>`;
  return `<span class="score-pill score-${scoreClass(s)}">${s}/100</span>`;
}
function langTag(lang) {
  const map = { English: "en", Hindi: "hi", Bengali: "bn", Assamese: "as", Nepali: "ne", Mixed: "mixed" };
  const cls = map[lang] || "mixed";
  return lang ? `<span class="lang-tag lang-${cls}">${lang}</span>` : "";
}
function formatDate(ts) { return new Date(ts).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }); }
function loading(msg = "Loading...") {
  return `<div class="spinner-wrap"><div class="spinner"></div><span>${msg}</span></div>`;
}
function empty(msg = "No data yet.") {
  return `<div class="empty-state"><div class="empty-icon">📭</div><p>${msg}</p></div>`;
}
function miniTable(rows) {
  return rows.map(([label, value]) => `
    <div class="flex justify-between items-center" style="padding:8px 0;border-bottom:1px solid var(--border);">
      <span class="text-sm text-secondary">${label}</span>
      <span class="text-sm font-semibold">${value}</span>
    </div>`).join("");
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

    const recsEl = document.getElementById("ov-recs");
    const recs = data.mostCommonRecommendations || [];
    recsEl.innerHTML = recs.length === 0
      ? empty("No recommendations data yet.")
      : `<div class="recs-list">${recs.map((r) => `
          <div class="rec-item">
            <span class="rec-icon">💡</span>
            <span style="flex:1">${r.recommendation}</span>
            <span class="badge badge-gray">${r.count}x</span>
          </div>`).join("")}</div>`;
  } catch (err) {
    console.error("Overview error:", err.message);
  }
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
          <thead><tr><th>Region</th><th>Branch</th><th>Conversations</th><th>Avg Score</th><th>Performance</th></tr></thead>
          <tbody>${data.branches.map((b) => `<tr>
            <td>${b.region}</td>
            <td>${b.name}</td>
            <td>${b.totalConversations}</td>
            <td>${scorePill(b.averageScore)}</td>
            <td>
              ${b.averageScore !== null
                ? `<div style="width:120px;height:6px;background:var(--border);border-radius:4px;">
                     <div style="width:${b.averageScore}%;height:6px;background:${b.averageScore >= 80 ? 'var(--success)' : b.averageScore >= 60 ? 'var(--warning)' : 'var(--danger)'};border-radius:4px;"></div>
                   </div>`
                : '<span class="text-muted text-sm">No data</span>'}
            </td>
          </tr>`).join("")}</tbody>
        </table>
      </div>`;
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
            <td><strong>${r.region}</strong></td>
            <td>${r.totalConversations}</td>
            <td>${scorePill(r.averageScore)}</td>
            <td>${r.avgEngagement !== null ? `${r.avgEngagement}/10` : "—"}</td>
            <td>${r.avgUpselling !== null ? `${r.avgUpselling}/10` : "—"}</td>
            <td>${r.comboRate !== null ? `${r.comboRate}%` : "—"}</td>
            <td>${r.discountRate !== null ? `${r.discountRate}%` : "—"}</td>
          </tr>`).join("")}</tbody>
        </table>
      </div>`;
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
      ["Conversations",  b.totalConversations],
      ["Avg Score",      b.averageScore !== null ? `${b.averageScore}/100` : "—"],
      ["Avg Engagement", b.avgEngagement !== null ? `${b.avgEngagement}/10` : "—"],
      ["Avg Politeness", b.avgPoliteness !== null ? `${b.avgPoliteness}/10` : "—"],
      ["Professionalism",b.avgProfessionalism !== null ? `${b.avgProfessionalism}/10` : "—"],
      ["Combo Acceptance",b.comboAcceptanceRate !== null ? `${b.comboAcceptanceRate}%` : "—"],
      ["Successful Upsells", b.successfulUpsells],
      ["Missed Upsells",     b.missedUpsells],
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
      ? `<p class="text-muted text-sm">No language data for this region yet.</p>`
      : langs.map((l) => `
          <div class="flex items-center gap-8" style="padding:6px 0;">
            ${langTag(l.language)}
            <span class="text-sm">${l.count} conversation${l.count !== 1 ? "s" : ""}</span>
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
    const ul  = (items) => items?.length ? `<ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>` : "";
    el.innerHTML = `
      <div class="insights-panel">
        <p class="insights-meta-text">Based on ${data.totalConversations} conversation(s) in ${region}</p>
        <h4>✅ Strengths</h4>${ul(ins.strengths)}
        <h4>⚠️ Weaknesses</h4>${ul(ins.weaknesses)}
        <h4>📢 Marketing Opportunities</h4>${ul(ins.marketingOpportunities)}
        <h4>🎓 Training Recommendations</h4>${ul(ins.trainingRecommendations)}
        ${ins.languageInsights ? `<h4>🌐 Language Insights</h4><p>${ins.languageInsights}</p>` : ""}
      </div>`;
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

    const renderRankList = (branches, el) => {
      if (branches.length === 0) { el.innerHTML = empty("Minimum 3 conversations per branch required for ranking."); return; }
      el.innerHTML = branches.map((b, i) => `
        <div class="rank-item">
          <div class="rank-number ${i < 3 ? `rank-${i+1}` : "rank-n"}">${i + 1}</div>
          <div class="rank-info">
            <div class="rank-name">${b.region}</div>
            <div class="rank-sub">${b.name} &nbsp;·&nbsp; ${b.totalConversations} conversation${b.totalConversations !== 1 ? "s" : ""}</div>
          </div>
          ${scorePill(b.averageScore)}
        </div>`).join("");
    };

    renderRankList(data.topBranches,    topEl);
    renderRankList(data.lowestBranches, lowEl);
  } catch (err) {
    topEl.innerHTML = `<div class="card-body"><p class="form-error">${err.message}</p></div>`;
  }
}

// ── Leaderboard ───────────────────────────────────────────────────────────────
async function loadLeaderboard(mode, branchId) {
  const el = document.getElementById("leaderboard-content");
  el.innerHTML = loading();

  let url = "/api/leaderboard/company";
  if (mode === "branch" && branchId) url = `/api/leaderboard/branch/${branchId}`;

  try {
    const res  = await fetch(url);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    const list = data.leaderboard || [];

    if (list.length === 0) { el.innerHTML = empty("No employee data yet."); return; }

    el.innerHTML = `
      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr><th>#</th><th>Employee</th><th>ID</th><th>Region</th><th>Conversations</th><th>Avg Score</th></tr></thead>
          <tbody>${list.map((emp, i) => `<tr>
            <td><span class="rank-number ${i < 3 ? `rank-${i+1}` : "rank-n"}" style="display:inline-flex;">${i + 1}</span></td>
            <td><strong>${emp.name}</strong></td>
            <td class="text-muted">${emp.employeeId}</td>
            <td>${emp.region || "—"}</td>
            <td>${emp.conversationCount}</td>
            <td>${scorePill(emp.averageScore)}</td>
          </tr>`).join("")}</tbody>
        </table>
      </div>`;
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
            <span class="rec-icon">💡</span>
            <span style="flex:1">${r.recommendation}</span>
            <span class="badge badge-gray">${r.count}x</span>
          </div>`).join("")}</div>`;

    // Load first branch insights by default
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

    if (data.totalConversations === 0) {
      el.innerHTML = empty("No conversations for this branch yet.");
      return;
    }

    const ul = (items) => items?.length
      ? `<ul style="padding-left:16px;">${items.map((i) => `<li style="font-size:13px;color:var(--text-2);padding:3px 0;">${typeof i === "object" ? `${i.label}: ${i.value}/100` : i}</li>`).join("")}</ul>`
      : "<p class='text-muted text-sm'>None identified.</p>";

    el.innerHTML = `
      <div class="insights-panel">
        <h4>✅ Strengths</h4>${ul(data.strengths)}
        <h4>⚠️ Weaknesses</h4>${ul(data.weaknesses)}
        <h4>🎓 Training Opportunities</h4>${ul(data.trainingOpportunities)}
      </div>`;
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

    if (regions.length === 0) {
      el.innerHTML = empty("No language data yet. Language detection runs on new conversation uploads.");
      return;
    }

    let rows = "";
    regions.forEach((region) => {
      dist[region].forEach((entry, i) => {
        rows += `<tr>
          <td>${i === 0 ? `<strong>${region}</strong>` : ""}</td>
          <td>${langTag(entry.language)}</td>
          <td>${entry.count}</td>
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
  } catch (err) {
    el.innerHTML = `<div class="card-body"><p class="form-error">${err.message}</p></div>`;
  }
}

init();