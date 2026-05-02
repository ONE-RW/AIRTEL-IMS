import { FormEvent, useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Building2,
  ChevronDown,
  ClipboardCheck,
  Download,
  FileChartColumn,
  Globe2,
  LayoutDashboard,
  ShieldCheck,
  UserCog,
  UserPlus,
  Users,
} from "lucide-react";
import AccountSettingsPanel from "../components/AccountSettingsPanel";
import AirtelLogo from "../components/AirtelLogo";
import DashboardWaveLoader from "../components/DashboardWaveLoader";
import DashboardToast from "../components/DashboardToast";
import OverviewShortcutCard from "../components/OverviewShortcutCard";
import { DonutChart, HorizontalBarChart } from "../components/RoleCharts";
import UserMenu from "../components/UserMenu";
import { fetchJson, getApiMessage } from "../api";
import { API_BASE_URL } from "../config";
import type { AdminUser, LoggedInUser, Lookups } from "../types";

type SidebarLink = {
  label: string;
  href: string;
  icon: LucideIcon;
};

type SidebarGroup = {
  title: string;
  icon: LucideIcon;
  links: SidebarLink[];
};

type HRDirectorDashboardProps = {
  user: LoggedInUser;
  onLogout: () => void;
  onUserUpdate: (user: LoggedInUser) => void;
};

type WorkflowStep = {
  id: number;
  step_key: string;
  step_label: string;
  actor_role: string;
  action_status: "pending" | "approved" | "rejected" | "fulfilled" | "returned";
  action_note: string | null;
  acted_at: string | null;
  actor_name: string | null;
};

type WorkflowRequestRow = {
  id: number;
  requester_id: number;
  request_status: "pending" | "approved" | "rejected" | "fulfilled";
  request_type?: "standard" | "new_hire" | "replacement" | "loss_theft";
  fulfillment_status: "ready" | "waiting_stock" | "backordered" | "on_hold" | "fulfilled";
  fulfillment_note?: string | null;
  clarification_status?: "none" | "needed";
  clarification_note?: string | null;
  notes: string | null;
  created_at: string;
  requested_at: string;
  requester_name: string;
  requester_email: string;
  requester_department_name: string | null;
  requester_job_title: string | null;
  requester_employment_status?: string | null;
  requester_office_location?: string | null;
  category_name: string;
  branch_name?: string | null;
  approver_name: string | null;
  workflowSteps: WorkflowStep[];
  currentStageKey: string;
  currentStageLabel: string;
};

type ReturnRow = {
  id: number;
  assignment_id: number;
  equipment_id: number;
  employee_user_id: number;
  return_reason?: "standard" | "leaving_job" | null;
  request_note: string | null;
  it_review_note: string | null;
  intake_note: string | null;
  received_condition_comment?: string | null;
  condition_status: string | null;
  disposition: string | null;
  return_status: "it_review" | "store_intake" | "awaiting_final_approval" | "returned_to_employee" | "requested" | "completed" | "rejected" | "maintenance";
  final_hrd_approval_status?: "pending" | "approved" | "rejected";
  final_hrd_approved_at?: string | null;
  final_itd_approval_status?: "pending" | "approved" | "rejected";
  final_itd_approved_at?: string | null;
  requested_at: string;
  returned_at?: string | null;
  asset_tag: string;
  equipment_name: string;
  employee_name: string;
  employee_email: string;
  employee_job_title?: string | null;
  employee_employment_status?: string | null;
  employee_office_location?: string | null;
  received_by_name?: string | null;
  it_manager_name?: string | null;
  storekeeper_name?: string | null;
};

type WorkflowReportCount = {
  label: string;
  total: number;
};

type WorkflowDashboardData = {
  requests: WorkflowRequestRow[];
  returns: ReturnRow[];
  reports: {
    requestStatus: WorkflowReportCount[];
  };
};

const sidebarGroups: SidebarGroup[] = [
  {
    title: "HR Director",
    icon: LayoutDashboard,
    links: [
      { label: "Overview", href: "#overview", icon: ClipboardCheck },
      { label: "Approvals", href: "#approvals", icon: ShieldCheck },
      { label: "Returns", href: "#returns", icon: ClipboardCheck },
      { label: "Reports", href: "#reports", icon: FileChartColumn },
    ],
  },
  {
    title: "Profile",
    icon: UserCog,
    links: [{ label: "Settings", href: "#settings", icon: UserCog }],
  },
];

const emptyLookups: Lookups = {
  roles: [],
  permissions: [],
  countries: [],
  branches: [],
  departments: [],
};

const employmentStatusOptions = [
  "Permanent",
  "Contract",
  "Probation",
  "Intern",
  "Consultant",
  "Retired",
];

const DEFAULT_ITEMS_PER_PAGE = 6;
const PAGE_SIZE_OPTIONS = [6, 12, 18];

function HRDirectorDashboard({ user, onLogout, onUserUpdate }: HRDirectorDashboardProps) {
  const [activeSection, setActiveSection] = useState("overview");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    "HR Director": true,
    Profile: true,
  });
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [lookups, setLookups] = useState<Lookups>(emptyLookups);
  const [workflowData, setWorkflowData] = useState<WorkflowDashboardData | null>(null);
  const [isDashboardLoading, setIsDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [isUserFormOpen, setIsUserFormOpen] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [userStatusFilter, setUserStatusFilter] = useState("all");
  const [approvalNotes, setApprovalNotes] = useState<Record<number, string>>({});
  const [pendingRequestActionId, setPendingRequestActionId] = useState<number | null>(null);
  const [pendingReturnActionId, setPendingReturnActionId] = useState<number | null>(null);
  const [finalReturnApprovalForm, setFinalReturnApprovalForm] = useState<Record<number, { decision: "approve" | "reject"; note: string }>>({});
  const [selectedReportKey, setSelectedReportKey] = useState("");
  const [pageByKey, setPageByKey] = useState<Record<string, number>>({});
  const [pageSizeByKey, setPageSizeByKey] = useState<Record<string, number>>({});

  const [userForm, setUserForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phoneNumber: "",
    roleId: "",
    employeeCode: "",
    jobTitle: "",
    employmentStatus: "",
    officeLocation: "",
    startDate: "",
    countryId: "",
    hqId: "",
    branchId: "",
    departmentId: "",
  });

  const loadHRWorkspace = async () => {
    setIsDashboardLoading(true);
    setDashboardError("");

    try {
      const [usersResult, lookupsResult, workflowResult] = await Promise.all([
        fetchJson<AdminUser[]>(`${API_BASE_URL}/admin/users?unitId=${user.unitId || ""}`),
        fetchJson<Lookups>(`${API_BASE_URL}/admin/lookups`),
        fetchJson<WorkflowDashboardData>(`${API_BASE_URL}/workflow/dashboard?userId=${user.id}`),
      ]);

      if (!usersResult.response.ok || !lookupsResult.response.ok || !workflowResult.response.ok) {
        throw new Error(
          getApiMessage(
            usersResult.data ?? lookupsResult.data ?? workflowResult.data,
            "Failed to load HR dashboard data.",
          ),
        );
      }

      const userRows = usersResult.data;
      const lookupData = lookupsResult.data;
      const workflowRows = workflowResult.data;

      if (!userRows || !lookupData || !workflowRows) {
        throw new Error("HR dashboard returned an incomplete response.");
      }

      setAdminUsers(userRows.filter((row) => row.id !== user.id));
      setLookups(lookupData);
      setWorkflowData(workflowRows);
    } catch (error) {
      setDashboardError(error instanceof Error ? error.message : "Dashboard load failed.");
    } finally {
      setIsDashboardLoading(false);
    }
  };

  useEffect(() => {
    void loadHRWorkspace();
  }, [user.id, user.unitId]);

  const paginateRows = <T,>(rows: T[], currentPage: number, pageSize: number) =>
    rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const renderPaginationBar = (
    pageKey: string,
    totalItems: number,
    currentPage: number,
    pageSize: number,
    onPageChange: (page: number) => void,
  ) => {
    const totalPages = Math.max(Math.ceil(totalItems / pageSize), 1);

    if (totalItems <= pageSize) {
      return null;
    }

    return (
      <div className="pagination-bar">
        <div className="pagination-meta">
          <label className="pagination-size-control">
            <span>Per page</span>
            <select
              className="pagination-size-select"
              value={pageSize}
              onChange={(event) => {
                const nextPageSize = Number(event.target.value);
                setPageSizeByKey((current) => ({
                  ...current,
                  [pageKey]: nextPageSize,
                }));
                onPageChange(1);
              }}
            >
              {PAGE_SIZE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <span className="pagination-summary">
            Showing {(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, totalItems)} of {totalItems}
          </span>
        </div>
        <div className="pagination-actions">
          <button
            className="pagination-button"
            type="button"
            onClick={() => onPageChange(Math.max(currentPage - 1, 1))}
            disabled={currentPage === 1}
          >
            Previous
          </button>
          {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
            <button
              key={`${pageKey}-${pageNumber}`}
              className={`pagination-button${pageNumber === currentPage ? " is-active" : ""}`}
              type="button"
              onClick={() => onPageChange(pageNumber)}
            >
              {pageNumber}
            </button>
          ))}
          <button
            className="pagination-button"
            type="button"
            onClick={() => onPageChange(Math.min(currentPage + 1, totalPages))}
            disabled={currentPage === totalPages}
          >
            Next
          </button>
        </div>
      </div>
    );
  };

  function isHeadquarterBranch(branchName: string) {
    return /\bHQ\b/i.test(branchName);
  }

  function getHeadquartersForCountry(countryId: string) {
    if (!countryId) {
      return lookups.branches.filter((branch) => isHeadquarterBranch(branch.name));
    }

    const countryBranches = lookups.branches.filter((branch) => branch.country_id === Number(countryId));
    const explicitHeadquarters = countryBranches.filter((branch) => isHeadquarterBranch(branch.name));
    return explicitHeadquarters.length > 0 ? explicitHeadquarters : countryBranches;
  }

  function getDefaultHqId(countryId: string) {
    if (!countryId) {
      return "";
    }

    return String(getHeadquartersForCountry(countryId)[0]?.id || "");
  }

  const filteredHeadquartersForUser = getHeadquartersForCountry(userForm.countryId);
  const filteredBranchesForUser = userForm.countryId
    ? lookups.branches.filter((branch) => branch.country_id === Number(userForm.countryId))
    : [];
  const filteredDepartmentsForUser = userForm.branchId
    ? lookups.departments.filter((department) => department.branch_id === Number(userForm.branchId))
    : [];
  const allowedRoleNames = useMemo(() => {
    const roleNames = new Set<string>();

    if (user.unitId) {
      roleNames.add(user.role);
    }

    adminUsers.forEach((account) => {
      roleNames.add(account.role_name);
    });

    return roleNames;
  }, [adminUsers, user.role, user.unitId]);
  const filteredRolesForUnit = useMemo(() => {
    if (!user.unitId || allowedRoleNames.size === 0) {
      return lookups.roles;
    }

    return lookups.roles.filter((role) => allowedRoleNames.has(role.name));
  }, [allowedRoleNames, lookups.roles, user.unitId]);

  const filteredUsers = useMemo(() => {
    const searchTerm = userSearch.trim().toLowerCase();

    return adminUsers.filter((account) => {
      const matchesSearch =
        !searchTerm ||
        account.full_name.toLowerCase().includes(searchTerm) ||
        account.email.toLowerCase().includes(searchTerm) ||
        account.role_name.toLowerCase().includes(searchTerm);

      const matchesStatus = userStatusFilter === "all" || account.status === userStatusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [adminUsers, userSearch, userStatusFilter]);

  const pendingWorkflowApprovals = useMemo(
    () =>
      (workflowData?.requests ?? []).filter(
        (request) => request.currentStageKey === "hrd_approval" && request.request_status === "pending",
      ),
    [workflowData],
  );
  const pendingFinalReturnApprovals = useMemo(
    () =>
      (workflowData?.returns ?? []).filter(
        (item) => item.return_status === "awaiting_final_approval" && item.final_hrd_approval_status !== "approved",
      ),
    [workflowData],
  );
  const completedWorkflowRequests = useMemo(
    () =>
      (workflowData?.requests ?? []).filter((request) =>
        ["approved", "fulfilled", "rejected"].includes(request.request_status),
      ),
    [workflowData],
  );
  const requestStatusCounts = workflowData?.reports.requestStatus ?? [];
  const reportCards = useMemo(
    () => [
      {
        key: "request-all",
        label: "all requests",
        total: workflowData?.requests.length || 0,
        status: "all",
      },
      ...requestStatusCounts.map((item) => ({
        key: `request-${item.label}`,
        label: item.label,
        total: item.total,
        status: item.label,
      })),
    ],
    [requestStatusCounts, workflowData?.requests.length],
  );
  const activeReport =
    reportCards.find((item) => item.key === selectedReportKey) ??
    reportCards[0] ??
    null;
  const filteredWorkflowReportRequests = useMemo(() => {
    const requests = workflowData?.requests ?? [];

    if (!activeReport || activeReport.status === "all") {
      return requests;
    }

    return requests.filter((request) => request.request_status === activeReport.status);
  }, [activeReport, workflowData]);

  const pendingUsersCount = adminUsers.filter((account) => account.status === "pending").length;
  const activeUsersCount = adminUsers.filter((account) => account.status === "active").length;

  const formatProfileDate = (value?: string | null) =>
    value ? new Date(value).toLocaleDateString() : "Not set";
  const normalizeWorkflowLabel = (label: string) =>
    label === "HR Device Booking" ? "Device Booking" : label;
  const formatReturnReason = (reason?: ReturnRow["return_reason"]) =>
    reason === "leaving_job" ? "Employee leaving organization" : "Standard return";

  const [exportFormat, setExportFormat] = useState<"html" | "csv" | "json" | "markdown">("html");
  const exportFormatOptions: { value: "html" | "csv" | "json" | "markdown"; label: string }[] = [
    { value: "html", label: "HTML (branded)" },
    { value: "csv", label: "CSV" },
    { value: "json", label: "JSON" },
    { value: "markdown", label: "Markdown" },
  ];

  const getExportFilename = (filename: string) => {
    const base = filename.replace(/\.html?$/i, "");
    const ext = exportFormat === "markdown" ? "md" : exportFormat;
    return `${base}.${ext}`;
  };

  const escapeCsvValue = (value: string | number | null | undefined) => {
    const text = String(value ?? "");
    if (/[",\n\r,]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

  const rowsToCsv = (rows: Array<Record<string, string | number>>) => {
    const headers = Object.keys(rows[0]);
    const headerLine = headers.map(escapeCsvValue).join(",");
    const bodyLines = rows.map((row) => headers.map((header) => escapeCsvValue(row[header])).join(","));
    return [headerLine, ...bodyLines].join("\r\n");
  };

  const rowsToMarkdown = (
    rows: Array<Record<string, string | number>>,
    title: string,
    subtitle: string,
  ) => {
    const headers = Object.keys(rows[0]);
    const titleRow = `# ${title.replace(/\|/g, "\\|")}`;
    const subtitleRow = `**${subtitle.replace(/\|/g, "\\|")}**\n\n`;
    const headerRow = `| ${headers.map((header) => header.replace(/_/g, " ")).join(" | ")} |`;
    const dividerRow = `| ${headers.map(() => "---").join(" | ")} |`;
    const bodyRows = rows
      .map((row) =>
        `| ${headers
          .map((header) => String(row[header] ?? "").replace(/\|/g, "\\|"))
          .join(" | ")} |`,
      )
      .join("\n");

    return `${titleRow}\n${subtitleRow}${headerRow}\n${dividerRow}\n${bodyRows}`;
  };

  const rowsToJson = (rows: Array<Record<string, string | number>>) =>
    JSON.stringify(
      {
        exportedFrom: "Airtel Inventory Management System",
        exportedAt: new Date().toISOString(),
        rows,
      },
      null,
      2,
    );

  const downloadBrandedDocument = (
    filename: string,
    title: string,
    subtitle: string,
    rows: Array<Record<string, string | number>>,
  ) => {
    if (rows.length === 0) {
      setActionError("There is no report data to export yet.");
      return;
    }

    const headers = Object.keys(rows[0]);
    const headerLabels = headers.map((header) => header.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()));
    const generatedOn = new Date().toLocaleString();
    const logoUrl = `${window.location.origin}/airtel-logo.png`;
    const escapeHtml = (value: string | number) =>
      String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    const htmlDocument = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: "Segoe UI", Arial, sans-serif; margin: 0; background: #f4f7fb; color: #17324d; }
    .page { max-width: 1200px; margin: 0 auto; padding: 32px; }
    .sheet { background: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 18px 45px rgba(23, 50, 77, 0.12); }
    .hero { padding: 28px 32px; background: linear-gradient(135deg, #ffffff 0%, #eef6fb 100%); border-bottom: 4px solid #d71920; display: flex; justify-content: space-between; gap: 20px; align-items: center; }
    .hero img { height: 46px; width: auto; display: block; }
    .eyebrow { margin: 0 0 8px; font-size: 12px; font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase; color: #d71920; }
    h1 { margin: 0; font-size: 28px; line-height: 1.2; }
    .subtitle { margin: 10px 0 0; font-size: 14px; color: #587287; }
    .meta { text-align: right; font-size: 13px; color: #587287; }
    .meta strong { display: block; color: #17324d; font-size: 14px; margin-bottom: 6px; }
    .table-wrap { padding: 22px 32px 32px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; background: #eef6fb; color: #17324d; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; padding: 14px 12px; border-bottom: 1px solid rgba(29, 111, 165, 0.16); }
    td { padding: 14px 12px; border-bottom: 1px solid rgba(29, 111, 165, 0.12); vertical-align: top; color: #20384d; }
    tr:nth-child(even) td { background: rgba(238, 246, 251, 0.36); }
    .footer { padding: 0 32px 28px; color: #587287; font-size: 12px; }
  </style>
</head>
<body>
  <div class="page">
    <div class="sheet">
      <div class="hero">
        <div>
          <p class="eyebrow">Airtel Inventory Management System</p>
          <h1>${escapeHtml(title)}</h1>
          <p class="subtitle">${escapeHtml(subtitle)}</p>
        </div>
        <div class="meta">
          <img src="${logoUrl}" alt="Airtel logo" />
          <strong>Professional Export</strong>
          <span>Generated: ${escapeHtml(generatedOn)}</span>
          <span>Total records: ${rows.length}</span>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr>${headerLabels.map((label) => `<th>${escapeHtml(label)}</th>`).join("")}</tr></thead>
          <tbody>
            ${rows
              .map((row) => `<tr>${headers.map((header) => `<td>${escapeHtml(row[header] ?? "") || "&nbsp;"}</td>`).join("")}</tr>`)
              .join("")}
          </tbody>
        </table>
      </div>
      <div class="footer">Generated from Airtel IMS HR Director workflow reporting.</div>
    </div>
  </div>
</body>
</html>`;

    let fileContent = htmlDocument;
    let mimeType = "text/html;charset=utf-8;";
    const exportFilename = getExportFilename(filename);

    if (exportFormat === "csv") {
      fileContent = rowsToCsv(rows);
      mimeType = "text/csv;charset=utf-8;";
    } else if (exportFormat === "json") {
      fileContent = rowsToJson(rows);
      mimeType = "application/json;charset=utf-8;";
    } else if (exportFormat === "markdown") {
      fileContent = rowsToMarkdown(rows, title, subtitle);
      mimeType = "text/markdown;charset=utf-8;";
    }

    const blob = new Blob([fileContent], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = exportFilename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const toastState = useMemo(() => {
    if (actionError) {
      return { message: actionError, type: "error" as const };
    }
    if (dashboardError) {
      return { message: dashboardError, type: "error" as const };
    }
    if (actionMessage) {
      return { message: actionMessage, type: "success" as const };
    }
    return null;
  }, [actionError, actionMessage, dashboardError]);

  useEffect(() => {
    if (!toastState) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setActionMessage("");
      setActionError("");
      setDashboardError("");
    }, 3200);

    return () => window.clearTimeout(timeout);
  }, [toastState]);

  const toggleSidebarGroup = (title: string) => {
    setExpandedGroups((current) => ({
      ...current,
      [title]: !current[title],
    }));
  };

  const handleSectionChange = (href: string) => {
    setActiveSection(href.replace("#", ""));
    if (window.innerWidth <= 980) {
      setIsSidebarOpen(false);
    }
  };

  const resetUserForm = () => {
    setUserForm({
      firstName: "",
      lastName: "",
      email: "",
      phoneNumber: "",
      roleId: "",
      employeeCode: "",
      jobTitle: "",
      employmentStatus: "",
      officeLocation: "",
      startDate: "",
      countryId: "",
      hqId: "",
      branchId: "",
      departmentId: "",
    });
    setIsUserFormOpen(false);
  };

  const handleCreateUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setActionMessage("");
    setActionError("");

    try {
      const { response, data } = await fetchJson<{ message?: string }>(`${API_BASE_URL}/admin/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...userForm,
          actorUserId: user.id,
          countryId: userForm.countryId || null,
          branchId: userForm.branchId || null,
          departmentId: userForm.departmentId || null,
        }),
      });

      if (!response.ok) {
        throw new Error(getApiMessage(data, "Failed to create user."));
      }

      setActionMessage(getApiMessage(data, "User created successfully and is waiting for approval."));
      resetUserForm();
      await loadHRWorkspace();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to create user.");
    }
  };

  const handleApproveRequest = async (requestId: number) => {
    setActionMessage("");
    setActionError("");
    setPendingRequestActionId(requestId);

    try {
      const { response, data } = await fetchJson<{ message?: string }>(`${API_BASE_URL}/requests/${requestId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actorUserId: user.id,
          note: approvalNotes[requestId] || null,
        }),
      });

      if (!response.ok) {
        throw new Error(getApiMessage(data, "Failed to approve request."));
      }

      setActionMessage(getApiMessage(data, "Workflow step approved."));
      setApprovalNotes((current) => ({ ...current, [requestId]: "" }));
      await loadHRWorkspace();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to approve request.");
    } finally {
      setPendingRequestActionId((current) => (current === requestId ? null : current));
    }
  };

  const handleRejectRequest = async (requestId: number) => {
    const rejectionReason = String(approvalNotes[requestId] || "").trim();

    if (!rejectionReason) {
      setActionError("Add a rejection reason before rejecting this request.");
      return;
    }

    setActionMessage("");
    setActionError("");
    setPendingRequestActionId(requestId);

    try {
      const { response, data } = await fetchJson<{ message?: string }>(`${API_BASE_URL}/requests/${requestId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actorUserId: user.id,
          note: rejectionReason,
        }),
      });

      if (!response.ok) {
        throw new Error(getApiMessage(data, "Failed to reject request."));
      }

      setActionMessage(getApiMessage(data, "Request rejected."));
      setApprovalNotes((current) => ({ ...current, [requestId]: "" }));
      await loadHRWorkspace();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to reject request.");
    } finally {
      setPendingRequestActionId((current) => (current === requestId ? null : current));
    }
  };

  const handleReturnRequestForClarification = async (requestId: number) => {
    const clarificationReason = String(approvalNotes[requestId] || "").trim();

    if (!clarificationReason) {
      setActionError("Add a clarification reason before returning this request.");
      return;
    }

    setActionMessage("");
    setActionError("");
    setPendingRequestActionId(requestId);

    try {
      const { response, data } = await fetchJson<{ message?: string }>(`${API_BASE_URL}/requests/${requestId}/return`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actorUserId: user.id,
          note: clarificationReason,
        }),
      });

      if (!response.ok) {
        throw new Error(getApiMessage(data, "Failed to return request for clarification."));
      }

      setActionMessage(getApiMessage(data, "Request returned for clarification."));
      setApprovalNotes((current) => ({ ...current, [requestId]: "" }));
      await loadHRWorkspace();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to return request for clarification.");
    } finally {
      setPendingRequestActionId((current) => (current === requestId ? null : current));
    }
  };

  const handleFinalReturnApproval = async (returnId: number) => {
    const form = finalReturnApprovalForm[returnId] ?? {
      decision: "approve" as const,
      note: "",
    };

    setActionMessage("");
    setActionError("");
    setPendingReturnActionId(returnId);

    try {
      const { response, data } = await fetchJson<{ message?: string }>(`${API_BASE_URL}/returns/${returnId}/final-approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actorUserId: user.id,
          decision: form.decision,
          note: form.note || null,
        }),
      });

      if (!response.ok) {
        throw new Error(getApiMessage(data, "Failed to process final return approval."));
      }

      setActionMessage(getApiMessage(data, form.decision === "reject" ? "Final return approval rejected." : "Final return approval recorded."));
      setFinalReturnApprovalForm((current) => ({
        ...current,
        [returnId]: {
          decision: "approve",
          note: "",
        },
      }));
      await loadHRWorkspace();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to process final return approval.");
    } finally {
      setPendingReturnActionId((current) => (current === returnId ? null : current));
    }
  };

  const renderOverviewSection = () => (
    (() => {
      const unitAccountStatusData = [
        { label: "Active", value: activeUsersCount },
        { label: "Pending", value: pendingUsersCount },
        { label: "Other", value: Math.max(adminUsers.length - activeUsersCount - pendingUsersCount, 0) },
      ];
      const workflowPressureData = [
        { label: "Pending approvals", value: pendingWorkflowApprovals.length },
        { label: "Return approvals", value: pendingFinalReturnApprovals.length },
        { label: "Completed requests", value: completedWorkflowRequests.length },
      ];

      return (
    <>
      <section className="dashboard-card-grid">
        <OverviewShortcutCard
          title="Unit Members"
          value={adminUsers.length}
          description="People visible inside this HR Director unit workspace."
          icon={Users}
          actionLabel="Open users"
          onClick={() => setActiveSection("users")}
          kicker="Workforce"
        />
        <OverviewShortcutCard
          title="Active Accounts"
          value={activeUsersCount}
          description="Users already active and available in the unit."
          icon={ShieldCheck}
          actionLabel="Review roster"
          onClick={() => setActiveSection("users")}
          kicker="Status"
        />
        <OverviewShortcutCard
          title="Pending Review"
          value={pendingUsersCount}
          description="Accounts created from HR that still need final approval."
          icon={ClipboardCheck}
          actionLabel="Inspect queue"
          onClick={() => setActiveSection("users")}
          kicker="Approval"
        />
        <OverviewShortcutCard
          title="Create User"
          value={filteredRolesForUnit.length}
          description="Start a new employee account with role and location details."
          icon={UserPlus}
          actionLabel="Open form"
          onClick={() => {
            setActiveSection("users");
            setIsUserFormOpen(true);
          }}
          kicker="Action"
        />
        <OverviewShortcutCard
          title="Pending HRD Approvals"
          value={pendingWorkflowApprovals.length}
          description="Employee item requests waiting for HR Director workflow approval."
          icon={ShieldCheck}
          actionLabel="Open approvals"
          onClick={() => setActiveSection("approvals")}
          kicker="Workflow"
        />
        <OverviewShortcutCard
          title="Return Approvals"
          value={pendingFinalReturnApprovals.length}
          description="Offboarding device returns waiting for HR Director final approval."
          icon={ClipboardCheck}
          actionLabel="Open returns"
          onClick={() => setActiveSection("returns")}
          kicker="Offboarding"
        />
        <OverviewShortcutCard
          title="Workflow Reports"
          value={completedWorkflowRequests.length}
          description="Track approved, fulfilled, and rejected equipment requests."
          icon={FileChartColumn}
          actionLabel="Open reports"
          onClick={() => {
            setSelectedReportKey("request-all");
            setActiveSection("reports");
          }}
          kicker="Tracking"
        />
      </section>
      <section className="chart-panel-grid">
        <section className="dashboard-panel chart-panel-card">
          <div className="panel-header">
            <h3>Unit Account Status</h3>
          </div>
          <DonutChart data={unitAccountStatusData} emptyLabel="No HR Director account data available." />
        </section>
        <section className="dashboard-panel chart-panel-card">
          <div className="panel-header">
            <h3>Workflow Pressure</h3>
          </div>
          <HorizontalBarChart data={workflowPressureData} emptyLabel="No HR Director workflow activity yet." />
        </section>
      </section>
    </>
      );
    })()
  );

  const renderUsersSection = () => {
    const usersPageKey = "users-list";
    const usersPageSize = pageSizeByKey[usersPageKey] || DEFAULT_ITEMS_PER_PAGE;
    const usersTotalPages = Math.max(Math.ceil(filteredUsers.length / usersPageSize), 1);
    const usersCurrentPage = Math.min(pageByKey[usersPageKey] || 1, usersTotalPages);
    const paginatedUsers = paginateRows(filteredUsers, usersCurrentPage, usersPageSize);

    return (
    <section className="dashboard-panel wide-panel">
      <div className="panel-header">
        <h3>Unit User Management</h3>
        <div className="panel-header-actions">
          <span>{filteredUsers.length} users</span>
          <button
            className="secondary-btn compact-btn"
            type="button"
            onClick={() => {
              if (isUserFormOpen) {
                resetUserForm();
                return;
              }
              setIsUserFormOpen(true);
            }}
          >
            {isUserFormOpen ? "Close form" : "Add user"}
          </button>
        </div>
      </div>

      <div className="panel-toolbar">
        <input
          className="table-search-input"
          type="search"
          value={userSearch}
          onChange={(event) => setUserSearch(event.target.value)}
          placeholder="Search name, email, or role"
        />
        <select
          className="table-filter-select"
          value={userStatusFilter}
          onChange={(event) => setUserStatusFilter(event.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {isUserFormOpen ? (
        <div className="toggle-form-panel">
          <form className="admin-form-grid" onSubmit={handleCreateUser}>
            <label className="field">
              <span>First name</span>
              <input value={userForm.firstName} onChange={(event) => setUserForm({ ...userForm, firstName: event.target.value })} required />
            </label>
            <label className="field">
              <span>Last name</span>
              <input value={userForm.lastName} onChange={(event) => setUserForm({ ...userForm, lastName: event.target.value })} required />
            </label>
            <label className="field">
              <span>Email</span>
              <input type="email" value={userForm.email} onChange={(event) => setUserForm({ ...userForm, email: event.target.value })} required />
            </label>
            <label className="field">
              <span>Phone number</span>
              <input type="tel" value={userForm.phoneNumber} onChange={(event) => setUserForm({ ...userForm, phoneNumber: event.target.value })} />
            </label>
            <label className="field">
              <span>Role</span>
              <select value={userForm.roleId} onChange={(event) => setUserForm({ ...userForm, roleId: event.target.value })} required>
                <option value="">Select role</option>
                {filteredRolesForUnit.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Employee code</span>
              <input value={userForm.employeeCode} onChange={(event) => setUserForm({ ...userForm, employeeCode: event.target.value })} />
            </label>
            <label className="field">
              <span>Job title</span>
              <input value={userForm.jobTitle} onChange={(event) => setUserForm({ ...userForm, jobTitle: event.target.value })} />
            </label>
            <label className="field">
              <span>Employment status</span>
              <select
                value={userForm.employmentStatus}
                onChange={(event) => setUserForm({ ...userForm, employmentStatus: event.target.value })}
              >
                <option value="">Select status</option>
                {employmentStatusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Office location</span>
              <input
                value={userForm.officeLocation}
                onChange={(event) => setUserForm({ ...userForm, officeLocation: event.target.value })}
                placeholder="Kigali HQ - 3rd Floor"
              />
            </label>
            <label className="field">
              <span>Start date</span>
              <input type="date" value={userForm.startDate} onChange={(event) => setUserForm({ ...userForm, startDate: event.target.value })} />
            </label>
            <label className="field">
              <span>Country</span>
              <select
                value={userForm.countryId}
                onChange={(event) =>
                  setUserForm({
                    ...userForm,
                    countryId: event.target.value,
                    hqId: getDefaultHqId(event.target.value),
                    branchId: "",
                    departmentId: "",
                  })
                }
                required
              >
                <option value="">Select country</option>
                {lookups.countries.map((country) => (
                  <option key={country.id} value={country.id}>
                    {country.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>HQ</span>
              <select
                value={userForm.hqId}
                onChange={(event) => setUserForm({ ...userForm, hqId: event.target.value, branchId: "", departmentId: "" })}
                disabled={!userForm.countryId}
                required
              >
                <option value="">Select HQ</option>
                {filteredHeadquartersForUser.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Branch</span>
              <select
                value={userForm.branchId}
                onChange={(event) => setUserForm({ ...userForm, branchId: event.target.value, departmentId: "" })}
                disabled={!userForm.countryId}
                required
              >
                <option value="">Select branch</option>
                {filteredBranchesForUser.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Department</span>
              <select
                value={userForm.departmentId}
                onChange={(event) => setUserForm({ ...userForm, departmentId: event.target.value })}
                disabled={!userForm.branchId}
              >
                <option value="">Select department</option>
                {filteredDepartmentsForUser.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-action-row">
              <button className="primary-btn form-submit-btn" type="submit">
                Create user
              </button>
              <button className="secondary-btn compact-btn" type="button" onClick={resetUserForm}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <div className="profile-list-grid">
        {paginatedUsers.map((account) => (
          <article className="work-profile-card" key={account.id}>
            <div className="work-profile-avatar">
              {(account.first_name?.[0] || account.full_name[0] || "U").toUpperCase()}
            </div>
            <div className="work-profile-main">
              <div className="work-profile-head">
                <div>
                  <strong>{account.full_name}</strong>
                  <span>{account.email}</span>
                </div>
                <span className={`status-pill status-${account.status}`}>{account.status}</span>
              </div>
              <div className="work-profile-grid">
                <span>
                  <small>Role</small>
                  {account.role_name}
                </span>
                <span>
                  <small>Employee Code</small>
                  {account.employee_code || "Not assigned"}
                </span>
                <span>
                  <small>Branch</small>
                  {lookups.branches.find((branch) => branch.id === account.branch_id)?.name || "Not assigned"}
                </span>
              </div>
            </div>
          </article>
        ))}
        {filteredUsers.length === 0 ? (
          <div className="empty-state-card">
            <strong>No users match the current filter.</strong>
            <p>Try a different status filter, clear the search, or create a new user for this unit.</p>
          </div>
        ) : null}
      </div>
      {renderPaginationBar(usersPageKey, filteredUsers.length, usersCurrentPage, usersPageSize, (page) =>
        setPageByKey((current) => ({
          ...current,
          [usersPageKey]: page,
        }))
      )}
    </section>
    );
  };

  const renderApprovalsSection = () => {
    const approvalsPageKey = "approvals-list";
    const approvalsPageSize = pageSizeByKey[approvalsPageKey] || DEFAULT_ITEMS_PER_PAGE;
    const approvalsTotalPages = Math.max(Math.ceil(pendingWorkflowApprovals.length / approvalsPageSize), 1);
    const approvalsCurrentPage = Math.min(pageByKey[approvalsPageKey] || 1, approvalsTotalPages);
    const paginatedApprovals = paginateRows(pendingWorkflowApprovals, approvalsCurrentPage, approvalsPageSize);

    return (
    <section className="dashboard-panel wide-panel">
      <div className="panel-header">
        <h3>HR Director Workflow Approvals</h3>
        <span>{pendingWorkflowApprovals.length} pending requests</span>
      </div>
      <p className="dashboard-subtitle">
        Review employee equipment requests that reached the HR Director approval stage before they continue to the next workflow step.
      </p>

      <div className="mini-list request-card-grid">
        {pendingWorkflowApprovals.length > 0 ? (
          paginatedApprovals.map((request) => {
            const isSubmitting = pendingRequestActionId === request.id;

            return (
              <article className="mini-list-card action-card" key={request.id}>
                <strong>
                  {request.requester_name} / {request.category_name}
                </strong>
                <span>
                  <span className={`status-pill status-${request.request_status}`}>{request.request_status}</span>
                  {" "}
                  {request.branch_name || "No branch"} / {normalizeWorkflowLabel(request.currentStageLabel)}
                </span>
                <span>
                  {request.requester_department_name || request.requester_job_title || "No department"} / {request.requester_employment_status || "No employment status"}
                </span>
                <span>Type: {(request.request_type || "standard").replace("_", " ")}</span>
                <span>
                  {request.requester_office_location || request.requester_email || "No office location"} / Requested: {formatProfileDate(request.requested_at || request.created_at)}
                </span>
                <span>{request.notes || "No request note added."}</span>
                {request.clarification_status === "needed" && request.clarification_note ? (
                  <p className="form-message warning-text">
                    Clarification needed: {request.clarification_note}
                  </p>
                ) : null}
                {request.fulfillment_status && request.fulfillment_status !== "ready" ? (
                  <span>
                    Store status: <span className={`status-pill status-${request.fulfillment_status}`}>{request.fulfillment_status.replace("_", " ")}</span>
                    {request.fulfillment_note ? ` / ${request.fulfillment_note}` : ""}
                  </span>
                ) : null}
                <div className="workflow-step-list">
                  {request.workflowSteps.map((step) => (
                    <div className="workflow-step-row" key={step.id}>
                      <strong>{normalizeWorkflowLabel(step.step_label)}</strong>
                      <span>
                        {step.action_status}
                        {step.actor_name ? ` / ${step.actor_name}` : ""}
                      </span>
                      {step.action_note ? <span>{step.action_note}</span> : null}
                    </div>
                  ))}
                </div>

                <label className="field">
                  <span>Approval note, or required reason if returning/rejecting</span>
                  <textarea
                    value={approvalNotes[request.id] || ""}
                    onChange={(event) =>
                      setApprovalNotes((current) => ({
                        ...current,
                        [request.id]: event.target.value,
                      }))
                    }
                    placeholder="Add approval context, compliance note, or rejection reason"
                    disabled={isSubmitting}
                  />
                </label>

                <div className="card-action-row">
                  <button className="primary-btn compact-btn btn-success" type="button" onClick={() => void handleApproveRequest(request.id)} disabled={isSubmitting}>
                    {isSubmitting ? "Working..." : "Approve"}
                  </button>
                  <button className="secondary-btn compact-btn btn-soft-warning" type="button" onClick={() => void handleReturnRequestForClarification(request.id)} disabled={isSubmitting}>
                    {isSubmitting ? "Working..." : "Return"}
                  </button>
                  <button className="secondary-btn compact-btn btn-soft-danger" type="button" onClick={() => void handleRejectRequest(request.id)} disabled={isSubmitting}>
                    {isSubmitting ? "Working..." : "Reject"}
                  </button>
                </div>
              </article>
            );
          })
        ) : (
          <p className="loading-text">No requests are waiting for HR Director approval right now.</p>
        )}
      </div>
      {renderPaginationBar(approvalsPageKey, pendingWorkflowApprovals.length, approvalsCurrentPage, approvalsPageSize, (page) =>
        setPageByKey((current) => ({
          ...current,
          [approvalsPageKey]: page,
        }))
      )}
    </section>
    );
  };

  const renderReportsSection = () => {
    const reportPageKey = "workflow-report-details";
    const reportPageSize = pageSizeByKey[reportPageKey] || DEFAULT_ITEMS_PER_PAGE;
    const reportTotalPages = Math.max(Math.ceil(filteredWorkflowReportRequests.length / reportPageSize), 1);
    const reportCurrentPage = Math.min(pageByKey[reportPageKey] || 1, reportTotalPages);
    const paginatedWorkflowReportRequests = paginateRows(filteredWorkflowReportRequests, reportCurrentPage, reportPageSize);

    return (
    <section className="dashboard-panel wide-panel">
      <div className="panel-header">
        <h3>Workflow Reports</h3>
        <div className="panel-header-actions">
          <span>{filteredWorkflowReportRequests.length} records</span>
          <label className="export-format-select-label">
            <span className="sr-only">Export format</span>
            <select
              className="export-format-select"
              value={exportFormat}
              onChange={(event) => setExportFormat(event.target.value as "html" | "csv" | "json" | "markdown")}
              aria-label="Choose export format"
            >
              {exportFormatOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            className="secondary-btn compact-btn export-btn"
            type="button"
            onClick={() =>
              downloadBrandedDocument(
                "hr-director-workflow-report.html",
                "HR Director Workflow Report",
                "A branded export of workflow requests, approval stages, and request ownership.",
                filteredWorkflowReportRequests.map((request) => ({
                  request_id: request.id,
                  requester: request.requester_name,
                  email: request.requester_email,
                  category: request.category_name,
                  request_type: request.request_type || "standard",
                  status: request.request_status,
                  current_stage: request.currentStageLabel,
                  approver: request.approver_name || "",
                  requested_at: formatProfileDate(request.requested_at || request.created_at),
                })),
              )
            }
          >
            <Download size={16} />
            Export Document
          </button>
        </div>
      </div>

      <div className="report-summary-grid">
        {reportCards.map((item) => (
          <button
            key={item.key}
            className={`report-card report-card-button${activeReport?.key === item.key ? " is-active" : ""}`}
            type="button"
            onClick={() => setSelectedReportKey(item.key)}
          >
            <strong>{item.total}</strong>
            <p>{item.label.charAt(0).toUpperCase() + item.label.slice(1)}</p>
            <span className="metric-card-action">Open details</span>
          </button>
        ))}
      </div>

      <div className="report-bottom-grid">
        <section className="report-panel">
          <div className="panel-header">
            <h3>{activeReport ? `${activeReport.label.charAt(0).toUpperCase() + activeReport.label.slice(1)} details` : "Report details"}</h3>
          </div>
          <div className="mini-list request-card-grid">
            {paginatedWorkflowReportRequests.map((request) => (
              <article className="mini-list-card action-card" key={request.id}>
                <strong>
                  {request.requester_name} / {request.category_name}
                </strong>
                <span>
                  <span className={`status-pill status-${request.request_status}`}>{request.request_status}</span>
                  {" "}
                  {request.branch_name || "No branch"} / {normalizeWorkflowLabel(request.currentStageLabel)}
                </span>
                <span>
                  {request.requester_department_name || request.requester_job_title || "No department"} / {request.requester_employment_status || "No employment status"}
                </span>
                <span>Type: {(request.request_type || "standard").replace("_", " ")}</span>
                <span>
                  {request.requester_office_location || "No office location"} / Requested: {formatProfileDate(request.requested_at || request.created_at)}
                </span>
                <span>{request.notes || "No request note provided."}</span>
                {request.request_status === "rejected" ? (
                  <p className="form-message error-text">
                    Rejection reason:{" "}
                    {request.workflowSteps.find((step) => step.action_status === "rejected")?.action_note ||
                      request.notes ||
                      "No rejection reason was recorded."}
                  </p>
                ) : null}
                <div className="workflow-step-list">
                  {request.workflowSteps.map((step) => (
                    <div className="workflow-step-row" key={step.id}>
                      <strong>{normalizeWorkflowLabel(step.step_label)}</strong>
                      <span>
                        {step.action_status}
                        {step.actor_name ? ` / ${step.actor_name}` : ""}
                      </span>
                      {step.action_note ? <span>{step.action_note}</span> : null}
                    </div>
                  ))}
                </div>
              </article>
            ))}
            {filteredWorkflowReportRequests.length === 0 ? (
              <p className="loading-text">No workflow requests found for the selected status.</p>
            ) : null}
          </div>
          {renderPaginationBar(reportPageKey, filteredWorkflowReportRequests.length, reportCurrentPage, reportPageSize, (page) =>
            setPageByKey((current) => ({
              ...current,
              [reportPageKey]: page,
            }))
          )}
        </section>
      </div>
    </section>
    );
  };

  const renderReturnsSection = () => {
    const returnsPageKey = "return-final-approvals";
    const returnsPageSize = pageSizeByKey[returnsPageKey] || DEFAULT_ITEMS_PER_PAGE;
    const returnsTotalPages = Math.max(Math.ceil(pendingFinalReturnApprovals.length / returnsPageSize), 1);
    const returnsCurrentPage = Math.min(pageByKey[returnsPageKey] || 1, returnsTotalPages);
    const paginatedReturns = paginateRows(pendingFinalReturnApprovals, returnsCurrentPage, returnsPageSize);

    return (
      <section className="dashboard-panel wide-panel">
        <div className="panel-header">
          <h3>HR Director Final Return Approvals</h3>
          <span>{pendingFinalReturnApprovals.length} waiting for HR Director</span>
        </div>
        <p className="dashboard-subtitle">
          Review offboarding device returns already received by IT Support. HR Director and IT Director must both approve before the device is saved back into the current IT store and the employee status is updated.
        </p>
        <div className="mini-list request-card-grid">
          {pendingFinalReturnApprovals.length > 0 ? (
            paginatedReturns.map((item) => {
              const form = finalReturnApprovalForm[item.id] ?? {
                decision: "approve" as const,
                note: "",
              };
              const isSubmitting = pendingReturnActionId === item.id;
              const isRejecting = form.decision === "reject";

              return (
                <article className="mini-list-card action-card" key={item.id}>
                  <strong>{item.asset_tag} / {item.equipment_name}</strong>
                  <span>{item.employee_name} / {item.employee_email}</span>
                  <span>{formatReturnReason(item.return_reason)} / Requested: {formatProfileDate(item.requested_at)}</span>
                  <span>IT Support receipt: {item.received_by_name || item.it_manager_name || "Not recorded"} / {formatProfileDate(item.returned_at)}</span>
                  <span>Condition: {item.condition_status || "Not recorded"} / Recommended store status: {item.disposition || "Not recorded"}</span>
                  <span>{item.received_condition_comment || item.it_review_note || item.intake_note || "No IT Support note recorded."}</span>
                  <span>IT Director approval: {item.final_itd_approval_status || "pending"} / HR Director approval: {item.final_hrd_approval_status || "pending"}</span>

                  <label className="field">
                    <span>Decision</span>
                    <select
                      value={form.decision}
                      onChange={(event) =>
                        setFinalReturnApprovalForm((current) => ({
                          ...current,
                          [item.id]: {
                            decision: event.target.value as "approve" | "reject",
                            note: form.note,
                          },
                        }))
                      }
                      disabled={isSubmitting}
                    >
                      <option value="approve">Approve final return</option>
                      <option value="reject">Reject final return</option>
                    </select>
                  </label>

                  <label className="field">
                    <span>{isRejecting ? "Rejection reason" : "Approval note"}</span>
                    <textarea
                      value={form.note}
                      onChange={(event) =>
                        setFinalReturnApprovalForm((current) => ({
                          ...current,
                          [item.id]: {
                            ...form,
                            note: event.target.value,
                          },
                        }))
                      }
                      placeholder={isRejecting ? "Explain why HR Director cannot approve this device return" : "Optional offboarding or compliance note"}
                      disabled={isSubmitting}
                    />
                  </label>

                  <div className="card-action-row">
                    <button className={`primary-btn compact-btn ${isRejecting ? "btn-danger" : "btn-success"}`} type="button" onClick={() => void handleFinalReturnApproval(item.id)} disabled={isSubmitting}>
                      {isSubmitting ? "Working..." : isRejecting ? "Reject return" : "Approve return"}
                    </button>
                  </div>
                </article>
              );
            })
          ) : (
            <p className="loading-text">No returns are waiting for HR Director final approval right now.</p>
          )}
        </div>
        {renderPaginationBar(returnsPageKey, pendingFinalReturnApprovals.length, returnsCurrentPage, returnsPageSize, (page) =>
          setPageByKey((current) => ({
            ...current,
            [returnsPageKey]: page,
          }))
        )}
      </section>
    );
  };

  const renderSettingsSection = () => <AccountSettingsPanel user={user} onUserUpdate={onUserUpdate} />;

  const activeSectionTitle =
    activeSection === "overview"
      ? "HR Director Dashboard"
      : activeSection
          .split("-")
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(" ");

  return (
    <div className={`app-dashboard-shell ${isSidebarOpen ? "sidebar-open" : "sidebar-collapsed"}`}>
      <aside className={`dashboard-sidebar ${isSidebarOpen ? "is-open" : "is-collapsed"}`}>
        <div className="sidebar-brand">
          <AirtelLogo />
        </div>

        <div className="sidebar-user">
          <strong>
            {user.firstName} {user.lastName}
          </strong>
          <span>{user.role.toLowerCase()}</span>
        </div>

        <nav className="sidebar-nav">
          {sidebarGroups.map((group) => (
            <section className="sidebar-group" key={group.title}>
              <button
                className="sidebar-group-button"
                type="button"
                onClick={() => toggleSidebarGroup(group.title)}
                aria-expanded={expandedGroups[group.title]}
              >
                <span className="sidebar-group-title">
                  <span className="sidebar-icon" aria-hidden="true">
                    <group.icon size={16} strokeWidth={2.2} />
                  </span>
                  <span>{group.title}</span>
                </span>
                <span className={`sidebar-chevron ${expandedGroups[group.title] ? "is-open" : ""}`} aria-hidden="true">
                  <ChevronDown size={16} strokeWidth={2.4} />
                </span>
              </button>
              <div className={`sidebar-group-links ${expandedGroups[group.title] ? "is-open" : "is-closed"}`}>
                {group.links.map((link) => {
                  const sectionId = link.href.replace("#", "");
                  const isActive = activeSection === sectionId;

                  return (
                    <button
                      className={`sidebar-link sidebar-link-button ${isActive ? "is-active" : ""}`}
                      type="button"
                      onClick={() => handleSectionChange(link.href)}
                      key={link.label}
                    >
                      <span className="sidebar-link-icon" aria-hidden="true">
                        <link.icon size={15} strokeWidth={2.2} />
                      </span>
                      <span className="sidebar-link-label">{link.label}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </nav>
      </aside>

      <div className="dashboard-stage">
        <header className="dashboard-topbar">
          <div className="dashboard-topbar-left">
            <button
              className="menu-badge"
              type="button"
              aria-label="Toggle menu"
              onClick={() => setIsSidebarOpen((current) => !current)}
            >
              =
            </button>
            <h1>HR Director Workspace</h1>
          </div>
          <div className="dashboard-topbar-right">
            <UserMenu user={user} onOpenProfile={() => setActiveSection("settings")} onLogout={onLogout} />
          </div>
        </header>

        <main className="dashboard-content">
          <div className="dashboard-heading-row">
            <div>
              <h2>{activeSectionTitle}</h2>
              <p className="dashboard-subtitle">
                Keep your unit roster clean, submit new users, and track account readiness without leaving HR operations.
              </p>
            </div>
            <div className="dashboard-breadcrumb">
              <span>Home</span>
              <span>/</span>
              <span>HR Director</span>
              <span>/</span>
              <span>{activeSectionTitle}</span>
            </div>
          </div>

          {toastState ? (
            <DashboardToast
              message={toastState.message}
              type={toastState.type}
              onClose={() => {
                setActionMessage("");
                setActionError("");
                setDashboardError("");
              }}
            />
          ) : null}

          <div className="section-view-shell">
            {isDashboardLoading ? (
              <DashboardWaveLoader
                title="Loading HR Director dashboard"
                description="Refreshing employee records, approvals, returns, and reporting insights for your workspace."
              />
            ) : null}
            {!isDashboardLoading && activeSection === "overview" ? renderOverviewSection() : null}
            {!isDashboardLoading && activeSection === "users" ? renderUsersSection() : null}
            {!isDashboardLoading && activeSection === "approvals" ? renderApprovalsSection() : null}
            {!isDashboardLoading && activeSection === "returns" ? renderReturnsSection() : null}
            {!isDashboardLoading && activeSection === "reports" ? renderReportsSection() : null}
            {!isDashboardLoading && activeSection === "settings" ? renderSettingsSection() : null}
          </div>
        </main>

        <footer className="dashboard-footer">
          <p>Copyright 2026 Airtel IMS. All rights reserved.</p>
          <span>Version 1.0.0</span>
        </footer>
      </div>
    </div>
  );
}

export default HRDirectorDashboard;
