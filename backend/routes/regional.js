import express from "express";
import {
  getAllRegions, getRegionalOverview, getRegionBehaviourMetrics,
  getRegionLanguageStats, getRegionSalesAnalytics,
  getChainLanguageDistribution, generateRegionalInsights,
} from "../services/storage.js";

const router = express.Router();

function requireManager(req, res, next) {
  if (!req.session.employeeId) return res.status(401).json({ error: "Not logged in." });
  if (req.session.role !== "manager") return res.status(403).json({ error: "Access denied." });
  next();
}

router.use(requireManager);

router.get("/regions", (req, res) => {
  try { res.status(200).json({ regions: getAllRegions() }); }
  catch (e) { res.status(500).json({ error: "Failed to fetch regions." }); }
});

router.get("/overview", (req, res) => {
  try { res.status(200).json({ overview: getRegionalOverview() }); }
  catch (e) { res.status(500).json({ error: "Failed to fetch overview." }); }
});

router.get("/language", (req, res) => {
  try { res.status(200).json({ distribution: getChainLanguageDistribution() }); }
  catch (e) { res.status(500).json({ error: "Failed to fetch language distribution." }); }
});

router.get("/:region/behaviour", (req, res) => {
  try {
    const data = getRegionBehaviourMetrics(req.params.region);
    if (!data) return res.status(404).json({ error: "Region not found." });
    res.status(200).json({ region: req.params.region, behaviour: data });
  } catch (e) { res.status(500).json({ error: "Failed to fetch behaviour metrics." }); }
});

router.get("/:region/language", (req, res) => {
  try { res.status(200).json({ region: req.params.region, languages: getRegionLanguageStats(req.params.region) }); }
  catch (e) { res.status(500).json({ error: "Failed to fetch language stats." }); }
});

router.get("/:region/sales", (req, res) => {
  try {
    const data = getRegionSalesAnalytics(req.params.region);
    if (!data) return res.status(404).json({ error: "Region not found." });
    res.status(200).json({ region: req.params.region, sales: data });
  } catch (e) { res.status(500).json({ error: "Failed to fetch sales analytics." }); }
});

router.get("/:region/insights", async (req, res) => {
  try {
    const data = await generateRegionalInsights(req.params.region);
    res.status(200).json(data);
  } catch (e) { res.status(500).json({ error: "Failed to generate insights." }); }
});

export default router;