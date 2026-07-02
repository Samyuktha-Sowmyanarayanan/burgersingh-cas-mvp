const roleSelector = document.getElementById("role-selector");
const loginBtn     = document.getElementById("login-btn");
const loginError   = document.getElementById("login-error");
const formTitle    = document.getElementById("form-title");
const formDesc     = document.getElementById("form-desc");
const idLabel      = document.getElementById("id-label");
const accessNote   = document.getElementById("access-note");

const ROLE_COPY = {
  manager: {
    title: "Manager Intelligence Portal",
    desc:  "Access branch performance, regional insights, and franchise rankings.",
    idLabel: "MANAGER ID",
    note: "Requires Administrator Access",
  },
  employee: {
    title: "Employee Performance Portal",
    desc:  "Access your conversation analysis, performance metrics, and coaching insights.",
    idLabel: "EMPLOYEE ID",
    note: "Employee Workspace Access",
  },
};

let selectedRole = "employee";

roleSelector.querySelectorAll(".role-tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    roleSelector.querySelectorAll(".role-tab").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    selectedRole = btn.dataset.role;
    const copy = ROLE_COPY[selectedRole];
    formTitle.textContent = copy.title;
    formDesc.textContent  = copy.desc;
    idLabel.textContent   = copy.idLabel;
    accessNote.childNodes[0].textContent = copy.note + " ";
  });
});

function showError(msg) {
  loginError.textContent = msg;
  loginError.classList.remove("hidden");
}

loginBtn.addEventListener("click", handleLogin);
document.getElementById("login-password").addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleLogin();
});

async function handleLogin() {
  const employeeId = document.getElementById("login-id").value.trim();
  const password   = document.getElementById("login-password").value;
  loginError.classList.add("hidden");

  if (!employeeId || !password) { 
    showError("Please enter your ID and password."); 
    return; 
  }

  loginBtn.disabled = true;
  loginBtn.innerHTML = `<div class="spinner" style="width:16px;height:16px;border-width:2px;"></div> Signing in...`;

  try {
    // 1. The response variable is declared HERE inside the try block
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId, password }),
    });
    
    const data = await response.json();
    
    // 2. Safety check against the server response status
    if (!response.ok) throw new Error(data.error || "Login failed.");

    // 3. Store data in localStorage safely just in case your dashboards look for it
    if (data.token) {
      localStorage.setItem("authToken", data.token);
    }
    if (data.employee) {
      localStorage.setItem("user", JSON.stringify(data.employee));
    }

    // 4. Safely evaluate the role using lowercase to prevent mismatch loops
    const userRole = data.employee?.role?.toLowerCase();
    
    // 5. Perform the redirection while still inside scope
    window.location.href = userRole === "manager" ? "/manager.html" : "/employee.html";

  } catch (err) {
    // If anything fails above, it drops straight down here safely
    showError(err.message);
    loginBtn.disabled = false;
    loginBtn.innerHTML = `Sign In <i data-lucide="arrow-right"></i>`;
    if (window.lucide) lucide.createIcons();
  }
}

// Set initial role visually to employee
document.querySelector('[data-role="employee"]').click();