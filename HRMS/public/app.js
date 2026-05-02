const SESSION_STORAGE_KEY = "airtel_hrms_session";

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
const cancelEditButton = document.querySelector("#cancel-edit");
const employeeFormTitle = document.querySelector("#employee-form-title");
const employeeMessage = document.querySelector("#employee-message");
const topbarTitle = document.querySelector("#topbar-title");
const actorName = document.querySelector("#sidebar-actor-name");
const actorRole = document.querySelector("#sidebar-actor-role");
const dashboardChipLabel = document.querySelector("#dashboard-chip-label");
const dashboardBreadcrumbCurrent = document.querySelector("#dashboard-breadcrumb-current");
const overviewCopy = document.querySelector("#overview-copy");
const sidebarRegisterLink = document.querySelector("#sidebar-register-link");
const sidebarManagementGroup = document.querySelector("#sidebar-management-group");
const mastheadAvatar = document.querySelector("#masthead-avatar");
const userMenuTrigger = document.querySelector("#user-menu-trigger");
const userMenuDropdown = document.querySelector("#user-menu-dropdown");
const userMenuProfile = document.querySelector("#user-menu-profile");
const userMenuLogout = document.querySelector("#user-menu-logout");
const profilePanel = document.querySelector("#profile-panel");
const profilePanelClose = document.querySelector("#profile-panel-close");
const profilePanelContent = document.querySelector("#profile-panel-content");
const inspectorEmpty = document.querySelector("#employee-inspector-empty");
const inspectorContent = document.querySelector("#employee-inspector");
const inspectorName = document.querySelector("#inspector-name");
const inspectorSubtitle = document.querySelector("#inspector-subtitle");
const inspectorStatus = document.querySelector("#inspector-status");
const inspectorDetails = document.querySelector("#inspector-details");
const inspectorDevice = document.querySelector("#inspector-device");
const inspectorReason = document.querySelector("#inspector-reason");
const inspectorNextStep = document.querySelector("#inspector-next-step");
const directoryCountPill = document.querySelector("#directory-count-pill");
const overviewGrid = document.querySelector("#overview-grid");
const overviewInsights = document.querySelector("#overview-insights");
const sectionButtons = Array.from(document.querySelectorAll("[data-section-target]"));
const sectionViews = {
  overview: document.querySelector("#section-overview"),
  directory: document.querySelector("#section-directory"),
  inspector: document.querySelector("#section-inspector"),
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
  inspector: "workspace",
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
  editingEmployeeId: null,
  selectedEmployeeId: null,
  lastStats: null,
  recentEmployees: [],
  activeSection: "overview",
};

let isSidebarCollapsed = false;

const sectionMeta = {
  overview: {
    title: "Dashboard",
    subtitleHr: "Manage employee source records section by section before they flow into IMS.",
    subtitleIt: "Review employee device readiness section by section before assigning equipment in IMS.",
    breadcrumb: "Overview",
  },
  directory: {
    title: "Users",
    subtitleHr: "Review employee records available for HRMS and IMS processing.",
    subtitleIt: "Search registered employees and confirm their current profile details.",
    breadcrumb: "Users",
  },
  inspector: {
    title: "Employee Inspector",
    subtitleHr: "Inspect employee profiles, IMS readiness, and recommended device fit before handoff.",
    subtitleIt: "Inspect the employee profile and recommendation before using IMS.",
    breadcrumb: "Inspector",
  },
  register: {
    title: "Employee Settings",
    subtitleHr: "Register and maintain employee records that will be used by IMS.",
    subtitleIt: "This section is limited to HR Recruitment Officer access.",
    breadcrumb: "Employee Settings",
  },
};

const iconMap = {
  dashboard:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 13h8V3H3z"/><path d="M13 21h8v-6h-8z"/><path d="M13 3h8v8h-8z"/><path d="M3 21h8v-4H3z"/></svg>',
  users:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  search:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>',
  plus:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14"/><path d="M5 12h14"/></svg>',
  settings:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3a2 2 0 0 1 2 2v1.1a7.9 7.9 0 0 1 1.9.8l.8-.8a2 2 0 1 1 2.8 2.8l-.8.8a7.9 7.9 0 0 1 .8 1.9H21a2 2 0 1 1 0 4h-1.1a7.9 7.9 0 0 1-.8 1.9l.8.8a2 2 0 1 1-2.8 2.8l-.8-.8a7.9 7.9 0 0 1-1.9.8V21a2 2 0 1 1-4 0v-1.1a7.9 7.9 0 0 1-1.9-.8l-.8.8a2 2 0 1 1-2.8-2.8l.8-.8a7.9 7.9 0 0 1-.8-1.9H3a2 2 0 1 1 0-4h1.1a7.9 7.9 0 0 1 .8-1.9l-.8-.8A2 2 0 1 1 6.9 5.4l.8.8a7.9 7.9 0 0 1 1.9-.8V5a2 2 0 0 1 2-2Z"/><circle cx="12" cy="12" r="3"/></svg>',
  total:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>',
  active:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 12 2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg>',
  pending:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>',
  linked:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
  departments:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/></svg>',
  approvals:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10Zm-1-6l-3.5-3.5 1.42-1.42L11 13.17l4.58-4.58 1.42 1.42L11 16Z"/></svg>',
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
}

function closeUserMenu() {
  userMenuDropdown.classList.add("hidden");
}

function toggleUserMenu() {
  userMenuDropdown.classList.toggle("hidden");
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

function getInitials(firstName, lastName) {
  return [firstName, lastName]
    .filter(Boolean)
    .map((part) => part.trim()[0]?.toUpperCase())
    .join("")
    .slice(0, 2) || "HR";
}

function setMessage(target, message, isError = false) {
  target.textContent = message;
  target.style.color = isError ? "#b1131a" : "#587287";
}

function applyIcons() {
  document.querySelectorAll("[data-icon]").forEach((node) => {
    node.innerHTML = iconMap[node.getAttribute("data-icon")] || "";
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
  linksNode.classList.toggle("is-open", expanded);
  linksNode.classList.toggle("is-closed", !expanded);
  chevronNode.classList.toggle("is-open", expanded);
}

function setGroupState(groupName, expanded) {
  const group = groupControls[groupName];
  if (!group) {
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
  overviewCopy.textContent = isItRole() ? meta.subtitleIt : meta.subtitleHr;
  dashboardChipLabel.textContent = isItRole() ? "IT Support" : "HR Recruitment Officer";
  dashboardBreadcrumbCurrent.textContent = meta.breadcrumb;
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

function formatDate(value) {
  if (!value) {
    return "Not provided";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString();
}

function createDetailCard(label, value) {
  return `
    <article class="detail-card">
      <span>${label}</span>
      <strong>${value || "Not provided"}</strong>
    </article>
  `;
}

function showAuthView() {
  authShell.classList.remove("hidden");
  dashboardShell.classList.add("hidden");
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
      key: "total",
      title: "Total Employees",
      value: Number(stats.totalEmployees || 0),
      note: "Source records currently managed in HRMS and prepared for IMS sync.",
      action: "Open directory",
      section: "directory",
      filter: "all",
      featured: true,
    },
    {
      key: "active",
      title: "Active Employees",
      value: Number(stats.activeEmployees || 0),
      note: "Profiles ready for onboarding and normal lifecycle support.",
      action: "View active employees",
      section: "directory",
      filter: "active",
    },
    {
      key: "pending",
      title: "Pending Profiles",
      value: Number(stats.pendingEmployees || 0),
      note: "Records that still need HR completion before they are fully ready.",
      action: "Review pending profiles",
      section: "directory",
      filter: "pending",
    },
    {
      key: "settings",
      title: "Inactive Profiles",
      value: inactiveEmployees,
      note: "Employees marked inactive and kept for historical tracking.",
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
            <span class="metric-card-icon">${iconMap[card.key] || ""}</span>
          </div>
          <strong>${card.value}</strong>
          <p>${card.note}</p>
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
          <p class="eyebrow">Sync Health</p>
          <h3>IMS readiness summary</h3>
        </div>
      </div>
      <div class="overview-stat-strip">
        <article class="overview-stat-card">
          <span>Linked to IMS</span>
          <strong>${Number(stats.linkedToIms || 0)}</strong>
          <small>${syncCoverage}% of HRMS records</small>
        </article>
        <article class="overview-stat-card">
          <span>Departments covered</span>
          <strong>${Number(stats.departments || 0)}</strong>
          <small>Across the current employee directory</small>
        </article>
      </div>
      <p class="status-text">Use the employee directory to inspect profiles, then keep registration details current before IMS assignment workflows begin.</p>
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
  sidebarManagementGroup.classList.toggle("hidden", !hrView);
  sidebarRegisterLink.classList.toggle("hidden", !hrView);
  if (!hrView && state.activeSection === "register") {
    setActiveSection("overview");
  }
  inspectorNextStep.textContent = "IMS can retrieve this employee during equipment requests.";
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

function renderInspector() {
  const employee = state.employees.find((item) => item.id === state.selectedEmployeeId);
  if (!employee) {
    inspectorEmpty.classList.remove("hidden");
    inspectorContent.classList.add("hidden");
    return;
  }

  inspectorEmpty.classList.add("hidden");
  inspectorContent.classList.remove("hidden");
  inspectorName.textContent = employee.full_name;
  inspectorSubtitle.textContent = `${employee.job_title || "No job title"} | ${employee.email || "No email"}`;
  inspectorStatus.textContent = employee.status || "active";
  inspectorDevice.textContent = employee.recommended_device_profile || "Standard office laptop";
  inspectorReason.textContent = employee.recommended_device_reason || "Recommendation is based on employee role and working profile.";
  inspectorDetails.innerHTML = [
    createDetailCard("Employee code", employee.employee_code),
    createDetailCard("HRMS employee ID", employee.hrms_employee_id),
    createDetailCard("Department", employee.department_name),
    createDetailCard("Employment status", employee.employment_status),
    createDetailCard("Office location", employee.office_location),
    createDetailCard("Phone number", employee.phone_number),
    createDetailCard("Start date", formatDate(employee.start_date)),
    createDetailCard("IMS status", employee.ims_account_status || "Linked to IMS"),
  ].join("");
}

function renderEmployees() {
  const filtered = getFilteredEmployees();
  directoryCountPill.textContent = `${filtered.length} employee${filtered.length === 1 ? "" : "s"} loaded`;

  if (filtered.length === 0) {
    employeeList.innerHTML = `
      <article class="employee-card">
        <h4>No employees found</h4>
        <p class="employee-card-footer">Try another filter, another search term, or refresh the employee directory.</p>
      </article>
    `;
    return;
  }

  employeeList.innerHTML = filtered
    .map((employee) => {
      const selectedClass = employee.id === state.selectedEmployeeId ? " active" : "";
      const managementAction = isHrRole()
        ? `<button class="secondary-btn compact-btn" type="button" data-edit-id="${employee.id}">Edit</button><button class="secondary-btn compact-btn ${employee.status === "inactive" ? "" : "danger-btn"}" type="button" data-status-id="${employee.id}" data-status-value="${employee.status === "inactive" ? "active" : "inactive"}">${employee.status === "inactive" ? "Reactivate" : "Set inactive"}</button><button class="secondary-btn compact-btn danger-btn" type="button" data-delete-id="${employee.id}">Delete</button>`
        : "";

      return `
        <article class="employee-card${selectedClass}">
          <div class="employee-card-header">
            <div>
              <h4>${employee.full_name}</h4>
              <p class="employee-card-footer">${employee.email}</p>
            </div>
            <div class="employee-card-actions">
              <button class="primary-btn compact-btn" type="button" data-select-id="${employee.id}">Inspect</button>
              ${managementAction}
            </div>
          </div>
          <div class="employee-card-tags">
            <span>${employee.employee_code || "No code"}</span>
            <span>${employee.department_name || "No department"}</span>
            <span>${employee.status || "No account status"}</span>
            <span>${employee.ims_account_status || "Linked to IMS"}</span>
          </div>
          <p class="employee-card-footer">
            ${employee.job_title || "No job title"} | ${employee.office_location || "No office location"} | ${employee.recommended_device_profile || "Standard office laptop"}
          </p>
        </article>
      `;
    })
    .join("");
}

function resetEmployeeForm() {
  state.editingEmployeeId = null;
  employeeForm.reset();
  employeeForm.status.value = "active";
  employeeFormTitle.textContent = "Register employee";
  cancelEditButton.classList.add("hidden");
  setMessage(employeeMessage, "The HR Recruitment Officer can register and update employee source records here.");
}

function fillEmployeeForm(employee) {
  state.editingEmployeeId = employee.id;
  employeeForm.firstName.value = employee.first_name || "";
  employeeForm.lastName.value = employee.last_name || "";
  employeeForm.email.value = employee.email || "";
  employeeForm.phoneNumber.value = employee.phone_number || "";
  employeeForm.employeeCode.value = employee.employee_code || "";
  employeeForm.hrmsEmployeeId.value = employee.hrms_employee_id || "";
  employeeForm.jobTitle.value = employee.job_title || "";
  employeeForm.officeLocation.value = employee.office_location || "";
  employeeForm.departmentName.value = employee.department_name || "";
  employeeForm.startDate.value = employee.start_date ? String(employee.start_date).slice(0, 10) : "";
  employeeForm.status.value = employee.status || employee.employment_status || "active";
  employeeFormTitle.textContent = `Edit ${employee.full_name}`;
  cancelEditButton.classList.remove("hidden");
  setMessage(employeeMessage, "Update the HRMS source record here. IMS will consume the change through API sync.");
  setActiveSection("register");
}

function hydrateActorView() {
  const fullName = state.actor?.fullName || `${state.actor?.firstName || ""} ${state.actor?.lastName || ""}`.trim() || "User";
  const roleName = state.actor?.role || "hrms user";
  actorName.textContent = fullName;
  actorRole.textContent = roleName.toLowerCase();
  mastheadAvatar.textContent = getInitials(state.actor?.firstName, state.actor?.lastName);
  applyRoleView();
  showDashboardView();
  applyIcons();
  updateSectionMeta();
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
  if (!state.selectedEmployeeId && state.employees.length > 0) {
    state.selectedEmployeeId = state.employees[0].id;
  }
  renderEmployees();
  renderInspector();
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
    await loadDashboard();
    await loadEmployees();
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
    hydrateActorView();
    setMessage(loginHint, `Signed in as ${state.actor.firstName} ${state.actor.lastName}.`);
    await loadDashboard();
    await loadEmployees();
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

userMenuProfile.addEventListener("click", async () => {
  closeUserMenu();
  try {
    const data = await requestJson("/api/auth/session", { method: "GET" });
    openProfilePanel(data.user || {});
  } catch (error) {
    setMessage(loginHint, error.message, true);
  }
});

userMenuLogout.addEventListener("click", async () => {
  closeUserMenu();
  await closeHrmsSession();
  clearSession();
  resetEmployeeForm();
  closeProfilePanel();
  showAuthView();
});

profilePanelClose.addEventListener("click", () => {
  closeProfilePanel();
});

window.addEventListener("click", (event) => {
  if (!userMenuDropdown.contains(event.target) && event.target !== userMenuTrigger) {
    closeUserMenu();
  }
});

workspaceGroupToggle.addEventListener("click", () => {
  const expanded = workspaceGroupLinks.classList.contains("is-closed");
  toggleGroup(workspaceGroupLinks, workspaceGroupChevron, expanded);
  workspaceGroupToggle.setAttribute("aria-expanded", String(expanded));
});

managementGroupToggle.addEventListener("click", () => {
  const expanded = managementGroupLinks.classList.contains("is-closed");
  toggleGroup(managementGroupLinks, managementGroupChevron, expanded);
  managementGroupToggle.setAttribute("aria-expanded", String(expanded));
});

sectionButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const target = button.getAttribute("data-section-target");
    if (target) {
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
    email: employeeForm.email.value.trim(),
    phoneNumber: employeeForm.phoneNumber.value.trim() || null,
    employeeCode: employeeForm.employeeCode.value.trim() || null,
    hrmsEmployeeId: employeeForm.hrmsEmployeeId.value.trim() || null,
    jobTitle: employeeForm.jobTitle.value.trim() || null,
    employmentStatus: employeeForm.status.value,
    officeLocation: employeeForm.officeLocation.value.trim() || null,
    departmentName: employeeForm.departmentName.value.trim() || null,
    startDate: employeeForm.startDate.value || null,
    status: employeeForm.status.value,
  };

  const url = state.editingEmployeeId ? `/api/employees/${state.editingEmployeeId}` : "/api/employees";
  const method = state.editingEmployeeId ? "PUT" : "POST";

  try {
    const response = await requestJson(url, {
      method,
      body: JSON.stringify(payload),
    });

    const successMessage =
      response.message || (state.editingEmployeeId ? "Employee updated successfully." : "Employee created successfully.");
    resetEmployeeForm();
    setMessage(employeeMessage, successMessage);
    await loadDashboard();
    await loadEmployees();
  } catch (error) {
    setMessage(employeeMessage, error.message, true);
  }
});

employeeSearch.addEventListener("input", renderEmployees);
employeeFilter.addEventListener("change", renderEmployees);

refreshButton.addEventListener("click", async () => {
  try {
    await loadDashboard();
    await loadEmployees();
  } catch (error) {
    setMessage(employeeMessage, error.message, true);
  }
});

cancelEditButton.addEventListener("click", resetEmployeeForm);

employeeList.addEventListener("click", async (event) => {
  const selectButton = event.target.closest("[data-select-id]");
  const editButton = event.target.closest("[data-edit-id]");
  const statusButton = event.target.closest("[data-status-id]");
  const deleteButton = event.target.closest("[data-delete-id]");

  if (selectButton) {
    state.selectedEmployeeId = Number(selectButton.getAttribute("data-select-id"));
    renderEmployees();
    renderInspector();
    setActiveSection("inspector");
    return;
  }

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

        setMessage(employeeMessage, response.message || `Employee marked ${nextStatus}.`);
        await loadDashboard();
        await loadEmployees();
      } catch (error) {
        setMessage(employeeMessage, error.message, true);
      }

      return;
    }

    if (!deleteButton) {
      return;
    }

    const employeeIdToDelete = Number(deleteButton.getAttribute("data-delete-id"));

    if (!employeeIdToDelete || !window.confirm("Delete this employee from HRMS?")) {
      return;
    }

    try {
      const response = await requestJson(`/api/employees/${employeeIdToDelete}`, {
        method: "DELETE",
      });

      if (state.selectedEmployeeId === employeeIdToDelete) {
        state.selectedEmployeeId = null;
      }

      resetEmployeeForm();
      setMessage(employeeMessage, response.message || "Employee deleted successfully.");
      await loadDashboard();
      await loadEmployees();
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
  renderInspector();
  setActiveSection("inspector");
});

window.addEventListener("resize", () => {
  if (window.innerWidth > 980) {
    setSidebarOpen(false);
  }

  if (window.innerWidth <= 980 && isSidebarCollapsed) {
    setSidebarCollapsed(false);
  }
});

applyIcons();
setGroupState("workspace", true);
setGroupState("management", true);
setActiveSection("overview");
void restoreSession();
