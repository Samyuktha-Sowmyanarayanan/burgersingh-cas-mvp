import express from "express";
import { getEmployeeHistory, getEmployeeTrends, getEmployeeAverage } from "../services/storage.js";

const router = express.Router();

function requireLogin(req, res, next) {
  if (!req.session.employeeId) {
    return res.status(401).json({ error: "Not logged in." });
  }
  next();
}

router.use(requireLogin);

// Convenience routes that use the logged-in session's employeeId directly
router.get("/me/history", (req, res) => {
  try {
    const history = getEmployeeHistory(req.session.employeeId);
    res.status(200).json({ employeeId: req.session.employeeId, history });
  } catch (error) {
    console.error("Error fetching employee history:", error.message);
    res.status(500).json({ error: "Failed to fetch employee history." });
  }
});

router.get("/me/trends", (req, res) => {
  try {
    const trends = getEmployeeTrends(req.session.employeeId);
    res.status(200).json({ employeeId: req.session.employeeId, trends });
  } catch (error) {
    console.error("Error fetching employee trends:", error.message);
    res.status(500).json({ error: "Failed to fetch employee trends." });
  }
});

router.get("/me/average", (req, res) => {
  try {
    const average = getEmployeeAverage(req.session.employeeId);
    res.status(200).json(average);
  } catch (error) {
    console.error("Error fetching employee average:", error.message);
    res.status(500).json({ error: "Failed to fetch employee average." });
  }
});

// Existing param-based routes kept as-is, useful for a manager looking up a specific employee later
router.get("/:employeeId/history", (req, res) => {
  try {
    const history = getEmployeeHistory(req.params.employeeId);
    res.status(200).json({ employeeId: req.params.employeeId, history });
  } catch (error) {
    console.error("Error fetching employee history:", error.message);
    res.status(500).json({ error: "Failed to fetch employee history." });
  }
});

router.get("/:employeeId/trends", (req, res) => {
  try {
    const trends = getEmployeeTrends(req.params.employeeId);
    res.status(200).json({ employeeId: req.params.employeeId, trends });
  } catch (error) {
    console.error("Error fetching employee trends:", error.message);
    res.status(500).json({ error: "Failed to fetch employee trends." });
  }
});

router.get("/:employeeId/average", (req, res) => {
  try {
    const average = getEmployeeAverage(req.params.employeeId);
    res.status(200).json(average);
  } catch (error) {
    console.error("Error fetching employee average:", error.message);
    res.status(500).json({ error: "Failed to fetch employee average." });
  }
});

export default router;