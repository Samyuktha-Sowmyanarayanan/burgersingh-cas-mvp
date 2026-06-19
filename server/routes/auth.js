import express from "express";
import { verifyLogin } from "../services/storage.js";

const router = express.Router();

router.post("/login", async (req, res) => {
  try {
    const { employeeId, password } = req.body;

    if (!employeeId || !password) {
      return res.status(400).json({
        error: "Employee ID and password are required."
      });
    }

    const employee = await verifyLogin(employeeId, password);

    if (!employee) {
      return res.status(401).json({
        error: "Invalid employee ID or password."
      });
    }

    req.session.employeeId = employee.employee_id;
    req.session.name = employee.name;
    req.session.role = employee.role;

    return res.status(200).json({
      message: "Login successful.",
      employee
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: "Login failed."
    });
  }
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.status(200).json({ message: "Logged out." });
  });
});

router.get("/me", (req, res) => {
  if (!req.session.employeeId) {
    return res.status(401).json({ error: "Not logged in." });
  }
  res.status(200).json({
    employeeId: req.session.employeeId,
    name: req.session.name,
    role: req.session.role,
  });
});

export default router;