import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { transcribeAudio, detectAndTranslate } from "../services/transcribe.js";
import { analyzeTranscript } from "../services/analyze.js";
import {
  createLiveSession,
  updateLiveSessionStatus,
  completeLiveSession,
  getActiveSessions,
  getRecentLiveSessions,
  getRecentActivity,
  getEmployeeLiveSessions,
  getLiveSessionStats,
  saveConversation,
  getEmployeeBranchId,
  getConversationById,
} from "../services/storage.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const router = express.Router();

function requireLogin(req, res, next) {
  if (!req.session.employeeId) return res.status(401).json({ error: "Not logged in." });
  next();
}

function requireManager(req, res, next) {
  if (!req.session.employeeId) return res.status(401).json({ error: "Not logged in." });
  if (req.session.role !== "manager") return res.status(403).json({ error: "Access denied." });
  next();
}

// ── Multer config for live audio ──────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, "..", "uploads")),
  filename: (req, file, cb) => {
    // Infer file extension from MIME type so transcribe.js picks the right mimeType
    let ext = ".webm";
    if (file.mimetype.includes("wav"))                          ext = ".wav";
    else if (file.mimetype.includes("ogg"))                     ext = ".ogg";
    else if (file.mimetype.includes("mp4") || file.mimetype.includes("m4a")) ext = ".mp4";
    else if (file.mimetype.includes("aac"))                     ext = ".aac";
    else if (file.mimetype.includes("mpeg") || file.mimetype.includes("mp3")) ext = ".mp3";
    cb(null, `live-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB — live sessions can be longer than uploads
});

// ── POST /api/live/start ──────────────────────────────────────────────────────
// Creates a session record immediately so the manager monitoring page can see it.
router.post("/start", requireLogin, (req, res) => {
  try {
    const sessionId = crypto.randomUUID();
    const branchId  = getEmployeeBranchId(req.session.employeeId);

    createLiveSession({
      sessionId,
      employeeId:   req.session.employeeId,
      employeeName: req.session.name,
      branchId,
    });

    console.log(`Live session started: ${sessionId} — employee: ${req.session.employeeId}`);
    return res.status(200).json({ sessionId, message: "Session started." });
  } catch (err) {
    console.error("Live start error:", err.message);
    return res.status(500).json({ error: "Failed to start session." });
  }
});

// ── POST /api/live/stop/:sessionId ────────────────────────────────────────────
// Receives audio blob, runs full pipeline, returns scorecard.
router.post("/stop/:sessionId", requireLogin, upload.single("audio"), async (req, res) => {
  const { sessionId } = req.params;
  const filePath = req.file?.path;

  if (!req.file) {
    updateLiveSessionStatus(sessionId, "failed");
    return res.status(400).json({ error: "No audio received." });
  }

  try {
    updateLiveSessionStatus(sessionId, "processing");
    console.log(`Processing live session: ${sessionId}`);

    // Reuse the exact same pipeline as the upload flow
    const transcript = await transcribeAudio(filePath);
    const { detectedLanguage, englishTranscript } = await detectAndTranslate(transcript);
    const transcriptForAnalysis = englishTranscript || transcript;
    const evaluation = await analyzeTranscript(transcriptForAnalysis);

    const conversationId = saveConversation({
      employeeId:        req.session.employeeId,
      transcript,
      englishTranscript,
      detectedLanguage,
      evaluation,
    });

    completeLiveSession(sessionId, conversationId);
    console.log(`Live session complete: ${sessionId} → conversationId: ${conversationId}`);

    return res.status(200).json({
      message: "Session analyzed successfully.",
      sessionId,
      conversationId,
      transcript,
      englishTranscript,
      detectedLanguage,
      evaluation,
    });
  } catch (err) {
    console.error("Live stop error:", err.message);
    updateLiveSessionStatus(sessionId, "failed");
    return res.status(500).json({ error: "Failed to process session audio." });
  } finally {
    if (filePath) {
      fs.unlink(filePath, (unlinkErr) => {
        if (unlinkErr) console.error("Temp file cleanup error:", unlinkErr.message);
      });
    }
  }
});

// ── POST /api/live/cancel/:sessionId ─────────────────────────────────────────
router.post("/cancel/:sessionId", requireLogin, (req, res) => {
  try {
    updateLiveSessionStatus(req.params.sessionId, "cancelled");
    return res.status(200).json({ message: "Session cancelled." });
  } catch (err) {
    return res.status(500).json({ error: "Failed to cancel session." });
  }
});

// ── GET /api/live/active — manager only ──────────────────────────────────────
router.get("/active", requireManager, (req, res) => {
  try {
    res.status(200).json({ sessions: getActiveSessions() });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch active sessions." });
  }
});
router.get("/recent", requireManager, (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 5000);
    res.status(200).json({ sessions: getRecentLiveSessions(limit) });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch recent sessions." });
  }
});

// ── GET /api/live/recent-activity — manager only ─────────────────────────────
// Chain-wide feed: live-recorded sessions AND uploaded-audio conversations,
// merged and sorted by date. Used by the manager search so date queries like
// "18" or "19" find every conversation spoken that day, not just ones
// recorded through the live mic flow.
router.get("/recent-activity", requireManager, (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 5000);
    res.status(200).json({ sessions: getRecentActivity(limit) });
  } catch (err) {
    console.error("Recent activity error:", err.message);
    res.status(500).json({ error: "Failed to fetch recent activity." });
  }
});
// GET /api/conversations/:id — full detail for one conversation (any employee)
// Powers the manager dashboard's click-to-view-scorecard feature.
router.get("/conversations/:id", (req, res) => {
  try {
    const convo = getConversationById(Number(req.params.id));
    if (!convo) return res.status(404).json({ error: "Conversation not found." });
    res.json(convo);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/live/stats — manager only ───────────────────────────────────────
router.get("/stats", requireManager, (req, res) => {
  try {
    res.status(200).json(getLiveSessionStats());
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch live stats." });
  }
});

// ── GET /api/live/my-sessions — employee ─────────────────────────────────────
router.get("/my-sessions", requireLogin, (req, res) => {
  try {
    res.status(200).json({ sessions: getEmployeeLiveSessions(req.session.employeeId) });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch your sessions." });
  }
});

export default router;