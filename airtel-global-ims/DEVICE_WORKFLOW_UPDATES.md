# Device Workflow Updates

## Purpose

This document captures the recommended system updates based on the new device-management requirements shared by the user.

## Key Business Clarification

- A `device` is not always a single asset.
- A laptop device includes the laptop and related accessories such as bag, power adapter, mouse, and USB-C to VGA or HDMI dongle.
- A desktop device includes the CPU, screen, and keyboard.
- Device refresh or recycle should happen every 4 years.

## Recommended Role Updates

The current role model is too generic for the new approval chain. Add or map responsibilities for:

- `HR recruitment officer`: books a device for a new hire and starts HR-side booking actions.
- `IT support engineer`: validates stock, matches employee grade to base configuration, prepares devices, receives returns, and manages replacement execution.
- `IT security manager`: performs final security validation before handover and receives alerts on returned devices.
- `IT infrastructure manager`: receives return alerts after approved device return.
- `HRD`: approves new-hire and return workflows.
- `ITD`: approves new-hire and return workflows.
- `Employee`: receives, returns, or declares loss or theft.

If the platform keeps the existing simplified role list, map them as follows:

- `Hr` can temporarily cover `HR recruitment officer` and `HRD`.
- `IT manager` can temporarily cover `IT support engineer`, `IT security manager`, and `ITD`.
- This is acceptable only as a first phase. The final model should separate these duties for auditability.

## Workflow Updates

### A. New Hire

1. Device is delivered into IT stock after move-order approval from warehouse.
2. HR recruitment officer books a device for the new hire.
3. IT support engineer checks inventory and matches employee grade to available specifications.
4. The system may pull basic employee details from HRMS for grade and onboarding context.
5. If a suitable device is available, IT support engineer requests approval from ITD and HRD.
6. After ITD and HRD approval, IT support engineer prepares the device.
7. After customized image deployment, IT support engineer submits a handover validation request to IT security manager.
8. IT security manager validates security requirements and gives final handover approval.
9. New employee acknowledges receipt in the asset management system.
10. The device is automatically removed from current IT stock after receipt confirmation.

### B. Replacement

1. Employee submits a replacement request to HR.
2. HR consults IT to validate device health and replacement need.
3. If IT validates replacement, IT support engineer authorizes HR to book from existing IT stock.
4. The flow then continues from New Hire step 5 through step 10.
5. The replaced device is automatically returned to current IT stock.
6. If replacement is not justified, IT halts the process.

### C. Device Return

1. Employee returns the device to IT support engineer.
2. IT support engineer assesses device health and records detailed comments.
3. IT support engineer acknowledges receipt and submits final approval request to HRD and ITD.
4. Once HRD and ITD approve, the device is automatically saved in current IT stock.
5. The system alerts IT security manager and IT infrastructure manager.

### D. Device Theft or Loss

1. Employee declares loss or theft in the asset management system.
2. The device is automatically removed from current IT stock.
3. The system then starts the new-hire allocation flow from New Hire step 2 through step 10.

## Data Updates

### Device master data

The equipment model should explicitly support these device fields:

- `computer_name`
- `serial_number`
- `asset_tag`
- `os_version`
- `asset_type`
- `vendor`
- `model`
- `cpu`
- `ram_gb`
- `storage_type`
- `storage_capacity`
- `purchase_year`
- `location`
- `device_health`
- `employee_grade_match`
- `refresh_due_at`

Recommended defaults:

- Keep `lifespan_years` defaulted to `4`.
- Derive `refresh_due_at` from `purchase_date` plus `lifespan_years`.

### Device bundle tracking

The schema should support parent-child device composition so a single issued device can contain accessories.

Recommended new table:

```sql
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
```

Recommended `item_role` examples:

- `primary_device`
- `adapter`
- `bag`
- `mouse`
- `dongle`
- `monitor`
- `keyboard`

### HR and grade context

Recommended additions:

- Add `employee_grade` and optional `hrms_employee_id` to `users`.
- Add `base_configuration_name` and `base_configuration_grade` to `equipment` or to a separate `device_configurations` table.
- Keep a regularly updated base device configuration catalogue.

Recommended configuration table:

```sql
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
```

### Request and approval model

The current request flow should be extended to track request category and approval path.

Recommended updates:

- Add `request_type` to `requests` with values such as `new_hire`, `replacement`, `return`, `loss_theft`.
- Add `source_request_id` for replacement or loss/theft cases that originate from another device record or request.
- Add `final_security_approval_status` and `final_security_approved_at`.
- Add `hrms_snapshot` JSON for employee-grade data captured at request time.

Recommended support tables:

```sql
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
  equipment_id BIGINT NOT NULL,
  reviewed_by_user_id BIGINT NOT NULL,
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
```

### Return processing updates

The return flow should support:

- receipt acknowledgement by IT support engineer
- device health assessment and detailed comments
- HRD and ITD approvals before putting the device back into stock
- alerts to IT security manager and IT infrastructure manager

Recommended additions:

- Add `received_condition_comment` to `returns`.
- Add `final_hrd_approval_status`, `final_itd_approval_status`, and timestamps.
- Trigger notifications to security and infrastructure managers after final approval.

## Inventory Logic Updates

Recommended stock behavior:

- New hire handover acknowledgment removes device from current IT stock.
- Replacement booking reserves stock before approval completion.
- Approved return adds the device back into current IT stock.
- Loss or theft declaration removes device from current IT stock immediately.
- Replaced devices return automatically to IT stock.

## Authentication Updates

The authentication layer should support both enterprise integration and strong sign-in controls.

Recommended capability updates:

- Support `LDAP` integration for Microsoft environments.
- Support Airtel-provided `SSO`.
- Keep local authentication only as a fallback or admin-break-glass option.
- Enforce `two-factor authentication` for all privileged roles at minimum.

Recommended settings table additions:

- `auth_mode` with values like `local`, `ldap`, `sso`, `hybrid`
- `ldap_server_url`
- `ldap_base_dn`
- `ldap_bind_dn`
- `sso_issuer_url`
- `sso_client_id`
- `sso_audience`
- `mfa_required`

Recommended auth table:

```sql
CREATE TABLE auth_providers (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  provider_name VARCHAR(80) NOT NULL,
  provider_type ENUM('local', 'ldap', 'sso') NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  config_json JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## UI and Reporting Updates

Recommended dashboard changes:

- Show device type as `single asset` or `bundle`.
- Show employee grade and matched base configuration.
- Show security handover stage separately from IT preparation.
- Show loss and theft as distinct incident types.
- Show refresh-due devices nearing the 4-year lifecycle.
- Show return approval chain with HRD and ITD decision status.

## Suggested Implementation Order

1. Update the schema for workflow types, device booking, security review, and loss or theft reporting.
2. Split or remap workflow roles so approval duties are auditable.
3. Add device-bundle support for accessories.
4. Add HRMS employee-grade context and base configuration matching.
5. Extend login to configurable LDAP or SSO plus MFA.
6. Update dashboards and reports to show the new approval and stock states.
