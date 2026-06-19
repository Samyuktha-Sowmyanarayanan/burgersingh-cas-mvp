import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import regionalRouter from "./routes/regional.js";
import branchesRouter from "./routes/branches.js";
import leaderboardRouter from "./routes/leaderboard.js";
import session from "express-session";
import analyzeRouter from "./routes/analyze.js";
import employeesRouter from "./routes/employees.js";
import dashboardRouter from "./routes/dashboard.js";
import authRouter from "./routes/auth.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET || "burgersingh-dev-secret-change-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 8 },
  })
);

app.use(express.static(path.join(__dirname, "..", "public")));

app.use("/api/auth", authRouter);
app.use("/api/analyze", analyzeRouter);
app.use("/api/employees", employeesRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/branches", branchesRouter);
app.use("/api/leaderboard", leaderboardRouter);
app.use("/api/regional", regionalRouter);
// Redirect root to login
app.get("/", (req, res) => {
  res.redirect("/login.html");
});

app.use((err, req, res, next) => {
  console.error("Error:", err.message);
  res.status(400).json({ error: err.message });
});
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "login.html"));
});
app.listen(PORT, () => {
  console.log(`Burger Singh CAS server running at http://localhost:${PORT}`);
});