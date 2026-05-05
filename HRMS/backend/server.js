import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";
import net from "node:net";
import nodemailer from "nodemailer";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";
import { pool } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "airtel-global-ims", "backend", ".env"), override: false });

const app = express();
const port = Number(process.env.PORT || 4200);
const defaultHrEmail = process.env.DEFAULT_HR_EMAIL || "hr.recruitment@airtel.com";
const defaultHrPassword = process.env.DEFAULT_HR_PASSWORD || "Admin123!";
const defaultHrFirstName = process.env.DEFAULT_HR_FIRST_NAME || "HR";
const defaultHrLastName = process.env.DEFAULT_HR_LAST_NAME || "Recruitment";
const defaultHrRole = process.env.DEFAULT_HR_ROLE || "HR Recruitment officer";
const sessionSecret = process.env.HRMS_SESSION_SECRET || "hrms-local-session-secret";
const hrmsIdEncryptionSecret = process.env.HRMS_ID_ENCRYPTION_KEY || sessionSecret;
const sessionLifetimeMs = Number(process.env.HRMS_SESSION_TTL_MS || 1000 * 60 * 60 * 12);
const publicDir = path.join(__dirname, "..", "public");
const hrManagementRoles = new Set(["hr recruitment officer", "hr director"]);
const hrDashboardAccessRoles = new Set(["hr recruitment officer", "hr director"]);
const integrationApiKey = process.env.HRMS_API_KEY || "";
const integrationApiKeyHeader = process.env.HRMS_API_KEY_HEADER || "x-api-key";
const smtpFrom = process.env.SMTP_FROM || defaultHrEmail;
const isGmailSender = /@gmail\.com$/i.test(smtpFrom);
const smtpHost = process.env.SMTP_HOST || (isGmailSender ? "smtp.gmail.com" : "");
const smtpPort = Number(process.env.SMTP_PORT || (isGmailSender ? 465 : 587));
const smtpSecure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : isGmailSender;
const smtpUser = process.env.SMTP_USER || (isGmailSender ? smtpFrom : "");
const smtpPass = process.env.SMTP_PASS || "";
const mailPreviewRecipient = process.env.MAIL_PREVIEW_RECIPIENT || "";
const isSmtpConfigured = Boolean(smtpHost && smtpUser && smtpPass && smtpFrom);
const imsPool = mysql.createPool({
  host: process.env.IMS_DB_HOST || process.env.MYSQL_HOST || "localhost",
  port: Number(process.env.IMS_DB_PORT || process.env.MYSQL_PORT || 3306),
  user: process.env.IMS_DB_USER || process.env.MYSQL_USER || "root",
  password: process.env.IMS_DB_PASSWORD || process.env.MYSQL_PASSWORD || "",
  database: process.env.IMS_DB_NAME || process.env.MYSQL_DATABASE || "airtel_global_ims",
  waitForConnections: true,
  connectionLimit: Number(process.env.IMS_DB_CONNECTION_LIMIT || 10),
  queueLimit: 0,
});
const mailTransport = isSmtpConfigured
  ? nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    })
  : nodemailer.createTransport({
      jsonTransport: true,
    });

app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use(express.static(publicDir));

function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function generateTemporaryPassword(length = 12) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  return Array.from(crypto.randomBytes(length), (byte) => alphabet[byte % alphabet.length]).join("");
}

function normalizeOptionalText(value, maxLength = null) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  if (!normalized) {
    return null;
  }

  return maxLength ? normalized.slice(0, maxLength) : normalized;
}

function normalizeRequiredText(value, maxLength = null) {
  const normalized = normalizeOptionalText(value, maxLength);
  return normalized || "";
}

function normalizeEmployeeStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["active", "inactive", "pending"].includes(normalized) ? normalized : "active";
}

function normalizeError(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unexpected HRMS error.";
}

function normalizeRole(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizePositiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function extractTrailingNumber(value) {
  const match = String(value || "").match(/(\d+)\s*$/);
  if (!match) {
    return 0;
  }
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function generateSequentialIdentifier(columnName, prefix) {
  const [rows] = await pool.query(
    `
      SELECT ${columnName} AS identifier
      FROM hr_employees
      WHERE ${columnName} IS NOT NULL
        AND ${columnName} <> ''
      ORDER BY id DESC
      LIMIT 400
    `,
  );

  const highest = rows.reduce((max, row) => {
    const decrypted = decryptHrmsIdentifier(row.identifier) || row.identifier;
    return Math.max(max, extractTrailingNumber(decrypted));
  }, 0);
  return `${prefix}${String(highest + 1).padStart(5, "0")}`;
}

async function generateEmployeeIdentifiers() {
  const employeeCode = await generateSequentialIdentifier("employee_code", "EMP-");
  const hrmsEmployeeId = await generateSequentialIdentifier("hrms_employee_id", "HRMS-");
  return { employeeCode, hrmsEmployeeId };
}

function getHrmsIdEncryptionKey() {
  return crypto.createHash("sha256").update(String(hrmsIdEncryptionSecret)).digest();
}

function encryptHrmsIdentifier(value) {
  const normalized = normalizeOptionalText(value, 255);
  if (!normalized) {
    return null;
  }

  if (normalized.startsWith("enc:v1:")) {
    return normalized;
  }

  const key = getHrmsIdEncryptionKey();
  const iv = Buffer.alloc(16, 0); // deterministic to preserve uniqueness for existing indexed columns
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  const encrypted = Buffer.concat([cipher.update(normalized, "utf8"), cipher.final()]).toString("base64");
  return `enc:v1:${encrypted}`;
}

function decryptHrmsIdentifier(value) {
  const normalized = normalizeOptionalText(value, 255);
  if (!normalized) {
    return null;
  }

  if (!normalized.startsWith("enc:v1:")) {
    return normalized;
  }

  const payload = normalized.slice("enc:v1:".length);
  const key = getHrmsIdEncryptionKey();
  const iv = Buffer.alloc(16, 0);

  try {
    const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
    const decrypted = Buffer.concat([decipher.update(payload, "base64"), decipher.final()]).toString("utf8");
    return normalizeOptionalText(decrypted, 255);
  } catch {
    return null;
  }
}

function readEmployeeCode(row) {
  return decryptHrmsIdentifier(row?.employee_code) || null;
}

function readHrmsEmployeeId(row) {
  return decryptHrmsIdentifier(row?.hrms_employee_id) || null;
}

function normalizeEmployeeStatusForIms(value) {
  const normalized = normalizeEmployeeStatus(value);
  return ["active", "inactive", "pending"].includes(normalized) ? normalized : "active";
}

function canManageEmployeesInHrms(actorOrRoleName) {
  const roleName = typeof actorOrRoleName === "string" ? actorOrRoleName : actorOrRoleName?.role_name;
  return hrManagementRoles.has(normalizeRole(roleName));
}

function hasValidIntegrationApiKey(req) {
  if (!integrationApiKey) {
    return true;
  }

  return String(req.header(integrationApiKeyHeader) || "").trim() === integrationApiKey;
}

function canReadForImsIntegration(actor) {
  return Boolean(actor && actor.status === "active");
}

function canAccessHrmsDashboard(actor) {
  return Boolean(actor && actor.status === "active" && hrDashboardAccessRoles.has(normalizeRole(actor.role_name)));
}

async function sendAccountCreatedEmail({ email, firstName, lastName, password }) {
  const fullName = `${firstName} ${lastName}`.trim();
  const mail = await mailTransport.sendMail({
    from: smtpFrom,
    to: isSmtpConfigured ? email : mailPreviewRecipient || smtpFrom,
    subject: "Your Airtel IMS account has been created",
    text: [
      `Hello ${fullName},`,
      "",
      "Your Airtel IMS account has been created successfully.",
      `Login email: ${email}`,
      `Temporary password: ${password}`,
      "",
      "Please sign in and change your password during your first login.",
    ].join("\n"),
    html: `
      <div style="font-family: Trebuchet MS, Segoe UI, sans-serif; color: #111111; line-height: 1.6;">
        <h2 style="color: #b9161c; margin-bottom: 12px;">Welcome to Airtel IMS</h2>
        <p>Hello ${fullName || "team member"},</p>
        <p>Your Airtel IMS account has been created successfully.</p>
        <p><strong>Login email:</strong> ${email}</p>
        <p><strong>Temporary password:</strong> ${password}</p>
        <p>Please sign in and change your password during your first login.</p>
      </div>
    `,
  });

  if (!isSmtpConfigured) {
    console.log("HRMS account creation email preview:", mail.message?.toString?.() || mail.messageId);
  }

  return {
    sent: isSmtpConfigured,
    configurationHint: isSmtpConfigured
      ? ""
      : isGmailSender
        ? "Set SMTP_PASS in HRMS or IMS backend .env to your Gmail App Password to enable real email delivery."
        : "Set SMTP_HOST, SMTP_USER, SMTP_PASS, and SMTP_FROM in HRMS or IMS backend .env to enable real email delivery.",
  };
}

function base64UrlEncode(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signSessionPayload(payloadEncoded) {
  return crypto.createHmac("sha256", sessionSecret).update(payloadEncoded).digest("base64url");
}

function createSessionToken(user) {
  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role_name,
    sid: crypto.randomBytes(16).toString("hex"),
    exp: Date.now() + sessionLifetimeMs,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signSessionPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function hashSessionToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function readBearerToken(req) {
  const authorization = String(req.header("authorization") || "").trim();

  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return "";
  }

  return authorization.slice(7).trim();
}

function verifySessionToken(token) {
  if (!token || !token.includes(".")) {
    return null;
  }

  const [encodedPayload, receivedSignature] = token.split(".");
  const expectedSignature = signSessionPayload(encodedPayload);

  if (!receivedSignature) {
    return null;
  }

  const receivedBuffer = Buffer.from(receivedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (receivedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(receivedBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload));

    if (!payload?.email || !payload?.exp || payload.exp < Date.now()) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

async function persistHrmsSession(token, user, source = "password") {
  const payload = verifySessionToken(token);

  if (!payload?.sid || !user?.email) {
    throw new Error("Unable to create HRMS session.");
  }

  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Number(payload.exp));

  await pool.query(
    `
      INSERT INTO hrms_sessions (
        session_id,
        ims_user_id,
        user_email,
        role_name,
        token_hash,
        source,
        expires_at,
        last_seen_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
    `,
    [
      payload.sid,
      Number(user.id),
      normalizeRequiredText(user.email, 180),
      normalizeRequiredText(user.role_name || user.role, 40),
      tokenHash,
      normalizeRequiredText(source, 20),
      expiresAt,
    ],
  );

  return payload;
}

async function getActiveHrmsSession(token) {
  const payload = verifySessionToken(token);

  if (!payload?.sid) {
    return null;
  }

  const tokenHash = hashSessionToken(token);
  const [rows] = await pool.query(
    `
      SELECT *
      FROM hrms_sessions
      WHERE session_id = ?
        AND token_hash = ?
        AND revoked_at IS NULL
        AND expires_at > NOW()
      LIMIT 1
    `,
    [payload.sid, tokenHash],
  );

  if (!rows.length) {
    return null;
  }

  await pool.query(
    "UPDATE hrms_sessions SET last_seen_at = NOW() WHERE id = ?",
    [rows[0].id],
  );

  return {
    payload,
    record: rows[0],
  };
}

async function revokeHrmsSession(token) {
  const payload = verifySessionToken(token);

  if (!payload?.sid) {
    return;
  }

  await pool.query(
    `
      UPDATE hrms_sessions
      SET revoked_at = NOW()
      WHERE session_id = ?
        AND token_hash = ?
        AND revoked_at IS NULL
    `,
    [payload.sid, hashSessionToken(token)],
  );
}

async function ensureSchema() {
  await pool.query(`
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
    )
  `);

  await pool.query(`
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
      ims_role_id BIGINT NULL,
      ims_role_name VARCHAR(120) NULL,
      status ENUM('active', 'inactive', 'pending') NOT NULL DEFAULT 'active',
      created_by_user_id BIGINT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_hr_employees_created_by
        FOREIGN KEY (created_by_user_id) REFERENCES hr_users(id)
    )
  `);

  await pool.query(`
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
    )
  `);

  await pool.query("ALTER TABLE hr_employees DROP COLUMN IF EXISTS branch_id");
  await pool.query("ALTER TABLE hr_employees DROP COLUMN IF EXISTS branch_name");
  await pool.query("ALTER TABLE hr_employees DROP COLUMN IF EXISTS country_id");
  await pool.query("ALTER TABLE hr_employees DROP COLUMN IF EXISTS country_name");
  await pool.query("ALTER TABLE hr_users MODIFY COLUMN first_name VARCHAR(40) NOT NULL");
  await pool.query("ALTER TABLE hr_users MODIFY COLUMN last_name VARCHAR(40) NOT NULL");
  await pool.query("ALTER TABLE hr_users MODIFY COLUMN email VARCHAR(180) NOT NULL");
  await pool.query("ALTER TABLE hr_users MODIFY COLUMN role_name VARCHAR(40) NOT NULL");
  await pool.query("ALTER TABLE hr_users ADD COLUMN IF NOT EXISTS ims_user_id BIGINT NULL UNIQUE AFTER id");
  await pool.query("ALTER TABLE hr_employees MODIFY COLUMN employee_code VARCHAR(255) NULL");
  await pool.query("ALTER TABLE hr_employees MODIFY COLUMN hrms_employee_id VARCHAR(255) NULL");
  await pool.query("ALTER TABLE hr_employees MODIFY COLUMN first_name VARCHAR(40) NOT NULL");
  await pool.query("ALTER TABLE hr_employees MODIFY COLUMN last_name VARCHAR(40) NOT NULL");
  await pool.query("ALTER TABLE hr_employees MODIFY COLUMN email VARCHAR(180) NOT NULL");
  await pool.query("ALTER TABLE hr_employees MODIFY COLUMN phone_number VARCHAR(13) NULL");
  await pool.query("ALTER TABLE hr_employees MODIFY COLUMN employee_grade VARCHAR(40) NULL");
  await pool.query("ALTER TABLE hr_employees MODIFY COLUMN department_name VARCHAR(40) NULL");
  await pool.query("ALTER TABLE hrms_sessions MODIFY COLUMN user_email VARCHAR(180) NOT NULL");
  await pool.query("ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS ims_role_id BIGINT NULL AFTER ims_account_status");
  await pool.query("ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS ims_role_name VARCHAR(120) NULL AFTER ims_role_id");
  await pool.query("DELETE FROM hrms_sessions WHERE expires_at <= NOW() OR revoked_at IS NOT NULL");

  await pool.query(
    `
      INSERT INTO hr_users (
        first_name,
        last_name,
        email,
        password_hash,
        role_name,
        status
      )
      VALUES (?, ?, ?, ?, ?, 'active')
      ON DUPLICATE KEY UPDATE
        first_name = VALUES(first_name),
        last_name = VALUES(last_name),
        role_name = VALUES(role_name)
    `,
    [
      normalizeRequiredText(defaultHrFirstName, 40),
      normalizeRequiredText(defaultHrLastName, 40),
      defaultHrEmail,
      hashPassword(defaultHrPassword),
      normalizeRequiredText(defaultHrRole, 40),
    ],
  );

  const [employeeRows] = await pool.query(
    `
      SELECT id, employee_code, hrms_employee_id
      FROM hr_employees
      WHERE (employee_code IS NOT NULL AND employee_code <> '')
         OR (hrms_employee_id IS NOT NULL AND hrms_employee_id <> '')
    `,
  );

  for (const row of employeeRows) {
    const encryptedEmployeeCode = row.employee_code ? encryptHrmsIdentifier(row.employee_code) : null;
    const encryptedHrmsEmployeeId = row.hrms_employee_id ? encryptHrmsIdentifier(row.hrms_employee_id) : null;

    if (encryptedEmployeeCode !== row.employee_code || encryptedHrmsEmployeeId !== row.hrms_employee_id) {
      await pool.query(
        `
          UPDATE hr_employees
          SET employee_code = ?, hrms_employee_id = ?
          WHERE id = ?
        `,
        [encryptedEmployeeCode, encryptedHrmsEmployeeId, Number(row.id)],
      );
    }
  }

}

async function getHrUserByEmail(email) {
  const [rows] = await pool.query(
    `
      SELECT
        id,
        first_name,
        last_name,
        email,
        role_name,
        status,
        password_hash
      FROM hr_users
      WHERE LOWER(email) = LOWER(?)
      LIMIT 1
    `,
    [email],
  );

  return rows[0] ?? null;
}

async function getHrShadowUserByImsUserId(imsUserId) {
  if (!imsUserId) {
    return null;
  }

  const [rows] = await pool.query(
    `
      SELECT
        id,
        ims_user_id,
        first_name,
        last_name,
        email,
        role_name,
        status,
        password_hash
      FROM hr_users
      WHERE ims_user_id = ?
      LIMIT 1
    `,
    [Number(imsUserId)],
  );

  return rows[0] ?? null;
}

async function getImsUserByIdentifier(identifier) {
  const normalizedIdentifier = String(identifier || "").trim();

  if (!normalizedIdentifier) {
    return null;
  }

  const [rows] = await imsPool.query(
    `
      SELECT
        u.id,
        u.first_name,
        u.last_name,
        u.email,
        u.phone_number,
        u.password_hash,
        u.status,
        u.role_id,
        u.must_change_password,
        u.job_title,
        u.employment_status,
        u.office_location,
        u.start_date,
        u.employee_grade,
        u.hrms_employee_id,
        u.department_id,
        r.name AS role_name,
        d.name AS department_name
      FROM users u
      INNER JOIN roles r ON r.id = u.role_id
      LEFT JOIN department d ON d.id = u.department_id
      WHERE LOWER(u.email) = LOWER(?) OR u.phone_number = ?
      LIMIT 1
    `,
    [normalizedIdentifier, normalizedIdentifier],
  );

  return rows[0] ?? null;
}

async function getImsUserByEmail(email) {
  if (!email) {
    return null;
  }

  return getImsUserByIdentifier(email);
}

async function getImsUserById(userId) {
  if (!userId) {
    return null;
  }

  const [rows] = await imsPool.query(
    `
      SELECT
        u.id,
        u.first_name,
        u.last_name,
        u.email,
        u.phone_number,
        u.password_hash,
        u.status,
        u.role_id,
        u.must_change_password,
        u.job_title,
        u.employment_status,
        u.office_location,
        u.start_date,
        u.employee_grade,
        u.hrms_employee_id,
        u.department_id,
        r.name AS role_name,
        d.name AS department_name
      FROM users u
      INNER JOIN roles r ON r.id = u.role_id
      LEFT JOIN department d ON d.id = u.department_id
      WHERE u.id = ?
      LIMIT 1
    `,
    [Number(userId)],
  );

  return rows[0] ?? null;
}

let employeeRoleIdPromise = null;

async function getImsEmployeeRoleId() {
  if (!employeeRoleIdPromise) {
    employeeRoleIdPromise = imsPool
      .query(
        `
          SELECT id
          FROM roles
          WHERE LOWER(name) = 'employee'
          LIMIT 1
        `,
      )
      .then(([rows]) => Number(rows[0]?.id || 0) || null);
  }

  return employeeRoleIdPromise;
}

async function getAssignableImsRoles() {
  const [rows] = await imsPool.query(
    `
      SELECT id, name, description
      FROM roles
      WHERE LOWER(name) NOT IN ('admin', 'global system administrator')
      ORDER BY name ASC
    `,
  );

  const excludedRoles = new Set(["hr department", "it officer"]);
  const dedupedRoles = new Map();

  for (const row of rows) {
    const normalizedName = normalizeRole(row.name);

    if (!normalizedName || excludedRoles.has(normalizedName)) {
      continue;
    }

    const dedupeKey =
      normalizedName === "infrastructure manager" || normalizedName === "it infrastructure manager"
        ? "it infrastructure manager"
        : normalizedName;
    const nextRole = {
      id: Number(row.id),
      name: row.name,
      description: row.description || "",
    };
    const existingRole = dedupedRoles.get(dedupeKey);
    const nextIsPreferred = dedupeKey === "it infrastructure manager" && normalizedName === "it infrastructure manager";

    if (!existingRole || nextIsPreferred) {
      dedupedRoles.set(dedupeKey, nextRole);
    }
  }

  return Array.from(dedupedRoles.values()).sort((left, right) => left.name.localeCompare(right.name));
}

async function getImsRoleById(roleId) {
  const normalizedRoleId = normalizePositiveInteger(roleId);

  if (!normalizedRoleId) {
    return null;
  }

  const [rows] = await imsPool.query(
    `
      SELECT id, name, description
      FROM roles
      WHERE id = ?
      LIMIT 1
    `,
    [normalizedRoleId],
  );

  if (!rows.length) {
    return null;
  }

  return {
    id: Number(rows[0].id),
    name: rows[0].name,
    description: rows[0].description || "",
  };
}

async function upsertHrEmployeeImsLink(employeeId, linkedUserId, linkedUserStatus, linkedRoleId = null, linkedRoleName = null) {
  if (!employeeId) {
    return;
  }

  await pool.query(
    `
      UPDATE hr_employees
      SET
        ims_user_id = ?,
        ims_account_status = ?,
        ims_role_id = ?,
        ims_role_name = ?
      WHERE id = ?
    `,
    [
      linkedUserId ? Number(linkedUserId) : null,
      normalizeOptionalText(linkedUserStatus, 40),
      normalizePositiveInteger(linkedRoleId),
      normalizeOptionalText(linkedRoleName, 120),
      Number(employeeId),
    ],
  );
}

async function ensureImsUserForHrEmployee(employee, { sendWelcomeEmail = false, createIfMissing = true } = {}) {
  if (!employee?.email) {
    return {
      linkedUserId: null,
      linkedUserStatus: null,
      welcomeMessage: null,
      credentials: null,
    };
  }

  const fallbackEmployeeRoleId = await getImsEmployeeRoleId();
  if (!fallbackEmployeeRoleId) {
    throw new Error("Employee role is not configured in IMS.");
  }

  const requestedRoleId = normalizePositiveInteger(employee.ims_role_id) || fallbackEmployeeRoleId;
  const requestedRole = await getImsRoleById(requestedRoleId);

  if (!requestedRole) {
    throw new Error("The selected IMS role is not configured in IMS.");
  }

  const employeeCode = readEmployeeCode(employee);
  const hrmsEmployeeId = readHrmsEmployeeId(employee);
  let linkedUser = employee.ims_user_id ? await getImsUserById(employee.ims_user_id) : null;
  let credentials = null;

  if (!linkedUser && hrmsEmployeeId) {
    const [rows] = await imsPool.query(
      `
        SELECT u.id
        FROM users u
        WHERE u.hrms_employee_id = ?
        LIMIT 1
      `,
      [hrmsEmployeeId],
    );
    linkedUser = rows[0]?.id ? await getImsUserById(rows[0].id) : null;
  }

  if (!linkedUser && employee.email) {
    linkedUser = await getImsUserByEmail(employee.email);
  }

  let welcomeMessage = null;

  if (!linkedUser && !createIfMissing) {
    return {
      linkedUserId: null,
      linkedUserStatus: null,
      welcomeMessage: null,
      credentials: null,
    };
  }

  if (!linkedUser) {
    const temporaryPassword = generateTemporaryPassword();
    const [result] = await imsPool.query(
      `
        INSERT INTO users (
          first_name,
          last_name,
          email,
          phone_number,
          employee_code,
          password_hash,
          role_id,
          department_id,
          branch_id,
          country_id,
          status,
          must_change_password,
          job_title,
          employment_status,
          office_location,
          start_date,
          employee_grade,
          hrms_employee_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
      `,
      [
        employee.first_name,
        employee.last_name,
        employee.email,
        employee.phone_number || null,
        employeeCode || null,
        hashPassword(temporaryPassword),
        requestedRole.id,
        employee.department_id || null,
        null,
        null,
        normalizeEmployeeStatusForIms(employee.status),
        employee.job_title || null,
        employee.employment_status || null,
        employee.office_location || null,
        employee.start_date || null,
        employee.employee_grade || null,
        hrmsEmployeeId || null,
      ],
    );

    linkedUser = await getImsUserById(result.insertId);

    if (sendWelcomeEmail) {
      const emailResult = await sendAccountCreatedEmail({
        email: employee.email,
        firstName: employee.first_name,
        lastName: employee.last_name,
        password: temporaryPassword,
      });

      credentials = {
        email: employee.email,
        temporaryPassword,
      };
      welcomeMessage = emailResult.sent
        ? "IMS welcome email sent with a temporary password."
        : `${emailResult.configurationHint} An email preview was written to the backend log.`;
    }
  } else {
    await imsPool.query(
      `
        UPDATE users
        SET
          first_name = ?,
          last_name = ?,
          email = ?,
          phone_number = ?,
          employee_code = ?,
          role_id = ?,
          job_title = ?,
          employment_status = ?,
          office_location = ?,
          start_date = ?,
          employee_grade = ?,
          hrms_employee_id = ?,
          department_id = ?,
          status = ?
        WHERE id = ?
      `,
      [
        employee.first_name,
        employee.last_name,
        employee.email,
        employee.phone_number || null,
        employeeCode || null,
        requestedRole.id,
        employee.job_title || null,
        employee.employment_status || null,
        employee.office_location || null,
        employee.start_date || null,
        employee.employee_grade || null,
        hrmsEmployeeId || null,
        employee.department_id || null,
        normalizeEmployeeStatusForIms(employee.status),
        Number(linkedUser.id),
      ],
    );

    linkedUser = await getImsUserById(linkedUser.id);
  }

  return {
    linkedUserId: Number(linkedUser?.id || 0) || null,
    linkedUserStatus: linkedUser?.status || normalizeEmployeeStatusForIms(employee.status),
    linkedRoleId: normalizePositiveInteger(linkedUser?.role_id) || requestedRole.id,
    linkedRoleName: linkedUser?.role_name || requestedRole.name,
    welcomeMessage,
    credentials,
  };
}

async function resendImsCredentialsForHrEmployee(employee) {
  if (!employee?.email) {
    throw new Error("This employee does not have an email address.");
  }

  const syncResult = await ensureImsUserForHrEmployee(employee, { createIfMissing: true });
  const linkedUserId = normalizePositiveInteger(syncResult.linkedUserId);

  if (!linkedUserId) {
    throw new Error("Unable to prepare the linked IMS account for this employee.");
  }

  const temporaryPassword = generateTemporaryPassword();
  await imsPool.query(
    `
      UPDATE users
      SET
        password_hash = ?,
        must_change_password = 1
      WHERE id = ?
    `,
    [hashPassword(temporaryPassword), linkedUserId],
  );

  const emailResult = await sendAccountCreatedEmail({
    email: employee.email,
    firstName: employee.first_name,
    lastName: employee.last_name,
    password: temporaryPassword,
  });

  return {
    linkedUserId,
    linkedUserStatus: syncResult.linkedUserStatus,
    linkedRoleId: syncResult.linkedRoleId,
    linkedRoleName: syncResult.linkedRoleName,
    credentials: {
      email: employee.email,
      temporaryPassword,
    },
    message: emailResult.sent
      ? "Login credentials email sent with a new temporary password."
      : `${emailResult.configurationHint} An email preview was written to the backend log.`,
  };
}

async function syncEmployeeLinkState(employee) {
  if (!employee?.id) {
    return employee;
  }

  const syncResult = await ensureImsUserForHrEmployee(employee, { createIfMissing: true });
  await upsertHrEmployeeImsLink(
    employee.id,
    syncResult.linkedUserId,
    syncResult.linkedUserStatus,
    syncResult.linkedRoleId,
    syncResult.linkedRoleName,
  );
  const [rows] = await pool.query("SELECT * FROM hr_employees WHERE id = ? LIMIT 1", [Number(employee.id)]);
  return rows[0] ?? employee;
}

async function ensureHrShadowUser(actor) {
  if (!actor?.id || !actor?.email) {
    return null;
  }

  const existingShadow = await getHrShadowUserByImsUserId(actor.id) || await getHrUserByEmail(actor.email);

  if (existingShadow) {
    await pool.query(
      `
        UPDATE hr_users
        SET
          ims_user_id = ?,
          first_name = ?,
          last_name = ?,
          email = ?,
          password_hash = ?,
          role_name = ?,
          status = ?
        WHERE id = ?
      `,
      [
        Number(actor.id),
        normalizeRequiredText(actor.first_name, 40),
        normalizeRequiredText(actor.last_name, 40),
        normalizeRequiredText(actor.email, 180),
        actor.password_hash || existingShadow.password_hash || hashPassword("shadow-user"),
        normalizeRequiredText(actor.role_name, 40),
        actor.status === "active" ? "active" : "inactive",
        existingShadow.id,
      ],
    );

    return {
      ...existingShadow,
      ims_user_id: Number(actor.id),
      first_name: normalizeRequiredText(actor.first_name, 40),
      last_name: normalizeRequiredText(actor.last_name, 40),
      email: normalizeRequiredText(actor.email, 180),
      role_name: normalizeRequiredText(actor.role_name, 40),
      status: actor.status === "active" ? "active" : "inactive",
    };
  }

  await pool.query(
    `
      INSERT INTO hr_users (
        ims_user_id,
        first_name,
        last_name,
        email,
        password_hash,
        role_name,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      Number(actor.id),
      normalizeRequiredText(actor.first_name, 40),
      normalizeRequiredText(actor.last_name, 40),
      normalizeRequiredText(actor.email, 180),
      actor.password_hash || hashPassword("shadow-user"),
      normalizeRequiredText(actor.role_name, 40),
      actor.status === "active" ? "active" : "inactive",
    ],
  );

  return getHrShadowUserByImsUserId(actor.id);
}

async function resolveActor(req) {
  const bearerToken = readBearerToken(req);
  const activeSession = await getActiveHrmsSession(bearerToken);
  const tokenPayload = activeSession?.payload || null;

  if (tokenPayload?.email) {
    const tokenActor = await getImsUserByEmail(tokenPayload.email);

    if (tokenActor?.status === "active") {
      const shadowUser = await ensureHrShadowUser(tokenActor);
      return {
        ...tokenActor,
        local_hr_user_id: shadowUser?.id || null,
      };
    }
  }

  const email = normalizeOptionalText(
    req.header("x-ims-user-email") ||
    req.header("x-hrms-user-email") ||
    req.query.userEmail,
    180,
  );

  if (!email) {
    return null;
  }

  if (!hasValidIntegrationApiKey(req)) {
    return null;
  }

  const imsActor = await getImsUserByEmail(email);

  if (imsActor?.status === "active") {
    const shadowUser = await ensureHrShadowUser(imsActor);
    return {
      ...imsActor,
      local_hr_user_id: shadowUser?.id || null,
    };
  }

  const localActor = await getHrUserByEmail(email);

  if (!localActor) {
    return null;
  }

  return {
    ...localActor,
    local_hr_user_id: localActor.id,
  };
}

async function resolveDashboardActor(req) {
  const actor = await resolveActor(req);
  return canAccessHrmsDashboard(actor) ? actor : null;
}

function mapEmployee(row) {
  const recommendation = getRecommendedDeviceProfile(row);
  return {
    id: row.id,
    employee_code: readEmployeeCode(row),
    hrms_employee_id: readHrmsEmployeeId(row),
    first_name: row.first_name,
    last_name: row.last_name,
    full_name: `${row.first_name || ""} ${row.last_name || ""}`.trim(),
    email: row.email,
    phone_number: row.phone_number,
    employee_grade: row.employee_grade,
    job_title: row.job_title,
    employment_status: row.employment_status,
    office_location: row.office_location,
    start_date: row.start_date,
    department_id: row.department_id,
    department_name: row.department_name,
    linked_user_id: row.ims_user_id,
    ims_account_status: row.ims_account_status,
    ims_role_id: row.ims_role_id ? Number(row.ims_role_id) : null,
    ims_role_name: row.ims_role_name || null,
    status: row.status,
    recommended_device_profile: recommendation.profile,
    recommended_device_reason: recommendation.reason,
  };
}

function mapHrUser(row) {
  return {
    id: row.id,
    imsUserId: row.ims_user_id ? Number(row.ims_user_id) : null,
    firstName: row.first_name,
    lastName: row.last_name,
    fullName: `${row.first_name || ""} ${row.last_name || ""}`.trim(),
    email: row.email,
    phoneNumber: row.phone_number || "",
    departmentName: row.department_name || "",
    jobTitle: row.job_title || "",
    role: row.role_name,
    status: row.status,
  };
}

function mapDirectoryHrUser(row) {
  return {
    id: `hr-user-${row.id}`,
    record_type: "hr_user",
    local_hr_user_id: Number(row.id),
    ims_user_id: row.ims_user_id ? Number(row.ims_user_id) : null,
    full_name: `${row.first_name || ""} ${row.last_name || ""}`.trim(),
    email: row.email,
    ims_role_name: row.role_name || "No IMS role",
    department_name: row.department_name || "HRMS access user",
    job_title: row.job_title || null,
    status: row.status || "active",
    ims_account_status: row.ims_user_id ? `IMS user #${Number(row.ims_user_id)}` : "No IMS user link",
  };
}

function getRecommendedDeviceProfile(employee) {
  const title = String(employee.job_title || "").toLowerCase();
  const department = String(employee.department_name || "").toLowerCase();
  const grade = String(employee.employee_grade || "").toLowerCase();
  const reasons = [];

  if (/(director|head|manager|lead|senior|executive)/.test(title) || /(g4|g5|m1|m2|senior)/.test(grade)) {
    reasons.push("leadership or senior role");
    return {
      profile: "Business laptop, Core i7, 16GB RAM, 512GB SSD",
      reason: `Recommended because of ${reasons.join(", ")}.`,
    };
  }

  if (/(engineer|developer|analyst|architect|network|systems)/.test(title) || /(it|technology|digital)/.test(department)) {
    reasons.push("technical workload");
    return {
      profile: "Performance laptop, Core i5/i7, 16GB RAM, 512GB SSD",
      reason: `Recommended because of ${reasons.join(", ")}.`,
    };
  }

  if (/(support|helpdesk|technician|field)/.test(title)) {
    reasons.push("support operations");
    return {
      profile: "Standard support laptop, Core i5, 8GB RAM, 256GB SSD",
      reason: `Recommended because of ${reasons.join(", ")}.`,
    };
  }

  if (/(design|media|creative|data)/.test(title)) {
    reasons.push("heavier application usage");
    return {
      profile: "High-capacity laptop, Core i7, 16GB RAM, 1TB SSD",
      reason: `Recommended because of ${reasons.join(", ")}.`,
    };
  }

  reasons.push("general office productivity");
  return {
    profile: "Standard office laptop, Core i5, 8GB RAM, 256GB SSD",
    reason: `Recommended because of ${reasons.join(", ")}.`,
  };
}

app.get("/", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", service: "HRMS" });
  } catch (error) {
    res.status(500).json({ message: normalizeError(error) });
  }
});

app.get("/api/dashboard", async (req, res) => {
  try {
    const actor = await resolveDashboardActor(req);

    if (!actor) {
      return res.status(401).json({ message: "Only approved HRMS roles can access the HRMS dashboard." });
    }

    const [employeeRows] = await pool.query(
      `
        SELECT *
        FROM hr_employees
        ORDER BY created_at DESC
        LIMIT 12
      `,
    );

    await Promise.all(employeeRows.map((employee) => syncEmployeeLinkState(employee)));

    const [[employeeStats]] = await pool.query(
      `
        SELECT
          COUNT(*) AS totalEmployees,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS activeEmployees,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pendingEmployees,
          SUM(CASE WHEN ims_user_id IS NOT NULL THEN 1 ELSE 0 END) AS linkedToIms
        FROM hr_employees
      `,
    );

    const [[departmentStats]] = await pool.query(
      `
        SELECT COUNT(DISTINCT department_name) AS departments
        FROM hr_employees
        WHERE department_name IS NOT NULL AND department_name <> ''
      `,
    );

    const [recentEmployees] = await pool.query(
      `
        SELECT *
        FROM hr_employees
        ORDER BY created_at DESC
        LIMIT 6
      `,
    );

    return res.json({
      actor: mapHrUser(actor),
      stats: {
        totalEmployees: Number(employeeStats?.totalEmployees || 0),
        activeEmployees: Number(employeeStats?.activeEmployees || 0),
        pendingEmployees: Number(employeeStats?.pendingEmployees || 0),
        linkedToIms: Number(employeeStats?.linkedToIms || 0),
        departments: Number(departmentStats?.departments || 0),
      },
      recentEmployees: recentEmployees.map(mapEmployee),
    });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const email = normalizeRequiredText(req.body?.email || req.body?.identifier, 180);
  const password = normalizeRequiredText(req.body?.password, 255);

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }

  try {
    const user = await getImsUserByIdentifier(email);

    if (!user || user.password_hash !== hashPassword(password)) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    if (user.status !== "active") {
      return res.status(403).json({ message: "This HRMS account is inactive." });
    }

    if (!canAccessHrmsDashboard(user)) {
      return res.status(403).json({
        message: "Your IMS role is not enabled for HRMS access.",
      });
    }

    const sessionToken = createSessionToken(user);
    await persistHrmsSession(sessionToken, user, "password");

    return res.json({
      message: "HRMS login successful.",
      token: sessionToken,
      user: mapHrUser(user),
    });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.get("/api/auth/session", async (req, res) => {
  try {
    const actor = await resolveDashboardActor(req);

    if (!actor) {
      return res.status(401).json({ message: "Session expired or invalid." });
    }

    return res.json({
      user: mapHrUser(actor),
      tokenExpiresInMs: sessionLifetimeMs,
      hasActiveSession: true,
    });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.post("/api/auth/sso", async (req, res) => {
  try {
    const actor = await resolveActor(req);

    if (!canAccessHrmsDashboard(actor)) {
      return res.status(403).json({ message: "Your IMS role is not enabled for HRMS SSO access." });
    }

    const sessionToken = createSessionToken(actor);
    await persistHrmsSession(sessionToken, actor, "sso");

    return res.json({
      message: "HRMS SSO session created successfully.",
      token: sessionToken,
      user: mapHrUser(actor),
      launchPath: "/",
    });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.post("/api/auth/logout", async (req, res) => {
  try {
    const token = readBearerToken(req);

    if (token) {
      await revokeHrmsSession(token);
    }

    return res.json({ message: "HRMS session closed successfully." });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.post("/api/account/profile", async (req, res) => {
  try {
    const actor = await resolveDashboardActor(req);

    if (!actor?.id) {
      return res.status(401).json({ message: "Session expired or invalid." });
    }

    const firstName = normalizeRequiredText(req.body?.firstName, 40);
    const lastName = normalizeRequiredText(req.body?.lastName, 40);
    const email = normalizeRequiredText(req.body?.email, 180).toLowerCase();
    const phoneNumber = normalizeOptionalText(req.body?.phoneNumber, 20);

    if (!firstName || !lastName || !email) {
      return res.status(400).json({ message: "First name, last name, and email are required." });
    }

    await imsPool.query(
      `
        UPDATE users
        SET
          first_name = ?,
          last_name = ?,
          email = ?,
          phone_number = ?
        WHERE id = ?
      `,
      [firstName, lastName, email, phoneNumber, Number(actor.id)],
    );

    const updatedUser = await getImsUserById(actor.id);

    if (!updatedUser) {
      return res.status(404).json({ message: "Unable to load the updated profile." });
    }

    await ensureHrShadowUser(updatedUser);

    const currentToken = readBearerToken(req);
    if (currentToken) {
      await revokeHrmsSession(currentToken);
    }

    const nextToken = createSessionToken(updatedUser);
    await persistHrmsSession(nextToken, updatedUser, "password");

    return res.json({
      message: "Profile updated successfully.",
      token: nextToken,
      user: mapHrUser(updatedUser),
    });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.post("/api/account/password", async (req, res) => {
  try {
    const actor = await resolveDashboardActor(req);

    if (!actor?.id) {
      return res.status(401).json({ message: "Session expired or invalid." });
    }

    const currentPassword = normalizeRequiredText(req.body?.currentPassword, 255);
    const newPassword = normalizeRequiredText(req.body?.newPassword, 255);

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current password and new password are required." });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters long." });
    }

    const currentUser = await getImsUserById(actor.id);

    if (!currentUser || currentUser.password_hash !== hashPassword(currentPassword)) {
      return res.status(400).json({ message: "Current password is incorrect." });
    }

    await imsPool.query(
      `
        UPDATE users
        SET
          password_hash = ?,
          must_change_password = 0
        WHERE id = ?
      `,
      [hashPassword(newPassword), Number(actor.id)],
    );

    const updatedUser = await getImsUserById(actor.id);

    if (updatedUser) {
      await ensureHrShadowUser(updatedUser);
    }

    return res.json({
      message: "Password updated successfully.",
      user: updatedUser ? mapHrUser(updatedUser) : null,
    });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.get("/api/employees", async (req, res) => {
  try {
    const actor = await resolveActor(req);

    if (!canReadForImsIntegration(actor)) {
      return res.status(401).json({ message: "An authenticated IMS or HRMS actor is required." });
    }

    const [rows] = await pool.query(
      `
        SELECT *
        FROM hr_employees
        ORDER BY first_name ASC, last_name ASC
      `,
    );

    const [hrUserRows] = await pool.query(
      `
        SELECT id, ims_user_id, first_name, last_name, email, role_name, status
        FROM hr_users
        ORDER BY first_name ASC, last_name ASC
      `,
    );

    const syncedRows = await Promise.all(rows.map((row) => syncEmployeeLinkState(row)));

    return res.json({
      employees: syncedRows.map(mapEmployee),
      hrUsers: hrUserRows.map(mapDirectoryHrUser),
    });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.get("/api/employees/:id", async (req, res) => {
  try {
    const actor = await resolveActor(req);

    if (!canReadForImsIntegration(actor)) {
      return res.status(401).json({ message: "An authenticated IMS or HRMS actor is required." });
    }

    const [rows] = await pool.query(
      "SELECT * FROM hr_employees WHERE id = ? LIMIT 1",
      [Number(req.params.id)],
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Employee not found." });
    }

    const syncedEmployee = await syncEmployeeLinkState(rows[0]);

    return res.json({ employee: mapEmployee(syncedEmployee) });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.get("/api/roles", async (req, res) => {
  try {
    const actor = await resolveDashboardActor(req);

    if (!actor) {
      return res.status(401).json({ message: "An HRMS session is required to load IMS roles." });
    }

    const roles = await getAssignableImsRoles();
    return res.json({ roles });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.post("/api/employees", async (req, res) => {
  try {
    const actor = await resolveActor(req);

    if (!canManageEmployeesInHrms(actor)) {
      return res.status(401).json({ message: "Only HR Recruitment Officer and HR Director can manage employees in HRMS." });
    }

    const firstName = normalizeRequiredText(req.body?.firstName, 40);
    const lastName = normalizeRequiredText(req.body?.lastName, 40);
    const email = normalizeRequiredText(req.body?.email, 180).toLowerCase();
    const roleId = normalizePositiveInteger(req.body?.roleId);

    if (!firstName || !lastName || !email || !roleId) {
      return res.status(400).json({ message: "First name, last name, email, and IMS role are required." });
    }

    const normalizedStatus = normalizeEmployeeStatus(req.body?.status);
    const employmentStatus = normalizeOptionalText(req.body?.employmentStatus, 80) || normalizedStatus;
    const imsRole = await getImsRoleById(roleId);

    if (!imsRole) {
      return res.status(400).json({ message: "The selected IMS role is invalid." });
    }

    const generatedIdentifiers = await generateEmployeeIdentifiers();

    const [result] = await pool.query(
      `
        INSERT INTO hr_employees (
          employee_code,
          hrms_employee_id,
          first_name,
          last_name,
          email,
          phone_number,
          employee_grade,
          job_title,
          employment_status,
          office_location,
          start_date,
          department_id,
          department_name,
          ims_role_id,
          ims_role_name,
          status,
          created_by_user_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        encryptHrmsIdentifier(generatedIdentifiers.employeeCode),
        encryptHrmsIdentifier(generatedIdentifiers.hrmsEmployeeId),
        firstName,
        lastName,
        email,
        normalizeOptionalText(req.body?.phoneNumber, 13),
        normalizeOptionalText(req.body?.employeeGrade, 40),
        normalizeOptionalText(req.body?.jobTitle, 120),
        employmentStatus,
        normalizeOptionalText(req.body?.officeLocation, 180),
        normalizeOptionalText(req.body?.startDate, 20),
        req.body?.departmentId ? Number(req.body.departmentId) : null,
        normalizeOptionalText(req.body?.departmentName, 40),
        imsRole.id,
        imsRole.name,
        normalizedStatus,
        actor.local_hr_user_id || actor.id,
      ],
    );

    const [rows] = await pool.query(
      "SELECT * FROM hr_employees WHERE id = ? LIMIT 1",
      [Number(result.insertId)],
    );

    const syncResult = await ensureImsUserForHrEmployee(rows[0], { sendWelcomeEmail: true });
    await upsertHrEmployeeImsLink(
      rows[0].id,
      syncResult.linkedUserId,
      syncResult.linkedUserStatus,
      syncResult.linkedRoleId,
      syncResult.linkedRoleName,
    );
    const [syncedRows] = await pool.query("SELECT * FROM hr_employees WHERE id = ? LIMIT 1", [Number(result.insertId)]);

    return res.status(201).json({
      message: syncResult.welcomeMessage
        ? `HRMS employee created successfully. ${syncResult.welcomeMessage}`
        : "HRMS employee created successfully.",
      employee: mapEmployee(syncedRows[0]),
      credentials: syncResult.credentials,
    });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.put("/api/employees/:id", async (req, res) => {
  try {
    const actor = await resolveActor(req);

    if (!canManageEmployeesInHrms(actor)) {
      return res.status(401).json({ message: "Only HR Recruitment Officer and HR Director can manage employees in HRMS." });
    }

    const employeeId = Number(req.params.id);
    const firstName = normalizeRequiredText(req.body?.firstName, 40);
    const lastName = normalizeRequiredText(req.body?.lastName, 40);
    const email = normalizeRequiredText(req.body?.email, 180).toLowerCase();
    const roleId = normalizePositiveInteger(req.body?.roleId);

    if (!employeeId || !firstName || !lastName || !email || !roleId) {
      return res.status(400).json({ message: "Employee id, first name, last name, email, and IMS role are required." });
    }

    const normalizedStatus = normalizeEmployeeStatus(req.body?.status);
    const employmentStatus = normalizeOptionalText(req.body?.employmentStatus, 80) || normalizedStatus;
    const imsRole = await getImsRoleById(roleId);

    if (!imsRole) {
      return res.status(400).json({ message: "The selected IMS role is invalid." });
    }

    const [result] = await pool.query(
      `
        UPDATE hr_employees
        SET
          employee_code = ?,
          hrms_employee_id = ?,
          first_name = ?,
          last_name = ?,
          email = ?,
          phone_number = ?,
          employee_grade = ?,
          job_title = ?,
          employment_status = ?,
          office_location = ?,
          start_date = ?,
          department_id = ?,
          department_name = ?,
          ims_user_id = ?,
          ims_account_status = ?,
          ims_role_id = ?,
          ims_role_name = ?,
          status = ?
        WHERE id = ?
      `,
      [
        encryptHrmsIdentifier(req.body?.employeeCode),
        encryptHrmsIdentifier(req.body?.hrmsEmployeeId),
        firstName,
        lastName,
        email,
        normalizeOptionalText(req.body?.phoneNumber, 13),
        normalizeOptionalText(req.body?.employeeGrade, 40),
        normalizeOptionalText(req.body?.jobTitle, 120),
        employmentStatus,
        normalizeOptionalText(req.body?.officeLocation, 180),
        normalizeOptionalText(req.body?.startDate, 20),
        req.body?.departmentId ? Number(req.body.departmentId) : null,
        normalizeOptionalText(req.body?.departmentName, 40),
        req.body?.imsUserId ? Number(req.body.imsUserId) : null,
        normalizeOptionalText(req.body?.imsAccountStatus, 40),
        imsRole.id,
        imsRole.name,
        normalizedStatus,
        employeeId,
      ],
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Employee not found." });
    }

    const [rows] = await pool.query(
      "SELECT * FROM hr_employees WHERE id = ? LIMIT 1",
      [employeeId],
    );

    const syncResult = await ensureImsUserForHrEmployee(rows[0]);
    await upsertHrEmployeeImsLink(
      employeeId,
      syncResult.linkedUserId,
      syncResult.linkedUserStatus,
      syncResult.linkedRoleId,
      syncResult.linkedRoleName,
    );
    const [syncedRows] = await pool.query("SELECT * FROM hr_employees WHERE id = ? LIMIT 1", [employeeId]);

    return res.json({
      message: "HRMS employee updated successfully.",
      employee: mapEmployee(syncedRows[0]),
    });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.post("/api/employees/:id/resend-credentials", async (req, res) => {
  try {
    const actor = await resolveActor(req);

    if (!canManageEmployeesInHrms(actor)) {
      return res.status(401).json({ message: "Only HR Recruitment Officer and HR Director can resend employee credentials in HRMS." });
    }

    const employeeId = Number(req.params.id);

    if (!employeeId) {
      return res.status(400).json({ message: "A valid employee id is required." });
    }

    const [rows] = await pool.query("SELECT * FROM hr_employees WHERE id = ? LIMIT 1", [employeeId]);

    if (!rows.length) {
      return res.status(404).json({ message: "Employee not found." });
    }

    const employee = rows[0];
    const resendResult = await resendImsCredentialsForHrEmployee(employee);
    await upsertHrEmployeeImsLink(
      employeeId,
      resendResult.linkedUserId,
      resendResult.linkedUserStatus,
      resendResult.linkedRoleId,
      resendResult.linkedRoleName,
    );
    const [syncedRows] = await pool.query("SELECT * FROM hr_employees WHERE id = ? LIMIT 1", [employeeId]);

    return res.json({
      message: resendResult.message,
      employee: mapEmployee(syncedRows[0]),
      credentials: resendResult.credentials,
    });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.delete("/api/employees/:id", async (req, res) => {
  try {
    const actor = await resolveActor(req);

    if (!canManageEmployeesInHrms(actor)) {
      return res.status(401).json({ message: "Only HR Recruitment Officer and HR Director can manage employees in HRMS." });
    }

    const employeeId = Number(req.params.id);

    if (!employeeId) {
      return res.status(400).json({ message: "A valid employee id is required." });
    }

    const [rows] = await pool.query("SELECT * FROM hr_employees WHERE id = ? LIMIT 1", [employeeId]);

    if (!rows.length) {
      return res.status(404).json({ message: "Employee not found." });
    }

    await pool.query("DELETE FROM hr_employees WHERE id = ?", [employeeId]);

    return res.json({
      message: "HRMS employee deleted successfully.",
      employee: mapEmployee(rows[0]),
    });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

async function start() {
  await ensureSchema();
  const resolvedPort = await resolveAvailablePort(port);
  app.listen(resolvedPort, () => {
    if (resolvedPort !== port) {
      console.warn(`Port ${port} is already in use. HRMS switched to http://127.0.0.1:${resolvedPort}`);
      return;
    }

    console.log(`HRMS backend running on http://127.0.0.1:${resolvedPort}`);
  });
}

start().catch((error) => {
  console.error("Failed to start HRMS backend:", error);
  process.exit(1);
});

function isPortAvailable(targetPort) {
  return new Promise((resolve, reject) => {
    const tester = net.createServer();

    tester.once("error", (error) => {
      if (error && typeof error === "object" && "code" in error && error.code === "EADDRINUSE") {
        resolve(false);
        return;
      }

      reject(error);
    });

    tester.once("listening", () => {
      tester.close(() => resolve(true));
    });

    tester.listen(targetPort, "0.0.0.0");
  });
}

async function resolveAvailablePort(preferredPort) {
  const maxPortAttempts = 10;

  for (let offset = 0; offset < maxPortAttempts; offset += 1) {
    const candidatePort = preferredPort + offset;
    const available = await isPortAvailable(candidatePort);

    if (available) {
      return candidatePort;
    }
  }

  throw new Error(`No open HRMS port found between ${preferredPort} and ${preferredPort + maxPortAttempts - 1}.`);
}
