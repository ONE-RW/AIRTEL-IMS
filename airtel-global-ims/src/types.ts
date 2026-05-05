export type LoggedInUser = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string | null;
  profileImageUrl: string | null;
  jobTitle?: string | null;
  employmentStatus?: string | null;
  officeLocation?: string | null;
  startDate?: string | null;
  mustChangePassword?: boolean;
  role: string;
  branchId: number | null;
  branchName: string | null;
  countryId: number | null;
  countryName: string | null;
  departmentId: number | null;
  unitId: number | null;
};

export type SummaryCard = {
  label: string;
  value: string;
  note: string;
};

export type AdminUser = {
  id: number;
  employee_code: string | null;
  job_title?: string | null;
  employment_status?: string | null;
  office_location?: string | null;
  start_date?: string | null;
  full_name: string;
  email: string;
  phone_number?: string | null;
  first_name?: string;
  last_name?: string;
  role_id?: number;
  role_name: string;
  country_id?: number | null;
  branch_id?: number | null;
  department_id?: number | null;
  status: string;
  created_at: string;
};

export type Role = {
  id: number;
  name: string;
  description: string | null;
};

export type Permission = {
  id: number;
  code: string;
  name: string;
  module_name: string;
};

export type Country = {
  id: number;
  name: string;
  iso_code: string;
  currency_code: string | null;
};

export type Branch = {
  id: number;
  name: string;
  branch_code: string;
  country_id: number;
  country_name: string;
};

export type Department = {
  id: number;
  name: string;
  country_id: number;
  branch_id: number;
  country_name: string;
  branch_name: string;
};

export type Lookups = {
  roles: Role[];
  permissions: Permission[];
  countries: Country[];
  branches: Branch[];
  departments: Department[];
};

export type QrUser = {
  id: number;
  fullName: string;
  email: string;
  employeeCode: string | null;
  role: string;
  status: string;
};

export type AuditLog = {
  id: number;
  actor_user_id: number | null;
  target_user_id: number | null;
  action_key: string;
  action_label: string;
  details: string | null;
  created_at: string;
  actor_name: string | null;
  actor_email: string | null;
  target_name: string | null;
  target_email: string | null;
};

export type AdminEquipmentReportRow = {
  id: number;
  asset_tag: string;
  equipment_name: string;
  status: string;
  category_name: string | null;
  branch_name: string | null;
  country_name: string | null;
  purchase_date: string | null;
  purchase_year: number | null;
  purchase_cost: number | null;
  lifespan_years: number | null;
  refresh_due_at: string | null;
};

export type AdminRequestReportRow = {
  id: number;
  requester_name: string;
  requester_email: string;
  category_name: string;
  request_status: string;
  branch_name: string | null;
  country_name: string | null;
  created_at: string;
};

export type AdminReports = {
  assetMetrics: {
    totalAssets: number;
    availableAssets: number;
    assignedAssets: number;
    maintenanceAssets: number;
    retiredAssets: number;
    lostAssets: number;
  };
  requestMetrics: {
    totalRequests: number;
    pendingRequests: number;
    approvedRequests: number;
    rejectedRequests: number;
    fulfilledRequests: number;
  };
  assignmentMetrics: {
    activeAssignments: number;
    returnedAssignments: number;
    overdueAssignments: number;
  };
  issueMetrics: {
    openIssues: number;
    highPriorityIssues: number;
  };
  recentAssets: AdminEquipmentReportRow[];
  recentRequests: AdminRequestReportRow[];
};

export type BackupSnapshot = {
  id: number;
  label: string;
  file_name: string;
  snapshot_status: string;
  created_by_user_id: number | null;
  restored_by_user_id: number | null;
  restored_at: string | null;
  created_at: string;
  created_by_name: string | null;
  restored_by_name: string | null;
};

export type AdminSystemControls = {
  approvalRoles: {
    branchManagerRole: string;
    hrRole: string;
    itRole: string;
    storekeeperRole: string;
  };
  alertThresholds: {
    lowStockThreshold: number;
    overdueAssignmentDays: number;
    highPriorityIssueThreshold: number;
  };
  backups: BackupSnapshot[];
};

export type DeviceMonitoringRecord = {
  equipmentId: number;
  assetTag: string;
  equipmentName: string;
  categoryName: string | null;
  computerName: string | null;
  branchName: string | null;
  status: string;
  deviceHealth: string | null;
  assignedTo: {
    employeeName: string;
    employeeEmail: string | null;
  } | null;
  agent: {
    hostname: string;
    operatingSystem: string | null;
    version: string | null;
    lastSeenAt: string | null;
  } | null;
  latestMetric: {
    id: number;
    cpuUsage: number;
    ramUsage: number;
    diskUsage: number;
    batteryHealth: number | null;
    batteryLevel: number | null;
    networkLatency: number | null;
    packetLoss: number | null;
    temperature: number | null;
    uptimeSeconds: number;
    recordedAt: string | null;
  } | null;
  recommendation: {
    label: string;
    confidenceScore: number | null;
    modelVersion: string | null;
    generatedAt: string | null;
  } | null;
};

export type DeviceMonitoringDetail = {
  equipmentId: number;
  assetTag: string;
  equipmentName: string;
  categoryName: string | null;
  computerName: string | null;
  branchName: string | null;
  status: string;
  deviceHealth: string | null;
  assignedTo: {
    employeeName: string;
    employeeEmail: string;
    assignedAt: string | null;
    officeLocation: string | null;
  } | null;
  agent: {
    hostname: string;
    operatingSystem: string | null;
    version: string | null;
    lastSeenAt: string | null;
  } | null;
  latestMetric: {
    cpuUsage: number;
    ramUsage: number;
    diskUsage: number;
    diskHealth: number | null;
    batteryHealth: number | null;
    batteryLevel: number | null;
    networkLatency: number | null;
    packetLoss: number | null;
    temperature: number | null;
    uptimeSeconds: number;
    workloadIntensity: number | null;
    errorCount: number;
    recordedAt: string | null;
  } | null;
  recentMetrics: Array<{
    id: number;
    cpuUsage: number;
    ramUsage: number;
    diskUsage: number;
    temperature: number | null;
    recordedAt: string | null;
  }>;
  recommendation: {
    label: string;
    confidenceScore: number | null;
    modelVersion: string | null;
    generatedAt: string | null;
  } | null;
  recentAlerts: Array<{
    alertType: string;
    severity: string;
    status: string;
    message: string;
    createdAt: string;
  }>;
  usageSummary: Array<{
    title: string;
    subtitle: string;
    meta: string;
  }>;
};

export type DeviceMonitoringOverview = {
  generatedAt: string;
  summary: {
    trackedAssets: number;
    activeAgents: number;
    onlineRecently: number;
    openAlerts: number;
  };
  deployment: {
    apiUrl: string;
    installDirectory: string;
    startupMode: string;
    smokeTestCommand: string;
    installExampleCommand: string;
  };
  records: DeviceMonitoringRecord[];
};
