import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { LucideIcon } from "lucide-react";
import QRCode from "qrcode";
import {
  Bell,
  Boxes,
  Building2,
  ChevronDown,
  CheckCheck,
  ClipboardCheck,
  Download,
  ExternalLink,
  FileChartColumn,
  FolderInput,
  LayoutDashboard,
  PackageCheck,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  TimerReset,
  TriangleAlert,
  UserCog,
  UserRound,
  Users,
  Warehouse,
  Wrench,
} from "lucide-react";
import AccountSettingsPanel from "./AccountSettingsPanel";
import AirtelLogo from "./AirtelLogo";
import DashboardWaveLoader from "./DashboardWaveLoader";
import DashboardToast from "./DashboardToast";
import OverviewShortcutCard from "./OverviewShortcutCard";
import { DonutChart, HorizontalBarChart } from "./RoleCharts";
import UserMenu from "./UserMenu";
import { fetchJson, getApiMessage, parseApiResponse } from "../api";
import { API_BASE_URL } from "../config";
import type { LoggedInUser } from "../types";

type RoleView = "branch-manager" | "hr" | "it-manager" | "it-support" | "warehouse" | "employee";
type StockControlView = "available" | "returned" | "retired";

type ExportFormat = "html" | "csv" | "json" | "markdown";

type WorkflowStep = {
  id: number;
  request_id: number;
  step_key: string;
  step_label: string;
  actor_role: string;
  actor_user_id: number | null;
  action_status: "pending" | "approved" | "rejected" | "fulfilled" | "returned";
  action_note: string | null;
  acted_at: string | null;
  actor_name: string | null;
};

type RequestRow = {
  id: number;
  requester_id: number;
  category_id: number;
  approver_id: number | null;
  request_status: "pending" | "approved" | "rejected" | "fulfilled";
  request_type?: "standard" | "new_hire" | "replacement" | "loss_theft";
  target_employee_user_id?: number | null;
  source_request_id?: number | null;
  source_equipment_id?: number | null;
  replacement_disposition?: "available" | "retired" | null;
  replacement_condition_status?: string | null;
  report_type?: "loss" | "theft" | null;
  booked_equipment_id?: number | null;
  final_security_approval_status?: "pending" | "approved" | "rejected";
  final_security_approved_at?: string | null;
  hrms_snapshot?: HrmsSnapshot | string | null;
  fulfillment_status: "ready" | "waiting_stock" | "backordered" | "on_hold" | "fulfilled" | "kept_in_service";
  fulfillment_note: string | null;
  fulfillment_updated_at: string | null;
  clarification_status?: "none" | "needed";
  clarification_note?: string | null;
  clarification_requested_by?: number | null;
  clarification_requested_at?: string | null;
  clarification_target_user_id?: number | null;
  clarification_target_role?: string | null;
  notes: string | null;
  created_at: string;
  requested_at: string;
  requester_name: string;
  requester_email: string;
  requester_department_name: string | null;
  requester_job_title: string | null;
  requester_employment_status: string | null;
  requester_office_location: string | null;
  requester_start_date: string | null;
  requester_branch_id: number | null;
  requester_country_id: number | null;
  category_name: string;
  branch_name: string | null;
  country_name: string | null;
  approver_name: string | null;
  target_employee_name?: string | null;
  target_employee_email?: string | null;
  target_employee_code?: string | null;
  target_employee_phone_number?: string | null;
  target_employee_job_title?: string | null;
  target_employee_employment_status?: string | null;
  target_employee_office_location?: string | null;
  target_employee_start_date?: string | null;
  target_employee_grade?: string | null;
  target_employee_hrms_employee_id?: string | null;
  target_employee_role_name?: string | null;
  target_employee_department_name?: string | null;
  workflowSteps: WorkflowStep[];
  currentStageKey: string;
  currentStageLabel: string;
};

type AssignmentRow = {
  id: number;
  equipment_id: number;
  employee_user_id: number;
  assigned_by: number;
  assigned_at: string;
  expected_return_date: string | null;
  status: "active" | "returned" | "overdue";
  receipt_status: "pending" | "received";
  received_confirmed_at: string | null;
  receipt_note: string | null;
  notes: string | null;
  asset_tag: string;
  equipment_name: string;
  serial_number: string;
  computer_name: string | null;
  vendor_name: string | null;
  model_name: string | null;
  purchase_date: string | null;
  purchase_year: number | null;
  purchase_cost: number | null;
  location_details: string | null;
  device_health: string | null;
  warranty_end_date: string | null;
  lifespan_years: number | null;
  equipment_specs: EquipmentSpecs | string | null;
  category_name: string | null;
  branch_name: string | null;
  country_name: string | null;
  employee_name: string;
  employee_email: string;
  employee_job_title: string | null;
  employee_employment_status: string | null;
  employee_office_location: string | null;
  employee_start_date: string | null;
  assigned_by_name: string;
  replacement_request_id?: number | null;
  replacement_request_status?: "pending" | "approved" | "rejected" | "fulfilled" | null;
  replacement_disposition?: "available" | "retired" | null;
  replacement_condition_status?: string | null;
  replacement_processed_at?: string | null;
};

type ReturnRow = {
  id: number;
  assignment_id: number;
  equipment_id: number;
  employee_user_id: number;
  requested_by: number;
  received_by?: number | null;
  return_reason?: "standard" | "leaving_job" | null;
  it_manager_user_id: number | null;
  storekeeper_user_id: number | null;
  request_note: string | null;
  it_review_note: string | null;
  intake_note: string | null;
  received_condition_comment?: string | null;
  condition_status: string | null;
  disposition: string | null;
  return_attachment_name?: string | null;
  return_attachment_type?: string | null;
  return_status: "it_review" | "store_intake" | "awaiting_final_approval" | "returned_to_employee" | "requested" | "completed" | "rejected" | "maintenance";
  final_hrd_approval_status?: "pending" | "approved" | "rejected";
  final_hrd_approved_at?: string | null;
  final_itd_approval_status?: "pending" | "approved" | "rejected";
  final_itd_approved_at?: string | null;
  requested_at: string;
  returned_at?: string | null;
  it_reviewed_at: string | null;
  processed_at: string | null;
  asset_tag: string;
  equipment_name: string;
  employee_name: string;
  employee_email: string;
  employee_job_title: string | null;
  employee_employment_status: string | null;
  employee_office_location: string | null;
  employee_start_date: string | null;
  received_by_name?: string | null;
  it_manager_name: string | null;
  storekeeper_name: string | null;
};

type EquipmentRow = {
  id: number;
  asset_tag: string;
  serial_number: string;
  computer_name: string | null;
  equipment_name: string;
  status: "available" | "assigned" | "reserved" | "maintenance" | "retired" | "lost" | "replaced";
  stock_location?: "it_stock" | "warehouse_stock" | string;
  category_id: number;
  branch_id: number | null;
  country_id: number | null;
  vendor_name: string | null;
  model_name: string | null;
  purchase_date: string | null;
  purchase_year: number | null;
  purchase_cost: number | null;
  location_details: string | null;
  device_health: string | null;
  warranty_end_date: string | null;
  lifespan_years: number | null;
  equipment_specs: EquipmentSpecs | string | null;
  replacement_request_id?: number | null;
  replacement_request_status?: "pending" | "approved" | "rejected" | "fulfilled" | null;
  replacement_disposition?: "available" | "retired" | null;
  replacement_condition_status?: string | null;
  replacement_processed_at?: string | null;
  category_name: string | null;
  branch_name: string | null;
  country_name: string | null;
};

type CategoryRow = {
  id: number;
  name: string;
  depreciation_rate: number;
};

type MoveOrderRow = {
  id: number;
  request_number: string;
  requested_by_user_id: number;
  warehouse_user_id: number | null;
  destination_branch_id: number | null;
  destination_branch_name: string | null;
  status: "pending" | "approved" | "rejected" | "fulfilled" | string;
  receipt_status: "pending" | "received" | string;
  reason: string | null;
  note: string | null;
  reviewed_note: string | null;
  reviewed_at: string | null;
  received_confirmed_at: string | null;
  fulfilled_at: string | null;
  created_at: string;
  requester_name: string;
  requester_email: string;
  warehouse_name: string | null;
  warehouse_email: string | null;
  items: Array<{
    id: number;
    move_order_request_id: number;
    equipment_id: number | null;
    requested_category_id: number | null;
    requested_quantity: number;
    item_note: string | null;
    asset_tag: string | null;
    equipment_name: string | null;
    serial_number: string | null;
    equipment_status: string | null;
    stock_location: string | null;
    branch_id: number | null;
    branch_name: string | null;
    category_name: string | null;
    requested_category_name: string | null;
  }>;
};

type DetailEntityType = "request" | "equipment" | "assignment" | "employee" | "return" | "issue" | "maintenance";

type DetailPanelState = {
  type: DetailEntityType;
  title: string;
  subtitle: string;
  rows: Array<{ label: string; value: string }>;
  qrEquipment?: EquipmentRow | null;
};

type ReplacementRiskInsight = {
  score: number;
  recommendation: string;
  reasons: string[];
  observedOutcome: string;
};

type IssueRow = {
  id: number;
  equipment_id: number;
  reported_by: number;
  issue_title: string;
  issue_description: string | null;
  priority: string;
  issue_status: string;
  created_at: string;
  asset_tag: string;
  equipment_name: string;
  reported_by_name: string;
};

type EmployeeRow = {
  id: number | string;
  employee_code?: string | null;
  full_name: string;
  first_name?: string;
  last_name?: string;
  email: string;
  phone_number?: string | null;
  job_title: string | null;
  employment_status: string | null;
  office_location: string | null;
  start_date: string | null;
  status?: string;
  hrms_employee_id?: string | null;
  employee_grade?: string | null;
  branch_id: number | null;
  country_id: number | null;
  department_id: number | null;
  linked_user_id?: number | null;
  ims_account_status?: string | null;
  branch_name: string | null;
  country_name: string | null;
  department_name: string | null;
};

type MaintenanceRecord = {
  id: number;
  equipment_id: number;
  return_id: number | null;
  reported_by: number | null;
  assigned_to: number | null;
  maintenance_status: "under_repair" | "repaired" | "not_repairable";
  condition_status: string | null;
  problem_description: string | null;
  resolution_note: string | null;
  final_disposition: string | null;
  started_at: string;
  completed_at: string | null;
  asset_tag: string;
  equipment_name: string;
  branch_id: number | null;
  country_id: number | null;
  branch_name: string | null;
  country_name: string | null;
  reported_by_name: string | null;
  employee_name: string | null;
};

type LifecycleEvent = {
  id: number;
  equipment_id: number;
  actor_user_id: number | null;
  event_type: string;
  event_label: string;
  event_note: string | null;
  from_status: string | null;
  to_status: string | null;
  related_record_type: string | null;
  related_record_id: number | null;
  created_at: string;
  asset_tag: string;
  equipment_name: string;
  actor_name: string | null;
};

type SmartAlert = {
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
};

type NotificationRow = {
  id: number;
  title: string;
  message: string | null;
  status: string;
  created_at: string;
};

type ReplacementInsightRow = {
  equipmentId: number;
  assetTag: string;
  equipmentName: string;
  categoryName: string | null;
  branchName: string | null;
  status: string;
  score: number;
  recommendation: string;
  supportGuidance: string;
  reasons: string[];
  maintenanceSummary: {
    repairedCount: number;
    underRepairCount: number;
    notRepairableCount: number;
    downtimeDays: number;
    maintenanceEventsLast180Days: number;
  };
  issueCount: number;
  ml?: {
    modelVersion: string | null;
    probability: number;
  } | null;
};

type GlobalSearchResult = {
  id: string;
  entityType: DetailEntityType | "move-order";
  entityId: number;
  section: string;
  title: string;
  subtitle: string;
  metadata: string;
};

type ReportCount = {
  label: string;
  total: number;
};

type WorkflowDashboardData = {
  currentUser?: LoggedInUser;
  categories: CategoryRow[];
  equipment: EquipmentRow[];
  requests: RequestRow[];
  employees: EmployeeRow[];
  assignments: AssignmentRow[];
  returns: ReturnRow[];
  issues: IssueRow[];
  maintenanceRecords: MaintenanceRecord[];
  lifecycleEvents: LifecycleEvent[];
  smartAlerts: SmartAlert[];
  replacementInsights: ReplacementInsightRow[];
  notifications: NotificationRow[];
  reports: {
    requestStatus: ReportCount[];
    equipmentStatus: ReportCount[];
    assignmentStatus: ReportCount[];
    roleCounts: Array<{ role_name: string; total: number }>;
  };
};

function createEmptyWorkflowDashboardData(currentUser: LoggedInUser): WorkflowDashboardData {
  return {
    currentUser,
    categories: [],
    equipment: [],
    requests: [],
    employees: [],
    assignments: [],
    returns: [],
    issues: [],
    maintenanceRecords: [],
    lifecycleEvents: [],
    smartAlerts: [],
    replacementInsights: [],
    notifications: [],
    reports: {
      requestStatus: [],
      equipmentStatus: [],
      assignmentStatus: [],
      roleCounts: [],
    },
  };
}

type StockForm = {
  assetTag: string;
  serialNumber: string;
  computerName: string;
  equipmentName: string;
  categoryId: string;
  vendorName: string;
  modelName: string;
  cpu: string;
  status: string;
  ram: string;
  storageCapacity: string;
  storageType: string;
  osVersion: string;
  purchaseYear: string;
  purchaseCost: string;
  purchaseDate: string;
  locationDetails: string;
  deviceHealth: string;
  warrantyEndDate: string;
  lifespanYears: string;
  includedAccessories: string[];
  accessoryNotes: string;
};

type AccessoryBundleProfile = {
  required: string[];
  suggested: string[];
  guidance: string;
};

type RequestFormState = {
  categoryId: string;
  requestType: "standard" | "new_hire" | "replacement" | "loss_theft";
  hrmsEmployeeRecordId: string;
  targetEmployeeUserId: string;
  expectedDeviceSpecs: string;
  notes: string;
  requestDate: string;
  sourceEquipmentId: string;
  reportType: "loss" | "theft";
  incidentScope: "during_work" | "outside_work";
};

type HrmsSnapshot = {
  requesterId?: number | null;
  hrmsEmployeeRecordId?: number | null;
  targetEmployeeUserId?: number | null;
  linkedImsUserId?: number | null;
  employeeCode?: string | null;
  employeeName?: string | null;
  employeeEmail?: string | null;
  roleName?: string | null;
  departmentName?: string | null;
  employeeGrade?: string | null;
  hrmsEmployeeId?: string | null;
  jobTitle?: string | null;
  employmentStatus?: string | null;
  officeLocation?: string | null;
  startDate?: string | null;
  expectedDeviceSpecs?: string | null;
  recommendedDeviceProfile?: string | null;
};

type EmployeeFormState = {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  employeeCode: string;
  hrmsEmployeeId: string;
  employeeGrade: string;
  jobTitle: string;
  employmentStatus: string;
  officeLocation: string;
  startDate: string;
  status: "active" | "inactive" | "pending";
};

type EquipmentSpecs = {
  cpu?: string;
  ram?: string;
  storage?: string;
  storageCapacity?: string;
  storageType?: string;
  processor?: string;
  osVersion?: string;
  operatingSystem?: string;
  bundleType?: string;
  requiredAccessories?: string[];
  suggestedAccessories?: string[];
  accessories?: string[];
  accessoryNotes?: string;
};

type SidebarLink = {
  label: string;
  href: string;
  icon: LucideIcon;
  external?: boolean;
};

type SidebarGroup = {
  title: string;
  icon: LucideIcon;
  links: SidebarLink[];
};

type WorkflowRoleDashboardProps = {
  user: LoggedInUser;
  onLogout: () => void;
  onUserUpdate: (user: LoggedInUser) => void;
  roleView: RoleView;
};

type TimelineFilter = "all" | "pending" | "approved" | "rejected" | "fulfilled";
type DateWindowFilter = "all" | "weekly" | "monthly";

type FulfillmentStatus = "ready" | "waiting_stock" | "backordered" | "on_hold";
type ReplacementDisposition = "available" | "retired";

const openFulfillmentStatuses = new Set(["waiting_stock", "backordered", "on_hold"]);
const storageDeviceCategoryNames = new Set(["laptop", "desktop", "smartphone", "phone", "mobile phone", "tablet"]);
const DEFAULT_ITEMS_PER_PAGE = 3;
const PAGE_SIZE_OPTIONS = [3, 6, 9];
const equipmentAccessoryMap: Record<string, AccessoryBundleProfile> = {
  desktop: {
    required: ["CPU / system unit", "Screen / monitor", "Keyboard", "Mouse"],
    suggested: ["Power cable", "HDMI / VGA cable", "UPS", "Headset", "Webcam", "Ethernet cable"],
    guidance: "Desktop registration should capture the full workstation kit, then add any extra peripherals issued with it.",
  },
  laptop: {
    required: ["Laptop bag", "Power adapter", "Mouse", "USB-C to VGA / HDMI dongle"],
    suggested: ["Docking station", "External keyboard", "Headset", "Laptop stand", "Ethernet adapter", "Privacy screen"],
    guidance: "Laptop registration should reflect the issued handover bundle, not only the computer body.",
  },
  smartphone: {
    required: ["Power adapter", "USB charging cable"],
    suggested: ["Protective case", "Screen protector", "SIM eject tool", "Power bank", "Earbuds"],
    guidance: "Capture core mobile accessories and add any field-support extras where needed.",
  },
  tablet: {
    required: ["Power adapter", "USB charging cable"],
    suggested: ["Protective case", "Stylus", "Keyboard cover", "Screen protector"],
    guidance: "Tablet kits can include accessories for travel, note taking, and desk use.",
  },
};

function isReplacementAssignment(assignment: AssignmentRow) {
  return Boolean(assignment.replacement_request_id);
}

const roleConfigs: Record<
  RoleView,
  {
    title: string;
    chipLabel: string;
    subtitle: string;
    sidebarGroups: SidebarGroup[];
  }
> = {
  "branch-manager": {
    title: "Branch Manager Dashboard",
    chipLabel: "Branch Manager",
    subtitle: "Approve branch requests, watch branch assets, and follow local fulfillment.",
    sidebarGroups: [
      {
        title: "Branch Dashboard",
        icon: LayoutDashboard,
        links: [
          { label: "Overview", href: "#overview", icon: ClipboardCheck },
          { label: "Approvals", href: "#approvals", icon: ShieldCheck },
          { label: "Timeline", href: "#timeline", icon: FileChartColumn },
        ],
      },
      {
        title: "Branch Assets",
        icon: Building2,
        links: [
          { label: "Assets", href: "#assets", icon: Warehouse },
          { label: "Employees", href: "#employees", icon: Users },
          { label: "Reports", href: "#reports", icon: FileChartColumn },
        ],
      },
      {
        title: "Settings",
        icon: UserCog,
        links: [
          { label: "Settings", href: "#settings", icon: UserCog },
        ],
      },
    ],
  },
  hr: {
    title: "HR Recruitment Officer Dashboard",
    chipLabel: "HR Recruitment Officer",
    subtitle: "Use external HRMS employee data, launch equipment requests, and track approvals.",
    sidebarGroups: [
      {
        title: "HR Recruitment Workspace",
        icon: Users,
        links: [
          { label: "Overview", href: "#overview", icon: ClipboardCheck },
          { label: "Approvals", href: "#approvals", icon: ShieldCheck },
          { label: "Returns", href: "#returns", icon: RotateCcw },
          { label: "Employees", href: "#employees", icon: UserRound },
          { label: "New Request", href: "#new-request", icon: Send },
          { label: "My Requests", href: "#my-requests", icon: FolderInput },
          { label: "Enter HRMS", href: "http://127.0.0.1:4200", icon: ExternalLink, external: true },
          { label: "Timeline", href: "#timeline", icon: FileChartColumn },
        ],
      },
      {
        title: "HR Reports",
        icon: FileChartColumn,
        links: [{ label: "Reports", href: "#reports", icon: FileChartColumn }],
      },
      {
        title: "Settings",
        icon: UserCog,
        links: [
          { label: "Settings", href: "#settings", icon: UserCog },
        ],
      },
    ],
  },
  "it-manager": {
    title: "IT Manager Dashboard",
    chipLabel: "IT Manager",
    subtitle: "Approve technical requests, monitor issues, and keep equipment lifecycle healthy.",
    sidebarGroups: [
      {
        title: "IT Workspace",
        icon: Wrench,
        links: [
          { label: "Overview", href: "#overview", icon: ClipboardCheck },
          { label: "Approvals", href: "#approvals", icon: ShieldCheck },
          { label: "Return Checks", href: "#returns", icon: RotateCcw },
          { label: "Equipment", href: "#equipment", icon: Warehouse },
          { label: "Timeline", href: "#timeline", icon: FileChartColumn },
        ],
      },
      {
        title: "IT Reports",
        icon: FileChartColumn,
        links: [{ label: "Reports", href: "#reports", icon: FileChartColumn }],
      },
      {
        title: "Settings",
        icon: UserCog,
        links: [
          { label: "Notifications", href: "#notifications", icon: Bell },
          { label: "Settings", href: "#settings", icon: UserCog },
        ],
      },
    ],
  },
  "it-support": {
    title: "IT Support Engineer Dashboard",
    chipLabel: "IT Support Engineer",
    subtitle: "Request devices from warehouse, receive approved transfers into IT stock, assign equipment, and process returns.",
    sidebarGroups: [
      {
        title: "Store Operations",
        icon: PackageCheck,
        links: [
          { label: "Overview", href: "#overview", icon: ClipboardCheck },
          { label: "Approvals", href: "#approvals", icon: ShieldCheck },
          { label: "Move Orders", href: "#move-orders", icon: FolderInput },
          { label: "Fulfillment", href: "#fulfillment", icon: FolderInput },
          { label: "Returns", href: "#returns", icon: RotateCcw },
          { label: "Assigned Items", href: "#employee-assigned", icon: UserRound },
          { label: "Stock", href: "#stock", icon: Boxes },
          { label: "Timeline", href: "#timeline", icon: FileChartColumn },
        ],
      },
      {
        title: "Settings",
        icon: UserCog,
        links: [
          { label: "Notifications", href: "#notifications", icon: Bell },
          { label: "Settings", href: "#settings", icon: UserCog },
        ],
      },
    ],
  },
  warehouse: {
    title: "Warehouse Manager Dashboard",
    chipLabel: "Warehouse Manager",
    subtitle: "Control warehouse inventory, approve IT move orders, and release stock to IT support.",
    sidebarGroups: [
      {
        title: "Warehouse Operations",
        icon: Warehouse,
        links: [
          { label: "Overview", href: "#overview", icon: ClipboardCheck },
          { label: "Move Orders", href: "#move-orders", icon: FolderInput },
          { label: "Stock", href: "#stock", icon: Boxes },
          { label: "Timeline", href: "#timeline", icon: FileChartColumn },
        ],
      },
      {
        title: "Warehouse Reports",
        icon: FileChartColumn,
        links: [{ label: "Reports", href: "#reports", icon: FileChartColumn }],
      },
      {
        title: "Settings",
        icon: UserCog,
        links: [
          { label: "Notifications", href: "#notifications", icon: Bell },
          { label: "Settings", href: "#settings", icon: UserCog },
        ],
      },
    ],
  },
  employee: {
    title: "Employee Dashboard",
    chipLabel: "Employee",
    subtitle: "Request new equipment, follow every approval step, and see what is assigned to you.",
    sidebarGroups: [
      {
        title: "My Workspace",
        icon: UserRound,
        links: [
          { label: "Overview", href: "#overview", icon: ClipboardCheck },
          { label: "New Request", href: "#new-request", icon: FolderInput },
          { label: "My Requests", href: "#my-requests", icon: ShieldCheck },
          { label: "My Equipment", href: "#my-equipment", icon: Warehouse },
          { label: "Return Requests", href: "#return-requests", icon: RotateCcw },
          { label: "Timeline", href: "#timeline", icon: FileChartColumn },
        ],
      },
      {
        title: "My Reports",
        icon: FileChartColumn,
        links: [{ label: "Reports", href: "#reports", icon: FileChartColumn }],
      },
      {
        title: "Settings",
        icon: UserCog,
        links: [
          { label: "Notifications", href: "#notifications", icon: Bell },
          { label: "Settings", href: "#settings", icon: UserCog },
        ],
      },
    ],
  },
};

function WorkflowRoleDashboard({ user, onLogout, onUserUpdate, roleView }: WorkflowRoleDashboardProps) {
  const todayDateValue = new Date().toISOString().slice(0, 10);
  const config = roleConfigs[roleView];
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeSection, setActiveSection] = useState("overview");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    Object.fromEntries(config.sidebarGroups.map((group) => [group.title, true])),
  );
  const [dashboardData, setDashboardData] = useState<WorkflowDashboardData>(() => createEmptyWorkflowDashboardData(user));
  const [isLoading, setIsLoading] = useState(false);
  const [pendingSubmitState, setPendingSubmitState] = useState<{ title: string; description: string } | null>(null);
  const [dashboardError, setDashboardError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [pendingRequestActionId, setPendingRequestActionId] = useState<number | null>(null);
  const [requestForm, setRequestForm] = useState<RequestFormState>({
    categoryId: "",
    requestType: roleView === "hr" ? "new_hire" : "standard",
    hrmsEmployeeRecordId: "",
    targetEmployeeUserId: "",
    expectedDeviceSpecs: "",
    notes: "",
    requestDate: todayDateValue,
    sourceEquipmentId: "",
    reportType: "loss",
    incidentScope: "during_work",
  });
  const [hrEmployeeIdSearch, setHrEmployeeIdSearch] = useState("");
  const [employeeForm, setEmployeeForm] = useState<EmployeeFormState>({
    firstName: "",
    lastName: "",
    email: "",
    phoneNumber: "",
    employeeCode: "",
    hrmsEmployeeId: "",
    employeeGrade: "",
    jobTitle: "",
    employmentStatus: "active",
    officeLocation: "",
    startDate: todayDateValue,
    status: "active",
  });
  const [editingEmployeeId, setEditingEmployeeId] = useState<number | null>(null);
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);
  const [editingRequestId, setEditingRequestId] = useState<number | null>(null);
  const [approvalNotes, setApprovalNotes] = useState<Record<number, string>>({});
  const [fulfillmentForm, setFulfillmentForm] = useState<
    Record<
      number,
      {
        equipmentId: string;
        expectedReturnDate: string;
        note: string;
        fulfillmentStatus: FulfillmentStatus;
        replacementDisposition: ReplacementDisposition;
        replacementConditionStatus: string;
      }
    >
  >({});
  const [issueForm, setIssueForm] = useState({
    equipmentId: "",
    issueTitle: "",
    issueDescription: "",
    priority: "medium",
    issueStatus: "open",
  });
  const [editingIssueId, setEditingIssueId] = useState<number | null>(null);
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>("all");
  const [timelineSpecificDate, setTimelineSpecificDate] = useState("");
  const [reportDateWindow, setReportDateWindow] = useState<DateWindowFilter>("all");
  const [reportSpecificDate, setReportSpecificDate] = useState("");
  const [moveOrderDateWindow, setMoveOrderDateWindow] = useState<DateWindowFilter>("all");
  const [moveOrderSpecificDate, setMoveOrderSpecificDate] = useState("");
  const [moveOrderSearchTerm, setMoveOrderSearchTerm] = useState("");
  const [requestSearchTerm, setRequestSearchTerm] = useState("");
  const [warehouseStockDateWindow, setWarehouseStockDateWindow] = useState<DateWindowFilter>("all");
  const [warehouseStockSpecificDate, setWarehouseStockSpecificDate] = useState("");
  const [globalSearchTerm, setGlobalSearchTerm] = useState("");
  const [itSupportStockSearchTerm, setItSupportStockSearchTerm] = useState("");
  const [chartFocusByKey, setChartFocusByKey] = useState<Record<string, string>>({});
  const [notificationFilter, setNotificationFilter] = useState<"all" | "unread" | "alerts">("all");
  const [editingEquipmentId, setEditingEquipmentId] = useState<number | null>(null);
  const [isStockFormOpen, setIsStockFormOpen] = useState(false);
  const [isStockListOpen, setIsStockListOpen] = useState(true);
  const [stockControlView, setStockControlView] = useState<StockControlView>("available");
  const [exportFormat, setExportFormat] = useState<ExportFormat>("html");
  const [requestPageByKey, setRequestPageByKey] = useState<Record<string, number>>({});
  const [returnPageByKey, setReturnPageByKey] = useState<Record<string, number>>({});
  const [pageSizeByKey, setPageSizeByKey] = useState<Record<string, number>>({});
  const [assignmentMlPredictions, setAssignmentMlPredictions] = useState<
    Record<number, { probability: number; recommendation: string; modelVersion: string } | null | undefined>
  >({});
  const [assignmentMlLoading, setAssignmentMlLoading] = useState<Record<number, boolean>>({});
  const [newStockCategoryName, setNewStockCategoryName] = useState("");
  const [customStockAccessory, setCustomStockAccessory] = useState("");
  const [moveOrders, setMoveOrders] = useState<MoveOrderRow[]>([]);
  const [warehouseEquipment, setWarehouseEquipment] = useState<EquipmentRow[]>([]);
  const [moveOrderItems, setMoveOrderItems] = useState<Array<{ categoryId: string; quantity: number }>>([]);
  const [moveOrderItemCategoryId, setMoveOrderItemCategoryId] = useState("");
  const [moveOrderItemQuantity, setMoveOrderItemQuantity] = useState("1");
  const [moveOrderReason, setMoveOrderReason] = useState("");
  const [moveOrderNote, setMoveOrderNote] = useState("");
  const [warehouseDecisionNotes, setWarehouseDecisionNotes] = useState<Record<number, string>>({});
  const [selectedBranchEmployeeId, setSelectedBranchEmployeeId] = useState<number | null>(null);
  const [selectedDetailPanel, setSelectedDetailPanel] = useState<DetailPanelState | null>(null);
  const [selectedQrEquipment, setSelectedQrEquipment] = useState<EquipmentRow | null>(null);
  const [selectedQrAudience, setSelectedQrAudience] = useState<"employee" | "internal">("internal");
  const [equipmentQrImageUrl, setEquipmentQrImageUrl] = useState("");
  const [isEquipmentQrLoading, setIsEquipmentQrLoading] = useState(false);
  const [equipmentQrError, setEquipmentQrError] = useState("");
  const [selectedReportKey, setSelectedReportKey] = useState("");
  const [returnRequestNotes, setReturnRequestNotes] = useState<Record<number, string>>({});
  const [returnRequestReasons, setReturnRequestReasons] = useState<Record<number, "standard" | "leaving_job">>({});
  const [returnRequestAttachments, setReturnRequestAttachments] = useState<
    Record<number, { fileName: string; fileType: string; fileData: string }>
  >({});
  const [receiptNotes, setReceiptNotes] = useState<Record<number, string>>({});
  const [returnProcessForm, setReturnProcessForm] = useState<
    Record<number, { conditionStatus: string; disposition: string; intakeNote: string; action: "complete" | "reject" }>
  >({});
  const [itReturnReviewForm, setItReturnReviewForm] = useState<
    Record<number, { conditionStatus: string; disposition: string; reviewNote: string; action: "forward" | "return_to_employee" | "reject" }>
  >({});
  const [maintenanceCloseForm, setMaintenanceCloseForm] = useState<
    Record<number, { maintenanceStatus: "repaired" | "not_repairable"; finalDisposition: string; resolutionNote: string }>
  >({});
  const [finalReturnApprovalForm, setFinalReturnApprovalForm] = useState<
    Record<number, { decision: "approve" | "reject"; note: string }>
  >({});
  const [stockForm, setStockForm] = useState<StockForm>({
    assetTag: "",
    serialNumber: "",
    computerName: "",
    equipmentName: "",
    categoryId: "",
    vendorName: "",
    modelName: "",
    cpu: "",
    status: "available",
    ram: "",
    storageCapacity: "",
    storageType: "SSD",
    osVersion: "",
    purchaseYear: "",
    purchaseCost: "",
    purchaseDate: "",
    locationDetails: "",
    deviceHealth: "Healthy",
    warrantyEndDate: "",
    lifespanYears: "4",
    includedAccessories: [],
    accessoryNotes: "",
  });

  const loadDashboard = async () => {
    setIsLoading(true);
    setDashboardError("");

    try {
      const { response, data } = await fetchJson<WorkflowDashboardData>(`${API_BASE_URL}/workflow/dashboard?userId=${user.id}`);

      if (!response.ok) {
        throw new Error(getApiMessage(data, "Failed to load workflow dashboard."));
      }

      if (!data) {
        throw new Error("Workflow dashboard returned an empty response.");
      }

      setDashboardData(data);
    } catch (error) {
      setDashboardData((current) => current || createEmptyWorkflowDashboardData(user));
      setDashboardError(error instanceof Error ? error.message : "Dashboard load failed.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setDashboardData(createEmptyWorkflowDashboardData(user));
    void loadDashboard();
  }, [user.id]);

  const loadTransferWorkspace = async () => {
    if (!["it-support", "warehouse"].includes(roleView)) {
      setMoveOrders([]);
      setWarehouseEquipment([]);
      return;
    }

    try {
      const moveOrdersResult = await fetchJson<MoveOrderRow[]>(`${API_BASE_URL}/move-orders?userId=${user.id}`);
      if (moveOrdersResult.response.ok && moveOrdersResult.data) {
        setMoveOrders(moveOrdersResult.data);
      }

      if (roleView === "warehouse") {
        const warehouseEquipmentResult = await fetchJson<EquipmentRow[]>(`${API_BASE_URL}/warehouse/equipment?userId=${user.id}`);
        if (warehouseEquipmentResult.response.ok && warehouseEquipmentResult.data) {
          setWarehouseEquipment(warehouseEquipmentResult.data);
        }
      } else {
        setWarehouseEquipment([]);
      }
    } catch {
      // Keep the existing dashboard working even if the transfer workspace fails to load.
    }
  };

  useEffect(() => {
    void loadTransferWorkspace();
  }, [roleView, user.id]);

  const categories = dashboardData?.categories ?? [];
  const equipment = dashboardData?.equipment ?? [];
  const requests = dashboardData?.requests ?? [];
  const employees = dashboardData?.employees ?? [];
  const assignments = dashboardData?.assignments ?? [];
  const returns = dashboardData?.returns ?? [];
  const issues = dashboardData?.issues ?? [];
  const maintenanceRecords = dashboardData?.maintenanceRecords ?? [];
  const lifecycleEvents = dashboardData?.lifecycleEvents ?? [];
  const smartAlerts = dashboardData?.smartAlerts ?? [];
  const replacementInsights = dashboardData?.replacementInsights ?? [];
  const notifications = dashboardData?.notifications ?? [];
  const normalizedHrEmployeeIdSearch = hrEmployeeIdSearch.trim().toLowerCase();
  const filteredHrEmployeesForRequest = normalizedHrEmployeeIdSearch
    ? employees.filter((employee) => {
        const hrmsId = String(employee.hrms_employee_id || "").toLowerCase();
        const employeeCode = String(employee.employee_code || "").toLowerCase();
        return hrmsId.includes(normalizedHrEmployeeIdSearch) || employeeCode.includes(normalizedHrEmployeeIdSearch);
      })
    : [];
  const [dismissedNotificationIds, setDismissedNotificationIds] = useState<number[]>([]);
  const unreadNotificationCount = notifications.filter((item) => item.status === "unread" && !dismissedNotificationIds.includes(item.id)).length;
  const currentUser = dashboardData?.currentUser ?? user;
  const hasDashboardRecords =
    categories.length > 0 ||
    equipment.length > 0 ||
    requests.length > 0 ||
    employees.length > 0 ||
    assignments.length > 0 ||
    returns.length > 0 ||
    issues.length > 0 ||
    maintenanceRecords.length > 0 ||
    notifications.length > 0;
  const selectedStockCategory = categories.find((category) => String(category.id) === stockForm.categoryId);
  const resolvedEquipmentName = selectedStockCategory?.name || stockForm.equipmentName.trim();
  const isStorageDeviceStockForm = selectedStockCategory
    ? storageDeviceCategoryNames.has(selectedStockCategory.name.toLowerCase())
    : false;

  const normalizeWorkflowLabel = (label: string) =>
    label === "HR Device Booking" ? "Device Booking" : label;

  const parseEquipmentSpecs = (value: EquipmentRow["equipment_specs"]): EquipmentSpecs => {
    if (!value) {
      return {};
    }

    if (typeof value === "string") {
      try {
        return JSON.parse(value) as EquipmentSpecs;
      } catch {
        return {};
      }
    }

    return value;
  };
  const parseHrmsSnapshot = (value: RequestRow["hrms_snapshot"]): HrmsSnapshot => {
    if (!value) {
      return {};
    }

    if (typeof value === "string") {
      try {
        return JSON.parse(value) as HrmsSnapshot;
      } catch {
        return {};
      }
    }

    return value;
  };
  const getEmployeeLinkedUserId = (employee: EmployeeRow) => employee.linked_user_id || null;
  const getAccessoryProfileForCategory = (categoryName: string | null | undefined) =>
    equipmentAccessoryMap[String(categoryName || "").trim().toLowerCase()] ?? null;
  const selectedAccessoryProfile = getAccessoryProfileForCategory(selectedStockCategory?.name);
  const requiredStockAccessories = selectedAccessoryProfile?.required ?? [];
  const existingAssetTags = useMemo(
    () =>
      Array.from(
        new Set(
          (equipment ?? []).map((item) => String(item.asset_tag || "").trim()).filter(Boolean),
        ),
      ),
    [equipment],
  );

  const normalizeAssetTagCategoryCode = (categoryName: string | null | undefined) => {
    const normalized = String(categoryName || "").trim().toLowerCase();
    if (!normalized) {
      return "";
    }

    if (normalized.includes("desktop")) {
      return "DESKTOP";
    }

    if (normalized.includes("laptop") || normalized.includes("notebook")) {
      return "LAPTOP";
    }

    if (normalized.includes("phone") || normalized.includes("smartphone") || normalized.includes("mobile")) {
      return "PHONE";
    }

    return normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").toUpperCase();
  };

  const normalizeAssetTagCountrySegment = (countryName: string | null | undefined) => {
    const normalized = String(countryName || "RWANDA").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return normalized || "RWANDA";
  };

  const buildAssetTagFromCategory = (categoryName: string | null | undefined) => {
    const categoryCode = normalizeAssetTagCategoryCode(categoryName);
    if (!categoryCode) {
      return "";
    }

    const prefix = `AIRTEL-${normalizeAssetTagCountrySegment(currentUser?.country_name)}`;
    const base = `${prefix}-${categoryCode}-`;
    const matcher = new RegExp(`^${base.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}(\\d+)$`, "i");
    const largestIndex = existingAssetTags.reduce((max, tag) => {
      const match = matcher.exec(tag);
      if (!match) {
        return max;
      }

      const currentValue = Number(match[1]);
      return Number.isFinite(currentValue) ? Math.max(max, currentValue) : max;
    }, 0);

    return `${base}${String(largestIndex + 1).padStart(5, "0")}`;
  };

  const suggestedStockAccessories = useMemo(
    () =>
      Array.from(
        new Set(
          (selectedAccessoryProfile?.suggested ?? []).filter(
            (accessory) => !requiredStockAccessories.includes(accessory),
          ),
        ),
      ),
    [requiredStockAccessories, selectedAccessoryProfile],
  );
  const selectedOptionalAccessories = useMemo(
    () =>
      stockForm.includedAccessories.filter((accessory) => !requiredStockAccessories.includes(accessory)),
    [requiredStockAccessories, stockForm.includedAccessories],
  );
  const optionalStockAccessories = useMemo(
    () =>
      Array.from(new Set([...suggestedStockAccessories, ...selectedOptionalAccessories])),
    [selectedOptionalAccessories, suggestedStockAccessories],
  );
  const hasAccessoryChecklist = requiredStockAccessories.length > 0 || optionalStockAccessories.length > 0;
  const formatEquipmentAccessories = (item: EquipmentRow) => {
    const specs = parseEquipmentSpecs(item.equipment_specs);
    return Array.isArray(specs.accessories) && specs.accessories.length > 0 ? specs.accessories.join(", ") : "";
  };
  const formatEquipmentAccessoryNotes = (item: EquipmentRow) => {
    const specs = parseEquipmentSpecs(item.equipment_specs);
    return specs.accessoryNotes?.trim() || "";
  };
  const formatEquipmentSpecs = (item: EquipmentRow) => {
    const specs = parseEquipmentSpecs(item.equipment_specs);
    const parts = [
      specs.cpu || specs.processor,
      specs.ram,
      specs.storageType && (specs.storageCapacity || specs.storage)
        ? `${specs.storageCapacity || specs.storage} ${specs.storageType}`.trim()
        : specs.storageCapacity || specs.storage,
      specs.osVersion || specs.operatingSystem,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(" / ") : "";
  };
  const formatAssignmentEquipmentSpecs = (assignment: AssignmentRow) =>
    formatEquipmentSpecs({
      id: assignment.equipment_id,
      asset_tag: assignment.asset_tag,
      serial_number: assignment.serial_number,
      computer_name: assignment.computer_name,
      equipment_name: assignment.equipment_name,
      status: "assigned",
      category_id: 0,
      branch_id: null,
      country_id: null,
      vendor_name: assignment.vendor_name,
      model_name: assignment.model_name,
      purchase_date: assignment.purchase_date,
      purchase_year: assignment.purchase_year,
      purchase_cost: assignment.purchase_cost,
      location_details: assignment.location_details,
      device_health: assignment.device_health,
      warranty_end_date: assignment.warranty_end_date,
      lifespan_years: assignment.lifespan_years,
      equipment_specs: assignment.equipment_specs,
      category_name: assignment.category_name,
      branch_name: assignment.branch_name,
      country_name: assignment.country_name,
    });
  const buildEquipmentRowFromAssignment = (assignment: AssignmentRow): EquipmentRow => ({
    id: assignment.equipment_id,
    asset_tag: assignment.asset_tag,
    serial_number: assignment.serial_number,
    computer_name: assignment.computer_name,
    equipment_name: assignment.equipment_name,
    status: assignment.status === "returned" && isReplacementAssignment(assignment) ? "replaced" : "assigned",
    category_id: 0,
    branch_id: null,
    country_id: null,
    vendor_name: assignment.vendor_name,
    model_name: assignment.model_name,
    purchase_date: assignment.purchase_date,
    purchase_year: assignment.purchase_year,
    purchase_cost: assignment.purchase_cost,
    location_details: assignment.location_details,
    device_health: assignment.device_health,
    warranty_end_date: assignment.warranty_end_date,
    lifespan_years: assignment.lifespan_years,
    equipment_specs: assignment.equipment_specs,
    category_name: assignment.category_name,
    branch_name: assignment.branch_name,
    country_name: assignment.country_name,
  });

  const employeeRequests = requests.filter(
    (request) => request.requester_id === user.id || request.target_employee_user_id === user.id,
  );
  const filteredEmployeeRequests = employeeRequests.filter((request) =>
    request.category_name.toLowerCase().includes(requestSearchTerm.trim().toLowerCase()),
  );
  const employeeAssignments = assignments.filter((assignment) => assignment.employee_user_id === user.id);
  const employeeReturnRequests = returns.filter((item) => item.employee_user_id === user.id);

  const branchRequests = requests.filter((request) => request.requester_branch_id === user.branchId);
  const branchEmployees = employees.filter((employee) => employee.branch_id === user.branchId);
  const branchEquipment = equipment.filter((item) => item.branch_id === user.branchId);
  const branchAssignmentMap = new Map(
    assignments
      .filter(
        (assignment) =>
          assignment.status === "active" &&
          branchEquipment.some((item) => item.id === assignment.equipment_id),
      )
      .map((assignment) => [assignment.equipment_id, assignment]),
  );
  const branchAssignedEquipment = branchEquipment.filter((item) => branchAssignmentMap.has(item.id));
  const branchAvailableEquipment = branchEquipment.filter((item) => !branchAssignmentMap.has(item.id));
  const branchEquipmentIds = new Set(branchEquipment.map((item) => item.id));
  const branchAssignments = assignments.filter((assignment) => branchEquipmentIds.has(assignment.equipment_id));
  const selectedBranchEmployeeAssignments = selectedBranchEmployeeId
    ? branchAssignments.filter((assignment) => assignment.employee_user_id === selectedBranchEmployeeId)
    : [];
  const selectedBranchEmployee = selectedBranchEmployeeAssignments[0] ?? null;
  const getAssignmentsForEmployee = (employeeId: number) =>
    assignments.filter((assignment) => assignment.employee_user_id === employeeId);

  const buildDetailPanel = (type: DetailEntityType, id: number): DetailPanelState | null => {
    if (type === "request") {
      const item = requests.find((request) => request.id === id);
      if (!item) {
        return null;
      }

      return {
        type,
        title: `Request ${item.id}`,
        subtitle: `${item.category_name} / ${item.request_status}`,
        rows: [
          { label: "Requester", value: item.requester_name },
          { label: "Type", value: (item.request_type || "standard").replace(/_/g, " ") },
          { label: "Current stage", value: normalizeWorkflowLabel(item.currentStageLabel) },
          { label: "Branch", value: item.branch_name || "No branch" },
          { label: "Requested", value: formatProfileDate(item.requested_at || item.created_at) },
          { label: "Note", value: item.notes || "No request note provided." },
        ],
      };
    }

    if (type === "equipment") {
      const item = equipment.find((record) => record.id === id);
      if (!item) {
        return null;
      }
      const risk = getEquipmentReplacementRisk(item);

      return {
        type,
        title: item.asset_tag,
        subtitle: `${item.equipment_name} / ${item.status}`,
        qrEquipment: item,
        rows: [
          { label: "Serial number", value: item.serial_number },
          { label: "Category", value: item.category_name || "Not set" },
          { label: "Branch", value: item.branch_name || "No branch" },
          { label: "Purchase date", value: formatProfileDate(item.purchase_date) },
          { label: "Depreciation", value: getEquipmentDepreciationSummary(item) },
          { label: "Replacement recommendation", value: `${risk.recommendation}: ${risk.score}%` },
          { label: "Risk factors", value: risk.reasons.join(" / ") },
          { label: "Observed outcome", value: risk.observedOutcome },
          { label: "Replacement target", value: getReplacementDate(item.purchase_date, item.lifespan_years, item.purchase_year) },
          { label: "Specs", value: formatEquipmentSpecs(item) || "Not set" },
        ],
      };
    }

    if (type === "assignment") {
      const item = assignments.find((record) => record.id === id);
      if (!item) {
        return null;
      }
      const assignmentEquipment = buildEquipmentRowFromAssignment(item);
      const risk = getEquipmentReplacementRisk(assignmentEquipment);

      return {
        type,
        title: item.asset_tag,
        subtitle: `${item.equipment_name} assigned to ${item.employee_name}`,
        qrEquipment: assignmentEquipment,
        rows: [
          { label: "Assignment status", value: item.status },
          { label: "Receipt", value: getAssignmentReceiptLabel(item) },
          { label: "Assigned date", value: formatProfileDate(item.assigned_at) },
          { label: "Expected return", value: formatProfileDate(item.expected_return_date) },
          { label: "Depreciation", value: getAssignmentDepreciationSummary(item) },
          { label: "Replacement recommendation", value: `${risk.recommendation}: ${risk.score}%` },
          { label: "Risk factors", value: risk.reasons.join(" / ") },
          { label: "Observed outcome", value: risk.observedOutcome },
          { label: "Specs", value: formatAssignmentEquipmentSpecs(item) || "Not set" },
        ],
      };
    }

    if (type === "employee") {
      const item = employees.find((record) => record.id === id || record.linked_user_id === id);
      if (!item) {
        return null;
      }

      return {
        type,
        title: item.full_name,
        subtitle: item.email,
        rows: [
          { label: "Employee code", value: item.employee_code || "Not set" },
          { label: "Job title", value: item.job_title || "Not set" },
          { label: "Department", value: item.department_name || "Not set" },
          { label: "Office location", value: item.office_location || "Not set" },
          { label: "HRMS ID", value: item.hrms_employee_id || "Not set" },
          { label: "Start date", value: formatProfileDate(item.start_date) },
        ],
      };
    }

    return null;
  };

  const loadEquipmentQrPreview = async (item: EquipmentRow) => {
    setIsEquipmentQrLoading(true);
    setEquipmentQrError("");

    try {
      const audience = roleView === "employee" ? "employee" : "internal";
      const dataUrl = await QRCode.toDataURL(buildEquipmentQrPayload(item, audience), {
        width: 240,
        margin: 2,
        color: {
          dark: "#000000",
          light: "#ffffff",
        },
      });

      setSelectedQrEquipment(item);
      setSelectedQrAudience(audience);
      setEquipmentQrImageUrl(dataUrl);
      return dataUrl;
    } catch (error) {
      setEquipmentQrError(error instanceof Error ? error.message : "Failed to generate equipment QR code.");
      return "";
    } finally {
      setIsEquipmentQrLoading(false);
    }
  };

  const openDetailPanel = async (type: DetailEntityType, id: number) => {
    const detail = buildDetailPanel(type, id);
    if (!detail) {
      return;
    }

    setSelectedDetailPanel(detail);
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("detail", encodeDetailToken(type, id));
    window.history.replaceState({}, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);

    if (detail.qrEquipment) {
      await loadEquipmentQrPreview(detail.qrEquipment);
    }

    if (type === "equipment" || type === "assignment") {
      const equipmentId = type === "equipment" ? id : assignments.find((record) => record.id === id)?.equipment_id;
      if (!equipmentId) {
        return;
      }

      try {
        const { response, data } = await fetchJson<{ probability: number; recommendation: string; modelVersion: string; message?: string }>(
          `${API_BASE_URL}/ml/replacement/predict?actorUserId=${user.id}&equipmentId=${equipmentId}`,
        );

        if (response.ok && data && typeof data.probability === "number") {
          setSelectedDetailPanel((current) => {
            if (!current || current.type !== type) {
              return current;
            }

            const formatted = `${Math.round(data.probability * 100)}% (${data.recommendation}${data.modelVersion ? `, ${data.modelVersion}` : ""})`;
            const existingIndex = current.rows.findIndex((row) => row.label === "ML replacement likelihood");
            const nextRows = [...current.rows];

            if (existingIndex >= 0) {
              nextRows[existingIndex] = { label: "ML replacement likelihood", value: formatted };
            } else {
              nextRows.splice(3, 0, { label: "ML replacement likelihood", value: formatted });
            }

            return {
              ...current,
              rows: nextRows,
            };
          });
        }

        const { response: failureResponse, data: failureData } = await fetchJson<{ probability: number; recommendation: string; modelVersion: string; message?: string }>(
          `${API_BASE_URL}/ml/failure/predict?actorUserId=${user.id}&equipmentId=${equipmentId}`,
        );

        if (failureResponse.ok && failureData && typeof failureData.probability === "number") {
          setSelectedDetailPanel((current) => {
            if (!current || current.type !== type) {
              return current;
            }

            const formatted = `${Math.round(failureData.probability * 100)}% (${failureData.recommendation}${failureData.modelVersion ? `, ${failureData.modelVersion}` : ""})`;
            const existingIndex = current.rows.findIndex((row) => row.label === "ML failure risk");
            const nextRows = [...current.rows];

            if (existingIndex >= 0) {
              nextRows[existingIndex] = { label: "ML failure risk", value: formatted };
            } else {
              nextRows.splice(4, 0, { label: "ML failure risk", value: formatted });
            }

            return {
              ...current,
              rows: nextRows,
            };
          });
        }
      } catch {
        // Ignore ML prediction errors (fallback to heuristics already shown).
      }
    }
  };

  const closeDetailPanel = () => {
    setSelectedDetailPanel(null);
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.delete("detail");
    window.history.replaceState({}, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
  };

  const handleOpenGlobalSearchResult = async (result: GlobalSearchResult) => {
    setActiveSection(result.section);

    if (result.entityType === "move-order") {
      return;
    }

    await openDetailPanel(result.entityType, result.entityId);
  };

  const getWorkflowStepTone = (status: string) => {
    if (status === "approved" || status === "fulfilled" || status === "received" || status === "returned") {
      return "done";
    }

    if (status === "rejected") {
      return "failed";
    }

    if (status === "pending") {
      return "current";
    }

    return "idle";
  };

  const renderWorkflowProgress = (
    steps: Array<{ id: string | number; label: string; status: string; note?: string | null }>,
    caption?: string,
  ) => (
    <div className="workflow-progress-shell">
      <div className="workflow-progress-strip">
        {steps.map((step) => {
          const tone = getWorkflowStepTone(step.status);

          return (
            <article className={`workflow-progress-node is-${tone}`} key={step.id}>
              <span className="workflow-progress-dot" aria-hidden="true" />
              <strong>{normalizeWorkflowLabel(step.label)}</strong>
              <span>{formatLabelText(step.status)}</span>
              {step.note ? <small>{step.note}</small> : null}
            </article>
          );
        })}
      </div>
      {caption ? <p className="workflow-progress-caption">{caption}</p> : null}
    </div>
  );

  const renderRequestWorkflowProgress = (request: RequestRow) => {
    const nextPendingStep = request.workflowSteps.find((step) => step.action_status === "pending");
    const fulfillmentStatus = request.fulfillment_status as RequestRow["fulfillment_status"];
    let caption = "Workflow is moving through approvals and fulfillment.";

    if (request.request_status === "fulfilled") {
      caption = fulfillmentStatus === "kept_in_service"
        ? "Request completed and the existing device is retained."
        : "Request completed and delivered.";
    } else if (request.request_status === "rejected") {
      caption = `Rejected at ${normalizeWorkflowLabel(
        request.workflowSteps.find((step) => step.action_status === "rejected")?.step_label || "approval workflow",
      )}.`;
    } else if (nextPendingStep) {
      caption = `Waiting on ${nextPendingStep.actor_role}.`;
    }

    return renderWorkflowProgress(
      request.workflowSteps.map((step) => ({
        id: step.id,
        label: step.step_label,
        status: step.action_status,
        note: step.actor_name || step.action_note || "",
      })),
      caption,
    );
  };

  const renderMoveOrderWorkflowProgress = (order: MoveOrderRow) => {
    const steps = [
      {
        id: `${order.id}-requested`,
        label: "Requested",
        status: "approved",
        note: formatProfileDate(order.created_at),
      },
      {
        id: `${order.id}-review`,
        label: "Warehouse review",
        status: order.status === "rejected" ? "rejected" : order.status === "pending" ? "pending" : "approved",
        note: order.reviewed_note || order.warehouse_name || "Pending warehouse review",
      },
      {
        id: `${order.id}-release`,
        label: "Release to IT stock",
        status: ["approved", "partial", "fulfilled"].includes(order.status) ? "approved" : order.status === "rejected" ? "rejected" : "pending",
        note: order.items.length ? `${order.items.length} item(s)` : "No items released",
      },
      {
        id: `${order.id}-receipt`,
        label: "Receipt confirmed",
        status: order.receipt_status === "received" ? "received" : order.status === "rejected" ? "rejected" : "pending",
        note: order.received_confirmed_at ? formatProfileDate(order.received_confirmed_at) : "Waiting for IT support",
      },
    ];

    return renderWorkflowProgress(steps, `Current order status: ${formatLabelText(order.status)}.`);
  };

  const renderSearchPanel = () => {
    if (!activeGlobalSearchTerm) {
      return null;
    }

    return (
      <section className="dashboard-panel global-search-panel">
        <div className="panel-header">
          <div>
            <h3>Global Search Results</h3>
            <p className="dashboard-subtitle">Search across requests, assets, assignments, employees, and move orders from one place.</p>
          </div>
          <span>{globalSearchResults.length} matches</span>
        </div>
        {globalSearchResults.length > 0 ? (
          <div className="global-search-results">
            {globalSearchResults.map((result) => (
              <button
                className="global-search-result-card"
                key={result.id}
                type="button"
                onClick={() => void handleOpenGlobalSearchResult(result)}
              >
                <span className="global-search-result-type">{formatLabelText(result.entityType.replace("-", " "))}</span>
                <strong>{result.title}</strong>
                <span>{result.subtitle}</span>
                <small>{result.metadata}</small>
              </button>
            ))}
          </div>
        ) : (
          <div className="notification-empty-state">
            <Search size={22} strokeWidth={2.2} />
            <strong>No matches found</strong>
            <p>Try searching by company code, serial number, employee name, request number, or branch.</p>
          </div>
        )}
      </section>
    );
  };

  const renderFocusPanel = (
    title: string,
    rows: Array<{ key: string; title: string; subtitle: string; meta: string }>,
    emptyState: string,
  ) => (
    <section className="dashboard-panel focus-panel-card">
      <div className="panel-header">
        <h3>{title}</h3>
        <span>{rows.length} match(es)</span>
      </div>
      {rows.length > 0 ? (
        <div className="mini-list">
          {rows.slice(0, 6).map((row) => (
            <article className="mini-list-card" key={row.key}>
              <strong>{row.title}</strong>
              <span>{row.subtitle}</span>
              <span>{row.meta}</span>
            </article>
          ))}
        </div>
      ) : (
        <p className="loading-text">{emptyState}</p>
      )}
    </section>
  );

  const renderReplacementAdvisoryPanel = (title: string, subtitle: string, items: ReplacementInsightRow[]) => (
    <section className="dashboard-panel replacement-advisory-panel">
      <div className="panel-header">
        <div>
          <h3>{title}</h3>
          <p className="dashboard-subtitle">{subtitle}</p>
        </div>
        <span>{items.length} tracked</span>
      </div>
      {items.length > 0 ? (
        <div className="mini-list">
          {items.slice(0, 5).map((item) => (
            <article className="mini-list-card replacement-advisory-card" key={`replacement-${item.equipmentId}`}>
              <div className="replacement-advisory-head">
                <div>
                  <strong>{item.assetTag}</strong>
                  <span>{item.equipmentName}</span>
                </div>
                <span className={`status-pill status-${item.recommendation === "Replace recommended" ? "lost" : item.recommendation === "Review for replacement" ? "pending" : "available"}`}>
                  {item.recommendation}
                </span>
              </div>
              <span>
                ML prediction: {item.ml ? `${Math.round(item.ml.probability * 100)}%${item.ml.modelVersion ? ` (${item.ml.modelVersion})` : ""}` : "Model not trained yet"}
              </span>
              <span>Replacement score: {item.score}%</span>
              <span>{item.reasons.join(" / ")}</span>
              <span>{item.supportGuidance}</span>
            </article>
          ))}
        </div>
      ) : (
        <p className="loading-text">No replacement candidates are flagged in this view right now.</p>
      )}
    </section>
  );

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("detail");

    if (!token) {
      setSelectedDetailPanel(null);
      return;
    }

    const decoded = decodeDetailToken(token);
    if (!decoded) {
      closeDetailPanel();
      return;
    }

    const detail = buildDetailPanel(decoded.type, decoded.id);
    if (!detail) {
      closeDetailPanel();
      return;
    }

    setSelectedDetailPanel(detail);
    if (detail.qrEquipment) {
      void loadEquipmentQrPreview(detail.qrEquipment);
    }
  }, [dashboardData]);

  useEffect(() => {
    if (activeSection !== "notifications") {
      return;
    }

    const unreadIds = notifications.filter((item) => item.status === "unread").map((item) => item.id);

    if (unreadIds.length === 0) {
      return;
    }

    setDismissedNotificationIds((current) => Array.from(new Set([...current, ...unreadIds])));
  }, [activeSection, notifications]);

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

  const requestSource =
    roleView === "employee"
      ? employeeRequests
      : roleView === "branch-manager"
        ? branchRequests
        : requests;

  const isLivePendingRequest = (request: RequestRow) =>
    request.request_status === "pending" ||
    (request.request_status === "approved" && openFulfillmentStatuses.has(request.fulfillment_status));

  const timelineRequests = requestSource.filter((request) => {
    if (!isSameSelectedDate(request.requested_at || request.created_at, timelineSpecificDate)) {
      return false;
    }

    if (timelineFilter === "all") {
      return true;
    }

    if (timelineFilter === "pending") {
      return isLivePendingRequest(request);
    }

    return request.request_status === timelineFilter;
  });

  const branchApprovals = branchRequests.filter(() => false);

  const filteredMoveOrders = moveOrders.filter((order) => {
    const matchesDate = (moveOrderSpecificDate ? true : isWithinDateWindow(order.created_at, moveOrderDateWindow))
      && isSameSelectedDate(order.created_at, moveOrderSpecificDate);

    if (!matchesDate) {
      return false;
    }

    const normalizedSearch = moveOrderSearchTerm.trim().toLowerCase();
    if (!normalizedSearch) {
      return true;
    }

    return [
      order.request_number,
      order.requester_name,
      order.destination_branch_name,
      order.reason,
      order.note,
      order.reviewed_note,
      order.status,
      order.receipt_status,
      ...order.items.flatMap((item) => [
        item.asset_tag,
        item.equipment_name,
        item.category_name,
        item.requested_category_name,
      ]),
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalizedSearch));
  });

  const hrApprovals = requests.filter((request) => {
    if (request.request_status !== "pending") {
      return false;
    }

    const pendingStep = request.workflowSteps.find((step) => step.action_status === "pending");
    return pendingStep?.actor_role === user.role;
  });

  const itSupportApprovals = requests.filter((request) => {
    if (request.request_status !== "pending") {
      return false;
    }

    const pendingStep = request.workflowSteps.find((step) => step.action_status === "pending");
    return pendingStep?.actor_role === user.role;
  });

  const itApprovals = requests.filter(
    (request) =>
      ["it_inventory_review", "itd_approval", "it_preparation", "security_review"].includes(request.currentStageKey) &&
      request.request_status === "pending",
  );

  const fulfillmentRequests = requests.filter(
    (request) =>
      request.request_status !== "fulfilled" &&
      request.request_status !== "rejected" &&
      (request.currentStageKey === "store_fulfillment" || openFulfillmentStatuses.has(request.fulfillment_status)),
  );
  const pendingItReturnReviews = returns.filter((item) => item.return_status === "it_review");
  const pendingFinalReturnApprovals = returns.filter((item) => {
    if (item.return_status !== "awaiting_final_approval") {
      return false;
    }

    if (roleView === "it-manager") {
      return user.role === "IT Director" && item.final_itd_approval_status !== "approved";
    }

    return false;
  });
  const openMaintenanceRecords = maintenanceRecords.filter(
    (item) => item.maintenance_status === "under_repair" && (!user.branchId || item.branch_id === user.branchId),
  );

  const availableEquipment = equipment.filter((item) => item.status === "available");
  const itStockEquipment = equipment.filter((item) => item.stock_location !== "warehouse_stock");
  const availableItStockEquipment = itStockEquipment.filter((item) => item.status === "available");
  const localAvailableEquipment = availableItStockEquipment.filter((item) => !user.branchId || item.branch_id === user.branchId);
  const equipmentById = new Map(equipment.map((item) => [item.id, item]));
  const employeeActiveAssignmentOptions = employeeAssignments
    .filter((assignment) => assignment.status === "active")
    .map((assignment) => ({
      assignment,
      equipment: equipmentById.get(assignment.equipment_id) ?? null,
    }))
    .filter((item): item is { assignment: AssignmentRow; equipment: EquipmentRow } => item.equipment !== null);
  const disposedEquipment = equipment.filter(
    (item) =>
      item.stock_location !== "warehouse_stock" &&
      (!user.branchId || item.branch_id === user.branchId) &&
      (item.status === "retired" || item.status === "lost"),
  );
  const returnedHoldingAssignments = assignments
    .filter((assignment) => assignment.status === "returned")
    .filter((assignment) => !isReplacementAssignment(assignment))
    .filter((assignment) => {
      const relatedEquipment = equipmentById.get(assignment.equipment_id);
      return relatedEquipment ? !user.branchId || relatedEquipment.branch_id === user.branchId : false;
    })
    .map((assignment) => ({
      assignment,
      equipment: equipmentById.get(assignment.equipment_id) ?? null,
    }))
    .filter((item) => item.equipment !== null);
  const normalizedItSupportStockSearch = itSupportStockSearchTerm.trim().toLowerCase();
  const matchesItSupportStockSearch = (...values: Array<string | number | null | undefined>) =>
    !normalizedItSupportStockSearch ||
    values.some((value) => String(value || "").toLowerCase().includes(normalizedItSupportStockSearch));
  const filteredLocalAvailableEquipment = localAvailableEquipment.filter((item) =>
    matchesItSupportStockSearch(
      item.asset_tag,
      item.serial_number,
      item.equipment_name,
      item.category_name,
      item.branch_name,
      item.vendor_name,
      item.model_name,
      item.location_details,
      item.status,
    ),
  );
  const filteredDisposedEquipment = disposedEquipment.filter((item) =>
    matchesItSupportStockSearch(
      item.asset_tag,
      item.serial_number,
      item.equipment_name,
      item.category_name,
      item.branch_name,
      item.vendor_name,
      item.model_name,
      item.location_details,
      item.status,
      item.replacement_condition_status,
    ),
  );
  const filteredReturnedHoldingAssignments = returnedHoldingAssignments.filter(({ assignment, equipment: item }) =>
    matchesItSupportStockSearch(
      item?.asset_tag,
      item?.serial_number,
      item?.equipment_name,
      item?.category_name,
      item?.branch_name,
      item?.vendor_name,
      item?.model_name,
      item?.location_details,
      assignment.employee_name,
      assignment.employee_email,
      assignment.replacement_condition_status,
      assignment.status,
    ),
  );
  const pendingReturnIntake = returns.filter(
    (item) =>
      (item.return_status === "store_intake" || item.return_status === "requested") &&
      (() => {
        const relatedEquipment = equipmentById.get(item.equipment_id);
        return relatedEquipment ? !user.branchId || relatedEquipment.branch_id === user.branchId : false;
      })(),
  );
  const warehousePendingMoveOrders = filteredMoveOrders.filter((item) => item.status === "pending");
  const itSupportMoveOrders = filteredMoveOrders.filter((item) => item.requested_by_user_id === user.id);

  const formatProfileDate = (value?: string | null) =>
    value ? new Date(value).toLocaleDateString() : "Not set";
  const formatLabelText = (value: string) =>
    value
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  const toggleChartFocus = (chartKey: string, label: string) =>
    setChartFocusByKey((current) => ({
      ...current,
      [chartKey]: current[chartKey] === label ? "" : label,
    }));
  const activeGlobalSearchTerm = globalSearchTerm.trim().toLowerCase();
  const globalSearchResults = useMemo<GlobalSearchResult[]>(() => {
    if (!activeGlobalSearchTerm) {
      return [];
    }

    const matchesSearch = (...values: Array<string | number | null | undefined>) =>
      values.some((value) => String(value || "").toLowerCase().includes(activeGlobalSearchTerm));

    const results: GlobalSearchResult[] = [];

    requests.forEach((request) => {
      if (
        matchesSearch(
          request.id,
          request.category_name,
          request.requester_name,
          request.requester_email,
          request.branch_name,
          request.currentStageLabel,
          request.request_status,
          request.notes,
          request.target_employee_name,
          request.target_employee_email,
        )
      ) {
        results.push({
          id: `request-${request.id}`,
          entityType: "request",
          entityId: request.id,
          section: roleView === "employee" ? "my-requests" : "timeline",
          title: `${request.category_name} request ${request.id}`,
          subtitle: `${request.requester_name} / ${formatLabelText(request.request_status)}`,
          metadata: `${request.branch_name || "No branch"} / ${normalizeWorkflowLabel(request.currentStageLabel)}`,
        });
      }
    });

    equipment.forEach((item) => {
      if (
        matchesSearch(
          item.asset_tag,
          item.serial_number,
          item.equipment_name,
          item.category_name,
          item.branch_name,
          item.vendor_name,
          item.model_name,
          item.status,
        )
      ) {
        results.push({
          id: `equipment-${item.id}`,
          entityType: "equipment",
          entityId: item.id,
          section: roleView === "warehouse" ? "stock" : roleView === "employee" ? "my-equipment" : "stock",
          title: `${item.asset_tag} / ${item.equipment_name}`,
          subtitle: `${item.category_name || "No category"} / ${formatLabelText(item.status)}`,
          metadata: `${item.branch_name || "No branch"} / ${item.serial_number}`,
        });
      }
    });

    assignments.forEach((assignment) => {
      if (
        matchesSearch(
          assignment.asset_tag,
          assignment.serial_number,
          assignment.equipment_name,
          assignment.employee_name,
          assignment.employee_email,
          assignment.category_name,
          assignment.status,
        )
      ) {
        results.push({
          id: `assignment-${assignment.id}`,
          entityType: "assignment",
          entityId: assignment.id,
          section: roleView === "employee" ? "my-equipment" : "reports",
          title: `${assignment.asset_tag} assignment`,
          subtitle: `${assignment.employee_name} / ${formatLabelText(assignment.status)}`,
          metadata: `${assignment.equipment_name} / ${assignment.category_name || "No category"}`,
        });
      }
    });

    employees.forEach((employee) => {
      if (
        matchesSearch(
          employee.full_name,
          employee.email,
          employee.employee_code,
          employee.hrms_employee_id,
          employee.job_title,
          employee.department_name,
          employee.branch_name,
        )
      ) {
        results.push({
          id: `employee-${employee.id}`,
          entityType: "employee",
          entityId: Number(employee.id),
          section: "employees",
          title: employee.full_name,
          subtitle: `${employee.job_title || "No job title"} / ${employee.department_name || "No department"}`,
          metadata: `${employee.email} / ${employee.branch_name || "No branch"}`,
        });
      }
    });

    moveOrders.forEach((order) => {
      if (
        matchesSearch(
          order.request_number,
          order.requester_name,
          order.destination_branch_name,
          order.reason,
          order.note,
          order.status,
          order.receipt_status,
          order.items.map((item) => item.asset_tag || item.requested_category_name || item.category_name).join(" "),
        )
      ) {
        results.push({
          id: `move-order-${order.id}`,
          entityType: "move-order",
          entityId: order.id,
          section: "move-orders",
          title: order.request_number,
          subtitle: `${formatLabelText(order.status)} / receipt ${formatLabelText(order.receipt_status)}`,
          metadata: `${order.requester_name} / ${order.destination_branch_name || "No branch set"}`,
        });
      }
    });

    return results.slice(0, 12);
  }, [activeGlobalSearchTerm, assignments, employees, equipment, moveOrders, requests, roleView]);
  const visibleNotifications = notifications.filter((item) => {
    if (notificationFilter === "unread") {
      return item.status === "unread";
    }

    if (notificationFilter === "alerts") {
      return /alert|warning|critical|attention/i.test(`${item.title} ${item.message || ""}`);
    }

    return true;
  });
  const todayNotificationCount = notifications.filter((item) => {
    const createdAt = new Date(item.created_at);
    const today = new Date();
    return createdAt.toDateString() === today.toDateString();
  }).length;

  function getWindowStartDate(windowKey: DateWindowFilter) {
    const boundary = new Date();
    boundary.setHours(0, 0, 0, 0);

    if (windowKey === "weekly") {
      boundary.setDate(boundary.getDate() - 6);
      return boundary;
    }

    if (windowKey === "monthly") {
      boundary.setDate(boundary.getDate() - 29);
      return boundary;
    }

    return null;
  }

  function isWithinDateWindow(value: string | null | undefined, windowKey: DateWindowFilter) {
    if (windowKey === "all") {
      return true;
    }

    if (!value) {
      return false;
    }

    const parsedDate = new Date(value);
    if (Number.isNaN(parsedDate.getTime())) {
      return false;
    }

    const boundary = getWindowStartDate(windowKey);
    return boundary ? parsedDate >= boundary : true;
  }

  function isSameSelectedDate(value: string | null | undefined, selectedDate: string) {
    if (!selectedDate) {
      return true;
    }

    if (!value) {
      return false;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
      return String(value) === selectedDate;
    }

    const parsedDate = new Date(value);
    if (Number.isNaN(parsedDate.getTime())) {
      return false;
    }

    const localDate = `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, "0")}-${String(parsedDate.getDate()).padStart(2, "0")}`;
    return localDate === selectedDate;
  }

  const normalizeReportDateLabel = (windowKey: DateWindowFilter) =>
    windowKey === "weekly" ? "Weekly" : windowKey === "monthly" ? "Monthly" : "All time";

  const formatReturnStatus = (status: ReturnRow["return_status"]) =>
    ({
      it_review: "Waiting for IT check",
      store_intake: "Waiting for IT support intake",
      awaiting_final_approval: "Waiting for HRD and ITD approval",
      maintenance: "Under maintenance",
      returned_to_employee: "Returned to employee",
      requested: "Waiting for IT support intake",
      completed: "Completed",
      rejected: "Rejected",
    })[status];

  const formatReturnReason = (reason?: ReturnRow["return_reason"]) =>
    reason === "leaving_job" ? "Employee leaving job" : "Standard return";

  const patchRequestInDashboard = (updatedRequest: RequestRow) => {
    setDashboardData((current) => {
      if (!current) {
        return current;
      }

      const nextRequests = current.requests.map((request) =>
        request.id === updatedRequest.id ? updatedRequest : request,
      );

      return {
        ...current,
        requests: nextRequests,
        reports: {
          ...current.reports,
          requestStatus: ["pending", "approved", "rejected", "fulfilled"].map((status) => ({
            label: status,
            total: nextRequests.filter((item) =>
              status === "pending" ? isLivePendingRequest(item) : item.request_status === status,
            ).length,
          })),
        },
      };
    });
  };

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

  const submitAction = async (
    method: "POST" | "PUT" | "DELETE",
    url: string,
    payload?: object,
    successMessage?: string,
    options?: {
      refreshDashboard?: boolean;
      onSuccess?: (data: any) => void;
    },
  ) => {
    setActionError("");
    setActionMessage("");

    const submitCopy = (() => {
      if (method === "POST" && url === "/requests") {
        return {
          title: "Submitting request",
          description: "Sending your request to Airtel IMS and preparing the next approval step.",
        };
      }

      if (url.includes("/returns")) {
        return {
          title: "Processing return",
          description: "Updating the return workflow and syncing the latest stock movement.",
        };
      }

      if (url.includes("/issues")) {
        return {
          title: "Saving issue update",
          description: "Recording the issue details and refreshing the latest support information.",
        };
      }

      return {
        title: "Processing request",
        description: "Saving your changes and refreshing the latest dashboard data.",
      };
    })();

    setPendingSubmitState(submitCopy);

    try {
      const { response, data } = await fetchJson<{ message?: string }>(`${API_BASE_URL}${url}`, {
        method,
        headers: payload ? { "Content-Type": "application/json" } : undefined,
        body: payload ? JSON.stringify(payload) : undefined,
      });

      if (!response.ok) {
        throw new Error(getApiMessage(data, "Action failed."));
      }

      setActionMessage(successMessage || getApiMessage(data, "Action completed."));
      options?.onSuccess?.(data);
      if (options?.refreshDashboard !== false) {
        await loadDashboard();
      }
      return data;
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Action failed.");
      return null;
    } finally {
      setPendingSubmitState(null);
    }
  };

  const formatQrDate = (value: string | null) => {
    if (!value) {
      return "Not set";
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Not set" : date.toISOString().slice(0, 10);
  };

  const getReplacementDate = (purchaseDate: string | null, lifespanYears: number | null, purchaseYear?: number | null) => {
    if (!purchaseDate && !purchaseYear) {
      return "Not set";
    }

    const hasCompletePurchaseYear =
      typeof purchaseYear === "number" &&
      Number.isInteger(purchaseYear) &&
      purchaseYear >= 1000 &&
      purchaseYear <= 9999;

    const replacementDate = purchaseDate
      ? new Date(purchaseDate)
      : hasCompletePurchaseYear
        ? new Date(`${purchaseYear}-01-01T00:00:00`)
        : null;

    if (!replacementDate || Number.isNaN(replacementDate.getTime())) {
      return "Not set";
    }

    const safeLifespanYears =
      typeof lifespanYears === "number" && Number.isFinite(lifespanYears) && lifespanYears > 0
        ? lifespanYears
        : 4;

    replacementDate.setFullYear(replacementDate.getFullYear() + safeLifespanYears);

    if (Number.isNaN(replacementDate.getTime())) {
      return "Not set";
    }

    return replacementDate.toISOString().slice(0, 10);
  };

  const encodeDetailToken = (type: DetailEntityType, id: number) => {
    const checksum = id * 37 + type.length * 19;
    const raw = `${type}:${id}:${checksum}`;
    return window.btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  };

  const decodeDetailToken = (token: string) => {
    try {
      const padded = token.replace(/-/g, "+").replace(/_/g, "/");
      const normalized = padded + "=".repeat((4 - (padded.length % 4 || 4)) % 4);
      const decoded = window.atob(normalized);
      const [type, idText, checksumText] = decoded.split(":");
      const id = Number(idText);
      const checksum = Number(checksumText);

      if (!["request", "equipment", "assignment", "employee", "return", "issue", "maintenance"].includes(type)) {
        return null;
      }

      if (!Number.isInteger(id) || checksum !== id * 37 + type.length * 19) {
        return null;
      }

      return { type: type as DetailEntityType, id };
    } catch {
      return null;
    }
  };

  const formatCurrencyAmount = (value: number | null | undefined) =>
    new Intl.NumberFormat("en-RW", {
      style: "currency",
      currency: "RWF",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Number(value ?? 0));

  const getDepreciationSnapshot = ({
    purchaseCost,
    purchaseDate,
    purchaseYear,
    lifespanYears,
  }: {
    purchaseCost: number | null | undefined;
    purchaseDate: string | null | undefined;
    purchaseYear?: number | null | undefined;
    lifespanYears: number | null | undefined;
  }) => {
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
        ageYears: 0,
        lifespanYears: safeLifespanYears,
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
      ageYears: safeAgeYears,
      lifespanYears: safeLifespanYears,
    };
  };

  const getEquipmentDepreciationSummary = (item: EquipmentRow) => {
    const snapshot = getDepreciationSnapshot({
      purchaseCost: item.purchase_cost,
      purchaseDate: item.purchase_date,
      purchaseYear: item.purchase_year,
      lifespanYears: item.lifespan_years,
    });

    if (!snapshot) {
      return "Depreciation: purchase cost not set";
    }

    return `Depreciation: ${formatCurrencyAmount(snapshot.annualDepreciation)}/year / Device value: ${formatCurrencyAmount(snapshot.deviceValue)}`;
  };

  const getEquipmentDepreciationDetail = (item: EquipmentRow) => {
    const snapshot = getDepreciationSnapshot({
      purchaseCost: item.purchase_cost,
      purchaseDate: item.purchase_date,
      purchaseYear: item.purchase_year,
      lifespanYears: item.lifespan_years,
    });

    if (!snapshot) {
      return "Accumulated depreciation: unavailable";
    }

    return `Accumulated: ${formatCurrencyAmount(snapshot.accumulatedDepreciation)} / Age: ${snapshot.ageYears} year(s) of ${snapshot.lifespanYears}`;
  };

  const getAssignmentDepreciationSummary = (assignment: AssignmentRow) =>
    getEquipmentDepreciationSummary(buildEquipmentRowFromAssignment(assignment));

  const getAssignmentDepreciationDetail = (assignment: AssignmentRow) =>
    getEquipmentDepreciationDetail(buildEquipmentRowFromAssignment(assignment));

  const normalizeRiskText = (value: string | null | undefined) => String(value || "").trim().toLowerCase();

  const getRiskDaysBetween = (startAt: string | null | undefined, endAt: string | null | undefined) => {
    if (!startAt) {
      return 0;
    }

    const start = new Date(startAt);
    const end = endAt ? new Date(endAt) : new Date();
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return 0;
    }

    const diff = end.getTime() - start.getTime();
    return diff > 0 ? Math.ceil(diff / (1000 * 60 * 60 * 24)) : 0;
  };

  const getObservedReplacementOutcome = (item: EquipmentRow) => {
    if (item.status === "retired" || item.replacement_disposition === "retired") {
      return "Retired";
    }

    if (item.status === "replaced" || item.replacement_request_id || item.replacement_processed_at) {
      return "Replaced";
    }

    const itemMaintenanceRecords = maintenanceRecords.filter((record) => record.equipment_id === item.id);
    if (itemMaintenanceRecords.some((record) => record.maintenance_status === "repaired")) {
      return "Repaired and kept";
    }

    return "No final decision yet";
  };

  const getEquipmentReplacementRisk = (item: EquipmentRow): ReplacementRiskInsight => {
    const reasons: string[] = [];
    let score = 0;
    const snapshot = getDepreciationSnapshot({
      purchaseCost: item.purchase_cost,
      purchaseDate: item.purchase_date,
      purchaseYear: item.purchase_year,
      lifespanYears: item.lifespan_years,
    });
    const itemMaintenanceRecords = maintenanceRecords.filter((record) => record.equipment_id === item.id);
    const openIssueCount = issues.filter(
      (issue) => issue.equipment_id === item.id && !["closed", "resolved"].includes(normalizeRiskText(issue.issue_status)),
    ).length;
    const latestReturn = returns
      .filter((record) => record.equipment_id === item.id)
      .sort(
        (left, right) =>
          new Date(right.processed_at || right.returned_at || right.it_reviewed_at || right.requested_at).getTime() -
          new Date(left.processed_at || left.returned_at || left.it_reviewed_at || left.requested_at).getTime(),
      )[0];
    const downtimeDays = itemMaintenanceRecords.reduce(
      (total, record) => total + getRiskDaysBetween(record.started_at, record.completed_at),
      0,
    );
    const normalizedHealth = normalizeRiskText(item.device_health);
    const normalizedCondition = normalizeRiskText(latestReturn?.condition_status);
    const normalizedDisposition = normalizeRiskText(latestReturn?.disposition || item.replacement_disposition);

    if (snapshot) {
      const ageRatio = snapshot.lifespanYears > 0 ? snapshot.ageYears / snapshot.lifespanYears : 0;
      if (snapshot.ageYears >= snapshot.lifespanYears) {
        score += 28;
        reasons.push(`Reached lifespan limit (${snapshot.ageYears}/${snapshot.lifespanYears} years)`);
      } else if (ageRatio >= 0.75) {
        score += 18;
        reasons.push(`Near replacement window (${snapshot.ageYears}/${snapshot.lifespanYears} years used)`);
      } else if (ageRatio >= 0.5) {
        score += 8;
      }

      if ((item.purchase_cost ?? 0) > 0 && snapshot.deviceValue <= (item.purchase_cost ?? 0) * 0.2 && snapshot.ageYears >= 2) {
        score += 10;
        reasons.push(`Low remaining device value (${formatCurrencyAmount(snapshot.deviceValue)})`);
      }
    }

    if (item.warranty_end_date) {
      const warrantyEnd = new Date(item.warranty_end_date);
      if (!Number.isNaN(warrantyEnd.getTime())) {
        const daysToWarrantyEnd = Math.ceil((warrantyEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        if (daysToWarrantyEnd < 0) {
          score += 15;
          reasons.push("Out of warranty");
        } else if (daysToWarrantyEnd <= 90) {
          score += 8;
          reasons.push(`Warranty ends in ${daysToWarrantyEnd} day(s)`);
        }
      }
    }

    if (itemMaintenanceRecords.length >= 4) {
      score += 24;
      reasons.push(`${itemMaintenanceRecords.length} maintenance events`);
    } else if (itemMaintenanceRecords.length >= 2) {
      score += 14;
      reasons.push(`${itemMaintenanceRecords.length} maintenance events`);
    } else if (itemMaintenanceRecords.length === 1) {
      score += 6;
    }

    if (openIssueCount >= 3) {
      score += 18;
      reasons.push(`${openIssueCount} unresolved issues`);
    } else if (openIssueCount >= 1) {
      score += 8;
      reasons.push(`${openIssueCount} unresolved issue${openIssueCount > 1 ? "s" : ""}`);
    }

    if (downtimeDays >= 30) {
      score += 18;
      reasons.push(`${downtimeDays} downtime day(s)`);
    } else if (downtimeDays >= 14) {
      score += 10;
      reasons.push(`${downtimeDays} downtime day(s)`);
    } else if (downtimeDays > 0) {
      score += 4;
    }

    if (["faulty", "poor", "damaged", "bad", "critical", "broken"].some((keyword) => normalizedHealth.includes(keyword))) {
      score += 20;
      reasons.push(`Device health marked as ${item.device_health}`);
    } else if (["fair", "warning", "aging"].some((keyword) => normalizedHealth.includes(keyword))) {
      score += 10;
      reasons.push(`Device health marked as ${item.device_health}`);
    }

    if (["damaged", "broken", "faulty", "poor", "not compatible"].some((keyword) => normalizedCondition.includes(keyword))) {
      score += 16;
      reasons.push(`Latest return condition: ${latestReturn?.condition_status}`);
    } else if (normalizedCondition) {
      score += 6;
    }

    if (["retired", "dispose", "disposed", "scrap", "not repairable"].some((keyword) => normalizedDisposition.includes(keyword))) {
      score += 25;
      reasons.push(`Latest disposition: ${latestReturn?.disposition || item.replacement_disposition}`);
    } else if (normalizedDisposition.includes("maintenance")) {
      score += 8;
    }

    if (item.replacement_request_id || item.replacement_processed_at || item.status === "replaced") {
      score += 12;
      reasons.push("Previously part of a replacement workflow");
    }

    if (["network", "server", "storage"].some((keyword) => normalizeRiskText(item.category_name).includes(keyword))) {
      score += 6;
    }

    const finalScore = Math.max(0, Math.min(Math.round(score), 100));
    let recommendation = "Keep in service";
    if (finalScore >= 75) {
      recommendation = "Replace recommended";
    } else if (finalScore >= 50) {
      recommendation = "Review for replacement";
    }

    if (reasons.length === 0) {
      reasons.push("No major replacement signals detected yet");
    }

    return {
      score: finalScore,
      recommendation,
      reasons,
      observedOutcome: getObservedReplacementOutcome(item),
    };
  };

  const formatQrStatusLabel = (status: EquipmentRow["status"]) => {
    if (status === "replaced") {
      return "Replaced";
    }

    if (status === "assigned") {
      return "Assigned";
    }

    if (status === "retired") {
      return "Disposed";
    }

    return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ");
  };

  const buildEquipmentQrPayload = (item: EquipmentRow, audience: "employee" | "internal") =>
    audience === "employee"
      ? [
          "AIRTEL DEVICE PASS",
          `${item.equipment_name}`,
          `Tag: ${item.asset_tag}`,
          `Serial: ${item.serial_number}`,
          `Model: ${item.model_name || "Not set"}`,
          `PC Name: ${item.computer_name || "Not set"}`,
          `Status: ${formatQrStatusLabel(item.status)}`,
          `Specs: ${formatEquipmentSpecs(item) || "Not set"}`,
          `Accessories: ${formatEquipmentAccessories(item) || "Not set"}`,
          `Accessory Notes: ${formatEquipmentAccessoryNotes(item) || "None"}`,
          `Warranty: ${formatQrDate(item.warranty_end_date)}`,
          `${getEquipmentDepreciationSummary(item)}`,
          "Support: Share the company code with IT Support.",
        ].join("\n")
      : [
          "AIRTEL EQUIPMENT RECORD",
          `${item.equipment_name}`,
          `Tag: ${item.asset_tag}`,
          `ID: ${item.id}`,
          `Serial: ${item.serial_number}`,
          `PC Name: ${item.computer_name || "Not set"}`,
          `Category: ${item.category_name || "Not set"}`,
          `Vendor: ${item.vendor_name || "Not set"}`,
          `Model: ${item.model_name || "Not set"}`,
          `Status: ${formatQrStatusLabel(item.status)}`,
          `Accessories: ${formatEquipmentAccessories(item) || "Not set"}`,
          `Accessory Notes: ${formatEquipmentAccessoryNotes(item) || "None"}`,
          `Branch: ${item.branch_name || "No branch"}`,
          `Location: ${item.location_details || "Not set"}`,
          `Health: ${item.device_health || "Not set"}`,
          `Purchased: ${formatQrDate(item.purchase_date)}`,
          `Cost: ${formatCurrencyAmount(item.purchase_cost)}`,
          `Warranty: ${formatQrDate(item.warranty_end_date)}`,
          `Lifespan: ${item.lifespan_years ?? 4} years`,
          `${getEquipmentDepreciationSummary(item)}`,
          `${getEquipmentDepreciationDetail(item)}`,
          `Replace By: ${getReplacementDate(item.purchase_date, item.lifespan_years, item.purchase_year)}`,
        ].join("\n");

  const handlePreviewEquipmentQr = async (item: EquipmentRow, targetSection: string = activeSection) => {
    const dataUrl = await loadEquipmentQrPreview(item);
    if (!dataUrl) {
      return;
    }

    setActiveSection(targetSection);
    window.location.hash = "equipment-qr-panel";
  };

  const handleDownloadEquipmentQr = () => {
    if (!selectedQrEquipment || !equipmentQrImageUrl) {
      return;
    }

    const link = document.createElement("a");
    link.href = equipmentQrImageUrl;
    link.download = `${selectedQrEquipment.asset_tag.toLowerCase()}-equipment-qr.png`;
    link.click();
  };

  const getReplacementStockLabel = (item: EquipmentRow) => {
    if (!item.replacement_request_id) {
      return null;
    }

    if (item.replacement_disposition === "available") {
      return "Replacement return: back in stock";
    }

    if (item.replacement_disposition === "retired") {
      return "Replacement return: disposed";
    }

    return "Replacement return recorded";
  };

  const getEquipmentLocationLabel = (item: EquipmentRow, assignment?: AssignmentRow) => {
    if (item.stock_location === "warehouse_stock") {
      return "Warehouse";
    }

    if (assignment) {
      return "Assigned";
    }

    return "In stock";
  };

  const getEquipmentLocationDetail = (item: EquipmentRow, assignment?: AssignmentRow) => {
    if (item.stock_location === "warehouse_stock") {
      return item.location_details || item.branch_name || "Warehouse";
    }

    if (assignment) {
      return assignment.employee_name
        ? `${assignment.employee_name} / ${assignment.employee_email || "No email"}`
        : item.branch_name || item.location_details || "Assigned";
    }

    return item.branch_name || item.location_details || "IT stock";
  };

  const getAssignmentReceiptLabel = (assignment: AssignmentRow) => {
    if (assignment.status === "returned" && isReplacementAssignment(assignment)) {
      return "replaced";
    }

    return assignment.receipt_status;
  };

  const getAssignmentStatusLabel = (assignment: AssignmentRow) => {
    if (assignment.status === "returned" && isReplacementAssignment(assignment)) {
      return "replaced";
    }

    return assignment.status;
  };

  const getReplacementAssignmentLabel = (assignment: AssignmentRow) => {
    if (!isReplacementAssignment(assignment)) {
      return null;
    }

    if (assignment.replacement_disposition === "retired") {
      return "Replacement outcome: disposed";
    }

    if (assignment.replacement_disposition === "available") {
      return "Replacement outcome: returned to stock";
    }

    return "Replacement recorded";
  };

  const handleCreateRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const method = editingRequestId ? "PUT" : "POST";
    const url = editingRequestId ? `/requests/${editingRequestId}` : "/requests";

    await submitAction(
      method,
      url,
      {
        requesterId: user.id,
        categoryId: Number(
          requestForm.requestType === "replacement" || requestForm.requestType === "loss_theft"
            ? employeeActiveAssignmentOptions.find((item) => item.assignment.equipment_id === Number(requestForm.sourceEquipmentId))?.equipment.category_id || requestForm.categoryId
            : requestForm.categoryId,
        ),
        requestType: requestForm.requestType,
        hrmsEmployeeRecordId: requestForm.hrmsEmployeeRecordId || null,
        targetEmployeeUserId: requestForm.targetEmployeeUserId ? Number(requestForm.targetEmployeeUserId) : null,
        expectedDeviceSpecs: null,
        notes:
          requestForm.requestType === "loss_theft"
            ? [
                requestForm.reportType === "theft" ? "Incident type: theft" : "Incident type: loss",
                requestForm.incidentScope === "during_work" ? "Incident scope: during work" : "Incident scope: outside work (T&C apply)",
                requestForm.notes,
              ]
                .filter(Boolean)
                .join(" | ")
            : requestForm.notes,
        requestDate: requestForm.requestDate,
        sourceEquipmentId: requestForm.sourceEquipmentId ? Number(requestForm.sourceEquipmentId) : null,
        reportType: requestForm.requestType === "loss_theft" ? requestForm.reportType : null,
      },
      editingRequestId ? "Request updated." : "Equipment request submitted.",
    );

    setRequestForm({
      categoryId: "",
      requestType: roleView === "hr" ? "new_hire" : "standard",
      hrmsEmployeeRecordId: "",
      targetEmployeeUserId: "",
      expectedDeviceSpecs: "",
      notes: "",
      requestDate: todayDateValue,
      sourceEquipmentId: "",
      reportType: "loss",
      incidentScope: "during_work",
    });
    setHrEmployeeIdSearch("");
    setEditingRequestId(null);
    setActiveSection("my-requests");
  };

  const handleEditRequest = (request: RequestRow) => {
    const hrmsSnapshot = parseHrmsSnapshot(request.hrms_snapshot);
    const preselectedEmployee = employees.find(
      (employee) =>
        (hrmsSnapshot.hrmsEmployeeRecordId && Number(employee.id) === Number(hrmsSnapshot.hrmsEmployeeRecordId)) ||
        (request.target_employee_user_id && Number(employee.linked_user_id) === Number(request.target_employee_user_id)),
    );
    setEditingRequestId(request.id);
    setRequestForm({
      categoryId: String(request.category_id),
      requestType: request.request_type || "standard",
      hrmsEmployeeRecordId: hrmsSnapshot.hrmsEmployeeRecordId ? String(hrmsSnapshot.hrmsEmployeeRecordId) : "",
      targetEmployeeUserId: request.target_employee_user_id
        ? String(request.target_employee_user_id)
        : hrmsSnapshot.linkedImsUserId
          ? String(hrmsSnapshot.linkedImsUserId)
          : "",
      expectedDeviceSpecs: "",
      notes: request.notes || "",
      requestDate: request.requested_at ? request.requested_at.slice(0, 10) : request.created_at.slice(0, 10),
      sourceEquipmentId: request.source_equipment_id ? String(request.source_equipment_id) : "",
      reportType: request.report_type || "loss",
      incidentScope: request.notes?.toLowerCase().includes("outside work") ? "outside_work" : "during_work",
    });
    setHrEmployeeIdSearch(preselectedEmployee?.hrms_employee_id || preselectedEmployee?.employee_code || "");
    setActiveSection("new-request");
  };

  const resetEmployeeForm = () => {
    setEditingEmployeeId(null);
    setIsEmployeeModalOpen(false);
    setEmployeeForm({
      firstName: "",
      lastName: "",
      email: "",
      phoneNumber: "",
      employeeCode: "",
      hrmsEmployeeId: "",
      employeeGrade: "",
      jobTitle: "",
      employmentStatus: "active",
      officeLocation: "",
      startDate: todayDateValue,
      status: "active",
    });
  };

  const handleSubmitEmployee = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const method = editingEmployeeId ? "PUT" : "POST";
    const url = editingEmployeeId ? `/hr/employees/${editingEmployeeId}` : "/hr/employees";

    await submitAction(
      method,
      url,
      {
        actorUserId: user.id,
        firstName: employeeForm.firstName,
        lastName: employeeForm.lastName,
        email: employeeForm.email,
        phoneNumber: employeeForm.phoneNumber || null,
        employeeCode: employeeForm.employeeCode || null,
        hrmsEmployeeId: employeeForm.hrmsEmployeeId || null,
        employeeGrade: employeeForm.employeeGrade || null,
        jobTitle: employeeForm.jobTitle || null,
        employmentStatus: employeeForm.employmentStatus || null,
        officeLocation: employeeForm.officeLocation || null,
        startDate: employeeForm.startDate || null,
        status: employeeForm.status,
        departmentId: user.departmentId,
      },
      editingEmployeeId ? "Employee updated." : "Employee created.",
    );

    resetEmployeeForm();
  };

  const handleEditEmployee = (employee: EmployeeRow) => {
    setEditingEmployeeId(Number(employee.id));
    setIsEmployeeModalOpen(true);
    setEmployeeForm({
      firstName: employee.first_name || employee.full_name.split(" ")[0] || "",
      lastName: employee.last_name || employee.full_name.split(" ").slice(1).join(" ") || "",
      email: employee.email,
      phoneNumber: employee.phone_number || "",
      employeeCode: employee.employee_code || "",
      hrmsEmployeeId: employee.hrms_employee_id || "",
      employeeGrade: employee.employee_grade || "",
      jobTitle: employee.job_title || "",
      employmentStatus: employee.employment_status || "active",
      officeLocation: employee.office_location || "",
      startDate: employee.start_date ? employee.start_date.slice(0, 10) : todayDateValue,
      status: (employee.status as EmployeeFormState["status"]) || "active",
    });
    setActiveSection("employees");
  };

  const openEmployeeModal = () => {
    setEditingEmployeeId(null);
    setEmployeeForm({
      firstName: "",
      lastName: "",
      email: "",
      phoneNumber: "",
      employeeCode: "",
      hrmsEmployeeId: "",
      employeeGrade: "",
      jobTitle: "",
      employmentStatus: "active",
      officeLocation: "",
      startDate: todayDateValue,
      status: "active",
    });
    setIsEmployeeModalOpen(true);
  };

  const handleUpdateHrEmployeeStatus = async (employee: EmployeeRow, status: EmployeeFormState["status"]) => {
    await submitAction(
      "POST",
      `/hr/employees/${employee.id}/status`,
      {
        actorUserId: user.id,
        status,
      },
      `Employee marked ${status}.`,
    );
  };

  const handleDeleteRequest = async (requestId: number) => {
    await submitAction(
      "DELETE",
      `/requests/${requestId}?requesterId=${user.id}`,
      undefined,
      "Request deleted.",
    );
  };

  const handleApproveRequest = async (requestId: number) => {
    const request = requests.find((item) => item.id === requestId);
    const selectedEquipmentId = fulfillmentForm[requestId]?.equipmentId || (request?.booked_equipment_id ? String(request.booked_equipment_id) : "");

    if (
      roleView === "it-support" &&
      request?.currentStageKey === "it_inventory_review" &&
      getEquipmentOptionsForRequest(request).length > 0 &&
      !selectedEquipmentId
    ) {
      setActionError("Select available equipment during IT Support approval.");
      return;
    }

    setPendingRequestActionId(requestId);
    try {
      await submitAction(
        "POST",
        `/requests/${requestId}/approve`,
        {
          actorUserId: user.id,
          note: approvalNotes[requestId] || null,
          equipmentId: selectedEquipmentId ? Number(selectedEquipmentId) : null,
        },
        "Workflow step approved.",
        {
          refreshDashboard: false,
          onSuccess: (data) => {
            if (data?.request) {
              patchRequestInDashboard(data.request as RequestRow);
            }
          },
        },
      );
    } finally {
      setPendingRequestActionId(null);
    }
  };

  const handleRejectRequest = async (requestId: number) => {
    const rejectionReason = (approvalNotes[requestId] || "").trim();

    if (!rejectionReason) {
      setActionError("Please enter a rejection reason before rejecting this request.");
      return;
    }

    setPendingRequestActionId(requestId);
    try {
      await submitAction(
        "POST",
        `/requests/${requestId}/reject`,
        {
          actorUserId: user.id,
          note: rejectionReason,
        },
        "Request rejected.",
        {
          refreshDashboard: false,
          onSuccess: (data) => {
            if (data?.request) {
              patchRequestInDashboard(data.request as RequestRow);
            }
          },
        },
      );
    } finally {
      setPendingRequestActionId(null);
    }
  };

  const handleKeepDeviceInService = async (requestId: number) => {
    setPendingRequestActionId(requestId);

    try {
      await submitAction(
        "POST",
        `/requests/${requestId}/keep-device`,
        {
          actorUserId: user.id,
          note: approvalNotes[requestId] || null,
        },
        "Request marked to keep existing device in service.",
        {
          refreshDashboard: false,
          onSuccess: (data) => {
            if (data?.request) {
              patchRequestInDashboard(data.request as RequestRow);
            }
          },
        },
      );
    } finally {
      setPendingRequestActionId(null);
    }
  };

  const handleReturnRequestForClarification = async (requestId: number) => {
    const clarificationNote = (approvalNotes[requestId] || "").trim();

    if (!clarificationNote) {
      setActionError("Please explain what information is missing before returning this request.");
      return;
    }

    setPendingRequestActionId(requestId);
    try {
      await submitAction(
        "POST",
        `/requests/${requestId}/return`,
        {
          actorUserId: user.id,
          note: clarificationNote,
        },
        "Request returned for clarification.",
        {
          refreshDashboard: false,
          onSuccess: (data) => {
            if (data?.request) {
              patchRequestInDashboard(data.request as RequestRow);
            }
          },
        },
      );
    } finally {
      setPendingRequestActionId(null);
    }
  };

  const handleFulfillRequest = async (requestId: number) => {
    const request = requests.find((item) => item.id === requestId);
    const form = fulfillmentForm[requestId];
    const finalEquipmentId = request?.booked_equipment_id ? String(request.booked_equipment_id) : form?.equipmentId || "";

    if (!finalEquipmentId) {
      setActionError("Reserve equipment before fulfilling the request.");
      return;
    }

    await submitAction(
      "POST",
      `/requests/${requestId}/fulfill`,
      {
        actorUserId: user.id,
        equipmentId: Number(finalEquipmentId),
        expectedReturnDate: form?.expectedReturnDate || null,
        note: form?.note || null,
        replacementDisposition: request?.request_type === "replacement" ? form?.replacementDisposition || "available" : null,
        replacementConditionStatus: request?.request_type === "replacement" ? form?.replacementConditionStatus || null : null,
      },
      "Request fulfilled and equipment assigned.",
    );
  };

  const handleUpdateFulfillmentStatus = async (requestId: number) => {
    const form = fulfillmentForm[requestId];
    const fulfillmentStatus = form?.fulfillmentStatus || "waiting_stock";

    await submitAction(
      "POST",
      `/requests/${requestId}/fulfillment-status`,
      {
        actorUserId: user.id,
        fulfillmentStatus,
        note: form?.note || null,
      },
      "Fulfillment status updated.",
    );
  };

  const handleSubmitIssue = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const method = editingIssueId ? "PUT" : "POST";
    const url = editingIssueId ? `/issues/${editingIssueId}` : "/issues";

    await submitAction(
      method,
      url,
      editingIssueId
        ? {
            issueTitle: issueForm.issueTitle,
            issueDescription: issueForm.issueDescription,
            priority: issueForm.priority,
            issueStatus: issueForm.issueStatus,
          }
        : {
            equipmentId: Number(issueForm.equipmentId),
            reportedBy: user.id,
            issueTitle: issueForm.issueTitle,
            issueDescription: issueForm.issueDescription,
            priority: issueForm.priority,
          },
      editingIssueId ? "Issue updated." : "Issue created.",
    );

    setIssueForm({
      equipmentId: "",
      issueTitle: "",
      issueDescription: "",
      priority: "medium",
      issueStatus: "open",
    });
    setEditingIssueId(null);
  };

  const handleEditIssue = (issue: IssueRow) => {
    setEditingIssueId(issue.id);
    setIssueForm({
      equipmentId: String(issue.equipment_id),
      issueTitle: issue.issue_title,
      issueDescription: issue.issue_description || "",
      priority: issue.priority,
      issueStatus: issue.issue_status,
    });
    setActiveSection("equipment");
  };

  const handleDeleteIssue = async (issueId: number) => {
    await submitAction("DELETE", `/issues/${issueId}`, undefined, "Issue deleted.");
  };

  const resetStockForm = () => {
    setEditingEquipmentId(null);
    setIsStockFormOpen(false);
    setCustomStockAccessory("");
    setStockForm({
      assetTag: "",
      serialNumber: "",
      computerName: "",
      equipmentName: "",
      categoryId: "",
      vendorName: "",
      modelName: "",
      cpu: "",
      status: "available",
      ram: "",
      storageCapacity: "",
      storageType: "SSD",
      osVersion: "",
      purchaseYear: "",
      purchaseCost: "",
      purchaseDate: "",
      locationDetails: "",
      deviceHealth: "Healthy",
      warrantyEndDate: "",
      lifespanYears: "4",
      includedAccessories: [],
      accessoryNotes: "",
    });
  };

  const toggleStockAccessory = (accessory: string, isChecked: boolean) => {
    setStockForm((current) => ({
      ...current,
      includedAccessories: isChecked
        ? Array.from(new Set([...current.includedAccessories, accessory]))
        : current.includedAccessories.filter((item) => item !== accessory),
    }));
  };

  const handleAddCustomStockAccessory = () => {
    const normalizedAccessory = customStockAccessory.trim();

    if (!normalizedAccessory) {
      return;
    }

    toggleStockAccessory(normalizedAccessory, true);
    setCustomStockAccessory("");
  };

  const handleSubmitEquipment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (
      requiredStockAccessories.length > 0 &&
      requiredStockAccessories.some((accessory) => !stockForm.includedAccessories.includes(accessory))
    ) {
      setActionError(`Confirm all required ${selectedStockCategory?.name || "device"} accessories before saving the asset.`);
      return;
    }

    const method = editingEquipmentId ? "PUT" : "POST";
    const url = editingEquipmentId ? `/equipment/${editingEquipmentId}` : "/equipment";

    const result = await submitAction(
      method,
      url,
      {
        actorUserId: user.id,
        assetTag: stockForm.assetTag,
        serialNumber: stockForm.serialNumber,
        computerName: stockForm.computerName,
        equipmentName: resolvedEquipmentName,
        categoryId: Number(stockForm.categoryId),
        countryId: user.countryId,
        branchId: user.branchId,
        vendorName: stockForm.vendorName,
        modelName: stockForm.modelName,
        status: stockForm.status,
        purchaseYear: Number(stockForm.purchaseYear || 0) || null,
        purchaseCost: Number(stockForm.purchaseCost || 0),
        purchaseDate: stockForm.purchaseDate || null,
        locationDetails: stockForm.locationDetails || null,
        deviceHealth: stockForm.deviceHealth || null,
        warrantyEndDate: stockForm.warrantyEndDate || null,
        lifespanYears: Number(stockForm.lifespanYears || 4),
        stockLocation: roleView === "warehouse" ? "warehouse_stock" : "it_stock",
        equipmentSpecs: isStorageDeviceStockForm
          ? {
              cpu: stockForm.cpu,
              ram: stockForm.ram,
              storageCapacity: stockForm.storageCapacity,
              storageType: stockForm.storageType,
              osVersion: stockForm.osVersion,
              bundleType: selectedStockCategory?.name || null,
              requiredAccessories: requiredStockAccessories,
              suggestedAccessories: optionalStockAccessories,
              accessories: stockForm.includedAccessories,
              accessoryNotes: stockForm.accessoryNotes || null,
            }
          : {
              bundleType: selectedStockCategory?.name || null,
              requiredAccessories: requiredStockAccessories,
              suggestedAccessories: optionalStockAccessories,
              accessories: stockForm.includedAccessories,
              accessoryNotes: stockForm.accessoryNotes || null,
            },
      },
      editingEquipmentId ? "Stock item updated." : "Stock item created.",
    );

    const equipmentRecord = result?.equipment as EquipmentRow | undefined;

    resetStockForm();
    await loadTransferWorkspace();
    await loadDashboard();
    if (equipmentRecord) {
      await handlePreviewEquipmentQr(equipmentRecord);
    }
  };

  const handleEditEquipment = (item: EquipmentRow) => {
    const specs = parseEquipmentSpecs(item.equipment_specs);

    setEditingEquipmentId(item.id);
    setIsStockFormOpen(true);
    setCustomStockAccessory("");
    setStockForm({
      assetTag: item.asset_tag,
      serialNumber: item.serial_number,
      computerName: item.computer_name || "",
      equipmentName: item.equipment_name,
      categoryId: String(item.category_id),
      vendorName: item.vendor_name || "",
      modelName: item.model_name || "",
      cpu: specs.cpu || specs.processor || "",
      status: item.status,
      ram: specs.ram || "",
      storageCapacity: specs.storageCapacity || specs.storage || "",
      storageType: specs.storageType || "SSD",
      osVersion: specs.osVersion || specs.operatingSystem || "",
      purchaseYear: item.purchase_year ? String(item.purchase_year) : "",
      purchaseCost: item.purchase_cost ? String(item.purchase_cost) : "",
      purchaseDate: item.purchase_date ? item.purchase_date.slice(0, 10) : "",
      locationDetails: item.location_details || "",
      deviceHealth: item.device_health || "Healthy",
      warrantyEndDate: item.warranty_end_date ? item.warranty_end_date.slice(0, 10) : "",
      lifespanYears: String(item.lifespan_years ?? 4),
      includedAccessories: Array.isArray(specs.accessories) ? specs.accessories : [],
      accessoryNotes: specs.accessoryNotes || "",
    });
    setActiveSection("stock");
  };

  const handleDeleteEquipment = async (equipmentId: number) => {
    await submitAction("DELETE", `/equipment/${equipmentId}`, { actorUserId: user.id }, "Stock item deleted.");
  };

  const handleCreateStockCategory = async () => {
    const categoryName = newStockCategoryName.trim();

    if (!categoryName) {
      setActionError("Enter the new category name first.");
      return;
    }

    const result = await submitAction(
      "POST",
      "/categories",
      {
        name: categoryName,
        depreciationRate: 20,
      },
      "Category ready for stock registration.",
    );

    const createdCategory = result?.category as CategoryRow | undefined;

    if (createdCategory?.id) {
      setStockForm((current) => ({
        ...current,
        categoryId: String(createdCategory.id),
        equipmentName: createdCategory.name,
      }));
      setNewStockCategoryName("");
    }
  };

  const handleReturnRequestFileChange = async (assignmentId: number, file: File | null) => {
    if (!file) {
      setReturnRequestAttachments((current) => {
        const next = { ...current };
        delete next[assignmentId];
        return next;
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setActionError("Please choose a file smaller than 5 MB for the return request.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      if (typeof dataUrl !== "string") {
        setActionError("Unable to read the selected file. Please try again.");
        return;
      }

      const commaIndex = dataUrl.indexOf(",");
      if (commaIndex < 0) {
        setActionError("Unable to read the selected file. Please try again.");
        return;
      }

      const mimeType = dataUrl.slice(5, dataUrl.indexOf(";", 5)) || file.type || "application/octet-stream";
      const base64Data = dataUrl.slice(commaIndex + 1);
      setReturnRequestAttachments((current) => ({
        ...current,
        [assignmentId]: {
          fileName: file.name,
          fileType: mimeType,
          fileData: base64Data,
        },
      }));
    };
    reader.onerror = () => {
      setActionError("Unable to read the selected file. Please try again.");
    };
    reader.readAsDataURL(file);
  };

  const handleCreateMoveOrder = async () => {
    if (moveOrderItems.length === 0) {
      setActionError("Add at least one requested item category for the move order.");
      return;
    }

    await submitAction(
      "POST",
      "/move-orders",
      {
        actorUserId: user.id,
        requestedItems: moveOrderItems.map((item) => ({
          categoryId: Number(item.categoryId),
          quantity: item.quantity,
        })),
        reason: moveOrderReason || null,
        note: moveOrderNote || null,
        destinationBranchId: user.branchId,
      },
      "Move order sent to warehouse.",
    );

    setMoveOrderItems([]);
    setMoveOrderItemCategoryId("");
    setMoveOrderItemQuantity("1");
    setMoveOrderReason("");
    setMoveOrderNote("");
    await loadTransferWorkspace();
    await loadDashboard();
  };

  const handleAddMoveOrderItem = () => {
    if (!moveOrderItemCategoryId) {
      setActionError("Select a device category for this move order item.");
      return;
    }

    const quantity = Number(moveOrderItemQuantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      setActionError("Enter a valid quantity greater than zero.");
      return;
    }

    setMoveOrderItems((current) => {
      const existingItemIndex = current.findIndex((item) => item.categoryId === moveOrderItemCategoryId);
      if (existingItemIndex >= 0) {
        return current.map((item, index) =>
          index === existingItemIndex ? { ...item, quantity: item.quantity + quantity } : item,
        );
      }

      return [...current, { categoryId: moveOrderItemCategoryId, quantity }];
    });

    setMoveOrderItemCategoryId("");
    setMoveOrderItemQuantity("1");
  };

  const handleRemoveMoveOrderItem = (categoryId: string) => {
    setMoveOrderItems((current) => current.filter((item) => item.categoryId !== categoryId));
  };

  const handleWarehouseDecision = async (moveOrderId: number, decision: "approved" | "partial" | "rejected") => {
    await submitAction(
      "POST",
      `/move-orders/${moveOrderId}/decision`,
      {
        actorUserId: user.id,
        decision,
        note: warehouseDecisionNotes[moveOrderId] || null,
      },
      decision === "approved"
        ? "Move order approved and reserved for IT receipt."
        : decision === "partial"
          ? "Move order partially approved and available stock reserved."
          : "Move order rejected.",
    );

    setWarehouseDecisionNotes((current) => ({
      ...current,
      [moveOrderId]: "",
    }));
    await loadTransferWorkspace();
    await loadDashboard();
  };

  const handleConfirmMoveOrderReceipt = async (moveOrderId: number) => {
    await submitAction(
      "POST",
      `/move-orders/${moveOrderId}/receive`,
      {
        actorUserId: user.id,
      },
      "Warehouse receipt confirmed. Devices are now available in IT stock.",
    );

    await loadTransferWorkspace();
    await loadDashboard();
  };

  const handleRequestReturn = async (assignmentId: number) => {
    const attachment = returnRequestAttachments[assignmentId];
    const returnReason = returnRequestReasons[assignmentId] || "standard";

    if (returnReason === "leaving_job" && !attachment) {
      setActionError("Attach the reception letter or final letter before submitting a leaving-job return.");
      return;
    }

    const payload: Record<string, unknown> = {
      assignmentId,
      employeeUserId: user.id,
      note: returnRequestNotes[assignmentId] || null,
      returnReason,
    };

    if (attachment) {
      payload.returnAttachmentName = attachment.fileName;
      payload.returnAttachmentType = attachment.fileType;
      payload.returnAttachmentData = attachment.fileData;
    }

    await submitAction(
      "POST",
      "/returns/request",
      payload,
      returnReason === "leaving_job"
        ? "Leaving-job return request submitted. HR Recruitment and IT Support have been notified."
        : "Return request submitted.",
    );

    setReturnRequestNotes((current) => ({
      ...current,
      [assignmentId]: "",
    }));
    setReturnRequestReasons((current) => ({
      ...current,
      [assignmentId]: "standard",
    }));
    setReturnRequestAttachments((current) => {
      const next = { ...current };
      delete next[assignmentId];
      return next;
    });
  };

  const handleItReturnReview = async (returnId: number) => {
    const form = itReturnReviewForm[returnId] ?? {
      conditionStatus: "good",
      disposition: "available",
      reviewNote: "",
      action: "forward" as const,
    };

    await submitAction(
      "POST",
      `/returns/${returnId}/it-review`,
      {
        actorUserId: user.id,
        conditionStatus: form.conditionStatus,
        disposition: form.disposition,
        reviewNote: form.reviewNote || null,
        action: form.action,
      },
      form.action === "reject"
        ? "Return rejected by IT."
        : form.action === "return_to_employee"
          ? "Equipment sent back to employee."
          : "Return sent to IT Support Engineer for intake.",
    );

    setItReturnReviewForm((current) => ({
      ...current,
      [returnId]: {
        conditionStatus: "good",
        disposition: "available",
        reviewNote: "",
        action: "forward",
      },
    }));
  };

  const handleConfirmReceipt = async (assignmentId: number) => {
    await submitAction(
      "POST",
      `/assignments/${assignmentId}/confirm-receipt`,
      {
        employeeUserId: user.id,
        note: receiptNotes[assignmentId] || null,
      },
      "Equipment receipt confirmed.",
    );

    setReceiptNotes((current) => ({
      ...current,
      [assignmentId]: "",
    }));
  };

  const handleProcessReturn = async (returnId: number) => {
    const form = returnProcessForm[returnId] ?? {
      conditionStatus: "good",
      disposition: "available",
      intakeNote: "",
      action: "complete" as const,
    };

    await submitAction(
      "POST",
      `/returns/${returnId}/process`,
      {
        actorUserId: user.id,
        conditionStatus: form.conditionStatus,
        disposition: form.disposition,
        intakeNote: form.intakeNote || null,
        action: form.action,
      },
      form.action === "reject" ? "Return request rejected." : "Return intake completed.",
    );

    setReturnProcessForm((current) => ({
      ...current,
      [returnId]: {
        conditionStatus: "good",
        disposition: "available",
        intakeNote: "",
        action: "complete",
      },
    }));
  };

  const handleFinalReturnApproval = async (returnId: number) => {
    const form = finalReturnApprovalForm[returnId] ?? {
      decision: "approve" as const,
      note: "",
    };

    await submitAction(
      "POST",
      `/returns/${returnId}/final-approve`,
      {
        actorUserId: user.id,
        decision: form.decision,
        note: form.note || null,
      },
      form.decision === "reject" ? "Final return approval rejected." : "Final return approval recorded.",
    );

    setFinalReturnApprovalForm((current) => ({
      ...current,
      [returnId]: {
        decision: "approve",
        note: "",
      },
    }));
  };

  const handleCompleteMaintenance = async (maintenanceId: number) => {
    const form = maintenanceCloseForm[maintenanceId] ?? {
      maintenanceStatus: "repaired" as const,
      finalDisposition: "available",
      resolutionNote: "",
    };

    await submitAction(
      "POST",
      `/maintenance/${maintenanceId}/complete`,
      {
        actorUserId: user.id,
        maintenanceStatus: form.maintenanceStatus,
        finalDisposition: form.finalDisposition,
        resolutionNote: form.resolutionNote || null,
      },
      "Maintenance completed and stock status recorded.",
    );

    setMaintenanceCloseForm((current) => ({
      ...current,
      [maintenanceId]: {
        maintenanceStatus: "repaired",
        finalDisposition: "available",
        resolutionNote: "",
      },
    }));
  };

  const getWorkflowSummary = (request: RequestRow) =>
    request.workflowSteps.map((step) => `${step.step_label}: ${step.action_status}`).join(" | ");

  const getEquipmentOptionsForRequest = (request: RequestRow) =>
    localAvailableEquipment.filter(
      (item) =>
        item.category_id === request.category_id &&
        (!request.requester_branch_id || item.branch_id === request.requester_branch_id) &&
        !requests.some(
          (otherRequest) =>
            otherRequest.id !== request.id &&
            otherRequest.booked_equipment_id === item.id &&
            !["fulfilled", "rejected"].includes(otherRequest.request_status),
        ),
    );

  const employeeStatusCounts = useMemo(
    () =>
      ["pending", "approved", "rejected", "fulfilled"].map((status) => ({
        label: status,
        total: employeeRequests.filter((request) =>
          status === "pending" ? isLivePendingRequest(request) : request.request_status === status,
        ).length,
      })),
    [employeeRequests],
  );

  const toastState = useMemo(() => {
    if (actionError) {
      return { message: actionError, type: "error" as const };
    }

    if (dashboardError) {
      return { message: dashboardError, type: "error" as const };
    }

    if (equipmentQrError) {
      return { message: equipmentQrError, type: "error" as const };
    }

    if (actionMessage) {
      return { message: actionMessage, type: "success" as const };
    }

    return null;
  }, [actionError, actionMessage, dashboardError, equipmentQrError]);

  useEffect(() => {
    if (!toastState) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setActionMessage("");
      setActionError("");
      setDashboardError("");
      setEquipmentQrError("");
    }, 3200);

    return () => window.clearTimeout(timeout);
  }, [toastState]);

  const canRequesterUpdateRequest = (request: RequestRow) => {
    if (request.requester_id !== user.id) {
      return false;
    }

    if (request.clarification_status === "needed") {
      return true;
    }

    if (roleView !== "employee") {
      return false;
    }

    if (request.request_status !== "pending") {
      return false;
    }

    const firstStep = request.workflowSteps[0];
    return firstStep?.action_status === "pending";
  };

  const exportFormatOptions: { value: ExportFormat; label: string }[] = [
    { value: "html", label: "HTML (branded)" },
    { value: "csv", label: "CSV" },
    { value: "json", label: "JSON" },
    { value: "markdown", label: "Markdown" },
  ];

  const getExportFilename = (filename: string, format: ExportFormat) => {
    const base = filename.replace(/\.html?$/i, "");
    const ext = format === "markdown" ? "md" : format;
    return `${base}.${ext}`;
  };

  const escapeCsvValue = (value: string | number | null | undefined) => {
    const text = String(value ?? "");
    if (/[",\n\r,]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

  const rowsToCsv = (rows: Record<string, string | number | null | undefined>[]) => {
    const headers = Object.keys(rows[0]);
    const headerLine = headers.map(escapeCsvValue).join(",");
    const bodyLines = rows.map((row) => headers.map((header) => escapeCsvValue(row[header])).join(","));
    return [headerLine, ...bodyLines].join("\r\n");
  };

  const rowsToMarkdown = (
    rows: Record<string, string | number | null | undefined>[],
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

  const rowsToJson = (rows: Record<string, string | number | null | undefined>[]) =>
    JSON.stringify({
      exportedFrom: "Airtel Inventory Management System",
      exportedAt: new Date().toISOString(),
      rows,
    }, null, 2);

  const downloadExportRows = (
    filename: string,
    title: string,
    subtitle: string,
    rows: Record<string, string | number | null | undefined>[],
    format: ExportFormat,
  ) => {
    if (rows.length === 0) {
      setActionError("There is no data to export for this report.");
      return;
    }

    const fileName = getExportFilename(filename, format);
    let content: string;
    let mimeType = "text/plain;charset=utf-8;";

    if (format === "html") {
      const headers = Object.keys(rows[0]);
      const headerLabels = headers.map((header) => header.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()));
      const generatedOn = new Date().toLocaleString();
      const logoUrl = `${window.location.origin}/airtel-logo.png`;
      const escapeHtml = (value: string | number | null | undefined) =>
        String(value ?? "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");

      const tableHead = headerLabels.map((label) => `<th>${escapeHtml(label)}</th>`).join("");
      const tableBody = rows
        .map(
          (row) =>
            `<tr>${headers
              .map((header) => `<td>${escapeHtml(row[header]) || "&nbsp;"}</td>`)
              .join("")}</tr>`,
        )
        .join("");

      content = `<!DOCTYPE html>
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
          <thead><tr>${tableHead}</tr></thead>
          <tbody>${tableBody}</tbody>
        </table>
      </div>
      <div class="footer">Generated from Airtel IMS workflow dashboard.</div>
    </div>
  </div>
</body>
</html>`;
      mimeType = "text/html;charset=utf-8;";
    } else if (format === "csv") {
      content = rowsToCsv(rows);
      mimeType = "text/csv;charset=utf-8;";
    } else if (format === "json") {
      content = rowsToJson(rows);
      mimeType = "application/json;charset=utf-8;";
    } else {
      content = rowsToMarkdown(rows, title, subtitle);
      mimeType = "text/markdown;charset=utf-8;";
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  };

  const getDownloadFileName = (response: Response, fallback: string) => {
    const contentDisposition = response.headers.get("Content-Disposition") || "";
    const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match?.[1]) {
      return decodeURIComponent(utf8Match[1]);
    }

    const plainMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
    if (plainMatch?.[1]) {
      return plainMatch[1];
    }

    return fallback;
  };

  const handleDownloadReturnAttachment = async (returnId: number, fallbackFileName: string) => {
    setActionError("");
    setActionMessage("");

    try {
      const response = await fetch(`${API_BASE_URL}/returns/${returnId}/attachment?actorUserId=${user.id}`);
      if (!response.ok) {
        const data = await parseApiResponse<{ message?: string }>(response);
        throw new Error(getApiMessage(data, "Unable to download the attachment."));
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = getDownloadFileName(response, fallbackFileName);
      link.click();
      URL.revokeObjectURL(url);
      setActionMessage("Attachment downloaded.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to download the attachment.");
    }
  };

  const exportBrandedDocument = (
    filename: string,
    title: string,
    subtitle: string,
    rows: Record<string, string | number | null | undefined>[],
    format: ExportFormat = "html",
  ) => {
    downloadExportRows(filename, title, subtitle, rows, format);
  };

  const handleExportTimeline = () => {
    exportBrandedDocument(
      `${roleView}-request-timeline`,
      "Workflow Timeline Report",
      "A consolidated view of request progress, branches, approvers, and current workflow stages.",
      timelineRequests.map((request) => ({
        request_id: request.id,
        requester: request.requester_name,
        category: request.category_name,
        branch: request.branch_name,
        status: request.request_status,
        current_stage: request.currentStageLabel,
        approver: request.approver_name,
        created_at: request.created_at,
      })),
      exportFormat,
    );
  };

  useEffect(() => {
    if (
      !(
        (roleView === "it-support" && (activeSection === "employee-assigned" || activeSection === "overview")) ||
        (roleView === "employee" && activeSection === "my-equipment")
      )
    ) {
      return;
    }

    const relevantAssignments =
      roleView === "employee"
        ? employeeAssignments
        : assignments.filter((assignment) => assignment.status === "active");
    const missingPredictions = relevantAssignments.filter(
      (assignment) => assignmentMlPredictions[assignment.id] === undefined && !assignmentMlLoading[assignment.id],
    );

    if (missingPredictions.length === 0) {
      return;
    }

    let cancelled = false;

    setAssignmentMlLoading((current) => {
      const next = { ...current };
      for (const assignment of missingPredictions) {
        next[assignment.id] = true;
      }
      return next;
    });

    void Promise.all(
      missingPredictions.map(async (assignment) => {
        try {
          const { response, data } = await fetchJson<{ probability: number; recommendation: string; modelVersion: string }>(
            `${API_BASE_URL}/ml/replacement/predict?actorUserId=${user.id}&equipmentId=${assignment.equipment_id}`,
          );

          if (!response.ok || !data || typeof data.probability !== "number") {
            return [assignment.id, null] as const;
          }

          return [
            assignment.id,
            {
              probability: data.probability,
              recommendation: data.recommendation,
              modelVersion: data.modelVersion,
            },
          ] as const;
        } catch {
          return [assignment.id, null] as const;
        }
      }),
    ).then((results) => {
      if (cancelled) {
        return;
      }

      setAssignmentMlPredictions((current) => {
        const next = { ...current };
        for (const [assignmentId, prediction] of results) {
          next[assignmentId] = prediction;
        }
        return next;
      });

      setAssignmentMlLoading((current) => {
        const next = { ...current };
        for (const assignment of missingPredictions) {
          next[assignment.id] = false;
        }
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [activeSection, assignmentMlLoading, assignmentMlPredictions, assignments, roleView, user.id]);

  const handleExportReports = () => {
    const reportRows =
      [
        ...filteredReportRequests.map((request) => ({
          report_type: "request",
          record_id: request.id,
          status: request.request_status,
          current_stage: request.currentStageLabel,
          requester: request.requester_name,
          requester_email: request.requester_email,
          requester_job_title: request.requester_job_title,
          requester_employment_status: request.requester_employment_status,
          requester_office_location: request.requester_office_location,
          requester_start_date: request.requester_start_date,
          category: request.category_name,
          branch: request.branch_name,
          approver: request.approver_name,
          fulfillment_status: request.fulfillment_status || "",
          fulfillment_note: request.fulfillment_note || "",
          request_note: request.notes || "",
          workflow_summary: getWorkflowSummary(request),
          created_at: request.created_at,
        })),
        ...(roleView === "it-manager" || roleView === "it-support"
          ? filteredReportEquipment
              .filter((item) => item.status === "available")
              .concat(
                roleView === "it-manager"
                  ? [
                      ...filteredReportEquipment.filter((item) => item.status === "maintenance"),
                      ...filteredReportEquipment.filter((item) => item.status === "assigned"),
                      ...filteredReportEquipment.filter((item) => item.status === "retired"),
                      ...filteredReportEquipment.filter((item) => item.status === "lost"),
                    ]
                  : [
                      ...filteredReportEquipment.filter((item) => item.status === "assigned"),
                      ...filteredReportEquipment.filter((item) => item.status === "maintenance"),
                      ...filteredReportEquipment.filter((item) => item.status === "retired"),
                      ...filteredReportEquipment.filter((item) => item.status === "lost"),
                    ],
              )
              .filter((item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index)
              .map((item) => ({
                report_type: "equipment",
                record_id: item.id,
                status: item.status,
                current_stage: "",
                requester: "",
                requester_email: "",
                requester_job_title: "",
                requester_employment_status: "",
                requester_office_location: "",
                requester_start_date: "",
                category: item.category_name || "",
                branch: item.branch_name || "",
                approver: "",
                fulfillment_status: "",
                fulfillment_note: "",
                request_note: item.notes || "",
                workflow_summary: formatEquipmentSpecs(item) || "",
                created_at: item.purchase_date || "",
              }))
          : []),
        ...(roleView === "it-support"
          ? ["active", "returned", "overdue"].flatMap((status) =>
              filteredReportAssignments.filter((assignment) => assignment.status === status).map((assignment) => ({
                report_type: "assignment",
                record_id: assignment.id,
                status: assignment.status,
                current_stage: "",
                requester: assignment.employee_name,
                requester_email: assignment.employee_email,
                requester_job_title: assignment.employee_job_title,
                requester_employment_status: "",
                requester_office_location: assignment.employee_office_location,
                requester_start_date: "",
                category: "",
                branch: assignment.branch_name || "",
                approver: assignment.assigned_by_name || "",
                fulfillment_status: "",
                fulfillment_note: "",
                request_note: assignment.notes || "",
                workflow_summary: `${assignment.asset_tag} / ${assignment.equipment_name}`,
                created_at: assignment.assigned_at,
              })),
            )
          : []),
      ];

    exportBrandedDocument(
      `${roleView}-reports`,
      "Workflow Report Export",
      "Airtel IMS request, asset, and assignment reporting snapshot.",
      reportRows,
      exportFormat,
    );
  };

  const reportRequestSource =
    roleView === "employee"
      ? employeeRequests
      : roleView === "branch-manager"
        ? branchRequests
        : requests;

  const filteredReportRequests = reportRequestSource.filter((request) =>
    (reportSpecificDate
      ? true
      : isWithinDateWindow(request.requested_at || request.created_at, reportDateWindow)) &&
    isSameSelectedDate(request.requested_at || request.created_at, reportSpecificDate),
  );

  const filteredReportEquipment = equipment.filter((item) => {
    if (roleView === "it-support") {
      if (item.stock_location === "warehouse_stock") {
        return false;
      }

      if (user.branchId && item.branch_id !== user.branchId) {
        return false;
      }
    }

    return (
      (reportSpecificDate
        ? true
        : isWithinDateWindow(item.purchase_date || (item.purchase_year ? `${item.purchase_year}-01-01` : null), reportDateWindow)) &&
      isSameSelectedDate(item.purchase_date || (item.purchase_year ? `${item.purchase_year}-01-01` : null), reportSpecificDate)
    );
  });

  const filteredReportAssignments = assignments.filter((assignment) => {
    if (roleView === "it-support" && user.branchId) {
      const relatedEquipment = equipmentById.get(assignment.equipment_id);

      if (!relatedEquipment || relatedEquipment.branch_id !== user.branchId) {
        return false;
      }
    }

    return (reportSpecificDate ? true : isWithinDateWindow(assignment.assigned_at, reportDateWindow)) && isSameSelectedDate(assignment.assigned_at, reportSpecificDate);
  });

  const getRequestsForReportStatus = (status: string) =>
    filteredReportRequests.filter((request) => {
      if (status === "pending") {
        return isLivePendingRequest(request);
      }

      return request.request_status === status;
    });

  const getEquipmentForReportStatus = (status: string) =>
    filteredReportEquipment.filter((item) => item.status === status);

  const getAssignmentsForReportStatus = (status: string) =>
    filteredReportAssignments.filter((assignment) => assignment.status === status);

  const renderRequestCards = (
    requestRows: RequestRow[],
    mode: "view" | "approve" | "fulfill",
  ) => {
    const pageKey = `${activeSection}-${mode}`;
    const pageSize = pageSizeByKey[pageKey] || DEFAULT_ITEMS_PER_PAGE;
    const totalPages = Math.max(Math.ceil(requestRows.length / pageSize), 1);
    const currentPage = Math.min(requestPageByKey[pageKey] || 1, totalPages);
    const paginatedRows = paginateRows(requestRows, currentPage, pageSize);

    return (
      <div className="user-table workflow-request-table">
        <div className="user-table-head workflow-request-table-head">
          <span>Request</span>
          <span>Requester</span>
          <span>Employee / Context</span>
          <span>Workflow</span>
          <span>Notes</span>
          <span>Actions</span>
        </div>
        {requestRows.length > 0 ? (
          paginatedRows.map((request) => (
          <div className="user-table-row workflow-request-table-row" key={request.id}>
            {(() => {
              const hrmsSnapshot = parseHrmsSnapshot(request.hrms_snapshot);
              const employeeName = request.target_employee_name || hrmsSnapshot.employeeName;
              const employeeRole = request.target_employee_job_title || hrmsSnapshot.jobTitle || request.target_employee_role_name || hrmsSnapshot.roleName;
              const employeeHrmsId = request.target_employee_hrms_employee_id || hrmsSnapshot.hrmsEmployeeId;
              const employeeCode = request.target_employee_code || hrmsSnapshot.employeeCode;
              const employeeGrade = request.target_employee_grade || hrmsSnapshot.employeeGrade;
              const employeeLocation = request.target_employee_office_location || hrmsSnapshot.officeLocation;
              const employeeEmploymentStatus = request.target_employee_employment_status || hrmsSnapshot.employmentStatus;
              const employeeStartDate = request.target_employee_start_date || hrmsSnapshot.startDate;
              const recommendedDeviceProfile = hrmsSnapshot.recommendedDeviceProfile;

              return (
                <>
                  <div className="user-primary-cell">
                    <strong>{request.category_name}</strong>
                    <span>Request {request.id}</span>
                    <span>Type: {(request.request_type || "standard").replace("_", " ")}</span>
                    <span>
                      <span className={`status-pill status-${request.request_status}`}>{request.request_status}</span>
                    </span>
                  </div>
                  <div className="user-secondary-cell">
                    <strong>{request.requester_name}</strong>
                    <span>{request.requester_department_name || request.requester_job_title || "No department"}</span>
                    <span>{request.requester_employment_status || "No employment status"}</span>
                    <span>{request.requester_office_location || "No office location"} / Requested: {formatProfileDate(request.requested_at || request.created_at)}</span>
                  </div>
                  <div className="workflow-table-stack">
                    <div className="user-secondary-cell">
                      <strong>{employeeName || "No target employee"}</strong>
                      <span>{request.target_employee_email || hrmsSnapshot.employeeEmail || "No email"}</span>
                      <span>{employeeRole || "No role captured"} / {request.target_employee_department_name || "No department captured"}</span>
                      <span>{employeeHrmsId || "No HRMS id"} / {employeeCode || "No employee code"} / {employeeGrade || "No employee grade"}</span>
                      <span>{employeeLocation || "No office location"} / {employeeEmploymentStatus || "No employment status"} / Start {formatProfileDate(employeeStartDate)}</span>
                      <span>{recommendedDeviceProfile || "No predicted device profile was generated yet."}</span>
                    </div>
                  </div>
                  <div className="workflow-table-stack">
                    <div className="user-secondary-cell">
                      <strong>{request.branch_name || "No branch"}</strong>
                      <span>{normalizeWorkflowLabel(request.currentStageLabel)}</span>
                      {request.fulfillment_status && request.fulfillment_status !== "ready" ? (
                        <span>
                          Store status: <span className={`status-pill status-${request.fulfillment_status}`}>{request.fulfillment_status.replace("_", " ")}</span>
                          {request.fulfillment_note ? ` / ${request.fulfillment_note}` : ""}
                        </span>
                      ) : null}
                    </div>
                    {renderRequestWorkflowProgress(request)}
                  </div>
                  <div className="workflow-table-stack">
                    <div className="user-secondary-cell">
                      <strong>{request.notes || "No request note provided."}</strong>
                      {request.clarification_status === "needed" && request.clarification_note ? (
                        <span className="warning-text">Clarification needed: {request.clarification_note}</span>
                      ) : null}
                      {request.request_status === "rejected" ? (
                        <span className="error-text">
                          Rejection reason:{" "}
                          {request.workflowSteps.find((step) => step.action_status === "rejected")?.action_note ||
                            request.notes ||
                            "No rejection reason was recorded."}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </>
              );
            })()}

            <div className="workflow-table-actions">
            {mode === "view" ? (
                <div className="table-action-group workflow-stock-table-actions">
                  <button className="table-action" type="button" onClick={() => void openDetailPanel("request", request.id)}>
                    View details
                  </button>
                  {canRequesterUpdateRequest(request) ? (
                  <button className="table-action" type="button" onClick={() => handleEditRequest(request)}>
                    Update request
                  </button>
                  ) : null}
                  {roleView === "employee" && request.clarification_status !== "needed" && canRequesterUpdateRequest(request) ? (
                    <button className="table-action table-action-danger" type="button" onClick={() => void handleDeleteRequest(request.id)}>
                      Delete
                    </button>
                  ) : null}
                </div>
            ) : (
              <div className="card-form-stack">
                {mode === "approve" ? (
                  <>
                    {(() => {
                      const isSubmitting = pendingRequestActionId === request.id;
                      const showInventoryReservation = roleView === "it-support" && request.currentStageKey === "it_inventory_review";
                      const reservedEquipment = request.booked_equipment_id ? equipmentById.get(request.booked_equipment_id) : null;

                      return (
                        <>
                    {showInventoryReservation ? (
                      <>
                      <select
                        value={fulfillmentForm[request.id]?.equipmentId || (request.booked_equipment_id ? String(request.booked_equipment_id) : "")}
                        onChange={(event) =>
                          setFulfillmentForm((current) => ({
                            ...current,
                              [request.id]: {
                                equipmentId: event.target.value,
                                expectedReturnDate: current[request.id]?.expectedReturnDate || "",
                                note: current[request.id]?.note || "",
                                fulfillmentStatus: current[request.id]?.fulfillmentStatus || "ready",
                                replacementDisposition: current[request.id]?.replacementDisposition || "available",
                                replacementConditionStatus: current[request.id]?.replacementConditionStatus || "",
                              },
                            }))
                          }
                          disabled={isSubmitting}
                        >
                          <option value="">Select equipment to reserve</option>
                          {getEquipmentOptionsForRequest(request).map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.asset_tag} / {item.equipment_name}
                            </option>
                          ))}
                        </select>
                        {reservedEquipment ? (
                          <div className="workflow-step-row workflow-step-inline">
                            <strong>Reserved item</strong>
                            <span>{reservedEquipment.asset_tag} / {reservedEquipment.equipment_name}</span>
                          </div>
                        ) : null}
                        {getEquipmentOptionsForRequest(request).length === 0 ? (
                          <p className="loading-text">No matching available stock right now. Approve the step and continue tracking fulfillment status until stock is available.</p>
                        ) : null}
                      </>
                    ) : null}
                    <textarea
                      value={approvalNotes[request.id] || ""}
                      onChange={(event) =>
                        setApprovalNotes((current) => ({
                          ...current,
                          [request.id]: event.target.value,
                        }))
                      }
                      placeholder="Approval note, or required reason if returning/rejecting"
                      disabled={isSubmitting}
                    />
                    <div className="card-action-row">
                      <button
                        className="primary-btn compact-btn btn-success"
                        type="button"
                        onClick={() => void handleApproveRequest(request.id)}
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? "Working..." : "Approve"}
                      </button>
                      {request.request_type === "replacement" && request.currentStageKey === "hr_replacement_booking" ? (
                        <button
                          className="secondary-btn compact-btn btn-soft-primary"
                          type="button"
                          onClick={() => void handleKeepDeviceInService(request.id)}
                          disabled={isSubmitting}
                        >
                          {isSubmitting ? "Working..." : "Keep device"}
                        </button>
                      ) : null}
                      <button
                        className="secondary-btn compact-btn btn-soft-warning"
                        type="button"
                        onClick={() => void handleReturnRequestForClarification(request.id)}
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? "Working..." : "Return"}
                      </button>
                      <button
                        className="secondary-btn compact-btn btn-soft-danger"
                        type="button"
                        onClick={() => void handleRejectRequest(request.id)}
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? "Working..." : "Reject"}
                      </button>
                    </div>
                        </>
                      );
                    })()}
                  </>
                ) : (
                  <>
                    {request.booked_equipment_id ? (
                      (() => {
                        const reservedEquipment = equipmentById.get(request.booked_equipment_id);

                        return reservedEquipment ? (
                          <div className="workflow-step-list">
                            <div className="workflow-step-row">
                              <strong>Reserved equipment</strong>
                              <span>{reservedEquipment.asset_tag} / {reservedEquipment.equipment_name}</span>
                            </div>
                            {formatEquipmentSpecs(reservedEquipment) ? (
                              <div className="workflow-step-row">
                                <strong>Device specs</strong>
                                <span>{formatEquipmentSpecs(reservedEquipment)}</span>
                              </div>
                            ) : null}
                            <div className="card-action-row">
                              <button className="secondary-btn compact-btn" type="button" onClick={() => void handlePreviewEquipmentQr(reservedEquipment, activeSection)}>
                                QR code
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="loading-text">Reserved equipment details are not available right now.</p>
                        );
                      })()
                    ) : (
                      <select
                        value={fulfillmentForm[request.id]?.equipmentId || ""}
                        onChange={(event) =>
                          setFulfillmentForm((current) => ({
                            ...current,
                            [request.id]: {
                              equipmentId: event.target.value,
                              expectedReturnDate: current[request.id]?.expectedReturnDate || "",
                              note: current[request.id]?.note || "",
                              fulfillmentStatus: current[request.id]?.fulfillmentStatus || "waiting_stock",
                              replacementDisposition: current[request.id]?.replacementDisposition || "available",
                              replacementConditionStatus: current[request.id]?.replacementConditionStatus || "",
                            },
                          }))
                        }
                      >
                        <option value="">Select equipment</option>
                        {getEquipmentOptionsForRequest(request).map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.asset_tag} / {item.equipment_name}
                          </option>
                        ))}
                      </select>
                    )}
                    <input
                      type="date"
                      value={fulfillmentForm[request.id]?.expectedReturnDate || ""}
                      onChange={(event) =>
                        setFulfillmentForm((current) => ({
                          ...current,
                          [request.id]: {
                            equipmentId: current[request.id]?.equipmentId || "",
                            expectedReturnDate: event.target.value,
                            note: current[request.id]?.note || "",
                            fulfillmentStatus: current[request.id]?.fulfillmentStatus || "waiting_stock",
                            replacementDisposition: current[request.id]?.replacementDisposition || "available",
                            replacementConditionStatus: current[request.id]?.replacementConditionStatus || "",
                          },
                        }))
                      }
                    />
                    <select
                      value={fulfillmentForm[request.id]?.fulfillmentStatus || "waiting_stock"}
                      onChange={(event) =>
                        setFulfillmentForm((current) => ({
                          ...current,
                          [request.id]: {
                            equipmentId: current[request.id]?.equipmentId || "",
                            expectedReturnDate: current[request.id]?.expectedReturnDate || "",
                            note: current[request.id]?.note || "",
                            fulfillmentStatus: event.target.value as FulfillmentStatus,
                            replacementDisposition: current[request.id]?.replacementDisposition || "available",
                            replacementConditionStatus: current[request.id]?.replacementConditionStatus || "",
                          },
                        }))
                      }
                    >
                      <option value="waiting_stock">Waiting for stock</option>
                      <option value="backordered">Backordered</option>
                      <option value="on_hold">On hold</option>
                      <option value="ready">Ready to fulfill</option>
                    </select>
                    <textarea
                      value={fulfillmentForm[request.id]?.note || ""}
                      onChange={(event) =>
                        setFulfillmentForm((current) => ({
                          ...current,
                          [request.id]: {
                            equipmentId: current[request.id]?.equipmentId || "",
                            expectedReturnDate: current[request.id]?.expectedReturnDate || "",
                            note: event.target.value,
                            fulfillmentStatus: current[request.id]?.fulfillmentStatus || "waiting_stock",
                            replacementDisposition: current[request.id]?.replacementDisposition || "available",
                            replacementConditionStatus: current[request.id]?.replacementConditionStatus || "",
                          },
                        }))
                      }
                      placeholder="Fulfillment note, waiting reason, or stock update"
                    />
                    {request.request_type === "replacement" && request.source_equipment_id ? (
                      (() => {
                        const sourceEquipment = equipmentById.get(request.source_equipment_id);

                        return (
                          <>
                            <div className="workflow-step-list">
                              <div className="workflow-step-row">
                                <strong>Current device</strong>
                                <span>
                                  {sourceEquipment
                                    ? `${sourceEquipment.asset_tag} / ${sourceEquipment.equipment_name}`
                                    : "Current device linked to replacement request"}
                                </span>
                              </div>
                              {sourceEquipment && formatEquipmentSpecs(sourceEquipment) ? (
                                <div className="workflow-step-row">
                                  <strong>Current specs</strong>
                                  <span>{formatEquipmentSpecs(sourceEquipment)}</span>
                                </div>
                              ) : null}
                            </div>
                            <select
                              value={fulfillmentForm[request.id]?.replacementDisposition || "available"}
                              onChange={(event) =>
                                setFulfillmentForm((current) => ({
                                  ...current,
                                  [request.id]: {
                                    equipmentId: current[request.id]?.equipmentId || "",
                                    expectedReturnDate: current[request.id]?.expectedReturnDate || "",
                                    note: current[request.id]?.note || "",
                                    fulfillmentStatus: current[request.id]?.fulfillmentStatus || "waiting_stock",
                                    replacementDisposition: event.target.value as ReplacementDisposition,
                                    replacementConditionStatus: current[request.id]?.replacementConditionStatus || "",
                                  },
                                }))
                              }
                            >
                              <option value="available">Old device returns to stock</option>
                              <option value="retired">Old device is disposed</option>
                            </select>
                            <input
                              type="text"
                              value={fulfillmentForm[request.id]?.replacementConditionStatus || ""}
                              onChange={(event) =>
                                setFulfillmentForm((current) => ({
                                  ...current,
                                  [request.id]: {
                                    equipmentId: current[request.id]?.equipmentId || "",
                                    expectedReturnDate: current[request.id]?.expectedReturnDate || "",
                                    note: current[request.id]?.note || "",
                                    fulfillmentStatus: current[request.id]?.fulfillmentStatus || "waiting_stock",
                                    replacementDisposition: current[request.id]?.replacementDisposition || "available",
                                    replacementConditionStatus: event.target.value,
                                  },
                                }))
                              }
                              placeholder="Old device condition, for example battery degraded or screen damaged"
                            />
                          </>
                        );
                      })()
                    ) : null}
                    {!request.booked_equipment_id && getEquipmentOptionsForRequest(request).length === 0 ? (
                      <p className="loading-text">No matching available stock right now. Mark the request as waiting, backordered, or on hold.</p>
                    ) : null}
                    <div className="card-action-row">
                      <button className="primary-btn compact-btn btn-success" type="button" onClick={() => void handleFulfillRequest(request.id)}>
                        Fulfill
                      </button>
                      <button className="secondary-btn compact-btn btn-soft-warning" type="button" onClick={() => void handleUpdateFulfillmentStatus(request.id)}>
                        Save status
                      </button>
                      <button className="secondary-btn compact-btn" type="button" onClick={() => void handleReturnRequestForClarification(request.id)}>
                        Return
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
            </div>
          </div>
          ))
        ) : (
          <p className="loading-text">No records are waiting in this section.</p>
        )}
        {renderPaginationBar(pageKey, requestRows.length, currentPage, pageSize, (page) =>
          setRequestPageByKey((current) => ({
            ...current,
            [pageKey]: page,
          }))
        )}
      </div>
    );
  };

  const renderMoveOrderTable = (
    orderRows: MoveOrderRow[],
    context: "warehouse" | "it-support",
  ) => {
    const pageKey = `${activeSection}-${context}-move-orders`;
    const pageSize = pageSizeByKey[pageKey] || DEFAULT_ITEMS_PER_PAGE;
    const totalPages = Math.max(Math.ceil(orderRows.length / pageSize), 1);
    const currentPage = Math.min(requestPageByKey[pageKey] || 1, totalPages);
    const paginatedRows = paginateRows(orderRows, currentPage, pageSize);

    return (
      <>
        <div className="report-control-bar">
          <div>
            <div className="filter-chip-row">
              {(["all", "weekly", "monthly"] as DateWindowFilter[]).map((windowKey) => (
                <button
                  key={windowKey}
                  type="button"
                  className={`filter-chip${moveOrderDateWindow === windowKey ? " is-active" : ""}`}
                  onClick={() => setMoveOrderDateWindow(windowKey)}
                >
                  {normalizeReportDateLabel(windowKey)}
                </button>
              ))}
            </div>
            <div className="report-date-filter-row">
              <input
                className="table-search-input"
                type="search"
                value={moveOrderSearchTerm}
                onChange={(event) => setMoveOrderSearchTerm(event.target.value)}
                placeholder="Search request number, requester, branch, status, item, reason..."
                aria-label="Search move orders"
              />
              <input
                className="table-search-input report-date-input"
                type="date"
                value={moveOrderSpecificDate}
                max={todayDateValue}
                onChange={(event) => setMoveOrderSpecificDate(event.target.value)}
                aria-label="Filter move orders by specific date"
              />
              {moveOrderSpecificDate ? (
                <button className="secondary-btn compact-btn" type="button" onClick={() => setMoveOrderSpecificDate("")}>
                  Clear date
                </button>
              ) : null}
            </div>
          </div>
          <span className="report-window-label">Showing {normalizeReportDateLabel(moveOrderDateWindow)} move orders</span>
        </div>
        <div className="user-table workflow-move-order-table">
          <div className="user-table-head workflow-move-order-table-head">
            <span>Order</span>
            <span>Requester / Destination</span>
            <span>Items</span>
            <span>Status</span>
            <span>Notes / Actions</span>
          </div>
          {orderRows.length > 0 ? (
            paginatedRows.map((order) => (
              <div className="user-table-row workflow-move-order-table-row" key={`move-order-table-${order.id}`}>
                <div className="user-primary-cell">
                  <strong>{order.request_number}</strong>
                  <span>Created: {formatProfileDate(order.created_at)}</span>
                  <span>Receipt: {order.receipt_status}{order.received_confirmed_at ? ` / ${formatProfileDate(order.received_confirmed_at)}` : ""}</span>
                </div>
                <div className="user-secondary-cell">
                  <strong>{order.requester_name}</strong>
                  <span>{order.requester_email}</span>
                  <span>Destination: {order.destination_branch_name || user.branchName || "Not set"}</span>
                </div>
                <div className="user-secondary-cell">
                  <strong>{order.items.length} item(s)</strong>
                  <span>
                    {order.items.map((item) =>
                      item.asset_tag
                        ? `${item.asset_tag} (${item.equipment_name || item.category_name || item.requested_category_name || "unknown"})`
                        : `${item.requested_category_name || item.category_name || "Unknown category"} x${item.requested_quantity}`,
                    ).join(", ")}
                  </span>
                  <span>{order.reason || "No reason provided"}</span>
                </div>
                <div className="user-secondary-cell">
                  <strong><span className={`status-pill status-${order.status}`}>{order.status}</span></strong>
                  <div>{renderMoveOrderWorkflowProgress(order)}</div>
                </div>
                <div className="user-secondary-cell workflow-table-actions">
                  <strong>{order.reviewed_note || order.note || "No note"}</strong>
                  {context === "warehouse" && order.status === "pending" ? (
                    <>
                      <textarea
                        className="warehouse-note-field"
                        value={warehouseDecisionNotes[order.id] || ""}
                        onChange={(event) =>
                          setWarehouseDecisionNotes((current) => ({
                            ...current,
                            [order.id]: event.target.value,
                          }))
                        }
                        placeholder="Optional approval or rejection note"
                      />
                      <div className="card-action-row">
                        <button className="primary-btn compact-btn" type="button" onClick={() => void handleWarehouseDecision(order.id, "approved")}>
                          Approve
                        </button>
                        <button className="secondary-btn compact-btn btn-soft-warning" type="button" onClick={() => void handleWarehouseDecision(order.id, "partial")}>
                          Partial
                        </button>
                        <button className="secondary-btn compact-btn btn-soft-danger" type="button" onClick={() => void handleWarehouseDecision(order.id, "rejected")}>
                          Reject
                        </button>
                      </div>
                    </>
                  ) : null}
                  {context === "it-support" && ["approved", "partial"].includes(order.status) && order.receipt_status !== "received" ? (
                    <div className="card-action-row">
                      <button className="primary-btn compact-btn" type="button" onClick={() => void handleConfirmMoveOrderReceipt(order.id)}>
                        Confirm received into IT stock
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ))
          ) : (
            <article className="empty-state-card">
              <strong>No move orders are available for this filter.</strong>
              <p>Try a different search term or date range.</p>
            </article>
          )}
        </div>
        {renderPaginationBar(pageKey, orderRows.length, currentPage, pageSize, (page) =>
          setRequestPageByKey((current) => ({
            ...current,
            [pageKey]: page,
          }))
        )}
      </>
    );
  };

  const renderLifecyclePanel = () => (
    <section className="dashboard-panel">
      <div className="panel-header">
        <h3>Asset Lifecycle History</h3>
        <span>{lifecycleEvents.length} recent events</span>
      </div>
      <div className="mini-list">
        {lifecycleEvents.length > 0 ? (
          lifecycleEvents.slice(0, 10).map((event) => (
            <article className="mini-list-card" key={event.id}>
              <strong>{event.asset_tag}</strong>
              <span>{event.event_label}</span>
              <span>
                {event.from_status || "start"} -&gt; {event.to_status || "recorded"} / {formatProfileDate(event.created_at)}
              </span>
              <span>{event.event_note || event.actor_name || "No extra note."}</span>
            </article>
          ))
        ) : (
          <p className="loading-text">Lifecycle events will appear as assets are registered, assigned, returned, repaired, or retired.</p>
        )}
      </div>
    </section>
  );

  const renderNotificationsSection = () => (
    <section className="dashboard-panel notification-center-panel">
      <div className="panel-header">
        <div>
          <h3>Notification Center</h3>
          <p className="dashboard-subtitle">Recent workflow updates, asset changes, and operational messages appear here.</p>
        </div>
        <div className="filter-chip-row notification-filter-row">
          {([
            { key: "all", label: "All", total: notifications.length },
            { key: "unread", label: "Unread", total: unreadNotificationCount },
            { key: "alerts", label: "Alerts", total: smartAlerts.length },
          ] as Array<{ key: "all" | "unread" | "alerts"; label: string; total: number }>).map((option) => (
            <button
              className={`filter-chip${notificationFilter === option.key ? " is-active" : ""}`}
              key={option.key}
              type="button"
              onClick={() => setNotificationFilter(option.key)}
            >
              {option.label} ({option.total})
            </button>
          ))}
        </div>
      </div>
      <div className="notification-summary-grid">
        <article className="notification-summary-card">
          <small>Unread now</small>
          <strong>{unreadNotificationCount}</strong>
          <span>New workflow updates still waiting for review.</span>
        </article>
        <article className="notification-summary-card">
          <small>Today</small>
          <strong>{todayNotificationCount}</strong>
          <span>Messages or events created today.</span>
        </article>
        <article className="notification-summary-card notification-summary-card-alert">
          <small>Smart alerts</small>
          <strong>{smartAlerts.length}</strong>
          <span>System-generated risk signals and stock warnings.</span>
        </article>
      </div>
      {smartAlerts.length > 0 ? (
        <div className="smart-alert-grid">
          {smartAlerts.slice(0, 4).map((alert, index) => (
            <article className={`smart-alert-card is-${alert.severity}`} key={`${alert.title}-${index}`}>
              <strong>{alert.title}</strong>
              <span>{alert.message}</span>
            </article>
          ))}
        </div>
      ) : null}
      <div className="notification-list">
        {visibleNotifications.length > 0 ? (
          visibleNotifications.map((item) => (
            <article className="notification-list-card" key={item.id}>
              <div className="notification-list-icon" aria-hidden="true">
                <Bell size={18} strokeWidth={2.4} />
              </div>
              <div>
                <div className="notification-list-head">
                  <strong>{item.title}</strong>
                  <time dateTime={item.created_at}>{formatProfileDate(item.created_at)}</time>
                </div>
                <p>{item.message || "No message was attached to this notification."}</p>
                <span className={`status-pill status-${item.status === "unread" ? "pending" : "fulfilled"}`}>
                  {item.status === "unread" ? "New notification" : item.status}
                </span>
              </div>
            </article>
          ))
        ) : (
          <div className="notification-empty-state">
            <Bell size={24} strokeWidth={2.2} />
            <strong>No notifications yet</strong>
            <p>You are all caught up for this filter. New workflow updates will appear here.</p>
          </div>
        )}
      </div>
    </section>
  );

  const renderOverview = () => {
    if (roleView === "branch-manager") {
      const branchAssetChartKey = "branch-assets";
      const branchRequestChartKey = "branch-requests";
      const activeBranchAssetLabel = chartFocusByKey[branchAssetChartKey] || "";
      const activeBranchRequestLabel = chartFocusByKey[branchRequestChartKey] || "";
      const branchAssetStatusData = [
        { label: "Available", value: branchEquipment.filter((item) => item.status === "available").length },
        { label: "Assigned", value: branchEquipment.filter((item) => item.status === "assigned").length },
        { label: "Maintenance", value: branchEquipment.filter((item) => item.status === "maintenance").length },
        { label: "Retired", value: branchEquipment.filter((item) => item.status === "retired").length },
        { label: "Lost", value: branchEquipment.filter((item) => item.status === "lost").length },
      ];
      const branchRequestStatusData = ["pending", "approved", "rejected", "fulfilled"].map((status) => ({
        label: status,
        total: 0,
      })).map((item) => ({
        label: item.label,
        value: branchRequests.filter((request) =>
          item.label === "pending" ? isLivePendingRequest(request) : request.request_status === item.label,
        ).length,
      }));
      return (
        <>
          <section className="dashboard-card-grid">
            <OverviewShortcutCard
              title="Branch Requests"
              value={branchRequests.length}
              description="Total requests created by employees in this branch."
              icon={ClipboardCheck}
              className="featured-metric-card"
              insight={`${branchApprovals.length} waiting for your review`}
              actionLabel="Open branch activity"
              onClick={() => setActiveSection("assets")}
            />
            <OverviewShortcutCard
              title="Pending Approvals"
              value={branchApprovals.length}
              description="Requests currently waiting for branch manager review."
              icon={ShieldCheck}
              insight={`${branchRequests.filter((request) => request.request_status === "fulfilled").length} already completed`}
              actionLabel="Review approvals"
              onClick={() => setActiveSection("approvals")}
            />
            <OverviewShortcutCard
              title="Branch Assets"
              value={branchEquipment.length}
              description="Equipment currently linked to this branch."
              icon={Warehouse}
              actionLabel="View branch assets"
              onClick={() => setActiveSection("assets")}
            />
            <OverviewShortcutCard
              title="Branch Employees"
              value={branchEmployees.length}
              description="Employees in this branch with their assigned equipment accountability."
              icon={Users}
              actionLabel="View employees"
              onClick={() => setActiveSection("employees")}
            />
          </section>
          <section className="chart-panel-grid">
            <section className="dashboard-panel chart-panel-card">
              <div className="panel-header">
                <h3>Branch Asset Status</h3>
              </div>
              <HorizontalBarChart
                data={branchAssetStatusData}
                emptyLabel="No branch asset activity yet."
                activeLabel={activeBranchAssetLabel}
                onSelect={(label) => toggleChartFocus(branchAssetChartKey, label)}
              />
            </section>
            <section className="dashboard-panel chart-panel-card">
              <div className="panel-header">
                <h3>Branch Request Mix</h3>
              </div>
              <DonutChart
                data={branchRequestStatusData}
                emptyLabel="No branch request activity yet."
                activeLabel={activeBranchRequestLabel}
                onSelect={(label) => toggleChartFocus(branchRequestChartKey, label)}
              />
            </section>
          </section>
          {activeBranchAssetLabel || activeBranchRequestLabel ? (
            <section className="chart-panel-grid">
              {activeBranchAssetLabel
                ? renderFocusPanel(
                    `Branch assets: ${activeBranchAssetLabel}`,
                    branchEquipment
                      .filter((item) => item.status.toLowerCase() === activeBranchAssetLabel.toLowerCase())
                      .map((item) => ({
                        key: `branch-asset-${item.id}`,
                        title: item.asset_tag,
                        subtitle: `${item.equipment_name} / ${item.category_name || "No category"}`,
                        meta: `${item.branch_name || "No branch"} / ${item.serial_number}`,
                      })),
                    "No branch assets match this chart focus.",
                  )
                : null}
              {activeBranchRequestLabel
                ? renderFocusPanel(
                    `Branch requests: ${activeBranchRequestLabel}`,
                    branchRequests
                      .filter((request) =>
                        activeBranchRequestLabel === "pending"
                          ? isLivePendingRequest(request)
                          : request.request_status === activeBranchRequestLabel,
                      )
                      .map((request) => ({
                        key: `branch-request-${request.id}`,
                        title: `${request.category_name} request ${request.id}`,
                        subtitle: `${request.requester_name} / ${normalizeWorkflowLabel(request.currentStageLabel)}`,
                        meta: request.branch_name || "No branch",
                      })),
                    "No branch requests match this chart focus.",
                  )
                : null}
            </section>
          ) : null}
          <section className="dashboard-bottom-row">
            <section className="dashboard-panel">
              <div className="panel-header">
                <h3>Pending Branch Approvals</h3>
              </div>
              {renderRequestCards(branchApprovals, "approve")}
            </section>
          </section>
        </>
      );
    }

    if (roleView === "hr") {
      const hrStatusChartKey = "hr-request-status";
      const hrTypeChartKey = "hr-request-type";
      const activeHrStatusLabel = chartFocusByKey[hrStatusChartKey] || "";
      const activeHrTypeLabel = chartFocusByKey[hrTypeChartKey] || "";
      const employeeCount = requests.reduce((map, request) => map.add(request.requester_id), new Set<number>()).size;
      const hrRequestStatusData = ["pending", "approved", "rejected", "fulfilled"].map((status) => ({
        label: status,
        value: requests.filter((request) =>
          status === "pending" ? isLivePendingRequest(request) : request.request_status === status,
        ).length,
      }));
      const hrRequestTypeData = ["new_hire", "standard", "replacement", "loss_theft"].map((type) => ({
        label: type.replace("_", " "),
        value: requests.filter((request) => (request.request_type || "standard") === type).length,
      }));

      return (
        <>
          <section className="dashboard-card-grid">
            <OverviewShortcutCard
              title="HR Approvals"
              value={hrApprovals.length}
              description="Requests waiting for HR verification."
              icon={ShieldCheck}
              insight={`${employees.length || employeeCount} employee records in scope`}
              actionLabel="Review approvals"
              onClick={() => setActiveSection("approvals")}
            />
            <OverviewShortcutCard
              title="Employees Seen"
              value={employees.length || employeeCount}
              description="Employee equipment accountability across branches."
              icon={Users}
              className="hr-metric-card"
              actionLabel="View employees"
              onClick={() => setActiveSection("employees")}
            />
            <OverviewShortcutCard
              title="HR Requests"
              value={requests.filter((request) => request.requester_id === user.id).length}
              description="Requests submitted by HR for onboarding and employee provisioning."
              icon={Send}
              className="hr-metric-card"
              actionLabel="Open my requests"
              onClick={() => setActiveSection("my-requests")}
            />
            <OverviewShortcutCard
              title="Fulfilled Requests"
              value={requests.filter((request) => request.request_status === "fulfilled").length}
              description="Requests already delivered to employees."
              icon={CheckCheck}
              className="hr-metric-card"
              actionLabel="Open reports"
              onClick={() => setActiveSection("reports")}
            />
          </section>
          <section className="chart-panel-grid">
            <section className="dashboard-panel chart-panel-card">
              <div className="panel-header">
                <h3>HR Request Status</h3>
              </div>
              <DonutChart
                data={hrRequestStatusData}
                emptyLabel="No HR request activity yet."
                activeLabel={activeHrStatusLabel}
                onSelect={(label) => toggleChartFocus(hrStatusChartKey, label)}
              />
            </section>
            <section className="dashboard-panel chart-panel-card">
              <div className="panel-header">
                <h3>Request Type Demand</h3>
              </div>
              <HorizontalBarChart
                data={hrRequestTypeData}
                emptyLabel="No HR request types recorded yet."
                activeLabel={activeHrTypeLabel}
                onSelect={(label) => toggleChartFocus(hrTypeChartKey, label)}
              />
            </section>
          </section>
          {activeHrStatusLabel || activeHrTypeLabel ? (
            <section className="chart-panel-grid">
              {activeHrStatusLabel
                ? renderFocusPanel(
                    `HR requests: ${activeHrStatusLabel}`,
                    requests
                      .filter((request) =>
                        activeHrStatusLabel === "pending"
                          ? isLivePendingRequest(request)
                          : request.request_status === activeHrStatusLabel,
                      )
                      .map((request) => ({
                        key: `hr-request-${request.id}`,
                        title: `${request.category_name} request ${request.id}`,
                        subtitle: `${request.requester_name} / ${(request.request_type || "standard").replace("_", " ")}`,
                        meta: normalizeWorkflowLabel(request.currentStageLabel),
                      })),
                    "No HR requests match this chart focus.",
                  )
                : null}
              {activeHrTypeLabel
                ? renderFocusPanel(
                    `Request type: ${activeHrTypeLabel}`,
                    requests
                      .filter((request) => (request.request_type || "standard").replace("_", " ") === activeHrTypeLabel)
                      .map((request) => ({
                        key: `hr-type-${request.id}`,
                        title: `${request.category_name} request ${request.id}`,
                        subtitle: `${request.requester_name} / ${formatLabelText(request.request_status)}`,
                        meta: request.branch_name || "No branch",
                      })),
                    "No requests match this request type focus.",
                  )
                : null}
            </section>
          ) : null}
        </>
      );
    }

    if (roleView === "it-manager") {
      const issueChartKey = "it-manager-issues";
      const equipmentChartKey = "it-manager-equipment";
      const activeIssueLabel = chartFocusByKey[issueChartKey] || "";
      const activeEquipmentLabel = chartFocusByKey[equipmentChartKey] || "";
      const issueStatusData = ["open", "in_progress", "resolved", "closed"].map((status) => ({
        label: status.replace("_", " "),
        value: issues.filter((issue) => issue.issue_status === status).length,
      }));
      const equipmentHealthData = [
        { label: "Available", value: equipment.filter((item) => item.status === "available").length },
        { label: "Assigned", value: equipment.filter((item) => item.status === "assigned").length },
        { label: "Maintenance", value: equipment.filter((item) => item.status === "maintenance").length },
        { label: "Retired", value: equipment.filter((item) => item.status === "retired").length },
        { label: "Lost", value: equipment.filter((item) => item.status === "lost").length },
      ];
      return (
        <>
          <section className="dashboard-card-grid">
            <OverviewShortcutCard
              title="IT Approvals"
              value={itApprovals.length}
              description="Requests waiting for technical approval."
              icon={ShieldCheck}
              className="featured-metric-card"
              insight={`${issues.filter((issue) => issue.issue_status !== "closed").length} active incidents`}
              actionLabel="Review approvals"
              onClick={() => setActiveSection("approvals")}
            />
            <OverviewShortcutCard
              title="Open Issues"
              value={issues.filter((issue) => issue.issue_status !== "closed").length}
              description="Issue tickets still active in the asset lifecycle."
              icon={Wrench}
              actionLabel="Inspect equipment"
              onClick={() => setActiveSection("equipment")}
            />
            <OverviewShortcutCard
              title="Return Checks"
              value={pendingFinalReturnApprovals.length}
              description="Returned devices waiting for IT Director final approval."
              icon={RotateCcw}
              actionLabel="Approve returns"
              onClick={() => setActiveSection("returns")}
            />
            <OverviewShortcutCard
              title="Maintenance Assets"
              value={equipment.filter((item) => item.status === "maintenance").length}
              description="Equipment in maintenance right now."
              icon={TimerReset}
              actionLabel="Open equipment"
              onClick={() => setActiveSection("equipment")}
            />
            <OverviewShortcutCard
              title="Available Equipment"
              value={availableEquipment.length}
              description="Assets available for future approval and assignment."
              icon={Warehouse}
              actionLabel="View inventory"
              onClick={() => setActiveSection("equipment")}
            />
          </section>
          <section className="chart-panel-grid">
            <section className="dashboard-panel chart-panel-card">
              <div className="panel-header">
                <h3>Issue Resolution Pipeline</h3>
              </div>
              <HorizontalBarChart
                data={issueStatusData}
                emptyLabel="No issue activity recorded yet."
                activeLabel={activeIssueLabel}
                onSelect={(label) => toggleChartFocus(issueChartKey, label)}
              />
            </section>
            <section className="dashboard-panel chart-panel-card">
              <div className="panel-header">
                <h3>Equipment Status Mix</h3>
              </div>
              <DonutChart
                data={equipmentHealthData}
                emptyLabel="No equipment status data available."
                activeLabel={activeEquipmentLabel}
                onSelect={(label) => toggleChartFocus(equipmentChartKey, label)}
              />
            </section>
          </section>
          {activeIssueLabel || activeEquipmentLabel ? (
            <section className="chart-panel-grid">
              {activeIssueLabel
                ? renderFocusPanel(
                    `Issues: ${activeIssueLabel}`,
                    issues
                      .filter((issue) => issue.issue_status.replace("_", " ") === activeIssueLabel)
                      .map((issue) => ({
                        key: `issue-${issue.id}`,
                        title: issue.issue_title,
                        subtitle: `${issue.asset_tag} / ${issue.priority}`,
                        meta: issue.reported_by_name,
                      })),
                    "No issues match this chart focus.",
                  )
                : null}
              {activeEquipmentLabel
                ? renderFocusPanel(
                    `Equipment: ${activeEquipmentLabel}`,
                    equipment
                      .filter((item) => formatLabelText(item.status) === activeEquipmentLabel)
                      .map((item) => ({
                        key: `it-equipment-${item.id}`,
                        title: item.asset_tag,
                        subtitle: `${item.equipment_name} / ${item.category_name || "No category"}`,
                        meta: item.branch_name || "No branch",
                      })),
                    "No equipment items match this chart focus.",
                  )
                : null}
            </section>
          ) : null}
          <section className="dashboard-bottom-row">
            {renderReplacementAdvisoryPanel(
              "Replacement Advisory",
              "Maintenance-heavy devices are scored here so IT leaders can decide whether to repair, review, or replace.",
              replacementInsights.filter((item) => item.recommendation !== "Keep in service"),
            )}
          </section>
          <section className="dashboard-bottom-row">
            <section className="dashboard-panel">
              <div className="panel-header">
                <h3>Pending IT Approvals</h3>
              </div>
              {renderRequestCards(itApprovals, "approve")}
            </section>
          </section>
        </>
      );
    }

    if (roleView === "it-support") {
      const supportFlowChartKey = "it-support-flow";
      const supportAssignmentChartKey = "it-support-assignment";
      const activeSupportFlowLabel = chartFocusByKey[supportFlowChartKey] || "";
      const activeSupportAssignmentLabel = chartFocusByKey[supportAssignmentChartKey] || "";
      const itSupportFlowData = [
        { label: "Available stock", value: localAvailableEquipment.length },
        { label: "Awaiting warehouse", value: itSupportMoveOrders.filter((item) => item.status === "pending").length },
        { label: "Fulfillment queue", value: fulfillmentRequests.length },
        { label: "Return intake", value: pendingItReturnReviews.length + pendingReturnIntake.length },
      ];
      const assignmentStatusData = [
        { label: "Active", value: assignments.filter((assignment) => assignment.status === "active").length },
        { label: "Returned", value: assignments.filter((assignment) => assignment.status === "returned").length },
        { label: "Overdue", value: assignments.filter((assignment) => assignment.status === "overdue").length },
      ];
      const supportReturnFocusRows = [...pendingReturnIntake, ...pendingItReturnReviews].map((item) => ({
        key: `support-return-${item.id}`,
        title: item.asset_tag,
        subtitle: `${item.employee_name} / ${formatLabelText(item.return_status)}`,
        meta: item.equipment_name,
      }));
      return (
        <>
          <section className="dashboard-card-grid dashboard-card-grid-storekeeper">
            <OverviewShortcutCard
              title="Approval Queue"
              value={itSupportApprovals.length}
              description="Requests waiting for IT Support Engineer approval after HR review."
              icon={ShieldCheck}
              insight={`${fulfillmentRequests.length} requests already in delivery stage`}
              actionLabel="Review approvals"
              onClick={() => setActiveSection("approvals")}
            />
            <OverviewShortcutCard
              title="Store Operations"
              value={localAvailableEquipment.length}
              description="Live IT branch stock currently available for issue after warehouse receipt."
              icon={PackageCheck}
              kicker="Control Center"
              actionLabel="Open stock"
              onClick={() => setActiveSection("stock")}
            />
            <OverviewShortcutCard
              title="Warehouse Requests"
              value={itSupportMoveOrders.filter((item) => item.status === "pending").length}
              description="Device requests currently waiting for warehouse approval."
              icon={Warehouse}
              actionLabel="Open move orders"
              onClick={() => setActiveSection("move-orders")}
            />
            <OverviewShortcutCard
              title="Fulfillment Queue"
              value={fulfillmentRequests.length}
              description="Requests that reached the IT support delivery stage."
              icon={FolderInput}
              actionLabel="Open fulfillment"
              onClick={() => setActiveSection("fulfillment")}
            />
            <OverviewShortcutCard
              title="Return Intake"
              value={pendingItReturnReviews.length + pendingReturnIntake.length}
              description="Returned equipment waiting for IT Support receipt, assessment, or legacy intake."
              icon={RotateCcw}
              actionLabel="Process returns"
              onClick={() => setActiveSection("returns")}
            />
            <OverviewShortcutCard
              title="Available Stock"
              value={localAvailableEquipment.length}
              description="Equipment available in this branch for issue."
              icon={Boxes}
              actionLabel="View stock"
              onClick={() => setActiveSection("stock")}
            />
            <OverviewShortcutCard
              title="Active Assignments"
              value={assignments.filter((assignment) => assignment.status === "active").length}
              description="Assets already assigned to employees."
              icon={UserRound}
              actionLabel="Open assigned items"
              onClick={() => setActiveSection("employee-assigned")}
            />
            <OverviewShortcutCard
              title="Fulfilled Requests"
              value={requests.filter((request) => request.request_status === "fulfilled").length}
              description="Requests delivered through the workflow."
              icon={CheckCheck}
              actionLabel="View timeline"
              onClick={() => setActiveSection("timeline")}
            />
          </section>
          <section className="chart-panel-grid">
            <section className="dashboard-panel chart-panel-card">
              <div className="panel-header">
                <h3>IT Support Workload</h3>
              </div>
              <HorizontalBarChart
                data={itSupportFlowData}
                emptyLabel="No IT support workload signals yet."
                activeLabel={activeSupportFlowLabel}
                onSelect={(label) => toggleChartFocus(supportFlowChartKey, label)}
              />
            </section>
            <section className="dashboard-panel chart-panel-card">
              <div className="panel-header">
                <h3>Assignment Status</h3>
              </div>
              <DonutChart
                data={assignmentStatusData}
                emptyLabel="No assignment records available."
                activeLabel={activeSupportAssignmentLabel}
                onSelect={(label) => toggleChartFocus(supportAssignmentChartKey, label)}
              />
            </section>
          </section>
          {activeSupportFlowLabel || activeSupportAssignmentLabel ? (
            <section className="chart-panel-grid">
              {activeSupportFlowLabel
                ? renderFocusPanel(
                    `IT support focus: ${activeSupportFlowLabel}`,
                    (
                      activeSupportFlowLabel === "Available stock"
                        ? localAvailableEquipment.map((item) => ({
                            key: `support-stock-${item.id}`,
                            title: item.asset_tag,
                            subtitle: `${item.equipment_name} / ${item.category_name || "No category"}`,
                            meta: item.branch_name || "No branch",
                          }))
                        : activeSupportFlowLabel === "Awaiting warehouse"
                          ? itSupportMoveOrders.filter((item) => item.status === "pending").map((item) => ({
                              key: `support-order-${item.id}`,
                              title: item.request_number,
                              subtitle: `${item.items.length} item(s) / ${item.destination_branch_name || "No branch"}`,
                              meta: item.reason || "No reason",
                            }))
                          : activeSupportFlowLabel === "Fulfillment queue"
                            ? fulfillmentRequests.map((request) => ({
                                key: `support-request-${request.id}`,
                                title: `${request.category_name} request ${request.id}`,
                                subtitle: request.requester_name,
                                meta: normalizeWorkflowLabel(request.currentStageLabel),
                              }))
                            : supportReturnFocusRows
                    ),
                    "No records match this workload focus.",
                  )
                : null}
              {activeSupportAssignmentLabel
                ? renderFocusPanel(
                    `Assignments: ${activeSupportAssignmentLabel}`,
                    assignments
                      .filter((assignment) => formatLabelText(assignment.status) === activeSupportAssignmentLabel)
                      .map((assignment) => ({
                        key: `support-assignment-${assignment.id}`,
                        title: assignment.asset_tag,
                        subtitle: `${assignment.employee_name} / ${assignment.equipment_name}`,
                        meta: assignment.category_name || "No category",
                      })),
                    "No assignments match this chart focus.",
                  )
                : null}
            </section>
          ) : null}
          <section className="dashboard-bottom-row">
            {renderReplacementAdvisoryPanel(
              "Replacement Queue Guidance",
              "These recommendations focus on maintenance status and repeated repairs so IT support can act earlier.",
              replacementInsights.filter((item) => item.recommendation !== "Keep in service"),
            )}
          </section>
          <section className="dashboard-panel">
            <div className="panel-header">
              <div>
                <h3>Assigned Items</h3>
                <p className="dashboard-subtitle">Review employee assignments with device details, specification, QR access, and replacement signals in one table.</p>
              </div>
              <span>{assignments.filter((assignment) => assignment.status === "active").length} active</span>
            </div>
            {assignments.filter((assignment) => assignment.status === "active").length > 0 ? (
              <div className="user-table workflow-assignment-table">
                <div className="user-table-head workflow-assignment-table-head">
                  <span>Employee</span>
                  <span>Device</span>
                  <span>Category</span>
                  <span>Model</span>
                  <span>Serial</span>
                  <span>Status</span>
                  <span>Assigned</span>
                  <span>Warranty</span>
                  <span>ML Prediction</span>
                </div>
                {assignments
                  .filter((assignment) => assignment.status === "active")
                  .map((assignment) => (
                    <div className="user-table-row workflow-assignment-table-row" key={`assigned-device-${assignment.id}`}>
                      <span>
                        <strong>{assignment.employee_name}</strong>
                        <small>{assignment.employee_email}</small>
                      </span>
                      <span>
                        <strong>{assignment.asset_tag}</strong>
                        <small>{assignment.equipment_name}</small>
                      </span>
                      <span>{assignment.category_name || "No category"}</span>
                      <span>{assignment.model_name || assignment.vendor_name || "No model"}</span>
                      <span>{assignment.serial_number || "No serial"}</span>
                      <span>
                        <strong>{formatLabelText(assignment.status)}</strong>
                        <small>{assignment.receipt_status === "received" ? "Received" : "Pending receipt"}</small>
                      </span>
                      <span>{assignment.assigned_at ? formatProfileDate(assignment.assigned_at) : "Unknown"}</span>
                      <span>{assignment.warranty_end_date ? formatProfileDate(assignment.warranty_end_date) : assignment.device_health || "No warranty"}</span>
                      <span>
                        {assignmentMlLoading[assignment.id] ? (
                          <>
                            <strong>Loading...</strong>
                            <small>Replacement risk</small>
                          </>
                        ) : assignmentMlPredictions[assignment.id] ? (
                          <>
                            <strong>{Math.round((assignmentMlPredictions[assignment.id]?.probability || 0) * 100)}%</strong>
                            <small>{assignmentMlPredictions[assignment.id]?.recommendation || "Prediction ready"}</small>
                          </>
                        ) : (
                          <>
                            <strong>Unavailable</strong>
                            <small>Open assigned items</small>
                          </>
                        )}
                      </span>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="loading-text">No active employee assignments found for this IT support view.</p>
            )}
          </section>
        </>
      );
    }

    if (roleView === "warehouse") {
      const warehouseStockChartKey = "warehouse-stock";
      const warehouseMoveChartKey = "warehouse-move-orders";
      const activeWarehouseStockLabel = chartFocusByKey[warehouseStockChartKey] || "";
      const activeWarehouseMoveLabel = chartFocusByKey[warehouseMoveChartKey] || "";
      const availableWarehouseCount = warehouseEquipment.filter((item) => item.status === "available").length;
      const approvedTransferCount = moveOrders.filter((item) => item.status === "approved").length;
      const retiredWarehouseCount = warehouseEquipment.filter((item) => item.status === "retired" || item.status === "lost").length;
      const warehouseStockData = [
        { label: "Available", value: warehouseEquipment.filter((item) => item.status === "available").length },
        { label: "Reserved", value: warehouseEquipment.filter((item) => item.status === "reserved").length },
        { label: "Retired", value: warehouseEquipment.filter((item) => item.status === "retired").length },
        { label: "Lost", value: warehouseEquipment.filter((item) => item.status === "lost").length },
      ];
      const warehouseMoveOrderData = [
        { label: "Pending", value: warehousePendingMoveOrders.length },
        { label: "Approved", value: moveOrders.filter((item) => item.status === "approved").length },
        { label: "Partial", value: moveOrders.filter((item) => item.status === "partial").length },
        { label: "Fulfilled", value: moveOrders.filter((item) => item.status === "fulfilled").length },
        { label: "Rejected", value: moveOrders.filter((item) => item.status === "rejected").length },
      ];

      return (
        <>
          <section className="dashboard-card-grid dashboard-card-grid-storekeeper">
            <OverviewShortcutCard
              title="Pending Move Orders"
              value={warehousePendingMoveOrders.length}
              description="Warehouse approvals waiting before devices can be transferred to IT stock."
              icon={FolderInput}
              insight={`${availableWarehouseCount} devices are transfer-ready`}
              actionLabel="Review move orders"
              onClick={() => setActiveSection("move-orders")}
              kicker="Transfer queue"
            />
            <OverviewShortcutCard
              title="Warehouse Available"
              value={availableWarehouseCount}
              description="Devices currently held in warehouse stock and ready for transfer."
              icon={Warehouse}
              actionLabel="Open warehouse stock"
              onClick={() => setActiveSection("stock")}
              kicker="Ready inventory"
            />
            <OverviewShortcutCard
              title="Approved Transfers"
              value={approvedTransferCount}
              description="Move orders already released into IT stock."
              icon={CheckCheck}
              actionLabel="View history"
              onClick={() => setActiveSection("move-orders")}
              kicker="Release history"
            />
          </section>
          <section className="chart-panel-grid">
            <section className="dashboard-panel chart-panel-card">
              <div className="panel-header">
                <h3>Warehouse Stock Mix</h3>
              </div>
              <DonutChart
                data={warehouseStockData}
                emptyLabel="No warehouse stock data available."
                activeLabel={activeWarehouseStockLabel}
                onSelect={(label) => toggleChartFocus(warehouseStockChartKey, label)}
              />
            </section>
            <section className="dashboard-panel chart-panel-card">
              <div className="panel-header">
                <h3>Move Order Pipeline</h3>
              </div>
              <HorizontalBarChart
                data={warehouseMoveOrderData}
                emptyLabel="No move orders submitted yet."
                activeLabel={activeWarehouseMoveLabel}
                onSelect={(label) => toggleChartFocus(warehouseMoveChartKey, label)}
              />
            </section>
          </section>
          {activeWarehouseStockLabel || activeWarehouseMoveLabel ? (
            <section className="chart-panel-grid">
              {activeWarehouseStockLabel
                ? renderFocusPanel(
                    `Warehouse stock: ${activeWarehouseStockLabel}`,
                    warehouseEquipment
                      .filter((item) => formatLabelText(item.status) === activeWarehouseStockLabel)
                      .map((item) => ({
                        key: `warehouse-stock-${item.id}`,
                        title: item.asset_tag,
                        subtitle: `${item.equipment_name} / ${item.category_name || "No category"}`,
                        meta: item.serial_number,
                      })),
                    "No warehouse assets match this chart focus.",
                  )
                : null}
              {activeWarehouseMoveLabel
                ? renderFocusPanel(
                    `Move orders: ${activeWarehouseMoveLabel}`,
                    moveOrders
                      .filter((item) => formatLabelText(item.status) === activeWarehouseMoveLabel)
                      .map((item) => ({
                        key: `warehouse-order-${item.id}`,
                        title: item.request_number,
                        subtitle: `${item.requester_name} / ${item.destination_branch_name || "No branch"}`,
                        meta: item.reason || "No reason provided",
                      })),
                    "No move orders match this chart focus.",
                  )
                : null}
            </section>
          ) : null}
        </>
      );
    }

    const employeeStatusChartKey = "employee-requests";
    const employeeAssetChartKey = "employee-assets";
    const activeEmployeeStatusLabel = chartFocusByKey[employeeStatusChartKey] || "";
    const activeEmployeeAssetLabel = chartFocusByKey[employeeAssetChartKey] || "";
    const employeeRequestStatusData = ["pending", "approved", "rejected", "fulfilled"].map((status) => ({
      label: status,
      value: employeeRequests.filter((request) =>
        status === "pending" ? isLivePendingRequest(request) : request.request_status === status,
      ).length,
    }));
    const employeeAssetData = [
      { label: "Assigned", value: employeeAssignments.filter((assignment) => assignment.status === "active").length },
      { label: "Returns", value: employeeReturnRequests.filter((item) => ["requested", "it_review", "store_intake", "awaiting_final_approval"].includes(item.return_status)).length },
      { label: "Completed requests", value: employeeRequests.filter((request) => request.request_status === "fulfilled").length },
    ];
    return (
      <>
        <section className="dashboard-card-grid">
          <OverviewShortcutCard
            title="My Requests"
            value={employeeRequests.length}
            description="Total equipment requests you have submitted."
            icon={Send}
            className="featured-metric-card"
            insight={`${employeeAssignments.filter((assignment) => assignment.status === "active").length} devices currently assigned`}
            actionLabel="Open my requests"
            onClick={() => setActiveSection("my-requests")}
          />
          <OverviewShortcutCard
            title="Pending"
            value={employeeRequests.filter((request) => request.request_status === "pending").length}
            description="Requests still moving through approval stages."
            icon={ShieldCheck}
            actionLabel="Track timeline"
            onClick={() => setActiveSection("timeline")}
          />
          <OverviewShortcutCard
            title="Assigned"
            value={employeeAssignments.filter((assignment) => assignment.status === "active").length}
            description="Assets that are currently assigned to you."
            icon={Warehouse}
            actionLabel="Open my equipment"
            onClick={() => setActiveSection("my-equipment")}
          />
          <OverviewShortcutCard
            title="Fulfilled"
            value={employeeRequests.filter((request) => request.request_status === "fulfilled").length}
            description="Requests already completed and delivered."
            icon={PackageCheck}
            actionLabel="View completed requests"
            onClick={() => setActiveSection("my-requests")}
          />
          <OverviewShortcutCard
            title="Returns"
            value={employeeReturnRequests.filter((item) => item.return_status === "requested").length}
            description="Equipment return requests currently waiting for store intake."
            icon={RotateCcw}
            actionLabel="Open returns"
            onClick={() => setActiveSection("return-requests")}
          />
        </section>
        <section className="chart-panel-grid">
          <section className="dashboard-panel chart-panel-card">
            <div className="panel-header">
              <h3>My Request Status</h3>
            </div>
            <DonutChart
              data={employeeRequestStatusData}
              emptyLabel="No personal request records available."
              activeLabel={activeEmployeeStatusLabel}
              onSelect={(label) => toggleChartFocus(employeeStatusChartKey, label)}
            />
          </section>
          <section className="dashboard-panel chart-panel-card">
            <div className="panel-header">
              <h3>My Asset Activity</h3>
            </div>
            <HorizontalBarChart
              data={employeeAssetData}
              emptyLabel="No personal asset activity yet."
              activeLabel={activeEmployeeAssetLabel}
              onSelect={(label) => toggleChartFocus(employeeAssetChartKey, label)}
            />
          </section>
        </section>
        {activeEmployeeStatusLabel || activeEmployeeAssetLabel ? (
          <section className="chart-panel-grid">
            {activeEmployeeStatusLabel
              ? renderFocusPanel(
                  `My requests: ${activeEmployeeStatusLabel}`,
                  employeeRequests
                    .filter((request) =>
                      activeEmployeeStatusLabel === "pending"
                        ? isLivePendingRequest(request)
                        : request.request_status === activeEmployeeStatusLabel,
                    )
                    .map((request) => ({
                      key: `employee-request-${request.id}`,
                      title: `${request.category_name} request ${request.id}`,
                      subtitle: normalizeWorkflowLabel(request.currentStageLabel),
                      meta: formatProfileDate(request.requested_at || request.created_at),
                    })),
                  "No personal requests match this chart focus.",
                )
              : null}
            {activeEmployeeAssetLabel
              ? renderFocusPanel(
                  `My asset activity: ${activeEmployeeAssetLabel}`,
                  (
                    activeEmployeeAssetLabel === "Assigned"
                      ? employeeAssignments.filter((assignment) => assignment.status === "active").map((assignment) => ({
                          key: `employee-assignment-${assignment.id}`,
                          title: assignment.asset_tag,
                          subtitle: assignment.equipment_name,
                          meta: assignment.serial_number,
                        }))
                      : activeEmployeeAssetLabel === "Returns"
                        ? employeeReturnRequests.map((item) => ({
                            key: `employee-return-${item.id}`,
                            title: item.asset_tag,
                            subtitle: formatLabelText(item.return_status),
                            meta: item.equipment_name,
                          }))
                        : employeeRequests.filter((request) => request.request_status === "fulfilled").map((request) => ({
                            key: `employee-complete-${request.id}`,
                            title: `${request.category_name} request ${request.id}`,
                            subtitle: "Delivered",
                            meta: formatProfileDate(request.requested_at || request.created_at),
                          }))
                  ),
                  "No personal activity matches this chart focus.",
                )
              : null}
          </section>
        ) : null}
      </>
    );
  };

  const renderActionSection = () => {
    if (roleView === "branch-manager") {
      return (
        <section className="dashboard-panel">
          <div className="panel-header">
            <h3>Branch Manager Approvals</h3>
          </div>
          {renderRequestCards(branchApprovals, "approve")}
        </section>
      );
    }

    if (roleView === "warehouse") {
      if (activeSection === "move-orders") {
        return (
          <section className="dashboard-panel">
            <div className="panel-header">
              <div>
                <h3>Warehouse Move Orders</h3>
                <p className="dashboard-subtitle">Review every transfer request with its destination, bundle contents, and decision trail before releasing stock to IT.</p>
              </div>
            </div>
            {renderMoveOrderTable(filteredMoveOrders, "warehouse")}
          </section>
        );
      }

      const availableWarehouseItems = warehouseEquipment.filter((item) => item.status === "available");
      const retiredWarehouseItems = warehouseEquipment.filter((item) => item.status === "retired" || item.status === "lost");
      const filteredAvailableWarehouseItems = availableWarehouseItems.filter((item) => {
        const itemDate = item.purchase_date || "";
        return isWithinDateWindow(itemDate, warehouseStockDateWindow) && isSameSelectedDate(itemDate, warehouseStockSpecificDate);
      });
      const filteredRetiredWarehouseItems = retiredWarehouseItems.filter((item) => {
        const itemDate = item.purchase_date || "";
        return isWithinDateWindow(itemDate, warehouseStockDateWindow) && isSameSelectedDate(itemDate, warehouseStockSpecificDate);
      });

      return (
        <>

          <section className="inventory-focus-grid">
            <article className="inventory-focus-card warehouse-focus-card">
              <div className="panel-header">
                <h3>
                  <Warehouse size={18} strokeWidth={2.2} />
                  Stock posture
                </h3>
              </div>
              <p className="dashboard-subtitle">Keep receiving clean, shelf locations accurate, and transfer-ready assets visible to IT.</p>
              <div className="warehouse-focus-metrics">
                <article>
                  <small>Available now</small>
                  <strong>{availableWarehouseItems.length}</strong>
                </article>
                <article>
                  <small>Needs review</small>
                  <strong>{warehousePendingMoveOrders.length}</strong>
                </article>
              </div>
            </article>
            <article className="inventory-focus-card warehouse-focus-card">
              <div className="panel-header">
                <h3>
                  <CheckCheck size={18} strokeWidth={2.2} />
                  Transfer governance
                </h3>
              </div>
              <p className="dashboard-subtitle">Approve only the right bundles, capture decision notes, and keep the release trail easy to audit.</p>
              <div className="warehouse-focus-metrics">
                <article>
                  <small>Approved</small>
                  <strong>{moveOrders.filter((item) => item.status === "approved").length}</strong>
                </article>
                <article>
                  <small>Retired stock</small>
                  <strong>{retiredWarehouseItems.length}</strong>
                </article>
              </div>
            </article>
          </section>
          <section className="dashboard-panel">
            <div className="panel-header">
              <div>
                <h3>Warehouse Stock Control</h3>
                <p className="dashboard-subtitle">Register assets into receiving stock, maintain accurate shelf visibility, and prepare approved devices for IT release.</p>
              </div>
              <div className="panel-header-actions">
                {isStockFormOpen ? (
                  <button className="secondary-btn compact-btn" type="button" onClick={resetStockForm}>
                    Close stock form
                  </button>
                ) : (
                  <button className="primary-btn compact-btn" type="button" onClick={() => setIsStockFormOpen(true)}>
                    Register warehouse asset
                  </button>
                )}
              </div>
            </div>
            {isStockFormOpen ? (
              <div className="hr-modal-overlay" role="dialog" aria-modal="true" onClick={resetStockForm}>
                <div className="hr-modal-card" onClick={(event) => event.stopPropagation()}>
                  <div className="panel-header" style={{ marginBottom: "1rem" }}>
                    <div>
                      <h3>{editingEquipmentId ? "Edit warehouse asset" : "Register warehouse asset"}</h3>
                      <p className="dashboard-subtitle">Register assets into receiving stock, maintain accurate shelf visibility, and prepare approved devices for IT release.</p>
                    </div>
                    <div className="panel-header-actions">
                      <button className="secondary-btn compact-btn" type="button" onClick={resetStockForm}>
                        Close
                      </button>
                    </div>
                  </div>
                  <form className="simple-form stock-crud-form" onSubmit={handleSubmitEquipment}>
                    <label className="field">
                      <span>Company code</span>
                      <input
                        value={stockForm.assetTag}
                        onChange={(event) => setStockForm((current) => ({ ...current, assetTag: event.target.value }))}
                        placeholder={editingEquipmentId ? "Enter company code" : "Choose category to auto-generate tag"}
                        readOnly={!editingEquipmentId}
                        required
                      />
                    </label>
                    <label className="field">
                      <span>Serial number</span>
                      <input
                        value={stockForm.serialNumber}
                        onChange={(event) => setStockForm((current) => ({ ...current, serialNumber: event.target.value }))}
                        required
                      />
                    </label>
                    <label className="field">
                      <span>Computer name / Hostname</span>
                      <input
                        value={stockForm.computerName}
                        onChange={(event) => setStockForm((current) => ({ ...current, computerName: event.target.value }))}
                        placeholder="Example: KGL-LT-0142 or DESKTOP-0142"
                      />
                    </label>
                    <label className="field">
                      <span>Category</span>
                      <select
                        value={stockForm.categoryId}
                        onChange={(event) => {
                          const nextCategory = categories.find((category) => String(category.id) === event.target.value);
                          const isStorageDeviceCategory = nextCategory
                            ? storageDeviceCategoryNames.has(nextCategory.name.toLowerCase())
                            : false;
                          const nextAccessoryProfile = getAccessoryProfileForCategory(nextCategory?.name);
                          const nextAccessories = nextAccessoryProfile?.required ?? [];
                          setCustomStockAccessory("");

                          setStockForm((current) => ({
                            ...current,
                            categoryId: event.target.value,
                            equipmentName: nextCategory?.name || "",
                            assetTag: !editingEquipmentId ? buildAssetTagFromCategory(nextCategory?.name) : current.assetTag,
                            ram: isStorageDeviceCategory ? current.ram : "",
                            cpu: isStorageDeviceCategory ? current.cpu : "",
                            storageCapacity: isStorageDeviceCategory ? current.storageCapacity : "",
                            storageType: isStorageDeviceCategory ? current.storageType : "SSD",
                            osVersion: isStorageDeviceCategory ? current.osVersion : "",
                            includedAccessories: nextAccessories,
                            accessoryNotes: nextAccessoryProfile ? current.accessoryNotes : "",
                          }));
                        }}
                        required
                      >
                        <option value="">Select category</option>
                        {categories.map((category) => (
                          <option key={category.id} value={category.id}>{category.name}</option>
                        ))}
                      </select>
                    </label>
                    {!editingEquipmentId ? (
                      <div className="field field-span-2 inline-create-panel">
                        <span>Category not listed?</span>
                        <div className="inline-create-grid">
                          <input
                            value={newStockCategoryName}
                            onChange={(event) => setNewStockCategoryName(event.target.value)}
                            placeholder="New category name, e.g. Projector"
                          />
                          <button className="secondary-btn compact-btn" type="button" onClick={() => void handleCreateStockCategory()}>
                            Add category
                          </button>
                        </div>
                      </div>
                    ) : null}
                    <label className="field">
                      <span>Vendor</span>
                      <input
                        value={stockForm.vendorName}
                        onChange={(event) => setStockForm((current) => ({ ...current, vendorName: event.target.value }))}
                        placeholder="Example: Dell"
                      />
                    </label>
                    <label className="field">
                      <span>Model</span>
                      <input
                        value={stockForm.modelName}
                        onChange={(event) => setStockForm((current) => ({ ...current, modelName: event.target.value }))}
                        placeholder="Example: Latitude 5440"
                      />
                    </label>
                    {isStorageDeviceStockForm ? (
                      <>
                        <label className="field">
                          <span>CPU</span>
                          <input
                            value={stockForm.cpu}
                            onChange={(event) => setStockForm((current) => ({ ...current, cpu: event.target.value }))}
                            placeholder="Example: Intel Core i5"
                          />
                        </label>
                        <label className="field">
                          <span>RAM</span>
                          <input
                            value={stockForm.ram}
                            onChange={(event) => setStockForm((current) => ({ ...current, ram: event.target.value }))}
                            placeholder={selectedStockCategory?.name.toLowerCase() === "smartphone" ? "Example: 8GB" : "Example: 16GB DDR4"}
                            required
                          />
                        </label>
                        <label className="field">
                          <span>Storage capacity</span>
                          <input
                            value={stockForm.storageCapacity}
                            onChange={(event) => setStockForm((current) => ({ ...current, storageCapacity: event.target.value }))}
                            placeholder={selectedStockCategory?.name.toLowerCase() === "smartphone" ? "Example: 128GB" : "Example: 512GB"}
                            required
                          />
                        </label>
                        <label className="field">
                          <span>HDD/SSD</span>
                          <select
                            value={stockForm.storageType}
                            onChange={(event) => setStockForm((current) => ({ ...current, storageType: event.target.value }))}
                          >
                            <option value="SSD">SSD</option>
                            <option value="HDD">HDD</option>
                            <option value="eMMC">eMMC</option>
                            <option value="Flash">Flash</option>
                          </select>
                        </label>
                        <label className="field">
                          <span>OS version</span>
                          <input
                            value={stockForm.osVersion}
                            onChange={(event) => setStockForm((current) => ({ ...current, osVersion: event.target.value }))}
                            placeholder="Example: Windows 11 Pro 23H2"
                          />
                        </label>
                      </>
                    ) : null}
                    {hasAccessoryChecklist ? (
                      <div className="field field-span-2">
                        <span>Device bundle accessories</span>
                        {requiredStockAccessories.length > 0 ? (
                          <>
                            <small className="field-hint">Required handover items</small>
                            <div className="accessory-checklist">
                              {requiredStockAccessories.map((accessory) => {
                                const isChecked = stockForm.includedAccessories.includes(accessory);
                                return (
                                  <label className="checkbox-field" key={accessory}>
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={(event) => toggleStockAccessory(accessory, event.target.checked)}
                                    />
                                    <span>{accessory}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </>
                        ) : null}
                        {optionalStockAccessories.length > 0 ? (
                          <>
                            <small className="field-hint">Optional or extra accessories</small>
                            <div className="accessory-checklist">
                              {optionalStockAccessories.map((accessory) => {
                                const isChecked = stockForm.includedAccessories.includes(accessory);
                                return (
                                  <label className="checkbox-field" key={accessory}>
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={(event) => toggleStockAccessory(accessory, event.target.checked)}
                                    />
                                    <span>{accessory}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </>
                        ) : null}
                        <small className="field-hint">
                          {selectedAccessoryProfile?.guidance || "Capture the full handover kit and add any extra accessories issued with this asset."}
                        </small>
                      </div>
                    ) : null}
                    <label className="field field-span-2">
                      <span>Add custom accessory</span>
                      <div className="inline-create-grid">
                        <input
                          value={customStockAccessory}
                          onChange={(event) => setCustomStockAccessory(event.target.value)}
                          placeholder="Example: Docking station, projector clicker, privacy filter"
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              handleAddCustomStockAccessory();
                            }
                          }}
                        />
                        <button className="secondary-btn compact-btn" type="button" onClick={handleAddCustomStockAccessory}>
                          Add accessory
                        </button>
                      </div>
                      <small className="field-hint">
                        Use this for items outside the standard kit. Added items will appear in the checklist above.
                      </small>
                    </label>
                    <label className="field field-span-2">
                      <span>Accessory notes</span>
                      <textarea
                        value={stockForm.accessoryNotes}
                        onChange={(event) => setStockForm((current) => ({ ...current, accessoryNotes: event.target.value }))}
                        rows={2}
                        placeholder="Optional: charger size, monitor type, mouse model, or other issued items"
                      />
                    </label>
                    <label className="field">
                      <span>Status</span>
                      <select
                        value={stockForm.status}
                        onChange={(event) => setStockForm((current) => ({ ...current, status: event.target.value }))}
                      >
                        <option value="available">Available</option>
                        <option value="assigned">Assigned</option>
                        <option value="maintenance">Maintenance</option>
                        <option value="retired">Retired</option>
                        <option value="lost">Lost</option>
                      </select>
                      <small className="field-hint">
                        Items marked as available will appear in the warehouse available stock list after registration.
                      </small>
                    </label>
                    <label className="field">
                      <span>Device health</span>
                      <select
                        value={stockForm.deviceHealth}
                        onChange={(event) => setStockForm((current) => ({ ...current, deviceHealth: event.target.value }))}
                      >
                        <option value="Healthy">Healthy</option>
                        <option value="Needs attention">Needs attention</option>
                        <option value="Damaged">Damaged</option>
                        <option value="Faulty">Faulty</option>
                        <option value="Refurbished">Refurbished</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>Purchase year</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={4}
                        value={stockForm.purchaseYear}
                        onChange={(event) => setStockForm((current) => ({ ...current, purchaseYear: event.target.value.replace(/\D/g, "").slice(0, 4) }))}
                        placeholder="Example: 2026"
                      />
                    </label>
                    <label className="field">
                      <span>Purchase cost</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={stockForm.purchaseCost}
                        onChange={(event) => setStockForm((current) => ({ ...current, purchaseCost: event.target.value }))}
                      />
                    </label>
                    <label className="field">
                      <span>Purchase date</span>
                      <input
                        type="date"
                        value={stockForm.purchaseDate}
                        onChange={(event) => setStockForm((current) => ({ ...current, purchaseDate: event.target.value }))}
                      />
                    </label>
                    <label className="field">
                      <span>Location</span>
                      <input
                        value={stockForm.locationDetails}
                        onChange={(event) => setStockForm((current) => ({ ...current, locationDetails: event.target.value }))}
                        placeholder="Example: Warehouse A, Rack 12, Shelf B"
                      />
                    </label>
                    <label className="field">
                      <span>Warranty end</span>
                      <input
                        type="date"
                        value={stockForm.warrantyEndDate}
                        onChange={(event) => setStockForm((current) => ({ ...current, warrantyEndDate: event.target.value }))}
                      />
                    </label>
                    <label className="field">
                      <span>Lifespan in Airtel</span>
                      <input
                        type="number"
                        min="1"
                        value={stockForm.lifespanYears}
                        onChange={(event) => setStockForm((current) => ({ ...current, lifespanYears: event.target.value }))}
                        required
                      />
                    </label>
                    <article className="mini-list-card stock-lifespan-summary">
                      <strong>Expected lifespan</strong>
                      <span>{stockForm.lifespanYears || "4"} years in Airtel</span>
                      <span>
                        Replacement target: {getReplacementDate(stockForm.purchaseDate || null, Number(stockForm.lifespanYears || 4), Number(stockForm.purchaseYear || 0) || null)}
                      </span>
                    </article>
                    <div className="stock-form-footer field-span-2">
                      <div className="card-action-row">
                        <button className="primary-btn compact-btn" type="submit">
                          {editingEquipmentId ? "Update warehouse asset" : "Register warehouse asset"}
                        </button>
                        <button className="secondary-btn compact-btn" type="button" onClick={resetStockForm}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  </form>
                </div>
              </div>
            ) : null}
            <div className="warehouse-stock-filter-row">
              <div className="table-action-group workflow-stock-table-actions">
                {(["all", "weekly", "monthly"] as DateWindowFilter[]).map((windowKey) => (
                  <button
                    key={windowKey}
                    className={`table-action${warehouseStockDateWindow === windowKey ? " primary-btn" : ""}`}
                    type="button"
                    onClick={() => setWarehouseStockDateWindow(windowKey)}
                  >
                    {windowKey === "all" ? "All" : windowKey === "weekly" ? "Weekly" : "Monthly"}
                  </button>
                ))}
              </div>
              <input
                className="table-search-input report-date-input"
                type="date"
                value={warehouseStockSpecificDate}
                onChange={(event) => setWarehouseStockSpecificDate(event.target.value)}
                placeholder="Search by specific date"
              />
            </div>
            <div className="subpanel-header">
              <h4>Available warehouse stock</h4>
              <span>{filteredAvailableWarehouseItems.length} available</span>
            </div>
            <div className="user-table workflow-stock-table">
              <div className="user-table-head workflow-stock-table-head">
                <span>Asset</span>
                <span>Status / Category</span>
                <span>Location</span>
                <span>Serial / Hostname</span>
                <span>Specs</span>
                <span>Actions</span>
              </div>
              {filteredAvailableWarehouseItems.length > 0 ? (
                filteredAvailableWarehouseItems.map((item) => (
                  <div className="user-table-row workflow-stock-table-row" key={`warehouse-stock-${item.id}`}>
                    <div className="user-primary-cell">
                      <strong>{item.asset_tag}</strong>
                      <span>{item.equipment_name}</span>
                    </div>
                    <div className="user-secondary-cell">
                      <strong>{item.category_name || "No category"}</strong>
                      <span>
                        <span className={`status-pill status-${item.status}`}>{item.status}</span>
                      </span>
                    </div>
                    <div className="user-secondary-cell">
                      <strong>{getEquipmentLocationLabel(item)}</strong>
                      <span>{getEquipmentLocationDetail(item)}</span>
                    </div>
                    <div className="user-secondary-cell">
                      <strong>{item.serial_number || "No serial"}</strong>
                      <span>{item.computer_name || "No hostname"}</span>
                    </div>
                    <div className="user-secondary-cell">
                      <strong>{formatEquipmentSpecs(item) || "No specs"}</strong>
                      <span>{item.vendor_name || item.model_name || ""}</span>
                    </div>
                    <div className="table-action-group workflow-stock-table-actions">
                      <button className="table-action" type="button" onClick={() => handleEditEquipment(item)}>
                        Edit
                      </button>
                      <button className="table-action" type="button" onClick={() => void openDetailPanel("equipment", item.id)}>
                        Details
                      </button>
                    </div>
                  </div>
                ))
              ) : availableWarehouseItems.length > 0 ? (
                <p className="loading-text">No available warehouse stock matches the selected date filter.</p>
              ) : (
                <p className="loading-text">No warehouse stock is ready yet.</p>
              )}
            </div>
            {retiredWarehouseItems.length > 0 ? (
              <>
                <div className="subpanel-header">
                  <h4>Retired or disposed warehouse stock</h4>
                  <span>{filteredRetiredWarehouseItems.length} items</span>
                </div>
                <div className="user-table workflow-stock-table">
                  <div className="user-table-head workflow-stock-table-head">
                    <span>Asset</span>
                    <span>Status / Category</span>
                    <span>Location</span>
                    <span>Serial / Hostname</span>
                    <span>Specs</span>
                    <span>Actions</span>
                  </div>
                  {filteredRetiredWarehouseItems.length > 0 ? (
                    filteredRetiredWarehouseItems.map((item) => (
                      <div className="user-table-row workflow-stock-table-row" key={`warehouse-retired-${item.id}`}>
                        <div className="user-primary-cell">
                          <strong>{item.asset_tag}</strong>
                          <span>{item.equipment_name}</span>
                        </div>
                        <div className="user-secondary-cell">
                          <strong>{item.category_name || "No category"}</strong>
                          <span>
                            <span className={`status-pill status-${item.status}`}>{item.status}</span>
                          </span>
                        </div>
                        <div className="user-secondary-cell">
                          <strong>{getEquipmentLocationLabel(item)}</strong>
                          <span>{getEquipmentLocationDetail(item)}</span>
                        </div>
                        <div className="user-secondary-cell">
                          <strong>{item.serial_number || "Not set"}</strong>
                          <span>{item.computer_name || "No hostname"}</span>
                        </div>
                        <div className="user-secondary-cell">
                          <strong>{formatEquipmentSpecs(item) || "No specs"}</strong>
                          <span>{item.vendor_name || item.model_name || ""}</span>
                        </div>
                        <div className="table-action-group workflow-stock-table-actions">
                          <button className="table-action" type="button" onClick={() => void openDetailPanel("equipment", item.id)}>
                            Details
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="loading-text">No retired warehouse stock matches the selected date filter.</p>
                  )}
                </div>
              </>
            ) : null}
          </section>
        </>
      );
    }

    if (roleView === "hr") {
      if (activeSection === "new-request") {
        return (
          <section className="dashboard-panel">
            <div className="panel-header">
              <h3>{editingRequestId ? "Update HR Equipment Request" : "Create HR Equipment Request"}</h3>
            </div>
            <form className="simple-form" onSubmit={handleCreateRequest}>
              <label className="field">
                <span>Request date</span>
                <input
                  type="date"
                  value={requestForm.requestDate}
                  min={todayDateValue}
                  max={todayDateValue}
                  onChange={(event) => setRequestForm((current) => ({ ...current, requestDate: event.target.value }))}
                  disabled={Boolean(editingRequestId)}
                  required
                />
              </label>
              <label className="field">
                <span>Employee ID / HRMS ID</span>
                <input
                  value={hrEmployeeIdSearch}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setHrEmployeeIdSearch(nextValue);
                    setRequestForm((current) => ({
                      ...current,
                      hrmsEmployeeRecordId: "",
                      targetEmployeeUserId: "",
                    }));
                  }}
                  placeholder="Search by EMP-xxxxx or HRMS-xxxxx"
                  required
                />
              </label>
              <label className="field">
                <span>Matched HRMS employee</span>
                <select
                  value={requestForm.hrmsEmployeeRecordId}
                  onChange={(event) => {
                    const selectedEmployee = filteredHrEmployeesForRequest.find((employee) => String(employee.id) === event.target.value);
                    setRequestForm((current) => ({
                      ...current,
                      hrmsEmployeeRecordId: event.target.value,
                      targetEmployeeUserId: selectedEmployee?.linked_user_id ? String(selectedEmployee.linked_user_id) : "",
                    }));
                  }}
                  disabled={!normalizedHrEmployeeIdSearch}
                  required
                >
                  <option value="">
                    {normalizedHrEmployeeIdSearch ? "Select matched employee" : "Search Employee ID first"}
                  </option>
                  {filteredHrEmployeesForRequest.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {(employee.hrms_employee_id || employee.employee_code || "NO-ID")} / {employee.full_name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Request type</span>
                <select
                  value={requestForm.requestType}
                  onChange={(event) =>
                    setRequestForm((current) => ({
                      ...current,
                      requestType: event.target.value as RequestFormState["requestType"],
                    }))
                  }
                >
                  <option value="new_hire">New hire</option>
                  <option value="standard">Standard</option>
                  <option value="replacement">Replacement</option>
                </select>
              </label>
              <p className="dashboard-subtitle">
                HR only selects the employee and equipment category here. IT Support will review the employee's HRMS profile and predict the right device specification.
              </p>
              <label className="field">
                <span>Equipment category</span>
                <select
                  value={requestForm.categoryId}
                  onChange={(event) => setRequestForm((current) => ({ ...current, categoryId: event.target.value }))}
                  required
                >
                  <option value="">Select category</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>HR note</span>
                <textarea
                  value={requestForm.notes}
                  onChange={(event) => setRequestForm((current) => ({ ...current, notes: event.target.value }))}
                  placeholder="Describe the onboarding need, role context, branch, and any business justification"
                />
              </label>
              <button className="primary-btn form-submit-btn" type="submit">
                {editingRequestId ? "Save request" : "Submit request"}
              </button>
              {editingRequestId ? (
                <button
                  className="secondary-btn form-submit-btn"
                  type="button"
                  onClick={() => {
                    setEditingRequestId(null);
                    setRequestForm({
                      categoryId: "",
                      requestType: "new_hire",
                      hrmsEmployeeRecordId: "",
                      targetEmployeeUserId: "",
                      expectedDeviceSpecs: "",
                      notes: "",
                      requestDate: todayDateValue,
                      sourceEquipmentId: "",
                      reportType: "loss",
                      incidentScope: "during_work",
                    });
                    setHrEmployeeIdSearch("");
                  }}
                >
                  Cancel edit
                </button>
              ) : null}
            </form>
          </section>
        );
      }

      if (activeSection === "approvals") {
        return (
          <section className="dashboard-panel">
            <div className="panel-header">
              <h3>HR Approvals</h3>
            </div>
            {renderRequestCards(hrApprovals, "approve")}
          </section>
        );
      }

      return (
        <section className="dashboard-panel">
          <div className="panel-header">
            <h3>HR Submitted Requests</h3>
          </div>
          {renderRequestCards(requests.filter((request) => request.requester_id === user.id), "view")}
        </section>
      );
    }

    if (roleView === "it-manager") {
      return (
        <section className="dashboard-panel">
          <div className="panel-header">
            <h3>IT Approvals</h3>
          </div>
          {renderRequestCards(itApprovals, "approve")}
        </section>
      );
    }

    if (roleView === "it-support") {
      if (activeSection === "move-orders") {
        return (
          <section className="dashboard-panel">
            <div className="panel-header">
              <div>
                <h3>Warehouse Device Requests</h3>
                <p className="dashboard-subtitle">Request one or many devices from warehouse at once. Approved devices appear in IT stock only after receipt is confirmed.</p>
              </div>
            </div>
            <div className="simple-form">
              <p className="dashboard-subtitle">
                Request equipment by category and quantity. Warehouse managers will approve based on available stock, and the IT support team will not see the actual warehouse inventory.
              </p>
              <p className="dashboard-subtitle">
                IT support submits needs-based device requests only; warehouse availability determines whether the order is approved, partially approved, or rejected.
              </p>
              <div className="workflow-step-list">
                <div className="workflow-step-row">
                  <strong>Requested items</strong>
                  <span>{moveOrderItems.length > 0 ? `${moveOrderItems.reduce((sum, item) => sum + item.quantity, 0)} item(s)` : "No items added yet"}</span>
                </div>
              </div>
              {moveOrderItems.length > 0 ? (
                <div className="mini-list stock-grid">
                  {moveOrderItems.map((item) => {
                    const category = categories.find((category) => String(category.id) === item.categoryId);
                    return (
                      <article className="mini-list-card stock-card action-card" key={`move-order-item-${item.categoryId}`}>
                        <div>
                          <strong>{category?.name || "Unknown category"}</strong>
                          <span>{item.quantity} requested</span>
                        </div>
                        <button
                          className="secondary-btn compact-btn btn-soft-danger"
                          type="button"
                          onClick={() => handleRemoveMoveOrderItem(item.categoryId)}
                        >
                          Remove
                        </button>
                      </article>
                    );
                  })}
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-3">
                <label className="field">
                  <span>Equipment category</span>
                  <select
                    value={moveOrderItemCategoryId}
                    onChange={(event) => setMoveOrderItemCategoryId(event.target.value)}
                  >
                    <option value="">Select category</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Quantity</span>
                  <input
                    type="number"
                    min="1"
                    value={moveOrderItemQuantity}
                    onChange={(event) => setMoveOrderItemQuantity(event.target.value)}
                  />
                </label>
              </div>
              <div className="card-action-row">
                <button className="secondary-btn compact-btn" type="button" onClick={() => handleAddMoveOrderItem()}>
                  Add request item
                </button>
              </div>
              <label className="field">
                <span>Reason</span>
                <input value={moveOrderReason} onChange={(event) => setMoveOrderReason(event.target.value)} placeholder="Example: onboarding kit for new hires" />
              </label>
              <label className="field field-span-2">
                <span>Move order note</span>
                <textarea value={moveOrderNote} onChange={(event) => setMoveOrderNote(event.target.value)} placeholder="Optional note for warehouse regarding branch need, timeline, or bundle purpose" />
              </label>
              <div className="card-action-row">
                <button className="primary-btn compact-btn" type="button" onClick={() => void handleCreateMoveOrder()}>
                  Submit move order
                </button>
              </div>
            </div>
            {renderMoveOrderTable(filteredMoveOrders, "it-support")}
          </section>
        );
      }

      return (
        <section className="dashboard-panel">
          <div className="panel-header">
            <h3>{activeSection === "approvals" ? "IT Support Approvals" : "Store Fulfillment"}</h3>
          </div>
          {activeSection === "approvals"
            ? renderRequestCards(itSupportApprovals, "approve")
            : renderRequestCards(fulfillmentRequests, "fulfill")}
        </section>
      );
    }

    return (
      <section className="dashboard-panel">
        <div className="panel-header">
          <h3>{editingRequestId ? "Update Equipment Request" : "New Equipment Request"}</h3>
        </div>
        {(() => {
          const selectedSourceAssignment = employeeActiveAssignmentOptions.find(
            (item) => item.assignment.equipment_id === Number(requestForm.sourceEquipmentId),
          );
          const sourceEquipment = selectedSourceAssignment?.equipment || null;
          const isReplacementFlow = requestForm.requestType === "replacement";
          const isLossTheftFlow = requestForm.requestType === "loss_theft";

          return (
        <form className="simple-form" onSubmit={handleCreateRequest}>
          <label className="field">
            <span>Request date</span>
            <input
              type="date"
              value={requestForm.requestDate}
              min={todayDateValue}
              max={todayDateValue}
              onChange={(event) => setRequestForm((current) => ({ ...current, requestDate: event.target.value }))}
              disabled={Boolean(editingRequestId)}
              required
            />
          </label>
          <label className="field">
            <span>Request type</span>
            <select
              value={requestForm.requestType}
              onChange={(event) =>
                setRequestForm((current) => ({
                  ...current,
                  requestType: event.target.value as RequestFormState["requestType"],
                }))
              }
            >
              <option value="standard">Standard</option>
              <option value="replacement">Replacement</option>
              <option value="loss_theft">Loss or theft</option>
            </select>
          </label>
          {isReplacementFlow || isLossTheftFlow ? (
            <label className="field">
              <span>Current device</span>
              <select
                value={requestForm.sourceEquipmentId}
                onChange={(event) =>
                  setRequestForm((current) => {
                    const selectedAssignment = employeeActiveAssignmentOptions.find(
                      (item) => item.assignment.equipment_id === Number(event.target.value),
                    );

                    return {
                      ...current,
                      sourceEquipmentId: event.target.value,
                      categoryId: selectedAssignment ? String(selectedAssignment.equipment.category_id) : current.categoryId,
                    };
                  })
                }
                required
              >
                <option value="">Select your current assigned device</option>
                {employeeActiveAssignmentOptions.map(({ assignment, equipment }) => (
                  <option key={assignment.id} value={assignment.equipment_id}>
                    {assignment.asset_tag} / {assignment.equipment_name} / {formatEquipmentSpecs(equipment) || "No specs"}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {sourceEquipment ? (
            <div className="workflow-step-list">
              <div className="workflow-step-row">
                <strong>Current device</strong>
                <span>{sourceEquipment.asset_tag} / {sourceEquipment.equipment_name}</span>
              </div>
              {formatEquipmentSpecs(sourceEquipment) ? (
                <div className="workflow-step-row">
                  <strong>Specs</strong>
                  <span>{formatEquipmentSpecs(sourceEquipment)}</span>
                </div>
              ) : null}
            </div>
          ) : null}
          {isLossTheftFlow ? (
            <>
              <label className="field">
                <span>Incident type</span>
                <select
                  value={requestForm.reportType}
                  onChange={(event) =>
                    setRequestForm((current) => ({
                      ...current,
                      reportType: event.target.value as "loss" | "theft",
                    }))
                  }
                >
                  <option value="loss">Loss</option>
                  <option value="theft">Theft</option>
                </select>
              </label>
              <label className="field">
                <span>Incident scope</span>
                <select
                  value={requestForm.incidentScope}
                  onChange={(event) =>
                    setRequestForm((current) => ({
                      ...current,
                      incidentScope: event.target.value as "during_work" | "outside_work",
                    }))
                  }
                >
                  <option value="during_work">During work</option>
                  <option value="outside_work">Outside work</option>
                </select>
              </label>
              <p className="dashboard-subtitle">
                Theft during work will be handled as a work incident. Theft outside work should follow company terms and conditions.
              </p>
            </>
          ) : null}
          <label className="field">
            <span>Equipment category</span>
            <select
              value={requestForm.categoryId}
              onChange={(event) => setRequestForm((current) => ({ ...current, categoryId: event.target.value }))}
              disabled={isReplacementFlow || isLossTheftFlow}
              required
            >
              <option value="">Select category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>
              {isReplacementFlow
                ? "Reason for replacement"
                : isLossTheftFlow
                  ? "Incident details"
                  : "Business note"}
            </span>
            <textarea
              value={requestForm.notes}
              onChange={(event) => setRequestForm((current) => ({ ...current, notes: event.target.value }))}
              placeholder={
                isReplacementFlow
                  ? "Explain why the current device should be replaced, for example damaged screen, battery issue, or motherboard fault"
                  : isLossTheftFlow
                    ? "Explain what happened, where it happened, and any supporting details"
                    : "Explain why you need this equipment"
              }
              required={isReplacementFlow || isLossTheftFlow}
            />
          </label>
          <button className="primary-btn form-submit-btn" type="submit">
            {editingRequestId ? "Save request" : "Submit request"}
          </button>
          {editingRequestId ? (
            <button
              className="secondary-btn form-submit-btn"
              type="button"
              onClick={() => {
                setEditingRequestId(null);
                setRequestForm({
                  categoryId: "",
                  requestType: "standard",
                  hrmsEmployeeRecordId: "",
                  targetEmployeeUserId: "",
                  expectedDeviceSpecs: "",
                  notes: "",
                  requestDate: todayDateValue,
                  sourceEquipmentId: "",
                  reportType: "loss",
                  incidentScope: "during_work",
                });
              }}
            >
              Cancel edit
            </button>
          ) : null}
        </form>
          );
        })()}
      </section>
    );
  };

  const renderEmployeeEquipmentDirectory = (employeeRows: EmployeeRow[], title: string, emptyText: string) => (
    <section className="dashboard-panel">
      <div className="panel-header">
        <h3>{title}</h3>
        <span>{employeeRows.length} employee{employeeRows.length === 1 ? "" : "s"}</span>
      </div>
      <p className="dashboard-subtitle">
        Review who has equipment, who has none, receipt status, expected return dates, and return/maintenance activity.
      </p>
      <div className="mini-list stock-grid">
        {employeeRows.length > 0 ? (
          employeeRows.map((employee) => {
            const employeeUserId = getEmployeeLinkedUserId(employee);
            const employeeEquipment = employeeUserId ? getAssignmentsForEmployee(employeeUserId) : [];
            const activeEmployeeEquipment = employeeEquipment.filter((assignment) => assignment.status === "active");
            const employeeReturns = returns.filter((item) => item.employee_user_id === employeeUserId);

            return (
              <article className="mini-list-card action-card stock-card" key={employee.id}>
                <strong>{employee.full_name}</strong>
                <span>{employee.email}</span>
                <span>
                  {employee.job_title || "No job title"} / {employee.department_name || "No department"}
                </span>
                <span>
                  {employee.branch_name || "No branch"} / {employee.office_location || "No office location"}
                </span>
                <span>
                  Active equipment: {activeEmployeeEquipment.length} / Total assigned records: {employeeEquipment.length}
                </span>
                {activeEmployeeEquipment.length > 0 ? (
                  activeEmployeeEquipment.map((assignment) => (
                    <div className="workflow-step-list" key={assignment.id}>
                      <div className="workflow-step-row">
                        <strong>{assignment.asset_tag}</strong>
                        <span>{assignment.equipment_name} / receipt {assignment.receipt_status} / return {formatProfileDate(assignment.expected_return_date)}</span>
                      </div>
                      {formatAssignmentEquipmentSpecs(assignment) ? (
                        <div className="workflow-step-row">
                          <strong>Device specs</strong>
                          <span>{formatAssignmentEquipmentSpecs(assignment)}</span>
                        </div>
                      ) : null}
                      <div className="workflow-step-row">
                        <strong>Depreciation</strong>
                        <span>{getAssignmentDepreciationSummary(assignment)}</span>
                      </div>
                      <div className="card-action-row">
                        <button className="secondary-btn compact-btn" type="button" onClick={() => void handlePreviewEquipmentQr(buildEquipmentRowFromAssignment(assignment), activeSection)}>
                          QR code
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <span>No active equipment assigned.</span>
                )}
                {employeeReturns.length > 0 ? (
                  <span>
                    Return activity: {employeeReturns.map((item) => formatReturnStatus(item.return_status)).join(", ")}
                  </span>
                ) : null}
              </article>
            );
          })
        ) : (
          <p className="loading-text">{emptyText}</p>
        )}
      </div>
      <div className="qr-panel dashboard-qr-panel" id="equipment-qr-panel">
        <div className="panel-header">
          <h3>Equipment QR</h3>
        </div>
        {isEquipmentQrLoading ? (
          <p className="loading-text">Generating item QR code...</p>
        ) : equipmentQrError ? (
          <p className="error-text">{equipmentQrError}</p>
        ) : selectedQrEquipment && equipmentQrImageUrl ? (
          <div className={`qr-card stacked-qr-card${selectedQrAudience === "employee" ? " employee-qr-card" : ""}`}>
            <div className="qr-preview">
              <img src={equipmentQrImageUrl} alt={`${selectedQrEquipment.asset_tag} QR code`} />
            </div>
            <div className="qr-details">
              <span className="qr-eyebrow">Employee Device Pass</span>
              <h4>{selectedQrEquipment.equipment_name}</h4>
              <p><strong>Company code:</strong> {selectedQrEquipment.asset_tag}</p>
              <p><strong>Serial number:</strong> {selectedQrEquipment.serial_number}</p>
              <p><strong>Model:</strong> {selectedQrEquipment.model_name || "Not set"}</p>
              <p><strong>Computer name:</strong> {selectedQrEquipment.computer_name || "Not set"}</p>
              <p><strong>Specs:</strong> {formatEquipmentSpecs(selectedQrEquipment) || "Not set"}</p>
              <p><strong>Warranty end:</strong> {formatQrDate(selectedQrEquipment.warranty_end_date)}</p>
              <p className="qr-footnote">Scan for employee-facing device identification only.</p>
              <button className="primary-btn qr-download-btn" type="button" onClick={handleDownloadEquipmentQr}>
                Download QR
              </button>
            </div>
          </div>
        ) : (
          <p className="loading-text">Select an assigned item to preview its QR code.</p>
        )}
      </div>
    </section>
  );

  const renderSecondarySection = () => {
    if (roleView === "branch-manager") {
      if (activeSection === "employees") {
        return renderEmployeeEquipmentDirectory(
          branchEmployees,
          "Branch Employees And Equipment",
          "No employees are assigned to this branch yet.",
        );
      }

      return (
        <section className="dashboard-panel">
          <div className="panel-header">
            <h3>Branch Assets</h3>
          </div>
          <div className="subpanel-header">
            <h4>Assigned Items</h4>
            <span>{branchAssignedEquipment.length} assigned</span>
          </div>
          <div className="user-table workflow-assignment-table">
            <div className="user-table-head workflow-assignment-table-head">
              <span>Asset</span>
              <span>Status / Type</span>
              <span>Assigned To</span>
              <span>Assigned / Return</span>
              <span>Depreciation</span>
              <span>Specs</span>
              <span>Actions</span>
            </div>
            {branchAssignedEquipment.length > 0 ? (
              branchAssignedEquipment.map((item) => {
                const assignment = branchAssignmentMap.get(item.id);

                return (
                  <div className="user-table-row workflow-assignment-table-row" key={item.id}>
                    <div className="user-primary-cell">
                      <strong>{item.asset_tag}</strong>
                      <span>{item.serial_number}</span>
                    </div>
                    <div className="user-secondary-cell">
                      <strong>{item.equipment_name}</strong>
                      <span>
                        <span className={`status-pill status-${item.status}`}>{item.status}</span>
                      </span>
                    </div>
                    <div className="user-secondary-cell">
                      <strong>{assignment?.employee_name || "Not assigned"}</strong>
                      <span>{assignment?.employee_email || "No email"}</span>
                    </div>
                    <div className="user-secondary-cell">
                      <strong>{assignment?.assigned_at ? assignment.assigned_at.slice(0, 10) : "Not set"}</strong>
                      <span>Return: {assignment?.expected_return_date ? assignment.expected_return_date.slice(0, 10) : "Not set"}</span>
                    </div>
                    <div className="user-secondary-cell">
                      <strong>{getEquipmentDepreciationSummary(item)}</strong>
                      <span>{getEquipmentDepreciationDetail(item)}</span>
                    </div>
                    <div className="user-secondary-cell">
                      <strong>{item.category_name || "No category"}</strong>
                      <span>{formatEquipmentSpecs(item) || "No specs"}</span>
                    </div>
                    <div className="table-action-group workflow-stock-table-actions">
                      {assignment ? (
                        <button
                          className="table-action"
                          type="button"
                          onClick={() => setSelectedBranchEmployeeId(assignment.employee_user_id)}
                        >
                          View history
                        </button>
                      ) : null}
                      <button className="table-action" type="button" onClick={() => void openDetailPanel("equipment", item.id)}>
                        View details
                      </button>
                      <button className="table-action" type="button" onClick={() => void handlePreviewEquipmentQr(item)}>
                        QR code
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="loading-text">No active assigned items in this branch right now.</p>
            )}
          </div>

          <div className="subpanel-header">
            <h4>Available Items</h4>
            <span>{branchAvailableEquipment.length} available</span>
          </div>
          <div className="user-table workflow-stock-table">
            <div className="user-table-head workflow-stock-table-head">
              <span>Asset</span>
              <span>Status / Type</span>
              <span>Location</span>
              <span>Cost / Warranty</span>
              <span>Depreciation</span>
              <span>Lifespan / Replace By</span>
              <span>Notes</span>
              <span>Actions</span>
            </div>
            {branchAvailableEquipment.length > 0 ? (
              branchAvailableEquipment.map((item) => (
                <div className="user-table-row workflow-stock-table-row" key={item.id}>
                  <div className="user-primary-cell">
                    <strong>{item.asset_tag}</strong>
                    <span>{item.serial_number}</span>
                  </div>
                  <div className="user-secondary-cell">
                    <strong>{item.equipment_name}</strong>
                    <span>
                      <span className={`status-pill status-${item.status}`}>{item.status}</span>
                    </span>
                  </div>
                  <div className="user-secondary-cell">
                    <strong>{getEquipmentLocationLabel(item)}</strong>
                    <span>{getEquipmentLocationDetail(item)}</span>
                  </div>
                  <div className="user-secondary-cell">
                    <strong>{formatCurrencyAmount(item.purchase_cost)}</strong>
                    <span>Warranty: {item.warranty_end_date ? item.warranty_end_date.slice(0, 10) : "Not set"}</span>
                  </div>
                  <div className="user-secondary-cell">
                    <strong>{getEquipmentDepreciationSummary(item)}</strong>
                    <span>{getEquipmentDepreciationDetail(item)}</span>
                  </div>
                  <div className="user-secondary-cell">
                    <strong>{item.lifespan_years ?? 4} years</strong>
                    <span>{getReplacementDate(item.purchase_date, item.lifespan_years, item.purchase_year)}</span>
                  </div>
                  <div className="user-secondary-cell">
                    <strong>{getReplacementStockLabel(item) || "Ready for assignment"}</strong>
                    <span>{item.replacement_condition_status || "No replacement note"}</span>
                  </div>
                  <div className="table-action-group workflow-stock-table-actions">
                    <button className="table-action" type="button" onClick={() => void openDetailPanel("equipment", item.id)}>
                      View details
                    </button>
                    <button className="table-action" type="button" onClick={() => void handlePreviewEquipmentQr(item)}>
                      QR code
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="loading-text">No available items are left in this branch.</p>
            )}
          </div>

          <div className="dashboard-panel embedded-panel">
            <div className="subpanel-header">
              <h4>Employee Assignment History</h4>
              {selectedBranchEmployee ? (
                <button
                  className="secondary-btn compact-btn"
                  type="button"
                  onClick={() => setSelectedBranchEmployeeId(null)}
                >
                  Close history
                </button>
              ) : null}
            </div>
            {selectedBranchEmployee ? (
              <div className="mini-list">
                <article className="mini-list-card">
                  <strong>{selectedBranchEmployee.employee_name}</strong>
                  <span>{selectedBranchEmployee.employee_email}</span>
                  <span>
                    {selectedBranchEmployeeAssignments.filter((assignment) => assignment.status === "active").length} active /
                    {" "}
                    {selectedBranchEmployeeAssignments.length} total branch assignments
                  </span>
                </article>
                {selectedBranchEmployeeAssignments.map((assignment) => (
                  <article className="mini-list-card action-card" key={assignment.id}>
                    <strong>{assignment.asset_tag}</strong>
                    <span>{assignment.equipment_name} / {assignment.status}</span>
                    <span>
                      Assigned on: {assignment.assigned_at.slice(0, 10)} / Return: {assignment.expected_return_date ? assignment.expected_return_date.slice(0, 10) : "Not set"}
                    </span>
                    <span>
                      Issued by: {assignment.assigned_by_name} / Branch: {assignment.branch_name || "No branch"}
                    </span>
                    {assignment.notes ? <span>{assignment.notes}</span> : null}
                  </article>
                ))}
              </div>
            ) : (
              <p className="loading-text">Select an assigned employee from the asset table to view their assignment history.</p>
            )}
          </div>

          <div className="qr-panel dashboard-qr-panel" id="equipment-qr-panel">
            <div className="panel-header">
              <h3>Equipment QR</h3>
            </div>
            {isEquipmentQrLoading ? (
              <p className="loading-text">Generating item QR code...</p>
            ) : equipmentQrError ? (
              <p className="error-text">{equipmentQrError}</p>
            ) : selectedQrEquipment && equipmentQrImageUrl ? (
              <div className="qr-card stacked-qr-card">
                <div className="qr-preview">
                  <img src={equipmentQrImageUrl} alt={`${selectedQrEquipment.asset_tag} QR code`} />
                </div>
                <div className="qr-details">
                  <p>
                    <strong>Company code:</strong> {selectedQrEquipment.asset_tag}
                  </p>
                  <p>
                    <strong>Serial number:</strong> {selectedQrEquipment.serial_number}
                  </p>
                  <p>
                    <strong>Equipment:</strong> {selectedQrEquipment.equipment_name}
                  </p>
                  <p>
                    <strong>Category:</strong> {selectedQrEquipment.category_name || "Not set"}
                  </p>
                  <p>
                    <strong>Location:</strong> {selectedQrEquipment.branch_name || "No branch"}
                  </p>
                  <p>
                    <strong>Purchase date:</strong> {formatQrDate(selectedQrEquipment.purchase_date)}
                  </p>
                  <p>
                    <strong>Purchase year:</strong> {selectedQrEquipment.purchase_year || "Not set"}
                  </p>
                  {!currentUser || currentUser.role !== "employee" ? (
                    <>
                      <p>
                        <strong>Purchase cost:</strong> {formatCurrencyAmount(selectedQrEquipment.purchase_cost)}
                      </p>
                      <p>
                        <strong>Annual depreciation:</strong> {getEquipmentDepreciationSummary(selectedQrEquipment)}
                      </p>
                      <p>
                        <strong>Depreciation detail:</strong> {getEquipmentDepreciationDetail(selectedQrEquipment)}
                      </p>
                    </>
                  ) : null}
                  <p>
                    <strong>Computer name:</strong> {selectedQrEquipment.computer_name || "Not set"}
                  </p>
                  <p>
                    <strong>Vendor / Model:</strong> {selectedQrEquipment.vendor_name || "Not set"} / {selectedQrEquipment.model_name || "Not set"}
                  </p>
                  <p>
                    <strong>Device health:</strong> {selectedQrEquipment.device_health || "Not set"}
                  </p>
                  <p>
                    <strong>Detailed location:</strong> {selectedQrEquipment.location_details || "Not set"}
                  </p>
                  <p>
                    <strong>Warranty end:</strong> {formatQrDate(selectedQrEquipment.warranty_end_date)}
                  </p>
                  <p>
                    <strong>Lifespan:</strong> {selectedQrEquipment.lifespan_years ?? 4} years
                  </p>
                  <p>
                    <strong>Replacement target:</strong> {getReplacementDate(selectedQrEquipment.purchase_date, selectedQrEquipment.lifespan_years, selectedQrEquipment.purchase_year)}
                  </p>
                  <button className="primary-btn qr-download-btn" type="button" onClick={handleDownloadEquipmentQr}>
                    Download QR
                  </button>
                </div>
              </div>
            ) : (
              <p className="loading-text">Select an assigned or available item to preview its QR code.</p>
            )}
          </div>
        </section>
      );
    }

    if (roleView === "hr") {
      if (activeSection === "my-requests") {
        return (
          <section className="dashboard-panel">
            <div className="panel-header">
              <h3>HR Submitted Requests</h3>
            </div>
            {renderRequestCards(requests.filter((request) => request.requester_id === user.id), "view")}
          </section>
        );
      }

      return (
        <section className="dashboard-panel">
          <div className="panel-header">
            <div>
              <h3>Employee Directory</h3>
              <p className="dashboard-subtitle">Employee records load from HRMS first and fall back to IMS employee records when HRMS is unavailable, then they can be used here to create equipment requests.</p>
            </div>
            <div className="panel-header-actions">
              <button className="primary-btn compact-btn" type="button" onClick={openEmployeeModal}>
                Add Employee
              </button>
            </div>
          </div>

          <div className="subpanel-header">
            <h4>HRMS Employees</h4>
            <span>{employees.length} employees</span>
          </div>
          <div className="mini-list stock-grid">
            {employees.length > 0 ? (
              employees.map((employee) => {
                const employeeUserId = getEmployeeLinkedUserId(employee);
                const employeeEquipment = employeeUserId ? getAssignmentsForEmployee(employeeUserId) : [];
                const activeEmployeeEquipment = employeeEquipment.filter((assignment) => assignment.status === "active");

                return (
                  <article className="mini-list-card action-card stock-card" key={employee.id}>
                    <strong>{employee.full_name}</strong>
                    <span>{employee.employee_code || "No employee code"} / {employee.email}</span>
                    <span>{employee.job_title || "No job title"} / {employee.department_name || "No department"}</span>
                    <span>{employee.office_location || "No office location"} / {employee.hrms_employee_id || "No HRMS id"}</span>
                    <span>Status: {employee.status || "active"} / IMS: {employee.ims_account_status || "linked"} / Start: {formatProfileDate(employee.start_date)}</span>
                    <span>Active equipment: {activeEmployeeEquipment.length}</span>
                    {activeEmployeeEquipment.length > 0 ? (
                      activeEmployeeEquipment.map((assignment) => (
                        <div className="workflow-step-list" key={assignment.id}>
                          <div className="workflow-step-row">
                            <strong>{assignment.asset_tag}</strong>
                            <span>{assignment.equipment_name} / receipt {assignment.receipt_status}</span>
                          </div>
                          {formatAssignmentEquipmentSpecs(assignment) ? (
                            <div className="workflow-step-row">
                              <strong>Device specs</strong>
                              <span>{formatAssignmentEquipmentSpecs(assignment)}</span>
                            </div>
                          ) : null}
                          <div className="card-action-row">
                            <button
                              className="secondary-btn compact-btn"
                              type="button"
                              onClick={() => (employeeUserId ? openDetailPanel("employee", Number(employeeUserId)) : handleEditEmployee(employee))}
                            >
                              View details
                            </button>
                            <button className="secondary-btn compact-btn" type="button" onClick={() => void handlePreviewEquipmentQr(buildEquipmentRowFromAssignment(assignment), activeSection)}>
                              QR code
                            </button>
                          </div>
                        </div>
                      ))
                    ) : null}
                    <div className="card-action-row">
                      <button
                        className="secondary-btn compact-btn"
                        type="button"
                        onClick={() => (employeeUserId ? openDetailPanel("employee", Number(employeeUserId)) : handleEditEmployee(employee))}
                      >
                        View details
                      </button>
                      <button className="secondary-btn compact-btn" type="button" onClick={() => handleEditEmployee(employee)}>
                        Edit
                      </button>
                      {employee.status !== "inactive" ? (
                        <button
                          className="secondary-btn compact-btn btn-soft-warning"
                          type="button"
                          onClick={() => void handleUpdateHrEmployeeStatus(employee, "inactive")}
                        >
                          Set inactive
                        </button>
                      ) : (
                        <button
                          className="secondary-btn compact-btn"
                          type="button"
                          onClick={() => void handleUpdateHrEmployeeStatus(employee, "active")}
                        >
                          Reactivate
                        </button>
                      )}
                      <button
                        className="secondary-btn compact-btn btn-soft-warning"
                        type="button"
                        onClick={() => {
                          setRequestForm((current) => ({
                            ...current,
                            requestType: "new_hire",
                            hrmsEmployeeRecordId: String(employee.id),
                            targetEmployeeUserId: employeeUserId ? String(employeeUserId) : "",
                          }));
                          setActiveSection("new-request");
                        }}
                      >
                        Request equipment
                      </button>
                    </div>
                  </article>
                );
              })
            ) : (
              <p className="loading-text">No employees are available yet.</p>
            )}
          </div>
          <div className="qr-panel dashboard-qr-panel" id="equipment-qr-panel">
            <div className="panel-header">
              <h3>Equipment QR</h3>
            </div>
            {isEquipmentQrLoading ? (
              <p className="loading-text">Generating item QR code...</p>
            ) : equipmentQrError ? (
              <p className="error-text">{equipmentQrError}</p>
            ) : selectedQrEquipment && equipmentQrImageUrl ? (
              <div className="qr-card stacked-qr-card">
                <div className="qr-preview">
                  <img src={equipmentQrImageUrl} alt={`${selectedQrEquipment.asset_tag} QR code`} />
                </div>
                <div className="qr-details">
                  <p><strong>Company code:</strong> {selectedQrEquipment.asset_tag}</p>
                  <p><strong>Serial number:</strong> {selectedQrEquipment.serial_number}</p>
                  <p><strong>Equipment:</strong> {selectedQrEquipment.equipment_name}</p>
                  <p><strong>Specs:</strong> {formatEquipmentSpecs(selectedQrEquipment) || "Not set"}</p>
                  <button className="primary-btn qr-download-btn" type="button" onClick={handleDownloadEquipmentQr}>
                    Download QR
                  </button>
                </div>
              </div>
            ) : (
              <p className="loading-text">Select an assigned employee device to preview its QR code.</p>
            )}
          </div>

          {isEmployeeModalOpen ? (
            <div className="session-warning-overlay hr-modal-overlay" role="presentation" onClick={resetEmployeeForm}>
              <div
                className="session-warning-card hr-modal-card"
                role="dialog"
                aria-modal="true"
                aria-labelledby="hr-employee-modal-title"
                onClick={(event) => event.stopPropagation()}
              >
                <p className="session-warning-kicker">{editingEmployeeId ? "Update Employee" : "HRMS Registration"}</p>
                <h2 id="hr-employee-modal-title">{editingEmployeeId ? "Edit employee profile" : "Add employee profile"}</h2>
                <p className="hr-modal-intro">Capture the employee's HRMS information here before starting any equipment request.</p>
                <form className="simple-form hr-modal-form" onSubmit={handleSubmitEmployee}>
                  <label className="field">
                    <span>First name</span>
                    <input value={employeeForm.firstName} onChange={(event) => setEmployeeForm((current) => ({ ...current, firstName: event.target.value }))} required />
                  </label>
                  <label className="field">
                    <span>Last name</span>
                    <input value={employeeForm.lastName} onChange={(event) => setEmployeeForm((current) => ({ ...current, lastName: event.target.value }))} required />
                  </label>
                  <label className="field">
                    <span>Email</span>
                    <input type="email" value={employeeForm.email} onChange={(event) => setEmployeeForm((current) => ({ ...current, email: event.target.value }))} required />
                  </label>
                  <label className="field">
                    <span>Phone number</span>
                    <input value={employeeForm.phoneNumber} onChange={(event) => setEmployeeForm((current) => ({ ...current, phoneNumber: event.target.value }))} />
                  </label>
                  <label className="field">
                    <span>Employee code</span>
                    <input value={employeeForm.employeeCode} onChange={(event) => setEmployeeForm((current) => ({ ...current, employeeCode: event.target.value }))} />
                  </label>
                  <label className="field">
                    <span>HRMS employee id</span>
                    <input value={employeeForm.hrmsEmployeeId} onChange={(event) => setEmployeeForm((current) => ({ ...current, hrmsEmployeeId: event.target.value }))} />
                  </label>
                  <label className="field">
                    <span>Employee grade</span>
                    <input value={employeeForm.employeeGrade} onChange={(event) => setEmployeeForm((current) => ({ ...current, employeeGrade: event.target.value }))} />
                  </label>
                  <label className="field">
                    <span>Job title</span>
                    <input value={employeeForm.jobTitle} onChange={(event) => setEmployeeForm((current) => ({ ...current, jobTitle: event.target.value }))} />
                  </label>
                  <label className="field">
                    <span>Employment status</span>
                    <input value={employeeForm.employmentStatus} onChange={(event) => setEmployeeForm((current) => ({ ...current, employmentStatus: event.target.value }))} />
                  </label>
                  <label className="field">
                    <span>Office location</span>
                    <input value={employeeForm.officeLocation} onChange={(event) => setEmployeeForm((current) => ({ ...current, officeLocation: event.target.value }))} />
                  </label>
                  <label className="field">
                    <span>Start date</span>
                    <input type="date" value={employeeForm.startDate} onChange={(event) => setEmployeeForm((current) => ({ ...current, startDate: event.target.value }))} />
                  </label>
                  <div className="session-warning-actions hr-modal-actions">
                    <button className="primary-btn compact-btn" type="submit">
                      {editingEmployeeId ? "Save Employee" : "Create Employee"}
                    </button>
                    <button className="secondary-btn compact-btn" type="button" onClick={resetEmployeeForm}>
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          ) : null}
        </section>
      );
    }

    if (roleView === "it-manager") {
      return (
        <section className="dashboard-panel">
          <div className="panel-header">
            <h3>Issue And Equipment Management</h3>
          </div>
          <form className="simple-form" onSubmit={handleSubmitIssue}>
            <label className="field">
              <span>Equipment</span>
              <select
                value={issueForm.equipmentId}
                onChange={(event) => setIssueForm((current) => ({ ...current, equipmentId: event.target.value }))}
                required
                disabled={editingIssueId !== null}
              >
                <option value="">Select equipment</option>
                {equipment.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.asset_tag} / {item.equipment_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Issue title</span>
              <input
                value={issueForm.issueTitle}
                onChange={(event) => setIssueForm((current) => ({ ...current, issueTitle: event.target.value }))}
                required
              />
            </label>
            <label className="field">
              <span>Description</span>
              <textarea
                value={issueForm.issueDescription}
                onChange={(event) => setIssueForm((current) => ({ ...current, issueDescription: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>Priority</span>
              <select
                value={issueForm.priority}
                onChange={(event) => setIssueForm((current) => ({ ...current, priority: event.target.value }))}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </label>
            <label className="field">
              <span>Status</span>
              <select
                value={issueForm.issueStatus}
                onChange={(event) => setIssueForm((current) => ({ ...current, issueStatus: event.target.value }))}
              >
                <option value="open">Open</option>
                <option value="in_progress">In progress</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
            </label>
            <div className="card-action-row">
              <button className="primary-btn compact-btn" type="submit">
                {editingIssueId ? "Update issue" : "Create issue"}
              </button>
              {editingIssueId ? (
                <button
                  className="secondary-btn compact-btn"
                  type="button"
                  onClick={() => {
                    setEditingIssueId(null);
                    setIssueForm({
                      equipmentId: "",
                      issueTitle: "",
                      issueDescription: "",
                      priority: "medium",
                      issueStatus: "open",
                    });
                  }}
                >
                  Cancel edit
                </button>
              ) : null}
            </div>
          </form>
          <div className="mini-list">
            {issues.map((issue) => (
              <article className="mini-list-card action-card" key={issue.id}>
                <strong>{issue.issue_title}</strong>
                <span>
                  <span className={`status-pill status-${issue.issue_status}`}>{issue.issue_status}</span>
                  {" "}
                  {issue.asset_tag} / {issue.priority}
                </span>
                <span>{issue.issue_description || "No issue description."}</span>
                <div className="card-action-row">
                  <button className="secondary-btn compact-btn" type="button" onClick={() => handleEditIssue(issue)}>
                    Edit
                  </button>
                  <button className="secondary-btn compact-btn btn-soft-danger" type="button" onClick={() => void handleDeleteIssue(issue.id)}>
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      );
    }

    if (roleView === "it-support") {
      const availableStockPageKey = "stock-available-items";
      const availableStockPageSize = pageSizeByKey[availableStockPageKey] || DEFAULT_ITEMS_PER_PAGE;
      const availableStockTotalPages = Math.max(Math.ceil(filteredLocalAvailableEquipment.length / availableStockPageSize), 1);
      const availableStockCurrentPage = Math.min(requestPageByKey[availableStockPageKey] || 1, availableStockTotalPages);
      const paginatedAvailableStock = paginateRows(filteredLocalAvailableEquipment, availableStockCurrentPage, availableStockPageSize);

      const returnedStockPageKey = "stock-returned-items";
      const returnedStockPageSize = pageSizeByKey[returnedStockPageKey] || DEFAULT_ITEMS_PER_PAGE;
      const returnedStockTotalPages = Math.max(Math.ceil(filteredReturnedHoldingAssignments.length / returnedStockPageSize), 1);
      const returnedStockCurrentPage = Math.min(requestPageByKey[returnedStockPageKey] || 1, returnedStockTotalPages);
      const paginatedReturnedStock = paginateRows(filteredReturnedHoldingAssignments, returnedStockCurrentPage, returnedStockPageSize);

      const disposedStockPageKey = "stock-disposed-items";
      const disposedStockPageSize = pageSizeByKey[disposedStockPageKey] || DEFAULT_ITEMS_PER_PAGE;
      const disposedStockTotalPages = Math.max(Math.ceil(filteredDisposedEquipment.length / disposedStockPageSize), 1);
      const disposedStockCurrentPage = Math.min(requestPageByKey[disposedStockPageKey] || 1, disposedStockTotalPages);
      const paginatedDisposedStock = paginateRows(filteredDisposedEquipment, disposedStockCurrentPage, disposedStockPageSize);

      const branchStockItems = equipment.filter(
        (item) => item.stock_location !== "warehouse_stock" && (!user.branchId || item.branch_id === user.branchId),
      );
      const filteredBranchStockItems = branchStockItems.filter((item) =>
        matchesItSupportStockSearch(
          item.asset_tag,
          item.serial_number,
          item.equipment_name,
          item.category_name,
          item.branch_name,
          item.vendor_name,
          item.model_name,
          item.location_details,
          item.status,
          item.replacement_condition_status,
        ),
      );
      const addedItemsPageKey = "stock-added-items";
      const addedItemsPageSize = pageSizeByKey[addedItemsPageKey] || DEFAULT_ITEMS_PER_PAGE;
      const addedItemsTotalPages = Math.max(Math.ceil(filteredBranchStockItems.length / addedItemsPageSize), 1);
      const addedItemsCurrentPage = Math.min(requestPageByKey[addedItemsPageKey] || 1, addedItemsTotalPages);
      const paginatedBranchStockItems = paginateRows(filteredBranchStockItems, addedItemsCurrentPage, addedItemsPageSize);

      return (
        <section className="dashboard-panel">
          <div className="panel-header">
            <div>
              <h3>Stock Control</h3>
              <p className="dashboard-subtitle">Warehouse Manager registers devices. IT Support receives approved transfers here and assigns confirmed stock to employees.</p>
            </div>
          </div>
          <div className="stock-control-filter-bar">
            <div className="filter-chip-row">
              {([
                { key: "available", label: "Available", total: filteredLocalAvailableEquipment.length },
                { key: "returned", label: "Returned", total: filteredReturnedHoldingAssignments.length },
                { key: "retired", label: "Retired", total: filteredDisposedEquipment.length },
              ] as Array<{ key: StockControlView; label: string; total: number }>).map((option) => (
                <button
                  key={option.key}
                  type="button"
                  className={`filter-chip${stockControlView === option.key ? " is-active" : ""}`}
                  onClick={() => setStockControlView(option.key)}
                >
                  {option.label} ({option.total})
                </button>
              ))}
            </div>
            <input
              className="table-search-input"
              type="search"
              value={itSupportStockSearchTerm}
              onChange={(event) => setItSupportStockSearchTerm(event.target.value)}
              placeholder="Search asset, serial, type, branch..."
              aria-label="Search IT support stock"
            />
          </div>
          {stockControlView === "available" ? (
            <article className="inventory-focus-card">
              <div className="panel-header">
                <h3>
                  <PackageCheck size={18} strokeWidth={2.2} />
                  <span>Available</span>
                </h3>
                <span>{filteredLocalAvailableEquipment.length}</span>
              </div>
              <p className="dashboard-subtitle">Ready for assignment.</p>
              <div className="user-table workflow-stock-table workflow-stock-table-compact">
                <div className="user-table-head workflow-stock-table-head">
                  <span>Asset</span>
                  <span>Status / Type</span>
                  <span>Location</span>
                  <span>Cost / Warranty</span>
                  <span>Depreciation</span>
                  <span>Lifespan / Replace By</span>
                  <span>Notes</span>
                  <span>Actions</span>
                </div>
                {filteredLocalAvailableEquipment.length > 0 ? (
                  paginatedAvailableStock.map((item) => (
                    <div className="user-table-row workflow-stock-table-row" key={`available-${item.id}`}>
                      <div className="user-primary-cell">
                        <strong>{item.asset_tag}</strong>
                        <span>{item.serial_number}</span>
                      </div>
                      <div className="user-secondary-cell">
                        <strong>{item.equipment_name}</strong>
                        <span>
                          <span className={`status-pill status-${item.status}`}>{item.status}</span>
                        </span>
                      </div>
                      <div className="user-secondary-cell">
                        <strong>{getEquipmentLocationLabel(item)}</strong>
                        <span>{getEquipmentLocationDetail(item)}</span>
                      </div>
                      <div className="user-secondary-cell">
                        <strong>{formatCurrencyAmount(item.purchase_cost)}</strong>
                        <span>Warranty: {item.warranty_end_date ? item.warranty_end_date.slice(0, 10) : "Not set"}</span>
                      </div>
                      <div className="user-secondary-cell">
                        <strong>{getEquipmentDepreciationSummary(item)}</strong>
                        <span>{getEquipmentDepreciationDetail(item)}</span>
                      </div>
                      <div className="user-secondary-cell">
                        <strong>{item.lifespan_years ?? 4} years</strong>
                        <span>{getReplacementDate(item.purchase_date, item.lifespan_years, item.purchase_year)}</span>
                      </div>
                      <div className="user-secondary-cell">
                        <strong>{getReplacementStockLabel(item) || "Ready for assignment"}</strong>
                        <span>{item.replacement_condition_status || item.location_details || "No note"}</span>
                      </div>
                      <div className="table-action-group workflow-stock-table-actions">
                        <button className="table-action" type="button" onClick={() => void openDetailPanel("equipment", item.id)}>
                          View details
                        </button>
                        <button className="table-action" type="button" onClick={() => void handlePreviewEquipmentQr(item)}>
                          QR code
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="loading-text">No available devices.</p>
                )}
              </div>
              {renderPaginationBar(availableStockPageKey, filteredLocalAvailableEquipment.length, availableStockCurrentPage, availableStockPageSize, (page) =>
                setRequestPageByKey((current) => ({
                  ...current,
                  [availableStockPageKey]: page,
                }))
              )}
            </article>
          ) : null}
          {stockControlView === "returned" ? (
            <article className="inventory-focus-card">
              <div className="panel-header">
                <h3>
                  <RotateCcw size={18} strokeWidth={2.2} />
                  <span>Returned</span>
                </h3>
                <span>{filteredReturnedHoldingAssignments.length}</span>
              </div>
              <p className="dashboard-subtitle">Waiting decision.</p>
              <div className="user-table workflow-assignment-table workflow-stock-table-compact">
                <div className="user-table-head workflow-assignment-table-head">
                  <span>Asset</span>
                  <span>Status / Employee</span>
                  <span>Specs / Category</span>
                  <span>Assigned / Return</span>
                  <span>Depreciation</span>
                  <span>Replacement</span>
                  <span>Actions</span>
                </div>
                {filteredReturnedHoldingAssignments.length > 0 ? (
                  paginatedReturnedStock.map(({ assignment, equipment: item }) =>
                    item ? (
                      <div className="user-table-row workflow-assignment-table-row" key={`returned-${assignment.id}`}>
                        <div className="user-primary-cell">
                          <strong>{item.asset_tag}</strong>
                          <span>{item.serial_number}</span>
                        </div>
                        <div className="user-secondary-cell">
                          <strong>{item.equipment_name}</strong>
                          <span>{assignment.employee_name || "No employee"}</span>
                        </div>
                        <div className="user-secondary-cell">
                          <strong>{item.category_name || "No category"}</strong>
                          <span>{formatAssignmentEquipmentSpecs(assignment) || "No specs"}</span>
                        </div>
                        <div className="user-secondary-cell">
                          <strong>{formatProfileDate(assignment.assigned_at)}</strong>
                          <span>Return: {formatProfileDate(assignment.expected_return_date)}</span>
                        </div>
                        <div className="user-secondary-cell">
                          <strong>{getAssignmentDepreciationSummary(assignment)}</strong>
                          <span>{getAssignmentDepreciationDetail(assignment)}</span>
                        </div>
                        <div className="user-secondary-cell">
                          <strong>{getReplacementAssignmentLabel(assignment) || "Awaiting decision"}</strong>
                          <span>{assignment.replacement_condition_status || "No replacement note"}</span>
                        </div>
                        <div className="table-action-group workflow-stock-table-actions">
                          <button className="table-action" type="button" onClick={() => void openDetailPanel("assignment", assignment.id)}>
                            View details
                          </button>
                          <button className="table-action" type="button" onClick={() => void handlePreviewEquipmentQr(item)}>
                            QR code
                          </button>
                        </div>
                      </div>
                    ) : null,
                  )
                ) : (
                  <p className="loading-text">No returned devices.</p>
                )}
              </div>
              {renderPaginationBar(returnedStockPageKey, filteredReturnedHoldingAssignments.length, returnedStockCurrentPage, returnedStockPageSize, (page) =>
                setRequestPageByKey((current) => ({
                  ...current,
                  [returnedStockPageKey]: page,
                }))
              )}
            </article>
          ) : null}
          {stockControlView === "retired" ? (
            <article className="inventory-focus-card">
              <div className="panel-header">
                <h3>
                  <TriangleAlert size={18} strokeWidth={2.2} />
                  <span>Retired</span>
                </h3>
                <span>{filteredDisposedEquipment.length}</span>
              </div>
              <p className="dashboard-subtitle">Wasted, lost, or retired.</p>
              <div className="user-table workflow-stock-table workflow-stock-table-compact">
                <div className="user-table-head workflow-stock-table-head">
                  <span>Asset</span>
                  <span>Status / Type</span>
                  <span>Location</span>
                  <span>Cost / Warranty</span>
                  <span>Depreciation</span>
                  <span>Lifespan / Replace By</span>
                  <span>Notes</span>
                  <span>Actions</span>
                </div>
                {filteredDisposedEquipment.length > 0 ? (
                  paginatedDisposedStock.map((item) => (
                    <div className="user-table-row workflow-stock-table-row" key={`disposed-${item.id}`}>
                      <div className="user-primary-cell">
                        <strong>{item.asset_tag}</strong>
                        <span>{item.serial_number}</span>
                      </div>
                      <div className="user-secondary-cell">
                        <strong>{item.equipment_name}</strong>
                        <span>
                          <span className={`status-pill status-${item.status}`}>{item.status}</span>
                        </span>
                      </div>
                      <div className="user-secondary-cell">
                        <strong>{getEquipmentLocationLabel(item)}</strong>
                        <span>{getEquipmentLocationDetail(item)}</span>
                      </div>
                      <div className="user-secondary-cell">
                        <strong>{formatCurrencyAmount(item.purchase_cost)}</strong>
                        <span>Warranty: {item.warranty_end_date ? item.warranty_end_date.slice(0, 10) : "Not set"}</span>
                      </div>
                      <div className="user-secondary-cell">
                        <strong>{getEquipmentDepreciationSummary(item)}</strong>
                        <span>{getEquipmentDepreciationDetail(item)}</span>
                      </div>
                      <div className="user-secondary-cell">
                        <strong>{item.lifespan_years ?? 4} years</strong>
                        <span>{getReplacementDate(item.purchase_date, item.lifespan_years, item.purchase_year)}</span>
                      </div>
                      <div className="user-secondary-cell">
                        <strong>{getReplacementStockLabel(item) || "Retired record"}</strong>
                        <span>{item.replacement_condition_status || "No retirement note"}</span>
                      </div>
                      <div className="table-action-group workflow-stock-table-actions">
                        <button className="table-action" type="button" onClick={() => void openDetailPanel("equipment", item.id)}>
                          View details
                        </button>
                        <button className="table-action" type="button" onClick={() => void handlePreviewEquipmentQr(item)}>
                          QR code
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="loading-text">No retired items.</p>
                )}
              </div>
              {renderPaginationBar(disposedStockPageKey, filteredDisposedEquipment.length, disposedStockCurrentPage, disposedStockPageSize, (page) =>
                setRequestPageByKey((current) => ({
                  ...current,
                  [disposedStockPageKey]: page,
                }))
              )}
            </article>
          ) : null}
          <div className="subpanel-header">
            <h4>Added Items</h4>
            <button
              className="secondary-btn compact-btn"
              type="button"
              onClick={() => setIsStockListOpen((current) => !current)}
            >
              {isStockListOpen ? "Hide items" : "Show items"}
            </button>
          </div>
          {isStockListOpen ? (
            <>
            <div className="user-table workflow-stock-table">
              <div className="user-table-head workflow-stock-table-head">
                <span>Asset</span>
                <span>Status / Type</span>
                <span>Location</span>
                <span>Cost / Warranty</span>
                <span>Depreciation</span>
                <span>Lifespan / Replace By</span>
                <span>Notes</span>
                <span>Actions</span>
              </div>
              {paginatedBranchStockItems.length > 0 ? (
                paginatedBranchStockItems.map((item) => (
                  <div className="user-table-row workflow-stock-table-row" key={item.id}>
                    <div className="user-primary-cell">
                      <strong>{item.asset_tag}</strong>
                      <span>{item.serial_number}</span>
                    </div>
                    <div className="user-secondary-cell">
                      <strong>{item.equipment_name}</strong>
                      <span>
                        <span className={`status-pill status-${item.status}`}>{item.status}</span>
                      </span>
                    </div>
                    <div className="user-secondary-cell">
                      <strong>{getEquipmentLocationLabel(item)}</strong>
                      <span>{getEquipmentLocationDetail(item)}</span>
                    </div>
                    <div className="user-secondary-cell">
                      <strong>{formatCurrencyAmount(item.purchase_cost)}</strong>
                      <span>Warranty: {item.warranty_end_date ? item.warranty_end_date.slice(0, 10) : "Not set"}</span>
                    </div>
                    <div className="user-secondary-cell">
                      <strong>{getEquipmentDepreciationSummary(item)}</strong>
                      <span>{getEquipmentDepreciationDetail(item)}</span>
                    </div>
                    <div className="user-secondary-cell">
                      <strong>{item.lifespan_years ?? 4} years</strong>
                      <span>{getReplacementDate(item.purchase_date, item.lifespan_years, item.purchase_year)}</span>
                    </div>
                    <div className="user-secondary-cell">
                      <strong>{getReplacementStockLabel(item) || "No replacement note"}</strong>
                      <span>{item.replacement_condition_status || "No condition note"}</span>
                    </div>
                    <div className="table-action-group workflow-stock-table-actions">
                      <button className="table-action" type="button" onClick={() => void openDetailPanel("equipment", item.id)}>
                        View details
                      </button>
                      <button className="table-action" type="button" onClick={() => void handlePreviewEquipmentQr(item)}>
                        QR code
                      </button>
                      <button className="table-action" type="button" onClick={() => handleEditEquipment(item)}>
                        Edit
                      </button>
                      <button className="table-action table-action-danger" type="button" onClick={() => void handleDeleteEquipment(item.id)}>
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="loading-text">No stock items match that search.</p>
              )}
            </div>
            {renderPaginationBar(addedItemsPageKey, filteredBranchStockItems.length, addedItemsCurrentPage, addedItemsPageSize, (page) =>
              setRequestPageByKey((current) => ({
                ...current,
                [addedItemsPageKey]: page,
              }))
            )}
            </>
          ) : null}
          <div className="qr-panel dashboard-qr-panel" id="equipment-qr-panel">
            <div className="panel-header">
              <h3>Equipment QR</h3>
            </div>
            {isEquipmentQrLoading ? (
              <p className="loading-text">Generating item QR code...</p>
            ) : equipmentQrError ? (
              <p className="error-text">{equipmentQrError}</p>
            ) : selectedQrEquipment && equipmentQrImageUrl ? (
              <div className="qr-card stacked-qr-card">
                <div className="qr-preview">
                  <img src={equipmentQrImageUrl} alt={`${selectedQrEquipment.asset_tag} QR code`} />
                </div>
                <div className="qr-details">
                  <p>
                    <strong>Company code:</strong> {selectedQrEquipment.asset_tag}
                  </p>
                  <p>
                    <strong>Serial number:</strong> {selectedQrEquipment.serial_number}
                  </p>
                  <p>
                    <strong>Equipment:</strong> {selectedQrEquipment.equipment_name}
                  </p>
                  <p>
                    <strong>Category:</strong> {selectedQrEquipment.category_name || "Not set"}
                  </p>
                  <p>
                    <strong>Location:</strong> {selectedQrEquipment.branch_name || "No branch"}
                  </p>
                  <p>
                    <strong>Purchase date:</strong> {formatQrDate(selectedQrEquipment.purchase_date)}
                  </p>
                  {!currentUser || currentUser.role !== "employee" ? (
                    <>
                      <p>
                        <strong>Purchase cost:</strong> {formatCurrencyAmount(selectedQrEquipment.purchase_cost)}
                      </p>
                      <p>
                        <strong>Annual depreciation:</strong> {getEquipmentDepreciationSummary(selectedQrEquipment)}
                      </p>
                      <p>
                        <strong>Depreciation detail:</strong> {getEquipmentDepreciationDetail(selectedQrEquipment)}
                      </p>
                    </>
                  ) : null}
                  <p>
                    <strong>Warranty end:</strong> {formatQrDate(selectedQrEquipment.warranty_end_date)}
                  </p>
                  <button className="primary-btn qr-download-btn" type="button" onClick={handleDownloadEquipmentQr}>
                    Download QR
                  </button>
                </div>
              </div>
            ) : (
              <p className="loading-text">Create an item or select QR code on any stock card to preview its full equipment QR.</p>
            )}
          </div>
        </section>
      );
    }

    return (
      <section className="dashboard-panel">
        <div className="panel-header">
          <h3>My Requests</h3>
          <div className="panel-header-actions">
            <input
              className="table-search-input"
              type="search"
              value={requestSearchTerm}
              onChange={(event) => setRequestSearchTerm(event.target.value)}
              placeholder="Search device type e.g. laptop"
              aria-label="Search requests by device type"
            />
          </div>
        </div>
        {renderRequestCards(filteredEmployeeRequests, "view")}
      </section>
    );
  };

  const renderReportsSection = () => {
    const requestReportCounts = ["pending", "approved", "rejected", "fulfilled"].map((status) => ({
      label: status,
      total: filteredReportRequests.filter((request) =>
        status === "pending" ? isLivePendingRequest(request) : request.request_status === status,
      ).length,
    }));
    const equipmentReportCounts = ["available", "assigned", "maintenance", "retired", "lost"].map((status) => ({
      label: status,
      total: filteredReportEquipment.filter((item) => item.status === status).length,
    }));
    const assignmentReportCounts = ["active", "returned", "overdue"].map((status) => ({
      label: status,
      total: filteredReportAssignments.filter((assignment) => assignment.status === status).length,
    }));
    const reportCards = [
      ...(roleView === "employee" ? requestReportCounts : requestReportCounts).map((item) => ({
        key: `request-${item.label}`,
        label: item.label,
        total: item.total,
        kind: "request" as const,
        status: item.label,
      })),
      ...(roleView === "it-manager"
        ? equipmentReportCounts.map((item) => ({
            key: `equipment-${item.label}`,
            label: `${item.label} equipment`,
            total: item.total,
            kind: "equipment" as const,
            status: item.label,
          }))
        : []),
      ...(roleView === "it-support"
        ? assignmentReportCounts.map((item) => ({
            key: `assignment-${item.label}`,
            label: `${item.label} assignments`,
            total: item.total,
            kind: "assignment" as const,
            status: item.label,
          }))
        : []),
    ];

    const activeReport =
      reportCards.find((item) => item.key === selectedReportKey) ??
      reportCards[0] ??
      null;
    const chartMaxValue = Math.max(...reportCards.map((item) => item.total), 1);

    const renderReportDetails = () => {
      if (!activeReport) {
        return <p className="loading-text">No report data is available right now.</p>;
      }

      if (activeReport.kind === "request") {
        return renderRequestCards(getRequestsForReportStatus(activeReport.status), "view");
      }

      if (activeReport.kind === "equipment") {
        const matchingEquipment = getEquipmentForReportStatus(activeReport.status);

        return matchingEquipment.length > 0 ? (
          <div className="user-table workflow-report-table">
            <div className="user-table-head workflow-report-table-head">
              <span>Asset</span>
              <span>Equipment</span>
              <span>Category / Branch</span>
              <span>Purchase Date</span>
              <span>Cost</span>
              <span>Specs / Notes</span>
            </div>
            {matchingEquipment.map((item) => (
              <div className="user-table-row workflow-report-table-row" key={`report-equipment-${item.id}`}>
                <div className="user-primary-cell">
                  <strong>{item.asset_tag}</strong>
                  <span>{item.serial_number}</span>
                </div>
                <div className="user-secondary-cell">
                  <strong>{item.equipment_name}</strong>
                  <span className={`status-pill status-${item.status}`}>{item.status}</span>
                </div>
                <div className="user-secondary-cell">
                  <strong>{item.category_name || "No category"}</strong>
                  <span>{item.branch_name || "No branch"}</span>
                </div>
                <div className="user-secondary-cell">
                  <strong>{formatProfileDate(item.purchase_date)}</strong>
                  <span>{item.purchase_year || "No year"}</span>
                </div>
                <div className="user-secondary-cell">
                  <strong>{formatCurrencyAmount(item.purchase_cost)}</strong>
                  <span>{item.location_details || "No location note"}</span>
                </div>
                <div className="user-secondary-cell">
                  <strong>{formatEquipmentSpecs(item) || "No specs"}</strong>
                  <span>{item.location_details || "No location note"}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="loading-text">No equipment matches this report right now.</p>
        );
      }

      const matchingAssignments = getAssignmentsForReportStatus(activeReport.status);

      return matchingAssignments.length > 0 ? (
        <div className="user-table workflow-report-table">
          <div className="user-table-head workflow-report-table-head">
            <span>Employee</span>
            <span>Asset</span>
            <span>Email / Branch</span>
            <span>Assigned</span>
            <span>Expected Return</span>
            <span>Receipt / Status</span>
          </div>
          {matchingAssignments.map((assignment) => (
            <div className="user-table-row workflow-report-table-row" key={`report-assignment-${assignment.id}`}>
              <div className="user-primary-cell">
                <strong>{assignment.employee_name}</strong>
                <span>{assignment.employee_job_title || "No job title"}</span>
              </div>
              <div className="user-secondary-cell">
                <strong>{assignment.asset_tag}</strong>
                <span>{assignment.equipment_name}</span>
              </div>
              <div className="user-secondary-cell">
                <strong>{assignment.employee_email || "No email"}</strong>
                <span>{assignment.branch_name || "No branch"}</span>
              </div>
              <div className="user-secondary-cell">
                <strong>{formatProfileDate(assignment.assigned_at)}</strong>
                <span>{assignment.assigned_by_name || "No assigner"}</span>
              </div>
              <div className="user-secondary-cell">
                <strong>{formatProfileDate(assignment.expected_return_date)}</strong>
                <span>{assignment.notes || "No assignment note"}</span>
              </div>
              <div className="user-secondary-cell">
                <strong>{assignment.receipt_status}</strong>
                <span className={`status-pill status-${assignment.status}`}>{assignment.status}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="loading-text">No assignments match this report right now.</p>
      );
    };

    return (
      <section className="dashboard-panel">
        <div className="panel-header">
          <div>
            <h3>Reports</h3>
            <p className="dashboard-subtitle">View weekly or monthly activity, compare statuses visually, and inspect report data in table form.</p>
          </div>
          <div className="panel-header-actions">
            <label className="export-format-select-label">
              <span className="sr-only">Export format</span>
              <select
                className="export-format-select"
                value={exportFormat}
                onChange={(event) => setExportFormat(event.target.value as ExportFormat)}
                aria-label="Choose export format"
              >
                {exportFormatOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button className="panel-link-button export-button" type="button" onClick={handleExportReports}>
              <Download size={16} />
              <span>Export Document</span>
            </button>
          </div>
        </div>
        <div className="report-control-bar">
          <div>
            <div className="filter-chip-row">
              {(["all", "weekly", "monthly"] as DateWindowFilter[]).map((windowKey) => (
                <button
                  key={windowKey}
                  type="button"
                  className={`filter-chip${reportDateWindow === windowKey ? " is-active" : ""}`}
                  onClick={() => setReportDateWindow(windowKey)}
                >
                  {normalizeReportDateLabel(windowKey)}
                </button>
              ))}
            </div>
            <div className="report-date-filter-row">
              <input
                className="table-search-input report-date-input"
                type="date"
                value={reportSpecificDate}
                max={todayDateValue}
                onChange={(event) => setReportSpecificDate(event.target.value)}
                aria-label="Filter reports by specific date"
              />
              {reportSpecificDate ? (
                <button className="secondary-btn compact-btn" type="button" onClick={() => setReportSpecificDate("")}>
                  Clear date
                </button>
              ) : null}
            </div>
          </div>
          <span className="report-window-label">Showing {normalizeReportDateLabel(reportDateWindow)} data</span>
        </div>
        <div className="report-chart-grid">
          <article className="report-chart-card">
            <div className="panel-header">
              <h3>Status Summary</h3>
              <span>{reportCards.reduce((sum, item) => sum + item.total, 0)} records</span>
            </div>
            <div className="report-bar-list">
              {reportCards.map((item) => (
                <div className="report-bar-row" key={`chart-${item.key}`}>
                  <div className="report-bar-meta">
                    <strong>{item.label}</strong>
                    <span>{item.total}</span>
                  </div>
                  <div className="report-bar-track">
                    <div className="report-bar-fill" style={{ width: `${(item.total / chartMaxValue) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </article>
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
              <p>{item.label}</p>
              <span className="metric-card-action">Open details</span>
            </button>
          ))}
        </div>
        <div className="report-bottom-grid">
          <section className="report-panel">
            <div className="panel-header">
              <h3>{activeReport ? `${activeReport.label} details` : "Report details"}</h3>
            </div>
            {renderReportDetails()}
          </section>
        </div>
      </section>
    );
  };

  const renderTimelineSection = () => (
    <>
      <section className="dashboard-panel">
        <div className="panel-header">
          <h3>Request Timeline</h3>
          <div className="panel-header-actions">
            <label className="export-format-select-label">
              <span className="sr-only">Export format</span>
              <select
                className="export-format-select"
                value={exportFormat}
                onChange={(event) => setExportFormat(event.target.value as ExportFormat)}
                aria-label="Choose export format"
              >
                {exportFormatOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button className="panel-link-button export-button" type="button" onClick={handleExportTimeline}>
              <Download size={16} />
              <span>Export Document</span>
            </button>
          </div>
        </div>
        <div className="filter-chip-row">
          {(["all", "pending", "approved", "rejected", "fulfilled"] as TimelineFilter[]).map((filter) => (
            <button
              key={filter}
              type="button"
              className={`filter-chip${timelineFilter === filter ? " is-active" : ""}`}
              onClick={() => setTimelineFilter(filter)}
            >
              {filter}
            </button>
          ))}
        </div>
        <div className="report-date-filter-row">
          <input
            className="table-search-input report-date-input"
            type="date"
            value={timelineSpecificDate}
            max={todayDateValue}
            onChange={(event) => setTimelineSpecificDate(event.target.value)}
            aria-label="Filter timeline by specific date"
          />
          {timelineSpecificDate ? (
            <button className="secondary-btn compact-btn" type="button" onClick={() => setTimelineSpecificDate("")}>
              Clear date
            </button>
          ) : null}
        </div>
        {renderRequestCards(timelineRequests, "view")}
      </section>
      {roleView === "employee" ? null : renderLifecyclePanel()}
    </>
  );

  const renderMyEquipmentSection = () => (
    <section className="dashboard-panel">
      <div className="panel-header">
        <h3>My Equipment</h3>
      </div>
      <div className="user-table workflow-assignment-table">
        <div className="user-table-head workflow-assignment-table-head">
          <span>Asset</span>
          <span>Status / Receipt</span>
          <span>Type / Specs</span>
          <span>Vendor / Warranty</span>
          <span>ML Prediction</span>
          <span>Notes</span>
          <span>Actions</span>
        </div>
        {employeeAssignments.length > 0 ? (
          employeeAssignments.map((assignment) => (
            <div className="user-table-row workflow-assignment-table-row" key={assignment.id}>
              <div className="user-primary-cell">
                <strong>{assignment.asset_tag}</strong>
                <span>{assignment.serial_number}</span>
              </div>
              <div className="user-secondary-cell">
                <strong>{assignment.equipment_name}</strong>
                <span>{getAssignmentStatusLabel(assignment)}</span>
                <span className={`status-pill status-${assignment.status === "returned" && isReplacementAssignment(assignment) ? "fulfilled" : assignment.receipt_status}`}>
                  {getAssignmentReceiptLabel(assignment)}
                </span>
              </div>
              <div className="user-secondary-cell">
                <strong>{assignment.category_name || "No category"}</strong>
                <span>{formatAssignmentEquipmentSpecs(assignment) || "No specs"}</span>
              </div>
              <div className="user-secondary-cell">
                <strong>{assignment.vendor_name || "No vendor"} / {assignment.model_name || "No model"}</strong>
                <span>Warranty: {formatProfileDate(assignment.warranty_end_date)}</span>
              </div>
              <div className="user-secondary-cell">
                {assignmentMlLoading[assignment.id] ? (
                  <>
                    <strong>Loading prediction...</strong>
                    <span>Checking replacement risk.</span>
                  </>
                ) : assignmentMlPredictions[assignment.id] ? (
                  <>
                    <strong>{Math.round((assignmentMlPredictions[assignment.id]?.probability || 0) * 100)}%</strong>
                    <span>{assignmentMlPredictions[assignment.id]?.recommendation || "Prediction ready"}</span>
                    <span>{assignmentMlPredictions[assignment.id]?.modelVersion || "Current model"}</span>
                  </>
                ) : (
                  <>
                    <strong>Unavailable</strong>
                    <span>Model prediction not loaded yet.</span>
                  </>
                )}
              </div>
              <div className="user-secondary-cell">
                <strong>{getReplacementAssignmentLabel(assignment) || currentUser.officeLocation || "No office location"}</strong>
                <span>{assignment.replacement_condition_status || currentUser.jobTitle || "No job title"}</span>
                {assignment.status === "returned" && isReplacementAssignment(assignment) ? (
                  <span>Replaced on: {formatProfileDate(assignment.replacement_processed_at || assignment.assigned_at)}</span>
                ) : assignment.received_confirmed_at ? (
                  <span>Received confirmed: {formatProfileDate(assignment.received_confirmed_at)}</span>
                ) : null}
              </div>
              <div className="table-action-group workflow-stock-table-actions">
                <button className="table-action" type="button" onClick={() => void openDetailPanel("assignment", assignment.id)}>
                  View details
                </button>
                <button className="table-action" type="button" onClick={() => void handlePreviewEquipmentQr(buildEquipmentRowFromAssignment(assignment), "my-equipment")}>
                  QR code
                </button>
                {assignment.status === "returned" && isReplacementAssignment(assignment) ? null : assignment.received_confirmed_at ? null : (
                  <div className="card-form-stack workflow-inline-form">
                  <textarea
                    value={receiptNotes[assignment.id] || ""}
                    onChange={(event) =>
                      setReceiptNotes((current) => ({
                        ...current,
                        [assignment.id]: event.target.value,
                      }))
                    }
                    placeholder="Optional receipt note, condition, or handover comment"
                  />
                  <button
                    className="primary-btn compact-btn"
                    type="button"
                    onClick={() => void handleConfirmReceipt(assignment.id)}
                    disabled={assignment.status !== "active"}
                  >
                    Confirm received
                  </button>
                  </div>
                )}
              </div>
            </div>
          ))
        ) : (
          <p className="loading-text">No equipment is assigned to this employee yet.</p>
        )}
      </div>
      <div className="qr-panel dashboard-qr-panel" id="equipment-qr-panel">
        <div className="panel-header">
          <h3>Equipment QR</h3>
        </div>
        {isEquipmentQrLoading ? (
          <p className="loading-text">Generating item QR code...</p>
        ) : equipmentQrError ? (
          <p className="error-text">{equipmentQrError}</p>
        ) : selectedQrEquipment && equipmentQrImageUrl ? (
          <div className="qr-card stacked-qr-card">
            <div className="qr-preview">
              <img src={equipmentQrImageUrl} alt={`${selectedQrEquipment.asset_tag} QR code`} />
            </div>
            <div className="qr-details">
              <p><strong>Company code:</strong> {selectedQrEquipment.asset_tag}</p>
              <p><strong>Serial number:</strong> {selectedQrEquipment.serial_number}</p>
              <p><strong>Equipment:</strong> {selectedQrEquipment.equipment_name}</p>
              <p><strong>Specs:</strong> {formatEquipmentSpecs(selectedQrEquipment) || "Not set"}</p>
              <button className="primary-btn qr-download-btn" type="button" onClick={handleDownloadEquipmentQr}>
                Download QR
              </button>
            </div>
          </div>
        ) : (
          <p className="loading-text">Select one of your assigned devices to preview its QR code.</p>
        )}
      </div>
    </section>
  );

  const renderItManagerReturnChecksSection = () => (
    (() => {
      const pageKey = "returns-final-approval";
      const pageSize = pageSizeByKey[pageKey] || DEFAULT_ITEMS_PER_PAGE;
      const totalPages = Math.max(Math.ceil(pendingFinalReturnApprovals.length / pageSize), 1);
      const currentPage = Math.min(returnPageByKey[pageKey] || 1, totalPages);
      const paginatedReturnReviews = paginateRows(pendingFinalReturnApprovals, currentPage, pageSize);

      return (
        <section className="dashboard-panel">
          <div className="panel-header">
            <h3>IT Director Final Return Approvals</h3>
            <span>{pendingFinalReturnApprovals.length} waiting for IT Director</span>
          </div>
          <p className="dashboard-subtitle">
            Review offboarding or returned devices already received by IT Support. Your approval works together with HR Director approval before the device goes back into the current IT store.
          </p>
          <div className="user-table workflow-return-table">
            <div className="user-table-head workflow-return-table-head">
              <span>Asset</span>
              <span>Employee</span>
              <span>Return Details</span>
              <span>Status</span>
              <span>Actions</span>
            </div>
            {pendingFinalReturnApprovals.length > 0 ? (
            paginatedReturnReviews.map((item) => {
            const form = finalReturnApprovalForm[item.id] ?? {
              decision: "approve" as const,
              note: "",
            };
            const isRejecting = form.decision === "reject";

            return (
              <div className="user-table-row workflow-return-table-row" key={item.id}>
                <div className="user-primary-cell">
                  <strong>{item.asset_tag}</strong>
                  <span>{item.equipment_name}</span>
                </div>
                <div className="user-secondary-cell">
                  <strong>{item.employee_name}</strong>
                  <span>{item.employee_email}</span>
                  <span>Requested: {formatProfileDate(item.requested_at)}</span>
                </div>
                <div className="user-secondary-cell">
                  <strong>{formatReturnReason(item.return_reason)}</strong>
                  <span>{item.request_note || "No employee return note added."}</span>
                  <span>IT Support receipt: {item.received_by_name || item.it_manager_name || "Not recorded"} / {formatProfileDate(item.returned_at || item.it_reviewed_at)}</span>
                  <span>{item.received_condition_comment || item.it_review_note || item.intake_note || "No IT Support note recorded."}</span>
                </div>
                <div className="user-secondary-cell">
                  <strong>Condition: {item.condition_status || "Not recorded"}</strong>
                  <span>Recommended stock status: {item.disposition || "Not recorded"}</span>
                  <span>HRD approval: {item.final_hrd_approval_status || "pending"} / ITD approval: {item.final_itd_approval_status || "pending"}</span>
                </div>
                <div className="workflow-table-actions">
                <div className="fulfillment-control-grid">
                  <label className="field">
                    <span>IT Director decision</span>
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
                    >
                      <option value="approve">Approve final stock return</option>
                      <option value="reject">Reject final stock return</option>
                    </select>
                  </label>
                </div>
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
                    placeholder={
                      isRejecting
                        ? "Explain why IT Director cannot approve this final stock return"
                        : "Optional compliance, stock, or security note"
                    }
                  />
                </label>
                <button
                  className={`primary-btn compact-btn ${isRejecting ? "btn-danger" : "btn-success"}`}
                  type="button"
                  onClick={() => void handleFinalReturnApproval(item.id)}
                >
                  {isRejecting ? "Reject final approval" : "Approve final return"}
                </button>
                </div>
              </div>
            );
              })
            ) : (
              <p className="loading-text">No returns are waiting for IT Director final approval right now.</p>
            )}
          </div>
          {renderPaginationBar(pageKey, pendingFinalReturnApprovals.length, currentPage, pageSize, (page) =>
            setReturnPageByKey((current) => ({
              ...current,
              [pageKey]: page,
            }))
          )}
        </section>
      );
    })()
  );

  const renderHrReturnsSection = () => {
    const relevantReturns = returns
      .filter((item) => item.return_reason === "leaving_job" || Boolean(item.return_attachment_name))
      .sort(
        (left, right) =>
          new Date(right.requested_at).getTime() - new Date(left.requested_at).getTime(),
      );

    return (
      <section className="dashboard-panel">
        <div className="panel-header">
          <h3>Return Attachments</h3>
          <span>{relevantReturns.length} returns with documents</span>
        </div>
        <p className="dashboard-subtitle">
          View documents attached during device returns. IT Support engineers are notified automatically when an employee submits a return.
        </p>
        <div className="user-table workflow-return-table">
          <div className="user-table-head workflow-return-table-head">
            <span>Asset</span>
            <span>Employee</span>
            <span>Return Details</span>
            <span>Document</span>
            <span>Status</span>
          </div>
          {relevantReturns.length > 0 ? (
            relevantReturns.map((item) => (
              <div className="user-table-row workflow-return-table-row" key={item.id}>
                <div className="user-primary-cell">
                  <strong>{item.asset_tag}</strong>
                  <span>{item.equipment_name}</span>
                </div>
                <div className="user-secondary-cell">
                  <strong>{item.employee_name}</strong>
                  <span>{item.employee_email}</span>
                  <span>Requested: {formatProfileDate(item.requested_at)}</span>
                </div>
                <div className="user-secondary-cell">
                  <strong>{formatReturnReason(item.return_reason)}</strong>
                  <span>{item.request_note || "No employee return note added."}</span>
                </div>
                <div className="user-secondary-cell">
                  {item.return_attachment_name ? (
                    <button
                      className="download-link button-reset"
                      type="button"
                      onClick={() => void handleDownloadReturnAttachment(item.id, item.return_attachment_name || `return-${item.id}-attachment`)}
                    >
                      <Download size={16} />
                      <span>{item.return_attachment_name}</span>
                    </button>
                  ) : (
                    <span className="field-hint">No attachment</span>
                  )}
                </div>
                <div className="user-secondary-cell">
                  <strong>{formatReturnStatus(item.return_status)}</strong>
                  <span>{item.it_manager_name ? `IT: ${item.it_manager_name}` : "IT review pending"}</span>
                </div>
              </div>
            ))
          ) : (
            <p className="loading-text">No return documents are available right now.</p>
          )}
        </div>
      </section>
    );
  };

  const renderReturnDocumentsSection = () => {
    if (currentUser?.role === "it-support") {
      return (
        <section className="dashboard-panel">
          <div className="panel-header">
            <h3>Access Denied</h3>
            <span>Restricted</span>
          </div>
          <p className="dashboard-subtitle">
            IT Support users do not have permission to view employee return documents submitted during leaving-job requests.
          </p>
        </section>
      );
    }

    const relevantReturns = returns
      .filter((item) => item.return_reason === "leaving_job" || Boolean(item.return_attachment_name))
      .sort(
        (left, right) =>
          new Date(right.requested_at).getTime() - new Date(left.requested_at).getTime(),
      );

    return (
      <section className="dashboard-panel">
        <div className="panel-header">
          <h3>Return Files</h3>
          <span>{relevantReturns.length} files</span>
        </div>
        <p className="dashboard-subtitle">
          Open every document employees attached during return requests, especially leaving-job returns.
        </p>
        <div className="user-table workflow-return-table">
          <div className="user-table-head workflow-return-table-head">
            <span>Asset</span>
            <span>Employee</span>
            <span>Return Details</span>
            <span>Attached File</span>
            <span>Status</span>
          </div>
          {relevantReturns.length > 0 ? (
            relevantReturns.map((item) => (
              <div className="user-table-row workflow-return-table-row" key={`return-document-${item.id}`}>
                <div className="user-primary-cell">
                  <strong>{item.asset_tag}</strong>
                  <span>{item.equipment_name}</span>
                </div>
                <div className="user-secondary-cell">
                  <strong>{item.employee_name}</strong>
                  <span>{item.employee_email}</span>
                  <span>Requested: {formatProfileDate(item.requested_at)}</span>
                </div>
                <div className="user-secondary-cell">
                  <strong>{formatReturnReason(item.return_reason)}</strong>
                  <span>{item.request_note || "No employee return note added."}</span>
                </div>
                <div className="user-secondary-cell">
                  {item.return_attachment_name ? (
                    <button
                      className="download-link button-reset"
                      type="button"
                      onClick={() => void handleDownloadReturnAttachment(item.id, item.return_attachment_name || `return-${item.id}-attachment`)}
                    >
                      <Download size={16} />
                      <span>{item.return_attachment_name}</span>
                    </button>
                  ) : (
                    <span className="field-hint">No attachment</span>
                  )}
                </div>
                <div className="user-secondary-cell">
                  <strong>{formatReturnStatus(item.return_status)}</strong>
                  <span>{item.it_manager_name ? `IT Support: ${item.it_manager_name}` : "IT Support review pending"}</span>
                </div>
              </div>
            ))
          ) : (
            <p className="loading-text">No return files are available right now.</p>
          )}
        </div>
      </section>
    );
  };

  const renderEmployeeAssignedDevicesSection = () => {
    const activeAssignments = assignments.filter((assignment) => assignment.status === "active");

    return (
      <section className="dashboard-panel">
        <div className="panel-header">
          <div>
            <h3>Assigned Items</h3>
            <p className="dashboard-subtitle">Track each employee with the assigned device, full specification, QR access, and ML replacement prediction.</p>
          </div>
          <span>{activeAssignments.length} active</span>
        </div>
        {activeAssignments.length > 0 ? (
          <div className="user-table workflow-assignment-table">
            <div className="user-table-head workflow-assignment-table-head">
              <span>Employee</span>
              <span>Assigned Item</span>
              <span>Specs</span>
              <span>Assignment</span>
              <span>Warranty / Health</span>
              <span>ML Prediction</span>
              <span>Actions</span>
            </div>
            {activeAssignments.map((assignment) => (
              <div className="user-table-row workflow-assignment-table-row" key={`employee-assignment-${assignment.id}`}>
                <div className="user-secondary-cell">
                  <strong>{assignment.employee_name}</strong>
                  <span>{assignment.employee_email}</span>
                  <span>{assignment.employee_job_title || "No job title"}</span>
                  <span>{assignment.employee_office_location || "No office location"}</span>
                </div>
                <div className="user-primary-cell">
                  <strong>{assignment.asset_tag}</strong>
                  <span>{assignment.equipment_name}</span>
                  <span>{assignment.category_name || "No category"}</span>
                  <span>{assignment.serial_number || "No serial number"}</span>
                </div>
                <div className="user-secondary-cell">
                  <strong>{assignment.model_name || assignment.vendor_name || "No model"}</strong>
                  <span>{formatAssignmentEquipmentSpecs(assignment) || "No device specs"}</span>
                  <span>{assignment.computer_name || "No computer name"}</span>
                </div>
                <div className="user-secondary-cell">
                  <strong>{formatProfileDate(assignment.assigned_at)}</strong>
                  <span>Return: {formatProfileDate(assignment.expected_return_date)}</span>
                  <span>{assignment.receipt_status === "received" ? "Employee received device" : "Pending employee receipt"}</span>
                </div>
                <div className="user-secondary-cell">
                  <strong>{assignment.warranty_end_date ? formatProfileDate(assignment.warranty_end_date) : "No warranty date"}</strong>
                  <span>Health: {assignment.device_health || "Not set"}</span>
                  <span>{getAssignmentDepreciationSummary(assignment)}</span>
                </div>
                <div className="user-secondary-cell">
                  {assignmentMlLoading[assignment.id] ? (
                    <>
                      <strong>Loading prediction...</strong>
                      <span>Checking the active ML model for this device.</span>
                    </>
                  ) : assignmentMlPredictions[assignment.id] ? (
                    <>
                      <strong>{Math.round((assignmentMlPredictions[assignment.id]?.probability || 0) * 100)}%</strong>
                      <span>{assignmentMlPredictions[assignment.id]?.recommendation || "Prediction available"}</span>
                      <span>{assignmentMlPredictions[assignment.id]?.modelVersion || "Current model"}</span>
                    </>
                  ) : (
                    <>
                      <strong>Unavailable</strong>
                      <span>Open details to inspect assignment history.</span>
                    </>
                  )}
                </div>
                <div className="table-action-group workflow-stock-table-actions">
                  <button className="table-action" type="button" onClick={() => void openDetailPanel("assignment", assignment.id)}>
                    View details
                  </button>
                  <button className="table-action" type="button" onClick={() => void handlePreviewEquipmentQr(buildEquipmentRowFromAssignment(assignment), activeSection)}>
                    QR code
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="loading-text">No active employee assignments are available.</p>
        )}
      </section>
    );
  };

  const renderStorekeeperReturnsSection = () => {
    const reviewPageKey = "returns-it-support-review";
    const reviewPageSize = pageSizeByKey[reviewPageKey] || DEFAULT_ITEMS_PER_PAGE;
    const reviewTotalPages = Math.max(Math.ceil(pendingItReturnReviews.length / reviewPageSize), 1);
    const reviewCurrentPage = Math.min(returnPageByKey[reviewPageKey] || 1, reviewTotalPages);
    const paginatedReturnReviews = paginateRows(pendingItReturnReviews, reviewCurrentPage, reviewPageSize);

    const intakePageKey = "returns-store-intake";
    const intakePageSize = pageSizeByKey[intakePageKey] || DEFAULT_ITEMS_PER_PAGE;
    const intakeTotalPages = Math.max(Math.ceil(pendingReturnIntake.length / intakePageSize), 1);
    const intakeCurrentPage = Math.min(returnPageByKey[intakePageKey] || 1, intakeTotalPages);
    const paginatedReturnIntake = paginateRows(pendingReturnIntake, intakeCurrentPage, intakePageSize);

    const maintenancePageKey = "returns-maintenance";
    const maintenancePageSize = pageSizeByKey[maintenancePageKey] || DEFAULT_ITEMS_PER_PAGE;
    const maintenanceTotalPages = Math.max(Math.ceil(openMaintenanceRecords.length / maintenancePageSize), 1);
    const maintenanceCurrentPage = Math.min(returnPageByKey[maintenancePageKey] || 1, maintenanceTotalPages);
    const paginatedMaintenanceRecords = paginateRows(openMaintenanceRecords, maintenanceCurrentPage, maintenancePageSize);

    return (
      <>
        <section className="dashboard-panel">
          <div className="panel-header">
            <h3>IT Support Receipt And Assessment</h3>
            <span>{pendingItReturnReviews.length} awaiting receipt</span>
          </div>
          <p className="dashboard-subtitle">
            Receive the device from the employee, assess the health, record accessories and detailed comments, then trigger final approval for offboarding or the next return step.
          </p>
          <div className="user-table workflow-return-table">
            <div className="user-table-head workflow-return-table-head">
              <span>Asset</span>
              <span>Employee</span>
              <span>Return Details</span>
              <span>HR Attachment</span>
              <span>Status</span>
              <span>Actions</span>
            </div>
            {pendingItReturnReviews.length > 0 ? (
              paginatedReturnReviews.map((item) => {
                const form = itReturnReviewForm[item.id] ?? {
                  conditionStatus: "good",
                  disposition: "available",
                  reviewNote: "",
                  action: "forward" as const,
                };
                const isRejecting = form.action === "reject";
                const isReturningToEmployee = form.action === "return_to_employee";

                return (
                  <div className="user-table-row workflow-return-table-row" key={item.id}>
                    <div className="user-primary-cell">
                      <strong>{item.asset_tag}</strong>
                      <span>{item.equipment_name}</span>
                    </div>
                    <div className="user-secondary-cell">
                      <strong>{item.employee_name}</strong>
                      <span>{item.employee_email}</span>
                      <span>Requested: {formatProfileDate(item.requested_at)}</span>
                    </div>
                    <div className="user-secondary-cell">
                      <strong>{formatReturnReason(item.return_reason)}</strong>
                      <span>{item.request_note || "No employee return note added."}</span>
                    </div>
                    <div className="user-secondary-cell">
                      {item.return_attachment_name ? (
                        <>
                          <strong>Attached by employee</strong>
                          <span>Visible to HR Recruitment only</span>
                          <span>{item.return_attachment_name}</span>
                        </>
                      ) : (
                        <span className="field-hint">No attachment</span>
                      )}
                    </div>
                    <div className="user-secondary-cell">
                      <strong>{form.conditionStatus}</strong>
                      <span>Disposition: {form.disposition}</span>
                      <span>{isRejecting ? "Return rejected" : isReturningToEmployee ? "Returning to employee" : "Review in progress"}</span>
                    </div>
                    <div className="workflow-table-actions">
                    <div className="fulfillment-control-grid">
                      <label className="field">
                        <span>Decision</span>
                        <select
                          value={form.action}
                          onChange={(event) =>
                            setItReturnReviewForm((current) => ({
                              ...current,
                              [item.id]: {
                                ...form,
                                action: event.target.value as "forward" | "return_to_employee" | "reject",
                              },
                            }))
                          }
                        >
                          <option value="forward">
                            {item.return_reason === "leaving_job" ? "Send for final approval" : "Send for next return step"}
                          </option>
                          <option value="return_to_employee">Return to employee</option>
                          <option value="reject">Reject return</option>
                        </select>
                      </label>
                      <label className="field">
                        <span>Device condition</span>
                        <select
                          value={form.conditionStatus}
                          onChange={(event) =>
                            setItReturnReviewForm((current) => ({
                              ...current,
                              [item.id]: {
                                ...form,
                                conditionStatus: event.target.value,
                              },
                            }))
                          }
                          disabled={isRejecting}
                        >
                          <option value="good">Good</option>
                          <option value="fair">Fair</option>
                          <option value="damaged">Damaged</option>
                          <option value="lost">Lost</option>
                        </select>
                      </label>
                      <label className="field">
                        <span>Store status after approval</span>
                        <select
                          value={form.disposition}
                          onChange={(event) =>
                            setItReturnReviewForm((current) => ({
                              ...current,
                              [item.id]: {
                                ...form,
                                disposition: event.target.value,
                              },
                            }))
                          }
                          disabled={isRejecting || isReturningToEmployee}
                        >
                          <option value="available">Back to stock</option>
                          <option value="maintenance">Needs maintenance</option>
                          <option value="retired">Wasted / destroyed / retire</option>
                          <option value="lost">Mark lost</option>
                        </select>
                      </label>
                    </div>
                    <label className="field">
                      <span>
                        {isRejecting
                          ? "Rejection reason"
                          : isReturningToEmployee
                            ? "Return-to-employee note"
                            : "IT Support receipt note, device status, and accessories"}
                      </span>
                      <textarea
                        value={form.reviewNote}
                        onChange={(event) =>
                          setItReturnReviewForm((current) => ({
                            ...current,
                            [item.id]: {
                              ...form,
                              reviewNote: event.target.value,
                            },
                          }))
                        }
                        placeholder={
                          isRejecting
                            ? "Explain why this return cannot continue"
                            : isReturningToEmployee
                              ? "Explain why the employee keeps the device"
                              : "Record health, missing or returned accessories, charger, bag, keyboard, mouse, and any observed condition details"
                        }
                      />
                    </label>
                    <button
                      className={`primary-btn compact-btn ${isRejecting ? "btn-danger" : isReturningToEmployee ? "btn-success" : "btn-warning"}`}
                      type="button"
                      onClick={() => void handleItReturnReview(item.id)}
                    >
                      {isRejecting ? "Reject return" : isReturningToEmployee ? "Return to employee" : item.return_reason === "leaving_job" ? "Acknowledge and send for final approval" : "Record assessment"}
                    </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="loading-text">No devices are waiting for IT Support receipt right now.</p>
            )}
          </div>
          {renderPaginationBar(reviewPageKey, pendingItReturnReviews.length, reviewCurrentPage, reviewPageSize, (page) =>
            setReturnPageByKey((current) => ({
              ...current,
              [reviewPageKey]: page,
            }))
          )}
        </section>

        <section className="dashboard-panel">
        <div className="panel-header">
          <h3>Legacy Return Intake</h3>
          <span>{pendingReturnIntake.length} pending</span>
        </div>
        <p className="dashboard-subtitle">
          Process older returns that still require legacy intake handling after an earlier IT check.
        </p>
        <div className="user-table workflow-return-table">
          <div className="user-table-head workflow-return-table-head">
            <span>Asset</span>
            <span>Employee</span>
            <span>Return Details</span>
            <span>Status</span>
            <span>Actions</span>
          </div>
          {pendingReturnIntake.length > 0 ? (
            paginatedReturnIntake.map((item) => {
            const form = returnProcessForm[item.id] ?? {
              conditionStatus: item.condition_status || "good",
              disposition: item.disposition || "available",
              intakeNote: "",
              action: "complete" as const,
            };
            const isRejecting = form.action === "reject";

            return (
              <div className="user-table-row workflow-return-table-row" key={item.id}>
                <div className="user-primary-cell">
                  <strong>{item.asset_tag}</strong>
                  <span>{item.equipment_name}</span>
                </div>
                <div className="user-secondary-cell">
                  <strong>{item.employee_name}</strong>
                  <span>{item.employee_email}</span>
                  <span>Requested: {formatProfileDate(item.requested_at)}</span>
                </div>
                <div className="user-secondary-cell">
                  <strong>{item.request_note || "No employee return note added."}</strong>
                  <span>IT checked by: {item.it_manager_name || "IT Manager"} / {formatProfileDate(item.it_reviewed_at)}</span>
                  <span>{item.it_review_note || "No IT review note added."}</span>
                </div>
                <div className="user-secondary-cell">
                  <strong>{item.condition_status || "No condition"}</strong>
                  <span>Recommendation: {item.disposition || "No recommendation"}</span>
                  <span>{isRejecting ? "Rejecting return" : "Ready for intake"}</span>
                </div>
                <div className="workflow-table-actions">
                <div className="fulfillment-control-grid">
                  <label className="field">
                    <span>Decision</span>
                    <select
                      value={form.action}
                      onChange={(event) =>
                        setReturnProcessForm((current) => ({
                          ...current,
                          [item.id]: {
                            ...form,
                            action: event.target.value as "complete" | "reject",
                          },
                        }))
                      }
                    >
                      <option value="complete">Accept return</option>
                      <option value="reject">Reject return</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Condition</span>
                    <select
                      value={form.conditionStatus}
                      onChange={(event) =>
                        setReturnProcessForm((current) => ({
                          ...current,
                          [item.id]: {
                            ...form,
                            conditionStatus: event.target.value,
                          },
                        }))
                      }
                      disabled={isRejecting}
                    >
                      <option value="good">Good</option>
                      <option value="fair">Fair</option>
                      <option value="damaged">Damaged</option>
                      <option value="lost">Lost</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>After intake</span>
                    <select
                      value={form.disposition}
                      onChange={(event) =>
                        setReturnProcessForm((current) => ({
                          ...current,
                          [item.id]: {
                            ...form,
                            disposition: event.target.value,
                          },
                        }))
                      }
                      disabled={isRejecting}
                    >
                      <option value="available">Back to stock</option>
                      <option value="maintenance">Send to maintenance</option>
                      <option value="retired">Retire / dispose</option>
                      <option value="lost">Mark lost</option>
                    </select>
                  </label>
                </div>
                <label className="field">
                  <span>{isRejecting ? "Rejection reason" : "IT support intake note"}</span>
                  <textarea
                    value={form.intakeNote}
                    onChange={(event) =>
                      setReturnProcessForm((current) => ({
                        ...current,
                        [item.id]: {
                          ...form,
                          intakeNote: event.target.value,
                        },
                      }))
                    }
                    placeholder={isRejecting ? "Explain why this return cannot be accepted" : "Record condition, accessories, or next action"}
                  />
                </label>
                <button
                  className={`primary-btn compact-btn ${isRejecting ? "btn-danger" : form.disposition === "lost" || form.disposition === "retired" ? "btn-warning" : "btn-success"}`}
                  type="button"
                  onClick={() => void handleProcessReturn(item.id)}
                >
                  {isRejecting ? "Reject return" : "Complete intake"}
                </button>
                </div>
              </div>
            );
            })
          ) : (
            <p className="loading-text">No return requests are waiting for store intake right now.</p>
          )}
        </div>
          {renderPaginationBar(intakePageKey, pendingReturnIntake.length, intakeCurrentPage, intakePageSize, (page) =>
            setReturnPageByKey((current) => ({
              ...current,
              [intakePageKey]: page,
            }))
          )}
        </section>

      <section className="dashboard-panel">
        <div className="panel-header">
          <h3>Maintenance Workflow</h3>
          <span>{openMaintenanceRecords.length} under repair</span>
        </div>
        <p className="dashboard-subtitle">
          Devices sent to maintenance by IT stay here until IT Support Engineer records whether they were repaired or not repairable.
        </p>
        <div className="user-table workflow-return-table">
          <div className="user-table-head workflow-return-table-head">
            <span>Asset</span>
            <span>Location</span>
            <span>Problem</span>
            <span>Status</span>
            <span>Actions</span>
          </div>
          {openMaintenanceRecords.length > 0 ? (
            paginatedMaintenanceRecords.map((record) => {
              const form = maintenanceCloseForm[record.id] ?? {
                maintenanceStatus: "repaired" as const,
                finalDisposition: "available",
                resolutionNote: "",
              };

              return (
                <div className="user-table-row workflow-return-table-row" key={`maintenance-${record.id}`}>
                  <div className="user-primary-cell">
                    <strong>{record.asset_tag}</strong>
                    <span>{record.equipment_name}</span>
                  </div>
                  <div className="user-secondary-cell">
                    <strong>{record.branch_name || "No branch"}</strong>
                    <span>Started: {formatProfileDate(record.started_at)}</span>
                  </div>
                  <div className="user-secondary-cell">
                    <strong>{record.problem_description || "No maintenance description."}</strong>
                    <span>Condition: {record.condition_status || "Not recorded"}</span>
                  </div>
                  <div className="user-secondary-cell">
                    <strong>{form.maintenanceStatus}</strong>
                    <span>Final stock status: {form.finalDisposition}</span>
                  </div>
                  <div className="workflow-table-actions">
                  <div className="fulfillment-control-grid">
                    <label className="field">
                      <span>Repair result</span>
                      <select
                        value={form.maintenanceStatus}
                        onChange={(event) =>
                          setMaintenanceCloseForm((current) => ({
                            ...current,
                            [record.id]: {
                              ...form,
                              maintenanceStatus: event.target.value as "repaired" | "not_repairable",
                              finalDisposition: event.target.value === "repaired" ? "available" : "retired",
                            },
                          }))
                        }
                      >
                        <option value="repaired">Repaired</option>
                        <option value="not_repairable">Not repairable</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>Final stock status</span>
                      <select
                        value={form.finalDisposition}
                        onChange={(event) =>
                          setMaintenanceCloseForm((current) => ({
                            ...current,
                            [record.id]: {
                              ...form,
                              finalDisposition: event.target.value,
                            },
                          }))
                        }
                      >
                        <option value="available">Back to stock</option>
                        <option value="retired">Wasted / destroyed / retire</option>
                        <option value="lost">Lost</option>
                        <option value="maintenance">Keep under maintenance</option>
                      </select>
                    </label>
                  </div>
                  <label className="field">
                    <span>Resolution note</span>
                    <textarea
                      value={form.resolutionNote}
                      onChange={(event) =>
                        setMaintenanceCloseForm((current) => ({
                          ...current,
                          [record.id]: {
                            ...form,
                            resolutionNote: event.target.value,
                          },
                        }))
                      }
                      placeholder="Repair result, parts replaced, or reason it is wasted/destroyed"
                    />
                  </label>
                  <button
                    className={`primary-btn compact-btn ${form.finalDisposition === "lost" || form.finalDisposition === "retired" ? "btn-warning" : "btn-success"}`}
                    type="button"
                    onClick={() => void handleCompleteMaintenance(record.id)}
                  >
                    Complete maintenance
                  </button>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="loading-text">No devices are currently under repair.</p>
          )}
        </div>
          {renderPaginationBar(maintenancePageKey, openMaintenanceRecords.length, maintenanceCurrentPage, maintenancePageSize, (page) =>
            setReturnPageByKey((current) => ({
              ...current,
              [maintenancePageKey]: page,
            }))
          )}
        </section>
      </>
    );
  };

  const renderEmployeeReturnRequestsSection = () => {
    const activeAssignments = employeeAssignments.filter((assignment) => assignment.status === "active");
    const requestReturnPageKey = "return-requests-active-assignments";
    const requestReturnPageSize = pageSizeByKey[requestReturnPageKey] || DEFAULT_ITEMS_PER_PAGE;
    const requestReturnTotalPages = Math.max(Math.ceil(activeAssignments.length / requestReturnPageSize), 1);
    const requestReturnCurrentPage = Math.min(returnPageByKey[requestReturnPageKey] || 1, requestReturnTotalPages);
    const paginatedActiveAssignments = paginateRows(activeAssignments, requestReturnCurrentPage, requestReturnPageSize);

    const historyPageKey = "return-requests-history";
    const historyPageSize = pageSizeByKey[historyPageKey] || DEFAULT_ITEMS_PER_PAGE;
    const historyTotalPages = Math.max(Math.ceil(employeeReturnRequests.length / historyPageSize), 1);
    const historyCurrentPage = Math.min(returnPageByKey[historyPageKey] || 1, historyTotalPages);
    const paginatedReturnHistory = paginateRows(employeeReturnRequests, historyCurrentPage, historyPageSize);

    return (
      <section className="dashboard-panel">
        <div className="panel-header">
          <h3>Return Requests</h3>
        </div>

        <div className="subpanel-header">
          <h4>Request Equipment Return</h4>
        </div>
        <div className="user-table workflow-return-table">
          <div className="user-table-head workflow-return-table-head">
            <span>Asset</span>
            <span>Assignment</span>
            <span>Return Type</span>
            <span>Return Note</span>
            <span>Actions</span>
          </div>
          {activeAssignments.length > 0 ? (
            paginatedActiveAssignments.map((assignment) => {
              const hasPendingReturn = employeeReturnRequests.some(
                (item) =>
                  item.assignment_id === assignment.id &&
                  ["it_review", "store_intake", "maintenance", "requested", "awaiting_final_approval"].includes(item.return_status),
              );
              const isLeavingJobReturn = (returnRequestReasons[assignment.id] || "standard") === "leaving_job";

              return (
                <div className="user-table-row workflow-return-table-row" key={assignment.id}>
                  <div className="user-primary-cell">
                    <strong>{assignment.asset_tag}</strong>
                    <span>{assignment.equipment_name}</span>
                  </div>
                  <div className="user-secondary-cell">
                    <strong>Assigned: {formatProfileDate(assignment.assigned_at)}</strong>
                    <span>Expected return: {formatProfileDate(assignment.expected_return_date)}</span>
                  </div>
                  <label className="field">
                    <span>Return type</span>
                    <select
                      value={returnRequestReasons[assignment.id] || "standard"}
                      onChange={(event) => {
                        const nextReason = event.target.value as "standard" | "leaving_job";
                        setReturnRequestReasons((current) => ({
                          ...current,
                          [assignment.id]: nextReason,
                        }));

                        if (nextReason === "standard") {
                          setReturnRequestAttachments((current) => {
                            const next = { ...current };
                            delete next[assignment.id];
                            return next;
                          });
                        }
                      }}
                      disabled={hasPendingReturn}
                    >
                      <option value="standard">Standard return</option>
                      <option value="leaving_job">Employee leaving job</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Return note</span>
                    <textarea
                      value={returnRequestNotes[assignment.id] || ""}
                      onChange={(event) =>
                        setReturnRequestNotes((current) => ({
                          ...current,
                          [assignment.id]: event.target.value,
                        }))
                      }
                      placeholder={
                        isLeavingJobReturn
                          ? "Add device condition, accessories handed over, and any missing items"
                          : "Add condition, reason, or handover note"
                      }
                      disabled={hasPendingReturn}
                    />
                  </label>
                  {isLeavingJobReturn ? (
                    <label className="field">
                      <span>Supporting document for HR recruitment (required)</span>
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx,.txt,image/*"
                        onChange={(event) => {
                          const file = event.target.files?.[0] ?? null;
                          void handleReturnRequestFileChange(assignment.id, file);
                        }}
                        disabled={hasPendingReturn}
                      />
                      {returnRequestAttachments[assignment.id]?.fileName ? (
                        <div className="field-note">
                          Selected file: {returnRequestAttachments[assignment.id].fileName}
                        </div>
                      ) : (
                        <div className="field-note">
                          Attach the reception letter or final letter. HR Recruitment will be able to view it during offboarding review.
                        </div>
                      )}
                    </label>
                  ) : null}
                  <div className="workflow-table-actions">
                    <button
                      className="primary-btn compact-btn"
                      type="button"
                      onClick={() => void handleRequestReturn(assignment.id)}
                      disabled={hasPendingReturn || (isLeavingJobReturn && !returnRequestAttachments[assignment.id])}
                    >
                      {hasPendingReturn ? "Return requested" : "Submit return request"}
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="loading-text">No active equipment is available to return right now.</p>
          )}
        </div>
        {renderPaginationBar(requestReturnPageKey, activeAssignments.length, requestReturnCurrentPage, requestReturnPageSize, (page) =>
          setReturnPageByKey((current) => ({
            ...current,
            [requestReturnPageKey]: page,
          }))
        )}

        <div className="subpanel-header">
          <h4>My Return History</h4>
        </div>
        <div className="user-table workflow-return-table">
          <div className="user-table-head workflow-return-table-head">
            <span>Asset</span>
            <span>Status</span>
            <span>Return Type</span>
            <span>Timeline</span>
            <span>Notes</span>
          </div>
          {employeeReturnRequests.length > 0 ? (
            paginatedReturnHistory.map((item) => (
              <div className="user-table-row workflow-return-table-row" key={item.id}>
                <div className="user-primary-cell">
                  <strong>{item.asset_tag}</strong>
                  <span>{item.equipment_name}</span>
                </div>
                <div className="user-secondary-cell">
                  <strong>{formatReturnStatus(item.return_status)}</strong>
                </div>
                <div className="user-secondary-cell">
                  <strong>{formatReturnReason(item.return_reason)}</strong>
                </div>
                <div className="user-secondary-cell">
                  <strong>Requested: {formatProfileDate(item.requested_at)}</strong>
                  {item.returned_at || item.it_reviewed_at ? <span>Processed: {formatProfileDate(item.returned_at || item.it_reviewed_at)}</span> : null}
                </div>
                <div className="user-secondary-cell">
                  <strong>{item.request_note || "No return note added."}</strong>
                  {item.it_review_note ? <span>IT note: {item.it_review_note}</span> : null}
                  {item.intake_note ? <span>Store note: {item.intake_note}</span> : null}
                </div>
              </div>
            ))
          ) : (
            <p className="loading-text">No return requests submitted yet.</p>
          )}
        </div>
        {renderPaginationBar(historyPageKey, employeeReturnRequests.length, historyCurrentPage, historyPageSize, (page) =>
          setReturnPageByKey((current) => ({
            ...current,
            [historyPageKey]: page,
          }))
        )}
      </section>
    );
  };

  const renderSettingsSection = () => <AccountSettingsPanel user={user} onUserUpdate={onUserUpdate} />;

  const renderSection = () => {
    if (activeSection === "overview") {
      return renderOverview();
    }

    if (
      activeSection === "approvals" ||
      activeSection === "fulfillment" ||
      activeSection === "new-request" ||
      activeSection === "move-orders" ||
      (roleView === "warehouse" && activeSection === "stock")
    ) {
      return renderActionSection();
    }

    if (activeSection === "assets" || activeSection === "employees" || activeSection === "equipment" || activeSection === "stock" || activeSection === "my-requests") {
      return renderSecondarySection();
    }

    if (activeSection === "my-equipment") {
      return renderMyEquipmentSection();
    }

    if (activeSection === "employee-assigned") {
      return renderEmployeeAssignedDevicesSection();
    }

    if (activeSection === "return-documents" && roleView === "it-support") {
      return (
        <section className="dashboard-panel">
          <div className="panel-header">
            <h3>Access denied</h3>
          </div>
          <p className="dashboard-subtitle">
            IT Support Engineers are not permitted to view employee return documents for leaving-job requests.
          </p>
        </section>
      );
    }

    if (activeSection === "return-requests") {
      return renderEmployeeReturnRequestsSection();
    }

    if (activeSection === "return-documents") {
      return renderReturnDocumentsSection();
    }

    if (activeSection === "returns") {
      if (roleView === "it-manager") {
        return renderItManagerReturnChecksSection();
      }
      if (roleView === "hr") {
        return renderHrReturnsSection();
      }
      return renderStorekeeperReturnsSection();
    }

    if (activeSection === "timeline") {
      return renderTimelineSection();
    }

    if (activeSection === "reports") {
      return renderReportsSection();
    }

    if (activeSection === "notifications") {
      return renderNotificationsSection();
    }

    if (activeSection === "settings") {
      return renderSettingsSection();
    }

    return renderOverview();
  };

  const renderDetailPanel = () =>
    selectedDetailPanel ? (
      <div className="dashboard-detail-overlay" role="presentation" onClick={closeDetailPanel}>
        <aside
          className="dashboard-detail-card"
          role="dialog"
          aria-modal="true"
          aria-label="Record details"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="dashboard-detail-head">
            <div>
              <p className="dashboard-detail-kicker">{selectedDetailPanel.type}</p>
              <h3>{selectedDetailPanel.title}</h3>
              <p>{selectedDetailPanel.subtitle}</p>
            </div>
            <button className="secondary-btn compact-btn" type="button" onClick={closeDetailPanel}>
              Close
            </button>
          </div>
          <div className="dashboard-detail-grid">
            {selectedDetailPanel.rows.map((row) => (
              <article className="dashboard-detail-item" key={`${selectedDetailPanel.type}-${row.label}`}>
                <small>{row.label}</small>
                <strong>{row.value}</strong>
              </article>
            ))}
          </div>
          {selectedDetailPanel.qrEquipment ? (
            <section className="dashboard-detail-qr-section">
              <div className="panel-header">
                <h4>Equipment QR</h4>
              </div>
              {isEquipmentQrLoading ? (
                <p className="loading-text">Generating item QR code...</p>
              ) : equipmentQrError ? (
                <p className="error-text">{equipmentQrError}</p>
              ) : selectedQrEquipment && equipmentQrImageUrl && selectedQrEquipment.id === selectedDetailPanel.qrEquipment.id ? (
                <div className={`qr-card stacked-qr-card${selectedQrAudience === "employee" ? " employee-qr-card" : ""}`}>
                  <div className="qr-preview">
                    <img src={equipmentQrImageUrl} alt={`${selectedQrEquipment.asset_tag} QR code`} />
                  </div>
                  <div className="qr-details">
                    <h4>{selectedQrEquipment.equipment_name}</h4>
                    <p><strong>Company code:</strong> {selectedQrEquipment.asset_tag}</p>
                    <p><strong>Serial number:</strong> {selectedQrEquipment.serial_number}</p>
                    <p><strong>Model:</strong> {selectedQrEquipment.model_name || "Not set"}</p>
                    <p><strong>Computer name:</strong> {selectedQrEquipment.computer_name || "Not set"}</p>
                    <p><strong>Specs:</strong> {formatEquipmentSpecs(selectedQrEquipment) || "Not set"}</p>
                    <p><strong>Warranty end:</strong> {formatQrDate(selectedQrEquipment.warranty_end_date)}</p>
                    <button className="primary-btn qr-download-btn" type="button" onClick={handleDownloadEquipmentQr}>
                      Download QR
                    </button>
                  </div>
                </div>
              ) : (
                <p className="loading-text">Preparing QR details...</p>
              )}
            </section>
          ) : null}
        </aside>
      </div>
    ) : null;

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
          {config.sidebarGroups.map((group) => (
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
                  const isExternal = link.external || link.href.startsWith("http");
                  const sectionId = isExternal ? "" : link.href.replace("#", "");
                  const isActive = !isExternal && activeSection === sectionId;

                  return isExternal ? (
                    <a
                      className={`sidebar-link ${isActive ? "is-active" : ""}`}
                      href={link.href}
                      target="_blank"
                      rel="noreferrer"
                      key={link.label}
                    >
                      <span className="sidebar-link-icon" aria-hidden="true">
                        <link.icon size={15} strokeWidth={2.2} />
                      </span>
                      <span className="sidebar-link-label">{link.label}</span>
                    </a>
                  ) : (
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
            <h1>{config.title}</h1>
          </div>
          <div className="dashboard-topbar-right">
            <button
              className="notification-icon-button"
              type="button"
              aria-label="Open notifications"
              onClick={() => setActiveSection("notifications")}
            >
              <Bell size={19} strokeWidth={2.4} />
              {unreadNotificationCount > 0 ? <span className="notification-count-badge">{unreadNotificationCount}</span> : null}
            </button>
            <UserMenu user={user} onOpenProfile={() => setActiveSection("settings")} onLogout={onLogout} />
          </div>
        </header>

        <main className="dashboard-content">
          <div className="dashboard-heading-row">
            <div>
              <h2>
                {activeSection
                  .split("-")
                  .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
                  .join(" ")}
              </h2>
              <p className="dashboard-subtitle">{config.subtitle}</p>
            </div>
            <div className="dashboard-heading-tools">
              <label className="dashboard-global-search" aria-label="Global dashboard search">
                <Search size={18} strokeWidth={2.2} />
                <input
                  type="search"
                  value={globalSearchTerm}
                  onChange={(event) => setGlobalSearchTerm(event.target.value)}
                  placeholder="Search assets, requests, employees, move orders..."
                />
              </label>
              <div className="dashboard-breadcrumb">
                <span>Home</span>
                <span>/</span>
                <span>{config.chipLabel}</span>
                <span>/</span>
                <span>
                  {activeSection
                    .split("-")
                    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
                    .join(" ")}
                </span>
              </div>
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
                setEquipmentQrError("");
              }}
            />
          ) : null}
          {renderSearchPanel()}
          <div className="section-view-shell">
            {isLoading ? (
              <DashboardWaveLoader
                title="Loading dashboard"
              />
            ) : null}
            {!isLoading ? (
              <>
                {renderSection()}
                {dashboardError && !hasDashboardRecords ? (
                  <section className="dashboard-panel">
                    <article className="empty-state-card">
                      <strong>Dashboard data could not be loaded.</strong>
                      <p>{dashboardError}</p>
                      <div className="card-action-row">
                        <button className="secondary-btn compact-btn" type="button" onClick={() => void loadDashboard()}>
                          Retry loading
                        </button>
                      </div>
                    </article>
                  </section>
                ) : null}
              </>
            ) : null}
          </div>
          {pendingSubmitState ? (
            <div className="dashboard-processing-overlay" role="presentation">
              <div className="dashboard-processing-panel">
                <DashboardWaveLoader
                  compact
                  title={pendingSubmitState.title}
                />
              </div>
            </div>
          ) : null}
        </main>

        <footer className="dashboard-footer">
          <p>Copyright 2026 Airtel IMS. All rights reserved.</p>
          <span>Version 1.0.0</span>
        </footer>
      </div>
      {renderDetailPanel()}
    </div>
  );
}

export default WorkflowRoleDashboard;
