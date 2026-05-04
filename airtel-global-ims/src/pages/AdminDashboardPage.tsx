import { FormEvent, useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Download,
  LayoutDashboard,
  Mail,
  PauseCircle,
  Save,
  Settings2,
  ShieldCheck,
  TriangleAlert,
  UserCog,
  Users,
  UserCheck,
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
import type {
  AdminUser,
  AdminReports,
  AdminSystemControls,
  LoggedInUser,
  Lookups,
} from "../types";

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

type AdminDashboardPageProps = {
  user: LoggedInUser;
  onLogout: () => void;
  onUserUpdate: (user: LoggedInUser) => void;
};

type ReportExportFormat = "html" | "excel" | "pdf";
type ReportExportTarget = "assets" | "requests";
type ReportTableTarget = "assets" | "requests";

const sidebarGroups: SidebarGroup[] = [
  {
    title: "Core Workspace",
    icon: LayoutDashboard,
    links: [
      { label: "Overview", href: "#overview", icon: ClipboardList },
      { label: "Users", href: "#users", icon: Users },
      { label: "Reports", href: "#reports", icon: BarChart3 },
    ],
  },
  {
    title: "System Settings",
    icon: UserCog,
    links: [
      { label: "System Center", href: "#system-settings", icon: Settings2 },
      { label: "My Settings", href: "#settings", icon: UserCog },
    ],
  },
];

const emptyLookups: Lookups = {
  roles: [],
  permissions: [],
  countries: [],
  branches: [],
  departments: [],
};

const emptyReports: AdminReports = {
  assetMetrics: {
    totalAssets: 0,
    availableAssets: 0,
    assignedAssets: 0,
    maintenanceAssets: 0,
    retiredAssets: 0,
    lostAssets: 0,
  },
  requestMetrics: {
    totalRequests: 0,
    pendingRequests: 0,
    approvedRequests: 0,
    rejectedRequests: 0,
    fulfilledRequests: 0,
  },
  assignmentMetrics: {
    activeAssignments: 0,
    returnedAssignments: 0,
    overdueAssignments: 0,
  },
  issueMetrics: {
    openIssues: 0,
    highPriorityIssues: 0,
  },
  recentAssets: [],
  recentRequests: [],
};

const emptySystemControls: AdminSystemControls = {
  approvalRoles: {
    branchManagerRole: "Branch manager",
    hrRole: "Hr",
    itRole: "IT manager",
    storekeeperRole: "IT Support engineer",
  },
  alertThresholds: {
    lowStockThreshold: 3,
    overdueAssignmentDays: 7,
    highPriorityIssueThreshold: 5,
  },
  backups: [],
};

const employmentStatusOptions = [
  "Permanent",
  "Contract",
  "Probation",
  "Intern",
  "Consultant",
  "Retired",
];

const DEFAULT_ITEMS_PER_PAGE = 10;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

function formatCurrencyAmount(value: number | null | undefined) {
  return Number(value ?? 0).toLocaleString("en-RW", {
    style: "currency",
    currency: "RWF",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function getDepreciationSnapshot({
  purchaseCost,
  purchaseDate,
  purchaseYear,
  lifespanYears,
}: {
  purchaseCost: number | null | undefined;
  purchaseDate: string | null | undefined;
  purchaseYear: number | null | undefined;
  lifespanYears: number | null | undefined;
}) {
  const cost = Number(purchaseCost ?? 0);
  const safeLifespanYears =
    typeof lifespanYears === "number" && Number.isFinite(lifespanYears) && lifespanYears > 0
      ? lifespanYears
      : 4;

  if (!Number.isFinite(cost) || cost <= 0) {
    return null;
  }

  const startDate = purchaseDate
    ? new Date(purchaseDate)
    : typeof purchaseYear === "number" && Number.isInteger(purchaseYear) && purchaseYear >= 1000
      ? new Date(`${purchaseYear}-01-01T00:00:00`)
      : null;

  if (!startDate || Number.isNaN(startDate.getTime())) {
    return {
      annualDepreciation: cost / safeLifespanYears,
      accumulatedDepreciation: 0,
      deviceValue: cost,
    };
  }

  const today = new Date();
  let ageYears = today.getFullYear() - startDate.getFullYear();
  const monthDelta = today.getMonth() - startDate.getMonth();
  const dayDelta = today.getDate() - startDate.getDate();
  if (monthDelta < 0 || (monthDelta === 0 && dayDelta < 0)) {
    ageYears -= 1;
  }

  const safeAgeYears = Math.max(ageYears, 0);
  const annualDepreciation = cost / safeLifespanYears;
  const accumulatedDepreciation = Math.min(cost, annualDepreciation * safeAgeYears);
  const deviceValue = Math.max(0, cost - accumulatedDepreciation);

  return {
    annualDepreciation,
    accumulatedDepreciation,
    deviceValue,
  };
}

function normalizeExportRows(rows: Array<Record<string, string | number>>) {
  return rows.map((row, index) => {
    const normalizedRow: Record<string, string | number> = {
      record_no: index + 1,
    };

    Object.entries(row).forEach(([key, value]) => {
      if (key === "id" || key === "request_id" || key === "record_id") {
        return;
      }

      normalizedRow[key] = value;
    });

    return normalizedRow;
  });
}

function AdminDashboardPage({ user, onLogout, onUserUpdate }: AdminDashboardPageProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeSection, setActiveSection] = useState("overview");
  const [isSectionHistoryReady, setIsSectionHistoryReady] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    Dashboard: true,
    "Employee Settings": true,
    "Asset Settings": true,
  });

  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [reports, setReports] = useState<AdminReports>(emptyReports);
  const [systemControls, setSystemControls] = useState<AdminSystemControls>(emptySystemControls);
  const [lookups, setLookups] = useState<Lookups>(emptyLookups);
  const [isDashboardLoading, setIsDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [isUserFormOpen, setIsUserFormOpen] = useState(false);
  const [isUserListOpen, setIsUserListOpen] = useState(true);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [isRoleFormOpen, setIsRoleFormOpen] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState<number | null>(null);

  const [qrError, setQrError] = useState("");
  const [statusLoadingUserId, setStatusLoadingUserId] = useState<number | null>(null);
  const [resendLoadingUserId, setResendLoadingUserId] = useState<number | null>(null);
  const [approvingUserId, setApprovingUserId] = useState<number | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [userStatusFilter, setUserStatusFilter] = useState("all");
  const [isExportingUsers, setIsExportingUsers] = useState(false);
  const [reportExportTarget, setReportExportTarget] = useState<ReportExportTarget>("assets");
  const [reportTableTarget, setReportTableTarget] = useState<ReportTableTarget>("assets");
  const [reportExportStatus, setReportExportStatus] = useState("all");
  const [reportExportFormat, setReportExportFormat] = useState<ReportExportFormat>("html");
  const [reportExportScheduleDate, setReportExportScheduleDate] = useState("");
  const [isSavingApprovalPolicy, setIsSavingApprovalPolicy] = useState(false);
  const [isSavingAlertThresholds, setIsSavingAlertThresholds] = useState(false);
  const [reportPageByKey, setReportPageByKey] = useState<Record<string, number>>({});
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
    branchId: "",
    departmentId: "",
  });
  const [roleForm, setRoleForm] = useState({ name: "", description: "" });
  const [branchForm, setBranchForm] = useState({ name: "", branchCode: "" });
  const [departmentForm, setDepartmentForm] = useState({ name: "", branchId: "" });
  const [approvalPolicyForm, setApprovalPolicyForm] = useState(emptySystemControls.approvalRoles);
  const [alertThresholdForm, setAlertThresholdForm] = useState({
    lowStockThreshold: String(emptySystemControls.alertThresholds.lowStockThreshold),
    overdueAssignmentDays: String(emptySystemControls.alertThresholds.overdueAssignmentDays),
    highPriorityIssueThreshold: String(emptySystemControls.alertThresholds.highPriorityIssueThreshold),
  });
  const validSections = useMemo(
    () => new Set(sidebarGroups.flatMap((group) => group.links.map((link) => link.href.replace("#", "")))),
    [],
  );

  const loadAdminWorkspace = async () => {
    setIsDashboardLoading(true);
    setDashboardError("");

    try {
      const [usersResult, lookupsResult, reportsResult, systemControlsResult] = await Promise.all([
        fetchJson<AdminUser[]>(`${API_BASE_URL}/admin/users`),
        fetchJson<Lookups>(`${API_BASE_URL}/admin/lookups`),
        fetchJson<AdminReports>(`${API_BASE_URL}/admin/reports`),
        fetchJson<AdminSystemControls>(`${API_BASE_URL}/admin/system-controls`),
      ]);

      if (
        !usersResult.response.ok ||
        !lookupsResult.response.ok ||
        !reportsResult.response.ok ||
        !systemControlsResult.response.ok
      ) {
        throw new Error(
          getApiMessage(
            usersResult.data ??
              lookupsResult.data ??
              reportsResult.data ??
              systemControlsResult.data,
            "Failed to load admin dashboard data.",
          ),
        );
      }

      const userRows = usersResult.data;
      const lookupData = lookupsResult.data;
      const reportData = reportsResult.data;
      const systemControlData = systemControlsResult.data;

      if (!userRows || !lookupData || !reportData || !systemControlData) {
        throw new Error("Admin dashboard returned an incomplete response.");
      }

      setAdminUsers(userRows);
      setLookups(lookupData);
      setReports(reportData);
      setSystemControls(systemControlData);
      setApprovalPolicyForm(systemControlData.approvalRoles);
      setAlertThresholdForm({
        lowStockThreshold: String(systemControlData.alertThresholds.lowStockThreshold),
        overdueAssignmentDays: String(systemControlData.alertThresholds.overdueAssignmentDays),
        highPriorityIssueThreshold: String(systemControlData.alertThresholds.highPriorityIssueThreshold),
      });
    } catch (error) {
      setDashboardError(error instanceof Error ? error.message : "Dashboard load failed.");
    } finally {
      setIsDashboardLoading(false);
    }
  };

  useEffect(() => {
    void loadAdminWorkspace();
  }, []);

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
              className={`pagination-button ${pageNumber === currentPage ? "is-active" : ""}`}
              type="button"
              key={pageNumber}
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

  const submitAdminAction = async (url: string, payload: object, onSuccess: () => void, method = "POST") => {
    setActionMessage("");
    setActionError("");

    try {
      const { response, data } = await fetchJson<{ message?: string }>(`${API_BASE_URL}${url}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(getApiMessage(data, "Request failed."));
      }

      setActionMessage(getApiMessage(data, "Saved successfully."));
      onSuccess();
      await loadAdminWorkspace();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Request failed.");
    }
  };

  const handleCreateUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (editingUserId) {
      await submitAdminAction(
        `/admin/users/${editingUserId}`,
        {
          ...userForm,
          actorUserId: user.id,
          branchId: userForm.branchId || null,
          departmentId: userForm.departmentId || null,
        },
        () => {
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
            branchId: "",
            departmentId: "",
          });
          setEditingUserId(null);
        },
        "PUT",
      );
      setIsUserFormOpen(false);
      return;
    }

    await submitAdminAction(
      "/admin/users",
      {
        ...userForm,
        actorUserId: user.id,
        branchId: userForm.branchId || null,
        departmentId: userForm.departmentId || null,
      },
      () =>
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
          branchId: "",
          departmentId: "",
        }),
    );
    setIsUserFormOpen(false);
  };

  const resetUserForm = () => {
    setEditingUserId(null);
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
      branchId: "",
      departmentId: "",
    });
    setIsUserFormOpen(false);
  };

  const handleCreateRole = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitAdminAction("/admin/roles", roleForm, () => setRoleForm({ name: "", description: "" }));
  };

  const handleSeedBranches = async () => {
    await submitAdminAction("/admin/branches/seed", {}, () => undefined);
  };

  const handleCreateBranch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitAdminAction(
      "/admin/branches",
      branchForm,
      () => setBranchForm({ name: "", branchCode: "" }),
    );
  };

  const handleCreateDepartment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitAdminAction(
      "/admin/departments",
      departmentForm,
      () => setDepartmentForm({ name: "", branchId: "" }),
    );
  };

  const handleUserStatusChange = async (accountId: number, status: "active" | "inactive") => {
    setStatusLoadingUserId(accountId);
    setActionMessage("");
    setActionError("");

    try {
      const { response, data } = await fetchJson<{ message?: string }>(`${API_BASE_URL}/admin/users/${accountId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, actorUserId: user.id }),
      });

      if (!response.ok) {
        throw new Error(getApiMessage(data, "Failed to update user status."));
      }

      setActionMessage(getApiMessage(data, "User status updated."));
      await loadAdminWorkspace();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to update user status.");
    } finally {
      setStatusLoadingUserId(null);
    }
  };

  const handleResendWelcomeEmail = async (account: AdminUser) => {
    setResendLoadingUserId(account.id);
    setActionMessage("");
    setActionError("");

    try {
      const { response, data } = await fetchJson<{ message?: string }>(`${API_BASE_URL}/admin/users/${account.id}/resend-welcome`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorUserId: user.id }),
      });

      if (!response.ok) {
        throw new Error(getApiMessage(data, "Failed to resend welcome email."));
      }

      setActionMessage(getApiMessage(data, "Welcome email resent."));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to resend welcome email.");
    } finally {
      setResendLoadingUserId(null);
    }
  };

  const handleApproveUser = async (userId: number) => {
    setApprovingUserId(userId);
    setActionMessage("");
    setActionError("");

    try {
      const { response, data } = await fetchJson<{ message?: string }>(`${API_BASE_URL}/admin/users/${userId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorUserId: user.id }),
      });

      if (!response.ok) {
        throw new Error(getApiMessage(data, "Failed to approve user."));
      }

      setActionMessage(getApiMessage(data, "User approved successfully."));
      await loadAdminWorkspace();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to approve user.");
    } finally {
      setApprovingUserId(null);
    }
  };

  const injectAirtelLogoIntoHtml = (html: string) => {
    if (html.includes('src="/airtel-logo.png"') || html.includes("Airtel Inventory Management System")) {
      return html;
    }

    const logoHeader = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 24px;background:#eef6fb;border-bottom:2px solid #d71920;">
        <img src="/airtel-logo.png" alt="Airtel logo" style="height:48px;width:auto;display:block;" />
        <div style="font-family:Segoe UI,Arial,sans-serif;color:#17324d;font-size:14px;font-weight:700;">Airtel Inventory Management System</div>
      </div>
    `;

    return html.replace(/(<body[^>]*>)/i, `$1\n${logoHeader}\n`);
  };

  const downloadAdminExport = async (path: string, filename: string) => {
    const response = await fetch(`${API_BASE_URL}${path}`);

    if (!response.ok) {
      let message = "Failed to export data.";

      try {
        const data = await response.json();
        message = data.message || message;
      } catch {
        // Ignore JSON parsing errors for non-JSON error bodies.
      }

      throw new Error(message);
    }

    const shouldInjectLogo = filename.endsWith(".html");
    const blob = shouldInjectLogo
      ? new Blob([injectAirtelLogoIntoHtml(await response.text())], { type: "text/html;charset=utf-8;" })
      : await response.blob();
    const objectUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(objectUrl);
  };

  const reportExportFormatOptions: { value: ReportExportFormat; label: string }[] = [
    { value: "html", label: "HTML (branded)" },
    { value: "excel", label: "Excel" },
    { value: "pdf", label: "PDF" },
  ];

  const getReportExportFilename = (filename: string, format: ReportExportFormat) => {
    const base = filename.replace(/\.html?$/i, "");
    const ext = format === "excel" ? "xls" : format;
    return `${base}.${ext}`;
  };

  const buildAdminReportHtml = (
    rows: Array<Record<string, string | number>>,
    title: string,
    subtitle: string,
    statusLabel?: string,
    scheduledDate?: string,
  ) => {
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

    return `<!DOCTYPE html>
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
    .meta { text-align: right; font-size: 13px; color: #587287; display: grid; gap: 6px; justify-items: end; }
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
          ${statusLabel ? `<span>Status: ${escapeHtml(statusLabel)}</span>` : ""}
          ${scheduledDate ? `<span>Scheduled date: ${escapeHtml(scheduledDate)}</span>` : ""}
          <span>Total records: ${rows.length}</span>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr>${headerLabels.map((label) => `<th>${escapeHtml(label)}</th>`).join("")}</tr></thead>
          <tbody>${rows.map((row) => `<tr>${headers.map((header) => `<td>${escapeHtml(row[header] ?? "") || "&nbsp;"}</td>`).join("")}</tr>`).join("")}</tbody>
        </table>
      </div>
      <div class="footer">Generated from Airtel IMS admin reporting.</div>
    </div>
  </div>
</body>
</html>`;
  };

  const downloadAdminReportRows = (
    filename: string,
    title: string,
    subtitle: string,
    rows: Array<Record<string, string | number>>,
    format: ReportExportFormat,
    statusLabel?: string,
    scheduledDate?: string,
  ) => {
    const normalizedRows = normalizeExportRows(rows);

    if (normalizedRows.length === 0) {
      setActionError("There is no report data to export yet.");
      return;
    }

    const todayDateValue = new Date().toISOString().slice(0, 10);
    if (scheduledDate && scheduledDate > todayDateValue) {
      const scheduledExports = JSON.parse(window.localStorage.getItem("airtel-ims-scheduled-exports") || "[]") as Array<Record<string, string>>;
      scheduledExports.push({
        area: "admin",
        filename: getReportExportFilename(filename, format),
        title,
        format,
        scheduledDate,
        statusLabel: statusLabel || "All records",
        createdAt: new Date().toISOString(),
      });
      window.localStorage.setItem("airtel-ims-scheduled-exports", JSON.stringify(scheduledExports));
      setActionMessage(`Export scheduled for ${scheduledDate}.`);
      return;
    }

    const htmlDocument = buildAdminReportHtml(normalizedRows, title, subtitle, statusLabel, scheduledDate);
    if (format === "pdf") {
      const printWindow = window.open("", "_blank", "noopener,noreferrer,width=1200,height=900");
      if (!printWindow) {
        setActionError("Allow pop-ups to export this report as PDF.");
        return;
      }

      printWindow.document.open();
      printWindow.document.write(htmlDocument);
      printWindow.document.close();
      printWindow.focus();
      window.setTimeout(() => {
        printWindow.print();
      }, 350);
      setActionMessage("Print dialog opened. Choose Save as PDF to finish the export.");
      return;
    }

    const blob = new Blob([htmlDocument], {
      type: format === "excel" ? "application/vnd.ms-excel;charset=utf-8;" : "text/html;charset=utf-8;",
    });
    const objectUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = getReportExportFilename(filename, format);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(objectUrl);
    setActionMessage("Report export downloaded.");
  };

  const handleExportUsers = async () => {
    setIsExportingUsers(true);
    setActionMessage("");
    setActionError("");

    try {
      await downloadAdminExport("/admin/export/users", "admin-users.html");
      setActionMessage("Users export downloaded.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to export users.");
    } finally {
      setIsExportingUsers(false);
    }
  };

  const handleSaveApprovalPolicy = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSavingApprovalPolicy(true);
    setActionMessage("");
    setActionError("");

    try {
      const { response, data } = await fetchJson<{ message?: string }>(`${API_BASE_URL}/admin/system-controls/approval`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actorUserId: user.id,
          ...approvalPolicyForm,
        }),
      });

      if (!response.ok) {
        throw new Error(getApiMessage(data, "Failed to save approval policy."));
      }

      setActionMessage(getApiMessage(data, "Approval policy updated."));
      await loadAdminWorkspace();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to save approval policy.");
    } finally {
      setIsSavingApprovalPolicy(false);
    }
  };

  const handleSaveAlertThresholds = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSavingAlertThresholds(true);
    setActionMessage("");
    setActionError("");

    try {
      const { response, data } = await fetchJson<{ message?: string }>(`${API_BASE_URL}/admin/system-controls/alerts`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actorUserId: user.id,
          lowStockThreshold: Number(alertThresholdForm.lowStockThreshold),
          overdueAssignmentDays: Number(alertThresholdForm.overdueAssignmentDays),
          highPriorityIssueThreshold: Number(alertThresholdForm.highPriorityIssueThreshold),
        }),
      });

      if (!response.ok) {
        throw new Error(getApiMessage(data, "Failed to save alert thresholds."));
      }

      setActionMessage(getApiMessage(data, "Alert thresholds updated."));
      await loadAdminWorkspace();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to save alert thresholds.");
    } finally {
      setIsSavingAlertThresholds(false);
    }
  };

  const selectedUserBranch = userForm.branchId
    ? lookups.branches.find((branch) => branch.id === Number(userForm.branchId))
    : null;

  const filteredDepartmentsForUser = userForm.branchId
    ? (() => {
        const departmentsByBranchId = lookups.departments.filter(
          (department) => department.branch_id === Number(userForm.branchId),
        );

        if (departmentsByBranchId.length > 0) {
          return departmentsByBranchId;
        }

        if (!selectedUserBranch) {
          return [];
        }

        return lookups.departments.filter(
          (department) =>
            department.country_id === selectedUserBranch.country_id &&
            department.branch_name.trim().toLowerCase() === selectedUserBranch.name.trim().toLowerCase(),
        );
      })()
    : lookups.departments;

  const filteredAdminUsers = useMemo(() => {
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

  const toastState = useMemo(() => {
    if (actionError) {
      return { message: actionError, type: "error" as const };
    }

    if (dashboardError) {
      return { message: dashboardError, type: "error" as const };
    }

    if (qrError) {
      return { message: qrError, type: "error" as const };
    }

    if (actionMessage) {
      return { message: actionMessage, type: "success" as const };
    }

    return null;
  }, [actionError, actionMessage, dashboardError, qrError]);

  useEffect(() => {
    if (!toastState) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setActionMessage("");
      setActionError("");
      setDashboardError("");
      setQrError("");
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

  const handleBackNavigation = () => {
    if (!window.history.state?.section || activeSection === "overview") {
      setActiveSection("overview");
      return;
    }

    window.history.back();
  };

  const activeSectionTitle =
    activeSection === "overview"
      ? "Dashboard"
      : activeSection
          .split("-")
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(" ");

  useEffect(() => {
    const hashSection = window.location.hash.replace("#", "");
    const initialSection = validSections.has(hashSection) ? hashSection : "overview";

    setActiveSection(initialSection);
    window.history.replaceState({ section: initialSection }, "", `#${initialSection}`);
    setIsSectionHistoryReady(true);
  }, [validSections]);

  useEffect(() => {
    const syncSectionFromHistory = () => {
      const historySection = typeof window.history.state?.section === "string" ? window.history.state.section : "";
      const hashSection = window.location.hash.replace("#", "");
      const nextSection = validSections.has(historySection)
        ? historySection
        : validSections.has(hashSection)
          ? hashSection
          : "overview";

      setActiveSection(nextSection);
    };

    window.addEventListener("popstate", syncSectionFromHistory);
    window.addEventListener("hashchange", syncSectionFromHistory);

    return () => {
      window.removeEventListener("popstate", syncSectionFromHistory);
      window.removeEventListener("hashchange", syncSectionFromHistory);
    };
  }, [validSections]);

  useEffect(() => {
    if (!isSectionHistoryReady) {
      return;
    }

    const nextHash = `#${activeSection}`;

    if (window.history.state?.section !== activeSection || window.location.hash !== nextHash) {
      window.history.pushState({ section: activeSection }, "", nextHash);
    }
  }, [activeSection, isSectionHistoryReady]);

  const renderOverviewSection = () => (
    (() => {
      const adminAssetStatusData = [
        { label: "Available", value: reports.assetMetrics.availableAssets },
        { label: "Assigned", value: reports.assetMetrics.assignedAssets },
        { label: "Maintenance", value: reports.assetMetrics.maintenanceAssets },
        { label: "Retired", value: reports.assetMetrics.retiredAssets },
        { label: "Lost", value: reports.assetMetrics.lostAssets },
      ];
      const adminRequestStatusData = [
        { label: "Pending", value: reports.requestMetrics.pendingRequests },
        { label: "Approved", value: reports.requestMetrics.approvedRequests },
        { label: "Rejected", value: reports.requestMetrics.rejectedRequests },
        { label: "Fulfilled", value: reports.requestMetrics.fulfilledRequests },
      ];
      const adminAssignmentData = [
        { label: "Active", value: reports.assignmentMetrics.activeAssignments },
        { label: "Returned", value: reports.assignmentMetrics.returnedAssignments },
        { label: "Overdue", value: reports.assignmentMetrics.overdueAssignments },
      ];

      return (
    <>
      <section className="dashboard-card-grid" id="overview">
        <OverviewShortcutCard
          title="Users"
          value={adminUsers.length}
          description="Live user accounts currently available in the system."
          icon={Users}
          actionLabel="Open users"
          onClick={() => setActiveSection("users")}
        />

        <OverviewShortcutCard
          title="Roles"
          value={lookups.roles.length}
          description="Manage system roles and keep access structure organized."
          icon={ShieldCheck}
          actionLabel="Open system center"
          onClick={() => setActiveSection("system-settings")}
        />
      </section>
      <section className="chart-panel-grid">
        <section className="dashboard-panel chart-panel-card">
          <div className="panel-header">
            <h3>System Asset Status</h3>
          </div>
          <DonutChart data={adminAssetStatusData} emptyLabel="No asset status data available." />
        </section>
        <section className="dashboard-panel chart-panel-card">
          <div className="panel-header">
            <h3>Request Pipeline</h3>
          </div>
          <HorizontalBarChart data={adminRequestStatusData} emptyLabel="No request pipeline data available." />
        </section>
        <section className="dashboard-panel chart-panel-card">
          <div className="panel-header">
            <h3>Assignment Activity</h3>
          </div>
          <HorizontalBarChart data={adminAssignmentData} emptyLabel="No assignment activity recorded." />
        </section>
      </section>
    </>
      );
    })()
  );

  const renderUsersSection = () => (
    <section className="dashboard-panel wide-panel" id="users">
      <div className="panel-header">
        <h3>User Management</h3>
        <div className="panel-header-actions">
          <span>{adminUsers.length} accounts</span>
          <button
            className="secondary-btn compact-btn"
            type="button"
            onClick={() => {
              resetUserForm();
              setIsUserFormOpen(true);
            }}
          >
            Add user
          </button>
        </div>
      </div>

      {qrError ? <p className="form-message error-text">{qrError}</p> : null}

      <div className="subpanel-header">
        <h4>Created Users</h4>
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
            <option value="pending">Pending approval</option>
            <option value="inactive">Inactive</option>
          </select>
          <button
            className="secondary-btn compact-btn export-btn"
            type="button"
            onClick={() => void handleExportUsers()}
            disabled={isExportingUsers}
          >
            <Download size={16} />
            {isExportingUsers ? "Exporting..." : "Export Document"}
          </button>
          <button
            className="secondary-btn compact-btn"
            type="button"
            onClick={() => setIsUserListOpen((current) => !current)}
          >
            {isUserListOpen ? "Hide users" : "Show users"}
          </button>
        </div>
      </div>

      {isUserListOpen ? (
        (() => {
          const usersPageKey = "users-admin-list";
          const usersPageSize = pageSizeByKey[usersPageKey] || DEFAULT_ITEMS_PER_PAGE;
          const usersTotalPages = Math.max(Math.ceil(filteredAdminUsers.length / usersPageSize), 1);
          const usersCurrentPage = Math.min(reportPageByKey[usersPageKey] || 1, usersTotalPages);
          const paginatedAdminUsers = paginateRows(filteredAdminUsers, usersCurrentPage, usersPageSize);

          return (
        <div className="user-table compact-table admin-users-table">
          <div className="user-table-head">
            <span>Name</span>
            <span>Email</span>
            <span>Role</span>
            <span>Status</span>
            <span>Actions</span>
          </div>
          {paginatedAdminUsers.map((account) => (
            <div className="user-table-row" key={account.id}>
              <div className="user-primary-cell">
                <strong>{account.full_name}</strong>
              </div>
              <div className="user-secondary-cell">
                <strong>{account.email}</strong>
              </div>
              <span>{account.role_name}</span>
              <span className={`status-badge status-${account.status}`}>{account.status}</span>
              <div className="table-action-group">
                {account.status === "pending" ? (
                  <button
                    className="table-action table-action-success"
                    type="button"
                    onClick={() => void handleApproveUser(account.id)}
                    disabled={approvingUserId === account.id}
                  >
                    <CheckCircle2 size={16} />
                    {approvingUserId === account.id ? "Approving..." : "Approve"}
                  </button>
                ) : null}
                <button
                  className="table-action table-action-info"
                  type="button"
                  onClick={() => void handleResendWelcomeEmail(account)}
                  disabled={resendLoadingUserId === account.id}
                >
                  <Mail size={16} />
                  {resendLoadingUserId === account.id ? "Sending..." : "Resend email"}
                </button>
                <button
                  className={`table-action ${account.status === "active" ? "table-action-warning" : "table-action-success"}`}
                  type="button"
                  onClick={() => void handleUserStatusChange(account.id, account.status === "active" ? "inactive" : "active")}
                  disabled={statusLoadingUserId === account.id}
                >
                  {account.status === "active" ? <PauseCircle size={16} /> : <UserCheck size={16} />}
                  {statusLoadingUserId === account.id
                    ? "Updating..."
                    : account.status === "active"
                      ? "Deactivate"
                      : "Activate"}
                </button>
              </div>
            </div>
          ))}
          {filteredAdminUsers.length === 0 ? <p className="loading-text">No users match the current search.</p> : null}
          {renderPaginationBar(usersPageKey, filteredAdminUsers.length, usersCurrentPage, usersPageSize, (page) =>
            setReportPageByKey((current) => ({
              ...current,
              [usersPageKey]: page,
            }))
          )}
        </div>
          );
        })()
      ) : null}
    </section>
  );

  const renderRolesSection = () => {
    const rolesPageKey = "roles-list";
    const rolesPageSize = pageSizeByKey[rolesPageKey] || DEFAULT_ITEMS_PER_PAGE;
    const rolesTotalPages = Math.max(Math.ceil(lookups.roles.length / rolesPageSize), 1);
    const rolesCurrentPage = Math.min(reportPageByKey[rolesPageKey] || 1, rolesTotalPages);
    const paginatedRoles = paginateRows(lookups.roles, rolesCurrentPage, rolesPageSize);

    const resetRoleForm = () => {
      setRoleForm({ name: "", description: "" });
      setEditingRoleId(null);
      setIsRoleFormOpen(false);
    };

    return (
      <section className="dashboard-panel wide-panel" id="roles">
        <div className="panel-header">
          <h3>Roles</h3>
          <div className="panel-header-actions">
            <span>{lookups.roles.length} records</span>
            <button
              className="secondary-btn compact-btn"
              type="button"
              onClick={() => {
                resetRoleForm();
                setIsRoleFormOpen(true);
              }}
            >
              Add Role
            </button>
          </div>
        </div>

        <div className="user-table compact-table">
          <div className="user-table-head">
            <span>Role Name</span>
            <span>Description</span>
            <span>Actions</span>
          </div>
          {paginatedRoles.map((role) => (
            <div className="user-table-row" key={role.id}>
              <div className="user-primary-cell">
                <strong>{role.name}</strong>
              </div>
              <div className="user-secondary-cell">
                <strong>{role.description || "No description"}</strong>
              </div>
              <div className="table-action-group">
                <button
                  className="table-action"
                  type="button"
                  onClick={() => {
                    setRoleForm({ name: role.name, description: role.description || "" });
                    setEditingRoleId(role.id);
                    setIsRoleFormOpen(true);
                  }}
                >
                  Edit
                </button>
              </div>
            </div>
          ))}
          {lookups.roles.length === 0 ? <p className="loading-text">No roles available yet.</p> : null}
          {renderPaginationBar(rolesPageKey, lookups.roles.length, rolesCurrentPage, rolesPageSize, (page) =>
            setReportPageByKey((current) => ({
              ...current,
              [rolesPageKey]: page,
            }))
          )}
        </div>

        {isRoleFormOpen ? (
          <div className="session-warning-overlay" role="presentation" onClick={(e) => {
            if (e.target === e.currentTarget) {
              resetRoleForm();
            }
          }}>
            <div className="session-warning-card" role="alertdialog" aria-modal="true">
              <form className="simple-form" onSubmit={(e) => {
                e.preventDefault();
                handleCreateRole(e as any);
                resetRoleForm();
              }} style={{ marginTop: 0 }}>
                <p className="session-warning-kicker">{editingRoleId ? "Edit Role" : "Create Role"}</p>
                <h2>{editingRoleId ? "Edit Role Details" : "Add New Role"}</h2>
                <div style={{ marginTop: "1rem" }}>
                  <label className="field">
                    <span>Role name</span>
                    <input value={roleForm.name} onChange={(event) => setRoleForm({ ...roleForm, name: event.target.value })} required />
                  </label>
                  <label className="field">
                    <span>Description</span>
                    <input value={roleForm.description} onChange={(event) => setRoleForm({ ...roleForm, description: event.target.value })} />
                  </label>
                </div>
                <div className="session-warning-actions">
                  <button className="primary-btn compact-btn" type="submit">
                    {editingRoleId ? "Update Role" : "Create Role"}
                  </button>
                  <button className="secondary-btn compact-btn" type="button" onClick={resetRoleForm}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}
      </section>
    );
  };

  const renderSystemSettingsSection = () => renderRolesSection();

  const renderReportsSection = () => (
    (() => {
      const recentAssetsPageKey = "reports-recent-assets";
      const recentAssetsPageSize = pageSizeByKey[recentAssetsPageKey] || DEFAULT_ITEMS_PER_PAGE;
      const recentAssetsTotalPages = Math.max(Math.ceil(reports.recentAssets.length / recentAssetsPageSize), 1);
      const recentAssetsCurrentPage = Math.min(reportPageByKey[recentAssetsPageKey] || 1, recentAssetsTotalPages);
      const paginatedRecentAssets = paginateRows(reports.recentAssets, recentAssetsCurrentPage, recentAssetsPageSize);

      const recentRequestsPageKey = "reports-recent-requests";
      const recentRequestsPageSize = pageSizeByKey[recentRequestsPageKey] || DEFAULT_ITEMS_PER_PAGE;
      const recentRequestsTotalPages = Math.max(Math.ceil(reports.recentRequests.length / recentRequestsPageSize), 1);
      const recentRequestsCurrentPage = Math.min(reportPageByKey[recentRequestsPageKey] || 1, recentRequestsTotalPages);
      const paginatedRecentRequests = paginateRows(reports.recentRequests, recentRequestsCurrentPage, recentRequestsPageSize);
      const reportStatusOptions = reportExportTarget === "assets"
        ? ["all", "available", "assigned", "maintenance", "retired", "lost"]
        : ["all", "pending", "approved", "rejected", "fulfilled"];
      const exportRows = (
        reportExportTarget === "assets"
          ? reports.recentAssets
              .filter((item) => reportExportStatus === "all" || item.status === reportExportStatus)
              .map((item) => ({
                asset_tag: item.asset_tag,
                equipment_name: item.equipment_name,
                status: item.status,
                category: item.category_name || "",
                branch: item.branch_name || "",
                country: item.country_name || "",
                purchase_date: item.purchase_date || "",
                purchase_year: item.purchase_year || "",
                purchase_cost: formatCurrencyAmount(item.purchase_cost),
                refresh_due_at: item.refresh_due_at || "",
              }))
          : reports.recentRequests
              .filter((item) => reportExportStatus === "all" || item.request_status === reportExportStatus)
              .map((item) => ({
                request_id: item.id,
                requester_name: item.requester_name,
                requester_email: item.requester_email,
                category: item.category_name,
                status: item.request_status,
                branch: item.branch_name || "",
                country: item.country_name || "",
                created_at: item.created_at,
              }))
      );

      return (
        <section className="dashboard-panel wide-panel" id="reports">
          <div className="panel-header">
            <div>
              <h3>Operational Reports</h3>
            </div>
          </div>
          <div className="report-export-toolbar">
            <label className="report-export-field">
              <span>Report type</span>
              <select
                value={reportExportTarget}
                onChange={(event) => {
                  const nextTarget = event.target.value as ReportExportTarget;
                  setReportExportTarget(nextTarget);
                  setReportExportStatus("all");
                }}
                aria-label="Choose admin report type to export"
              >
                <option value="assets">Assets</option>
                <option value="requests">Requests</option>
              </select>
            </label>
            <label className="report-export-field">
              <span>Export status</span>
              <select value={reportExportStatus} onChange={(event) => setReportExportStatus(event.target.value)} aria-label="Choose admin report status to export">
                {reportStatusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status === "all" ? "All statuses" : status}
                  </option>
                ))}
              </select>
            </label>
            <label className="report-export-field">
              <span>Export format</span>
              <select value={reportExportFormat} onChange={(event) => setReportExportFormat(event.target.value as ReportExportFormat)} aria-label="Choose admin report export format">
                {reportExportFormatOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="report-export-field">
              <span>Scheduled date</span>
              <input
                className="report-export-field-date"
                type="date"
                value={reportExportScheduleDate}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(event) => setReportExportScheduleDate(event.target.value)}
                aria-label="Choose admin report scheduled export date"
              />
            </label>
            <button
              className="primary-btn report-export-action"
              type="button"
              onClick={() =>
                downloadAdminReportRows(
                  `admin-${reportExportTarget}-report.html`,
                  `Admin ${reportExportTarget === "assets" ? "Asset" : "Request"} Report`,
                  `A branded export of ${reportExportTarget} data for ${reportExportStatus === "all" ? "all statuses" : reportExportStatus}.`,
                  exportRows,
                  reportExportFormat,
                  reportExportStatus === "all" ? "All statuses" : reportExportStatus,
                  reportExportScheduleDate || undefined,
                )
              }
            >
              <Download size={16} />
              Export Report
            </button>
          </div>

          <div className="subpanel-header report-table-toggle-row">
            <h4>Report Table View</h4>
            <div className="table-action-group">
              <button
                className={`report-filter-button ${reportTableTarget === "assets" ? "is-active" : ""}`}
                type="button"
                onClick={() => setReportTableTarget("assets")}
              >
                <span>Recent Assets</span>
                <strong>{reports.recentAssets.length}</strong>
              </button>
              <button
                className={`report-filter-button ${reportTableTarget === "requests" ? "is-active" : ""}`}
                type="button"
                onClick={() => setReportTableTarget("requests")}
              >
                <span>Recent Requests</span>
                <strong>{reports.recentRequests.length}</strong>
              </button>
            </div>
          </div>

          <div className="dashboard-bottom-row report-bottom-grid report-single-grid">
            {reportTableTarget === "assets" ? (
            <div className="report-panel">
              <div className="subpanel-header">
                <h4>Recent Assets</h4>
                <span>{reports.recentAssets.length} records</span>
              </div>
              <div className="user-table admin-report-table">
                <div className="user-table-head admin-report-table-head">
                  <span>Asset</span>
                  <span>Device</span>
                  <span>Status / Branch</span>
                  <span>Depreciation</span>
                  <span>Device value</span>
                </div>
                {paginatedRecentAssets.length > 0 ? (
                  paginatedRecentAssets.map((asset) => {
                    const depreciation = getDepreciationSnapshot({
                      purchaseCost: asset.purchase_cost,
                      purchaseDate: asset.purchase_date,
                      purchaseYear: asset.purchase_year,
                      lifespanYears: asset.lifespan_years,
                    });

                    return (
                      <div className="user-table-row admin-report-table-row" key={asset.id}>
                        <div className="user-primary-cell">
                          <strong>{asset.asset_tag}</strong>
                          <span>{asset.serial_number}</span>
                        </div>
                        <div className="user-secondary-cell">
                          <strong>{asset.equipment_name}</strong>
                          <span>{asset.category_name || "Uncategorized"}</span>
                        </div>
                        <div className="user-secondary-cell">
                          <strong>
                            <span className={`status-badge status-${asset.status}`}>{asset.status}</span>
                          </strong>
                          <span>{asset.branch_name || "No location"}</span>
                        </div>
                        <div className="user-secondary-cell">
                          <strong>{depreciation ? formatCurrencyAmount(depreciation.annualDepreciation) : "Unavailable"}</strong>
                          <span>Annual depreciation</span>
                        </div>
                        <div className="user-secondary-cell">
                          <strong>{depreciation ? formatCurrencyAmount(depreciation.deviceValue) : "Unavailable"}</strong>
                          <span>Current device value</span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="loading-text">No assets available yet.</p>
                )}
              </div>
              {renderPaginationBar(recentAssetsPageKey, reports.recentAssets.length, recentAssetsCurrentPage, recentAssetsPageSize, (page) =>
                setReportPageByKey((current) => ({
                  ...current,
                  [recentAssetsPageKey]: page,
                }))
              )}
            </div>
            ) : (
            <div className="report-panel">
              <div className="subpanel-header">
                <h4>Recent Requests</h4>
                <span>{reports.recentRequests.length} records</span>
              </div>
              <div className="user-table admin-report-table">
                <div className="user-table-head admin-report-table-head">
                  <span>Request</span>
                  <span>Category</span>
                  <span>Requester</span>
                  <span>Status</span>
                  <span>Date</span>
                </div>
                {paginatedRecentRequests.length > 0 ? (
                  paginatedRecentRequests.map((request) => (
                    <div className="user-table-row admin-report-table-row" key={request.id}>
                      <div className="user-primary-cell">
                        <strong>{`Request ${request.id}`}</strong>
                        <span>{request.branch_name || "No branch"}</span>
                      </div>
                      <div className="user-secondary-cell">
                        <strong>{request.category_name}</strong>
                        <span>{request.requester_department_name || "No department"}</span>
                      </div>
                      <div className="user-secondary-cell">
                        <strong>{request.requester_name}</strong>
                        <span>{request.requester_email}</span>
                      </div>
                      <div className="user-secondary-cell">
                        <strong>
                          <span className={`status-badge status-${request.request_status}`}>{request.request_status}</span>
                        </strong>
                        <span>{request.currentStageLabel}</span>
                      </div>
                      <div className="user-secondary-cell">
                        <strong>{new Date(request.created_at).toLocaleDateString()}</strong>
                        <span>Created</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="loading-text">No requests available yet.</p>
                )}
              </div>
              {renderPaginationBar(recentRequestsPageKey, reports.recentRequests.length, recentRequestsCurrentPage, recentRequestsPageSize, (page) =>
                setReportPageByKey((current) => ({
                  ...current,
                  [recentRequestsPageKey]: page,
                }))
              )}
            </div>
            )}
          </div>
        </section>
      );
    })()
  );

  const renderPoliciesSection = () => (
    <section className="dashboard-panel wide-panel" id="policies">
      <div className="panel-header">
        <h3>System Policies</h3>
        <span>Workflow and threshold controls</span>
      </div>

      <div className="dashboard-bottom-row report-bottom-grid">
        <div className="report-panel">
          <div className="subpanel-header">
            <h4>Approval Workflow</h4>
          </div>
          <form className="simple-form" onSubmit={handleSaveApprovalPolicy}>
            <label className="field">
              <span>Branch manager step</span>
              <input
                value={approvalPolicyForm.branchManagerRole}
                onChange={(event) =>
                  setApprovalPolicyForm({ ...approvalPolicyForm, branchManagerRole: event.target.value })
                }
                required
              />
            </label>
            <label className="field">
              <span>HR step</span>
              <input
                value={approvalPolicyForm.hrRole}
                onChange={(event) => setApprovalPolicyForm({ ...approvalPolicyForm, hrRole: event.target.value })}
                required
              />
            </label>
            <label className="field">
              <span>IT step</span>
              <input
                value={approvalPolicyForm.itRole}
                onChange={(event) => setApprovalPolicyForm({ ...approvalPolicyForm, itRole: event.target.value })}
                required
              />
            </label>
            <label className="field">
              <span>Fulfillment step</span>
              <input
                value={approvalPolicyForm.storekeeperRole}
                onChange={(event) =>
                  setApprovalPolicyForm({ ...approvalPolicyForm, storekeeperRole: event.target.value })
                }
                required
              />
            </label>
            <button className="primary-btn form-submit-btn export-btn" type="submit" disabled={isSavingApprovalPolicy}>
              <Save size={16} />
              {isSavingApprovalPolicy ? "Saving..." : "Save workflow"}
            </button>
          </form>
        </div>

        <div className="report-panel">
          <div className="subpanel-header">
            <h4>Alert Thresholds</h4>
          </div>
          <form className="simple-form" onSubmit={handleSaveAlertThresholds}>
            <label className="field">
              <span>Low stock threshold</span>
              <input
                type="number"
                min="0"
                value={alertThresholdForm.lowStockThreshold}
                onChange={(event) =>
                  setAlertThresholdForm({ ...alertThresholdForm, lowStockThreshold: event.target.value })
                }
                required
              />
            </label>
            <label className="field">
              <span>Overdue assignment days</span>
              <input
                type="number"
                min="0"
                value={alertThresholdForm.overdueAssignmentDays}
                onChange={(event) =>
                  setAlertThresholdForm({ ...alertThresholdForm, overdueAssignmentDays: event.target.value })
                }
                required
              />
            </label>
            <label className="field">
              <span>High-priority issue threshold</span>
              <input
                type="number"
                min="0"
                value={alertThresholdForm.highPriorityIssueThreshold}
                onChange={(event) =>
                  setAlertThresholdForm({ ...alertThresholdForm, highPriorityIssueThreshold: event.target.value })
                }
                required
              />
            </label>
            <div className="policy-alert-preview">
              <span className="status-badge status-pending">Low stock at {systemControls.alertThresholds.lowStockThreshold}</span>
              <span className="status-badge status-assigned">Overdue after {systemControls.alertThresholds.overdueAssignmentDays} days</span>
              <span className="status-badge status-lost">Escalate at {systemControls.alertThresholds.highPriorityIssueThreshold} issues</span>
            </div>
            <button className="primary-btn form-submit-btn export-btn" type="submit" disabled={isSavingAlertThresholds}>
              <TriangleAlert size={16} />
              {isSavingAlertThresholds ? "Saving..." : "Save thresholds"}
            </button>
          </form>
        </div>
      </div>
    </section>
  );

  const renderSettingsSection = () => <AccountSettingsPanel user={user} onUserUpdate={onUserUpdate} />;

  const renderBranchesSection = () => {
    const branchesPageKey = "branches-list";
    const branchesPageSize = pageSizeByKey[branchesPageKey] || DEFAULT_ITEMS_PER_PAGE;
    const branchesTotalPages = Math.max(Math.ceil(lookups.branches.length / branchesPageSize), 1);
    const branchesCurrentPage = Math.min(reportPageByKey[branchesPageKey] || 1, branchesTotalPages);
    const paginatedBranches = paginateRows(lookups.branches, branchesCurrentPage, branchesPageSize);

    return (
      <section className="dashboard-panel" id="branches">
      <div className="panel-header">
        <h3>Branches</h3>
        <span>{lookups.branches.length} records</span>
      </div>
      <div className="country-seed-panel">
        <p className="dashboard-subtitle">
          Load a prepared Airtel branch list so users and departments can choose from many branches.
        </p>
        <button className="primary-btn form-submit-btn" type="button" onClick={handleSeedBranches}>
          Load Airtel Branches
        </button>
      </div>
      <form className="simple-form" onSubmit={handleCreateBranch}>
        <label className="field">
          <span>Branch name</span>
          <input value={branchForm.name} onChange={(event) => setBranchForm({ ...branchForm, name: event.target.value })} required />
        </label>
        <label className="field">
          <span>Branch code</span>
          <input
            value={branchForm.branchCode}
            onChange={(event) => setBranchForm({ ...branchForm, branchCode: event.target.value })}
            required
          />
        </label>
        <button className="primary-btn form-submit-btn" type="submit">
          Add Branch
        </button>
      </form>
      <div className="mini-list">
        {paginatedBranches.map((branch) => (
          <article className="mini-list-card" key={branch.id}>
            <strong>{branch.name}</strong>
            <span>{branch.branch_code}</span>
          </article>
        ))}
      </div>
      {renderPaginationBar(branchesPageKey, lookups.branches.length, branchesCurrentPage, branchesPageSize, (page) =>
        setReportPageByKey((current) => ({
          ...current,
          [branchesPageKey]: page,
        }))
      )}
    </section>
    );
  };

  const renderDepartmentsSection = () => {
    const departmentsPageKey = "departments-list";
    const departmentsPageSize = pageSizeByKey[departmentsPageKey] || DEFAULT_ITEMS_PER_PAGE;
    const departmentsTotalPages = Math.max(Math.ceil(lookups.departments.length / departmentsPageSize), 1);
    const departmentsCurrentPage = Math.min(reportPageByKey[departmentsPageKey] || 1, departmentsTotalPages);
    const paginatedDepartments = paginateRows(lookups.departments, departmentsCurrentPage, departmentsPageSize);

    return (
      <section className="dashboard-panel" id="departments">
      <div className="panel-header">
        <h3>Departments</h3>
        <span>{lookups.departments.length} records</span>
      </div>
      <form className="simple-form" onSubmit={handleCreateDepartment}>
        <label className="field">
          <span>Department name</span>
          <input
            value={departmentForm.name}
            onChange={(event) => setDepartmentForm({ ...departmentForm, name: event.target.value })}
            required
          />
        </label>
        <label className="field">
          <span>Branch</span>
          <select
            value={departmentForm.branchId}
            onChange={(event) => setDepartmentForm({ ...departmentForm, branchId: event.target.value })}
            required
          >
            <option value="">Select branch</option>
            {lookups.branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </label>
        <button className="primary-btn form-submit-btn" type="submit">
          Add Department
        </button>
      </form>
      <div className="mini-list">
        {paginatedDepartments.map((department) => (
          <article className="mini-list-card" key={department.id}>
            <strong>{department.name}</strong>
            <span>{department.branch_name}</span>
          </article>
        ))}
      </div>
      {renderPaginationBar(departmentsPageKey, lookups.departments.length, departmentsCurrentPage, departmentsPageSize, (page) =>
        setReportPageByKey((current) => ({
          ...current,
          [departmentsPageKey]: page,
        }))
      )}
    </section>
    );
  };

  const renderLocationsSection = () => (
    <>
      <section className="dashboard-panel wide-panel" id="locations">
        <div className="panel-header">
          <div>
            <h3>Locations Workspace</h3>
          </div>
        </div>
        <div className="report-summary-grid">
          <article className="report-card report-card-professional">
            <p className="metric-kicker">Branches</p>
            <strong>{lookups.branches.length}</strong>
            <p>Operational branches available for assignment and stock ownership.</p>
          </article>
          <article className="report-card report-card-professional">
            <p className="metric-kicker">Departments</p>
            <strong>{lookups.departments.length}</strong>
            <p>Department structures used for employee records and reporting context.</p>
          </article>
        </div>
      </section>
      {renderBranchesSection()}
      {renderDepartmentsSection()}
    </>
  );

  const renderActiveSection = () => {
    switch (activeSection) {
      case "users":
        return renderUsersSection();
      case "reports":
        return renderReportsSection();
      case "system-settings":
        return renderSystemSettingsSection();
      case "policies":
        return renderPoliciesSection();
      case "locations":
        return renderLocationsSection();
      case "roles":
        return renderRolesSection();
      case "branches":
        return renderBranchesSection();
      case "departments":
        return renderDepartmentsSection();
      case "settings":
        return renderSettingsSection();
      case "overview":
      default:
        return renderOverviewSection();
    }
  };

  return (
    <div className={`app-dashboard-shell ${isSidebarOpen ? "sidebar-open" : "sidebar-collapsed"}`}>
      <aside className={`dashboard-sidebar ${isSidebarOpen ? "is-open" : "is-collapsed"}`}>
        <div className="sidebar-brand">
          <AirtelLogo />
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
                <span
                  className={`sidebar-chevron ${expandedGroups[group.title] ? "is-open" : ""}`}
                  aria-hidden="true"
                >
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
            <h1>Airtel Inventory Management System</h1>
          </div>
          <div className="dashboard-topbar-right">
            <UserMenu user={user} onOpenProfile={() => setActiveSection("settings")} onLogout={onLogout} />
          </div>
        </header>

        <main className="dashboard-content">
          <div className="dashboard-heading-row">
            <div>
              {activeSection !== "overview" ? (
                <button className="dashboard-back-button" type="button" onClick={handleBackNavigation}>
                  <ArrowLeft size={16} strokeWidth={2.4} />
                  <span>Back</span>
                </button>
              ) : null}
              <h2>{activeSectionTitle}</h2>
            </div>
            <div className="dashboard-breadcrumb">
              <span>Home</span>
              <span>/</span>
              <span>Admin Dashboard</span>
              <span>/</span>
              <span>{activeSection === "overview" ? "Overview" : activeSectionTitle}</span>
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
                setQrError("");
              }}
            />
          ) : null}

          <div className="section-view-shell">
            {isDashboardLoading ? (
              <DashboardWaveLoader
                title="Loading admin dashboard"
              />
            ) : (
              renderActiveSection()
            )}
          </div>
        </main>

        <footer className="dashboard-footer">
          <p>Copyright 2026 Airtel IMS. All rights reserved.</p>
          <span>Version 1.0.0</span>
        </footer>

        {isUserFormOpen ? (
          <div className="session-warning-overlay" role="presentation" onClick={(e) => {
            if (e.target === e.currentTarget) {
              resetUserForm();
            }
          }}>
            <div className="session-warning-card" role="alertdialog" aria-modal="true">
              <p className="session-warning-kicker">{editingUserId ? "Edit User" : "Create User"}</p>
              <h2>{editingUserId ? "Edit User Details" : "Add New User"}</h2>
              <form className="simple-form" onSubmit={handleCreateUser} style={{ marginTop: "1rem" }}>
                <label className="field">
                  <span>First name</span>
                  <input
                    value={userForm.firstName}
                    onChange={(event) => setUserForm({ ...userForm, firstName: event.target.value })}
                    required
                  />
                </label>
                <label className="field">
                  <span>Last name</span>
                  <input
                    value={userForm.lastName}
                    onChange={(event) => setUserForm({ ...userForm, lastName: event.target.value })}
                    required
                  />
                </label>
                <label className="field">
                  <span>Email</span>
                  <input
                    type="email"
                    value={userForm.email}
                    onChange={(event) => setUserForm({ ...userForm, email: event.target.value })}
                    required
                  />
                </label>
                <label className="field">
                  <span>Airtel phone number</span>
                  <input
                    type="tel"
                    value={userForm.phoneNumber}
                    onChange={(event) => setUserForm({ ...userForm, phoneNumber: event.target.value })}
                    placeholder="0712345678 or +250712345678"
                  />
                </label>
                <label className="field">
                  <span>Role</span>
                  <select
                    value={userForm.roleId}
                    onChange={(event) => setUserForm({ ...userForm, roleId: event.target.value })}
                    required
                  >
                    <option value="">Select role</option>
                    {lookups.roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Employee code</span>
                  <input
                    value={userForm.employeeCode}
                    onChange={(event) => setUserForm({ ...userForm, employeeCode: event.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Job title</span>
                  <input
                    value={userForm.jobTitle}
                    onChange={(event) => setUserForm({ ...userForm, jobTitle: event.target.value })}
                    placeholder="Network Engineer"
                  />
                </label>
                <label className="field">
                  <span>Employment status</span>
                  <select
                    value={userForm.employmentStatus}
                    onChange={(event) => setUserForm({ ...userForm, employmentStatus: event.target.value })}
                  >
                    <option value="">Select employment status</option>
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
                  <input
                    type="date"
                    value={userForm.startDate}
                    onChange={(event) => setUserForm({ ...userForm, startDate: event.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Branch</span>
                  <select
                    value={userForm.branchId}
                    onChange={(event) =>
                      setUserForm({
                        ...userForm,
                        branchId: event.target.value,
                        departmentId: "",
                      })
                    }
                    required
                  >
                    <option value="">Select branch</option>
                    {lookups.branches.map((branch) => (
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
                  >
                    <option value="">Select department</option>
                    {filteredDepartmentsForUser.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="session-warning-actions">
                  <button className="primary-btn compact-btn" type="submit">
                    {editingUserId ? "Update User" : "Create User"}
                  </button>
                  <button className="secondary-btn compact-btn" type="button" onClick={resetUserForm}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default AdminDashboardPage;
