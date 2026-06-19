import express from "express";
import { getEmployeeLeaderboard, getBranchEmployeeLeaderboard, getEmployeeBranchId } from "../services/storage.js";

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

router.get("/company", requireManager, (req, res) => {
  try { res.status(200).json({ leaderboard: getEmployeeLeaderboard() }); }
  catch (e) { res.status(500).json({ error: "Failed to fetch leaderboard." }); }
});

router.get("/branch/:branchId", requireManager, (req, res) => {
  try { res.status(200).json({ branchId: req.params.branchId, leaderboard: getBranchEmployeeLeaderboard(req.params.branchId) }); }
  catch (e) { res.status(500).json({ error: "Failed to fetch branch leaderboard." }); }
});

router.get("/me", requireLogin, (req, res) => {
  try {
    const branchId = getEmployeeBranchId(req.session.employeeId);
    if (!branchId) return res.status(404).json({ error: "No branch assigned." });
    res.status(200).json({ branchId, leaderboard: getBranchEmployeeLeaderboard(branchId) });
  } catch (e) { res.status(500).json({ error: "Failed to fetch leaderboard." }); }
});

export default router;