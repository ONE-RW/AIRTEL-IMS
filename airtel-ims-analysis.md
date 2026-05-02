# Airtel Inventory Management System Analysis

## Source Summary
The PDF describes an offline, Windows-based Inventory Management System for tracking End User Equipment (EUE), especially:

- Laptops
- Desktops
- Phones

The system must track:

- Equipment details
- Current owner
- Receiving and return history
- Asset status over time
- Reports by date, department, equipment type, and equipment status

## Recommended User Roles

### 1. System Administrator
Responsible for user setup, role assignment, system configuration, and data maintenance.

Main permissions:

- Create and manage users
- Assign roles
- View all assets and transactions
- Edit master data
- Generate all reports

### 2. Inventory Officer
Responsible for registering equipment and maintaining stock records.

Main permissions:

- Add and update equipment records
- View ownership history
- View reports

### 3. Providing Officer
Responsible for issuing equipment to staff.

Main permissions:

- Assign equipment to an employee
- Record issue date
- Record asset status at issue time
- View provided assets

### 4. Receiving Officer
Responsible for receiving returned equipment.

Main permissions:

- Record returned equipment
- Capture return date
- Capture status at return time
- View return history

### 5. Department Manager
Responsible for departmental visibility and reporting.

Main permissions:

- View assets assigned to their department
- View department-based reports

### 6. Employee / Equipment Owner
Represents the end user who receives equipment.

Main permissions:

- View assigned equipment
- View own receipt and return history

## Core Business Entities

### Asset
Represents a laptop, desktop, or phone.

### Employee
Represents the equipment owner.

### Department
Represents the department where the employee belongs.

### User
Represents a person who logs into the system.

### Asset Assignment
Represents the event where equipment is issued to an employee.

### Asset Return
Represents the return event and the condition of the asset when returned.

### Asset Status
Represents the state of the asset over time.

## Recommended Database Tables

### 1. users
Stores login users and operational officers.

Suggested columns:

- id
- first_name
- last_name
- email
- username
- password_hash
- role_id
- department_id
- is_active
- created_at
- updated_at

### 2. roles
Stores system roles.

Suggested columns:

- id
- name
- description
- created_at

Sample values:

- admin
- inventory_officer
- providing_officer
- receiving_officer
- department_manager
- employee

### 3. departments
Stores departments for ownership and reporting.

Suggested columns:

- id
- name
- code
- created_at

### 4. employees
Stores equipment owners.

Suggested columns:

- id
- first_name
- last_name
- department_id
- email
- phone_number
- employee_number
- is_active
- created_at
- updated_at

### 5. equipment_types
Stores allowed equipment categories.

Suggested columns:

- id
- name
- description

Sample values:

- Laptop
- Desktop
- Phone

### 6. assets
Stores all equipment details from the PDF.

Suggested columns:

- id
- asset_tag
- equipment_type_id
- make
- model
- serial_number
- operating_system
- storage_capacity
- processor_type
- procurement_date
- current_status_id
- current_owner_employee_id
- created_by_user_id
- created_at
- updated_at

### 7. asset_statuses
Stores normalized asset statuses.

Suggested columns:

- id
- name
- description

Sample values:

- Available
- Assigned
- Returned
- Faulty
- Under Repair
- Retired

### 8. asset_assignments
Stores each issuance event.

Suggested columns:

- id
- asset_id
- employee_id
- provided_by_user_id
- received_by_employee_name
- assignment_date
- status_at_assignment_id
- notes
- created_at

### 9. asset_returns
Stores each return event.

Suggested columns:

- id
- assignment_id
- asset_id
- returned_by_employee_id
- received_by_user_id
- return_date
- status_at_return_id
- notes
- created_at

### 10. asset_status_history
Stores status changes over time for reporting.

Suggested columns:

- id
- asset_id
- status_id
- change_date
- changed_by_user_id
- reference_type
- reference_id
- notes

## Relationship Overview

- A `user` belongs to one `role`
- A `user` may belong to one `department`
- An `employee` belongs to one `department`
- An `asset` belongs to one `equipment_type`
- An `asset` has one current status
- An `asset` may have one current owner
- An `asset` can have many assignments
- An assignment can have zero or one return
- An `asset` can have many status history records

## Recommended Reports

### Date Report
Show asset ownership and status as of a selected date.

### Department Report
Show all assets assigned to a department with type and status.

### Equipment Type Report
Show all assets of a given type and their status at a selected time.

### Equipment Status Report
Show all assets in a selected status at a selected time.

## React.js Frontend Modules

Recommended React pages:

- Dashboard
- Assets
- Employees
- Departments
- Assign Equipment
- Return Equipment
- Reports
- Users
- Roles

Recommended React table views:

- Assets Table
- Employees Table
- Assignments Table
- Returns Table
- Users Table
- Departments Table
- Reports Table

## Recommended Build Direction

Since React.js is a frontend library, a practical architecture would be:

- React.js for the user interface
- SQLite or another local database for offline support
- Electron or Tauri if you want a desktop Windows application
- Node.js or a local embedded API if business logic needs a backend layer

If you want a pure React frontend first, we can start by building:

1. The page layout
2. The table column definitions
3. The forms for asset registration, assignment, and return
4. Mock data based on these entities
