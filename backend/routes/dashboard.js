import express from "express";
import { getDashboardSummary } from "../services/storage.js";

const router = express.Router();

function requireManager(req, res, next) {
  if (!req.session.employeeId) return res.status(401).json({ error: "Not logged in." });
  if (req.session.role !== "manager") return res.status(403).json({ error: "Access denied. Manager role required." });
  next();
}

router.get("/summary", requireManager, (req, res) => {
  try {
    res.status(200).json(getDashboardSummary());
  } catch (error) {
    console.error("Error fetching dashboard summary:", error.message);
    res.status(500).json({ error: "Failed to fetch dashboard summary." });
  }
});

export default router;