import { FormEvent, useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Bell,
  Boxes,
  Building2,
  ChevronDown,
  ClipboardList,
  Download,
  FolderKanban,
  LayoutDashboard,
  LockKeyhole,
  RefreshCcw,
  QrCode,
  Save,
  Settings2,
  ShieldCheck,
  TableProperties,
  TriangleAlert,
  UserCog,
  Users,
} from "lucide-react";
import AccountSettingsPanel from "../components/AccountSettingsPanel";
import QRCode from "qrcode";
import AirtelLogo from "../components/AirtelLogo";
import DashboardWaveLoader from "../components/DashboardWaveLoader";
import DashboardToast from "../components/DashboardToast";
import OverviewShortcutCard from "../components/OverviewShortcutCard";
import { DonutChart, HorizontalBarChart } from "../components/RoleCharts";
import UserMenu from "../components/UserMenu";
import { fetchJson, getApiMessage } from "../api";
import { API_BASE_URL } from "../config";
import { moduleSummary } from "../data";
import type {
  AdminUser,
  AdminReports,
  AdminSystemControls,
  AuditLog,
  BackupSnapshot,
  LoggedInUser,
  Lookups,
  QrUser,
  SummaryCard,
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

const sidebarGroups: SidebarGroup[] = [
  {
    title: "Core Workspace",
    icon: LayoutDashboard,
    links: [
      { label: "Overview", href: "#overview", icon: ClipboardList },
      { label: "Users", href: "#users", icon: Users },
      { label: "Roles", href: "#roles", icon: ShieldCheck },
      { label: "Reports", href: "#reports", icon: BarChart3 },
      { label: "Policies", href: "#policies", icon: Settings2 },
      { label: "Locations", href: "#locations", icon: Building2 },
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

const summaryCardConfig: Record<string, { icon: LucideIcon; section: string; actionLabel: string }> = {
  "System roles": {
    icon: ShieldCheck,
    section: "roles",
    actionLabel: "Open roles",
  },
  "Core tables": {
    icon: TableProperties,
    section: "admin-tables",
    actionLabel: "Open tables",
  },
  "Pending approvals": {
    icon: ClipboardList,
    section: "users",
    actionLabel: "Review users",
  },
  "Open alerts": {
    icon: Bell,
    section: "qr-panel",
    actionLabel: "Open panel",
  },
};

const DEFAULT_ITEMS_PER_PAGE = 3;
const PAGE_SIZE_OPTIONS = [3, 6, 9];

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

function AdminDashboardPage({ user, onLogout, onUserUpdate }: AdminDashboardPageProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeSection, setActiveSection] = useState("overview");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    Dashboard: true,
    "Employee Settings": true,
    "Asset Settings": true,
  });

  const [summaryCards, setSummaryCards] = useState<SummaryCard[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
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

  const [selectedQrUser, setSelectedQrUser] = useState<QrUser | null>(null);
  const [qrImageUrl, setQrImageUrl] = useState("");
  const [isQrLoading, setIsQrLoading] = useState(false);
  const [qrLoadingUserId, setQrLoadingUserId] = useState<number | null>(null);
  const [qrError, setQrError] = useState("");
  const [statusLoadingUserId, setStatusLoadingUserId] = useState<number | null>(null);
  const [deleteLoadingUserId, setDeleteLoadingUserId] = useState<number | null>(null);
  const [resendLoadingUserId, setResendLoadingUserId] = useState<number | null>(null);
  const [resetPasswordLoadingUserId, setResetPasswordLoadingUserId] = useState<number | null>(null);
  const [approvingUserId, setApprovingUserId] = useState<number | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [userStatusFilter, setUserStatusFilter] = useState("all");
  const [isExportingUsers, setIsExportingUsers] = useState(false);
  const [isExportingAuditLogs, setIsExportingAuditLogs] = useState(false);
  const [isExportingAssets, setIsExportingAssets] = useState(false);
  const [isExportingRequests, setIsExportingRequests] = useState(false);
  const [isSavingApprovalPolicy, setIsSavingApprovalPolicy] = useState(false);
  const [isSavingAlertThresholds, setIsSavingAlertThresholds] = useState(false);
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [restoringBackupId, setRestoringBackupId] = useState<number | null>(null);
  const [downloadingBackupId, setDownloadingBackupId] = useState<number | null>(null);
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
  const [permissionForm, setPermissionForm] = useState({ code: "", name: "", moduleName: "" });
  const [branchForm, setBranchForm] = useState({ name: "", branchCode: "" });
  const [departmentForm, setDepartmentForm] = useState({ name: "", branchId: "" });
  const [approvalPolicyForm, setApprovalPolicyForm] = useState(emptySystemControls.approvalRoles);
  const [alertThresholdForm, setAlertThresholdForm] = useState({
    lowStockThreshold: String(emptySystemControls.alertThresholds.lowStockThreshold),
    overdueAssignmentDays: String(emptySystemControls.alertThresholds.overdueAssignmentDays),
    highPriorityIssueThreshold: String(emptySystemControls.alertThresholds.highPriorityIssueThreshold),
  });

  const loadAdminWorkspace = async () => {
    setIsDashboardLoading(true);
    setDashboardError("");

    try {
      const [summaryResult, usersResult, lookupsResult, auditLogsResult, reportsResult, systemControlsResult] = await Promise.all([
        fetchJson<{ cards?: SummaryCard[] }>(`${API_BASE_URL}/admin/summary`),
        fetchJson<AdminUser[]>(`${API_BASE_URL}/admin/users`),
        fetchJson<Lookups>(`${API_BASE_URL}/admin/lookups`),
        fetchJson<AuditLog[]>(`${API_BASE_URL}/admin/audit-logs`),
        fetchJson<AdminReports>(`${API_BASE_URL}/admin/reports`),
        fetchJson<AdminSystemControls>(`${API_BASE_URL}/admin/system-controls`),
      ]);

      if (
        !summaryResult.response.ok ||
        !usersResult.response.ok ||
        !lookupsResult.response.ok ||
        !auditLogsResult.response.ok ||
        !reportsResult.response.ok ||
        !systemControlsResult.response.ok
      ) {
        throw new Error(
          getApiMessage(
            summaryResult.data ??
              usersResult.data ??
              lookupsResult.data ??
              auditLogsResult.data ??
              reportsResult.data ??
              systemControlsResult.data,
            "Failed to load admin dashboard data.",
          ),
        );
      }

      const summaryData = summaryResult.data;
      const userRows = usersResult.data;
      const lookupData = lookupsResult.data;
      const auditRows = auditLogsResult.data;
      const reportData = reportsResult.data;
      const systemControlData = systemControlsResult.data;

      if (!summaryData || !userRows || !lookupData || !auditRows || !reportData || !systemControlData) {
        throw new Error("Admin dashboard returned an incomplete response.");
      }

      setSummaryCards(summaryData.cards ?? []);
      setAdminUsers(userRows);
      setLookups(lookupData);
      setAuditLogs(auditRows);
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

  const handleEditUser = async (account: AdminUser) => {
    setActionError("");
    setActionMessage("");

    try {
      const { response, data } = await fetchJson<AdminUser>(`${API_BASE_URL}/admin/users/${account.id}`);

      if (response.ok && data) {
        const fullUser = data;

        setEditingUserId(fullUser.id);
        setIsUserFormOpen(true);
        setUserForm({
          firstName: fullUser.first_name || "",
          lastName: fullUser.last_name || "",
          email: fullUser.email,
          phoneNumber: fullUser.phone_number || "",
          roleId: fullUser.role_id ? String(fullUser.role_id) : "",
          employeeCode: fullUser.employee_code || "",
          jobTitle: fullUser.job_title || "",
          employmentStatus: fullUser.employment_status || "",
          officeLocation: fullUser.office_location || "",
          startDate: fullUser.start_date ? String(fullUser.start_date).slice(0, 10) : "",
          branchId: fullUser.branch_id ? String(fullUser.branch_id) : "",
          departmentId: fullUser.department_id ? String(fullUser.department_id) : "",
        });
        return;
      }
    } catch {
      // Fall back to the list payload below if the detail request is unavailable.
    }

    const [firstName = "", ...lastNameParts] = account.full_name.split(" ");
    const matchedRole = lookups.roles.find((role) => role.name === account.role_name);

    setEditingUserId(account.id);
    setIsUserFormOpen(true);
    setUserForm({
      firstName: account.first_name || firstName,
      lastName: account.last_name || lastNameParts.join(" "),
      email: account.email,
      phoneNumber: account.phone_number || "",
      roleId: account.role_id ? String(account.role_id) : matchedRole ? String(matchedRole.id) : "",
      employeeCode: account.employee_code || "",
      jobTitle: account.job_title || "",
      employmentStatus: account.employment_status || "",
      officeLocation: account.office_location || "",
      startDate: account.start_date ? String(account.start_date).slice(0, 10) : "",
      branchId: account.branch_id ? String(account.branch_id) : "",
      departmentId: account.department_id ? String(account.department_id) : "",
    });
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

  const handleCreatePermission = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitAdminAction(
      "/admin/permissions",
      permissionForm,
      () => setPermissionForm({ code: "", name: "", moduleName: "" }),
    );
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

  const handleViewQrCode = async (userId: number) => {
    setIsQrLoading(true);
    setQrLoadingUserId(userId);
    setQrError("");

    try {
      const { response, data } = await fetchJson<{ message?: string; qrPayload?: string; user?: QrUser }>(`${API_BASE_URL}/admin/users/${userId}/qr`);

      if (!response.ok) {
        throw new Error(getApiMessage(data, "Failed to load QR code data."));
      }

      if (!data?.qrPayload || !data.user) {
        throw new Error("QR code data was incomplete.");
      }

      const dataUrl = await QRCode.toDataURL(data.qrPayload, {
        width: 240,
        margin: 2,
        color: {
          dark: "#000000",
          light: "#ffffff",
        },
      });

      setSelectedQrUser(data.user);
      setQrImageUrl(dataUrl);
      window.location.hash = "qr-panel";
    } catch (error) {
      setQrError(error instanceof Error ? error.message : "Failed to load QR code.");
    } finally {
      setIsQrLoading(false);
      setQrLoadingUserId(null);
    }
  };

  const handleDownloadQr = () => {
    if (!qrImageUrl || !selectedQrUser) {
      return;
    }

    const link = document.createElement("a");
    link.href = qrImageUrl;
    link.download = `${selectedQrUser.fullName.replace(/\s+/g, "-").toLowerCase()}-qr.png`;
    link.click();
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

  const handleDeleteUser = async (account: AdminUser) => {
    const confirmed = window.confirm(`Delete ${account.full_name}'s account? This action cannot be undone.`);

    if (!confirmed) {
      return;
    }

    setDeleteLoadingUserId(account.id);
    setActionMessage("");
    setActionError("");

    try {
      const { response, data } = await fetchJson<{ message?: string }>(`${API_BASE_URL}/admin/users/${account.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorUserId: user.id }),
      });

      if (!response.ok) {
        throw new Error(getApiMessage(data, "Failed to delete user."));
      }

      if (editingUserId === account.id) {
        resetUserForm();
      }

      setActionMessage(getApiMessage(data, "User deleted successfully."));
      await loadAdminWorkspace();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to delete user.");
    } finally {
      setDeleteLoadingUserId(null);
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

  const handleAdminResetPassword = async (account: AdminUser) => {
    const confirmed = window.confirm(`Reset password for ${account.full_name}? A new temporary password will be emailed.`);

    if (!confirmed) {
      return;
    }

    setResetPasswordLoadingUserId(account.id);
    setActionMessage("");
    setActionError("");

    try {
      const { response, data } = await fetchJson<{ message?: string }>(`${API_BASE_URL}/admin/users/${account.id}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorUserId: user.id }),
      });

      if (!response.ok) {
        throw new Error(getApiMessage(data, "Failed to reset password."));
      }

      setActionMessage(getApiMessage(data, "Password reset completed."));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to reset password.");
    } finally {
      setResetPasswordLoadingUserId(null);
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

  const handleExportAuditLogs = async () => {
    setIsExportingAuditLogs(true);
    setActionMessage("");
    setActionError("");

    try {
      await downloadAdminExport("/admin/export/audit-logs", "admin-audit-logs.html");
      setActionMessage("Audit export downloaded.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to export audit logs.");
    } finally {
      setIsExportingAuditLogs(false);
    }
  };

  const handleExportAssets = async () => {
    setIsExportingAssets(true);
    setActionMessage("");
    setActionError("");

    try {
      await downloadAdminExport("/admin/export/assets", "admin-assets.html");
      setActionMessage("Assets export downloaded.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to export assets.");
    } finally {
      setIsExportingAssets(false);
    }
  };

  const handleExportRequests = async () => {
    setIsExportingRequests(true);
    setActionMessage("");
    setActionError("");

    try {
      await downloadAdminExport("/admin/export/requests", "admin-requests.html");
      setActionMessage("Requests export downloaded.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to export requests.");
    } finally {
      setIsExportingRequests(false);
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

  const handleCreateBackup = async () => {
    setIsCreatingBackup(true);
    setActionMessage("");
    setActionError("");

    try {
      const { response, data } = await fetchJson<{ message?: string }>(`${API_BASE_URL}/admin/backups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actorUserId: user.id,
          label: `Manual backup ${new Date().toLocaleString()}`,
        }),
      });

      if (!response.ok) {
        throw new Error(getApiMessage(data, "Failed to create backup."));
      }

      setActionMessage(getApiMessage(data, "Backup created successfully."));
      await loadAdminWorkspace();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to create backup.");
    } finally {
      setIsCreatingBackup(false);
    }
  };

  const handleDownloadBackup = async (backup: BackupSnapshot) => {
    setDownloadingBackupId(backup.id);
    setActionMessage("");
    setActionError("");

    try {
      await downloadAdminExport(`/admin/backups/${backup.id}/download`, backup.file_name);
      setActionMessage("Backup downloaded.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to download backup.");
    } finally {
      setDownloadingBackupId(null);
    }
  };

  const handleRestoreBackup = async (backup: BackupSnapshot) => {
    const confirmed = window.confirm(`Restore backup "${backup.label}"? This will replace current live data with the saved snapshot.`);

    if (!confirmed) {
      return;
    }

    setRestoringBackupId(backup.id);
    setActionMessage("");
    setActionError("");

    try {
      const { response, data } = await fetchJson<{ message?: string }>(`${API_BASE_URL}/admin/backups/${backup.id}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorUserId: user.id }),
      });

      if (!response.ok) {
        throw new Error(getApiMessage(data, "Failed to restore backup."));
      }

      setActionMessage(getApiMessage(data, "Backup restored successfully."));
      await loadAdminWorkspace();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to restore backup.");
    } finally {
      setRestoringBackupId(null);
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
        {summaryCards.map((item) => {
          const config = summaryCardConfig[item.label] ?? {
            icon: ClipboardList,
            section: "users",
            actionLabel: "Open details",
          };

          return (
            <OverviewShortcutCard
              key={item.label}
              title={item.label}
              value={item.value}
              description={item.note}
              icon={config.icon}
              actionLabel={config.actionLabel}
              onClick={() => setActiveSection(config.section)}
            />
          );
        })}

        <OverviewShortcutCard
          title="Users"
          value={adminUsers.length}
          description="Live user accounts currently available in the system."
          icon={Users}
          actionLabel="Open users"
          onClick={() => setActiveSection("users")}
        />

        <OverviewShortcutCard
          title="Locations"
          value={lookups.branches.length + lookups.departments.length}
          description="Combined branch and department records created by admin."
          icon={Building2}
          actionLabel="Manage locations"
          onClick={() => setActiveSection("locations")}
        />

        <OverviewShortcutCard
          title="Assets"
          value={reports.assetMetrics.totalAssets}
          description="Track equipment health, assignment readiness, and stock posture."
          icon={Boxes}
          actionLabel="Open reports"
          onClick={() => setActiveSection("reports")}
        />

        <OverviewShortcutCard
          title="Requests"
          value={reports.requestMetrics.totalRequests}
          description="Review request pipeline volume and recent fulfillment activity."
          icon={BarChart3}
          actionLabel="Open reports"
          onClick={() => setActiveSection("reports")}
        />

        <OverviewShortcutCard
          title="Policies"
          value={approvalPolicyForm.branchManagerRole ? 4 : 0}
          description="Control approval roles and system alert thresholds from one place."
          icon={Settings2}
          actionLabel="Open controls"
          onClick={() => setActiveSection("policies")}
        />

        <OverviewShortcutCard
          title="Backups"
          value={systemControls.backups.length}
          description="Create recovery snapshots and restore the system when needed."
          icon={RefreshCcw}
          actionLabel="Open backup"
          onClick={() => setActiveSection("backup")}
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
        <div className="user-table compact-table">
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
                    {approvingUserId === account.id ? "Approving..." : "Approve"}
                  </button>
                ) : (
                  <button
                    className="table-action"
                    type="button"
                    onClick={() => void handleEditUser(account)}
                  >
                    Edit
                  </button>
                )}
                <button
                  className="table-action"
                  type="button"
                  onClick={() => void handleResendWelcomeEmail(account)}
                  disabled={resendLoadingUserId === account.id}
                >
                  {resendLoadingUserId === account.id ? "Sending..." : "Resend email"}
                </button>
                <button
                  className="table-action"
                  type="button"
                  onClick={() => void handleAdminResetPassword(account)}
                  disabled={resetPasswordLoadingUserId === account.id}
                >
                  {resetPasswordLoadingUserId === account.id ? "Resetting..." : "Reset password"}
                </button>
                <button
                  className={`table-action ${account.status === "active" ? "table-action-danger" : "table-action-success"}`}
                  type="button"
                  onClick={() => void handleUserStatusChange(account.id, account.status === "active" ? "inactive" : "active")}
                  disabled={statusLoadingUserId === account.id}
                >
                  {statusLoadingUserId === account.id
                    ? "Updating..."
                    : account.status === "active"
                      ? "Set inactive"
                      : "Set active"}
                </button>
                <button
                  className="table-action table-action-danger"
                  type="button"
                  onClick={() => void handleDeleteUser(account)}
                  disabled={deleteLoadingUserId === account.id || account.id === user.id}
                  title={account.id === user.id ? "You cannot delete your own account." : undefined}
                >
                  {deleteLoadingUserId === account.id ? "Deleting..." : "Delete"}
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
      const assetStatusData = [
        { label: "Available", value: reports.assetMetrics.availableAssets },
        { label: "Assigned", value: reports.assetMetrics.assignedAssets },
        { label: "Maintenance", value: reports.assetMetrics.maintenanceAssets },
        { label: "Retired", value: reports.assetMetrics.retiredAssets },
        { label: "Lost", value: reports.assetMetrics.lostAssets },
      ];
      const requestPipelineData = [
        { label: "Pending", value: reports.requestMetrics.pendingRequests },
        { label: "Approved", value: reports.requestMetrics.approvedRequests },
        { label: "Rejected", value: reports.requestMetrics.rejectedRequests },
        { label: "Fulfilled", value: reports.requestMetrics.fulfilledRequests },
      ];
      const assignmentHealthData = [
        { label: "Active", value: reports.assignmentMetrics.activeAssignments },
        { label: "Returned", value: reports.assignmentMetrics.returnedAssignments },
        { label: "Overdue", value: reports.assignmentMetrics.overdueAssignments },
      ];
      const assetUtilizationRate = reports.assetMetrics.totalAssets > 0
        ? Math.round((reports.assetMetrics.assignedAssets / reports.assetMetrics.totalAssets) * 100)
        : 0;
      const requestFulfillmentRate = reports.requestMetrics.totalRequests > 0
        ? Math.round((reports.requestMetrics.fulfilledRequests / reports.requestMetrics.totalRequests) * 100)
        : 0;
      const issueEscalationRate = reports.issueMetrics.openIssues > 0
        ? Math.round((reports.issueMetrics.highPriorityIssues / reports.issueMetrics.openIssues) * 100)
        : 0;
      const maintenanceExposure = reports.assetMetrics.totalAssets > 0
        ? Math.round((reports.assetMetrics.maintenanceAssets / reports.assetMetrics.totalAssets) * 100)
        : 0;

      return (
        <section className="dashboard-panel wide-panel" id="reports">
          <div className="panel-header">
            <div>
              <h3>Operational Reports</h3>
              <p className="dashboard-subtitle">Executive reporting view for stock posture, request throughput, assignment health, and service risk.</p>
            </div>
            <div className="panel-header-actions">
              <button
                className="secondary-btn compact-btn export-btn"
                type="button"
                onClick={() => void handleExportAssets()}
                disabled={isExportingAssets}
              >
                <Download size={16} />
                {isExportingAssets ? "Exporting assets..." : "Export asset document"}
              </button>
              <button
                className="secondary-btn compact-btn export-btn"
                type="button"
                onClick={() => void handleExportRequests()}
                disabled={isExportingRequests}
              >
                <Download size={16} />
                {isExportingRequests ? "Exporting requests..." : "Export request document"}
              </button>
            </div>
          </div>

          <section className="admin-report-hero">
            <div className="admin-report-hero-copy">
              <p className="metric-kicker">Executive Summary</p>
              <h4>System posture is {assetUtilizationRate >= 70 ? "highly utilized" : "well balanced"} with {requestFulfillmentRate}% request fulfillment.</h4>
              <p>
                {reports.assetMetrics.totalAssets} tracked assets, {reports.requestMetrics.totalRequests} total requests,
                {" "}{reports.assignmentMetrics.overdueAssignments} overdue assignments, and {reports.issueMetrics.highPriorityIssues} high-priority issues currently shape the operating picture.
              </p>
            </div>
            <div className="admin-report-hero-metrics">
              <article>
                <small>Utilization</small>
                <strong>{assetUtilizationRate}%</strong>
                <span>Assigned assets vs total fleet</span>
              </article>
              <article>
                <small>Fulfillment</small>
                <strong>{requestFulfillmentRate}%</strong>
                <span>Requests fully delivered</span>
              </article>
              <article>
                <small>Issue escalation</small>
                <strong>{issueEscalationRate}%</strong>
                <span>High-priority share of open issues</span>
              </article>
              <article>
                <small>Maintenance exposure</small>
                <strong>{maintenanceExposure}%</strong>
                <span>Assets currently under maintenance</span>
              </article>
            </div>
          </section>

          <div className="report-summary-grid">
            <article className="report-card report-card-professional">
              <p className="metric-kicker">Assets</p>
              <strong>{reports.assetMetrics.totalAssets}</strong>
              <p>Fleet registered across the whole system.</p>
              <div className="report-stat-list">
                <span><small>Available</small><strong>{reports.assetMetrics.availableAssets}</strong></span>
                <span><small>Assigned</small><strong>{reports.assetMetrics.assignedAssets}</strong></span>
                <span><small>Maintenance</small><strong>{reports.assetMetrics.maintenanceAssets}</strong></span>
                <span><small>Retired / Lost</small><strong>{reports.assetMetrics.retiredAssets + reports.assetMetrics.lostAssets}</strong></span>
              </div>
            </article>
            <article className="report-card report-card-professional">
              <p className="metric-kicker">Requests</p>
              <strong>{reports.requestMetrics.totalRequests}</strong>
              <p>Workflow demand and delivery throughput.</p>
              <div className="report-stat-list">
                <span><small>Pending</small><strong>{reports.requestMetrics.pendingRequests}</strong></span>
                <span><small>Approved</small><strong>{reports.requestMetrics.approvedRequests}</strong></span>
                <span><small>Rejected</small><strong>{reports.requestMetrics.rejectedRequests}</strong></span>
                <span><small>Fulfilled</small><strong>{reports.requestMetrics.fulfilledRequests}</strong></span>
              </div>
            </article>
            <article className="report-card report-card-professional">
              <p className="metric-kicker">Assignments</p>
              <strong>{reports.assignmentMetrics.activeAssignments}</strong>
              <p>Active assets currently in employee use.</p>
              <div className="report-stat-list">
                <span><small>Returned</small><strong>{reports.assignmentMetrics.returnedAssignments}</strong></span>
                <span><small>Overdue</small><strong>{reports.assignmentMetrics.overdueAssignments}</strong></span>
              </div>
            </article>
            <article className="report-card report-card-professional">
              <p className="metric-kicker">Issues</p>
              <strong>{reports.issueMetrics.openIssues}</strong>
              <p>Open operational issues currently being monitored.</p>
              <div className="report-stat-list">
                <span><small>High priority</small><strong>{reports.issueMetrics.highPriorityIssues}</strong></span>
              </div>
            </article>
          </div>

          <div className="chart-panel-grid admin-report-chart-grid">
            <div className="report-panel">
              <div className="subpanel-header">
                <h4>Asset Distribution</h4>
                <span>Fleet mix</span>
              </div>
              <DonutChart data={assetStatusData} emptyLabel="No asset data available." />
            </div>
            <div className="report-panel">
              <div className="subpanel-header">
                <h4>Request Pipeline</h4>
                <span>Workflow load</span>
              </div>
              <HorizontalBarChart data={requestPipelineData} emptyLabel="No request data available." />
            </div>
            <div className="report-panel">
              <div className="subpanel-header">
                <h4>Assignment Health</h4>
                <span>Usage posture</span>
              </div>
              <HorizontalBarChart data={assignmentHealthData} emptyLabel="No assignment data available." />
            </div>
          </div>

          <div className="dashboard-bottom-row report-bottom-grid">
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
          <p className="dashboard-subtitle">
            Choose which role handles each step in the request approval and fulfillment chain.
          </p>
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
          <p className="dashboard-subtitle">
            Define when the admin should consider stock, overdue usage, and high-priority issues urgent.
          </p>
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

  const renderBackupSection = () => (
    (() => {
      const backupsPageKey = "backup-snapshots";
      const backupsPageSize = pageSizeByKey[backupsPageKey] || DEFAULT_ITEMS_PER_PAGE;
      const backupsTotalPages = Math.max(Math.ceil(systemControls.backups.length / backupsPageSize), 1);
      const backupsCurrentPage = Math.min(reportPageByKey[backupsPageKey] || 1, backupsTotalPages);
      const paginatedBackups = paginateRows(systemControls.backups, backupsCurrentPage, backupsPageSize);

      return (
    <section className="dashboard-panel wide-panel" id="backup">
      <div className="panel-header">
        <h3>Backup And Recovery</h3>
        <div className="panel-header-actions">
          <span>{systemControls.backups.length} snapshots</span>
          <button className="primary-btn compact-btn export-btn" type="button" onClick={() => void handleCreateBackup()} disabled={isCreatingBackup}>
            <RefreshCcw size={16} />
            {isCreatingBackup ? "Creating..." : "Create backup"}
          </button>
        </div>
      </div>
      <p className="dashboard-subtitle">
        Generate a JSON snapshot of the main system tables, download it for safekeeping, or restore a previous state when recovery is needed.
      </p>
      <div className="report-list">
        {paginatedBackups.map((backup) => (
          <article className="report-list-card" key={backup.id}>
            <div className="report-list-head">
              <strong>{backup.label}</strong>
              <span className={`status-badge status-${backup.snapshot_status}`}>{backup.snapshot_status}</span>
            </div>
            <div className="audit-log-meta">
              <span>Created: {new Date(backup.created_at).toLocaleString()}</span>
              <span>By: {backup.created_by_name || "System"}</span>
              <span>File: {backup.file_name}</span>
              <span>
                Restored: {backup.restored_at ? new Date(backup.restored_at).toLocaleString() : "Not yet"}
              </span>
            </div>
            <div className="table-action-group backup-action-group">
              <button
                className="table-action"
                type="button"
                onClick={() => void handleDownloadBackup(backup)}
                disabled={downloadingBackupId === backup.id}
              >
                {downloadingBackupId === backup.id ? "Downloading..." : "Download"}
              </button>
              <button
                className="table-action table-action-danger"
                type="button"
                onClick={() => void handleRestoreBackup(backup)}
                disabled={restoringBackupId === backup.id}
              >
                {restoringBackupId === backup.id ? "Restoring..." : "Restore"}
              </button>
            </div>
          </article>
        ))}
        {systemControls.backups.length === 0 ? <p className="loading-text">No backup snapshots created yet.</p> : null}
      </div>
      {renderPaginationBar(backupsPageKey, systemControls.backups.length, backupsCurrentPage, backupsPageSize, (page) =>
        setReportPageByKey((current) => ({
          ...current,
          [backupsPageKey]: page,
        }))
      )}
    </section>
      );
    })()
  );

  const renderAuditSection = () => (
    (() => {
      const auditPageKey = "audit-log-list";
      const auditPageSize = pageSizeByKey[auditPageKey] || DEFAULT_ITEMS_PER_PAGE;
      const auditTotalPages = Math.max(Math.ceil(auditLogs.length / auditPageSize), 1);
      const auditCurrentPage = Math.min(reportPageByKey[auditPageKey] || 1, auditTotalPages);
      const paginatedAuditLogs = paginateRows(auditLogs, auditCurrentPage, auditPageSize);

      return (
    <section className="dashboard-panel wide-panel" id="audit">
      <div className="panel-header">
        <h3>Audit Trail</h3>
        <div className="panel-header-actions">
          <span>{auditLogs.length} recent events</span>
          <button
            className="secondary-btn compact-btn export-btn"
            type="button"
            onClick={() => void handleExportAuditLogs()}
            disabled={isExportingAuditLogs}
          >
            <Download size={16} />
            {isExportingAuditLogs ? "Exporting..." : "Export Document"}
          </button>
        </div>
      </div>
      <div className="audit-log-list">
        {paginatedAuditLogs.map((log) => (
          <article className="audit-log-card" key={log.id}>
            <div className="audit-log-head">
              <strong>{log.action_label}</strong>
              <span>{new Date(log.created_at).toLocaleString()}</span>
            </div>
            <p>{log.details || "No extra details."}</p>
            <div className="audit-log-meta">
              <span>Actor: {log.actor_name || log.actor_email || "System"}</span>
              <span>Target: {log.target_name || log.target_email || "N/A"}</span>
            </div>
          </article>
        ))}
        {auditLogs.length === 0 ? <p className="loading-text">No audit activity recorded yet.</p> : null}
      </div>
      {renderPaginationBar(auditPageKey, auditLogs.length, auditCurrentPage, auditPageSize, (page) =>
        setReportPageByKey((current) => ({
          ...current,
          [auditPageKey]: page,
        }))
      )}
    </section>
      );
    })()
  );

  const renderPermissionsSection = () => {
    const permissionsPageKey = "permissions-list";
    const permissionsPageSize = pageSizeByKey[permissionsPageKey] || DEFAULT_ITEMS_PER_PAGE;
    const permissionsTotalPages = Math.max(Math.ceil(lookups.permissions.length / permissionsPageSize), 1);
    const permissionsCurrentPage = Math.min(reportPageByKey[permissionsPageKey] || 1, permissionsTotalPages);
    const paginatedPermissions = paginateRows(lookups.permissions, permissionsCurrentPage, permissionsPageSize);

    return (
      <section className="dashboard-panel" id="permissions">
        <div className="panel-header">
          <h3>Permissions</h3>
          <span>{lookups.permissions.length} records</span>
        </div>
        <form className="simple-form" onSubmit={handleCreatePermission}>
          <label className="field">
            <span>Code</span>
            <input
              value={permissionForm.code}
              onChange={(event) => setPermissionForm({ ...permissionForm, code: event.target.value })}
              required
            />
          </label>
          <label className="field">
            <span>Name</span>
            <input
              value={permissionForm.name}
              onChange={(event) => setPermissionForm({ ...permissionForm, name: event.target.value })}
              required
            />
          </label>
          <label className="field">
            <span>Module</span>
            <input
              value={permissionForm.moduleName}
              onChange={(event) => setPermissionForm({ ...permissionForm, moduleName: event.target.value })}
              required
            />
          </label>
          <button className="primary-btn form-submit-btn" type="submit">
            Add Permission
          </button>
        </form>
        <div className="mini-list">
          {paginatedPermissions.map((permission) => (
            <article className="mini-list-card" key={permission.id}>
              <strong>{permission.name}</strong>
              <span>{permission.code} / {permission.module_name}</span>
            </article>
          ))}
        </div>
        {renderPaginationBar(permissionsPageKey, lookups.permissions.length, permissionsCurrentPage, permissionsPageSize, (page) =>
          setReportPageByKey((current) => ({
            ...current,
            [permissionsPageKey]: page,
          }))
        )}
      </section>
    );
  };

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
            <p className="dashboard-subtitle">Manage branches and departments together in one clean workspace.</p>
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

  const renderAdminTablesSection = () => (
    <section className="dashboard-panel" id="admin-tables">
      <div className="panel-header">
        <h3>Admin Data Scope</h3>
      </div>
      <div className="table-list">
        <article className="table-card">
          <h3>users</h3>
          <p>Create admin-managed user accounts and assign them to real roles.</p>
          <small>Connected to live MySQL records</small>
        </article>
        <article className="table-card">
          <h3>roles / permission</h3>
          <p>Define access layers and action-level privileges from this dashboard.</p>
          <small>Role and permission forms are active</small>
        </article>
        <article className="table-card">
          <h3>branches / department</h3>
          <p>Build the organization structure before assigning users and assets.</p>
          <small>Location hierarchy is functional</small>
        </article>
      </div>
    </section>
  );

  const renderModulesSection = () => {
    const modulesPageKey = "modules-list";
    const modulesPageSize = pageSizeByKey[modulesPageKey] || DEFAULT_ITEMS_PER_PAGE;
    const modulesTotalPages = Math.max(Math.ceil(moduleSummary.length / modulesPageSize), 1);
    const modulesCurrentPage = Math.min(reportPageByKey[modulesPageKey] || 1, modulesTotalPages);
    const paginatedModules = paginateRows(moduleSummary, modulesCurrentPage, modulesPageSize);

    return (
      <section className="dashboard-panel" id="modules">
        <div className="panel-header">
          <h3>Platform Modules</h3>
        </div>
        <div className="module-grid module-grid-compact">
          {paginatedModules.map((module) => (
            <article className="module-card" key={module.name}>
              <h3>{module.name}</h3>
              <p>{module.value}</p>
            </article>
          ))}
        </div>
        {renderPaginationBar(modulesPageKey, moduleSummary.length, modulesCurrentPage, modulesPageSize, (page) =>
          setReportPageByKey((current) => ({
            ...current,
            [modulesPageKey]: page,
          }))
        )}
      </section>
    );
  };

  const renderQrSection = () => (
    <section className="dashboard-panel" id="qr-panel">
      <div className="panel-header">
        <h3>User QR</h3>
      </div>
      {selectedQrUser && qrImageUrl ? (
        <div className="qr-card stacked-qr-card">
          <div className="qr-preview">
            <img src={qrImageUrl} alt={`${selectedQrUser.fullName} QR code`} />
          </div>
          <div className="qr-details">
            <p>
              <strong>Name:</strong> {selectedQrUser.fullName}
            </p>
            <p>
              <strong>Employee Code:</strong> {selectedQrUser.employeeCode || "Not assigned"}
            </p>
            <p>
              <strong>Role:</strong> {selectedQrUser.role}
            </p>
            <button className="primary-btn qr-download-btn" type="button" onClick={handleDownloadQr}>
              Download QR
            </button>
          </div>
        </div>
      ) : (
        <p className="loading-text">Select a user to preview their QR code.</p>
      )}
    </section>
  );

  const renderSystemSettingsSection = () => (
    <>
      <section className="dashboard-panel wide-panel" id="system-settings">
        <div className="panel-header">
          <div>
            <h3>System Center</h3>
            <p className="dashboard-subtitle">Advanced administration tools are grouped here so daily admin work stays simple.</p>
          </div>
        </div>
        <div className="report-summary-grid">
          <article className="report-card report-card-professional">
            <p className="metric-kicker">Access Control</p>
            <strong>{lookups.roles.length + lookups.permissions.length}</strong>
            <p>Role and permission records that shape access across the system.</p>
          </article>
          <article className="report-card report-card-professional">
            <p className="metric-kicker">Backups</p>
            <strong>{systemControls.backups.length}</strong>
            <p>Recovery snapshots available for restore or download.</p>
          </article>
          <article className="report-card report-card-professional">
            <p className="metric-kicker">Audit Logs</p>
            <strong>{auditLogs.length}</strong>
            <p>Recorded admin and system actions for accountability.</p>
          </article>
          <article className="report-card report-card-professional">
            <p className="metric-kicker">Utilities</p>
            <strong>{moduleSummary.length + 2}</strong>
            <p>Module summaries, QR utilities, and data-scope references.</p>
          </article>
        </div>
      </section>
      {renderRolesSection()}
      {renderPermissionsSection()}
      {renderBackupSection()}
      {renderAuditSection()}
      {renderModulesSection()}
      {renderQrSection()}
      {renderAdminTablesSection()}
    </>
  );

  const renderActiveSection = () => {
    switch (activeSection) {
      case "users":
        return renderUsersSection();
      case "reports":
        return renderReportsSection();
      case "policies":
        return renderPoliciesSection();
      case "locations":
        return renderLocationsSection();
      case "system-settings":
        return renderSystemSettingsSection();
      case "backup":
        return renderBackupSection();
      case "audit":
        return renderAuditSection();
      case "roles":
        return renderRolesSection();
      case "permissions":
        return renderPermissionsSection();
      case "branches":
        return renderBranchesSection();
      case "departments":
        return renderDepartmentsSection();
      case "admin-tables":
        return renderAdminTablesSection();
      case "modules":
        return renderModulesSection();
      case "qr-panel":
        return renderQrSection();
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
              <h2>
                {activeSection === "overview"
                  ? "Dashboard"
                  : activeSection
                      .split("-")
                      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
                      .join(" ")}
              </h2>
              <p className="dashboard-subtitle">
                Manage admin content section by section instead of troubleshooting one long page.
              </p>
            </div>
            <div className="dashboard-breadcrumb">
              <span>Home</span>
              <span>/</span>
              <span>Admin Dashboard</span>
              <span>/</span>
              <span>
                {activeSection === "overview"
                  ? "Overview"
                  : activeSection
                      .split("-")
                      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
                      .join(" ")}
              </span>
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
                description="Collecting users, assets, reports, and system controls for the latest admin view."
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
