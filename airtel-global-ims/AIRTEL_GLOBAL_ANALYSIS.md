# Airtel Global IMS Analysis

## Updated Direction
This version follows the updated Airtel structure provided by the user and assumes:

- Airtel operates across multiple countries
- The frontend will use React.js
- The database will use MySQL
- The platform must support global, country, branch, and employee-level operations
- Device lifecycle must support onboarding, replacement, return, and theft/loss workflows with multi-step approvals
- Authentication must support LDAP or Airtel-provided SSO, plus two-factor authentication

## Approved Users

1. Admin
2. Super_user
3. Hr
4. IT manager
5. Storekeeper
6. Branch manager
7. Employees

## New Workflow Direction

The device process now needs a dedicated workflow beyond the generic branch approval flow. See [DEVICE_WORKFLOW_UPDATES.md](/c:/Users/ONE/Music/google/airtel-global-ims/DEVICE_WORKFLOW_UPDATES.md) for the recommended changes covering:

- New hire device provisioning
- Device replacement
- Device return for exiting employees
- Device theft or loss declaration
- Device bundle tracking for accessories
- HRMS employee context, grade-based allocation, and security sign-off
- LDAP or Airtel SSO integration with two-factor authentication

## Approved Tables

1. Users
2. Equipment
3. Country
4. Location
5. Equipment_logs
6. Roles
7. Permission
8. Branches
9. Department
10. Categories
11. Stock
12. Notifications
13. Assignments
14. Issues
15. Requests
16. Units
17. Depreciations
18. Maintenance
19. Returns
20. Transfer
21. Stockout
22. Stockin
23. Vendors

## Global Design Notes

### Country and Branch model
- `country` supports Airtel's multi-country operations.
- `branches` supports branch-level reporting and approvals.
- `location` supports precise office, warehouse, or store positions under a branch.

### User and permission model
- `users`, `roles`, and `permission` provide access control.
- `Admin` and `Super_user` can operate globally.
- `Branch manager` focuses on branch-level visibility and approvals.
- `Employees` can request and track assigned assets.
- The target operating model should additionally support HR recruitment officer, IT support engineer, IT security manager, IT infrastructure manager, HR director, and IT director responsibilities.

### Inventory and asset model
- `equipment` stores all fixed assets and controlled devices.
- `stock`, `stockin`, and `stockout` support inventory flow.
- `assignments`, `returns`, and `transfer` support the complete asset movement lifecycle.
- `equipment_logs` acts as the system audit trail.
- A tracked device may represent a bundle, not only a single hardware unit. Example: laptop plus bag, adapter, mouse, and dongle; or desktop plus CPU, monitor, and keyboard.
- Device matching should support employee grade and base device configuration rules.

### Operational and financial model
- `issues` and `maintenance` support support and repair workflows.
- `depreciations` supports financial tracking and replacement planning.
- `vendors` supports procurement and maintenance partners.
- Devices should default to a 4-year refresh or recycle lifecycle.

## Recommended Stack

- Frontend: React.js with Vite
- Backend: Node.js + Express
- Database: MySQL
- API style: REST

## Suggested Modules

- Authentication and authorization
- Global master data
- Asset registration
- Stock management
- Assignment and return management
- Transfer management
- Request and approval workflow
- Maintenance and issue tracking
- Notifications
- Reporting by country, branch, department, category, and status
