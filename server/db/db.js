import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database(path.join(__dirname, "burgersingh.sqlite"));

db.pragma("journal_mode = WAL");

// ── Phase 1-3: Core tables ───────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    transcript TEXT NOT NULL,
    greeting INTEGER,
    politeness INTEGER,
    customer_engagement INTEGER,
    upselling INTEGER,
    combo_recommendation INTEGER,
    discount_mentioned INTEGER,
    complaint_handling TEXT,
    professionalism INTEGER,
    overall_score INTEGER NOT NULL,
    recommendations TEXT NOT NULL,
    raw_evaluation TEXT NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS employees (
    employee_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'employee'
  )
`);

// ── Phase 4: Branches ────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS branches (
    branch_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    region TEXT NOT NULL
  )
`);

// ── Idempotent migration helper ──────────────────────────────────────────────
function addColumnIfMissing(table, column, definition) {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`Migration: added column "${column}" to "${table}".`);
  } catch (err) {
    if (!err.message.includes("duplicate column name")) throw err;
  }
}

// Phase 4 columns
addColumnIfMissing("employees", "branch_id", "TEXT");
addColumnIfMissing("conversations", "branch_id", "TEXT");

// Phase 5 columns
addColumnIfMissing("conversations", "detected_language", "TEXT");
addColumnIfMissing("conversations", "english_transcript", "TEXT");

// ── Seed branches ─────────────────────────────────────────────────────────────
const REGIONS = [
  "Bihar", "Chhattisgarh", "Delhi", "Gujarat", "Haryana",
  "Himachal Pradesh", "Jammu", "Jharkhand", "Karnataka",
  "Madhya Pradesh", "Maharashtra", "Meghalaya", "Odisha",
  "Punjab", "Rajasthan", "Uttarakhand", "Uttar Pradesh", "West Bengal",
];

const insertBranch = db.prepare(
  "INSERT OR IGNORE INTO branches (branch_id, name, region) VALUES (?, ?, ?)"
);
for (const region of REGIONS) {
  const branchId = "BR-" + region.toUpperCase().replace(/\s+/g, "");
  insertBranch.run(branchId, `${region} Branch`, region);
}

// ── Seed employees ────────────────────────────────────────────────────────────
const insertEmployee = db.prepare(
  "INSERT OR IGNORE INTO employees (employee_id, name, password, role, branch_id) VALUES (?, ?, ?, ?, ?)"
);
insertEmployee.run("EMP-0241", "Aman Verma",   "password123", "employee", "BR-DELHI");
insertEmployee.run("MGR-0001", "Priya Singh",  "manager123",  "manager",  "BR-DELHI");
insertEmployee.run("EMP-0512", "Ravi Kumar",   "password123", "employee", "BR-PUNJAB");
insertEmployee.run("EMP-0788", "Neha Das",     "password123", "employee", "BR-WESTBENGAL");
insertEmployee.run("EMP-0334", "Arjun Sharma", "password123", "employee", "BR-BIHAR");

// Default any legacy employee with no branch to BR-DELHI
const unassigned = db
  .prepare("SELECT COUNT(*) as count FROM employees WHERE branch_id IS NULL")
  .get().count;
if (unassigned > 0) {
  db.prepare("UPDATE employees SET branch_id = 'BR-DELHI' WHERE branch_id IS NULL").run();
  console.warn(`Migration: ${unassigned} employee(s) defaulted to BR-DELHI. Update manually if incorrect.`);
}

export default db;