const roleSelector = document.getElementById("role-selector");
const loginBtn     = document.getElementById("login-btn");
const loginError   = document.getElementById("login-error");

// Role toggle (cosmetic — actual role comes from the database)
roleSelector.querySelectorAll(".role-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    roleSelector.querySelectorAll(".role-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
  });
});

loginBtn.addEventListener("click", handleLogin);
document.getElementById("login-password").addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleLogin();
});

async function handleLogin() {
  const employeeId = document.getElementById("login-id").value.trim();
  const password   = document.getElementById("login-password").value;
  loginError.classList.add("hidden");

  if (!employeeId || !password) {
    showError("Please enter your Employee ID and password.");
    return;
  }

  loginBtn.disabled = true;
  loginBtn.textContent = "Signing in...";

  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId, password }),
    });
    const data = await response.json();

    if (!response.ok) throw new Error(data.error || "Login failed.");

    // Role-based routing
    if (data.employee.role === "manager") {
      window.location.href = "/manager.html";
    } else {
      window.location.href = "/employee.html";
    }
  } catch (err) {
    showError(err.message);
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = "Sign In";
  }
}

function showError(msg) {
  loginError.textContent = msg;
  loginError.classList.remove("hidden");
}