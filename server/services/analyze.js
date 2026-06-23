import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const ANALYSIS_PROMPT = `You are an AI quality evaluator for Burger Singh, a fast-food restaurant chain in India. You will be given a speaker-tagged transcript of a conversation between an employee and a customer at the counter. Each line is labeled "Employee:" or "Customer:".

Evaluate ONLY the Employee's performance. Use the Customer's lines purely as context for judging how well the Employee responded.

━━━━━━━━━━━━━━━━━━━━━━━━━━━
STRICT SCORING RULES — read carefully before scoring
━━━━━━━━━━━━━━━━━━━━━━━━━━━

RULE 1 — RUDE OR HOSTILE EMPLOYEE:
If the employee is rude, dismissive, sarcastic, condescending, or makes any insulting remark toward a customer — even once — then:
  - politeness MUST be 1 or 2
  - professionalism MUST be 1 or 2
  - customerEngagement MUST be 1 or 2
  - overallScore MUST be below 20
This rule overrides everything else. There is no partial credit for an employee who is rude.

RULE 2 — UPSELLING (read this carefully):
The upselling score is NOT about whether the employee happened to mention extra items.
It is about whether the employee MISSED an opportunity or TOOK an opportunity.

  Score 1–2 → A natural upselling moment existed (customer ordered food at a counter)
              but the employee made zero attempt to suggest anything extra.
              This is a MISSED OPPORTUNITY. Most failed or hostile interactions fall here.

  Score 3–4 → Employee made a weak, half-hearted, or poorly timed upselling attempt.

  Score 5   → Use this ONLY when the conversation was so brief, abrupt, or incomplete
              that no natural opening for upselling ever occurred
              (e.g. the customer never placed an order, or left mid-sentence).
              Do NOT use 5 just because the employee stayed silent on upselling.

  Score 6–8 → Employee made a genuine, natural upselling attempt that was reasonable.

  Score 9–10 → Excellent upselling: natural, value-focused, well-timed, customer responded positively.

RULE 3 — COMPLAINT HANDLING:
  "N/A" → only if the customer expressed zero frustration or concern throughout.
  Score 1–2 → Employee responded rudely, dismissively, or made the complaint worse.
  Score 3–4 → Employee acknowledged but gave a weak or deflecting response.
  Score 5–6 → Employee gave a neutral, passive response — not rude but not helpful.
  Score 7–8 → Employee acknowledged, apologised, and offered a reasonable resolution.
  Score 9–10 → Excellent handling: empathetic, proactive, customer left satisfied.

RULE 4 — OVERALL SCORE:
The overallScore must honestly reflect the full quality of the interaction.
  - Rude or hostile employee: 1–20
  - Very poor service (no greeting, no engagement, no upselling, no professionalism): 20–40
  - Below average (some basics present but multiple failures): 40–60
  - Average (most basics covered, some missed opportunities): 60–75
  - Good (professional, engaged, attempted upselling): 75–88
  - Excellent (all dimensions strong): 88–100

━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━

Return ONLY a valid JSON object. No markdown, no code fences, no explanation — raw JSON only.

{
  "greeting": true or false,
  "politeness": number from 1–10,
  "customerEngagement": number from 1–10,
  "upselling": number from 1–10 (follow Rule 2 strictly),
  "comboRecommendation": true or false,
  "discountMentioned": true or false,
  "complaintHandling": "N/A" or number from 1–10 (follow Rule 3 strictly),
  "professionalism": number from 1–10,
  "overallScore": number from 1–100 (follow Rule 4 strictly),
  "recommendations": array of 2–4 short, specific, actionable coaching strings for the employee

Here is the speaker-tagged transcript:
"""
{{TRANSCRIPT}}
"""

Return ONLY the JSON object. Apply all four rules above before writing any score.`;

/**
 * Sends a transcript to Gemini for structured evaluation.
 * @param {string} transcript - The English conversation transcript.
 * @returns {Promise<object>} - Parsed JSON evaluation object.
 */
export async function analyzeTranscript(transcript) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });

    const prompt = ANALYSIS_PROMPT.replace("{{TRANSCRIPT}}", transcript);

    const result = await model.generateContent(prompt);
    let responseText = result.response.text();

    // Strip markdown fences defensively — Gemini sometimes wraps JSON despite instructions
    responseText = responseText
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    const evaluation = JSON.parse(responseText);
    return evaluation;
  } catch (error) {
    console.error("Gemini analysis error:", error.message);
    throw new Error("Failed to analyze transcript.");
  }
}