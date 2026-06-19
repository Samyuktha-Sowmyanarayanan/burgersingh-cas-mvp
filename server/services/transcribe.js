import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import dotenv from "dotenv";
import { menuItems } from "../data/menu.js";

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Updated to gemini-2.0-flash for stronger multilingual support
const MODEL = "gemini-2.5-flash";

const SUPPORTED_LANGUAGES = ["English", "Hindi", "Bengali", "Assamese", "Nepali", "Mixed"];

const DIARIZATION_PROMPT = `Transcribe this audio of a conversation at a fast-food restaurant counter between an employee and a customer.

This restaurant is "Burger Singh." Here is the official menu — use it to correctly spell any menu items mentioned, even if spoken quickly or with an accent:
${menuItems.join(", ")}

Label every line with the speaker role — either "Employee:" or "Customer:" — based on context, tone, and content. If multiple customers are present, use "Customer 2:", "Customer 3:", etc.

Format output strictly as plain text, one line per speaker turn:
Employee: <line>
Customer: <line>

Do not add commentary, headers, or explanations. Return only the speaker-tagged transcript.`;

const LANGUAGE_DETECT_TRANSLATE_PROMPT = (transcript) => `You will be given a speaker-tagged conversation transcript. 

Your tasks:
1. Detect the primary language of the conversation. Choose exactly one from this list: ${SUPPORTED_LANGUAGES.join(", ")}. If the conversation switches between two or more languages, choose "Mixed".
2. If the language is NOT English and NOT Mixed, provide a full English translation that preserves the "Employee:" and "Customer:" speaker labels exactly.
3. If the language is English, set englishTranscript to null.
4. If the language is Mixed, provide an English version where any non-English portions are translated, keeping speaker labels intact.

Return ONLY a valid JSON object with no markdown, no code fences:
{
  "detectedLanguage": "<one of the supported languages>",
  "englishTranscript": "<translated transcript or null if already English>"
}

Transcript:
"""
${transcript}
"""`;

/**
 * Transcribes audio with speaker diarization.
 * Returns the original speaker-tagged transcript.
 */
export async function transcribeAudio(filePath) {
  try {
    const model = genAI.getGenerativeModel({ model: MODEL });

    const audioData = fs.readFileSync(filePath);
    const base64Audio = audioData.toString("base64");
    const mimeType = filePath.endsWith(".wav") ? "audio/wav" : "audio/mp3";

    const result = await model.generateContent([
      { inlineData: { mimeType, data: base64Audio } },
      { text: DIARIZATION_PROMPT },
    ]);

    return result.response.text().trim();
  } catch (error) {
    console.error("Gemini transcription error:", error.message);
    throw new Error("Failed to transcribe audio.");
  }
}

/**
 * Detects the language of a transcript and translates it to English if needed.
 * @param {string} transcript - Speaker-tagged transcript in any language.
 * @returns {{ detectedLanguage: string, englishTranscript: string|null }}
 */
export async function detectAndTranslate(transcript) {
  try {
    const model = genAI.getGenerativeModel({ model: MODEL });
    const result = await model.generateContent(LANGUAGE_DETECT_TRANSLATE_PROMPT(transcript));

    let responseText = result.response.text()
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    const parsed = JSON.parse(responseText);

    // Validate detected language is one we support; default to English if not
    if (!SUPPORTED_LANGUAGES.includes(parsed.detectedLanguage)) {
      console.warn(`Unexpected language detected: "${parsed.detectedLanguage}" — defaulting to English.`);
      parsed.detectedLanguage = "English";
    }

    return {
      detectedLanguage: parsed.detectedLanguage,
      englishTranscript: parsed.englishTranscript || null,
    };
  } catch (error) {
    console.error("Language detection/translation error:", error.message);
    // Non-fatal — fall back to treating transcript as English
    return { detectedLanguage: "English", englishTranscript: null };
  }
}