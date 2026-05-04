const SESSION_STORAGE_KEY = "airtel_hrms_session";
const SESSION_ACTIVITY_KEY = "airtel_hrms_last_activity";
const INACTIVITY_LIMIT_MS = 5 * 60 * 1000;
const WARNING_WINDOW_MS = 60 * 1000;

const authShell = document.querySelector("#auth-shell");
const dashboardShell = document.querySelector("#dashboard-shell");
const loginForm = document.querySelector("#login-form");
const loginHint = document.querySelector("#login-hint");
const loginEmail = document.querySelector("#login-email");
const loginPassword = document.querySelector("#login-password");
const passwordToggle = document.querySelector("#password-toggle");
const sidebarToggle = document.querySelector("#sidebar-toggle");
const sidebarBackdrop = document.querySelector("#sidebar-backdrop");
const dashboardSidebar = document.querySelector("#dashboard-sidebar");
const employeeForm = document.querySelector("#employee-form");
const employeeList = document.querySelector("#employee-list");
const employeeSearch = document.querySelector("#employee-search");
const employeeFilter = document.querySelector("#employee-filter");
const refreshButton = document.querySelector("#refresh-dashboard");
const createEmployeeButton = document.querySelector("#create-employee");
const employeePagePrevButton = document.querySelector("#employee-page-prev");
const employeePageNextButton = document.querySelector("#employee-page-next");
const employeePageStatus = document.querySelector("#employee-page-status");
const cancelEditButton = document.querySelector("#cancel-edit");
const employeeModalCloseButtons = Array.from(document.querySelectorAll("[data-close-employee-modal]"));
const employeeFormTitle = document.querySelector("#employee-form-title");
const employeeMessage = document.querySelector("#employee-message");
const employeeStatusDisplay = document.querySelector("#employee-status-display");
const employeeCredentialsPanel = document.querySelector("#employee-credentials-panel");
const employeeCredentialsEmail = document.querySelector("#employee-credentials-email");
const employeeCredentialsPassword = document.querySelector("#employee-credentials-password");
const employeeRoleSelect = document.querySelector("#employee-role-select");
const employeeModalOverlay = document.querySelector("#employee-modal-overlay");
const topbarTitle = document.querySelector("#topbar-title");
const actorName = document.querySelector("#sidebar-actor-name");
const actorRole = document.querySelector("#sidebar-actor-role");
const dashboardChipLabel = document.querySelector("#dashboard-chip-label");
const dashboardBreadcrumbCurrent = document.querySelector("#dashboard-breadcrumb-current");
const overviewCopy = document.querySelector("#overview-copy");
const mastheadAvatar = document.querySelector("#masthead-avatar");
const userMenuTrigger = document.querySelector("#user-menu-trigger");
const userMenuDropdown = document.querySelector("#user-menu-dropdown");
const userMenuProfile = document.querySelector("#user-menu-profile");
const userMenuLogout = document.querySelector("#user-menu-logout");
const profilePanel = document.querySelector("#profile-panel");
const profilePanelClose = document.querySelector("#profile-panel-close");
const profilePanelContent = document.querySelector("#profile-panel-content");
const settingsProfileForm = document.querySelector("#settings-profile-form");
const settingsPasswordForm = document.querySelector("#settings-password-form");
const settingsFirstName = document.querySelector("#settings-first-name");
const settingsLastName = document.querySelector("#settings-last-name");
const settingsEmail = document.querySelector("#settings-email");
const settingsPhoneNumber = document.querySelector("#settings-phone-number");
const settingsProfileAvatar = document.querySelector("#settings-profile-avatar");
const settingsSummaryAvatar = document.querySelector("#settings-summary-avatar");
const settingsProfileName = document.querySelector("#settings-profile-name");
const settingsProfileEmailPreview = document.querySelector("#settings-profile-email-preview");
const settingsProfileRole = document.querySelector("#settings-profile-role");
const settingsSummaryName = document.querySelector("#settings-summary-name");
const settingsSummaryEmail = document.querySelector("#settings-summary-email");
const settingsSummaryRole = document.querySelector("#settings-summary-role");
const settingsSummaryStatus = document.querySelector("#settings-summary-status");
const settingsSummaryPhone = document.querySelector("#settings-summary-phone");
const settingsSummaryDepartment = document.querySelector("#settings-summary-department");
const settingsSummaryJob = document.querySelector("#settings-summary-job");
const settingsProfileSuccess = document.querySelector("#settings-profile-success");
const settingsProfileError = document.querySelector("#settings-profile-error");
const settingsPasswordSuccess = document.querySelector("#settings-password-success");
const settingsPasswordError = document.querySelector("#settings-password-error");
const settingsProfileSubmit = document.querySelector("#settings-profile-submit");
const settingsPasswordSubmit = document.querySelector("#settings-password-submit");
const directoryCountPill = document.querySelector("#directory-count-pill");
const overviewGrid = document.querySelector("#overview-grid");
const overviewInsights = document.querySelector("#overview-insights");
const sectionButtons = Array.from(document.querySelectorAll("[data-section-target]"));
const sectionViews = {
  overview: document.querySelector("#section-overview"),
  directory: document.querySelector("#section-directory"),
  settings: document.querySelector("#section-settings"),
  register: document.querySelector("#section-register"),
};

const workspaceGroupToggle = document.querySelector("#group-workspace-toggle");
const workspaceGroupLinks = document.querySelector("#group-workspace-links");
const workspaceGroupChevron = document.querySelector("#group-workspace-chevron");
const managementGroupToggle = document.querySelector("#group-management-toggle");
const managementGroupLinks = document.querySelector("#group-management-links");
const managementGroupChevron = document.querySelector("#group-management-chevron");

const sectionGroupMap = {
  overview: "workspace",
  directory: "workspace",
  settings: "management",
  register: "management",
};

const groupControls = {
  workspace: {
    toggle: workspaceGroupToggle,
    links: workspaceGroupLinks,
    chevron: workspaceGroupChevron,
  },
  management: {
    toggle: managementGroupToggle,
    links: managementGroupLinks,
    chevron: managementGroupChevron,
  },
};

const state = {
  actor: null,
  token: "",
  employees: [],
  employeePage: 1,
  employeesPerPage: 8,
  editingEmployeeId: null,
  selectedEmployeeId: null,
  lastStats: null,
  recentEmployees: [],
  activeSection: "overview",
  roleOptions: [],
};

let isSidebarCollapsed = false;
let inactivityTimeoutId = null;
let warningTimeoutId = null;
let warningIntervalId = null;
let sessionWarningOverlay = null;
let sessionCountdownValue = null;

const sectionMeta = {
  overview: {
    title: "Dashboard",
    subtitleHr: "Manage employee source records section by section before they flow into IMS.",
    subtitleIt: "Review employee device readiness section by section before assigning equipment in IMS.",
    breadcrumb: "Overview",
  },
  directory: {
    title: "Users",
    subtitleHr: "",
    subtitleIt: "",
    breadcrumb: "Users",
  },
  settings: {
    title: "Settings",
    subtitleHr: "Update your profile and sign-in credentials.",
    subtitleIt: "Update your profile and sign-in credentials.",
    breadcrumb: "Settings",
  },
  register: {
    title: "Employee Settings",
    subtitleHr: "Create employees, assign IMS roles, and manage the records HRMS publishes to IMS.",
    subtitleIt: "This section is limited to HR Recruitment Officer access.",
    breadcrumb: "Employee Settings",
  },
};

const iconMap = {
  dashboard:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13h8V3H3z"/><path d="M13 21h8v-6h-8z"/><path d="M13 3h8v8h-8z"/><path d="M3 21h8v-4H3z"/></svg>',
  users:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  employeeTotal:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8"/><path d="M8 11h8"/><path d="M8 15h5"/></svg>',
  search:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/><path d="M11 8v6"/><path d="M8 11h6"/></svg>',
  plus:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>',
  settings:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a2 2 0 0 1 2 2v1.1a7.9 7.9 0 0 1 1.9.8l.8-.8a2 2 0 1 1 2.8 2.8l-.8.8a7.9 7.9 0 0 1 .8 1.9H21a2 2 0 1 1 0 4h-1.1a7.9 7.9 0 0 1-.8 1.9l.8.8a2 2 0 1 1-2.8 2.8l-.8-.8a7.9 7.9 0 0 1-1.9.8V21a2 2 0 1 1-4 0v-1.1a7.9 7.9 0 0 1-1.9-.8l-.8.8a2 2 0 1 1-2.8-2.8l.8-.8a7.9 7.9 0 0 1-.8-1.9H3a2 2 0 1 1 0-4h1.1a7.9 7.9 0 0 1 .8-1.9l-.8-.8A2 2 0 1 1 6.9 5.4l.8.8a7.9 7.9 0 0 1 1.9-.8V5a2 2 0 0 1 2-2Z"/><circle cx="12" cy="12" r="3"/></svg>',
  profile:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="8" r="4"/></svg>',
  inactive:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="m9 9 6 6"/><path d="m15 9-6 6"/></svg>',
  active:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="m9 12 2 2 4-4"/></svg>',
  pending:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5"/><path d="M12 16h.01"/></svg>',
  imsLinked:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l2.92-2.92a5 5 0 0 0-7.07-7.07L11.5 5.4"/><path d="M14 11a5 5 0 0 0-7.54-.54L3.54 13.4a5 5 0 0 0 7.07 7.07l1.88-1.88"/></svg>',
  departmentCluster:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18"/><path d="M6 21V8h12v13"/><path d="M9 12h.01"/><path d="M12 12h.01"/><path d="M15 12h.01"/><path d="M9 16h.01"/><path d="M12 16h.01"/><path d="M15 16h.01"/><path d="M9 4h6v4H9z"/></svg>',
  linked:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
  departments:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/></svg>',
  approvals:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12l2 2 4-4"/><path d="M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9c1.93 0 3.72.61 5.18 1.65"/><path d="M16 5h5v5"/></svg>',
  seen:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12Zm11 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/></svg>',
  requests:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18"/><path d="M16 5l7 7-7 7"/><path d="M3 5l7 7-7 7"/></svg>',
  fulfilled:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 13l4 4L19 7"/></svg>',
};

function normalizeRole(role) {
  return String(role || "").trim().toLowerCase();
}

function isHrRole() {
  return normalizeRole(state.actor?.role) === "hr recruitment officer";
}

function isItRole() {
  return normalizeRole(state.actor?.role) === "it support engineer";
}

function persistSession() {
  if (!state.actor || !state.token) {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({
      token: state.token,
      actor: state.actor,
    }),
  );
}

function restoreSessionState() {
  try {
    const value = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!value) {
      return false;
    }

    const parsed = JSON.parse(value);
    if (!parsed?.token || !parsed?.actor) {
      return false;
    }

    state.token = parsed.token;
    state.actor = parsed.actor;
    return true;
  } catch {
    return false;
  }
}

function consumeSsoTokenFromUrl() {
  const url = new URL(window.location.href);
  const ssoToken = url.searchParams.get("ssoToken");

  if (!ssoToken) {
    return false;
  }

  state.token = ssoToken;
  url.searchParams.delete("ssoToken");
  window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
  return true;
}

function clearSession() {
  state.actor = null;
  state.token = "";
  state.employees = [];
  state.editingEmployeeId = null;
  state.selectedEmployeeId = null;
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
  window.sessionStorage.removeItem(SESSION_ACTIVITY_KEY);
  stopSessionTimers();
  hideSessionWarning();
}

async function closeHrmsSession() {
  if (!state.token) {
    return;
  }

  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: getRequestHeaders(),
    });
  } catch {
    // Ignore transport failures and still clear the local session.
  }
}

function openUserMenu() {
  userMenuDropdown.classList.remove("hidden");
  userMenuTrigger?.setAttribute("aria-expanded", "true");
}

function closeUserMenu() {
  userMenuDropdown.classList.add("hidden");
  userMenuTrigger?.setAttribute("aria-expanded", "false");
}

function toggleUserMenu() {
  if (userMenuDropdown.classList.contains("hidden")) {
    openUserMenu();
    return;
  }
  closeUserMenu();
}

function openProfilePanel(profile) {
  profilePanelContent.innerHTML = `
    <div class="profile-summary">
      <div class="profile-avatar">${getInitials(profile.firstName, profile.lastName)}</div>
      <div>
        <strong>${profile.firstName || ""} ${profile.lastName || ""}</strong>
        <p>${profile.email || "No email"}</p>
      </div>
    </div>
    <div class="profile-details">
      <p><strong>Role:</strong> ${profile.role || "N/A"}</p>
      <p><strong>Status:</strong> ${profile.status || "N/A"}</p>
      <p><strong>IMS user id:</strong> ${profile.id || "N/A"}</p>
      <p><strong>Email:</strong> ${profile.email || "N/A"}</p>
    </div>
  `;
  profilePanel.classList.remove("hidden");
}

function closeProfilePanel() {
  profilePanel.classList.add("hidden");
}

function openActorProfile() {
  closeProfilePanel();
  setActiveSection("settings");
}

function getInitials(firstName, lastName) {
  return [firstName, lastName]
    .filter(Boolean)
    .map((part) => part.trim()[0]?.toUpperCase())
    .join("")
    .slice(0, 2) || "HR";
}

function setMessage(target, message, isError = false) {
  if (!target) {
    return;
  }

  target.textContent = message;
  target.style.color = isError ? "#b1131a" : "#587287";
  target.classList.toggle("hidden", !message);
  target.classList.toggle("is-visible", Boolean(message));
}

function ensureSessionWarningOverlay() {
  if (sessionWarningOverlay) {
    return sessionWarningOverlay;
  }

  const overlay = document.createElement("div");
  overlay.className = "session-warning-overlay hidden";
  overlay.innerHTML = `
    <div class="session-warning-card" role="alertdialog" aria-labelledby="session-warning-title" aria-modal="true">
      <p class="session-warning-kicker">Session warning</p>
      <h2 id="session-warning-title">You will be logged out soon</h2>
      <p>No activity has been detected. Your session will expire in <strong id="session-warning-countdown">60</strong> seconds.</p>
      <div class="session-warning-actions">
        <button class="primary-btn compact-btn" type="button" data-session-action="continue">Continue session</button>
        <button class="secondary-btn compact-btn" type="button" data-session-action="logout">Logout now</button>
      </div>
    </div>
  `;

  overlay.addEventListener("click", (event) => {
    const action = event.target.closest("[data-session-action]")?.getAttribute("data-session-action");
    if (action === "continue") {
      handleContinueSession();
    }
    if (action === "logout") {
      void handleLogout();
    }
  });

  document.body.appendChild(overlay);
  sessionWarningOverlay = overlay;
  sessionCountdownValue = overlay.querySelector("#session-warning-countdown");
  return overlay;
}

function hideSessionWarning() {
  const overlay = ensureSessionWarningOverlay();
  overlay.classList.add("hidden");
}

function showSessionWarning(secondsRemaining) {
  const overlay = ensureSessionWarningOverlay();
  if (sessionCountdownValue) {
    sessionCountdownValue.textContent = String(Math.max(secondsRemaining, 1));
  }
  overlay.classList.remove("hidden");
}

function stopSessionTimers() {
  if (inactivityTimeoutId) {
    window.clearTimeout(inactivityTimeoutId);
    inactivityTimeoutId = null;
  }

  if (warningTimeoutId) {
    window.clearTimeout(warningTimeoutId);
    warningTimeoutId = null;
  }

  if (warningIntervalId) {
    window.clearInterval(warningIntervalId);
    warningIntervalId = null;
  }
}

function touchSessionActivity() {
  if (!state.actor || !state.token) {
    return;
  }

  window.sessionStorage.setItem(SESSION_ACTIVITY_KEY, String(Date.now()));
}

async function handleLogout() {
  await closeHrmsSession();
  clearSession();
  resetEmployeeForm();
  closeProfilePanel();
  showAuthView();
}

function startSessionMonitoring() {
  stopSessionTimers();
  hideSessionWarning();

  if (!state.actor || !state.token) {
    return;
  }

  const currentActivity = Number(window.sessionStorage.getItem(SESSION_ACTIVITY_KEY) || Date.now());
  const timeRemaining = Math.max(INACTIVITY_LIMIT_MS - (Date.now() - currentActivity), 0);

  const beginWarningCountdown = () => {
    hideSessionWarning();

    const updateCountdown = () => {
      const lastActivity = Number(window.sessionStorage.getItem(SESSION_ACTIVITY_KEY) || Date.now());
      const secondsRemaining = Math.max(Math.ceil((INACTIVITY_LIMIT_MS - (Date.now() - lastActivity)) / 1000), 0);
      showSessionWarning(secondsRemaining);
    };

    updateCountdown();
    warningIntervalId = window.setInterval(updateCountdown, 1000);
  };

  if (timeRemaining <= WARNING_WINDOW_MS) {
    beginWarningCountdown();
  } else {
    warningTimeoutId = window.setTimeout(beginWarningCountdown, timeRemaining - WARNING_WINDOW_MS);
  }

  inactivityTimeoutId = window.setTimeout(() => {
    void handleLogout();
  }, timeRemaining);
}

function handleActivity() {
  if (!state.actor || !state.token) {
    return;
  }

  hideSessionWarning();
  touchSessionActivity();
  startSessionMonitoring();
}

function handleContinueSession() {
  touchSessionActivity();
  hideSessionWarning();
  startSessionMonitoring();
}

function setInlineMessage(target, message, kind = "") {
  if (!target) {
    return;
  }

  target.textContent = message || "";
  target.classList.toggle("hidden", !message);
  target.classList.toggle("success-text", kind === "success");
  target.classList.toggle("error-text", kind === "error");
}

function applyIcons() {
  document.querySelectorAll("[data-icon]").forEach((node) => {
    node.innerHTML = iconMap[node.getAttribute("data-icon")] || "";
  });
  document.querySelectorAll("[data-inline-icon]").forEach((node) => {
    node.innerHTML = getActionIcon(node.getAttribute("data-inline-icon")) || "";
  });
}

function setSidebarOpen(isOpen) {
  if (window.innerWidth <= 980) {
    dashboardSidebar.classList.toggle("is-open", isOpen);
    sidebarBackdrop.classList.toggle("hidden", !isOpen);
    sidebarBackdrop.classList.toggle("is-open", isOpen);
  } else {
    dashboardSidebar.classList.remove("is-open");
    sidebarBackdrop.classList.add("hidden");
    sidebarBackdrop.classList.remove("is-open");
  }
}

function setSidebarCollapsed(collapsed) {
  if (window.innerWidth <= 980) {
    // Do not collapse the drawer on mobile; keep mobile behavior as overlay.
    return;
  }

  isSidebarCollapsed = Boolean(collapsed);
  dashboardSidebar.classList.toggle("is-collapsed", isSidebarCollapsed);
  dashboardShell.classList.toggle("sidebar-collapsed", isSidebarCollapsed);
}

function toggleGroup(linksNode, chevronNode, expanded) {
  if (!linksNode || !chevronNode) {
    return;
  }

  linksNode.classList.toggle("is-open", expanded);
  linksNode.classList.toggle("is-closed", !expanded);
  chevronNode.classList.toggle("is-open", expanded);
}

function setGroupState(groupName, expanded) {
  const group = groupControls[groupName];
  if (!group?.toggle || !group?.links || !group?.chevron) {
    return;
  }

  toggleGroup(group.links, group.chevron, expanded);
  group.toggle.setAttribute("aria-expanded", String(expanded));
}

function openGroupForSection(sectionId) {
  const groupName = sectionGroupMap[sectionId] || "workspace";
  setGroupState(groupName, true);
}

function updateActiveLinkState() {
  sectionButtons.forEach((button) => {
    const isActive = button.getAttribute("data-section-target") === state.activeSection;
    button.classList.toggle("is-active", isActive);
    button.toggleAttribute("aria-current", isActive);
  });
}

function updateSectionMeta() {
  const meta = sectionMeta[state.activeSection] || sectionMeta.overview;
  if (state.activeSection === "overview") {
    topbarTitle.textContent = isItRole() ? "IT Support Dashboard" : "HR Recruitment Officer Dashboard";
  } else {
    topbarTitle.textContent = meta.title;
  }
  overviewCopy.textContent = state.activeSection === "overview" ? "" : isItRole() ? meta.subtitleIt : meta.subtitleHr;
  dashboardChipLabel.textContent = isItRole() ? "IT Support" : "HR Recruitment Officer";
  dashboardBreadcrumbCurrent.textContent = meta.breadcrumb;
}

function renderRoleOptions(selectedRoleId = "") {
  if (!employeeRoleSelect) {
    return;
  }

  const options = state.roleOptions.length > 0
    ? state.roleOptions
        .map((role) => {
          const roleId = String(role.id);
          const selected = String(selectedRoleId) === roleId ? " selected" : "";
          return `<option value="${roleId}"${selected}>${role.name}</option>`;
        })
        .join("")
    : '<option value="">No IMS roles available</option>';

  employeeRoleSelect.innerHTML = `<option value="">Select IMS role</option>${options}`;

  if (selectedRoleId) {
    employeeRoleSelect.value = String(selectedRoleId);
  }
}

function getActionIcon(iconName) {
  const icons = {
    add: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 6 12 12"/><path d="m18 6-12 12"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 20h9"/><path d="m16.5 3.5 4 4L7 21l-4 1 1-4z"/></svg>',
    logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg>',
    profile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="8" r="4"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>',
    save: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/></svg>',
    activate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 2v10"/><path d="M18.4 5.6a9 9 0 1 1-12.8 0"/></svg>',
    deactivate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 2v10"/><path d="M5.6 5.6a9 9 0 1 0 12.8 0"/></svg>',
    resend: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/></svg>',
  };

  return icons[iconName] || "";
}

function createActionButton({ label, icon, tone = "secondary-btn", datasetKey, datasetValue, extraAttributes = "" }) {
  return `<button class="${tone} compact-btn action-btn action-btn--${icon}" type="button" data-${datasetKey}="${datasetValue}" ${extraAttributes}><span class="btn-icon">${getActionIcon(icon)}</span><span class="btn-label">${label}</span></button>`;
}

function setEmployeeStatusDisplay(status) {
  if (!employeeStatusDisplay) {
    return;
  }

  const normalized = String(status || "active").trim().toLowerCase();
  employeeStatusDisplay.textContent = normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function clearEmployeeCredentials() {
  employeeCredentialsPanel?.classList.add("hidden");
  if (employeeCredentialsEmail) {
    employeeCredentialsEmail.value = "";
  }
  if (employeeCredentialsPassword) {
    employeeCredentialsPassword.value = "";
  }
}

function showEmployeeCredentials(credentials) {
  if (!employeeCredentialsPanel || !employeeCredentialsEmail || !employeeCredentialsPassword) {
    return;
  }

  employeeCredentialsEmail.value = credentials?.email || "";
  employeeCredentialsPassword.value = credentials?.temporaryPassword || "";
  employeeCredentialsPanel.classList.remove("hidden");
}

function syncSettingsView() {
  if (!state.actor) {
    return;
  }

  const fullName = `${state.actor.firstName || ""} ${state.actor.lastName || ""}`.trim() || "HR User";
  const initials = getInitials(state.actor.firstName, state.actor.lastName);
  const roleLabel = String(state.actor.role || "HR Recruitment Officer").toUpperCase();
  const statusLabel = String(state.actor.status || "active").toUpperCase();

  if (settingsFirstName) settingsFirstName.value = state.actor.firstName || "";
  if (settingsLastName) settingsLastName.value = state.actor.lastName || "";
  if (settingsEmail) settingsEmail.value = state.actor.email || "";
  if (settingsPhoneNumber) settingsPhoneNumber.value = state.actor.phoneNumber || "";
  if (settingsProfileAvatar) settingsProfileAvatar.textContent = initials;
  if (settingsSummaryAvatar) settingsSummaryAvatar.textContent = initials;
  if (settingsProfileName) settingsProfileName.textContent = fullName;
  if (settingsSummaryName) settingsSummaryName.textContent = fullName;
  if (settingsProfileEmailPreview) settingsProfileEmailPreview.textContent = state.actor.email || "No email";
  if (settingsSummaryEmail) settingsSummaryEmail.textContent = state.actor.email || "No email";
  if (settingsProfileRole) settingsProfileRole.textContent = roleLabel;
  if (settingsSummaryRole) settingsSummaryRole.textContent = roleLabel;
  if (settingsSummaryStatus) settingsSummaryStatus.textContent = statusLabel;
  if (settingsSummaryPhone) settingsSummaryPhone.textContent = state.actor.phoneNumber || "Not assigned";
  if (settingsSummaryDepartment) settingsSummaryDepartment.textContent = state.actor.departmentName || "Not assigned";
  if (settingsSummaryJob) settingsSummaryJob.textContent = state.actor.jobTitle || "Not assigned";
}

function setActiveSection(sectionId) {
  const safeSection = sectionViews[sectionId] ? sectionId : "overview";
  state.activeSection = safeSection;
  Object.entries(sectionViews).forEach(([key, node]) => {
    node.classList.toggle("hidden", key !== safeSection);
  });
  updateActiveLinkState();
  openGroupForSection(safeSection);
  updateSectionMeta();
  if (safeSection === "settings") {
    syncSettingsView();
  }
  if (window.innerWidth <= 980) {
    setSidebarOpen(false);
  }
}

function getRequestHeaders(extraHeaders = {}) {
  return {
    "Content-Type": "application/json",
    ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
    ...extraHeaders,
  };
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: getRequestHeaders(options.headers || {}),
  });

  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    clearSession();
    showAuthView();
  }
  if (!response.ok) {
    throw new Error(data.message || "Request failed.");
  }

  return data;
}

function showAuthView() {
  authShell.classList.remove("hidden");
  dashboardShell.classList.add("hidden");
  hideSessionWarning();
  stopSessionTimers();
}

function showDashboardView() {
  authShell.classList.add("hidden");
  dashboardShell.classList.remove("hidden");
}

function updateStats(stats, recentEmployees = []) {
  state.lastStats = stats || {};
  state.recentEmployees = Array.isArray(recentEmployees) ? recentEmployees : [];
  renderOverviewCards();
}

function renderOverviewCards() {
  const stats = state.lastStats || {};
  const inactiveEmployees = Math.max(
    Number(stats.totalEmployees || 0) - Number(stats.activeEmployees || 0) - Number(stats.pendingEmployees || 0),
    0,
  );
  const cards = [
    {
      key: "employeeTotal",
      title: "Total Employees",
      value: Number(stats.totalEmployees || 0),
      action: "Open directory",
      section: "directory",
      filter: "all",
      featured: true,
    },
    {
      key: "active",
      title: "Active Employees",
      value: Number(stats.activeEmployees || 0),
      action: "View active employees",
      section: "directory",
      filter: "active",
    },
    {
      key: "pending",
      title: "Pending Profiles",
      value: Number(stats.pendingEmployees || 0),
      action: "Review pending profiles",
      section: "directory",
      filter: "pending",
    },
    {
      key: "inactive",
      title: "Inactive Profiles",
      value: inactiveEmployees,
      action: "Review inactive employees",
      section: "directory",
      filter: "inactive",
    },
  ];

  overviewGrid.innerHTML = cards
    .map(
      (card) => `
        <button class="dashboard-metric-card dashboard-metric-card-button" type="button" data-overview-section="${card.section}" data-overview-filter="${card.filter}">
          <div class="metric-card-head">
            <div>
              <p class="metric-kicker">${card.featured ? "HRMS overview" : "Employee focus"}</p>
              <h3>${card.title}</h3>
            </div>
          </div>
          <strong>${card.value}</strong>
          <span class="metric-card-action">${card.action} &#8594;</span>
        </button>
      `,
    )
    .join("");

  const recentEmployees = state.recentEmployees.slice(0, 4);
  const syncCoverage = Number(stats.totalEmployees || 0) > 0
    ? Math.round((Number(stats.linkedToIms || 0) / Number(stats.totalEmployees || 0)) * 100)
    : 0;

  overviewInsights.innerHTML = `
    <section class="dashboard-panel overview-panel">
      <div class="panel-header">
        <div>
          <p class="eyebrow">IMS Overview</p>
          <h3>Connection summary</h3>
        </div>
      </div>
      <div class="overview-stat-strip">
        <article class="overview-stat-card">
          <span>IMS linked</span>
          <strong>${Number(stats.linkedToIms || 0)}</strong>
          <small>${syncCoverage}% linked</small>
        </article>
        <article class="overview-stat-card">
          <span>Departments</span>
          <strong>${Number(stats.departments || 0)}</strong>
          <small>Active in directory</small>
        </article>
      </div>
    </section>
    <section class="dashboard-panel overview-panel">
      <div class="panel-header">
        <div>
          <p class="eyebrow">Recent Records</p>
          <h3>Latest employee updates</h3>
        </div>
      </div>
      <div class="overview-mini-list">
        ${
          recentEmployees.length > 0
            ? recentEmployees
                .map(
                  (employee) => `
                    <button class="overview-record-row" type="button" data-overview-select="${employee.id}">
                      <div>
                        <strong>${employee.full_name}</strong>
                        <span>${employee.job_title || "No job title"} / ${employee.department_name || "No department"}</span>
                      </div>
                      <span class="role-chip">${employee.status || "active"}</span>
                    </button>
                  `,
                )
                .join("")
            : `<p class="status-text">No employee records are available yet.</p>`
        }
      </div>
    </section>
  `;
}

function applyRoleView() {
  const hrView = isHrRole();
  if (!hrView && state.activeSection === "register") {
    setActiveSection("overview");
  }
}

function getFilteredEmployees() {
  const term = String(employeeSearch.value || "").trim().toLowerCase();
  const filter = String(employeeFilter.value || "all");

  return state.employees.filter((employee) => {
    const matchesSearch =
      !term ||
      [
        employee.full_name,
        employee.email,
        employee.employee_code,
        employee.hrms_employee_id,
        employee.department_name,
        employee.job_title,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));

    if (!matchesSearch) {
      return false;
    }

    if (filter === "active") return employee.status === "active";
    if (filter === "inactive") return employee.status === "inactive";
    if (filter === "pending") return employee.status === "pending";
    return true;
  });
}

async function loadRoleOptions() {
  const data = await requestJson("/api/roles");
  state.roleOptions = Array.isArray(data.roles) ? data.roles : [];
  renderRoleOptions(employeeForm.roleId?.value || "");
}

function renderEmployees() {
  const filtered = getFilteredEmployees();
  const totalPages = Math.max(1, Math.ceil(filtered.length / state.employeesPerPage));
  const currentPage = Math.min(state.employeePage, totalPages);
  const pageStart = (currentPage - 1) * state.employeesPerPage;
  const paginatedEmployees = filtered.slice(pageStart, pageStart + state.employeesPerPage);

  state.employeePage = currentPage;
  directoryCountPill.textContent = `${filtered.length} employee${filtered.length === 1 ? "" : "s"} loaded`;
  if (employeePageStatus) {
    employeePageStatus.textContent = `Page ${currentPage} of ${totalPages}`;
  }
  employeePagePrevButton?.toggleAttribute("disabled", currentPage <= 1);
  employeePageNextButton?.toggleAttribute("disabled", currentPage >= totalPages);

  if (filtered.length === 0) {
    employeeList.innerHTML = `
      <tr>
        <td colspan="7">
          <strong>No employees found</strong>
          <small>Try another filter, another search term, or refresh the employee directory.</small>
        </td>
      </tr>
    `;
    if (employeePageStatus) {
      employeePageStatus.textContent = "Page 0 of 0";
    }
    employeePagePrevButton?.setAttribute("disabled", "disabled");
    employeePageNextButton?.setAttribute("disabled", "disabled");
    return;
  }

  employeeList.innerHTML = paginatedEmployees
    .map((employee) => {
      const selectedClass = employee.id === state.selectedEmployeeId ? " is-selected" : "";
      const nextStatus = employee.status === "inactive" ? "active" : "inactive";
      const statusLabel = nextStatus === "active" ? "Activate" : "Deactivate";
      const managementAction = isHrRole()
        ? [
            createActionButton({
              label: "Edit",
              icon: "edit",
              tone: "secondary-btn",
              datasetKey: "edit-id",
              datasetValue: employee.id,
            }),
            createActionButton({
              label: statusLabel,
              icon: nextStatus === "active" ? "activate" : "deactivate",
              tone: nextStatus === "active" ? "secondary-btn" : "secondary-btn danger-btn",
              datasetKey: "status-id",
              datasetValue: employee.id,
              extraAttributes: `data-status-value="${nextStatus}"`,
            }),
            createActionButton({
              label: "Resend email",
              icon: "resend",
              tone: "secondary-btn",
              datasetKey: "resend-id",
              datasetValue: employee.id,
            }),
          ].join("")
        : "";

      return `
        <tr class="${selectedClass.trim()}">
          <td>
            <strong>${employee.full_name}</strong>
            <small>${employee.employee_code || "No code"}</small>
          </td>
          <td>${employee.email || "No email"}</td>
          <td>${employee.ims_role_name || "No IMS role"}</td>
          <td>${employee.department_name || "No department"}</td>
          <td><span class="role-chip">${employee.status || "No account status"}</span></td>
          <td>${employee.ims_account_status || "Linked to IMS"}</td>
          <td>
            <div class="table-action-row">
              ${managementAction}
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function openEmployeeModal() {
  employeeModalOverlay?.classList.remove("hidden");
}

function closeEmployeeModal() {
  employeeModalOverlay?.classList.add("hidden");
}

function resetEmployeeForm() {
  state.editingEmployeeId = null;
  employeeForm.reset();
  employeeForm.status.value = "active";
  setEmployeeStatusDisplay("active");
  clearEmployeeCredentials();
  if (state.roleOptions.length > 0) {
    renderRoleOptions(state.roleOptions[0]?.id || "");
  } else {
    renderRoleOptions("");
  }
  employeeFormTitle.textContent = "Add employee";
  cancelEditButton.classList.remove("hidden");
  setMessage(employeeMessage, "");
  closeEmployeeModal();
}

function fillEmployeeForm(employee) {
  state.editingEmployeeId = employee.id;
  employeeForm.firstName.value = employee.first_name || "";
  employeeForm.lastName.value = employee.last_name || "";
  employeeForm.email.value = employee.email || "";
  employeeForm.phoneNumber.value = employee.phone_number || "";
  employeeForm.employeeCode.value = employee.employee_code || "";
  employeeForm.hrmsEmployeeId.value = employee.hrms_employee_id || "";
  renderRoleOptions(employee.ims_role_id || "");
  employeeForm.jobTitle.value = employee.job_title || "";
  employeeForm.officeLocation.value = employee.office_location || "";
  employeeForm.departmentName.value = employee.department_name || "";
  employeeForm.startDate.value = employee.start_date ? String(employee.start_date).slice(0, 10) : "";
  employeeForm.status.value = employee.status || employee.employment_status || "active";
  setEmployeeStatusDisplay(employeeForm.status.value);
  clearEmployeeCredentials();
  employeeFormTitle.textContent = `Edit ${employee.full_name}`;
  cancelEditButton.classList.remove("hidden");
  setMessage(employeeMessage, "");
  openEmployeeModal();
}

function hydrateActorView() {
  const fullName = state.actor?.fullName || `${state.actor?.firstName || ""} ${state.actor?.lastName || ""}`.trim() || "User";
  const roleName = state.actor?.role || "hrms user";
  if (actorName) {
    actorName.textContent = fullName;
  }
  if (actorRole) {
    actorRole.textContent = roleName.toLowerCase();
  }
  mastheadAvatar.textContent = getInitials(state.actor?.firstName, state.actor?.lastName);
  syncSettingsView();
  applyRoleView();
  showDashboardView();
  applyIcons();
  updateSectionMeta();
  if (!window.sessionStorage.getItem(SESSION_ACTIVITY_KEY)) {
    touchSessionActivity();
  }
  startSessionMonitoring();
}

async function loadDashboard() {
  const data = await requestJson("/api/dashboard");
  state.actor = data.actor || state.actor;
  updateStats(data.stats || {}, data.recentEmployees || []);
  hydrateActorView();
}

async function loadEmployees() {
  const data = await requestJson("/api/employees");
  state.employees = Array.isArray(data.employees) ? data.employees : [];
  state.employeePage = 1;
  if (!state.selectedEmployeeId && state.employees.length > 0) {
    state.selectedEmployeeId = state.employees[0].id;
  }
  renderEmployees();
}

async function restoreSession() {
  const restored = consumeSsoTokenFromUrl() || restoreSessionState();
  if (!restored) {
    showAuthView();
    return;
  }

  try {
    const session = await requestJson("/api/auth/session", { method: "GET" });
    state.actor = session.user;
    persistSession();
    await Promise.all([loadRoleOptions(), loadDashboard(), loadEmployees()]);
    resetEmployeeForm();
  } catch {
    clearSession();
    showAuthView();
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(loginHint, "Signing in...");

  try {
    const data = await requestJson("/api/auth/login", {
      method: "POST",
      headers: {},
      body: JSON.stringify({
        email: loginEmail.value.trim(),
        identifier: loginEmail.value.trim(),
        password: loginPassword.value,
      }),
    });

    state.actor = data.user;
    state.token = data.token || "";
    persistSession();
    touchSessionActivity();
    hydrateActorView();
    setMessage(loginHint, `Signed in as ${state.actor.firstName} ${state.actor.lastName}.`);
    await Promise.all([loadRoleOptions(), loadDashboard(), loadEmployees()]);
    resetEmployeeForm();
  } catch (error) {
    setMessage(loginHint, error.message, true);
  }
});

passwordToggle.addEventListener("click", () => {
  const nextType = loginPassword.type === "password" ? "text" : "password";
  loginPassword.type = nextType;
  passwordToggle.textContent = nextType === "password" ? "Show" : "Hide";
});

sidebarToggle.addEventListener("click", () => {
  if (window.innerWidth <= 980) {
    setSidebarOpen(!dashboardSidebar.classList.contains("is-open"));
    return;
  }

  setSidebarCollapsed(!isSidebarCollapsed);
});

sidebarBackdrop.addEventListener("click", () => {
  setSidebarOpen(false);
});

userMenuTrigger.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleUserMenu();
});

userMenuProfile?.addEventListener("click", () => {
  closeUserMenu();
  openActorProfile();
});

userMenuLogout.addEventListener("click", async () => {
  closeUserMenu();
  await handleLogout();
});

profilePanelClose.addEventListener("click", () => {
  closeProfilePanel();
});

window.addEventListener("click", (event) => {
  if (!userMenuDropdown.contains(event.target) && !userMenuTrigger.contains(event.target)) {
    closeUserMenu();
  }
});

workspaceGroupToggle.addEventListener("click", () => {
  const expanded = workspaceGroupLinks.classList.contains("is-closed");
  toggleGroup(workspaceGroupLinks, workspaceGroupChevron, expanded);
  workspaceGroupToggle.setAttribute("aria-expanded", String(expanded));
});

if (managementGroupToggle && managementGroupLinks && managementGroupChevron) {
  managementGroupToggle.addEventListener("click", () => {
    const expanded = managementGroupLinks.classList.contains("is-closed");
    toggleGroup(managementGroupLinks, managementGroupChevron, expanded);
    managementGroupToggle.setAttribute("aria-expanded", String(expanded));
  });
}

sectionButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const target = button.getAttribute("data-section-target");
    if (target) {
      if (target === "settings") {
        openActorProfile();
        return;
      }
      if (target === "register") {
        resetEmployeeForm();
        openEmployeeModal();
        return;
      }
      setActiveSection(target);
    }
  });
});

employeeForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!isHrRole()) {
    setMessage(employeeMessage, "Only the HR Recruitment Officer can update employee records.", true);
    return;
  }

  const payload = {
    firstName: employeeForm.firstName.value.trim(),
    lastName: employeeForm.lastName.value.trim(),
    email: employeeForm.email.value.trim().toLowerCase(),
    phoneNumber: employeeForm.phoneNumber.value.trim() || null,
    roleId: employeeForm.roleId.value ? Number(employeeForm.roleId.value) : null,
    employeeCode: employeeForm.employeeCode.value.trim() || null,
    hrmsEmployeeId: employeeForm.hrmsEmployeeId.value.trim() || null,
    jobTitle: employeeForm.jobTitle.value.trim() || null,
    employmentStatus: state.editingEmployeeId ? employeeForm.status.value || "active" : "active",
    officeLocation: employeeForm.officeLocation.value.trim() || null,
    departmentName: employeeForm.departmentName.value.trim() || null,
    startDate: employeeForm.startDate.value || null,
    status: state.editingEmployeeId ? employeeForm.status.value || "active" : "active",
  };

  if (!payload.roleId) {
    setMessage(employeeMessage, "Please select the IMS role this employee should use.", true);
    return;
  }

  const url = state.editingEmployeeId ? `/api/employees/${state.editingEmployeeId}` : "/api/employees";
  const method = state.editingEmployeeId ? "PUT" : "POST";

  try {
    const response = await requestJson(url, {
      method,
      body: JSON.stringify(payload),
    });

    const successMessage =
      response.message || (state.editingEmployeeId ? "Employee updated successfully." : "Employee created successfully.");
    setMessage(employeeMessage, successMessage);
    if (!state.editingEmployeeId) {
      if (response.employee) {
        fillEmployeeForm(response.employee);
      }
      if (response.credentials) {
        showEmployeeCredentials(response.credentials);
      }
    } else {
      clearEmployeeCredentials();
      closeEmployeeModal();
    }
    await loadDashboard();
    await loadEmployees();
  } catch (error) {
    setMessage(employeeMessage, error.message, true);
  }
});

settingsProfileForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setInlineMessage(settingsProfileSuccess, "", "");
  setInlineMessage(settingsProfileError, "", "");
  settingsProfileSubmit?.setAttribute("disabled", "disabled");

  try {
    const response = await requestJson("/api/account/profile", {
      method: "POST",
      body: JSON.stringify({
        firstName: settingsFirstName?.value.trim() || "",
        lastName: settingsLastName?.value.trim() || "",
        email: settingsEmail?.value.trim().toLowerCase() || "",
        phoneNumber: settingsPhoneNumber?.value.trim() || null,
      }),
    });

    if (response.user) {
      state.actor = response.user;
    }
    if (response.token) {
      state.token = response.token;
      persistSession();
    }

    hydrateActorView();
    setActiveSection("settings");
    setInlineMessage(settingsProfileSuccess, response.message || "Profile updated successfully.", "success");
  } catch (error) {
    setInlineMessage(settingsProfileError, error.message, "error");
  } finally {
    settingsProfileSubmit?.removeAttribute("disabled");
  }
});

settingsPasswordForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setInlineMessage(settingsPasswordSuccess, "", "");
  setInlineMessage(settingsPasswordError, "", "");

  const currentPassword = settingsPasswordForm.currentPassword?.value || "";
  const newPassword = settingsPasswordForm.newPassword?.value || "";
  const confirmPassword = settingsPasswordForm.confirmPassword?.value || "";

  if (newPassword !== confirmPassword) {
    setInlineMessage(settingsPasswordError, "New password and confirmation do not match.", "error");
    return;
  }

  settingsPasswordSubmit?.setAttribute("disabled", "disabled");

  try {
    const response = await requestJson("/api/account/password", {
      method: "POST",
      body: JSON.stringify({
        currentPassword,
        newPassword,
      }),
    });

    settingsPasswordForm.reset();
    setInlineMessage(settingsPasswordSuccess, response.message || "Password updated successfully.", "success");
  } catch (error) {
    setInlineMessage(settingsPasswordError, error.message, "error");
  } finally {
    settingsPasswordSubmit?.removeAttribute("disabled");
  }
});

employeeSearch.addEventListener("input", () => {
  state.employeePage = 1;
  renderEmployees();
});
employeeFilter.addEventListener("change", () => {
  state.employeePage = 1;
  renderEmployees();
});

employeePagePrevButton?.addEventListener("click", () => {
  if (state.employeePage <= 1) {
    return;
  }
  state.employeePage -= 1;
  renderEmployees();
});

employeePageNextButton?.addEventListener("click", () => {
  const totalPages = Math.max(1, Math.ceil(getFilteredEmployees().length / state.employeesPerPage));
  if (state.employeePage >= totalPages) {
    return;
  }
  state.employeePage += 1;
  renderEmployees();
});

refreshButton.addEventListener("click", async () => {
  try {
    await loadDashboard();
    await loadEmployees();
  } catch (error) {
    setMessage(employeeMessage, error.message, true);
  }
});

createEmployeeButton?.addEventListener("click", () => {
  resetEmployeeForm();
  openEmployeeModal();
});

cancelEditButton.addEventListener("click", resetEmployeeForm);
employeeModalCloseButtons.forEach((button) => {
  button.addEventListener("click", resetEmployeeForm);
});

employeeModalOverlay?.addEventListener("click", (event) => {
  if (event.target === employeeModalOverlay) {
    resetEmployeeForm();
  }
});

employeeList.addEventListener("click", async (event) => {
  const editButton = event.target.closest("[data-edit-id]");
  const statusButton = event.target.closest("[data-status-id]");
  const resendButton = event.target.closest("[data-resend-id]");

  if (!editButton) {
    if (statusButton) {
      const employeeIdToUpdate = Number(statusButton.getAttribute("data-status-id"));
      const nextStatus = String(statusButton.getAttribute("data-status-value") || "").trim().toLowerCase();

      if (!employeeIdToUpdate || !["active", "inactive"].includes(nextStatus)) {
        return;
      }

      try {
        const data = await requestJson(`/api/employees/${employeeIdToUpdate}`);
        const employee = data.employee;

        if (!employee) {
          throw new Error("Employee not found.");
        }

        const response = await requestJson(`/api/employees/${employeeIdToUpdate}`, {
          method: "PUT",
          body: JSON.stringify({
            firstName: employee.first_name || "",
            lastName: employee.last_name || "",
            email: employee.email || "",
            phoneNumber: employee.phone_number || null,
            roleId: employee.ims_role_id || null,
            employeeCode: employee.employee_code || null,
            hrmsEmployeeId: employee.hrms_employee_id || null,
            employeeGrade: employee.employee_grade || null,
            jobTitle: employee.job_title || null,
            employmentStatus: nextStatus,
            officeLocation: employee.office_location || null,
            departmentId: employee.department_id || null,
            departmentName: employee.department_name || null,
            startDate: employee.start_date ? String(employee.start_date).slice(0, 10) : null,
            imsUserId: employee.linked_user_id || null,
            imsAccountStatus: employee.ims_account_status || null,
            status: nextStatus,
          }),
        });

        setMessage(employeeMessage, response.message || `Employee ${nextStatus === "active" ? "activated" : "deactivated"} successfully.`);
        await loadDashboard();
        await loadEmployees();
      } catch (error) {
        setMessage(employeeMessage, error.message, true);
      }

      return;
    }

    if (!resendButton) {
      return;
    }

    const employeeIdToResend = Number(resendButton.getAttribute("data-resend-id"));

    if (!employeeIdToResend) {
      return;
    }

    try {
      const response = await requestJson(`/api/employees/${employeeIdToResend}/resend-credentials`, {
        method: "POST",
      });

      await loadEmployees();
      setMessage(employeeMessage, response.message || "Login credentials email sent.");
    } catch (error) {
      setMessage(employeeMessage, error.message, true);
    }

    return;
  }

  const employeeId = editButton.getAttribute("data-edit-id");
  if (!employeeId) {
    return;
  }

  try {
    const data = await requestJson(`/api/employees/${employeeId}`);
    if (data.employee) {
      fillEmployeeForm(data.employee);
    }
  } catch (error) {
    setMessage(employeeMessage, error.message, true);
  }
});

overviewGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-overview-section]");
  if (!button) {
    return;
  }

  const section = button.getAttribute("data-overview-section") || "directory";
  const filter = button.getAttribute("data-overview-filter") || "all";
  employeeFilter.value = filter;
  setActiveSection(section);
  renderEmployees();
});

overviewInsights.addEventListener("click", (event) => {
  const button = event.target.closest("[data-overview-select]");
  if (!button) {
    return;
  }

  const employeeId = Number(button.getAttribute("data-overview-select"));
  if (!employeeId) {
    return;
  }

  state.selectedEmployeeId = employeeId;
  renderEmployees();
  setActiveSection("directory");
});

window.addEventListener("resize", () => {
  if (window.innerWidth > 980) {
    setSidebarOpen(false);
  }

  if (window.innerWidth <= 980 && isSidebarCollapsed) {
    setSidebarCollapsed(false);
  }
});

["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"].forEach((eventName) => {
  window.addEventListener(eventName, handleActivity, { passive: true });
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}

applyIcons();
setGroupState("workspace", true);
setGroupState("management", true);
setActiveSection("overview");
renderRoleOptions("");
void restoreSession();
