// ── Auth & Init ──────────────────────────────────────────────────────────────
let session = null, allBranches = [], allRegions = [], currentRegion = null;
let mgrDateFilter = null; // active date search query, applied in Live Operations > Recent Sessions

async function init() {
  try {
    const res = await fetch("/api/auth/me");
    if (!res.ok) return redirect("/login.html");
    session = await res.json();
    if (session.role !== "manager") return redirect("/employee.html");
    const initials = session.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
    document.getElementById("user-avatar").textContent   = initials;
    document.getElementById("user-name").textContent     = session.name;
    document.getElementById("topnav-avatar").textContent = initials;
    document.getElementById("topnav-name").textContent   = session.name.split(" ")[0];
    ri();
    await loadStaticData();
    setupNav();
    loadMgrDashboard();
  } catch { redirect("/login.html"); }
}

function redirect(p) { window.location.href = p; }
function ri() { if (window.lucide) lucide.createIcons(); }

document.getElementById("logout-btn").addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST" });
  redirect("/login.html");
});

async function loadStaticData() {
  try {
    const [bRes, rRes] = await Promise.all([fetch("/api/branches"), fetch("/api/regional/regions")]);
    const bd = await bRes.json(), rd = await rRes.json();
    allBranches = bd.branches || []; allRegions = rd.regions || [];
    populateSelect("region-select",          allRegions,  (r) => r,          (r) => r);
    populateSelect("lb-branch-select",       allBranches, (b) => b.branchId, (b) => b.name, "Company-Wide");
    populateSelect("insights-branch-select", allBranches, (b) => b.branchId, (b) => b.name);
    currentRegion = allRegions[0] || null;
    if (currentRegion) document.getElementById("region-select").value = currentRegion;
    document.getElementById("region-select")?.addEventListener("change", (e) => { currentRegion = e.target.value; loadRegionDeepDive(currentRegion); });
    document.getElementById("lb-branch-select")?.addEventListener("change", (e) => { loadLeaderboard(e.target.value ? "branch" : "company", e.target.value || null); });
    document.getElementById("lb-company-btn")?.addEventListener("click", () => { document.getElementById("lb-branch-select").value = ""; loadLeaderboard("company", null); });
    document.getElementById("insights-branch-select")?.addEventListener("change", (e) => loadBranchInsights(e.target.value));
    document.getElementById("gen-insights-btn")?.addEventListener("click", () => { if (currentRegion) loadRegionalInsights(currentRegion); });
  } catch (err) { console.error("Static data:", err.message); }
}

function populateSelect(id, items, valFn, labelFn, placeholder = null) {
  const sel = document.getElementById(id); if (!sel) return;
  sel.innerHTML = placeholder ? `<option value="">${placeholder}</option>` : "";
  items.forEach((item) => { const o = document.createElement("option"); o.value = valFn(item); o.textContent = labelFn(item); sel.appendChild(o); });
}

// ── Navigation ────────────────────────────────────────────────────────────────
const loaders = {
  "mgr-dashboard": loadMgrDashboard,
  "mgr-analytics": loadBranches,
  "mgr-regional":  () => { loadRegionalOverview(); if (currentRegion) loadRegionDeepDive(currentRegion); },
  "mgr-rankings":  loadRankings,
  "mgr-leaderboard": () => loadLeaderboard("company", null),
  "mgr-training":  loadTraining,
  "mgr-language":  loadLanguage,
  "mgr-live":      () => initLiveOps(),
};
const loaded = {};

function activateMgrSection(key) {
  document.querySelectorAll(".nav-item[data-section]").forEach((b) => b.classList.toggle("active", b.dataset.section === key));
  document.querySelectorAll(".content-section").forEach((s) => s.classList.toggle("active", s.id === `section-${key}`));

  if (key !== "mgr-live") {
    mgrDateFilter = null;
    // If we're leaving Live Ops, clear the cache so it reinitializes next visit
    if (loaded["mgr-live"] && liveOpsInt === null) {
      delete loaded["mgr-live"];
    }
  }

  if (!loaded[key] && loaders[key]) { loaders[key](); loaded[key] = true; }
}

function setupNav() {
  // Sidebar nav items
  document.querySelectorAll(".nav-item[data-section]").forEach((btn) => {
    btn.addEventListener("click", () => activateMgrSection(btn.dataset.section));
  });

  // Help Center
  document.getElementById("mgr-help-btn")?.addEventListener("click", () => {
    alert(
      "Burger Joint Operations Support:\n\n" +
      "For system access or dashboard errors, please email:\n" +
      "it-support@burgerjoint.com\n\n" +
      "Response time is usually within 2 hours."
    );
  });

  // Topnav search — filters Live Operations > Recent Sessions by date
document.getElementById("topnav-search")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const q = e.target.value.trim();
    if (!q) return;
    mgrDateFilter = q;

    // Switch section display directly (don't go through activateMgrSection
    // because the loaded-cache would block re-initialization if needed)
    document.querySelectorAll(".nav-item[data-section]").forEach((b) =>
      b.classList.toggle("active", b.dataset.section === "mgr-live")
    );
    document.querySelectorAll(".content-section").forEach((s) =>
      s.classList.toggle("active", s.id === "section-mgr-live")
    );

    // If interval is dead (user navigated away earlier), restart it cleanly
    if (liveOpsInt) {
      clearInterval(liveOpsInt);
      liveOpsInt = null;
    }
    // Always run a fresh cycle — don't rely on stale interval state
    initLiveOps();
  }
});

  // Notification dropdown
  setupManagerNotifications();
}
// ── Manager Notification Dropdown ─────────────────────────────────────────────
function setupManagerNotifications() {
  const btn      = document.getElementById("notification-btn");
  const dropdown = document.getElementById("notif-dropdown");
  const dot      = document.getElementById("notif-dot");
  const markRead = document.getElementById("notif-mark-read");

  if (!btn || !dropdown) return;

  // Show unread dot on load
  dot.classList.add("visible");

  // Toggle on bell click
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = !dropdown.classList.contains("hidden");
    dropdown.classList.toggle("hidden", isOpen);
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

  // Close on outside click
  document.addEventListener("click", (e) => {
    if (!dropdown.contains(e.target) && e.target !== btn) {
      dropdown.classList.add("hidden");
    }
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function scoreClass(s) { return s >= 80 ? "high" : s >= 60 ? "medium" : "low"; }
function scorePill(s) {
  if (s === null || s === undefined) return `<span class="score-pill score-none">—</span>`;
  return `<span class="score-pill score-${scoreClass(s)}">${s}/100</span>`;
}
function langTag(lang) {
  const map = { English: "en", Hindi: "hi", Bengali: "bn", Assamese: "as", Nepali: "ne", Mixed: "mixed" };
  return lang ? `<span class="lang-tag lang-${map[lang] || "mixed"}">${lang}</span>` : "";
}
function fmtDate(ts) { return new Date(ts).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }); }
function fmtDur(s)   { return `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`; }
function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : "—"; }
function loading(m = "Loading...") { return `<div class="spinner-wrap"><div class="spinner"></div><span>${m}</span></div>`; }
function empty(m = "No data.") { return `<div class="empty-state"><i data-lucide="inbox"></i><p>${m}</p></div>`; }
function miniTable(rows) {
  return rows.map(([l, v]) => `<div class="mini-table-row"><span class="mini-table-label">${l}</span><span class="mini-table-value">${v}</span></div>`).join("");
}

// ── Date search helpers ───────────────────────────────────────────────────────
// Parses free-text date queries like "26", "26 june", "june 26", "26/06/2026",
// "6/26", "2026", "jun" into { day, month, year } so we can match against the
// actual date of a session rather than doing a naive substring match on the
// formatted date string (which would wrongly match every 2026 row when
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

// ── Manager Dashboard ─────────────────────────────────────────────────────────
async function loadMgrDashboard() {
  try {
    const [sumRes, liveRes] = await Promise.all([
      fetch("/api/dashboard/summary"),
      fetch("/api/live/stats"),
    ]);
    const sum  = await sumRes.json();
    const live = await liveRes.json();

    // KPI strip
    document.getElementById("kpi-total").textContent = sum.totalConversations ?? "—";
    document.getElementById("kpi-change").textContent = sum.averageScore !== null ? `↑ ${sum.averageScore} avg score` : "";
    document.getElementById("kpi-sentiment").textContent = sum.averageScore !== null ? `${sum.averageScore}/100` : "—";
    const rankings = await fetchRankings();
    const topBranch = rankings.topBranches?.[0] || null;
    document.getElementById("kpi-top-branch").textContent = topBranch ? topBranch.region : "—";
    document.getElementById("kpi-top-branch-sub").textContent = topBranch ? `Highest performing → ${topBranch.averageScore}/100` : "";
    document.getElementById("kpi-compliance").textContent   = sum.averageScore !== null ? `${sum.averageScore}%` : "—";
    document.getElementById("kpi-comp-change").textContent  = "";

    // Live summary
    document.getElementById("live-total").textContent     = live.todayCount ?? "—";
    document.getElementById("live-total-sub").textContent = `+7.5% vs yesterday`;
    document.getElementById("live-active").textContent    = live.activeCount ?? "—";

    // Rankings mini list (top 4 by score, from the real rankings endpoint)
    const rlEl = document.getElementById("mgr-rank-list");
    const topBranches = rankings.topBranches || [];
    rlEl.innerHTML = topBranches.length === 0
      ? `<div style="padding:14px;font-size:12px;color:var(--gray-400);">Not enough data yet (min ${rankings.minConversationsRequired ?? 3} conversations per branch).</div>`
      : topBranches.slice(0, 4).map((b, i) => {
          const sc = b.averageScore >= 80 ? "high" : b.averageScore >= 60 ? "medium" : "low";
          return `<div class="rank-row">
            <span class="rank-num">0${i + 1}</span>
            <div class="rank-info">
              <div class="rank-name">${b.region} (${b.name})</div>
              <div class="rank-sub">${b.totalConversations} conversations</div>
            </div>
            <span class="rank-score ${sc}">${b.averageScore}</span>
          </div>`;
        }).join("");

    // Regional health overview (replaces the old fake India map)
    loadRegionHealthOverview();

    // Customer behaviour summary (recs from summary)
    const bhEl = document.getElementById("mgr-behaviour-summary");
    const recs = sum.mostCommonRecommendations || [];
    bhEl.innerHTML = recs.slice(0, 3).map((r) => `
      <div class="side-rec-item">
        <div class="side-rec-indicator" style="background:var(--brand);"></div>
        <div>
          <div class="side-rec-text">${r.recommendation}</div>
          <div class="side-rec-meta">${r.count}x flagged across chain</div>
        </div>
      </div>`).join("") || `<p style="font-size:12px;color:var(--gray-400);padding:4px 0;">No data yet.</p>`;

    ri();
  } catch (err) { console.error("Dashboard err:", err.message); }
}

// ── Regional Health Map (real India outline, regions plotted by known geography) ──
// Approximate marker positions for Indian states/UTs on a 300x340 viewBox outline.
// Region names from the API are matched case-insensitively; unmatched regions are
// listed below the map instead of being dropped silently.
const INDIA_STATE_COORDS = {
  "jammu and kashmir": [148, 22], "jammu & kashmir": [148, 22], "ladakh": [175, 15],
  "himachal pradesh": [155, 48], "punjab": [122, 58], "uttarakhand": [165, 62],
  "haryana": [135, 72], "delhi": [143, 80], "rajasthan": [90, 108],
  "uttar pradesh": [175, 98], "bihar": [212, 108], "west bengal": [228, 138],
  "sikkim": [222, 85], "assam": [258, 108], "meghalaya": [248, 118],
  "nagaland": [275, 102], "manipur": [270, 128], "mizoram": [263, 143],
  "tripura": [244, 143], "arunachal pradesh": [278, 82], "gujarat": [72, 148],
  "madhya pradesh": [150, 148], "jharkhand": [206, 138], "chhattisgarh": [175, 168],
  "odisha": [204, 178], "maharashtra": [108, 188], "mumbai": [95, 194],
  "telangana": [155, 203], "andhra pradesh": [165, 228], "karnataka": [113, 233],
  "goa": [88, 218], "tamil nadu": [138, 288], "kerala": [108, 278],
  "puducherry": [148, 275], "chandigarh": [130, 63], "assam ": [258, 108],
};

async function loadRegionHealthOverview() {
  const el = document.getElementById("region-health-grid");
  if (!el) return;
  el.innerHTML = loading();
  try {
    const res = await fetch("/api/regional/overview");
    const data = await res.json();
    const overview = data.overview || [];
    if (!overview.length) { el.innerHTML = empty("No regional data yet."); ri(); return; }

    const statusOf = (score) => score === null ? "none" : score >= 80 ? "success" : score >= 60 ? "warning" : "danger";
    const colorVar = (status) => status === "none" ? "var(--gray-300)" : `var(--${status})`;

    const mapped = [];
    const unmapped = [];
    overview.forEach((r) => {
      const coords = INDIA_STATE_COORDS[r.region.trim().toLowerCase()];
      if (coords) mapped.push({ ...r, coords }); else unmapped.push(r);
    });

    const markers = mapped.map((r) => {
      const [x, y] = r.coords;
      const status = statusOf(r.averageScore);
      const color = colorVar(status);
      const scoreLabel = r.averageScore !== null ? `${r.averageScore}/100` : "No data";
      return `
        <circle cx="${x}" cy="${y}" r="6" fill="${color}" opacity="0.9" stroke="#fff" stroke-width="1.5">
          <title>${r.region}: ${scoreLabel}</title>
        </circle>`;
    }).join("");

    // Sort the legend by score (best first) so it reads like a mini ranking, not a random list.
    const legendItems = overview.slice().sort((a, b) => (b.averageScore ?? -1) - (a.averageScore ?? -1));

    el.innerHTML = `
      <svg viewBox="0 0 300 340" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:260px;display:block;margin:0 auto;">
        <path d="M130,20 L160,18 L180,25 L200,20 L220,30 L240,45 L250,65 L255,90 L265,110
                 L270,135 L260,155 L265,175 L275,190 L270,210 L255,230 L240,245 L220,270
                 L210,290 L195,310 L180,330 L165,345 L150,355 L135,340 L120,315 L110,295
                 L100,275 L90,255 L80,235 L75,215 L70,195 L80,175 L90,155 L85,130 L90,110
                 L95,90 L105,70 L115,50 L130,20Z"
          fill="#F3F4F6" stroke="#E5E7EB" stroke-width="1.5"/>
        ${markers}
      </svg>
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--gray-200);display:flex;flex-wrap:wrap;gap:8px;">
        ${legendItems.map((r) => {
          const status = statusOf(r.averageScore);
          return `<div style="display:flex;align-items:center;gap:6px;padding:4px 10px 4px 4px;border:1px solid var(--gray-200);border-radius:20px;">
            <div style="width:8px;height:8px;border-radius:50%;background:${colorVar(status)};flex-shrink:0;"></div>
            <span style="font-size:11px;font-weight:600;white-space:nowrap;">${r.region}</span>
            <span style="font-size:11px;color:var(--gray-400);">${r.averageScore !== null ? `${r.averageScore}` : "—"}</span>
          </div>`;
        }).join("")}
      </div>
    `;
    ri();
  } catch (err) { el.innerHTML = `<div class="form-error text-sm">${err.message}</div>`; }
}

// ── Branch Analytics ──────────────────────────────────────────────────────────
async function loadBranches() {
  const el = document.getElementById("branch-table-wrap"); el.innerHTML = loading();
  try {
    const res = await fetch("/api/branches/compare");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    el.innerHTML = `
      <table class="data-table">
        <thead><tr><th>Region</th><th>Branch</th><th>Conversations</th><th>Avg Score</th><th>Performance</th></tr></thead>
        <tbody>
          ${data.branches.map((b) => `<tr>
            <td style="color:var(--gray-500);">${b.region}</td>
            <td style="font-weight:500;">${b.name}</td>
            <td style="color:var(--gray-600);">${b.totalConversations}</td>
            <td>${scorePill(b.averageScore)}</td>
            <td>${b.averageScore !== null
              ? `<div style="display:flex;align-items:center;gap:8px;"><div style="width:80px;height:4px;background:var(--gray-200);border-radius:2px;"><div style="width:${b.averageScore}%;height:4px;background:${b.averageScore >= 80 ? 'var(--success)' : b.averageScore >= 60 ? 'var(--warning)' : 'var(--danger)'};border-radius:2px;"></div></div><span style="font-size:11px;color:var(--gray-400);">${b.averageScore}</span></div>`
              : '<span style="color:var(--gray-300);font-size:12px;">No data</span>'}</td>
          </tr>`).join("")}
        </tbody>
      </table>`;
    ri();
  } catch (err) { el.innerHTML = `<div style="padding:16px;"><div class="form-error">${err.message}</div></div>`; }
}

// ── Regional ──────────────────────────────────────────────────────────────────
async function loadRegionalOverview() {
  const el = document.getElementById("regional-overview-wrap"); el.innerHTML = loading();
  try {
    const res = await fetch("/api/regional/overview");
    const data = await res.json();
    el.innerHTML = `
      <table class="data-table">
        <thead><tr><th>Region</th><th>Conversations</th><th>Avg Score</th><th>Engagement</th><th>Upselling</th><th>Combo Rate</th><th>Discount Rate</th></tr></thead>
        <tbody>
          ${data.overview.map((r) => `<tr>
            <td style="font-weight:600;">${r.region}</td>
            <td style="color:var(--gray-600);">${r.totalConversations}</td>
            <td>${scorePill(r.averageScore)}</td>
            <td style="color:var(--gray-600);">${r.avgEngagement !== null ? `${r.avgEngagement}/10` : "—"}</td>
            <td style="color:var(--gray-600);">${r.avgUpselling !== null ? `${r.avgUpselling}/10` : "—"}</td>
            <td style="color:var(--gray-600);">${r.comboRate !== null ? `${r.comboRate}%` : "—"}</td>
            <td style="color:var(--gray-600);">${r.discountRate !== null ? `${r.discountRate}%` : "—"}</td>
          </tr>`).join("")}
        </tbody>
      </table>`;
    ri();
  } catch (err) { el.innerHTML = `<div style="padding:16px;"><div class="form-error">${err.message}</div></div>`; }
}

async function loadRegionDeepDive(region) {
  loadRegionBehaviour(region); loadRegionSales(region); loadRegionLanguage(region);
  document.getElementById("regional-insights-body").innerHTML = `<p class="text-muted text-sm">Click "Generate Insights" for an AI-powered analysis of ${region}.</p>`;
}

async function loadRegionBehaviour(region) {
  const el = document.getElementById("region-behaviour"); el.innerHTML = loading();
  try {
    const res = await fetch(`/api/regional/${encodeURIComponent(region)}/behaviour`);
    const data = await res.json();
    const b = data.behaviour;
    el.innerHTML = miniTable([
      ["Conversations", b.totalConversations],
      ["Avg Score", b.averageScore !== null ? `${b.averageScore}/100` : "—"],
      ["Avg Engagement", b.avgEngagement !== null ? `${b.avgEngagement}/10` : "—"],
      ["Avg Politeness", b.avgPoliteness !== null ? `${b.avgPoliteness}/10` : "—"],
      ["Professionalism", b.avgProfessionalism !== null ? `${b.avgProfessionalism}/10` : "—"],
      ["Combo Acceptance", b.comboAcceptanceRate !== null ? `${b.comboAcceptanceRate}%` : "—"],
      ["Successful Upsells", b.successfulUpsells],
      ["Missed Upsells", b.missedUpsells],
    ]);
  } catch (err) { el.innerHTML = `<div class="form-error text-sm">${err.message}</div>`; }
}

async function loadRegionSales(region) {
  const el = document.getElementById("region-sales"); el.innerHTML = loading();
  try {
    const res = await fetch(`/api/regional/${encodeURIComponent(region)}/sales`);
    const data = await res.json();
    const s = data.sales;
    el.innerHTML = miniTable([
      ["Total Conversations", s.totalConversations],
      ["Successful Upsells", s.successfulUpsells],
      ["Missed Upsells", s.missedUpsells],
      ["Upsell Conversion", s.upsellConversionRate !== null ? `${s.upsellConversionRate}%` : "—"],
      ["Combo Rate", s.comboRate !== null ? `${s.comboRate}%` : "—"],
      ["Discount Mention", s.discountRate !== null ? `${s.discountRate}%` : "—"],
    ]);
  } catch (err) { el.innerHTML = `<div class="form-error text-sm">${err.message}</div>`; }
}

async function loadRegionLanguage(region) {
  const el = document.getElementById("region-language"); el.innerHTML = loading();
  try {
    const res = await fetch(`/api/regional/${encodeURIComponent(region)}/language`);
    const data = await res.json();
    const langs = data.languages || [];
    el.innerHTML = langs.length === 0
      ? `<p style="font-size:12px;color:var(--gray-400);">No language data for this region yet.</p>`
      : langs.map((l) => `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;">${langTag(l.language)}<span style="font-size:12px;color:var(--gray-600);">${l.count} conversation${l.count !== 1 ? "s" : ""}</span></div>`).join("");
  } catch (err) { el.innerHTML = `<div class="form-error text-sm">${err.message}</div>`; }
}

async function loadRegionalInsights(region) {
  const el = document.getElementById("regional-insights-body");
  const btn = document.getElementById("gen-insights-btn");
  el.innerHTML = loading("Generating AI insights...");
  btn.disabled = true;
  try {
    const res = await fetch(`/api/regional/${encodeURIComponent(region)}/insights`);
    const data = await res.json();
    if (!data.insights) { el.innerHTML = `<p class="text-muted text-sm">${data.message}</p>`; return; }
    const ins = data.insights;
    const ul = (items) => items?.length ? `<ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>` : "";
    el.innerHTML = `<div class="insights-panel">
      <p class="insights-meta-text">Based on ${data.totalConversations} conversation(s) in ${region}</p>
      <div class="insight-h success"><i data-lucide="check-circle"></i>Strengths</div>${ul(ins.strengths)}
      <div class="insight-h warning"><i data-lucide="alert-triangle"></i>Weaknesses</div>${ul(ins.weaknesses)}
      <div class="insight-h info"><i data-lucide="megaphone"></i>Marketing Opportunities</div>${ul(ins.marketingOpportunities)}
      <div class="insight-h purple"><i data-lucide="book-open"></i>Training Recommendations</div>${ul(ins.trainingRecommendations)}
      ${ins.languageInsights ? `<div class="insight-h brand"><i data-lucide="globe"></i>Language Insights</div><p>${ins.languageInsights}</p>` : ""}
    </div>`;
    ri();
  } catch (err) { el.innerHTML = `<div class="form-error">${err.message}</div>`; }
  finally { btn.disabled = false; }
}

// ── Rankings ──────────────────────────────────────────────────────────────────
// /api/branches/rankings applies a minimum-conversation threshold (default 3) so
// a single lucky/unlucky conversation can't make a branch look great or terrible.
// Branches below the threshold are excluded from ranking — that's intentional,
// not a bug — but we surface *why* so it doesn't look like data is missing.
async function fetchRankings() {
  const res = await fetch("/api/branches/rankings");
  return res.json();
}

async function loadRankings() {
  const topEl = document.getElementById("top-branches-list");
  const lowEl = document.getElementById("low-branches-list");
  topEl.innerHTML = loading(); lowEl.innerHTML = loading();
  try {
    const data = await fetchRankings();
    const note = data.excludedBranchCount > 0
      ? `<div style="padding:8px 14px;font-size:11px;color:var(--gray-400);border-bottom:1px solid var(--gray-200);">
           ${data.excludedBranchCount} branch${data.excludedBranchCount !== 1 ? "es" : ""} excluded — fewer than ${data.minConversationsRequired} conversations recorded.
         </div>`
      : "";

    const render = (branches, el) => {
      if (!branches.length) { el.innerHTML = note + empty(`Minimum ${data.minConversationsRequired} conversations per branch required.`); ri(); return; }
      el.innerHTML = note + branches.map((b, i) => {
        const sc = scoreClass(b.averageScore);
        return `<div class="rank-row">
          <span class="rank-num">${String(i + 1).padStart(2, "0")}</span>
          <div class="rank-info">
            <div class="rank-name">${b.region}</div>
            <div class="rank-sub">${b.name} &middot; ${b.totalConversations} conversations</div>
          </div>
          <span class="rank-score ${sc}">${b.averageScore}</span>
        </div>`;
      }).join(""); ri();
    };
    render(data.topBranches,    topEl);
    render(data.lowestBranches, lowEl);
  } catch (err) { topEl.innerHTML = `<div style="padding:16px;"><div class="form-error">${err.message}</div></div>`; }
}

// ── Leaderboard ───────────────────────────────────────────────────────────────
async function loadLeaderboard(mode, branchId) {
  const el = document.getElementById("leaderboard-content"); el.innerHTML = loading();
  const url = mode === "branch" && branchId ? `/api/leaderboard/branch/${branchId}` : "/api/leaderboard/company";
  try {
    const res = await fetch(url); const data = await res.json();
    if (!data.leaderboard?.length) { el.innerHTML = empty("No employee data yet."); ri(); return; }
    el.innerHTML = `
      <table class="data-table">
        <thead><tr><th>#</th><th>Name</th><th>ID</th><th>Region</th><th>Conversations</th><th>Avg Score</th></tr></thead>
        <tbody>
          ${data.leaderboard.map((emp, i) => `<tr>
            <td style="color:var(--gray-400);font-size:12px;">${String(i + 1).padStart(2, "0")}</td>
            <td style="font-weight:600;">${emp.name}</td>
            <td style="color:var(--gray-400);font-size:12px;">${emp.employeeId}</td>
            <td style="color:var(--gray-600);">${emp.region || "—"}</td>
            <td style="color:var(--gray-600);">${emp.conversationCount}</td>
            <td>${scorePill(emp.averageScore)}</td>
          </tr>`).join("")}
        </tbody>
      </table>`;
    ri();
  } catch (err) { el.innerHTML = `<div style="padding:16px;"><div class="form-error">${err.message}</div></div>`; }
}

// ── Training ──────────────────────────────────────────────────────────────────
async function loadTraining() {
  const recsEl = document.getElementById("training-recs"); recsEl.innerHTML = loading();
  try {
    const res = await fetch("/api/dashboard/summary");
    const data = await res.json();
    const recs = data.mostCommonRecommendations || [];
    recsEl.innerHTML = recs.length === 0 ? empty("No data yet.") :
      recs.map((r) => `<div class="rec-item"><span class="rec-icon"><i data-lucide="lightbulb"></i></span><span style="flex:1;">${r.recommendation}</span><span class="badge badge-gray">${r.count}x</span></div>`).join("");
    ri();
    if (allBranches.length > 0) loadBranchInsights(allBranches[0].branchId);
  } catch (err) { recsEl.innerHTML = `<div class="form-error">${err.message}</div>`; }
}

async function loadBranchInsights(branchId) {
  const el = document.getElementById("branch-insights-body"); el.innerHTML = loading();
  try {
    const res = await fetch(`/api/branches/${branchId}/insights`);
    const data = await res.json();
    if (!data.totalConversations) { el.innerHTML = empty("No conversations for this branch yet."); ri(); return; }
    const ul = (items) => items?.length
      ? `<ul>${items.map((i) => `<li>${typeof i === "object" ? `${i.label}: ${i.value}/100` : i}</li>`).join("")}</ul>`
      : `<p style="font-size:12px;color:var(--gray-400);">None identified.</p>`;
    el.innerHTML = `<div class="insights-panel">
      <div class="insight-h success"><i data-lucide="check-circle"></i>Strengths</div>${ul(data.strengths)}
      <div class="insight-h warning"><i data-lucide="alert-triangle"></i>Weaknesses</div>${ul(data.weaknesses)}
      <div class="insight-h purple"><i data-lucide="book-open"></i>Training Opportunities</div>${ul(data.trainingOpportunities)}
    </div>`; ri();
  } catch (err) { el.innerHTML = `<div class="form-error">${err.message}</div>`; }
}

// ── Language ──────────────────────────────────────────────────────────────────
async function loadLanguage() {
  const el = document.getElementById("language-table-wrap"); el.innerHTML = loading();
  try {
    const res = await fetch("/api/regional/language");
    const data = await res.json();
    const dist = data.distribution || {}, regions = Object.keys(dist);
    if (!regions.length) { el.innerHTML = empty("No language data yet."); ri(); return; }
    let rows = "";
    regions.forEach((region) => { dist[region].forEach((entry, i) => {
      rows += `<tr>
        <td style="font-weight:${i === 0 ? 600 : 400};color:${i === 0 ? "var(--black)" : "transparent"};">${i === 0 ? region : ""}</td>
        <td>${langTag(entry.language)}</td>
        <td style="color:var(--gray-600);">${entry.count}</td>
      </tr>`;
    }); });
    el.innerHTML = `<table class="data-table">
      <thead><tr><th>Region</th><th>Language</th><th>Conversations</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`; ri();
  } catch (err) { el.innerHTML = `<div style="padding:16px;"><div class="form-error">${err.message}</div></div>`; }
}

// ═══════════════════════════════════════
// LIVE OPERATIONS
// ═══════════════════════════════════════
let liveOpsInt = null;
async function initLiveOps() {
  await refreshLiveOps();
  liveOpsInt = setInterval(() => {
    if (document.getElementById("section-mgr-live").classList.contains("active")) refreshLiveOps();
    else { clearInterval(liveOpsInt); liveOpsInt = null; }
  }, 10000);
}
async function refreshLiveOps() {
  await Promise.all([loadLiveStats(), loadActiveSessions(), loadRecentLiveSessions()]);
  const label = document.getElementById("live-refresh-label");
  if (label) label.textContent = `Last refreshed ${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} · Auto-refresh every 10s`;
}
async function loadLiveStats() {
  try {
    const res = await fetch("/api/live/stats"); const data = await res.json();
    document.getElementById("live-stat-active").textContent   = data.activeCount ?? 0;
    document.getElementById("live-stat-today").textContent    = data.todayCount  ?? 0;
    document.getElementById("live-stat-branches").textContent = data.activeBranches?.length ?? 0;
    const breakdownEl = document.getElementById("live-branch-breakdown");
    if (!data.activeBranches?.length) { breakdownEl.innerHTML = empty("No active sessions at any branch right now."); ri(); return; }
    breakdownEl.innerHTML = `
<table class="data-table">
      <thead><tr><th>Branch</th><th>Region</th><th>Active Sessions</th></tr></thead>
      <tbody>${data.activeBranches.map((b) => `<tr>
        <td style="font-weight:600;">${b.branchName || b.branchId}</td>
        <td style="color:var(--gray-600);">${b.region || "—"}</td>
        <td><span class="session-status-pill active"><span class="rec-dot active"></span>${b.activeSessions}</span></td>
      </tr>`).join("")}</tbody>
    </table>`; ri();
  } catch (err) { console.error("Live stats:", err.message); }
}
async function loadActiveSessions() {
  const el = document.getElementById("live-active-sessions");
  try {
    const res = await fetch("/api/live/active"); const data = await res.json();
    if (!data.sessions?.length) { el.innerHTML = empty("No employees are currently recording."); ri(); return; }
    el.innerHTML = `<table class="data-table">
      <thead><tr><th>Employee</th><th>ID</th><th>Branch</th><th>Region</th><th>Started</th><th>Status</th></tr></thead>
      <tbody>${data.sessions.map((s) => `<tr>
        <td style="font-weight:600;">${s.employeeName || "—"}</td>
        <td style="color:var(--gray-400);font-size:12px;">${s.employeeId}</td>
        <td style="color:var(--gray-600);">${s.branchName || "—"}</td>
        <td style="color:var(--gray-600);">${s.region || "—"}</td>
        <td style="color:var(--gray-500);white-space:nowrap;">${fmtDate(s.startedAt)}</td>
        <td><span class="session-status-pill ${s.status}"><span class="rec-dot ${s.status}"></span>${capitalize(s.status)}</span></td>
      </tr>`).join("")}</tbody>
    </table>`; ri();
  } catch (err) { el.innerHTML = `<div style="padding:16px;"><div class="form-error">${err.message}</div></div>`; }
}
async function loadRecentLiveSessions() {
  const el = document.getElementById("live-recent-sessions");
  try {
    // While searching by date, pull from the chain-wide feed (live sessions +
    // uploaded conversations merged via getRecentActivity on the backend)
    // instead of the live-sessions-only endpoint, and widen the limit so the
    // date filter has enough rows to actually search across.
    const url = mgrDateFilter ? "/api/live/recent-activity?limit=3000" : "/api/live/recent";
    const res = await fetch(url); const data = await res.json();
    let sessions = data.sessions || [];

    // Apply active date filter (set from topnav search)
    let filterBanner = "";
    if (mgrDateFilter) {
      const filtered = sessions.filter((s) => matchesDateQuery(s.startedAt, mgrDateFilter));
      filterBanner = `
        <div class="search-filter-banner">
          <i data-lucide="filter"></i>
          <span>Showing results for "<strong>${mgrDateFilter}</strong>" — ${filtered.length} conversation${filtered.length !== 1 ? "s" : ""} (live sessions + uploads)</span>
          <button id="clear-live-date-filter">Clear</button>
        </div>`;
      sessions = filtered;
    }

    if (!sessions.length) {
      el.innerHTML = filterBanner + empty(mgrDateFilter ? `No conversations found for "${mgrDateFilter}".` : "No completed sessions yet.");
      ri();
      document.getElementById("clear-live-date-filter")?.addEventListener("click", () => {
        mgrDateFilter = null; loadRecentLiveSessions();
      });
      return;
    }
    el.innerHTML = filterBanner + `<table class="data-table">
      <thead><tr><th>Employee</th><th>Branch</th><th>Region</th><th>Date &amp; Time</th><th>Duration</th><th>Score</th><th>Status</th></tr></thead>
      <tbody>${sessions.map((s) => `<tr>
        <td style="font-weight:600;">${s.employeeName || s.employeeId}</td>
        <td style="color:var(--gray-600);">${s.branchName || "—"}</td>
        <td style="color:var(--gray-600);">${s.region || "—"}</td>
        <td style="color:var(--gray-500);white-space:nowrap;">${fmtDate(s.startedAt)}</td>
        <td style="color:var(--gray-600);">${s.durationSeconds !== null ? fmtDur(s.durationSeconds) : "—"}</td>
        <td>${s.overallScore !== null ? scorePill(s.overallScore) : "—"}</td>
        <td><span class="session-status-pill ${s.status}">${capitalize(s.status)}</span></td>
      </tr>`).join("")}</tbody>
    </table>`; ri();
    document.getElementById("clear-live-date-filter")?.addEventListener("click", () => {
      mgrDateFilter = null; loadRecentLiveSessions();
    });
  } catch (err) { el.innerHTML = `<div style="padding:16px;"><div class="form-error">${err.message}</div></div>`; }
}

init();