console.log("services/analyze.js loaded");
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const ANALYSIS_PROMPT = `You are an AI evaluator for Burger Singh, a fast-food restaurant chain. You will be given a speaker-tagged transcript of a conversation between an employee and a customer at the counter. Each line is labeled "Employee:" or "Customer:" (or "Customer 2:" etc. if multiple customers were present).

Evaluate ONLY the Employee's performance — use the Customer's lines purely as context to judge how well the Employee responded to them. Return ONLY a valid JSON object — no markdown formatting, no code fences, no extra commentary, just the raw JSON.

The JSON must follow this exact structure:
{
  "greeting": true or false (did the Employee greet the customer at the start),
  "politeness": number from 1-10,
  "customerEngagement": number from 1-10,
  "upselling": number from 1-10 (effort to upsell an item; if no opportunity existed, give a neutral score of 5),
  "comboRecommendation": true or false (did employee recommend a combo),
  "discountMentioned": true or false (was any discount or offer mentioned),
  "complaintHandling": "N/A" if there was no complaint, otherwise a number from 1-10 rating how well it was handled,
  "professionalism": number from 1-10,
  "overallScore": number from 1-100 (weighted overall score based on all the above),
  "recommendations": array of 2-4 short, specific, actionable strings to help the employee improve

Here is the speaker-tagged transcript:
"""
{{TRANSCRIPT}}
"""

Return ONLY the JSON object.`;

/**
 * Sends a transcript to Gemini for structured evaluation.
 * @param {string} transcript - The conversation transcript.
 * @returns {Promise<object>} - Parsed JSON evaluation object.
 */
export async function analyzeTranscript(transcript) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash"});

    const prompt = ANALYSIS_PROMPT.replace("{{TRANSCRIPT}}", transcript);

    const result = await model.generateContent(prompt);
    let responseText = result.response.text();

    // Gemini sometimes wraps JSON in markdown code fences despite instructions — strip them defensively
    responseText = responseText.replace(/```json/g, "").replace(/```/g, "").trim();

    const evaluation = JSON.parse(responseText);
    return evaluation;
  } catch (error) {
    console.error("Gemini analysis error:", error.message);
    throw new Error("Failed to analyze transcript.");
  }
}