import express from "express";
import {
  getAllBranches, getAllBranchesPerformance, getBranchPerformance,
  getFranchiseRankings, getBranchTrends, getBranchInsights, getEmployeeBranchId,
} from "../services/storage.js";

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

// Manager-only
router.get("/", requireManager, (req, res) => {
  try { res.status(200).json({ branches: getAllBranches() }); }
  catch (e) { res.status(500).json({ error: "Failed to fetch branches." }); }
});

router.get("/compare", requireManager, (req, res) => {
  try { res.status(200).json({ branches: getAllBranchesPerformance() }); }
  catch (e) { res.status(500).json({ error: "Failed to fetch branch comparison." }); }
});

router.get("/rankings", requireManager, (req, res) => {
  try { res.status(200).json(getFranchiseRankings()); }
  catch (e) { res.status(500).json({ error: "Failed to fetch rankings." }); }
});

router.get("/:branchId/insights", requireManager, (req, res) => {
  try { res.status(200).json(getBranchInsights(req.params.branchId)); }
  catch (e) { res.status(500).json({ error: "Failed to fetch branch insights." }); }
});

router.get("/:branchId/trends", requireManager, (req, res) => {
  try { res.status(200).json({ branchId: req.params.branchId, trends: getBranchTrends(req.params.branchId) }); }
  catch (e) { res.status(500).json({ error: "Failed to fetch branch trends." }); }
});

// Employee-accessible: own branch only
router.get("/me", requireLogin, (req, res) => {
  try {
    const branchId = getEmployeeBranchId(req.session.employeeId);
    if (!branchId) return res.status(404).json({ error: "No branch assigned." });
    res.status(200).json(getBranchPerformance(branchId));
  } catch (e) { res.status(500).json({ error: "Failed to fetch branch performance." }); }
});

export default router;