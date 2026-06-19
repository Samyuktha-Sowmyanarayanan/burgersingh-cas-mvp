import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { transcribeAudio, detectAndTranslate } from "../services/transcribe.js";
import { analyzeTranscript } from "../services/analyze.js";
import { saveConversation } from "../services/storage.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "..", "uploads"));
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
});

router.post("/", upload.single("audio"), async (req, res) => {
  if (!req.session.employeeId) {
    return res.status(401).json({ error: "Not logged in." });
  }
  if (!req.file) {
    return res.status(400).json({ error: "No audio file uploaded." });
  }

  const filePath = req.file.path;
  const employeeId = req.session.employeeId;

  try {
    // Step 1: Transcribe with speaker diarization
    console.log("Transcribing file:", filePath);
    const transcript = await transcribeAudio(filePath);
    console.log("Transcript generated.");

    // Step 2: Detect language; translate to English if needed
    console.log("Detecting language and translating if necessary...");
    const { detectedLanguage, englishTranscript } = await detectAndTranslate(transcript);
    console.log(`Language detected: ${detectedLanguage}`);

    // Step 3: Run evaluation on English version (or original if already English)
    const transcriptForAnalysis = englishTranscript || transcript;
    console.log("Analyzing transcript...");
    const evaluation = await analyzeTranscript(transcriptForAnalysis);
    console.log("Analysis complete.");

    // Step 4: Persist everything
    const conversationId = saveConversation({
      employeeId,
      transcript,           // original language
      englishTranscript,    // translated (null if English)
      detectedLanguage,
      evaluation,
    });
    console.log(`Conversation saved with ID: ${conversationId}`);

    return res.status(200).json({
      message: "Analysis successful.",
      conversationId,
      transcript,
      englishTranscript,
      detectedLanguage,
      evaluation,
    });
  } catch (error) {
    console.error("Error processing request:", error.message);
    return res.status(500).json({ error: "Failed to process audio file." });
  } finally {
    fs.unlink(filePath, (err) => {
      if (err) console.error("Failed to delete temp file:", err.message);
    });
  }
});

export default router;