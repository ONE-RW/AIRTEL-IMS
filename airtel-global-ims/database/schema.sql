CREATE DATABASE IF NOT EXISTS airtel_global_ims;
USE airtel_global_ims;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS auth_providers;
DROP TABLE IF EXISTS loss_theft_reports;
DROP TABLE IF EXISTS security_handover_reviews;
DROP TABLE IF EXISTS device_bookings;
DROP TABLE IF EXISTS device_bundle_items;
DROP TABLE IF EXISTS device_configurations;
DROP TABLE IF EXISTS equipment_logs;
DROP TABLE IF EXISTS stockout;
DROP TABLE IF EXISTS stockin;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS depreciations;
DROP TABLE IF EXISTS maintenance;
DROP TABLE IF EXISTS issues;
DROP TABLE IF EXISTS transfer;
DROP TABLE IF EXISTS returns;
DROP TABLE IF EXISTS assignments;
DROP TABLE IF EXISTS requests;
DROP TABLE IF EXISTS stock;
DROP TABLE IF EXISTS equipment;
DROP TABLE IF EXISTS vendors;
DROP TABLE IF EXISTS units;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS org_units;
DROP TABLE IF EXISTS department;
DROP TABLE IF EXISTS location;
DROP TABLE IF EXISTS branches;
DROP TABLE IF EXISTS country;
DROP TABLE IF EXISTS permission;
DROP TABLE IF EXISTS roles;
DROP TABLE IF EXISTS system_settings;
DROP TABLE IF EXISTS backup_snapshots;
DROP TABLE IF EXISTS request_workflow_steps;
DROP TABLE IF EXISTS system_logs;
DROP TABLE IF EXISTS asset_lifecycle_events;
DROP TABLE IF EXISTS maintenance_records;
DROP TABLE IF EXISTS password_reset_tokens;
DROP TABLE IF EXISTS asset_lifecycle;
SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE roles (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL UNIQUE,
  description VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE permission (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  module_name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE country (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  iso_code VARCHAR(5) NOT NULL UNIQUE,
  currency_code VARCHAR(10),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE branches (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  country_id BIGINT NOT NULL,
  name VARCHAR(150) NOT NULL,
  branch_code VARCHAR(60) NOT NULL UNIQUE,
  manager_user_id BIGINT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_branches_country
    FOREIGN KEY (country_id) REFERENCES country(id)
);

CREATE TABLE location (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  country_id BIGINT NOT NULL,
  branch_id BIGINT NOT NULL,
  name VARCHAR(150) NOT NULL,
  city VARCHAR(100),
  address VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_location_country
    FOREIGN KEY (country_id) REFERENCES country(id),
  CONSTRAINT fk_location_branch
    FOREIGN KEY (branch_id) REFERENCES branches(id)
);

CREATE TABLE department (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  country_id BIGINT NOT NULL,
  branch_id BIGINT NOT NULL,
  name VARCHAR(120) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_department_country
    FOREIGN KEY (country_id) REFERENCES country(id),
  CONSTRAINT fk_department_branch
    FOREIGN KEY (branch_id) REFERENCES branches(id)
);

CREATE TABLE org_units (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE users (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  phone_number VARCHAR(20) NULL UNIQUE,
  profile_image_url LONGTEXT NULL,
  employee_code VARCHAR(80),
  password_hash VARCHAR(255) NOT NULL,
  role_id BIGINT NOT NULL,
  department_id BIGINT NULL,
  branch_id BIGINT NULL,
  location_id BIGINT NULL,
  country_id BIGINT NULL,
  unit_id BIGINT NULL,
  status ENUM('active', 'inactive', 'pending') DEFAULT 'active',
  job_title VARCHAR(120) NULL,
  employment_status VARCHAR(40) NULL,
  office_location VARCHAR(160) NULL,
  start_date DATE NULL,
  employee_grade VARCHAR(80) NULL,
  hrms_employee_id VARCHAR(120) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_role
    FOREIGN KEY (role_id) REFERENCES roles(id),
  CONSTRAINT fk_users_department
    FOREIGN KEY (department_id) REFERENCES department(id),
  CONSTRAINT fk_users_branch
    FOREIGN KEY (branch_id) REFERENCES branches(id),
  CONSTRAINT fk_users_location
    FOREIGN KEY (location_id) REFERENCES location(id),
  CONSTRAINT fk_users_country
    FOREIGN KEY (country_id) REFERENCES country(id),
  CONSTRAINT fk_users_unit
    FOREIGN KEY (unit_id) REFERENCES org_units(id)
);


ALTER TABLE branches
ADD CONSTRAINT fk_branches_manager
  FOREIGN KEY (manager_user_id) REFERENCES users(id);

CREATE TABLE categories (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL UNIQUE,
  depreciation_rate DECIMAL(10, 2) DEFAULT 0.00,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE units (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(60) NOT NULL UNIQUE,
  symbol VARCHAR(20) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE vendors (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  country_id BIGINT NULL,
  name VARCHAR(150) NOT NULL,
  contact_person VARCHAR(120),
  phone VARCHAR(50),
  email VARCHAR(150),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_vendors_country
    FOREIGN KEY (country_id) REFERENCES country(id)
);

CREATE TABLE equipment (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  asset_tag VARCHAR(100) NOT NULL UNIQUE,
  serial_number VARCHAR(120) NOT NULL UNIQUE,
  computer_name VARCHAR(150) NULL,
  equipment_name VARCHAR(150) NOT NULL,
  category_id BIGINT NOT NULL,
  unit_id BIGINT NULL,
  vendor_id BIGINT NULL,
  country_id BIGINT NOT NULL,
  branch_id BIGINT NOT NULL,
  location_id BIGINT NULL,
  vendor_name VARCHAR(150) NULL,
  model_name VARCHAR(150) NULL,
  status ENUM('available', 'assigned', 'reserved', 'maintenance', 'retired', 'lost') DEFAULT 'available',
  purchase_year INT NULL,
  purchase_date DATE,
  purchase_cost DECIMAL(15, 2) DEFAULT 0.00,
  location_details VARCHAR(180) NULL,
  device_health VARCHAR(80) NULL,
  warranty_end_date DATE,
  lifespan_years INT NOT NULL DEFAULT 4,
  equipment_specs JSON NULL,
  asset_type VARCHAR(80) NULL,
  base_configuration_name VARCHAR(120) NULL,
  base_configuration_grade VARCHAR(80) NULL,
  refresh_due_at DATE NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_equipment_category
    FOREIGN KEY (category_id) REFERENCES categories(id),
  CONSTRAINT fk_equipment_unit
    FOREIGN KEY (unit_id) REFERENCES units(id),
  CONSTRAINT fk_equipment_vendor
    FOREIGN KEY (vendor_id) REFERENCES vendors(id),
  CONSTRAINT fk_equipment_country
    FOREIGN KEY (country_id) REFERENCES country(id),
  CONSTRAINT fk_equipment_branch
    FOREIGN KEY (branch_id) REFERENCES branches(id),
  CONSTRAINT fk_equipment_location
    FOREIGN KEY (location_id) REFERENCES location(id)
);

CREATE TABLE stock (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  equipment_id BIGINT NOT NULL,
  branch_id BIGINT NOT NULL,
  location_id BIGINT NOT NULL,
  quantity_available INT NOT NULL DEFAULT 0,
  reorder_level INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_stock_equipment
    FOREIGN KEY (equipment_id) REFERENCES equipment(id),
  CONSTRAINT fk_stock_branch
    FOREIGN KEY (branch_id) REFERENCES branches(id),
  CONSTRAINT fk_stock_location
    FOREIGN KEY (location_id) REFERENCES location(id)
);

CREATE TABLE requests (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  requester_id BIGINT NOT NULL,
  category_id BIGINT NOT NULL,
  approver_id BIGINT NULL,
  request_status ENUM('pending', 'approved', 'rejected', 'fulfilled') DEFAULT 'pending',
  notes TEXT,
  fulfillment_status VARCHAR(40) NOT NULL DEFAULT 'ready',
  fulfillment_note TEXT NULL,
  fulfillment_updated_at TIMESTAMP NULL,
  clarification_status VARCHAR(20) NOT NULL DEFAULT 'none',
  clarification_note TEXT NULL,
  clarification_requested_by BIGINT NULL,
  clarification_requested_at TIMESTAMP NULL,
  clarification_target_user_id BIGINT NULL,
  clarification_target_role VARCHAR(100) NULL,
  request_type VARCHAR(40) NOT NULL DEFAULT 'standard',
  target_employee_user_id BIGINT NULL,
  source_request_id BIGINT NULL,
  source_equipment_id BIGINT NULL,
  replacement_disposition VARCHAR(40) NULL,
  replacement_condition_status VARCHAR(100) NULL,
  report_type VARCHAR(20) NULL,
  hrms_snapshot JSON NULL,
  booked_equipment_id BIGINT NULL,
  final_security_approval_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  final_security_approved_at TIMESTAMP NULL,
  final_security_approved_by BIGINT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_requests_requester
    FOREIGN KEY (requester_id) REFERENCES users(id),
  CONSTRAINT fk_requests_category
    FOREIGN KEY (category_id) REFERENCES categories(id),
  CONSTRAINT fk_requests_approver
    FOREIGN KEY (approver_id) REFERENCES users(id)
);

CREATE TABLE assignments (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  equipment_id BIGINT NOT NULL,
  employee_user_id BIGINT NOT NULL,
  assigned_by BIGINT NOT NULL,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expected_return_date DATE,
  status ENUM('active', 'returned', 'overdue') DEFAULT 'active',
  receipt_status VARCHAR(40) NOT NULL DEFAULT 'pending',
  received_confirmed_at TIMESTAMP NULL,
  receipt_note TEXT NULL,
  request_id BIGINT NULL,
  notes TEXT,
  CONSTRAINT fk_assignments_equipment
    FOREIGN KEY (equipment_id) REFERENCES equipment(id),
  CONSTRAINT fk_assignments_employee
    FOREIGN KEY (employee_user_id) REFERENCES users(id),
  CONSTRAINT fk_assignments_assigned_by
    FOREIGN KEY (assigned_by) REFERENCES users(id)
);

CREATE TABLE returns (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  assignment_id BIGINT NOT NULL,
  equipment_id BIGINT NOT NULL,
  received_by BIGINT NULL,
  condition_status VARCHAR(100) NULL,
  returned_at TIMESTAMP NULL DEFAULT NULL,
  notes TEXT,
  employee_user_id BIGINT NULL,
  requested_by BIGINT NULL,
  storekeeper_user_id BIGINT NULL,
  it_manager_user_id BIGINT NULL,
  return_reason VARCHAR(40) NULL,
  request_note TEXT NULL,
  it_review_note TEXT NULL,
  intake_note TEXT NULL,
  disposition VARCHAR(40) NULL,
  return_status ENUM('it_review', 'store_intake', 'awaiting_final_approval', 'maintenance', 'returned_to_employee', 'requested', 'completed', 'rejected') DEFAULT 'it_review',
  requested_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  it_reviewed_at TIMESTAMP NULL,
  processed_at TIMESTAMP NULL,
  received_condition_comment TEXT NULL,
  final_hrd_approval_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  final_hrd_approved_at TIMESTAMP NULL,
  final_hrd_approved_by BIGINT NULL,
  final_itd_approval_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  final_itd_approved_at TIMESTAMP NULL,
  final_itd_approved_by BIGINT NULL,
  CONSTRAINT fk_returns_assignment
    FOREIGN KEY (assignment_id) REFERENCES assignments(id),
  CONSTRAINT fk_returns_equipment
    FOREIGN KEY (equipment_id) REFERENCES equipment(id),
  CONSTRAINT fk_returns_received_by
    FOREIGN KEY (received_by) REFERENCES users(id)
);

CREATE TABLE transfer (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  equipment_id BIGINT NOT NULL,
  from_branch_id BIGINT NOT NULL,
  to_branch_id BIGINT NOT NULL,
  from_location_id BIGINT NULL,
  to_location_id BIGINT NULL,
  requested_by BIGINT NOT NULL,
  approved_by BIGINT NULL,
  transfer_status ENUM('pending', 'approved', 'completed', 'rejected') DEFAULT 'pending',
  transferred_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_transfer_equipment
    FOREIGN KEY (equipment_id) REFERENCES equipment(id),
  CONSTRAINT fk_transfer_from_branch
    FOREIGN KEY (from_branch_id) REFERENCES branches(id),
  CONSTRAINT fk_transfer_to_branch
    FOREIGN KEY (to_branch_id) REFERENCES branches(id),
  CONSTRAINT fk_transfer_from_location
    FOREIGN KEY (from_location_id) REFERENCES location(id),
  CONSTRAINT fk_transfer_to_location
    FOREIGN KEY (to_location_id) REFERENCES location(id),
  CONSTRAINT fk_transfer_requested_by
    FOREIGN KEY (requested_by) REFERENCES users(id),
  CONSTRAINT fk_transfer_approved_by
    FOREIGN KEY (approved_by) REFERENCES users(id)
);

CREATE TABLE issues (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  equipment_id BIGINT NOT NULL,
  reported_by BIGINT NOT NULL,
  issue_title VARCHAR(150) NOT NULL,
  issue_description TEXT,
  priority ENUM('low', 'medium', 'high', 'critical') DEFAULT 'medium',
  issue_status ENUM('open', 'in_progress', 'resolved', 'closed') DEFAULT 'open',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_issues_equipment
    FOREIGN KEY (equipment_id) REFERENCES equipment(id),
  CONSTRAINT fk_issues_reported_by
    FOREIGN KEY (reported_by) REFERENCES users(id)
);

CREATE TABLE maintenance (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  equipment_id BIGINT NOT NULL,
  vendor_id BIGINT NULL,
  scheduled_date DATE,
  completed_date DATE,
  maintenance_status ENUM('scheduled', 'ongoing', 'completed', 'cancelled') DEFAULT 'scheduled',
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_maintenance_equipment
    FOREIGN KEY (equipment_id) REFERENCES equipment(id),
  CONSTRAINT fk_maintenance_vendor
    FOREIGN KEY (vendor_id) REFERENCES vendors(id)
);

CREATE TABLE depreciations (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  equipment_id BIGINT NOT NULL,
  depreciation_method VARCHAR(100) NOT NULL,
  useful_life_years INT NOT NULL,
  residual_value DECIMAL(15, 2) DEFAULT 0.00,
  current_book_value DECIMAL(15, 2) DEFAULT 0.00,
  calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_depreciations_equipment
    FOREIGN KEY (equipment_id) REFERENCES equipment(id)
);

CREATE TABLE notifications (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  title VARCHAR(180) NOT NULL,
  message TEXT,
  status ENUM('unread', 'read') DEFAULT 'unread',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notifications_user
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE stockin (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  vendor_id BIGINT NULL,
  location_id BIGINT NOT NULL,
  equipment_id BIGINT NOT NULL,
  quantity INT NOT NULL,
  received_by BIGINT NOT NULL,
  received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  notes TEXT,
  CONSTRAINT fk_stockin_vendor
    FOREIGN KEY (vendor_id) REFERENCES vendors(id),
  CONSTRAINT fk_stockin_location
    FOREIGN KEY (location_id) REFERENCES location(id),
  CONSTRAINT fk_stockin_equipment
    FOREIGN KEY (equipment_id) REFERENCES equipment(id),
  CONSTRAINT fk_stockin_received_by
    FOREIGN KEY (received_by) REFERENCES users(id)
);

CREATE TABLE stockout (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  stock_id BIGINT NOT NULL,
  equipment_id BIGINT NOT NULL,
  quantity INT NOT NULL,
  issued_to_type VARCHAR(100),
  issued_by BIGINT NOT NULL,
  issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  notes TEXT,
  CONSTRAINT fk_stockout_stock
    FOREIGN KEY (stock_id) REFERENCES stock(id),
  CONSTRAINT fk_stockout_equipment
    FOREIGN KEY (equipment_id) REFERENCES equipment(id),
  CONSTRAINT fk_stockout_issued_by
    FOREIGN KEY (issued_by) REFERENCES users(id)
);

CREATE TABLE equipment_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  equipment_id BIGINT NOT NULL,
  action_type VARCHAR(100) NOT NULL,
  actor_user_id BIGINT NOT NULL,
  reference_table VARCHAR(100),
  reference_id BIGINT,
  remarks TEXT,
  logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_equipment_logs_equipment
    FOREIGN KEY (equipment_id) REFERENCES equipment(id),
  CONSTRAINT fk_equipment_logs_actor
    FOREIGN KEY (actor_user_id) REFERENCES users(id)
);

CREATE TABLE device_configurations (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  config_name VARCHAR(120) NOT NULL,
  employee_grade VARCHAR(80) NOT NULL,
  asset_type VARCHAR(80) NOT NULL,
  minimum_ram_gb INT NULL,
  minimum_storage_gb INT NULL,
  preferred_storage_type VARCHAR(40) NULL,
  cpu_family VARCHAR(120) NULL,
  os_version VARCHAR(120) NULL,
  is_executive_config TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE device_bundle_items (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  parent_equipment_id BIGINT NOT NULL,
  child_equipment_id BIGINT NOT NULL,
  item_role VARCHAR(80) NOT NULL,
  is_required TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_device_bundle_parent
    FOREIGN KEY (parent_equipment_id) REFERENCES equipment(id),
  CONSTRAINT fk_device_bundle_child
    FOREIGN KEY (child_equipment_id) REFERENCES equipment(id)
);

CREATE TABLE device_bookings (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  request_id BIGINT NOT NULL,
  booked_for_user_id BIGINT NOT NULL,
  booked_by_user_id BIGINT NOT NULL,
  equipment_id BIGINT NULL,
  booking_status ENUM('reserved', 'released', 'consumed', 'cancelled') DEFAULT 'reserved',
  booking_note TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_device_bookings_request
    FOREIGN KEY (request_id) REFERENCES requests(id),
  CONSTRAINT fk_device_bookings_user
    FOREIGN KEY (booked_for_user_id) REFERENCES users(id),
  CONSTRAINT fk_device_bookings_actor
    FOREIGN KEY (booked_by_user_id) REFERENCES users(id),
  CONSTRAINT fk_device_bookings_equipment
    FOREIGN KEY (equipment_id) REFERENCES equipment(id)
);

CREATE TABLE security_handover_reviews (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  request_id BIGINT NOT NULL,
  equipment_id BIGINT NULL,
  reviewed_by_user_id BIGINT NULL,
  review_status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
  review_note TEXT NULL,
  reviewed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_security_review_request
    FOREIGN KEY (request_id) REFERENCES requests(id),
  CONSTRAINT fk_security_review_equipment
    FOREIGN KEY (equipment_id) REFERENCES equipment(id),
  CONSTRAINT fk_security_review_actor
    FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id)
);

CREATE TABLE loss_theft_reports (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  equipment_id BIGINT NOT NULL,
  employee_user_id BIGINT NOT NULL,
  report_type ENUM('loss', 'theft') NOT NULL,
  incident_note TEXT NULL,
  declared_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_request_id BIGINT NULL,
  CONSTRAINT fk_loss_theft_equipment
    FOREIGN KEY (equipment_id) REFERENCES equipment(id),
  CONSTRAINT fk_loss_theft_employee
    FOREIGN KEY (employee_user_id) REFERENCES users(id),
  CONSTRAINT fk_loss_theft_request
    FOREIGN KEY (created_request_id) REFERENCES requests(id)
);

CREATE TABLE auth_providers (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  provider_name VARCHAR(80) NOT NULL,
  provider_type ENUM('local', 'ldap', 'sso') NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  config_json JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE system_settings (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  setting_key VARCHAR(100) NOT NULL UNIQUE,
  setting_value TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE backup_snapshots (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  label VARCHAR(150) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  snapshot_status VARCHAR(50) DEFAULT 'success',
  created_by_user_id BIGINT NULL,
  restored_by_user_id BIGINT NULL,
  restored_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_backups_creator
    FOREIGN KEY (created_by_user_id) REFERENCES users(id),
  CONSTRAINT fk_backups_restorer
    FOREIGN KEY (restored_by_user_id) REFERENCES users(id)
);

CREATE TABLE request_workflow_steps (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  request_id BIGINT NOT NULL,
  step_key VARCHAR(80) NOT NULL,
  step_label VARCHAR(120) NOT NULL,
  actor_role VARCHAR(100) NOT NULL,
  actor_user_id BIGINT NULL,
  action_status ENUM('pending', 'approved', 'rejected', 'fulfilled', 'returned') DEFAULT 'pending',
  action_note TEXT NULL,
  acted_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_request_workflow_request
    FOREIGN KEY (request_id) REFERENCES requests(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_request_workflow_actor
    FOREIGN KEY (actor_user_id) REFERENCES users(id)
);

CREATE TABLE system_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  actor_user_id BIGINT NULL,
  target_user_id BIGINT NULL,
  action_key VARCHAR(100) NOT NULL,
  action_label VARCHAR(255) NOT NULL,
  details TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_syslogs_actor
    FOREIGN KEY (actor_user_id) REFERENCES users(id),
  CONSTRAINT fk_syslogs_target
    FOREIGN KEY (target_user_id) REFERENCES users(id)
);

CREATE TABLE asset_lifecycle_events (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  equipment_id BIGINT NOT NULL,
  actor_user_id BIGINT NULL,
  event_type VARCHAR(80) NOT NULL,
  event_label VARCHAR(180) NOT NULL,
  event_note TEXT NULL,
  from_status VARCHAR(40) NULL,
  to_status VARCHAR(40) NULL,
  related_record_type VARCHAR(80) NULL,
  related_record_id BIGINT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_asset_lifecycle_equipment (equipment_id),
  INDEX idx_asset_lifecycle_actor (actor_user_id),
  INDEX idx_asset_lifecycle_created (created_at),
  CONSTRAINT fk_lifecycle_equipment
    FOREIGN KEY (equipment_id) REFERENCES equipment(id),
  CONSTRAINT fk_lifecycle_actor
    FOREIGN KEY (actor_user_id) REFERENCES users(id)
);

CREATE TABLE maintenance_records (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  equipment_id BIGINT NOT NULL,
  return_id BIGINT NULL,
  reported_by BIGINT NULL,
  assigned_to BIGINT NULL,
  maintenance_status ENUM('under_repair', 'repaired', 'not_repairable') DEFAULT 'under_repair',
  condition_status VARCHAR(40) NULL,
  problem_description TEXT NULL,
  resolution_note TEXT NULL,
  final_disposition VARCHAR(40) NULL,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  INDEX idx_maintenance_equipment (equipment_id),
  INDEX idx_maintenance_return (return_id),
  INDEX idx_maintenance_status (maintenance_status),
  CONSTRAINT fk_maint_rec_equipment
    FOREIGN KEY (equipment_id) REFERENCES equipment(id),
  CONSTRAINT fk_maint_rec_reporter
    FOREIGN KEY (reported_by) REFERENCES users(id),
  CONSTRAINT fk_maint_rec_assignee
    FOREIGN KEY (assigned_to) REFERENCES users(id)
);

CREATE TABLE password_reset_tokens (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  token VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_reset_user (user_id),
  INDEX idx_reset_token (token),
  CONSTRAINT fk_reset_user
    FOREIGN KEY (user_id) REFERENCES users(id)
);

INSERT INTO roles (name, description) VALUES
('admin', 'Global system administrator'),
('HR DIRECTOR', 'Human Resources Director'),
('IT Director', 'Information Technology Director'),
('IT Support engineer', 'IT Support Engineering'),
('IT security manager', 'IT Security Management'),
('HR Recruitment officer', 'HR Recruitment Operations'),
('Hr department', 'General HR Department User'),
('IT officer', 'IT Operations Officer'),
('IT infrastructure manager', 'IT Infrastructure Management'),
('employee', 'Standard employee user');
