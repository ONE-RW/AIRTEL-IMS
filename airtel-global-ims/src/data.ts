export const users = [
  "Admin",
  "Super_user",
  "Hr",
  "IT manager",
  "IT Support Engineer",
  "Branch manager",
  "Employees",
];

export const tables = [
  "Users",
  "Equipment",
  "Country",
  "Location",
  "Equipment_logs",
  "Roles",
  "Permission",
  "Branches",
  "Department",
  "Categories",
  "Stock",
  "Notifications",
  "Assignments",
  "Issues",
  "Requests",
  "Units",
  "Depreciations",
  "Maintenance",
  "Returns",
  "Transfer",
  "Stockout",
  "Stockin",
  "Vendors",
];

export const userRoleCards = [
  {
    name: "Admin",
    description: "Owns global configuration, users, roles, permissions, and reporting.",
  },
  {
    name: "Super_user",
    description: "Runs cross-country operations with elevated access to stock and assignments.",
  },
  {
    name: "Hr",
    description: "Verifies employees, departments, onboarding, exits, and request approvals.",
  },
  {
    name: "IT manager",
    description: "Controls equipment lifecycle, maintenance, depreciations, and issue resolution.",
  },
  {
    name: "IT Support Engineer",
    description: "Handles fulfillment, stock movement, returns intake, maintenance follow-up, and vendor-linked inventory.",
  },
  {
    name: "Branch manager",
    description: "Views branch performance, approvals, branch assets, and local notifications.",
  },
  {
    name: "Employees",
    description: "Request, receive, return, and track equipment assigned to them.",
  },
];

export const mysqlTables = [
  {
    table: "users",
    purpose: "Application users and employees who can access the platform.",
    keyFields: "role_id, department_id, branch_id, location_id, country_id",
  },
  {
    table: "equipment",
    purpose: "Master list of equipment items tracked across Airtel countries and branches.",
    keyFields: "category_id, unit_id, vendor_id, serial_number, purchase_cost",
  },
  {
    table: "country",
    purpose: "Countries where Airtel operates.",
    keyFields: "name, iso_code, currency_code",
  },
  {
    table: "location",
    purpose: "Physical office or storage locations.",
    keyFields: "country_id, branch_id, city, address",
  },
  {
    table: "equipment_logs",
    purpose: "Audit trail for assignment, maintenance, return, transfer, and stock movements.",
    keyFields: "equipment_id, action_type, actor_user_id, logged_at",
  },
  {
    table: "roles",
    purpose: "Role definitions mapped to permissions.",
    keyFields: "name, description",
  },
  {
    table: "permission",
    purpose: "Action-level privileges like create equipment or approve requests.",
    keyFields: "code, name, module_name",
  },
  {
    table: "branches",
    purpose: "Branch offices under each country.",
    keyFields: "country_id, branch_code, manager_user_id",
  },
  {
    table: "department",
    purpose: "Business departments such as HR, Finance, and IT.",
    keyFields: "branch_id, country_id, name",
  },
  {
    table: "categories",
    purpose: "Equipment categories like laptop, phone, modem, router, and desktop.",
    keyFields: "name, depreciation_rate",
  },
  {
    table: "stock",
    purpose: "Current stock quantities by item and location.",
    keyFields: "equipment_id, branch_id, location_id, quantity_available",
  },
  {
    table: "notifications",
    purpose: "In-app alerts for approvals, maintenance, stock thresholds, and returns.",
    keyFields: "user_id, title, status, created_at",
  },
  {
    table: "assignments",
    purpose: "Equipment issued to employees.",
    keyFields: "equipment_id, employee_user_id, assigned_by, assigned_at",
  },
  {
    table: "issues",
    purpose: "Reported equipment faults or service issues.",
    keyFields: "equipment_id, reported_by, issue_status, priority",
  },
  {
    table: "requests",
    purpose: "Employee equipment requests and approval workflow.",
    keyFields: "requester_id, category_id, approver_id, request_status",
  },
  {
    table: "units",
    purpose: "Measurement units for stock items and accessories.",
    keyFields: "name, symbol",
  },
  {
    table: "depreciations",
    purpose: "Asset depreciation records for finance and replacement planning.",
    keyFields: "equipment_id, depreciation_method, residual_value",
  },
  {
    table: "maintenance",
    purpose: "Maintenance schedules and service records.",
    keyFields: "equipment_id, vendor_id, scheduled_date, maintenance_status",
  },
  {
    table: "returns",
    purpose: "Returned assets and their condition.",
    keyFields: "assignment_id, equipment_id, received_by, condition_status",
  },
  {
    table: "transfer",
    purpose: "Equipment movements between branches or locations.",
    keyFields: "equipment_id, from_branch_id, to_branch_id, transfer_status",
  },
  {
    table: "stockout",
    purpose: "Outgoing stock transactions.",
    keyFields: "stock_id, quantity, issued_to_type, issued_at",
  },
  {
    table: "stockin",
    purpose: "Incoming stock transactions.",
    keyFields: "vendor_id, location_id, quantity, received_at",
  },
  {
    table: "vendors",
    purpose: "Suppliers and service providers.",
    keyFields: "name, country_id, phone, email",
  },
];

export const moduleSummary = [
  { name: "Global footprint", value: "Country, Branches, Location" },
  { name: "People model", value: "Users, Roles, Permission, Department" },
  { name: "Asset lifecycle", value: "Equipment, Assignments, Returns, Transfer" },
  { name: "Inventory flow", value: "Stock, Stockin, Stockout, Units, Vendors" },
  { name: "Operational support", value: "Requests, Issues, Maintenance, Notifications" },
  { name: "Financial tracking", value: "Depreciations, logs, audit history" },
];
