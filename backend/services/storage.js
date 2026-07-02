import db from "../db/db.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ── Internal helpers ──────────────────────────────────────────────────────────
export function verifyLogin(employeeId, password) {
  const stmt = db.prepare(`
    SELECT employee_id, name, role
    FROM employees
    WHERE employee_id = ?
      AND password = ?
  `);

  return stmt.get(employeeId, password);
}
function round1(value) {
  return value === null || value === undefined ? null : Math.round(value * 10) / 10;
}

function getEmployeeBranchIdInternal(employeeId) {
  const row = db.prepare("SELECT branch_id FROM employees WHERE employee_id = ?").get(employeeId);
  return row ? row.branch_id : null;
}

function countTopRecommendations(rows, limit) {
  const counts = {};
  for (const row of rows) {
    let recs = [];
    try { recs = JSON.parse(row.recommendations); } catch { continue; }
    for (const rec of recs) counts[rec] = (counts[rec] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([recommendation, count]) => ({ recommendation, count }));
}

function formatRow(row) {
  return {
    id: row.id,
    employeeId: row.employee_id,
    branchId: row.branch_id,
    detectedLanguage: row.detected_language || "English",
    englishTranscript: row.english_transcript || null,
    timestamp: row.timestamp,
    transcript: row.transcript,
    evaluation: {
      greeting: !!row.greeting,
      politeness: row.politeness,
      customerEngagement: row.customer_engagement,
      upselling: row.upselling,
      comboRecommendation: !!row.combo_recommendation,
      discountMentioned: !!row.discount_mentioned,
      complaintHandling: row.complaint_handling === "N/A" ? "N/A" : row.complaint_handling,
      professionalism: row.professionalism,
      overallScore: row.overall_score,
      recommendations: JSON.parse(row.recommendations),
    },
  };
}

// ── Phase 3: Conversation Storage ─────────────────────────────────────────────

export function saveConversation({ employeeId, transcript, englishTranscript = null, detectedLanguage = "English", evaluation }) {
  const branchId = getEmployeeBranchIdInternal(employeeId);

  const stmt = db.prepare(`
    INSERT INTO conversations (
      employee_id, branch_id, timestamp, transcript,
      detected_language, english_transcript,
      greeting, politeness, customer_engagement, upselling,
      combo_recommendation, discount_mentioned, complaint_handling,
      professionalism, overall_score, recommendations, raw_evaluation
    ) VALUES (
      @employeeId, @branchId, @timestamp, @transcript,
      @detectedLanguage, @englishTranscript,
      @greeting, @politeness, @customerEngagement, @upselling,
      @comboRecommendation, @discountMentioned, @complaintHandling,
      @professionalism, @overallScore, @recommendations, @rawEvaluation
    )
  `);

  const result = stmt.run({
    employeeId,
    branchId,
    timestamp: new Date().toISOString(),
    transcript,
    detectedLanguage,
    englishTranscript,
    greeting: evaluation.greeting ? 1 : 0,
    politeness: evaluation.politeness,
    customerEngagement: evaluation.customerEngagement,
    upselling: evaluation.upselling,
    comboRecommendation: evaluation.comboRecommendation ? 1 : 0,
    discountMentioned: evaluation.discountMentioned ? 1 : 0,
    complaintHandling: String(evaluation.complaintHandling),
    professionalism: evaluation.professionalism,
    overallScore: evaluation.overallScore,
    recommendations: JSON.stringify(evaluation.recommendations),
    rawEvaluation: JSON.stringify(evaluation),
  });

  return result.lastInsertRowid;
}

export function getEmployeeHistory(employeeId) {
  return db.prepare("SELECT * FROM conversations WHERE employee_id = ? ORDER BY timestamp DESC")
    .all(employeeId).map(formatRow);
}

export function getEmployeeTrends(employeeId) {
  return db.prepare("SELECT timestamp, overall_score FROM conversations WHERE employee_id = ? ORDER BY timestamp ASC")
    .all(employeeId).map((r) => ({ timestamp: r.timestamp, overallScore: r.overall_score }));
}

export function getEmployeeAverage(employeeId) {
  const row = db.prepare("SELECT AVG(overall_score) as avgScore, COUNT(*) as count FROM conversations WHERE employee_id = ?")
    .get(employeeId);
  return { employeeId, averageScore: row.count > 0 ? round1(row.avgScore) : null, conversationCount: row.count };
}

export function getDashboardSummary() {
  const totalRow = db.prepare("SELECT COUNT(*) as total, AVG(overall_score) as avgScore FROM conversations").get();
  const best = db.prepare("SELECT employee_id, AVG(overall_score) as avgScore, COUNT(*) as count FROM conversations GROUP BY employee_id ORDER BY avgScore DESC LIMIT 1").get();
  const lowest = db.prepare("SELECT employee_id, AVG(overall_score) as avgScore, COUNT(*) as count FROM conversations GROUP BY employee_id ORDER BY avgScore ASC LIMIT 1").get();
  const allRecs = db.prepare("SELECT recommendations FROM conversations").all();
  return {
    totalConversations: totalRow.total,
    averageScore: totalRow.total > 0 ? round1(totalRow.avgScore) : null,
    bestEmployee: best ? { employeeId: best.employee_id, averageScore: round1(best.avgScore), conversationCount: best.count } : null,
    lowestEmployee: lowest ? { employeeId: lowest.employee_id, averageScore: round1(lowest.avgScore), conversationCount: lowest.count } : null,
    mostCommonRecommendations: countTopRecommendations(allRecs, 5),
  };
}

// ── Phase 4: Branch Analytics ─────────────────────────────────────────────────

export function getAllBranches() {
  return db.prepare("SELECT branch_id as branchId, name, region FROM branches ORDER BY region ASC").all();
}

export function getEmployeeBranchId(employeeId) {
  return getEmployeeBranchIdInternal(employeeId);
}

export function getAllBranchesPerformance() {
  return db.prepare(`
    SELECT b.branch_id as branchId, b.name, b.region,
           COUNT(c.id) as totalConversations, AVG(c.overall_score) as avgScore
    FROM branches b
    LEFT JOIN conversations c ON c.branch_id = b.branch_id
    GROUP BY b.branch_id ORDER BY avgScore DESC
  `).all().map((r) => ({ ...r, averageScore: round1(r.avgScore) }));
}

export function getBranchPerformance(branchId) {
  const row = db.prepare(`
    SELECT b.branch_id as branchId, b.name, b.region,
           COUNT(c.id) as totalConversations, AVG(c.overall_score) as avgScore
    FROM branches b LEFT JOIN conversations c ON c.branch_id = b.branch_id
    WHERE b.branch_id = ? GROUP BY b.branch_id
  `).get(branchId);
  if (!row) return null;
  return { ...row, averageScore: round1(row.avgScore) };
}

export function getFranchiseRankings(minConversations = 3, limit = 5) {
  const all = getAllBranchesPerformance();
  const ranked = all.filter((b) => b.totalConversations >= minConversations && b.averageScore !== null);
  return {
    topBranches: [...ranked].sort((a, b) => b.averageScore - a.averageScore).slice(0, limit),
    lowestBranches: [...ranked].sort((a, b) => a.averageScore - b.averageScore).slice(0, limit),
    excludedBranchCount: all.length - ranked.length,
    minConversationsRequired: minConversations,
  };
}

export function getEmployeeLeaderboard(limit = 10, minConversations = 1) {
  return db.prepare(`
    SELECT c.employee_id as employeeId, e.name, e.branch_id as branchId, b.region,
           AVG(c.overall_score) as avgScore, COUNT(c.id) as conversationCount
    FROM conversations c
    JOIN employees e ON e.employee_id = c.employee_id
    LEFT JOIN branches b ON b.branch_id = e.branch_id
    GROUP BY c.employee_id HAVING conversationCount >= ?
    ORDER BY avgScore DESC LIMIT ?
  `).all(minConversations, limit).map((r) => ({ ...r, averageScore: round1(r.avgScore) }));
}

export function getBranchEmployeeLeaderboard(branchId, limit = 10, minConversations = 1) {
  return db.prepare(`
    SELECT c.employee_id as employeeId, e.name, e.branch_id as branchId, b.region,
           AVG(c.overall_score) as avgScore, COUNT(c.id) as conversationCount
    FROM conversations c
    JOIN employees e ON e.employee_id = c.employee_id
    LEFT JOIN branches b ON b.branch_id = e.branch_id
    WHERE c.branch_id = ?
    GROUP BY c.employee_id HAVING conversationCount >= ?
    ORDER BY avgScore DESC LIMIT ?
  `).all(branchId, minConversations, limit).map((r) => ({ ...r, averageScore: round1(r.avgScore) }));
}

export function getBranchTrends(branchId) {
  return db.prepare(`
    SELECT DATE(timestamp) as day, AVG(overall_score) as avgScore, COUNT(*) as count
    FROM conversations WHERE branch_id = ?
    GROUP BY DATE(timestamp) ORDER BY day ASC
  `).all(branchId).map((r) => ({ day: r.day, averageScore: round1(r.avgScore), conversationCount: r.count }));
}

export function getBranchInsights(branchId) {
  const dim = db.prepare(`
    SELECT AVG(greeting)*100 as greetingRate, AVG(politeness) as politeness,
           AVG(customer_engagement) as customerEngagement, AVG(upselling) as upselling,
           AVG(combo_recommendation)*100 as comboRate, AVG(discount_mentioned)*100 as discountRate,
           AVG(professionalism) as professionalism, COUNT(*) as totalConversations
    FROM conversations WHERE branch_id = ?
  `).get(branchId);

  if (!dim || dim.totalConversations === 0) {
    return { branchId, totalConversations: 0, strengths: [], weaknesses: [], complaintStats: null, commonRecommendations: [], trainingOpportunities: ["No conversations recorded yet."] };
  }

  const dimensions = [
    { key: "greeting", label: "Greeting Quality", value: round1(dim.greetingRate) },
    { key: "politeness", label: "Politeness", value: round1(dim.politeness * 10) },
    { key: "customerEngagement", label: "Customer Engagement", value: round1(dim.customerEngagement * 10) },
    { key: "upselling", label: "Upselling Effort", value: round1(dim.upselling * 10) },
    { key: "comboRecommendation", label: "Combo Recommendations", value: round1(dim.comboRate) },
    { key: "discountMentioned", label: "Discount Mentions", value: round1(dim.discountRate) },
    { key: "professionalism", label: "Professionalism", value: round1(dim.professionalism * 10) },
  ];

  const sorted = [...dimensions].sort((a, b) => b.value - a.value);
  const strengths = sorted.slice(0, 2);
  const weaknesses = sorted.slice(-2).reverse();

  const complaintRow = db.prepare(`
    SELECT COUNT(*) as totalComplaints, AVG(CAST(complaint_handling AS REAL)) as avgHandling
    FROM conversations WHERE branch_id = ? AND complaint_handling != 'N/A'
  `).get(branchId);

  const branchRecs = db.prepare("SELECT recommendations FROM conversations WHERE branch_id = ?").all(branchId);
  const commonRecommendations = countTopRecommendations(branchRecs, 5);

  return {
    branchId,
    totalConversations: dim.totalConversations,
    strengths,
    weaknesses,
    complaintStats: {
      totalComplaints: complaintRow.totalComplaints,
      averageHandlingScore: complaintRow.totalComplaints > 0 ? round1(complaintRow.avgHandling) : null,
    },
    commonRecommendations,
    trainingOpportunities: weaknesses.map((w) => `Focus on ${w.label} (average ${w.value}/100).`),
  };
}

// ── Phase 5: Regional Intelligence ───────────────────────────────────────────

export function getAllRegions() {
  return db.prepare("SELECT DISTINCT region FROM branches ORDER BY region ASC").all().map((r) => r.region);
}

export function getRegionalOverview() {
  return db.prepare(`
    SELECT b.region,
           COUNT(c.id) as totalConversations,
           AVG(c.overall_score) as avgScore,
           AVG(c.upselling) as avgUpselling,
           AVG(c.customer_engagement) as avgEngagement,
           AVG(c.combo_recommendation) * 100 as comboRate,
           AVG(c.discount_mentioned) * 100 as discountRate,
           AVG(c.professionalism) as avgProfessionalism
    FROM branches b
    LEFT JOIN conversations c ON c.branch_id = b.branch_id
    GROUP BY b.region
    ORDER BY avgScore DESC
  `).all().map((r) => ({
    region: r.region,
    totalConversations: r.totalConversations,
    averageScore: round1(r.avgScore),
    avgUpselling: round1(r.avgUpselling),
    avgEngagement: round1(r.avgEngagement),
    comboRate: round1(r.comboRate),
    discountRate: round1(r.discountRate),
    avgProfessionalism: round1(r.avgProfessionalism),
  }));
}

export function getRegionBehaviourMetrics(region) {
  const row = db.prepare(`
    SELECT COUNT(c.id) as totalConversations,
           AVG(c.overall_score) as avgScore,
           AVG(c.upselling) * 10 as upsellSuccessRate,
           SUM(CASE WHEN c.upselling >= 7 THEN 1 ELSE 0 END) as successfulUpsells,
           SUM(CASE WHEN c.upselling < 5 THEN 1 ELSE 0 END) as missedUpsells,
           AVG(c.combo_recommendation) * 100 as comboAcceptanceRate,
           AVG(c.discount_mentioned) * 100 as discountMentionRate,
           AVG(c.customer_engagement) as avgEngagement,
           AVG(c.politeness) as avgPoliteness,
           AVG(c.professionalism) as avgProfessionalism
    FROM conversations c
    JOIN branches b ON b.branch_id = c.branch_id
    WHERE b.region = ?
  `).get(region);

  if (!row) return null;
  return {
    totalConversations: row.totalConversations,
    averageScore: round1(row.avgScore),
    upsellSuccessRate: round1(row.upsellSuccessRate),
    successfulUpsells: row.successfulUpsells,
    missedUpsells: row.missedUpsells,
    comboAcceptanceRate: round1(row.comboAcceptanceRate),
    discountMentionRate: round1(row.discountMentionRate),
    avgEngagement: round1(row.avgEngagement),
    avgPoliteness: round1(row.avgPoliteness),
    avgProfessionalism: round1(row.avgProfessionalism),
  };
}

export function getRegionLanguageStats(region) {
  const rows = db.prepare(`
    SELECT c.detected_language as language, COUNT(*) as count
    FROM conversations c
    JOIN branches b ON b.branch_id = c.branch_id
    WHERE b.region = ? AND c.detected_language IS NOT NULL
    GROUP BY c.detected_language
    ORDER BY count DESC
  `).all(region);
  return rows;
}

export function getChainLanguageDistribution() {
  const rows = db.prepare(`
    SELECT b.region, c.detected_language as language, COUNT(*) as count
    FROM conversations c
    JOIN branches b ON b.branch_id = c.branch_id
    WHERE c.detected_language IS NOT NULL
    GROUP BY b.region, c.detected_language
    ORDER BY b.region, count DESC
  `).all();

  const grouped = {};
  rows.forEach((r) => {
    if (!grouped[r.region]) grouped[r.region] = [];
    grouped[r.region].push({ language: r.language, count: r.count });
  });
  return grouped;
}

export function getRegionSalesAnalytics(region) {
  const row = db.prepare(`
    SELECT COUNT(c.id) as totalConversations,
           SUM(CASE WHEN c.upselling >= 7 THEN 1 ELSE 0 END) as successfulUpsells,
           SUM(CASE WHEN c.upselling < 5 AND c.upselling IS NOT NULL THEN 1 ELSE 0 END) as missedUpsells,
           AVG(c.combo_recommendation) * 100 as comboRate,
           AVG(c.discount_mentioned) * 100 as discountRate,
           AVG(c.upselling) as avgUpselling
    FROM conversations c
    JOIN branches b ON b.branch_id = c.branch_id
    WHERE b.region = ?
  `).get(region);

  if (!row) return null;
  return {
    totalConversations: row.totalConversations,
    successfulUpsells: row.successfulUpsells,
    missedUpsells: row.missedUpsells,
    comboRate: round1(row.comboRate),
    discountRate: round1(row.discountRate),
    avgUpselling: round1(row.avgUpselling),
    upsellConversionRate: row.totalConversations > 0
      ? round1((row.successfulUpsells / row.totalConversations) * 100)
      : null,
  };
}

/**
 * Calls Gemini to generate a human-readable regional intelligence summary
 * based on aggregated metrics. One API call per request — not cached.
 */
export async function generateRegionalInsights(region) {
  const behaviour = getRegionBehaviourMetrics(region);
  const sales = getRegionSalesAnalytics(region);
  const language = getRegionLanguageStats(region);

  if (!behaviour || behaviour.totalConversations === 0) {
    return {
      region,
      totalConversations: 0,
      insights: null,
      message: "Not enough data to generate insights for this region yet.",
    };
  }

  const metricsContext = `
Region: ${region}
Total Conversations Analyzed: ${behaviour.totalConversations}
Average Overall Score: ${behaviour.averageScore}/100
Average Customer Engagement: ${behaviour.avgEngagement}/10
Average Politeness: ${behaviour.avgPoliteness}/10
Average Professionalism: ${behaviour.avgProfessionalism}/10
Upsell Success Rate: ${sales.upsellSuccessRate}%
Upsell Conversion: ${sales.upsellConversionRate}% (${sales.successfulUpsells} successful, ${sales.missedUpsells} missed)
Combo Recommendation Acceptance Rate: ${sales.comboRate}%
Discount / Promotion Mention Rate: ${sales.discountRate}%
Language Distribution: ${language.map((l) => `${l.language}: ${l.count} conversations`).join(", ")}
  `.trim();

  const prompt = `You are a regional operations analyst for Burger Singh, a fast-food chain in India. Based on the following performance data for the ${region} region, generate a structured business intelligence summary.

Data:
${metricsContext}

Return ONLY a valid JSON object with no markdown, no code fences:
{
  "strengths": ["<2-3 specific strengths based on the data>"],
  "weaknesses": ["<2-3 specific weaknesses based on the data>"],
  "marketingOpportunities": ["<2-3 actionable marketing insights, e.g. which promotions to push based on combo/discount rates>"],
  "trainingRecommendations": ["<2-3 specific training actions for this region's employees>"],
  "languageInsights": "<1 sentence about how language distribution affects service delivery in this region>"
}`;

  try {
    const genAIClient = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAIClient.getGenerativeModel({ model: "gemini-3.5-flash" });
    const result = await model.generateContent(prompt);

    let responseText = result.response.text()
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    const insights = JSON.parse(responseText);

    return {
      region,
      totalConversations: behaviour.totalConversations,
      metricsSnapshot: { behaviour, sales, language },
      insights,
    };
  } catch (error) {
    console.error("Regional insights generation error:", error.message);
    throw new Error("Failed to generate regional insights.");
  }
}
// ── Phase 6: Live Session Storage ─────────────────────────────────────────────

export function createLiveSession({ sessionId, employeeId, employeeName, branchId }) {
  db.prepare(`
    INSERT INTO live_sessions
      (session_id, employee_id, employee_name, branch_id, status, started_at)
    VALUES (?, ?, ?, ?, 'active', ?)
  `).run(sessionId, employeeId, employeeName || null, branchId || null, new Date().toISOString());
}

export function updateLiveSessionStatus(sessionId, status) {
  db.prepare(`UPDATE live_sessions SET status = ? WHERE session_id = ?`)
    .run(status, sessionId);
}

export function completeLiveSession(sessionId, conversationId) {
  const endedAt = new Date().toISOString();
  const row = db.prepare(`SELECT started_at FROM live_sessions WHERE session_id = ?`).get(sessionId);
  const durationSeconds = row
    ? Math.round((new Date(endedAt) - new Date(row.started_at)) / 1000)
    : null;

  db.prepare(`
    UPDATE live_sessions
    SET status = 'completed', ended_at = ?, duration_seconds = ?, conversation_id = ?
    WHERE session_id = ?
  `).run(endedAt, durationSeconds, conversationId, sessionId);
}

export function getActiveSessions() {
  const rows = db.prepare(`
    SELECT ls.session_id   as sessionId,
           ls.employee_id  as employeeId,
           ls.employee_name as employeeName,
           ls.branch_id    as branchId,
           ls.status,
           ls.started_at   as startedAt,
           b.name          as branchName,
           b.region
    FROM live_sessions ls
    LEFT JOIN branches b ON b.branch_id = ls.branch_id
    WHERE ls.status IN ('active', 'processing')
    ORDER BY ls.started_at DESC
  `).all();
  return rows;
}

export function getRecentLiveSessions(limit = 30) {
  return db.prepare(`
    SELECT ls.session_id      as sessionId,
           ls.employee_id     as employeeId,
           ls.employee_name   as employeeName,
           ls.branch_id       as branchId,
           ls.status,
           ls.started_at      as startedAt,
           ls.ended_at        as endedAt,
           ls.duration_seconds as durationSeconds,
           ls.conversation_id  as conversationId,
           b.name             as branchName,
           b.region,
           c.overall_score    as overallScore
    FROM live_sessions ls
    LEFT JOIN branches b ON b.branch_id = ls.branch_id
    LEFT JOIN conversations c ON c.id = ls.conversation_id
    ORDER BY ls.started_at DESC
    LIMIT ?
  `).all(limit);
}

export function getEmployeeLiveSessions(employeeId, limit = 20) {
  return db.prepare(`
    SELECT ls.session_id      as sessionId,
           ls.status,
           ls.started_at      as startedAt,
           ls.ended_at        as endedAt,
           ls.duration_seconds as durationSeconds,
           ls.conversation_id  as conversationId,
           b.name             as branchName,
           c.overall_score    as overallScore
    FROM live_sessions ls
    LEFT JOIN branches b ON b.branch_id = ls.branch_id
    LEFT JOIN conversations c ON c.id = ls.conversation_id
    WHERE ls.employee_id = ?
    ORDER BY ls.started_at DESC
    LIMIT ?
  `).all(employeeId, limit);
}

export function getLiveSessionStats() {
  const activeCount = db.prepare(
    `SELECT COUNT(*) as count FROM live_sessions WHERE status IN ('active', 'processing')`
  ).get().count;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayCount = db.prepare(
    `SELECT COUNT(*) as count FROM live_sessions WHERE started_at >= ?`
  ).get(todayStart.toISOString()).count;

  const branchRows = db.prepare(`
    SELECT ls.branch_id as branchId, b.name as branchName, b.region,
           COUNT(*) as activeSessions
    FROM live_sessions ls
    LEFT JOIN branches b ON b.branch_id = ls.branch_id
    WHERE ls.status IN ('active', 'processing')
    GROUP BY ls.branch_id
    ORDER BY activeSessions DESC
  `).all();

  return { activeCount, todayCount, activeBranches: branchRows };
}
export function getRecentActivity(limit = 30) {
  return db.prepare(`
    SELECT * FROM (
      SELECT
        ls.session_id       as sessionId,
        ls.employee_id      as employeeId,
        ls.employee_name    as employeeName,
        ls.branch_id        as branchId,
        ls.status           as status,
        ls.started_at       as startedAt,
        ls.ended_at         as endedAt,
        ls.duration_seconds as durationSeconds,
        ls.conversation_id  as conversationId,
        b.name              as branchName,
        b.region            as region,
        c.overall_score     as overallScore
      FROM live_sessions ls
      LEFT JOIN branches b ON b.branch_id = ls.branch_id
      LEFT JOIN conversations c ON c.id = ls.conversation_id

      UNION ALL

      SELECT
        NULL                as sessionId,
        c.employee_id       as employeeId,
        e.name              as employeeName,
        c.branch_id         as branchId,
        'completed'         as status,
        c.timestamp         as startedAt,
        c.timestamp         as endedAt,
        NULL                as durationSeconds,
        c.id                as conversationId,
        b.name              as branchName,
        b.region            as region,
        c.overall_score     as overallScore
      FROM conversations c
      LEFT JOIN branches b ON b.branch_id = c.branch_id
      LEFT JOIN employees e ON e.employee_id = c.employee_id
      WHERE c.id NOT IN (
        SELECT conversation_id FROM live_sessions WHERE conversation_id IS NOT NULL
      )
    )
    ORDER BY startedAt DESC
    LIMIT ?
  `).all(limit);
}