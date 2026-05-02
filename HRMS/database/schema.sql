CREATE DATABASE IF NOT EXISTS airtel_hrms;
USE airtel_hrms;

CREATE TABLE IF NOT EXISTS hr_users (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  ims_user_id BIGINT NULL UNIQUE,
  first_name VARCHAR(40) NOT NULL,
  last_name VARCHAR(40) NOT NULL,
  email VARCHAR(180) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role_name VARCHAR(40) NOT NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS hr_employees (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  employee_code VARCHAR(40) NULL UNIQUE,
  hrms_employee_id VARCHAR(40) NULL UNIQUE,
  first_name VARCHAR(40) NOT NULL,
  last_name VARCHAR(40) NOT NULL,
  email VARCHAR(180) NOT NULL UNIQUE,
  phone_number VARCHAR(13) NULL,
  employee_grade VARCHAR(40) NULL,
  job_title VARCHAR(120) NULL,
  employment_status VARCHAR(80) NULL,
  office_location VARCHAR(180) NULL,
  start_date DATE NULL,
  department_id BIGINT NULL,
  department_name VARCHAR(40) NULL,
  ims_user_id BIGINT NULL,
  ims_account_status VARCHAR(40) NULL,
  status ENUM('active', 'inactive', 'pending') NOT NULL DEFAULT 'active',
  created_by_user_id BIGINT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_hr_employees_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES hr_users(id)
);

CREATE TABLE IF NOT EXISTS hrms_sessions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  session_id VARCHAR(64) NOT NULL UNIQUE,
  ims_user_id BIGINT NOT NULL,
  user_email VARCHAR(180) NOT NULL,
  role_name VARCHAR(40) NOT NULL,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  source VARCHAR(20) NOT NULL DEFAULT 'password',
  expires_at DATETIME NOT NULL,
  last_seen_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_hrms_sessions_user_email (user_email),
  INDEX idx_hrms_sessions_expires_at (expires_at)
);
