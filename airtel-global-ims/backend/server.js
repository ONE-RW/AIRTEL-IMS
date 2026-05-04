import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";
import fs from "fs/promises";
import nodemailer from "nodemailer";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { pool } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, ".env") });

const app = express();
const port = Number(process.env.PORT || 4000);
const defaultAdminEmail = process.env.DEFAULT_ADMIN_EMAIL || "admin@airtel.com";
const defaultAdminPassword = process.env.DEFAULT_ADMIN_PASSWORD || "Admin123!";
const smtpFrom = process.env.SMTP_FROM || defaultAdminEmail;
const isGmailSender = /@gmail\.com$/i.test(smtpFrom);
const smtpHost = process.env.SMTP_HOST || (isGmailSender ? "smtp.gmail.com" : "");
const smtpPort = Number(process.env.SMTP_PORT || (isGmailSender ? 465 : 587));
const smtpSecure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : isGmailSender;
const smtpUser = process.env.SMTP_USER || (isGmailSender ? smtpFrom : "");
const smtpPass = process.env.SMTP_PASS || "";
const mailPreviewRecipient = process.env.MAIL_PREVIEW_RECIPIENT || "";
const isSmtpConfigured = Boolean(smtpHost && smtpUser && smtpPass && smtpFrom);
const isEmailOtpEnabled = process.env.EMAIL_OTP_ENABLED !== "false";
const otpExpiryMs = 5 * 60 * 1000;
const otpTrustMs = 60 * 60 * 1000;
const passwordResetExpiryMs = 30 * 60 * 1000;
const authChallenges = new Map();
const microsoftAuthStates = new Map();
const backupsDirectory = path.join(__dirname, "backups");
const IOT_FAILURE_DATA_FILE = path.join(__dirname, "..", "IoT_Failure_Prediction_Dataset.csv");
const IOT_FAILURE_MODEL_FILE = path.join(__dirname, "models", "iot_failure_model.json");
const IOT_FAILURE_LEGACY_MODEL_FILE = path.join(__dirname, "iot-failure-model.json");
const IOT_FAILURE_METRICS_FILE = path.join(__dirname, "models", "iot_failure_metrics.json");
const IOT_FAILURE_PICKLE_FILE = path.join(__dirname, "models", "iot_failure_model.pkl");
const IOT_FAILURE_TRAINING_SCRIPT = path.join(__dirname, "..", "scripts", "train_iot_failure_model.py");
const sessionSecret = process.env.SESSION_SECRET || process.env.JWT_SECRET || defaultAdminPassword || "airtel-ims-dev-secret";
const microsoftTenantId = process.env.MICROSOFT_TENANT_ID || "";
const microsoftClientId = process.env.MICROSOFT_CLIENT_ID || "";
const microsoftClientSecret = process.env.MICROSOFT_CLIENT_SECRET || "";
const microsoftRedirectUri = process.env.MICROSOFT_REDIRECT_URI || `${getFrontendBaseUrl()}/?authProvider=microsoft`;
const chatbotServiceUrl = process.env.CHATBOT_SERVICE_URL || "http://127.0.0.1:8010";
const chatbotServiceAutoStart = process.env.CHATBOT_AUTO_START !== "false";
const hrmsApiBaseUrl = process.env.HRMS_API_BASE_URL || "";
const hrmsApiKey = process.env.HRMS_API_KEY || "";
const hrmsEmployeesPath = process.env.HRMS_EMPLOYEES_PATH || "/api/employees";
const hrmsEmployeeByIdPathTemplate = process.env.HRMS_EMPLOYEE_BY_ID_PATH || "/api/employees/{id}";
const hrmsApiKeyHeader = process.env.HRMS_API_KEY_HEADER || "x-api-key";
const hrmsUserEmailHeader = process.env.HRMS_USER_EMAIL_HEADER || "x-ims-user-email";
const hrmsUserRoleHeader = process.env.HRMS_USER_ROLE_HEADER || "x-ims-user-role";
const deviceAgentApiKey = process.env.DEVICE_AGENT_API_KEY || "airtel-device-agent-dev-key";
let hasLoggedHrmsUnavailableWarning = false;
const openAiApiKey = process.env.OPENAI_API_KEY || "";
const openAiGeneralChatModel = process.env.OPENAI_GENERAL_CHAT_MODEL || "gpt-5.4-mini";
const openAiApiBaseUrl = process.env.OPENAI_API_BASE_URL || "https://api.openai.com/v1";
const chatbotBaseDirectory = path.join(__dirname, "..", "AIMS Chatbot");
const chatbotTrainingFile = path.join(chatbotBaseDirectory, "training_data.json");
const chatbotKnowledgeFiles = [
  { key: "architecture", label: "System Architecture", path: path.join(__dirname, "..", "SYSTEM_ARCHITECTURE.md") },
  { key: "workflow_updates", label: "Device Workflow Updates", path: path.join(__dirname, "..", "DEVICE_WORKFLOW_UPDATES.md") },
  { key: "global_analysis", label: "IMS Global Analysis", path: path.join(__dirname, "..", "AIRTEL_GLOBAL_ANALYSIS.md") },
];
const frontendDistDirectory = path.join(__dirname, "..", "dist");
let chatbotServiceStartAttempted = false;
let chatbotIntentCatalogPromise = null;
let chatbotKnowledgeChunksPromise = null;

app.use(cors());
app.use(express.json({ limit: "5mb" }));

function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function normalizeIdentifierForHash(value) {
  return String(value || "").trim().toLowerCase();
}

function hashProtectedIdentifier(value) {
  const normalized = normalizeIdentifierForHash(value);
  return normalized ? crypto.createHash("sha256").update(normalized).digest("hex") : null;
}

function getIdentifierProtectionKey() {
  const secret = String(process.env.IDENTIFIER_ENCRYPTION_SECRET || process.env.SESSION_SECRET || "airtel-ims-default-identifier-secret");
  return crypto.createHash("sha256").update(secret).digest();
}

function encryptProtectedIdentifier(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return null;
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getIdentifierProtectionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(normalized, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

function buildProtectedIdentifierBundle(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return null;
  }

  return {
    hash: hashProtectedIdentifier(normalized),
    encrypted: encryptProtectedIdentifier(normalized),
  };
}

function generateTemporaryPassword(length = 12) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  return Array.from(crypto.randomBytes(length), (byte) => alphabet[byte % alphabet.length]).join("");
}

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

function generateOtpCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function getFrontendBaseUrl(req) {
  return process.env.FRONTEND_URL || process.env.APP_BASE_URL || "http://localhost:5173";
}

function isMicrosoftSsoConfigured() {
  return Boolean(microsoftTenantId && microsoftClientId && microsoftClientSecret && microsoftRedirectUri);
}

function getMicrosoftAuthorityBaseUrl() {
  return `https://login.microsoftonline.com/${microsoftTenantId}/oauth2/v2.0`;
}

function buildMicrosoftAuthUrl(state) {
  const authUrl = new URL(`${getMicrosoftAuthorityBaseUrl()}/authorize`);
  authUrl.searchParams.set("client_id", microsoftClientId);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", microsoftRedirectUri);
  authUrl.searchParams.set("response_mode", "query");
  authUrl.searchParams.set("scope", "openid profile email User.Read");
  authUrl.searchParams.set("state", state);
  const prompt = process.env.MICROSOFT_PROMPT || "";
  if (prompt) {
    authUrl.searchParams.set("prompt", prompt);
  }
  return authUrl.toString();
}

function createMicrosoftAuthState() {
  const state = crypto.randomBytes(24).toString("hex");
  microsoftAuthStates.set(state, {
    expiresAt: Date.now() + 10 * 60 * 1000,
  });
  return state;
}

function consumeMicrosoftAuthState(state) {
  const record = microsoftAuthStates.get(state);
  microsoftAuthStates.delete(state);

  if (!record || record.expiresAt < Date.now()) {
    return false;
  }

  return true;
}

function decodeJwtPayload(token) {
  const [, payload = ""] = String(token || "").split(".");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

function createOtpTrustToken(userId) {
  const payload = {
    userId: Number(userId),
    expiresAt: Date.now() + otpTrustMs,
  };
  const payloadText = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", sessionSecret).update(payloadText).digest("base64url");
  return `${payloadText}.${signature}`;
}

function verifyOtpTrustToken(token, userId) {
  if (!token || !userId || !String(token).includes(".")) {
    return false;
  }

  const [payloadText, signature] = String(token).split(".");
  const expectedSignature = crypto.createHmac("sha256", sessionSecret).update(payloadText).digest("base64url");

  const signatureBuffer = Buffer.from(signature || "");
  const expectedSignatureBuffer = Buffer.from(expectedSignature);

  if (
    signatureBuffer.length !== expectedSignatureBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedSignatureBuffer)
  ) {
    return false;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadText, "base64url").toString("utf8"));
    return Number(payload.userId) === Number(userId) && Number(payload.expiresAt) > Date.now();
  } catch {
    return false;
  }
}

function maskEmail(email) {
  const [localPart = "", domain = ""] = String(email || "").split("@");
  if (!localPart || !domain) {
    return String(email || "");
  }

  const visibleStart = localPart.slice(0, 2);
  const visibleEnd = localPart.slice(-1);
  return `${visibleStart}${"*".repeat(Math.max(localPart.length - 3, 1))}${visibleEnd}@${domain}`;
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
      "Please sign in and change your password from the account settings page.",
    ].join("\n"),
    html: `
      <div style="font-family: Trebuchet MS, Segoe UI, sans-serif; color: #111111; line-height: 1.6;">
        <h2 style="color: #b9161c; margin-bottom: 12px;">Welcome to Airtel IMS</h2>
        <p>Hello ${fullName || "team member"},</p>
        <p>Your Airtel IMS account has been created successfully.</p>
        <p><strong>Login email:</strong> ${email}</p>
        <p><strong>Temporary password:</strong> ${password}</p>
        <p>Please sign in and change your password from the account settings page.</p>
      </div>
    `,
  });

  if (!isSmtpConfigured) {
    console.log("Account creation email preview:", mail.message?.toString?.() || mail.messageId);
  }

  return {
    sent: isSmtpConfigured,
    configurationHint: isSmtpConfigured
      ? ""
        : isGmailSender
        ? "Set SMTP_PASS in backend/.env to your Gmail App Password to enable real email delivery."
        : "Set SMTP_HOST, SMTP_USER, SMTP_PASS, and SMTP_FROM in backend/.env to enable real email delivery.",
  };
}

async function sendTemporaryPasswordEmail({ email, firstName, lastName, password, purpose }) {
  const fullName = `${firstName} ${lastName}`.trim();
  const purposeLine =
    purpose === "welcome"
      ? "Your Airtel IMS account details are ready again."
      : "Your Airtel IMS password has been reset by an administrator.";
  const actionLine =
    purpose === "welcome"
      ? "Use the temporary password below to sign in."
      : "Use the temporary password below to sign in and update it immediately.";

  const mail = await mailTransport.sendMail({
    from: smtpFrom,
    to: isSmtpConfigured ? email : mailPreviewRecipient || smtpFrom,
    subject: purpose === "welcome" ? "Your Airtel IMS account details" : "Your Airtel IMS password was reset",
    text: [
      `Hello ${fullName},`,
      "",
      purposeLine,
      actionLine,
      `Login email: ${email}`,
      `Temporary password: ${password}`,
      "",
      "Please change your password from account settings after signing in.",
    ].join("\n"),
    html: `
      <div style="font-family: Trebuchet MS, Segoe UI, sans-serif; color: #111111; line-height: 1.6;">
        <h2 style="color: #b9161c; margin-bottom: 12px;">Airtel IMS Access Update</h2>
        <p>Hello ${fullName || "team member"},</p>
        <p>${purposeLine}</p>
        <p>${actionLine}</p>
        <p><strong>Login email:</strong> ${email}</p>
        <p><strong>Temporary password:</strong> ${password}</p>
        <p>Please change your password from account settings after signing in.</p>
      </div>
    `,
  });

  if (!isSmtpConfigured) {
    console.log("Temporary password email preview:", mail.message?.toString?.() || mail.messageId);
  }

  return {
    sent: isSmtpConfigured,
    configurationHint: isSmtpConfigured
      ? ""
      : isGmailSender
        ? "Set SMTP_PASS in backend/.env to your Gmail App Password to enable real email delivery."
        : "Set SMTP_HOST, SMTP_USER, SMTP_PASS, and SMTP_FROM in backend/.env to enable real email delivery.",
  };
}

async function sendSignInAlertEmail({ email, firstName, lastName, roleName }) {
  const fullName = `${firstName} ${lastName}`.trim();
  const signedInAt = new Date().toLocaleString("en-US", {
    dateStyle: "long",
    timeStyle: "short",
  });

  await mailTransport.sendMail({
    from: smtpFrom,
    to: isSmtpConfigured ? email : mailPreviewRecipient || smtpFrom,
    subject: "Airtel IMS sign-in alert",
    text: [
      `Hello ${fullName},`,
      "",
      "You have just signed in to Airtel IMS.",
      `Role: ${roleName}`,
      `Time: ${signedInAt}`,
      "",
      "If this was not you, please change your password immediately and contact the system administrator.",
    ].join("\n"),
    html: `
      <div style="font-family: Trebuchet MS, Segoe UI, sans-serif; color: #111111; line-height: 1.6;">
        <h2 style="color: #b9161c; margin-bottom: 12px;">Airtel IMS Sign-in Alert</h2>
        <p>Hello ${fullName || "team member"},</p>
        <p>You have just signed in to Airtel IMS.</p>
        <p><strong>Role:</strong> ${roleName}</p>
        <p><strong>Time:</strong> ${signedInAt}</p>
        <p>If this was not you, please change your password immediately and contact the system administrator.</p>
      </div>
    `,
  });
}

async function sendEmailOtp({ email, firstName, lastName, otpCode }) {
  const fullName = `${firstName} ${lastName}`.trim();
  const mail = await mailTransport.sendMail({
    from: smtpFrom,
    to: isSmtpConfigured ? email : mailPreviewRecipient || smtpFrom,
    subject: "Your Airtel IMS verification code",
    text: [
      `Hello ${fullName},`,
      "",
      `Your Airtel IMS verification code is: ${otpCode}`,
      "This code expires in 5 minutes.",
    ].join("\n"),
    html: `
      <div style="font-family: Trebuchet MS, Segoe UI, sans-serif; color: #111111; line-height: 1.6;">
        <h2 style="color: #b9161c; margin-bottom: 12px;">Verification Code</h2>
        <p>Hello ${fullName || "team member"},</p>
        <p>Your Airtel IMS verification code is:</p>
        <p style="font-size: 28px; font-weight: 800; letter-spacing: 0.2em; color: #b9161c;">${otpCode}</p>
        <p>This code expires in 5 minutes.</p>
      </div>
    `,
  });

  if (!isSmtpConfigured) {
    console.log("Email OTP preview:", mail.message?.toString?.() || mail.messageId);
  }
}

async function sendPasswordResetLinkEmail({ email, firstName, lastName, resetLink }) {
  const fullName = `${firstName} ${lastName}`.trim();
  const mail = await mailTransport.sendMail({
    from: smtpFrom,
    to: isSmtpConfigured ? email : mailPreviewRecipient || smtpFrom,
    subject: "Reset your Airtel IMS password",
    text: [
      `Hello ${fullName},`,
      "",
      "A password reset was requested for your Airtel IMS account.",
      `Use this secure reset link: ${resetLink}`,
      "This link expires in 30 minutes.",
      "",
      "If you did not request this, you can ignore this email.",
    ].join("\n"),
    html: `
      <div style="font-family: Trebuchet MS, Segoe UI, sans-serif; color: #111111; line-height: 1.6;">
        <h2 style="color: #b9161c; margin-bottom: 12px;">Reset Your Password</h2>
        <p>Hello ${fullName || "team member"},</p>
        <p>A password reset was requested for your Airtel IMS account.</p>
        <p><a href="${resetLink}" style="display:inline-block;padding:12px 18px;background:#d91f26;color:#ffffff;text-decoration:none;border-radius:999px;font-weight:700;">Reset password</a></p>
        <p>If the button does not open, use this link:</p>
        <p style="word-break: break-all;">${resetLink}</p>
        <p>This link expires in 30 minutes. If you did not request this, you can ignore this email.</p>
      </div>
    `,
  });

  if (!isSmtpConfigured) {
    console.log("Password reset email preview:", mail.message?.toString?.() || mail.messageId);
  }

  return {
    sent: isSmtpConfigured,
    configurationHint: isSmtpConfigured
      ? ""
      : isGmailSender
        ? "Set SMTP_PASS in backend/.env to your Gmail App Password to enable real email delivery."
        : "Set SMTP_HOST, SMTP_USER, SMTP_PASS, and SMTP_FROM in backend/.env to enable real email delivery.",
  };
}

async function sendRequestLifecycleEmail({ to, subject, headline, intro, details = [], closing = "" }) {
  const textLines = [headline, "", intro, ...details, closing].filter(Boolean);
  const detailHtml = details.map((detail) => `<li>${detail}</li>`).join("");
  const mail = await mailTransport.sendMail({
    from: smtpFrom,
    to: isSmtpConfigured ? to : mailPreviewRecipient || smtpFrom,
    subject,
    text: textLines.join("\n"),
    html: `
      <div style="font-family: Trebuchet MS, Segoe UI, sans-serif; color: #111111; line-height: 1.6;">
        <h2 style="color: #b9161c; margin-bottom: 12px;">${headline}</h2>
        <p>${intro}</p>
        ${detailHtml ? `<ul>${detailHtml}</ul>` : ""}
        ${closing ? `<p>${closing}</p>` : ""}
      </div>
    `,
  });

  if (!isSmtpConfigured) {
    console.log("Request lifecycle email preview:", mail.message?.toString?.() || mail.messageId);
  }
}

async function trySendRequestLifecycleEmail(payload) {
  try {
    await sendRequestLifecycleEmail(payload);
  } catch (mailError) {
    console.error("Request lifecycle email failed:", mailError?.message || mailError);
  }
}

async function createAndSendAuthChallenge(user) {
  if (!user.email) {
    throw new Error("This account does not have an email address for verification.");
  }

  const challengeId = crypto.randomUUID();
  const emailOtp = generateOtpCode();

  await sendEmailOtp({
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    otpCode: emailOtp,
  });

  authChallenges.set(challengeId, {
    user,
    emailOtp,
    expiresAt: Date.now() + otpExpiryMs,
  });

  return {
    challengeId,
    emailHint: maskEmail(user.email),
    expiresInSeconds: Math.floor(otpExpiryMs / 1000),
  };
}

async function writeAuditLog({ actorUserId = null, targetUserId = null, actionKey, actionLabel, details = null }) {
  try {
    await pool.query(
      `
        INSERT INTO system_logs (actor_user_id, target_user_id, action_key, action_label, details)
        VALUES (?, ?, ?, ?, ?)
      `,
      [actorUserId, targetUserId, actionKey, actionLabel, details],
    );
  } catch (error) {
    console.error("Audit log write failed:", error?.message || error);
  }
}

function normalizeError(error) {
  if (error && typeof error === "object" && "code" in error) {
    if (error.code === "ER_DUP_ENTRY") {
      return "That record already exists.";
    }

    if (error.code === "ER_ROW_IS_REFERENCED_2" || error.code === "ER_ROW_IS_REFERENCED") {
      return "This user has linked records and cannot be deleted. Set the account inactive instead.";
    }
  }

  return error.message || "Something went wrong.";
}

function normalizeOptionalText(value, maxLength = null) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  if (!normalized) {
    return null;
  }

  return typeof maxLength === "number" && maxLength > 0 ? normalized.slice(0, maxLength) : normalized;
}

function normalizeRequiredText(value, maxLength = null) {
  return normalizeOptionalText(value, maxLength) || "";
}

function normalizeOptionalNumber(value, fallback = null) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : fallback;
}

function escapeRegExp(value) {
  return String(value).replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
}

function normalizeAssetTagCategoryCode(categoryName) {
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
}

function normalizeAssetTagCountrySegment(countryName) {
  const normalized = String(countryName || "RWANDA").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || "RWANDA";
}

async function getCategoryNameByIdLegacy(categoryId) {
  const [rows] = await pool.query("SELECT name FROM categories WHERE id = ? LIMIT 1", [categoryId]);
  return rows[0]?.name ? String(rows[0].name) : null;
}

async function getCountryNameByIdLegacy(countryId) {
  const [rows] = await pool.query("SELECT name FROM countries WHERE id = ? LIMIT 1", [countryId]);
  return rows[0]?.name ? String(rows[0].name) : null;
}

async function buildNextEquipmentAssetTag(countryName, categoryName) {
  const categoryCode = normalizeAssetTagCategoryCode(categoryName);
  if (!categoryCode) {
    return "";
  }

  const prefix = `AIRTEL-${normalizeAssetTagCountrySegment(countryName)}`;
  const patternBase = `${prefix}-${categoryCode}-`;
  const [rows] = await pool.query("SELECT asset_tag FROM equipment WHERE asset_tag LIKE ?", [`${patternBase}%`]);

  const nextIndex = rows.reduce((max, row) => {
    const assetTag = String(row.asset_tag || "");
    const match = assetTag.match(new RegExp(`^${escapeRegExp(patternBase)}(\\d+)$`, "i"));
    if (!match) {
      return max;
    }

    const value = Number(match[1]);
    return Number.isFinite(value) ? Math.max(max, value) : max;
  }, 0);

  return `${patternBase}${String(nextIndex + 1).padStart(5, "0")}`;
}

function normalizeTextList(values, maxLength = 120, maxItems = 24) {
  if (!Array.isArray(values)) {
    return [];
  }

  const normalizedValues = [];
  const seen = new Set();

  for (const value of values) {
    const normalized = normalizeOptionalText(value, maxLength);
    if (!normalized) {
      continue;
    }

    const dedupeKey = normalized.toLowerCase();
    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    normalizedValues.push(normalized);

    if (normalizedValues.length >= maxItems) {
      break;
    }
  }

  return normalizedValues;
}

function sanitizeEquipmentSpecs(equipmentSpecs) {
  if (!equipmentSpecs || typeof equipmentSpecs !== "object" || Array.isArray(equipmentSpecs)) {
    return null;
  }

  const sanitized = {};
  const fieldMap = {
    cpu: 160,
    ram: 80,
    storage: 120,
    storageCapacity: 120,
    storageType: 40,
    processor: 160,
    osVersion: 120,
    operatingSystem: 120,
    bundleType: 80,
    accessoryNotes: 400,
  };

  for (const [field, maxLength] of Object.entries(fieldMap)) {
    const normalized = normalizeOptionalText(equipmentSpecs[field], maxLength);
    if (normalized) {
      sanitized[field] = normalized;
    }
  }

  const accessories = normalizeTextList(equipmentSpecs.accessories, 120, 30);
  const requiredAccessories = normalizeTextList(equipmentSpecs.requiredAccessories, 120, 20);
  const suggestedAccessories = normalizeTextList(equipmentSpecs.suggestedAccessories, 120, 30);

  if (accessories.length > 0) {
    sanitized.accessories = accessories;
  }

  if (requiredAccessories.length > 0) {
    sanitized.requiredAccessories = requiredAccessories;
  }

  if (suggestedAccessories.length > 0) {
    sanitized.suggestedAccessories = suggestedAccessories;
  }

  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

function normalizeStockLocation(value) {
  const normalized = normalizeOptionalText(value, 40);
  if (!normalized) {
    return "it_stock";
  }

  return normalized === "warehouse_stock" ? "warehouse_stock" : "it_stock";
}

function isWarehouseRole(roleName) {
  const normalized = String(roleName || "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (
    normalized === "warehouse manager" ||
    normalized === "warehouse officer" ||
    normalized === "storekeeper" ||
    normalized.includes("warehouse")
  );
}

function canManageWarehouseInventory(roleName) {
  return isWarehouseRole(roleName);
}

function escapeCsvValue(value) {
  if (value === null || value === undefined) {
    return "";
  }

  const stringValue =
    value instanceof Date
      ? value.toISOString()
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);

  return `"${stringValue.replace(/"/g, '""')}"`;
}

function buildCsv(rows, columns) {
  const header = columns.map((column) => escapeCsvValue(column.label)).join(",");
  const body = rows.map((row) => columns.map((column) => escapeCsvValue(row[column.key])).join(",")).join("\n");
  return [header, body].filter(Boolean).join("\n");
}

function escapeHtmlValue(value) {
  if (value === null || value === undefined) {
    return "";
  }

  const stringValue =
    value instanceof Date
      ? value.toISOString()
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);

  return stringValue
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildBrandedHtmlDocument({ title, subtitle, rows, columns, footerNote = "Generated from Airtel IMS." }) {
  const generatedOn = new Date().toISOString().replace("T", " ").slice(0, 19);
  const tableHead = columns.map((column) => `<th>${escapeHtmlValue(column.label)}</th>`).join("");
  const tableBody = rows
    .map(
      (row) =>
        `<tr>${columns
          .map((column) => `<td>${escapeHtmlValue(row[column.key]) || "&nbsp;"}</td>`)
          .join("")}</tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtmlValue(title)}</title>
  <style>
    body { font-family: "Segoe UI", Arial, sans-serif; margin: 0; background: #f4f7fb; color: #17324d; }
    .page { max-width: 1280px; margin: 0 auto; padding: 32px; }
    .sheet { background: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 18px 45px rgba(23, 50, 77, 0.12); }
    .hero { padding: 28px 32px; background: linear-gradient(135deg, #ffffff 0%, #eef6fb 100%); border-bottom: 4px solid #d71920; display: flex; justify-content: space-between; gap: 20px; align-items: center; }
    .hero img { height: 46px; width: auto; display: block; }
    .eyebrow { margin: 0 0 8px; font-size: 12px; font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase; color: #d71920; }
    h1 { margin: 0; font-size: 28px; line-height: 1.2; }
    .subtitle { margin: 10px 0 0; font-size: 14px; color: #587287; max-width: 720px; }
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
          <h1>${escapeHtmlValue(title)}</h1>
          <p class="subtitle">${escapeHtmlValue(subtitle)}</p>
        </div>
        <div class="meta">
          <img src="/airtel-logo.png" alt="Airtel logo" />
          <strong>Professional Export</strong>
          <span>Generated: ${escapeHtmlValue(generatedOn)}</span>
          <span>Total records: ${rows.length}</span>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr>${tableHead}</tr></thead>
          <tbody>${tableBody}</tbody>
        </table>
      </div>
      <div class="footer">${escapeHtmlValue(footerNote)}</div>
    </div>
  </div>
</body>
</html>`;
}

async function buildBackupSnapshotPayload() {
  const tableQueries = {
    roles: "SELECT * FROM roles ORDER BY id ASC",
    permission: "SELECT * FROM permission ORDER BY id ASC",
    country: "SELECT * FROM country ORDER BY id ASC",
    branches: "SELECT * FROM branches ORDER BY id ASC",
    department: "SELECT * FROM department ORDER BY id ASC",
    categories: "SELECT * FROM categories ORDER BY id ASC",
    users: "SELECT * FROM users ORDER BY id ASC",
    equipment: "SELECT * FROM equipment ORDER BY id ASC",
    requests: "SELECT * FROM requests ORDER BY id ASC",
    assignments: "SELECT * FROM assignments ORDER BY id ASC",
    returns: "SELECT * FROM returns ORDER BY id ASC",
    issues: "SELECT * FROM issues ORDER BY id ASC",
    notifications: "SELECT * FROM notifications ORDER BY id ASC",
    request_workflow_steps: "SELECT * FROM request_workflow_steps ORDER BY id ASC",
    system_logs: "SELECT * FROM system_logs ORDER BY id ASC",
    system_settings: "SELECT * FROM system_settings ORDER BY setting_key ASC",
  };

  const tables = {};

  for (const [tableName, query] of Object.entries(tableQueries)) {
    const [rows] = await pool.query(query);
    tables[tableName] = rows;
  }

  return {
    exportedAt: new Date().toISOString(),
    tables,
  };
}

function buildInsertStatement(tableName, rows) {
  if (!rows || rows.length === 0) {
    return null;
  }

  const columns = Object.keys(rows[0]);
  const quotedColumns = columns.map((column) => `\`${column}\``).join(", ");
  const placeholders = `(${columns.map(() => "?").join(", ")})`;
  const statement = `INSERT INTO \`${tableName}\` (${quotedColumns}) VALUES ${rows.map(() => placeholders).join(", ")}`;
  const values = rows.flatMap((row) => columns.map((column) => row[column]));

  return { statement, values };
}

async function restoreBackupSnapshot(snapshotData) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    await connection.query("SET FOREIGN_KEY_CHECKS = 0");

    const deleteOrder = [
      "request_workflow_steps",
      "notifications",
      "issues",
      "returns",
      "assignments",
      "system_logs",
      "requests",
      "equipment",
      "users",
      "categories",
      "department",
      "branches",
      "country",
      "permission",
      "roles",
      "system_settings",
    ];

    for (const tableName of deleteOrder) {
      await connection.query(`DELETE FROM \`${tableName}\``);
    }

    const insertOrder = [
      "roles",
      "permission",
      "country",
      "branches",
      "department",
      "categories",
      "users",
      "equipment",
      "requests",
      "assignments",
      "returns",
      "issues",
      "notifications",
      "request_workflow_steps",
      "system_logs",
      "system_settings",
    ];

    for (const tableName of insertOrder) {
      const rows = snapshotData?.tables?.[tableName] ?? [];
      const insertStatement = buildInsertStatement(tableName, rows);

      if (insertStatement) {
        await connection.query(insertStatement.statement, insertStatement.values);
      }
    }

    await connection.query("SET FOREIGN_KEY_CHECKS = 1");
    await connection.commit();
  } catch (error) {
    await connection.rollback();
  try {
      await connection.query("SET FOREIGN_KEY_CHECKS = 1");
    } catch {
      // Ignore restore cleanup errors after rollback.
    }
    throw error;
  } finally {
    connection.release();
  }
}

function toSessionUser(user) {
  return {
    id: user.id,
    firstName: user.first_name,
    lastName: user.last_name,
    email: user.email,
    phoneNumber: user.phone_number,
    profileImageUrl: user.profile_image_url,
    jobTitle: user.job_title,
    employmentStatus: user.employment_status,
    officeLocation: user.office_location,
    startDate: user.start_date,
    mustChangePassword: Boolean(user.must_change_password),
    role: user.role_name,
    branchId: user.branch_id,
    branchName: user.branch_name,
    countryId: user.country_id,
    countryName: user.country_name,
    departmentId: user.department_id,
    unitId: user.unit_id,
  };
}

function isEmailIdentifier(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

const airtelCountries = [
  { name: "Chad", isoCode: "TD", currencyCode: "XAF" },
  { name: "Congo", isoCode: "CG", currencyCode: "XAF" },
  { name: "Democratic Republic of the Congo", isoCode: "CD", currencyCode: "CDF" },
  { name: "Gabon", isoCode: "GA", currencyCode: "XAF" },
  { name: "Kenya", isoCode: "KE", currencyCode: "KES" },
  { name: "Madagascar", isoCode: "MG", currencyCode: "MGA" },
  { name: "Malawi", isoCode: "MW", currencyCode: "MWK" },
  { name: "Niger", isoCode: "NE", currencyCode: "XOF" },
  { name: "Nigeria", isoCode: "NG", currencyCode: "NGN" },
  { name: "Rwanda", isoCode: "RW", currencyCode: "RWF" },
  { name: "Seychelles", isoCode: "SC", currencyCode: "SCR" },
  { name: "Tanzania", isoCode: "TZ", currencyCode: "TZS" },
  { name: "Uganda", isoCode: "UG", currencyCode: "UGX" },
  { name: "Zambia", isoCode: "ZM", currencyCode: "ZMW" },
];

const airtelCountryPhoneRules = [
  { name: "Chad", dialCode: "235", minLength: 8, maxLength: 8 },
  { name: "Congo", dialCode: "242", minLength: 9, maxLength: 9 },
  { name: "Democratic Republic of the Congo", dialCode: "243", minLength: 9, maxLength: 9 },
  { name: "Gabon", dialCode: "241", minLength: 8, maxLength: 8 },
  { name: "Kenya", dialCode: "254", minLength: 9, maxLength: 9 },
  { name: "Madagascar", dialCode: "261", minLength: 9, maxLength: 9 },
  { name: "Malawi", dialCode: "265", minLength: 9, maxLength: 9 },
  { name: "Niger", dialCode: "227", minLength: 8, maxLength: 8 },
  { name: "Nigeria", dialCode: "234", minLength: 10, maxLength: 10 },
  { name: "Rwanda", dialCode: "250", minLength: 9, maxLength: 9 },
  { name: "Seychelles", dialCode: "248", minLength: 7, maxLength: 7 },
  { name: "Tanzania", dialCode: "255", minLength: 9, maxLength: 9 },
  { name: "Uganda", dialCode: "256", minLength: 9, maxLength: 9 },
  { name: "Zambia", dialCode: "260", minLength: 9, maxLength: 9 },
];

function getAirtelPhoneRuleByCountryName(countryName) {
  if (!countryName) {
    return null;
  }

  return airtelCountryPhoneRules.find((rule) => rule.name === String(countryName).trim()) || null;
}

async function getCountryNameById(countryId) {
  if (!countryId) {
    return null;
  }

  // Support both legacy schemas ("countries") and current schema ("country").
  // Prefer the newer "country" table when present.
  try {
    const [rows] = await pool.query(
      `
        SELECT name
        FROM country
        WHERE id = ?
        LIMIT 1
      `,
      [Number(countryId)],
    );

    return rows[0]?.name || null;
  } catch {
    const [rows] = await pool.query(
      "SELECT name FROM countries WHERE id = ? LIMIT 1",
      [Number(countryId)],
    );
    return rows[0]?.name ? String(rows[0].name) : null;
  }
}

async function getCountryIdByBranchId(branchId) {
  if (!branchId) {
    return null;
  }

  const [rows] = await pool.query(
    `
      SELECT country_id
      FROM branches
      WHERE id = ?
      LIMIT 1
    `,
    [Number(branchId)],
  );

  return rows[0]?.country_id ? Number(rows[0].country_id) : null;
}

async function getFallbackCountryId() {
  const [rows] = await pool.query(
    `
      SELECT id
      FROM country
      ORDER BY id ASC
      LIMIT 1
    `,
  );

  return rows[0]?.id ? Number(rows[0].id) : null;
}

function normalizeAirtelPhoneNumber(value, countryName = null) {
  const rawValue = String(value || "").trim();
  const normalized = rawValue.replace(/[^\d+]/g, "");

  if (!normalized) {
    return null;
  }

  const digitsOnly = normalized.replace(/^\+/, "");
  const rwandaRule = getAirtelPhoneRuleByCountryName("Rwanda");

  const normalizeWithRule = (rule, localDigits) => {
    if (!rule || !/^\d+$/.test(localDigits)) {
      return null;
    }

    if (localDigits.length < rule.minLength || localDigits.length > rule.maxLength) {
      return null;
    }

    return `+${rule.dialCode}${localDigits}`;
  };

  for (const rule of airtelCountryPhoneRules) {
    if (digitsOnly.startsWith(rule.dialCode)) {
      const localDigits = digitsOnly.slice(rule.dialCode.length);
      return normalizeWithRule(rule, localDigits);
    }
  }

  if (rwandaRule && /^0?7[23]\d{7}$/.test(digitsOnly)) {
    const localDigits = digitsOnly.startsWith("0") ? digitsOnly.slice(1) : digitsOnly;
    return normalizeWithRule(rwandaRule, localDigits);
  }

  const selectedRule = getAirtelPhoneRuleByCountryName(countryName);

  if (selectedRule) {
    if (digitsOnly.startsWith("0")) {
      return normalizeWithRule(selectedRule, digitsOnly.slice(1));
    }

    return normalizeWithRule(selectedRule, digitsOnly);
  }

  return null;
}

const airtelBranches = [
  { countryName: "Rwanda", name: "Kigali HQ", branchCode: "RW-KGL-HQ" },
  { countryName: "Rwanda", name: "Musanze Branch", branchCode: "RW-MSZ" },
  { countryName: "Rwanda", name: "Huye Branch", branchCode: "RW-HYE" },
  { countryName: "Kenya", name: "Nairobi HQ", branchCode: "KE-NBO-HQ" },
  { countryName: "Kenya", name: "Mombasa Branch", branchCode: "KE-MBA" },
  { countryName: "Kenya", name: "Kisumu Branch", branchCode: "KE-KSM" },
  { countryName: "Uganda", name: "Kampala HQ", branchCode: "UG-KLA-HQ" },
  { countryName: "Uganda", name: "Gulu Branch", branchCode: "UG-GUL" },
  { countryName: "Uganda", name: "Mbarara Branch", branchCode: "UG-MBR" },
  { countryName: "Tanzania", name: "Dar es Salaam HQ", branchCode: "TZ-DAR-HQ" },
  { countryName: "Tanzania", name: "Arusha Branch", branchCode: "TZ-ARS" },
  { countryName: "Tanzania", name: "Mwanza Branch", branchCode: "TZ-MWZ" },
  { countryName: "Zambia", name: "Lusaka HQ", branchCode: "ZM-LSK-HQ" },
  { countryName: "Zambia", name: "Ndola Branch", branchCode: "ZM-NDL" },
  { countryName: "Zambia", name: "Kitwe Branch", branchCode: "ZM-KTW" },
  { countryName: "Nigeria", name: "Lagos HQ", branchCode: "NG-LGS-HQ" },
  { countryName: "Nigeria", name: "Abuja Branch", branchCode: "NG-ABJ" },
  { countryName: "Nigeria", name: "Port Harcourt Branch", branchCode: "NG-PHC" },
  { countryName: "Malawi", name: "Lilongwe HQ", branchCode: "MW-LLW-HQ" },
  { countryName: "Malawi", name: "Blantyre Branch", branchCode: "MW-BLT" },
  { countryName: "Madagascar", name: "Antananarivo HQ", branchCode: "MG-TNR-HQ" },
  { countryName: "Madagascar", name: "Toamasina Branch", branchCode: "MG-TMM" },
];

const workflowDefinitionDefaults = [
  {
    key: "hr_booking",
    label: "Device Booking",
    settingKey: "workflow_hr_booking_role",
    roleName: "HR recruitment officer",
  },
  {
    key: "it_inventory_review",
    label: "IT Inventory Review",
    settingKey: "workflow_it_inventory_role",
    roleName: "IT support engineer",
  },
  {
    key: "itd_approval",
    label: "ITD Approval",
    settingKey: "workflow_itd_role",
    roleName: "ITD",
  },
  {
    key: "hrd_approval",
    label: "HRD Approval",
    settingKey: "workflow_hrd_role",
    roleName: "HRD",
  },
  {
    key: "it_preparation",
    label: "IT Device Preparation",
    settingKey: "workflow_it_preparation_role",
    roleName: "IT support engineer",
  },
  {
    key: "security_review",
    label: "Security Handover Review",
    settingKey: "workflow_security_role",
    roleName: "IT security manager",
  },
  {
    key: "store_fulfillment",
    label: "Device Handover",
    settingKey: "workflow_fulfillment_role",
    roleName: "IT support engineer",
  },
];

const requestTypeLabels = {
  standard: "Standard request",
  new_hire: "New hire",
  replacement: "Replacement",
  loss_theft: "Loss or theft replacement",
};

const replacementWorkflowDefinitions = [
  {
    key: "hr_replacement_review",
    label: "HR Replacement Review",
    settingKey: "workflow_hr_booking_role",
    roleName: "HR recruitment officer",
  },
  {
    key: "it_replacement_validation",
    label: "IT Device Health Validation",
    settingKey: "workflow_it_inventory_role",
    roleName: "IT support engineer",
  },
  {
    key: "hr_replacement_booking",
    label: "HR Device Booking",
    settingKey: "workflow_hr_booking_role",
    roleName: "HR recruitment officer",
  },
  {
    key: "itd_approval",
    label: "ITD Approval",
    settingKey: "workflow_itd_role",
    roleName: "ITD",
  },
  {
    key: "hrd_approval",
    label: "HRD Approval",
    settingKey: "workflow_hrd_role",
    roleName: "HRD",
  },
  {
    key: "it_preparation",
    label: "IT Device Preparation",
    settingKey: "workflow_it_preparation_role",
    roleName: "IT support engineer",
  },
  {
    key: "security_review",
    label: "Security Handover Review",
    settingKey: "workflow_security_role",
    roleName: "IT security manager",
  },
  {
    key: "store_fulfillment",
    label: "Device Handover",
    settingKey: "workflow_fulfillment_role",
    roleName: "IT support engineer",
  },
];

const demoCategories = [
  { name: "Laptop", depreciationRate: 20 },
  { name: "Smartphone", depreciationRate: 25 },
  { name: "Router", depreciationRate: 18 },
  { name: "Printer", depreciationRate: 15 },
  { name: "Desktop", depreciationRate: 22 },
];

const requiredRoles = [
  ["admin", "Global system administrator"],
  ["HR DIRECTOR", "Approves HR device allocation and return decisions."],
  ["IT Director", "Approves device allocation and return decisions from IT leadership."],
  ["IT Support engineer", "Validates stock, prepares devices, and manages handover and returns."],
  ["Warehouse manager", "Oversees warehouse stock, approves move orders, and manages transfers into IT stock."],
  ["IT security manager", "Validates security requirements before handover and receives return alerts."],
  ["HR Recruitment officer", "Books devices for new hires and starts HR workflow actions."],
  ["Hr department", "General HR Department User"],
  ["IT officer", "IT Operations Officer"],
  ["IT infrastructure manager", "Tracks infrastructure impact, maintenance, and return alerts."],
  ["employee", "Standard employee user"],
];

const demoDepartmentNames = ["Operations", "HR", "IT Support", "IT Security", "IT Infrastructure", "Leadership"];
const demoOrgUnitNames = ["HR Kigali", "IT Kigali", "Ops Musanze", "Finance Kigali"];

const demoUsers = [
  {
    firstName: "Rachel",
    lastName: "Recruitment",
    email: "hr.recruitment@airtel.com",
    phoneNumber: "+250730000101",
    password: "HrRecruit@123",
    roleName: "HR Recruitment officer",
    employeeCode: "HR-REC-001",
    departmentName: "HR",
    orgUnitName: "HR Kigali",
  },
  {
    firstName: "Hilda",
    lastName: "HrDirector",
    email: "hrd@airtel.com",
    phoneNumber: "+250730000102",
    password: "HRD@123",
    roleName: "HR DIRECTOR",
    employeeCode: "HRD-001",
    departmentName: "Leadership",
    orgUnitName: "HR Kigali",
  },
  {
    firstName: "Simon",
    lastName: "Support",
    email: "it.support@airtel.com",
    phoneNumber: "+250730000103",
    password: "ITSupport@123",
    roleName: "IT Support engineer",
    employeeCode: "ITS-001",
    departmentName: "IT Support",
    orgUnitName: "IT Kigali",
  },
  {
    firstName: "Walter",
    lastName: "Manager",
    email: "warehouse.manager@airtel.com",
    phoneNumber: "+250730000109",
    password: "WarehouseMgr@123",
    roleName: "Warehouse manager",
    employeeCode: "WHM-001",
    departmentName: "Operations",
    orgUnitName: "Ops Musanze",
  },
  {
    firstName: "Irene",
    lastName: "Security",
    email: "it.security@airtel.com",
    phoneNumber: "+250730000104",
    password: "ITSecurity@123",
    roleName: "IT security manager",
    employeeCode: "ITSEC-001",
    departmentName: "IT Security",
    orgUnitName: "IT Kigali",
  },
  {
    firstName: "Ian",
    lastName: "Infrastructure",
    email: "it.infrastructure@airtel.com",
    phoneNumber: "+250730000105",
    password: "ITInfra@123",
    roleName: "IT infrastructure manager",
    employeeCode: "ITI-001",
    departmentName: "IT Infrastructure",
    orgUnitName: "IT Kigali",
  },
  {
    firstName: "David",
    lastName: "ItDirector",
    email: "itd@airtel.com",
    phoneNumber: "+250730000106",
    password: "ITD@123",
    roleName: "IT Director",
    employeeCode: "ITD-001",
    departmentName: "Leadership",
    orgUnitName: "IT Kigali",
  },
  {
    firstName: "Emma",
    lastName: "Employee",
    email: "employee@airtel.com",
    phoneNumber: "+250730000107",
    password: "Employee@123",
    roleName: "employee",
    employeeCode: "EMP-001",
    departmentName: "Operations",
    orgUnitName: "Ops Musanze",
  },
];

const demoEquipment = [
  {
    assetTag: "RW-LAP-001",
    serialNumber: "SN-RW-LAP-001",
    equipmentName: "Dell Latitude 5440",
    categoryName: "Laptop",
    countryName: "Rwanda",
    branchName: "Kigali HQ",
    status: "available",
    purchaseCost: 1350,
  },
  {
    assetTag: "RW-LAP-002",
    serialNumber: "SN-RW-LAP-002",
    equipmentName: "HP EliteBook 840",
    categoryName: "Laptop",
    countryName: "Rwanda",
    branchName: "Kigali HQ",
    status: "available",
    purchaseCost: 1280,
  },
  {
    assetTag: "RW-PHN-001",
    serialNumber: "SN-RW-PHN-001",
    equipmentName: "Samsung Galaxy A55",
    categoryName: "Smartphone",
    countryName: "Rwanda",
    branchName: "Kigali HQ",
    status: "available",
    purchaseCost: 420,
  },
  {
    assetTag: "RW-ROU-001",
    serialNumber: "SN-RW-ROU-001",
    equipmentName: "Huawei Branch Router",
    categoryName: "Router",
    countryName: "Rwanda",
    branchName: "Kigali HQ",
    status: "maintenance",
    purchaseCost: 890,
  },
  {
    assetTag: "RW-DES-001",
    serialNumber: "SN-RW-DES-001",
    equipmentName: "Lenovo ThinkCentre",
    categoryName: "Desktop",
    countryName: "Rwanda",
    branchName: "Musanze Branch",
    status: "available",
    purchaseCost: 980,
  },
  {
    assetTag: "RW-WH-LAP-003",
    serialNumber: "SN-RW-WH-LAP-003",
    equipmentName: "Lenovo ThinkPad E14",
    categoryName: "Laptop",
    countryName: "Rwanda",
    branchName: "Kigali HQ",
    status: "available",
    purchaseCost: 1180,
    stockLocation: "warehouse_stock",
  },
  {
    assetTag: "RW-WH-DES-002",
    serialNumber: "SN-RW-WH-DES-002",
    equipmentName: "Dell OptiPlex 7010",
    categoryName: "Desktop",
    countryName: "Rwanda",
    branchName: "Kigali HQ",
    status: "available",
    purchaseCost: 1010,
    stockLocation: "warehouse_stock",
  },
];

async function ensureRequestWorkflowTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS request_workflow_steps (
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
    )
  `);

  await pool.query(`
    ALTER TABLE request_workflow_steps
    MODIFY COLUMN action_status ENUM('pending', 'approved', 'rejected', 'fulfilled', 'returned') DEFAULT 'pending'
  `);
}

async function ensureRequestClarificationColumns() {
  await pool.query(`
    ALTER TABLE requests
    ADD COLUMN IF NOT EXISTS clarification_status VARCHAR(20) NOT NULL DEFAULT 'none'
  `);

  await pool.query(`
    ALTER TABLE requests
    ADD COLUMN IF NOT EXISTS clarification_note TEXT NULL
  `);

  await pool.query(`
    ALTER TABLE requests
    ADD COLUMN IF NOT EXISTS clarification_requested_by BIGINT NULL
  `);

  await pool.query(`
    ALTER TABLE requests
    ADD COLUMN IF NOT EXISTS clarification_requested_at TIMESTAMP NULL
  `);

  await pool.query(`
    ALTER TABLE requests
    ADD COLUMN IF NOT EXISTS clarification_target_user_id BIGINT NULL
  `);

  await pool.query(`
    ALTER TABLE requests
    ADD COLUMN IF NOT EXISTS clarification_target_role VARCHAR(100) NULL
  `);
}

async function ensureUserPasswordOnboardingColumns() {
  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS must_change_password TINYINT(1) NOT NULL DEFAULT 0
  `);
}

async function ensureEquipmentLifespanColumn() {
  await pool.query(`
    ALTER TABLE equipment
    ADD COLUMN IF NOT EXISTS lifespan_years INT NOT NULL DEFAULT 4
  `);

  await pool.query(`
    ALTER TABLE equipment
    MODIFY COLUMN lifespan_years INT NOT NULL DEFAULT 4
  `);

  await pool.query(`
    UPDATE equipment
    SET lifespan_years = 4
    WHERE lifespan_years IS NULL OR lifespan_years <= 0
  `);
}

async function ensureEquipmentSpecsColumn() {
  await pool.query(`
    ALTER TABLE equipment
    ADD COLUMN IF NOT EXISTS equipment_specs JSON NULL
  `);
}

async function ensureEquipmentStatusColumn() {
  await pool.query(`
    ALTER TABLE equipment
    MODIFY COLUMN status ENUM('available', 'assigned', 'reserved', 'maintenance', 'retired', 'lost') DEFAULT 'available'
  `);

  try {
    await pool.query(`
      UPDATE equipment e
      INNER JOIN move_order_request_items i ON i.equipment_id = e.id
      INNER JOIN move_order_requests r ON r.id = i.move_order_request_id
      SET e.status = 'reserved'
      WHERE r.status IN ('approved', 'partial')
        AND r.receipt_status = 'pending'
        AND e.stock_location = 'warehouse_stock'
        AND (e.status IS NULL OR e.status = '')
    `);
  } catch (error) {
    console.log("Equipment status update skipped - move_order_requests table or column not available yet");
  }

  await pool.query(`
    UPDATE equipment
    SET status = 'available'
    WHERE status IS NULL OR status = ''
  `);
}

async function ensureEquipmentProfileColumns() {
  await pool.query(`
    ALTER TABLE equipment
    ADD COLUMN IF NOT EXISTS computer_name VARCHAR(150) NULL
  `);

  await pool.query(`
    ALTER TABLE equipment
    ADD COLUMN IF NOT EXISTS vendor_name VARCHAR(150) NULL
  `);

  await pool.query(`
    ALTER TABLE equipment
    ADD COLUMN IF NOT EXISTS model_name VARCHAR(150) NULL
  `);

  await pool.query(`
    ALTER TABLE equipment
    ADD COLUMN IF NOT EXISTS purchase_year INT NULL
  `);

  await pool.query(`
    ALTER TABLE equipment
    ADD COLUMN IF NOT EXISTS location_details VARCHAR(180) NULL
  `);

  await pool.query(`
    ALTER TABLE equipment
    ADD COLUMN IF NOT EXISTS device_health VARCHAR(80) NULL
  `);

  await pool.query(`
    ALTER TABLE equipment
    ADD COLUMN IF NOT EXISTS asset_type VARCHAR(80) NULL
  `);

  await pool.query(`
    ALTER TABLE equipment
    ADD COLUMN IF NOT EXISTS base_configuration_name VARCHAR(120) NULL
  `);

  await pool.query(`
    ALTER TABLE equipment
    ADD COLUMN IF NOT EXISTS base_configuration_grade VARCHAR(80) NULL
  `);

  await pool.query(`
    ALTER TABLE equipment
    ADD COLUMN IF NOT EXISTS refresh_due_at DATE NULL
  `);

  await pool.query(`
    ALTER TABLE equipment
    ADD COLUMN IF NOT EXISTS stock_location VARCHAR(40) NOT NULL DEFAULT 'it_stock'
  `);

  await pool.query(`
    UPDATE equipment
    SET stock_location = 'it_stock'
    WHERE stock_location IS NULL OR stock_location = ''
  `);

  await pool.query(`
    UPDATE equipment
    SET refresh_due_at = DATE_ADD(COALESCE(purchase_date, STR_TO_DATE(CONCAT(purchase_year, '-01-01'), '%Y-%m-%d')), INTERVAL COALESCE(lifespan_years, 4) YEAR)
    WHERE refresh_due_at IS NULL
      AND (purchase_date IS NOT NULL OR purchase_year IS NOT NULL)
  `);
}

async function ensureUserPhoneColumn() {
  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20) NULL
  `);
  await pool.query(`
    ALTER TABLE users
    ADD UNIQUE INDEX IF NOT EXISTS uq_users_phone_number (phone_number)
  `).catch(() => undefined);
}

async function ensureUserProfileImageColumn() {
  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS profile_image_url LONGTEXT NULL
  `);
}

async function ensureUserFederatedAuthColumns() {
  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(80) NULL
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS external_auth_id VARCHAR(255) NULL
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS username_upn VARCHAR(255) NULL
  `);
}

async function ensureUserEmploymentColumns() {
  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS job_title VARCHAR(120) NULL
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS employment_status VARCHAR(40) NULL
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS office_location VARCHAR(160) NULL
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS start_date DATE NULL
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS employee_grade VARCHAR(80) NULL
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS hrms_employee_id VARCHAR(120) NULL
  `);
}

async function ensureRequestFulfillmentColumns() {
  await pool.query(`
    ALTER TABLE requests
    ADD COLUMN IF NOT EXISTS fulfillment_status VARCHAR(40) NOT NULL DEFAULT 'ready'
  `);

  await pool.query(`
    ALTER TABLE requests
    ADD COLUMN IF NOT EXISTS fulfillment_note TEXT NULL
  `);

  await pool.query(`
    ALTER TABLE requests
    ADD COLUMN IF NOT EXISTS fulfillment_updated_at TIMESTAMP NULL
  `);

  await pool.query(`
    ALTER TABLE requests
    ADD COLUMN IF NOT EXISTS request_type VARCHAR(40) NOT NULL DEFAULT 'standard'
  `);

  await pool.query(`
    ALTER TABLE requests
    ADD COLUMN IF NOT EXISTS target_employee_user_id BIGINT NULL
  `);

  await pool.query(`
    ALTER TABLE requests
    ADD COLUMN IF NOT EXISTS source_request_id BIGINT NULL
  `);

  await pool.query(`
    ALTER TABLE requests
    ADD COLUMN IF NOT EXISTS source_equipment_id BIGINT NULL
  `);

  await pool.query(`
    ALTER TABLE requests
    ADD COLUMN IF NOT EXISTS replacement_disposition VARCHAR(40) NULL
  `);

  await pool.query(`
    ALTER TABLE requests
    ADD COLUMN IF NOT EXISTS replacement_condition_status VARCHAR(100) NULL
  `);

  await pool.query(`
    ALTER TABLE requests
    ADD COLUMN IF NOT EXISTS report_type VARCHAR(20) NULL
  `);

  await pool.query(`
    ALTER TABLE requests
    ADD COLUMN IF NOT EXISTS hrms_snapshot JSON NULL
  `);

  await pool.query(`
    ALTER TABLE requests
    ADD COLUMN IF NOT EXISTS booked_equipment_id BIGINT NULL
  `);

  await pool.query(`
    ALTER TABLE requests
    ADD COLUMN IF NOT EXISTS final_security_approval_status VARCHAR(20) NOT NULL DEFAULT 'pending'
  `);

  await pool.query(`
    ALTER TABLE requests
    ADD COLUMN IF NOT EXISTS final_security_approved_at TIMESTAMP NULL
  `);

  await pool.query(`
    ALTER TABLE requests
    ADD COLUMN IF NOT EXISTS final_security_approved_by BIGINT NULL
  `);
}

async function ensureAssignmentReceiptColumns() {
  await pool.query(`
    ALTER TABLE assignments
    ADD COLUMN IF NOT EXISTS receipt_status VARCHAR(40) NOT NULL DEFAULT 'pending'
  `);

  await pool.query(`
    ALTER TABLE assignments
    ADD COLUMN IF NOT EXISTS received_confirmed_at TIMESTAMP NULL
  `);

  await pool.query(`
    ALTER TABLE assignments
    ADD COLUMN IF NOT EXISTS receipt_note TEXT NULL
  `);

  await pool.query(`
    ALTER TABLE assignments
    ADD COLUMN IF NOT EXISTS request_id BIGINT NULL
  `);
}

async function ensureDeviceConfigurationTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS device_configurations (
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
    )
  `);
}

async function ensureDeviceBundleTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS device_bundle_items (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      parent_equipment_id BIGINT NOT NULL,
      child_equipment_id BIGINT NOT NULL,
      item_role VARCHAR(80) NOT NULL,
      is_required TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_device_bundle_parent (parent_equipment_id),
      INDEX idx_device_bundle_child (child_equipment_id)
    )
  `);
}

async function ensureDeviceBookingsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS device_bookings (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      request_id BIGINT NOT NULL,
      booked_for_user_id BIGINT NOT NULL,
      booked_by_user_id BIGINT NOT NULL,
      equipment_id BIGINT NULL,
      booking_status ENUM('reserved', 'released', 'consumed', 'cancelled') DEFAULT 'reserved',
      booking_note TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_device_booking_request (request_id),
      INDEX idx_device_booking_employee (booked_for_user_id),
      INDEX idx_device_booking_equipment (equipment_id)
    )
  `);
}

async function ensureSecurityReviewTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS security_handover_reviews (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      request_id BIGINT NOT NULL,
      equipment_id BIGINT NULL,
      reviewed_by_user_id BIGINT NULL,
      review_status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
      review_note TEXT NULL,
      reviewed_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_security_review_request (request_id),
      INDEX idx_security_review_equipment (equipment_id)
    )
  `);
}

async function ensureLossTheftReportsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS loss_theft_reports (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      equipment_id BIGINT NOT NULL,
      employee_user_id BIGINT NOT NULL,
      report_type ENUM('loss', 'theft') NOT NULL,
      incident_note TEXT NULL,
      declared_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      created_request_id BIGINT NULL,
      INDEX idx_loss_theft_equipment (equipment_id),
      INDEX idx_loss_theft_employee (employee_user_id)
    )
  `);
}

async function ensureAuthProvidersTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_providers (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      provider_name VARCHAR(80) NOT NULL,
      provider_type ENUM('local', 'ldap', 'sso') NOT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      config_json JSON NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    ALTER TABLE auth_providers
    ADD UNIQUE KEY uq_auth_provider_name (provider_name)
  `).catch(() => undefined);

  await pool.query(
    `
      INSERT INTO auth_providers (provider_name, provider_type, is_active, config_json)
      VALUES (?, 'local', 1, NULL)
      ON DUPLICATE KEY UPDATE
        provider_type = VALUES(provider_type),
        is_active = VALUES(is_active)
    `,
    ["local"],
  ).catch(() => undefined);

  await pool.query(
    `
      INSERT INTO auth_providers (provider_name, provider_type, is_active, config_json)
      VALUES (?, 'sso', ?, ?)
      ON DUPLICATE KEY UPDATE
        provider_type = VALUES(provider_type),
        is_active = VALUES(is_active),
        config_json = VALUES(config_json)
    `,
    [
      "microsoft",
      isMicrosoftSsoConfigured() ? 1 : 0,
      JSON.stringify({
        tenantId: microsoftTenantId || null,
        clientId: microsoftClientId || null,
        redirectUri: microsoftRedirectUri || null,
      }),
    ],
  ).catch(() => undefined);
}

async function ensureAssetLifecycleEventsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS asset_lifecycle_events (
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
      INDEX idx_asset_lifecycle_created (created_at)
    )
  `);
}

async function ensureMaintenanceRecordsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS maintenance_records (
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
      INDEX idx_maintenance_status (maintenance_status)
    )
  `);
}

async function ensureDeviceMonitoringTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS device_agents (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      equipment_id BIGINT NOT NULL,
      device_uuid VARCHAR(120) NOT NULL,
      hostname VARCHAR(160) NOT NULL,
      operating_system VARCHAR(120) NULL,
      agent_version VARCHAR(40) NULL,
      last_seen_at TIMESTAMP NULL,
      last_ip_address VARCHAR(80) NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_device_agent_uuid (device_uuid),
      INDEX idx_device_agents_equipment (equipment_id),
      INDEX idx_device_agents_last_seen (last_seen_at)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS device_metrics (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      equipment_id BIGINT NOT NULL,
      agent_id BIGINT NULL,
      cpu_usage DECIMAL(5,2) NOT NULL DEFAULT 0,
      ram_usage DECIMAL(5,2) NOT NULL DEFAULT 0,
      disk_usage DECIMAL(5,2) NOT NULL DEFAULT 0,
      disk_health DECIMAL(5,2) NULL,
      battery_health DECIMAL(5,2) NULL,
      battery_level DECIMAL(5,2) NULL,
      network_latency DECIMAL(8,2) NULL,
      packet_loss DECIMAL(5,2) NULL,
      temperature DECIMAL(5,2) NULL,
      uptime_seconds BIGINT NOT NULL DEFAULT 0,
      workload_intensity DECIMAL(5,2) NULL,
      error_count INT NOT NULL DEFAULT 0,
      metrics_payload JSON NULL,
      recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_device_metrics_equipment (equipment_id, recorded_at),
      INDEX idx_device_metrics_agent (agent_id, recorded_at)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS alerts (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      equipment_id BIGINT NOT NULL,
      metric_id BIGINT NULL,
      alert_type VARCHAR(80) NOT NULL,
      severity ENUM('low', 'medium', 'high', 'critical') NOT NULL DEFAULT 'medium',
      status ENUM('open', 'acknowledged', 'resolved') NOT NULL DEFAULT 'open',
      message TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_alerts_equipment (equipment_id, created_at),
      INDEX idx_alerts_status (status, severity)
    )
  `).catch(() => undefined);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ml_recommendations (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      equipment_id BIGINT NOT NULL,
      metric_id BIGINT NULL,
      recommendation VARCHAR(120) NOT NULL,
      confidence_score DECIMAL(5,2) NULL,
      probability DECIMAL(7,4) NULL,
      model_version VARCHAR(60) NULL,
      reasons_json JSON NULL,
      generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_ml_recommendations_equipment (equipment_id, generated_at)
    )
  `);
}

let replacementMlModel = null;
let iotFailureModel = null;
const IOT_FAILURE_FEATURE_NAMES = [
  "cpu_usage",
  "memory_usage",
  "battery_level",
  "network_latency",
  "packet_loss",
  "temperature",
  "uptime",
  "workload_intensity",
  "error_count",
];

async function ensureUserIdentifierSecurityColumns() {
  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS employee_code_hash VARCHAR(64) NULL,
    ADD COLUMN IF NOT EXISTS hrms_employee_id_hash VARCHAR(64) NULL
  `);

  const [rows] = await pool.query(`
    SELECT id, employee_code, hrms_employee_id
    FROM users
    WHERE (employee_code IS NOT NULL AND employee_code_hash IS NULL)
      OR (hrms_employee_id IS NOT NULL AND hrms_employee_id_hash IS NULL)
  `);

  for (const row of rows) {
    await pool.query(
      `
        UPDATE users
        SET employee_code_hash = ?, hrms_employee_id_hash = ?
        WHERE id = ?
      `,
      [hashProtectedIdentifier(row.employee_code), hashProtectedIdentifier(row.hrms_employee_id), Number(row.id)],
    );
  }
}

async function ensureReplacementMlModelsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS replacement_ml_models (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      model_key VARCHAR(64) NOT NULL,
      model_version VARCHAR(40) NOT NULL,
      feature_names_json LONGTEXT NOT NULL,
      weights_json LONGTEXT NOT NULL,
      intercept DOUBLE NOT NULL DEFAULT 0,
      metrics_json LONGTEXT NULL,
      created_by_user_id BIGINT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_replacement_ml_key_created (model_key, created_at)
    )
  `);

  const [rows] = await pool.query(
    `
      SELECT model_key, model_version, feature_names_json, weights_json, intercept, metrics_json, created_at
      FROM replacement_ml_models
      WHERE model_key = 'device_replacement'
      ORDER BY id DESC
      LIMIT 1
    `,
  );

  if (rows.length > 0) {
    const record = rows[0];
    try {
      replacementMlModel = {
        key: record.model_key,
        version: record.model_version,
        featureNames: JSON.parse(record.feature_names_json),
        weights: JSON.parse(record.weights_json),
        intercept: Number(record.intercept || 0),
        metrics: record.metrics_json ? JSON.parse(record.metrics_json) : null,
        createdAt: record.created_at,
      };
    } catch (error) {
      console.error("Failed to load replacement ML model:", error);
      replacementMlModel = null;
    }
  }
}

async function ensureIotFailureModel() {
  for (const candidate of [IOT_FAILURE_MODEL_FILE, IOT_FAILURE_LEGACY_MODEL_FILE]) {
    try {
      const fileText = await fs.readFile(candidate, "utf8");
      const record = JSON.parse(fileText);
      if (record?.featureNames?.length && Array.isArray(record.weights)) {
        iotFailureModel = {
          key: record.key || "device_failure",
          version: record.version || "v1",
          featureNames: record.featureNames,
          weights: record.weights,
          intercept: Number(record.intercept || 0),
          preprocessing: record.preprocessing || null,
          metrics: record.metrics || null,
          createdAt: record.createdAt || new Date().toISOString(),
        };
        return;
      }
    } catch {
      // Try the next candidate file.
    }
  }

  iotFailureModel = null;
}

function parseCsvLinesAsArrays(csvText) {
  return csvText
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split(",").map((value) => value.trim()));
}

async function loadIotFailureExamples() {
  const csvText = await fs.readFile(IOT_FAILURE_DATA_FILE, "utf8");
  const rows = parseCsvLinesAsArrays(csvText);
  rows.shift();

  return rows
    .map((values) => ({
      x: {
        featureNames: IOT_FAILURE_FEATURE_NAMES,
        values: [
          Number(values[1] || 0),
          Number(values[2] || 0),
          Number(values[3] || 0),
          Number(values[4] || 0),
          Number(values[5] || 0),
          Number(values[6] || 0),
          Number(values[7] || 0),
          Number(values[8] || 0),
          Number(values[9] || 0),
        ],
      },
      y: Number(values[10] || 0) > 0 ? 1 : 0,
    }))
    .filter((example) => example.x.values.length === IOT_FAILURE_FEATURE_NAMES.length);
}

function buildIotFailureFeatureVectorFromEquipment(equipmentRow, assignmentHours = 0, issueCount = 0, repairCount = 0) {
  const normalizedHealth = String(equipmentRow.device_health || "").toLowerCase();
  const healthBad = ["faulty", "poor", "damaged", "critical", "broken", "hot", "overheated", "unstable"].some((term) =>
    normalizedHealth.includes(term),
  );

  const cpuUsage = healthBad ? 85 : 48;
  const memoryUsage = healthBad ? 72 : 42;
  const batteryLevel = normalizedHealth.includes("battery") ? 28 : 82;
  const networkLatency = healthBad ? 150 : 90;
  const packetLoss = healthBad ? 1.5 : 0.3;
  const temperature = healthBad ? 48 : 34;
  const uptime = Number(assignmentHours || 80);
  const workloadIntensity = Math.min(3, 1 + Math.floor(repairCount / 2));
  const errorCount = Number(issueCount || 0);

  return {
    featureNames: IOT_FAILURE_FEATURE_NAMES,
    values: [cpuUsage, memoryUsage, batteryLevel, networkLatency, packetLoss, temperature, uptime, workloadIntensity, errorCount],
  };
}

function getClientIpAddress(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req.socket?.remoteAddress || null;
}

function canAccessDeviceMonitoring(actor) {
  const allowedRoles = new Set([
    "admin",
    "IT Director",
    "IT infrastructure manager",
    "IT security manager",
    "IT Support engineer",
    "IT officer",
  ]);
  return Boolean(actor && allowedRoles.has(String(actor.role_name || "")));
}

function getDeviceAgentRequestKey(req) {
  return String(req.headers["x-device-agent-key"] || req.headers.authorization || "")
    .replace(/^Bearer\s+/i, "")
    .trim();
}

function isAuthorizedDeviceAgentRequest(req) {
  const candidate = getDeviceAgentRequestKey(req);
  return Boolean(candidate) && candidate === deviceAgentApiKey;
}

function coerceFiniteNumber(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toMetricScore(value, fallback = 0) {
  const numeric = coerceFiniteNumber(value, fallback);
  if (numeric === null) {
    return fallback;
  }
  return Math.max(0, Math.min(100, numeric));
}

function deriveDeviceHealthLabel({ cpuUsage, ramUsage, diskUsage, batteryHealth, temperature, packetLoss }) {
  const riskSignals = [
    toMetricScore(cpuUsage),
    toMetricScore(ramUsage),
    toMetricScore(diskUsage),
    toMetricScore(100 - (coerceFiniteNumber(batteryHealth, 100) ?? 100)),
    Math.min(toMetricScore(temperature, 35) * 1.4, 100),
    Math.min(toMetricScore(packetLoss, 0) * 15, 100),
  ];
  const risk = riskSignals.reduce((sum, current) => sum + current, 0) / riskSignals.length;

  if (risk >= 78) {
    return "critical";
  }
  if (risk >= 62) {
    return "poor";
  }
  if (risk >= 42) {
    return "fair";
  }
  return "healthy";
}

function buildDeviceMonitoringAlerts(metrics) {
  const alerts = [];
  const addAlert = (alertType, severity, message) => {
    alerts.push({ alertType, severity, message });
  };

  if (toMetricScore(metrics.cpuUsage) >= 90) {
    addAlert("high_cpu_usage", "high", "CPU usage is persistently above 90%.");
  } else if (toMetricScore(metrics.cpuUsage) >= 80) {
    addAlert("cpu_usage_warning", "medium", "CPU usage is above the recommended operating range.");
  }

  if (toMetricScore(metrics.ramUsage) >= 92) {
    addAlert("high_memory_usage", "high", "RAM usage is critically high.");
  } else if (toMetricScore(metrics.ramUsage) >= 85) {
    addAlert("memory_usage_warning", "medium", "RAM usage is elevated and should be reviewed.");
  }

  if (toMetricScore(metrics.diskUsage) >= 95) {
    addAlert("disk_capacity_critical", "critical", "Disk usage exceeded 95%.");
  } else if (toMetricScore(metrics.diskUsage) >= 85) {
    addAlert("disk_capacity_warning", "medium", "Disk usage is above 85%.");
  }

  if (coerceFiniteNumber(metrics.batteryHealth) !== null && toMetricScore(metrics.batteryHealth) <= 55) {
    addAlert("battery_health_degraded", "high", "Battery health dropped below 55%.");
  } else if (coerceFiniteNumber(metrics.batteryHealth) !== null && toMetricScore(metrics.batteryHealth) <= 70) {
    addAlert("battery_health_warning", "medium", "Battery health is degrading.");
  }

  if (coerceFiniteNumber(metrics.temperature) !== null && Number(metrics.temperature) >= 75) {
    addAlert("temperature_critical", "critical", "Device temperature is critically high.");
  } else if (coerceFiniteNumber(metrics.temperature) !== null && Number(metrics.temperature) >= 65) {
    addAlert("temperature_warning", "high", "Device temperature is elevated.");
  }

  if (coerceFiniteNumber(metrics.packetLoss) !== null && Number(metrics.packetLoss) >= 5) {
    addAlert("packet_loss_high", "high", "Packet loss is above 5%.");
  }

  if (coerceFiniteNumber(metrics.networkLatency) !== null && Number(metrics.networkLatency) >= 250) {
    addAlert("network_latency_high", "medium", "Network latency is above 250ms.");
  }

  return alerts;
}

async function getEquipmentByAssetTag(assetTag) {
  const [rows] = await pool.query(
    `
      SELECT id, asset_tag, computer_name, serial_number, device_health, equipment_name, status
      FROM equipment
      WHERE asset_tag = ?
      LIMIT 1
    `,
    [assetTag],
  );
  return rows[0] || null;
}

async function upsertDeviceAgentRecord({ equipmentId, deviceUuid, hostname, operatingSystem, agentVersion, ipAddress }) {
  await pool.query(
    `
      INSERT INTO device_agents (
        equipment_id,
        device_uuid,
        hostname,
        operating_system,
        agent_version,
        last_seen_at,
        last_ip_address,
        is_active
      ) VALUES (?, ?, ?, ?, ?, NOW(), ?, 1)
      ON DUPLICATE KEY UPDATE
        equipment_id = VALUES(equipment_id),
        hostname = VALUES(hostname),
        operating_system = VALUES(operating_system),
        agent_version = VALUES(agent_version),
        last_seen_at = NOW(),
        last_ip_address = VALUES(last_ip_address),
        is_active = 1
    `,
    [equipmentId, deviceUuid, hostname, operatingSystem || null, agentVersion || null, ipAddress || null],
  );

  const [rows] = await pool.query(
    `
      SELECT id, equipment_id, device_uuid, hostname, operating_system, agent_version, last_seen_at
      FROM device_agents
      WHERE device_uuid = ?
      LIMIT 1
    `,
    [deviceUuid],
  );

  return rows[0] || null;
}

async function fetchRecentDeviceContext(equipmentId) {
  const [issueRows] = await pool.query(
    `
      SELECT COUNT(*) AS issue_count
      FROM issues
      WHERE equipment_id = ?
    `,
    [equipmentId],
  );
  const [maintenanceRows] = await pool.query(
    `
      SELECT COUNT(*) AS repair_count
      FROM maintenance_records
      WHERE equipment_id = ?
    `,
    [equipmentId],
  );
  const [assignmentRows] = await pool.query(
    `
      SELECT assigned_at
      FROM assignments
      WHERE equipment_id = ? AND status = 'active'
      ORDER BY assigned_at DESC
      LIMIT 1
    `,
    [equipmentId],
  );

  const assignmentHours = assignmentRows[0]?.assigned_at
    ? Math.max((Date.now() - new Date(assignmentRows[0].assigned_at).getTime()) / (1000 * 60 * 60), 0)
    : 0;

  return {
    assignmentHours,
    issueCount: Number(issueRows[0]?.issue_count || 0),
    repairCount: Number(maintenanceRows[0]?.repair_count || 0),
  };
}

async function generateDeviceRecommendation({ equipment, metricId, metrics }) {
  const context = await fetchRecentDeviceContext(equipment.id);
  const featureVector = {
    featureNames: IOT_FAILURE_FEATURE_NAMES,
    values: [
      toMetricScore(metrics.cpuUsage),
      toMetricScore(metrics.ramUsage),
      toMetricScore(metrics.batteryLevel, 100),
      coerceFiniteNumber(metrics.networkLatency, 0) ?? 0,
      coerceFiniteNumber(metrics.packetLoss, 0) ?? 0,
      coerceFiniteNumber(metrics.temperature, 35) ?? 35,
      Math.max(Math.round((coerceFiniteNumber(metrics.uptimeSeconds, 0) ?? 0) / 3600), 0),
      toMetricScore(metrics.workloadIntensity, Math.round((toMetricScore(metrics.cpuUsage) + toMetricScore(metrics.ramUsage)) / 2)),
      Number(metrics.errorCount || 0),
    ],
  };

  const probability = iotFailureModel ? predictReplacementProbability(featureVector, iotFailureModel) : null;
  const recommendation = typeof probability === "number"
    ? probability >= 0.7
      ? "Replacement Recommended"
      : probability >= 0.4
        ? "Maintenance Recommended"
        : "Healthy - No Action Required"
    : "Monitoring Active - Model Unavailable";

  const reasons = [];
  if (toMetricScore(metrics.cpuUsage) >= 80) {
    reasons.push(`CPU usage is elevated at ${toMetricScore(metrics.cpuUsage).toFixed(0)}%.`);
  }
  if (toMetricScore(metrics.ramUsage) >= 85) {
    reasons.push(`RAM usage is elevated at ${toMetricScore(metrics.ramUsage).toFixed(0)}%.`);
  }
  if (coerceFiniteNumber(metrics.batteryHealth) !== null && toMetricScore(metrics.batteryHealth) <= 70) {
    reasons.push(`Battery health is reduced to ${toMetricScore(metrics.batteryHealth).toFixed(0)}%.`);
  }
  if (coerceFiniteNumber(metrics.temperature) !== null && Number(metrics.temperature) >= 65) {
    reasons.push(`Temperature reached ${Number(metrics.temperature).toFixed(1)}C.`);
  }
  if (!reasons.length) {
    reasons.push("Latest telemetry is within the expected operating range.");
  }
  if (context.repairCount > 0) {
    reasons.push(`Historical maintenance count: ${context.repairCount}.`);
  }
  if (context.issueCount > 0) {
    reasons.push(`Open and past issue records: ${context.issueCount}.`);
  }

  const confidenceScore = typeof probability === "number"
    ? Math.max(0, Math.min(100, Math.round(probability * 100)))
    : null;

  await pool.query(
    `
      INSERT INTO ml_recommendations (
        equipment_id,
        metric_id,
        recommendation,
        confidence_score,
        probability,
        model_version,
        reasons_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      equipment.id,
      metricId,
      recommendation,
      confidenceScore,
      probability,
      iotFailureModel?.version || "untrained",
      JSON.stringify(reasons),
    ],
  );

  return {
    recommendation,
    confidenceScore,
    probability,
    modelVersion: iotFailureModel?.version || "untrained",
    reasons,
  };
}

async function loadIotFailureModelFromCsv() {
  const examples = await loadIotFailureExamples();
  if (examples.length === 0) {
    return null;
  }

  return trainLogisticRegressionBinary(examples);
}

async function ensureMoveOrderTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS move_order_requests (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      request_number VARCHAR(40) NOT NULL,
      requested_by_user_id BIGINT NOT NULL,
      warehouse_user_id BIGINT NULL,
      destination_branch_id BIGINT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      receipt_status VARCHAR(40) NOT NULL DEFAULT 'pending',
      reason VARCHAR(255) NULL,
      note TEXT NULL,
      reviewed_note TEXT NULL,
      reviewed_at TIMESTAMP NULL,
      received_confirmed_at TIMESTAMP NULL,
      fulfilled_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_move_order_request_number (request_number),
      CONSTRAINT fk_move_order_requested_by FOREIGN KEY (requested_by_user_id) REFERENCES users(id),
      CONSTRAINT fk_move_order_warehouse_user FOREIGN KEY (warehouse_user_id) REFERENCES users(id),
      CONSTRAINT fk_move_order_destination_branch FOREIGN KEY (destination_branch_id) REFERENCES branches(id)
    )
  `);

  await pool.query(`
    ALTER TABLE move_order_requests
    ADD COLUMN IF NOT EXISTS receipt_status VARCHAR(40) NOT NULL DEFAULT 'pending'
  `);

  await pool.query(`
    ALTER TABLE move_order_requests
    ADD COLUMN IF NOT EXISTS received_confirmed_at TIMESTAMP NULL
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS move_order_request_items (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      move_order_request_id BIGINT NOT NULL,
      equipment_id BIGINT NULL,
      requested_category_id BIGINT NULL,
      requested_quantity INT NOT NULL DEFAULT 1,
      item_note VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_move_order_item_request FOREIGN KEY (move_order_request_id) REFERENCES move_order_requests(id) ON DELETE CASCADE,
      CONSTRAINT fk_move_order_item_equipment FOREIGN KEY (equipment_id) REFERENCES equipment(id),
      CONSTRAINT fk_move_order_item_requested_category FOREIGN KEY (requested_category_id) REFERENCES categories(id),
      UNIQUE KEY uq_move_order_request_equipment (move_order_request_id, equipment_id)
    )
  `);

  await pool.query(`
    ALTER TABLE move_order_request_items
    MODIFY COLUMN equipment_id BIGINT NULL
  `);

  await pool.query(`
    ALTER TABLE move_order_request_items
    ADD COLUMN IF NOT EXISTS requested_category_id BIGINT NULL
  `);

  await pool.query(`
    ALTER TABLE move_order_request_items
    ADD COLUMN IF NOT EXISTS requested_quantity INT NOT NULL DEFAULT 1
  `);
}

async function seedExistingAssetLifecycleEvents() {
  const [[eventCount]] = await pool.query("SELECT COUNT(*) AS total FROM asset_lifecycle_events");

  if (Number(eventCount?.total ?? 0) > 0) {
    return;
  }

  await pool.query(`
    INSERT INTO asset_lifecycle_events (
      equipment_id,
      event_type,
      event_label,
      event_note,
      to_status,
      related_record_type,
      related_record_id
    )
    SELECT
      id,
      'stock_snapshot',
      'Existing stock imported',
      'Initial lifecycle snapshot for existing inventory.',
      status,
      'equipment',
      id
    FROM equipment
  `);
}

async function ensureSystemLogsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS system_logs (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      actor_user_id BIGINT NULL,
      target_user_id BIGINT NULL,
      action_key VARCHAR(100) NOT NULL,
      action_label VARCHAR(255) NOT NULL,
      details TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_syslog_actor (actor_user_id),
      INDEX idx_syslog_target (target_user_id)
    )
  `);
}

async function ensureSystemSettingsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS system_settings (
      setting_key VARCHAR(120) PRIMARY KEY,
      setting_value TEXT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  const defaultSettings = [
    ["workflow_hr_booking_role", "HR Recruitment officer"],
    ["workflow_it_inventory_role", "IT Support engineer"],
    ["workflow_itd_role", "IT Director"],
    ["workflow_hrd_role", "HR DIRECTOR"],
    ["workflow_it_preparation_role", "IT Support engineer"],
    ["workflow_security_role", "IT security manager"],
    ["workflow_fulfillment_role", "IT Support engineer"],
    ["return_hrd_role", "HR DIRECTOR"],
    ["return_itd_role", "IT Director"],
    ["return_security_alert_role", "IT security manager"],
    ["return_infrastructure_alert_role", "IT infrastructure manager"],
    ["auth_mode", "hybrid"],
    ["mfa_required", "true"],
    ["low_stock_threshold", "3"],
    ["overdue_assignment_days", "7"],
    ["high_priority_issue_threshold", "5"],
  ];

  for (const [settingKey, settingValue] of defaultSettings) {
    await pool.query(
      `
        INSERT INTO system_settings (setting_key, setting_value)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE setting_value = COALESCE(setting_value, VALUES(setting_value))
      `,
      [settingKey, settingValue],
    );
  }
}

async function ensureBackupSnapshotsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS backup_snapshots (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      label VARCHAR(180) NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      snapshot_status ENUM('ready', 'restored', 'failed') DEFAULT 'ready',
      created_by_user_id BIGINT NULL,
      restored_by_user_id BIGINT NULL,
      restored_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_backup_created_by (created_by_user_id),
      INDEX idx_backup_restored_by (restored_by_user_id)
    )
  `);
}

async function columnExists(tableName, columnName) {
  const [rows] = await pool.query(
    `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
      LIMIT 1
    `,
    [tableName, columnName],
  );

  return rows.length > 0;
}

async function ensureReturnsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS returns (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      assignment_id BIGINT NOT NULL,
      equipment_id BIGINT NOT NULL,
      employee_user_id BIGINT NOT NULL,
      requested_by BIGINT NOT NULL,
      it_manager_user_id BIGINT NULL,
      storekeeper_user_id BIGINT NULL,
      request_note TEXT NULL,
      it_review_note TEXT NULL,
      intake_note TEXT NULL,
      condition_status VARCHAR(40) NULL,
      disposition VARCHAR(40) NULL,
      return_attachment_name VARCHAR(255) NULL,
      return_attachment_type VARCHAR(180) NULL,
      return_attachment_data LONGTEXT NULL,
      return_status ENUM('it_review', 'store_intake', 'awaiting_final_approval', 'maintenance', 'returned_to_employee', 'requested', 'completed', 'rejected') DEFAULT 'it_review',
      requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      hr_notified_it_at TIMESTAMP NULL,
      hr_notified_it_by BIGINT NULL,
      it_reviewed_at TIMESTAMP NULL,
      processed_at TIMESTAMP NULL,
      INDEX idx_returns_assignment (assignment_id),
      INDEX idx_returns_equipment (equipment_id),
      INDEX idx_returns_employee (employee_user_id)
    )
  `);

  await pool.query(`
    ALTER TABLE returns
    ADD COLUMN IF NOT EXISTS employee_user_id BIGINT NULL
  `);

  await pool.query(`
    ALTER TABLE returns
    ADD COLUMN IF NOT EXISTS requested_by BIGINT NULL
  `);

  await pool.query(`
    ALTER TABLE returns
    ADD COLUMN IF NOT EXISTS storekeeper_user_id BIGINT NULL
  `);

  await pool.query(`
    ALTER TABLE returns
    ADD COLUMN IF NOT EXISTS it_manager_user_id BIGINT NULL
  `);

  await pool.query(`
    ALTER TABLE returns
    ADD COLUMN IF NOT EXISTS return_reason VARCHAR(40) NULL
  `);

  await pool.query(`
    ALTER TABLE returns
    ADD COLUMN IF NOT EXISTS request_note TEXT NULL
  `);

  await pool.query(`
    ALTER TABLE returns
    ADD COLUMN IF NOT EXISTS it_review_note TEXT NULL
  `);

  await pool.query(`
    ALTER TABLE returns
    ADD COLUMN IF NOT EXISTS intake_note TEXT NULL
  `);

  await pool.query(`
    ALTER TABLE returns
    ADD COLUMN IF NOT EXISTS disposition VARCHAR(40) NULL
  `);

  await pool.query(`
    ALTER TABLE returns
    ADD COLUMN IF NOT EXISTS return_attachment_name VARCHAR(255) NULL
  `);

  await pool.query(`
    ALTER TABLE returns
    ADD COLUMN IF NOT EXISTS return_attachment_type VARCHAR(180) NULL
  `);

  await pool.query(`
    ALTER TABLE returns
    ADD COLUMN IF NOT EXISTS return_attachment_data LONGTEXT NULL
  `);

  await pool.query(`
    ALTER TABLE returns
    MODIFY COLUMN return_status ENUM('it_review', 'store_intake', 'awaiting_final_approval', 'maintenance', 'returned_to_employee', 'requested', 'completed', 'rejected') DEFAULT 'it_review'
  `);

  await pool.query(`
    ALTER TABLE returns
    ADD COLUMN IF NOT EXISTS requested_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
  `);

  await pool.query(`
    ALTER TABLE returns
    ADD COLUMN IF NOT EXISTS hr_notified_it_at TIMESTAMP NULL
  `);

  await pool.query(`
    ALTER TABLE returns
    ADD COLUMN IF NOT EXISTS hr_notified_it_by BIGINT NULL
  `);

  await pool.query(`
    ALTER TABLE returns
    ADD COLUMN IF NOT EXISTS it_reviewed_at TIMESTAMP NULL
  `);

  await pool.query(`
    ALTER TABLE returns
    ADD COLUMN IF NOT EXISTS processed_at TIMESTAMP NULL
  `);

  await pool.query(`
    ALTER TABLE returns
    ADD COLUMN IF NOT EXISTS received_condition_comment TEXT NULL
  `);

  await pool.query(`
    ALTER TABLE returns
    ADD COLUMN IF NOT EXISTS final_hrd_approval_status VARCHAR(20) NOT NULL DEFAULT 'pending'
  `);

  await pool.query(`
    ALTER TABLE returns
    ADD COLUMN IF NOT EXISTS final_hrd_approved_at TIMESTAMP NULL
  `);

  await pool.query(`
    ALTER TABLE returns
    ADD COLUMN IF NOT EXISTS final_hrd_approved_by BIGINT NULL
  `);

  await pool.query(`
    ALTER TABLE returns
    ADD COLUMN IF NOT EXISTS final_itd_approval_status VARCHAR(20) NOT NULL DEFAULT 'pending'
  `);

  await pool.query(`
    ALTER TABLE returns
    ADD COLUMN IF NOT EXISTS final_itd_approved_at TIMESTAMP NULL
  `);

  await pool.query(`
    ALTER TABLE returns
    ADD COLUMN IF NOT EXISTS final_itd_approved_by BIGINT NULL
  `);

  const hasLegacyReceivedBy = await columnExists("returns", "received_by");
  const hasLegacyNotes = await columnExists("returns", "notes");
  const hasLegacyReturnedAt = await columnExists("returns", "returned_at");

  if (hasLegacyReceivedBy) {
    await pool.query(`
      ALTER TABLE returns
      MODIFY COLUMN received_by BIGINT NULL
    `);
  }

  if (await columnExists("returns", "condition_status")) {
    await pool.query(`
      ALTER TABLE returns
      MODIFY COLUMN condition_status VARCHAR(100) NULL
    `);
  }

  if (hasLegacyReturnedAt) {
    await pool.query(`
      ALTER TABLE returns
      MODIFY COLUMN returned_at TIMESTAMP NULL DEFAULT NULL
    `);
  }

  if (hasLegacyReceivedBy || hasLegacyNotes || hasLegacyReturnedAt) {
    await pool.query(`
      UPDATE returns r
      INNER JOIN assignments a ON a.id = r.assignment_id
      SET
        r.employee_user_id = COALESCE(r.employee_user_id, a.employee_user_id),
        r.requested_by = COALESCE(r.requested_by, a.employee_user_id),
        r.storekeeper_user_id = COALESCE(r.storekeeper_user_id, ${hasLegacyReceivedBy ? "r.received_by" : "NULL"}),
        r.request_note = COALESCE(r.request_note, ${hasLegacyNotes ? "r.notes" : "NULL"}),
        r.intake_note = COALESCE(r.intake_note, ${hasLegacyNotes ? "r.notes" : "NULL"}),
        r.disposition = COALESCE(r.disposition, 'available'),
        r.return_status = COALESCE(r.return_status, 'completed'),
        r.requested_at = COALESCE(r.requested_at, ${hasLegacyReturnedAt ? "r.returned_at" : "CURRENT_TIMESTAMP"}),
        r.processed_at = COALESCE(r.processed_at, ${hasLegacyReturnedAt ? "r.returned_at" : "NULL"})
    `);
  }

  await pool.query(`
    UPDATE returns
    SET return_status = 'it_review'
    WHERE return_status = 'requested'
      AND it_reviewed_at IS NULL
      AND processed_at IS NULL
  `);
}

async function ensurePasswordResetTokensTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      user_id BIGINT NOT NULL,
      token_hash VARCHAR(64) NOT NULL,
      expires_at DATETIME NOT NULL,
      used_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_password_reset_user (user_id),
      INDEX idx_password_reset_hash (token_hash),
      CONSTRAINT fk_password_reset_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
    )
  `);

  const [columns] = await pool.query(`
    SHOW COLUMNS FROM password_reset_tokens
  `);
  const columnNames = new Set(columns.map((column) => column.Field));

  if (!columnNames.has("token_hash")) {
    await pool.query(`
      ALTER TABLE password_reset_tokens
      ADD COLUMN token_hash VARCHAR(64) NULL AFTER user_id
    `);
  }

  if (!columnNames.has("used_at")) {
    await pool.query(`
      ALTER TABLE password_reset_tokens
      ADD COLUMN used_at DATETIME NULL AFTER expires_at
    `);
  }

  if (!columnNames.has("created_at")) {
    await pool.query(`
      ALTER TABLE password_reset_tokens
      ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP AFTER used_at
    `);
  }

  if (columnNames.has("token")) {
    await pool.query(`
      UPDATE password_reset_tokens
      SET token_hash = COALESCE(token_hash, SHA2(token, 256))
      WHERE token IS NOT NULL
    `);
  }

  await pool.query(`
    CREATE INDEX idx_password_reset_hash
    ON password_reset_tokens (token_hash)
  `).catch(() => undefined);
}

async function backfillLegacyReplacementRecords() {
  const [replacementRequests] = await pool.query(
    `
      SELECT
        id,
        requester_id,
        target_employee_user_id,
        approver_id,
        notes,
        source_equipment_id,
        replacement_disposition,
        replacement_condition_status
      FROM requests
      WHERE request_type = 'replacement'
        AND request_status = 'fulfilled'
        AND source_equipment_id IS NOT NULL
      ORDER BY id ASC
    `,
  );

  for (const request of replacementRequests) {
    const targetEmployeeId = Number(request.target_employee_user_id || request.requester_id);
    const sourceEquipmentId = Number(request.source_equipment_id);

    const [equipmentRows] = await pool.query(
      `
        SELECT id, status
        FROM equipment
        WHERE id = ?
        LIMIT 1
      `,
      [sourceEquipmentId],
    );

    if (equipmentRows.length === 0) {
      continue;
    }

    const sourceEquipment = equipmentRows[0];

    const [assignmentRows] = await pool.query(
      `
        SELECT id, status
        FROM assignments
        WHERE equipment_id = ? AND employee_user_id = ?
        ORDER BY assigned_at DESC, id DESC
        LIMIT 1
      `,
      [sourceEquipmentId, targetEmployeeId],
    );

    const sourceAssignment = assignmentRows[0] ?? null;

    const [returnRows] = sourceAssignment
      ? await pool.query(
          `
            SELECT id, disposition, condition_status
            FROM returns
            WHERE assignment_id = ?
            ORDER BY id DESC
            LIMIT 1
          `,
          [sourceAssignment.id],
        )
      : [[]];

    const existingReturn = returnRows[0] ?? null;

    const inferredDisposition = request.replacement_disposition
      || existingReturn?.disposition
      || (["retired", "lost"].includes(sourceEquipment.status) ? "retired" : sourceEquipment.status === "available" ? "available" : null)
      || (sourceAssignment?.status === "returned" ? "available" : "retired");

    const inferredCondition = request.replacement_condition_status
      || existingReturn?.condition_status
      || request.notes
      || "Legacy replacement backfill";

    if (!request.replacement_disposition || !request.replacement_condition_status) {
      await pool.query(
        `
          UPDATE requests
          SET
            replacement_disposition = COALESCE(replacement_disposition, ?),
            replacement_condition_status = COALESCE(replacement_condition_status, ?)
          WHERE id = ?
        `,
        [inferredDisposition, inferredCondition, request.id],
      );
    }

    if (sourceAssignment && sourceAssignment.status !== "returned") {
      await pool.query(
        `
          UPDATE assignments
          SET status = 'returned'
          WHERE id = ?
        `,
        [sourceAssignment.id],
      );
    }

    if (sourceAssignment && !existingReturn) {
      const actorUserId = Number(request.approver_id || request.requester_id);
      const note = `Legacy replacement backfill for request ${request.id}.`;

      await pool.query(
        `
          INSERT INTO returns (
            assignment_id,
            equipment_id,
            received_by,
            condition_status,
            returned_at,
            notes,
            employee_user_id,
            requested_by,
            storekeeper_user_id,
            it_manager_user_id,
            request_note,
            it_review_note,
            intake_note,
            disposition,
            return_status,
            requested_at,
            it_reviewed_at,
            processed_at,
            received_condition_comment,
            final_hrd_approval_status,
            final_hrd_approved_at,
            final_hrd_approved_by,
            final_itd_approval_status,
            final_itd_approved_at,
            final_itd_approved_by
          )
          VALUES (?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', NOW(), NOW(), NOW(), ?, 'approved', NOW(), ?, 'approved', NOW(), ?)
        `,
        [
          sourceAssignment.id,
          sourceEquipmentId,
          actorUserId,
          inferredCondition,
          note,
          targetEmployeeId,
          targetEmployeeId,
          actorUserId,
          actorUserId,
          note,
          note,
          note,
          inferredDisposition,
          inferredCondition,
          actorUserId,
          actorUserId,
        ],
      );
    }

    if (!["available", "retired", "lost"].includes(sourceEquipment.status) || sourceEquipment.status !== inferredDisposition) {
      await pool.query(
        "UPDATE equipment SET status = ? WHERE id = ?",
        [inferredDisposition, sourceEquipmentId],
      );
    }
  }
}

async function getSystemSettingsMap() {
  const [rows] = await pool.query(
    "SELECT setting_key, setting_value FROM system_settings",
  );

  return Object.fromEntries(rows.map((row) => [row.setting_key, row.setting_value]));
}

async function issuePasswordResetToken(user, req) {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const resetLink = `${getFrontendBaseUrl(req).replace(/\/$/, "")}/?resetToken=${encodeURIComponent(rawToken)}`;

  await pool.query(
    "UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL",
    [user.id],
  );

  await pool.query(
    `
      INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
      VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 30 MINUTE))
    `,
    [user.id, tokenHash],
  );

  return resetLink;
}

async function updateSystemSettings(entries) {
  for (const [settingKey, settingValue] of Object.entries(entries)) {
    await pool.query(
      `
        INSERT INTO system_settings (setting_key, setting_value)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)
      `,
      [settingKey, String(settingValue ?? "")],
    );
  }
}

async function getWorkflowDefinitions(requestType = "standard") {
  const settings = await getSystemSettingsMap();

  const baseDefinitions = requestType === "return"
    ? []
    : requestType === "replacement"
      ? replacementWorkflowDefinitions
    : workflowDefinitionDefaults;

  return baseDefinitions.map((definition) => ({
    ...definition,
    roleName: settings[definition.settingKey] || definition.roleName,
  }));
}

function getRequestTypeLabel(requestType) {
  return requestTypeLabels[requestType] || requestTypeLabels.standard;
}

async function createNotification(userId, title, message) {
  if (!userId) {
    return;
  }

  await pool.query(
    "INSERT INTO notifications (user_id, title, message, status) VALUES (?, ?, ?, 'unread')",
    [userId, title, message || null],
  );
}

async function logAssetLifecycle({
  equipmentId,
  actorUserId = null,
  eventType,
  eventLabel,
  eventNote = null,
  fromStatus = null,
  toStatus = null,
  relatedRecordType = null,
  relatedRecordId = null,
}) {
  if (!equipmentId || !eventType || !eventLabel) {
    return;
  }

  await pool.query(
    `
      INSERT INTO asset_lifecycle_events (
        equipment_id,
        actor_user_id,
        event_type,
        event_label,
        event_note,
        from_status,
        to_status,
        related_record_type,
        related_record_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      Number(equipmentId),
      actorUserId ? Number(actorUserId) : null,
      eventType,
      eventLabel,
      eventNote || null,
      fromStatus || null,
      toStatus || null,
      relatedRecordType || null,
      relatedRecordId || null,
    ],
  );
}

async function createSmartAlerts(currentUser, equipment, requests, assignments, returns, issues, maintenanceRecords) {
  const settings = await getSystemSettingsMap();
  const lowStockThreshold = Number(settings.low_stock_threshold || 3);
  const alerts = [];
  const visibleEquipment = equipment.filter((item) => !currentUser.branch_id || item.branch_id === currentUser.branch_id);

  const stockGroups = new Map();
  for (const item of visibleEquipment) {
    const key = `${item.branch_id || "global"}:${item.category_id}`;
    const existing = stockGroups.get(key) ?? {
      categoryName: item.category_name || "Uncategorized",
      branchName: item.branch_name || "Global stock",
      available: 0,
    };
    if (item.status === "available") {
      existing.available += 1;
    }
    stockGroups.set(key, existing);
  }

  for (const group of stockGroups.values()) {
    if (group.available <= lowStockThreshold) {
      alerts.push({
        severity: group.available === 0 ? "critical" : "warning",
        title: `${group.categoryName} low stock`,
        message: `${group.branchName} has ${group.available} available item(s). Threshold is ${lowStockThreshold}.`,
      });
    }
  }

  const overdueAssignments = assignments.filter((assignment) => assignment.status === "overdue");
  if (overdueAssignments.length > 0) {
    alerts.push({
      severity: "warning",
      title: "Overdue assigned equipment",
      message: `${overdueAssignments.length} assignment(s) are overdue for return.`,
    });
  }

  const highPriorityIssues = issues.filter((issue) => issue.priority === "high" && !["resolved", "closed"].includes(issue.issue_status));
  if (highPriorityIssues.length > 0) {
    alerts.push({
      severity: "critical",
      title: "High priority IT issues",
      message: `${highPriorityIssues.length} high priority equipment issue(s) need attention.`,
    });
  }

  const returnsWaitingForIt = returns.filter((item) => item.return_status === "it_review").length;
  if (returnsWaitingForIt > 0 && currentUser.role_name === "IT Support engineer") {
    alerts.push({
      severity: "info",
      title: "Return checks waiting",
      message: `${returnsWaitingForIt} return request(s) need IT inspection.`,
    });
  }

  const returnsWaitingForFinalApproval = returns.filter((item) => item.return_status === "awaiting_final_approval").length;
  if (returnsWaitingForFinalApproval > 0 && ["HR DIRECTOR", "IT Director"].includes(currentUser.role_name)) {
    alerts.push({
      severity: "info",
      title: "Returns awaiting final approval",
      message: `${returnsWaitingForFinalApproval} returned device(s) need final HRD and ITD approval.`,
    });
  }

  const maintenanceOpen = maintenanceRecords.filter((item) => item.maintenance_status === "under_repair").length;
  if (maintenanceOpen > 0 && ["IT Support engineer", "IT officer", "admin"].includes(currentUser.role_name)) {
    alerts.push({
      severity: "warning",
      title: "Maintenance in progress",
      message: `${maintenanceOpen} device(s) are currently under repair and need follow-up.`,
    });
  }

  const stuckRequests = requests.filter(
    (request) => ["waiting_stock", "backordered", "on_hold"].includes(request.fulfillment_status),
  ).length;
  if (stuckRequests > 0) {
    alerts.push({
      severity: "info",
      title: "Requests waiting for stock",
      message: `${stuckRequests} request(s) are waiting, backordered, or on hold.`,
    });
  }

  return alerts.slice(0, 8);
}

async function getUserContext(userId) {
  const [rows] = await pool.query(
    `
      SELECT
        u.id,
        u.first_name,
        u.last_name,
        u.email,
        u.job_title,
        u.employment_status,
        u.office_location,
        u.start_date,
        u.employee_grade,
        u.hrms_employee_id,
        u.role_id,
        u.branch_id,
        u.country_id,
        u.department_id,
        r.name AS role_name
      FROM users u
      INNER JOIN roles r ON r.id = u.role_id
      WHERE u.id = ?
      LIMIT 1
    `,
    [userId],
  );

  return rows[0] ?? null;
}

async function getEmployeeRoleId() {
  const [rows] = await pool.query(
    "SELECT id FROM roles WHERE LOWER(name) = 'employee' LIMIT 1",
  );

  return rows[0]?.id ? Number(rows[0].id) : null;
}

function normalizeEmployeeStatusValue(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["active", "inactive", "pending"].includes(normalized) ? normalized : "active";
}

function isHrmsApiConfigured() {
  return Boolean(String(hrmsApiBaseUrl || "").trim());
}

function isHrmsConnectionError(error) {
  const message = String(error?.message || "");
  const causeCode = error?.cause?.code;
  return causeCode === "ECONNREFUSED" || causeCode === "ENOTFOUND" || causeCode === "ETIMEDOUT" || message.includes("ECONNREFUSED");
}

function createHrmsUnavailableError(error) {
  const offlineError = new Error(
    "HRMS service is unavailable. Start the HRMS app or set HRMS_API_BASE_URL in backend/.env.",
  );
  offlineError.statusCode = 503;
  offlineError.hrmsUnavailable = true;
  offlineError.cause = error;
  return offlineError;
}

function logHrmsUnavailableWarningOnce(error) {
  if (hasLoggedHrmsUnavailableWarning) {
    return;
  }

  hasLoggedHrmsUnavailableWarning = true;
  console.warn(
    "HRMS integration is unavailable. Start the HRMS service or configure HRMS_API_BASE_URL in backend/.env.",
    error?.cause?.code ? `Cause: ${error.cause.code}` : "",
  );
}

function buildHrmsEmployeeByIdPath(employeeId) {
  return hrmsEmployeeByIdPathTemplate.includes("{id}")
    ? hrmsEmployeeByIdPathTemplate.replace("{id}", encodeURIComponent(String(employeeId)))
    : `${hrmsEmployeesPath.replace(/\/$/, "")}/${encodeURIComponent(String(employeeId))}`;
}

function extractHrmsCollection(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.employees)) {
    return payload.employees;
  }

  if (Array.isArray(payload?.items)) {
    return payload.items;
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  return [];
}

function mapHrmsEmployeeRecord(record) {
  if (!record || typeof record !== "object") {
    return null;
  }

  const firstName = record.first_name || record.firstName || "";
  const lastName = record.last_name || record.lastName || "";
  const email = record.email || record.workEmail || record.personalEmail || "";
  const employeeId = record.id || record.employeeId || record.hrms_employee_id || record.hrmsEmployeeId || email;

  return {
    id: String(employeeId),
    first_name: String(firstName || "").trim().slice(0, 40),
    last_name: String(lastName || "").trim().slice(0, 40),
    full_name: `${firstName || ""} ${lastName || ""}`.trim() || String(record.full_name || record.fullName || email || "Unknown employee"),
    email: String(email || "").trim(),
    phone_number: normalizeOptionalText(record.phone_number || record.phoneNumber, 13),
    employee_code: normalizeOptionalText(record.employee_code || record.employeeCode, 40),
    hrms_employee_id: normalizeOptionalText(record.hrms_employee_id || record.hrmsEmployeeId, 40),
    employee_grade: normalizeOptionalText(record.employee_grade || record.employeeGrade, 40),
    job_title: record.job_title || record.jobTitle || null,
    employment_status: record.employment_status || record.employmentStatus || null,
    office_location: record.office_location || record.officeLocation || null,
    start_date: record.start_date || record.startDate || null,
    status: normalizeEmployeeStatusValue(record.status || record.employeeStatus || "active"),
    branch_id: null,
    country_id: null,
    department_id: record.department_id || record.departmentId || null,
    branch_name: null,
    country_name: null,
    department_name: normalizeOptionalText(record.department_name || record.departmentName, 40),
    linked_user_id: record.linked_user_id || record.linkedUserId || record.ims_user_id || record.imsUserId || null,
    ims_account_status: record.ims_account_status || record.imsAccountStatus || null,
  };
}

async function callHrmsApi(endpoint, { method = "GET", body = null, actor = null, authorizationHeader = "" } = {}) {
  if (!isHrmsApiConfigured()) {
    const configurationError = new Error("HRMS API is not configured. Set HRMS_API_BASE_URL in backend/.env.");
    configurationError.statusCode = 503;
    configurationError.hrmsUnavailable = true;
    throw configurationError;
  }

  const url = new URL(endpoint, hrmsApiBaseUrl.endsWith("/") ? hrmsApiBaseUrl : `${hrmsApiBaseUrl}/`);
  const headers = {
    Accept: "application/json",
  };

  if (body !== null) {
    headers["Content-Type"] = "application/json";
  }

  if (hrmsApiKey) {
    headers[hrmsApiKeyHeader] = hrmsApiKey;
  }

  if (actor?.email) {
    headers[hrmsUserEmailHeader] = actor.email;
  }

  if (actor?.role_name) {
    headers[hrmsUserRoleHeader] = actor.role_name;
  }

  if (authorizationHeader) {
    headers.Authorization = authorizationHeader;
  }

  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body !== null ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    if (isHrmsConnectionError(error)) {
      throw createHrmsUnavailableError(error);
    }
    throw error;
  }

  const rawText = await response.text();
  let data = null;

  if (rawText.trim()) {
    try {
      data = JSON.parse(rawText);
    } catch {
      data = { message: rawText.trim() };
    }
  }

  if (!response.ok) {
    throw new Error(data?.message || `HRMS request failed with status ${response.status}.`);
  }

  return data;
}

function buildRecommendedDeviceProfile({ categoryName, employeeGrade, jobTitle, requestType }) {
  const normalizedCategory = String(categoryName || "").trim().toLowerCase();
  const normalizedGrade = String(employeeGrade || "").trim().toLowerCase();
  const normalizedTitle = String(jobTitle || "").trim().toLowerCase();
  const executiveRole = /\b(director|head|chief|executive|ceo|cfo|coo|president|vp)\b/.test(normalizedTitle);
  const technicalRole = /\b(engineer|developer|architect|analyst|security|devops|infrastructure|data)\b/.test(normalizedTitle);
  const managerRole = /\b(manager|lead|supervisor|coordinator)\b/.test(normalizedTitle);
  const seniorGrade = /\b(gm|m[4-9]|g[7-9]|senior|principal|lead)\b/.test(normalizedGrade);
  const elevatedProfile = executiveRole || seniorGrade;

  if (normalizedCategory.includes("phone") || normalizedCategory.includes("smartphone")) {
    return elevatedProfile
      ? "Recommended mobile profile: business flagship smartphone with 256GB storage, strong camera, dual SIM, and MDM support."
      : "Recommended mobile profile: business smartphone with 128GB storage, dual SIM, and MDM support.";
  }

  if (normalizedCategory.includes("desktop")) {
    if (technicalRole) {
      return "Recommended desktop profile: Core i7 class CPU, 16GB RAM, 512GB SSD, Windows 11 Pro, and dual-monitor support.";
    }

    return elevatedProfile
      ? "Recommended desktop profile: premium business desktop, Core i7 class CPU, 16GB RAM, 512GB SSD, Windows 11 Pro."
      : "Recommended desktop profile: standard business desktop, Core i5 class CPU, 8GB RAM, 256GB SSD, Windows 11 Pro.";
  }

  if (normalizedCategory.includes("tablet")) {
    return elevatedProfile
      ? "Recommended tablet profile: premium business tablet with keyboard cover, 256GB storage, and secure mobile management."
      : "Recommended tablet profile: business tablet with keyboard cover, 128GB storage, and secure mobile management.";
  }

  if (requestType === "replacement") {
    return technicalRole
      ? "Replacement recommendation: keep the employee on a performance laptop profile with Core i7 class CPU, 16GB RAM, and 512GB SSD."
      : "Replacement recommendation: match the employee's current business laptop class with at least Core i5, 8GB RAM, and 256GB SSD.";
  }

  if (technicalRole) {
    return "Recommended laptop profile: performance business laptop, Core i7 class CPU, 16GB RAM, 512GB SSD, webcam, and dock-ready.";
  }

  if (elevatedProfile || managerRole) {
    return "Recommended laptop profile: premium business laptop, Core i7 or strong Core i5 class CPU, 16GB RAM, 512GB SSD, webcam, and dock-ready.";
  }

  return "Recommended laptop profile: standard business laptop, Core i5 class CPU, 8GB RAM, 256GB SSD, webcam, and VPN-ready.";
}

async function getCategoryNameById(categoryId) {
  if (!categoryId) {
    return null;
  }

  const [rows] = await pool.query(
    "SELECT name FROM categories WHERE id = ? LIMIT 1",
    [Number(categoryId)],
  );

  return rows[0]?.name || null;
}

function mapLocalEmployeeRecord(record) {
  if (!record) {
    return null;
  }

  return {
    id: String(record.id),
    first_name: record.first_name || "",
    last_name: record.last_name || "",
    full_name: record.full_name || `${record.first_name || ""} ${record.last_name || ""}`.trim() || record.email || "Unknown employee",
    email: record.email || "",
    phone_number: record.phone_number || null,
    employee_code: record.employee_code || null,
    hrms_employee_id: record.hrms_employee_id || null,
    employee_grade: record.employee_grade || null,
    job_title: record.job_title || null,
    employment_status: record.employment_status || null,
    office_location: record.office_location || null,
    start_date: record.start_date || null,
    status: normalizeEmployeeStatusValue(record.status || "active"),
    branch_id: record.branch_id || null,
    country_id: record.country_id || null,
    department_id: record.department_id || null,
    branch_name: record.branch_name || null,
    country_name: record.country_name || null,
    department_name: record.department_name || null,
    linked_user_id: Number(record.id) || null,
    ims_account_status: normalizeEmployeeStatusValue(record.status || "active"),
    employee_directory_source: "ims",
  };
}

async function getLocalHrEmployeesForActor(actor) {
  const filters = ["LOWER(r.name) = 'employee'"];
  const params = [];

  if (actor?.branch_id) {
    filters.push("(u.branch_id = ? OR u.branch_id IS NULL)");
    params.push(Number(actor.branch_id));
  } else if (actor?.country_id) {
    filters.push("(u.country_id = ? OR u.country_id IS NULL)");
    params.push(Number(actor.country_id));
  }

  const [rows] = await pool.query(
    `
      SELECT
        u.id,
        u.first_name,
        u.last_name,
        CONCAT(u.first_name, ' ', u.last_name) AS full_name,
        u.email,
        u.phone_number,
        u.employee_code,
        u.hrms_employee_id,
        u.employee_grade,
        u.job_title,
        u.employment_status,
        u.office_location,
        u.start_date,
        u.status,
        u.branch_id,
        u.country_id,
        u.department_id,
        b.name AS branch_name,
        co.name AS country_name,
        d.name AS department_name
      FROM users u
      INNER JOIN roles r ON r.id = u.role_id
      LEFT JOIN branches b ON b.id = u.branch_id
      LEFT JOIN country co ON co.id = u.country_id
      LEFT JOIN department d ON d.id = u.department_id
      WHERE ${filters.join(" AND ")}
      ORDER BY u.first_name ASC, u.last_name ASC
    `,
    params,
  );

  return rows.map(mapLocalEmployeeRecord).filter(Boolean);
}

async function getHrmsEmployeesForActor(actor) {
  const payload = await callHrmsApi(hrmsEmployeesPath, { actor });
  return extractHrmsCollection(payload)
    .map(mapHrmsEmployeeRecord)
    .filter(Boolean)
    .map((record) => ({
      ...record,
      employee_directory_source: "hrms",
    }));
}

async function getHrmsEmployeeProfile(actor, hrmsEmployeeId) {
  if (!hrmsEmployeeId) {
    return null;
  }

  const payload = await callHrmsApi(buildHrmsEmployeeByIdPath(hrmsEmployeeId), { actor });
  const record = payload?.employee || payload?.data || payload;
  return mapHrmsEmployeeRecord(record);
}

async function resolveEmployeeDirectoryRecord(actor, employeeRecordId) {
  const normalizedEmployeeRecordId = normalizeOptionalText(employeeRecordId, 120);
  if (!normalizedEmployeeRecordId) {
    return null;
  }

  const localIdentifierHash = hashProtectedIdentifier(normalizedEmployeeRecordId);
  const [localRows] = await pool.query(
    `
      SELECT
        u.id,
        u.first_name,
        u.last_name,
        CONCAT(u.first_name, ' ', u.last_name) AS full_name,
        u.email,
        u.phone_number,
        u.employee_code,
        u.hrms_employee_id,
        u.employee_grade,
        u.job_title,
        u.employment_status,
        u.office_location,
        u.start_date,
        u.status,
        u.branch_id,
        u.country_id,
        u.department_id,
        b.name AS branch_name,
        co.name AS country_name,
        d.name AS department_name
      FROM users u
      INNER JOIN roles r ON r.id = u.role_id
      LEFT JOIN branches b ON b.id = u.branch_id
      LEFT JOIN country co ON co.id = u.country_id
      LEFT JOIN department d ON d.id = u.department_id
      WHERE LOWER(r.name) = 'employee'
        AND (
          CAST(u.id AS CHAR) = ?
          OR u.hrms_employee_id = ?
          OR u.employee_code = ?
          OR u.hrms_employee_id_hash = ?
          OR u.employee_code_hash = ?
        )
      LIMIT 1
    `,
    [normalizedEmployeeRecordId, normalizedEmployeeRecordId, normalizedEmployeeRecordId, localIdentifierHash, localIdentifierHash],
  );

  if (localRows.length > 0) {
    return { source: "ims", employee: mapLocalEmployeeRecord(localRows[0]) };
  }

  if (!isHrmsApiConfigured()) {
    return null;
  }

  const hrmsEmployee = await getHrmsEmployeeProfile(actor, normalizedEmployeeRecordId);
  return hrmsEmployee ? { source: "hrms", employee: hrmsEmployee } : null;
}

async function ensureImsEmployeeForHrmsProfile(hrmsEmployee, { sendWelcomeEmail = false, createIfMissing = true } = {}) {
  if (!hrmsEmployee) {
    return { linkedUserId: null, welcomeMessage: null };
  }

  const employeeRoleId = await getEmployeeRoleId();
  if (!employeeRoleId) {
    throw new Error("Employee role is not configured.");
  }

  let linkedUser = hrmsEmployee.linked_user_id ? await getUserById(Number(hrmsEmployee.linked_user_id)) : null;

  if (!linkedUser && hrmsEmployee.hrms_employee_id) {
    const hrmsEmployeeIdHash = hashProtectedIdentifier(hrmsEmployee.hrms_employee_id);
    const [rows] = await pool.query(
      `
        SELECT
          u.id,
          u.first_name,
          u.last_name,
          u.email,
          u.phone_number,
          u.employee_code,
          u.job_title,
          u.employment_status,
          u.office_location,
          u.start_date,
          u.employee_grade,
          u.hrms_employee_id,
          r.name AS role_name
        FROM users u
        INNER JOIN roles r ON r.id = u.role_id
        WHERE u.hrms_employee_id = ?
           OR u.hrms_employee_id_hash = ?
        LIMIT 1
      `,
      [hrmsEmployee.hrms_employee_id, hrmsEmployeeIdHash],
    );
    linkedUser = rows[0] ?? null;
  }

  if (!linkedUser && hrmsEmployee.email) {
    const [rows] = await pool.query(
      `
        SELECT
          u.id,
          u.first_name,
          u.last_name,
          u.email,
          u.phone_number,
          u.employee_code,
          u.job_title,
          u.employment_status,
          u.office_location,
          u.start_date,
          u.employee_grade,
          u.hrms_employee_id,
          r.name AS role_name
        FROM users u
        INNER JOIN roles r ON r.id = u.role_id
        WHERE LOWER(u.email) = LOWER(?)
        LIMIT 1
      `,
      [hrmsEmployee.email],
    );
    linkedUser = rows[0] ?? null;
  }

  let welcomeMessage = null;

  if (!linkedUser && !createIfMissing) {
    return { linkedUserId: null, welcomeMessage: null };
  }

  if (!linkedUser) {
    const temporaryPassword = generateTemporaryPassword();
    const [result] = await pool.query(
      `
        INSERT INTO users (
          first_name,
          last_name,
          email,
          phone_number,
          employee_code,
          employee_code_hash,
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
          hrms_employee_id,
          hrms_employee_id_hash
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        hrmsEmployee.first_name,
        hrmsEmployee.last_name,
        hrmsEmployee.email,
        hrmsEmployee.phone_number || null,
        hrmsEmployee.employee_code || null,
        hashProtectedIdentifier(hrmsEmployee.employee_code),
        hashPassword(temporaryPassword),
        employeeRoleId,
        hrmsEmployee.department_id || null,
        hrmsEmployee.branch_id || null,
        hrmsEmployee.country_id || null,
        normalizeEmployeeStatusValue(hrmsEmployee.status),
        hrmsEmployee.job_title || null,
        hrmsEmployee.employment_status || null,
        hrmsEmployee.office_location || null,
        hrmsEmployee.start_date || null,
        hrmsEmployee.employee_grade || null,
        hrmsEmployee.hrms_employee_id || null,
        hashProtectedIdentifier(hrmsEmployee.hrms_employee_id),
      ],
    );

    linkedUser = await getUserById(Number(result.insertId));

    if (sendWelcomeEmail) {
      const emailResult = await sendAccountCreatedEmail({
        email: hrmsEmployee.email,
        firstName: hrmsEmployee.first_name,
        lastName: hrmsEmployee.last_name,
        password: temporaryPassword,
      });

      welcomeMessage = emailResult.sent
        ? "IMS welcome email sent with a temporary password."
        : `${emailResult.configurationHint} An email preview was written to the backend log.`;
    }
  } else {
    await pool.query(
      `
        UPDATE users
        SET
          first_name = ?,
          last_name = ?,
          email = ?,
          phone_number = ?,
          employee_code = ?,
          employee_code_hash = ?,
          job_title = ?,
          employment_status = ?,
          office_location = ?,
          start_date = ?,
          employee_grade = ?,
          hrms_employee_id = ?,
          hrms_employee_id_hash = ?,
          country_id = ?,
          branch_id = ?,
          department_id = ?,
          status = ?
        WHERE id = ?
      `,
      [
        hrmsEmployee.first_name,
        hrmsEmployee.last_name,
        hrmsEmployee.email,
        hrmsEmployee.phone_number || null,
        hrmsEmployee.employee_code || null,
        hashProtectedIdentifier(hrmsEmployee.employee_code),
        hrmsEmployee.job_title || null,
        hrmsEmployee.employment_status || null,
        hrmsEmployee.office_location || null,
        hrmsEmployee.start_date || null,
        hrmsEmployee.employee_grade || null,
        hrmsEmployee.hrms_employee_id || null,
        hashProtectedIdentifier(hrmsEmployee.hrms_employee_id),
        hrmsEmployee.country_id || null,
        hrmsEmployee.branch_id || null,
        hrmsEmployee.department_id || null,
        normalizeEmployeeStatusValue(hrmsEmployee.status),
        Number(linkedUser.id),
      ],
    );
  }

  return { linkedUserId: Number(linkedUser?.id || 0) || null, welcomeMessage };
}

async function syncHrmsEmployeeLink(actor, hrmsEmployee, linkedUserId, linkedUserStatus = null) {
  if (!actor || !hrmsEmployee?.id || !linkedUserId) {
    return;
  }

  await callHrmsApi(buildHrmsEmployeeByIdPath(hrmsEmployee.id), {
    method: "PUT",
    actor,
      body: {
        firstName: normalizeRequiredText(hrmsEmployee.first_name, 40),
        lastName: normalizeRequiredText(hrmsEmployee.last_name, 40),
        email: hrmsEmployee.email,
        phoneNumber: normalizeOptionalText(hrmsEmployee.phone_number, 13),
        employeeCode: normalizeOptionalText(hrmsEmployee.employee_code, 40),
        hrmsEmployeeId: normalizeOptionalText(hrmsEmployee.hrms_employee_id, 40),
        employeeGrade: normalizeOptionalText(hrmsEmployee.employee_grade, 40),
        jobTitle: hrmsEmployee.job_title || null,
        employmentStatus: hrmsEmployee.employment_status || null,
        officeLocation: hrmsEmployee.office_location || null,
        startDate: hrmsEmployee.start_date || null,
        departmentId: hrmsEmployee.department_id || null,
        departmentName: normalizeOptionalText(hrmsEmployee.department_name, 40),
        imsUserId: linkedUserId,
        imsAccountStatus: linkedUserStatus || "active",
        status: hrmsEmployee.status || "active",
    },
  });
}

function normalizeChatbotText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
    .replace(/\s+/g, " ");
}

function tokenizeChatbotText(value) {
  return normalizeChatbotText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

async function loadChatbotKnowledgeChunks() {
  if (!chatbotKnowledgeChunksPromise) {
    chatbotKnowledgeChunksPromise = Promise.all(
      chatbotKnowledgeFiles.map(async (file) => {
        try {
          const content = await fs.readFile(file.path, "utf8");
          const sections = content
            .split(/\n(?=# )|\n(?=## )|\n(?=### )/g)
            .map((section) => section.trim())
            .filter(Boolean);

          return sections.map((section, index) => {
            const [headingLine = file.label] = section.split("\n");
            const heading = headingLine.replace(/^#+\s*/, "").trim() || file.label;
            return {
              id: `${file.key}-${index}`,
              source: file.label,
              heading,
              text: section,
              tokens: tokenizeChatbotText(section),
            };
          });
        } catch {
          return [];
        }
      }),
    ).then((chunks) => chunks.flat());
  }

  return chatbotKnowledgeChunksPromise;
}

function scoreKnowledgeChunkAgainstMessage(message, chunk) {
  const messageTokens = tokenizeChatbotText(message);
  if (messageTokens.length === 0 || !Array.isArray(chunk?.tokens) || chunk.tokens.length === 0) {
    return 0;
  }

  const chunkTokenSet = new Set(chunk.tokens);
  const overlapCount = messageTokens.filter((token) => chunkTokenSet.has(token)).length;
  if (overlapCount === 0) {
    return 0;
  }

  const overlapRatio = overlapCount / messageTokens.length;
  const chunkCoverage = overlapCount / chunk.tokens.length;
  return overlapRatio * 0.85 + chunkCoverage * 0.15;
}

async function searchChatbotKnowledge(message, { limit = 3, minScore = 0.18 } = {}) {
  const chunks = await loadChatbotKnowledgeChunks();
  return chunks
    .map((chunk) => ({
      ...chunk,
      score: scoreKnowledgeChunkAgainstMessage(message, chunk),
    }))
    .filter((chunk) => chunk.score >= minScore)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

function summarizeKnowledgeChunk(chunk) {
  const lines = String(chunk?.text || "")
    .split("\n")
    .map((line) => line.replace(/^#+\s*/, "").trim())
    .filter(Boolean);
  return (lines.slice(1, 4).join(" ") || lines[0] || "").trim();
}

function extractRequestId(message) {
  const match = String(message || "").match(/\brequest(?:\s+id)?\s*#?\s*(\d+)\b/i) || String(message || "").match(/\b#(\d{1,10})\b/);
  return match ? Number(match[1]) : null;
}

function extractBranchSearchTerm(message) {
  const quotedMatch = String(message || "").match(/branch\s+"([^"]+)"/i);
  if (quotedMatch) {
    return quotedMatch[1].trim();
  }

  const branchMatch = String(message || "").match(/\bbranch\s+([a-z0-9][a-z0-9\s-]{1,40})/i);
  if (!branchMatch) {
    return "";
  }

  return branchMatch[1]
    .replace(/\b(with|for|in|on|of|that|has|have|show|compare|summary|status)\b.*$/i, "")
    .trim();
}

function getRequestScopeClause(user, alias = "r") {
  const scope = getChatbotRoleScope(user);
  if (scope === "employee") {
    return { clause: ` AND ${alias}.requester_id = ? `, params: [user.id] };
  }

  if (scope === "it-support" && user.branch_id) {
    return { clause: " AND requester.branch_id = ? ", params: [user.branch_id] };
  }

  return { clause: "", params: [] };
}

function getEquipmentScopeClause(user, alias = "e") {
  const scope = getChatbotRoleScope(user);
  if (scope === "employee") {
    return {
      clause: " AND (active_assignment.employee_user_id = ? OR historical_assignment.employee_user_id = ?) ",
      params: [user.id, user.id],
    };
  }

  if (scope === "it-support" && user.branch_id) {
    return { clause: ` AND ${alias}.branch_id = ? `, params: [user.branch_id] };
  }

  return { clause: "", params: [] };
}

function describeRequestDelayReason(request, workflowSteps) {
  if (!request) {
    return "I could not determine the request delay reason.";
  }

  if (request.request_status === "rejected") {
    return "The request is no longer moving because it was rejected.";
  }

  if (request.request_status === "fulfilled") {
    return "The request is already fulfilled, so it is not currently delayed.";
  }

  if (["waiting_stock", "backordered", "on_hold"].includes(request.fulfillment_status)) {
    const labels = {
      waiting_stock: "waiting for stock",
      backordered: "backordered",
      on_hold: "on hold",
    };
    return `The request is delayed because it is currently ${labels[request.fulfillment_status] || request.fulfillment_status}.`;
  }

  const pendingStep = workflowSteps.find((step) => step.action_status === "pending");
  if (pendingStep) {
    return `The request is waiting at the ${pendingStep.step_label} step for ${pendingStep.actor_role}.`;
  }

  if (request.request_status === "approved") {
    return "The request is approved and waiting for fulfillment processing.";
  }

  return `The request is currently marked ${request.request_status}.`;
}

async function getDetailedRequestAnswer(user, message, requestId = null) {
  const scope = getChatbotRoleScope(user);
  const effectiveRequestId = requestId || extractRequestId(message);
  const normalized = normalizeChatbotText(message);
  const scopeFilter = getRequestScopeClause(user);

  let params = [];
  let requestWhereClause = "";

  if (effectiveRequestId) {
    requestWhereClause = "r.id = ?";
    params.push(effectiveRequestId);
  } else if (scope === "employee") {
    requestWhereClause = "r.requester_id = ?";
    params.push(user.id);
  } else if (normalized.includes("my request") || normalized.includes("latest request") || normalized.includes("recent request")) {
    requestWhereClause = "r.requester_id = ?";
    params.push(user.id);
  } else {
    return null;
  }

  const [requestRows] = await pool.query(
    `
      SELECT
        r.id,
        r.request_status,
        r.fulfillment_status,
        r.request_type,
        r.notes,
        r.final_security_approval_status,
        r.created_at,
        c.name AS category_name,
        CONCAT(requester.first_name, ' ', requester.last_name) AS requester_name,
        CONCAT(target_user.first_name, ' ', target_user.last_name) AS target_name
      FROM requests r
      INNER JOIN categories c ON c.id = r.category_id
      INNER JOIN users requester ON requester.id = r.requester_id
      LEFT JOIN users target_user ON target_user.id = r.target_employee_user_id
      WHERE ${requestWhereClause}
      ${scopeFilter.clause}
      ORDER BY r.created_at DESC
      LIMIT 1
    `,
    [...params, ...scopeFilter.params],
  );

  if (requestRows.length === 0) {
    return {
      intent: "request_detail",
      answer: [effectiveRequestId ? `I could not find request ${effectiveRequestId} in your visible scope.` : "I could not find a matching request in your visible scope."],
      suggestions: getChatbotSuggestionsForScope(scope),
    };
  }

  const request = requestRows[0];
  const [workflowSteps] = await pool.query(
    `
      SELECT
        step_label,
        actor_role,
        action_status,
        action_note,
        acted_at
      FROM request_workflow_steps
      WHERE request_id = ?
      ORDER BY id ASC
    `,
    [request.id],
  );

  const pendingStep = workflowSteps.find((step) => step.action_status === "pending");
  const requestReason = describeRequestDelayReason(request, workflowSteps);
  const answer = [
    `Request ${request.id} is currently ${request.request_status}${request.fulfillment_status ? ` with fulfillment status ${request.fulfillment_status}` : ""}.`,
    requestReason,
  ];

  if (request.final_security_approval_status && request.final_security_approval_status !== "pending") {
    answer.push(`Final security approval is marked ${request.final_security_approval_status}.`);
  }

  return {
    intent: "request_detail",
    answer,
    suggestions: getChatbotSuggestionsForScope(scope),
    records: [
      {
        title: `Request ${request.id} - ${request.category_name}`,
        subtitle: `Requester: ${request.requester_name}${request.target_name ? ` - Target: ${request.target_name}` : ""}`,
        meta: pendingStep ? `Current step: ${pendingStep.step_label}` : `Created ${new Date(request.created_at).toLocaleDateString()}`,
      },
      ...workflowSteps.slice(0, 5).map((step) => ({
        title: step.step_label,
        subtitle: `${step.actor_role} - ${step.action_status}`,
        meta: step.action_note || (step.acted_at ? `Acted ${new Date(step.acted_at).toLocaleDateString()}` : "No action note recorded"),
      })),
    ],
  };
}

async function getApprovalTrailAnswer(user, message) {
  const requestId = extractRequestId(message);
  if (!requestId) {
    return null;
  }

  const detailed = await getDetailedRequestAnswer(user, message, requestId);
  if (!detailed || detailed.intent !== "request_detail") {
    return detailed;
  }

  detailed.intent = "approval_history";
  detailed.answer = [
    `Here is the approval trail I found for request ${requestId}.`,
    ...detailed.answer.slice(1),
  ];
  return detailed;
}

async function getAssetHistoryAnswer(user, message) {
  const scope = getChatbotRoleScope(user);
  const searchTerm = extractAssetSearchTerm(message).trim();
  if (!searchTerm) {
    return null;
  }

  const scopeFilter = getEquipmentScopeClause(user);
  const [assetRows] = await pool.query(
    `
      SELECT
        e.id,
        e.asset_tag,
        e.serial_number,
        e.equipment_name,
        e.model_name,
        e.status,
        b.name AS branch_name,
        CONCAT(active_user.first_name, ' ', active_user.last_name) AS active_assignee_name
      FROM equipment e
      LEFT JOIN branches b ON b.id = e.branch_id
      LEFT JOIN assignments active_assignment
        ON active_assignment.equipment_id = e.id
        AND active_assignment.status = 'active'
      LEFT JOIN users active_user ON active_user.id = active_assignment.employee_user_id
      LEFT JOIN assignments historical_assignment ON historical_assignment.equipment_id = e.id
      WHERE (
        e.asset_tag LIKE ?
        OR e.serial_number LIKE ?
        OR e.equipment_name LIKE ?
      )
      ${scopeFilter.clause}
      ORDER BY e.updated_at DESC, e.id DESC
      LIMIT 1
    `,
    [`%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`, ...scopeFilter.params],
  );

  if (assetRows.length === 0) {
    return {
      intent: "asset_history",
      answer: [`I could not find an asset matching "${searchTerm}" in your visible scope.`],
      suggestions: getChatbotSuggestionsForScope(scope),
    };
  }

  const asset = assetRows[0];
  const [lifecycleRows] = await pool.query(
    `
      SELECT
        event_label,
        event_note,
        from_status,
        to_status,
        created_at
      FROM asset_lifecycle_events
      WHERE equipment_id = ?
      ORDER BY created_at DESC
      LIMIT 5
    `,
    [asset.id],
  );
  const [issueRows] = await pool.query(
    `
      SELECT issue_title, priority, issue_status
      FROM issues
      WHERE equipment_id = ?
      ORDER BY created_at DESC
      LIMIT 3
    `,
    [asset.id],
  );
  const [maintenanceRows] = await pool.query(
    `
      SELECT maintenance_status, condition_status, final_disposition, started_at
      FROM maintenance_records
      WHERE equipment_id = ?
      ORDER BY started_at DESC
      LIMIT 3
    `,
    [asset.id],
  );

  const answer = [
    `${asset.asset_tag} is currently ${asset.status}${asset.branch_name ? ` in ${asset.branch_name}` : ""}.`,
    asset.active_assignee_name ? `It is actively assigned to ${asset.active_assignee_name}.` : "It is not actively assigned right now.",
  ];

  if (issueRows.some((issue) => issue.issue_status !== "closed")) {
    answer.push(`I also found ${issueRows.length} recent issue record(s) linked to this asset.`);
  } else if (maintenanceRows.length > 0) {
    answer.push(`There are ${maintenanceRows.length} recent maintenance record(s) linked to this asset.`);
  }

  return {
    intent: "asset_history",
    answer,
    suggestions: getChatbotSuggestionsForScope(scope),
    records: [
      {
        title: `${asset.asset_tag} - ${asset.equipment_name}`,
        subtitle: `Status: ${asset.status}${asset.model_name ? ` - Model: ${asset.model_name}` : ""}`,
        meta: asset.serial_number ? `Serial: ${asset.serial_number}` : "Serial not set",
      },
      ...lifecycleRows.map((event) => ({
        title: event.event_label,
        subtitle: `${event.from_status || "unknown"} -> ${event.to_status || "unknown"}`,
        meta: event.event_note || `Logged ${new Date(event.created_at).toLocaleDateString()}`,
      })),
      ...issueRows.map((issue) => ({
        title: issue.issue_title,
        subtitle: `Issue status: ${issue.issue_status}`,
        meta: `Priority: ${issue.priority}`,
      })),
      ...maintenanceRows.map((maintenance) => ({
        title: `Maintenance ${maintenance.maintenance_status}`,
        subtitle: maintenance.condition_status || "Condition not recorded",
        meta: maintenance.final_disposition || `Started ${new Date(maintenance.started_at).toLocaleDateString()}`,
      })),
    ].slice(0, 7),
  };
}

async function getBranchInsightAnswer(user, message) {
  const scope = getChatbotRoleScope(user);
  const normalized = normalizeChatbotText(message);

  if (!normalized.includes("branch")) {
    return null;
  }

  if (normalized.includes("most") || normalized.includes("highest") || normalized.includes("compare")) {
    let statusFilter = null;
    if (normalized.includes("available") || normalized.includes("stock")) {
      statusFilter = "available";
    } else if (normalized.includes("assigned")) {
      statusFilter = "assigned";
    } else if (normalized.includes("maintenance") || normalized.includes("repair")) {
      statusFilter = "maintenance";
    }

    const [rows] = await pool.query(
      `
        SELECT
          b.name AS branch_name,
          COUNT(*) AS total
        FROM equipment e
        INNER JOIN branches b ON b.id = e.branch_id
        ${statusFilter ? "WHERE e.status = ?" : ""}
        GROUP BY b.id, b.name
        ORDER BY total DESC, b.name ASC
        LIMIT 5
      `,
      statusFilter ? [statusFilter] : [],
    );

    if (rows.length === 0) {
      return null;
    }

    return {
      intent: "branch_comparison",
      answer: [
        `I compared branch totals ${statusFilter ? `for ${statusFilter} assets` : "across tracked assets"}.`,
        `${rows[0].branch_name} currently has the highest count with ${rows[0].total} asset(s) in that view.`,
      ],
      suggestions: getChatbotSuggestionsForScope(scope),
      records: rows.map((row) => ({
        title: row.branch_name,
        subtitle: `${row.total} asset(s)`,
      })),
    };
  }

  const branchSearchTerm = extractBranchSearchTerm(message);
  if (!branchSearchTerm) {
    return null;
  }

  const [branchRows] = await pool.query(
    `
      SELECT id, name
      FROM branches
      WHERE name LIKE ?
      ORDER BY name ASC
      LIMIT 1
    `,
    [`%${branchSearchTerm}%`],
  );

  if (branchRows.length === 0) {
    return null;
  }

  const branch = branchRows[0];
  const [summaryRows] = await pool.query(
    `
      SELECT status, COUNT(*) AS total
      FROM equipment
      WHERE branch_id = ?
      GROUP BY status
      ORDER BY status ASC
    `,
    [branch.id],
  );

  const totals = Object.fromEntries(summaryRows.map((row) => [row.status, Number(row.total)]));
  const total = summaryRows.reduce((sum, row) => sum + Number(row.total), 0);

  return {
    intent: "branch_inventory",
    answer: [
      `${branch.name} currently has ${total} tracked asset(s).`,
      `Available: ${totals.available || 0}, Assigned: ${totals.assigned || 0}, Maintenance: ${totals.maintenance || 0}, Retired: ${totals.retired || 0}, Lost: ${totals.lost || 0}.`,
    ],
    suggestions: getChatbotSuggestionsForScope(scope),
  };
}

async function getKnowledgeGroundedAnswer(user, message) {
  const scope = getChatbotRoleScope(user);
  const matches = await searchChatbotKnowledge(message, {
    limit: 3,
    minScore: 0.2,
  });

  if (matches.length === 0) {
    return null;
  }

  return {
    intent: "knowledge_answer",
    answer: [
      `Here is the closest guidance I found for that question from the Airtel IMS documentation.`,
      ...matches.slice(0, 2).map((match) => summarizeKnowledgeChunk(match)).filter(Boolean),
    ],
    suggestions: getChatbotSuggestionsForScope(scope),
    records: matches.map((match) => ({
      title: `${match.source} - ${match.heading}`,
      subtitle: summarizeKnowledgeChunk(match) || "Documentation match",
      meta: `Match score ${(match.score * 100).toFixed(0)}%`,
    })),
  };
}

async function resolveGroundedChatbotResponse(user, message) {
  const normalized = normalizeChatbotText(message);

  if (
    normalized.includes("how to request") ||
    normalized.includes("how can i request") ||
    normalized.includes("how do i request") ||
    normalized.includes("who approve request first") ||
    normalized.includes("who approves request first") ||
    normalized.includes("who approves first") ||
    normalized.includes("approval order") ||
    normalized.includes("how request workflow work")
  ) {
    const workflowAnswer = await getKnowledgeGroundedAnswer(user, message);
    if (workflowAnswer) {
      workflowAnswer.intent = "workflow_help";
      return workflowAnswer;
    }
  }

  if (
    normalized.includes("request") &&
    (
      extractRequestId(message) ||
      normalized.includes("status") ||
      normalized.includes("approved") ||
      normalized.includes("delayed") ||
      normalized.includes("rejected") ||
      normalized.includes("fulfilled") ||
      normalized.includes("my request")
    )
  ) {
    const requestAnswer = normalized.includes("approve") || normalized.includes("approval")
      ? await getApprovalTrailAnswer(user, message)
      : await getDetailedRequestAnswer(user, message);
    if (requestAnswer) {
      return requestAnswer;
    }
  }

  if (
    extractAssetSearchTerm(message) &&
    (normalized.includes("asset") ||
      normalized.includes("serial") ||
      normalized.includes("history") ||
      normalized.includes("who has") ||
      normalized.includes("where is") ||
      normalized.includes("device"))
  ) {
    const assetAnswer = await getAssetHistoryAnswer(user, message);
    if (assetAnswer) {
      return assetAnswer;
    }
  }

  if (normalized.includes("branch")) {
    const branchAnswer = await getBranchInsightAnswer(user, message);
    if (branchAnswer) {
      return branchAnswer;
    }
  }

  if (
    normalized.includes("workflow") ||
    normalized.includes("approval chain") ||
    normalized.includes("after hrd") ||
    normalized.includes("after itd") ||
    normalized.includes("after final approval") ||
    normalized.includes("policy") ||
    normalized.includes("process") ||
    normalized.includes("new hire") ||
    normalized.includes("replacement") ||
    normalized.includes("loss") ||
    normalized.includes("theft") ||
    (normalized.includes("approve") && normalized.includes("return")) ||
    (normalized.includes("approve") && normalized.includes("device"))
  ) {
    const knowledgeAnswer = await getKnowledgeGroundedAnswer(user, message);
    if (knowledgeAnswer) {
      return knowledgeAnswer;
    }
  }

  return null;
}

async function loadChatbotIntentCatalog() {
  if (!chatbotIntentCatalogPromise) {
    chatbotIntentCatalogPromise = fs
      .readFile(chatbotTrainingFile, "utf8")
      .then((file) => JSON.parse(file))
      .then((payload) =>
        Array.isArray(payload?.intents)
          ? payload.intents.map((intent) => ({
              tag: String(intent.tag || "").trim(),
              patterns: Array.isArray(intent.patterns) ? intent.patterns.map((pattern) => String(pattern || "")) : [],
            }))
          : [],
      )
      .catch(() => []);
  }

  return chatbotIntentCatalogPromise;
}

function scoreChatbotIntentMatch(message, pattern) {
  const normalizedMessage = normalizeChatbotText(message);
  const normalizedPattern = normalizeChatbotText(pattern);

  if (!normalizedMessage || !normalizedPattern) {
    return 0;
  }

  if (normalizedMessage === normalizedPattern) {
    return 1;
  }

  if (normalizedMessage.includes(normalizedPattern)) {
    return 0.94;
  }

  const messageTokens = tokenizeChatbotText(normalizedMessage);
  const patternTokens = tokenizeChatbotText(normalizedPattern);

  if (messageTokens.length === 0 || patternTokens.length === 0) {
    return 0;
  }

  const patternTokenSet = new Set(patternTokens);
  const overlapCount = messageTokens.filter((token) => patternTokenSet.has(token)).length;

  if (overlapCount === 0) {
    return 0;
  }

  const overlapRatio = overlapCount / patternTokens.length;
  const coverageRatio = overlapCount / messageTokens.length;
  return overlapRatio * 0.75 + coverageRatio * 0.25;
}

async function classifyChatbotIntentLocally(message) {
  const catalog = await loadChatbotIntentCatalog();
  let bestMatch = { intent: "", confidence: 0 };

  for (const intent of catalog) {
    for (const pattern of intent.patterns) {
      const confidence = scoreChatbotIntentMatch(message, pattern);
      if (confidence > bestMatch.confidence) {
        bestMatch = { intent: intent.tag, confidence };
      }
    }
  }

  return bestMatch.confidence >= 0.58 ? bestMatch : null;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startChatbotService() {
  if (!chatbotServiceAutoStart || chatbotServiceStartAttempted) {
    return false;
  }

  chatbotServiceStartAttempted = true;

  const launchers = [
    { command: "python", args: ["app.py"] },
    { command: "py", args: ["-3", "app.py"] },
  ];

  for (const launcher of launchers) {
    try {
      const child = spawn(launcher.command, launcher.args, {
        cwd: chatbotBaseDirectory,
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      });
      child.unref();
      await delay(1200);
      return true;
    } catch {
      // Try the next launcher.
    }
  }

  return false;
}

async function classifyChatbotIntentWithService(message, role) {
  const requestClassification = async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);

    try {
      const response = await fetch(`${chatbotServiceUrl}/classify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message, role }),
        signal: controller.signal,
      });

      if (!response.ok) {
        return null;
      }

      const payload = await response.json();
      const intent = String(payload?.intent || "").trim();
      const confidence = Number(payload?.confidence || 0);

      if (!intent || !Number.isFinite(confidence) || confidence < 0.45) {
        return null;
      }

      return { intent, confidence };
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  };

  let result = await requestClassification();

  if (result || !chatbotServiceAutoStart) {
    return result;
  }

  const started = await startChatbotService();
  if (!started) {
    return null;
  }

  result = await requestClassification();
  return result;
}

function getChatbotRoleScope(user) {
  const role = String(user?.role_name || "");

  if (role === "employee") {
    return "employee";
  }

  if (role === "IT Support engineer" || role === "IT officer" || role === "IT security manager") {
    return "it-support";
  }

  if (role === "IT Director" || role === "IT infrastructure manager") {
    return "it-manager";
  }

  if (role === "HR DIRECTOR" || role === "HR Recruitment officer" || role === "Hr department") {
    return "hr";
  }

  if (role === "admin") {
    return "admin";
  }

  return "general";
}

function getChatbotSuggestionsForScope(scope) {
  const map = {
    employee: [
      "What is the status of my request?",
      "Which devices are assigned to me?",
      "How do I return a device?",
    ],
    "it-support": [
      "How many devices are available in my branch?",
      "Show assets under maintenance",
      "What requests are waiting for fulfillment?",
    ],
    "it-manager": [
      "What requests are waiting for IT approval?",
      "Summarize open issues",
      "Show maintenance workload",
    ],
    hr: [
      "What requests are waiting for HR approval?",
      "How does the request workflow work?",
      "Summarize pending requests",
    ],
    admin: [
      "Summarize inventory status",
      "Show pending requests",
      "Find asset TAG-102",
      "What should we improve in this system?",
    ],
    general: [
      "Summarize inventory status",
      "How does the request workflow work?",
      "Show open issues",
      "What should we improve in this system?",
    ],
  };

  return map[scope] ?? map.general;
}

function shouldUseGeneralKnowledgeFallback(message) {
  const normalized = normalizeChatbotText(message);

  if (!normalized) {
    return false;
  }

  const generalSignals = [
    "improve",
    "best practice",
    "recommend",
    "suggest",
    "explain",
    "how do i",
    "how can i",
    "what is",
    "why does",
    "compare",
    "difference between",
    "write",
    "draft",
    "create",
    "plan",
    "teach me",
    "help me understand",
    "advice",
    "idea",
  ];

  const airtelSignals = [
    "asset",
    "request",
    "approval",
    "workflow",
    "branch",
    "stock",
    "inventory",
    "maintenance",
    "issue",
    "return",
    "assignment",
    "airtel",
    "ims",
    "employee",
    "device handover",
  ];

  const hasGeneralSignal = generalSignals.some((signal) => normalized.includes(signal));
  const hasAirtelSignal = airtelSignals.some((signal) => normalized.includes(signal));
  const looksLikeGeneralQuestion =
    normalized.includes("?") ||
    normalized.startsWith("who ") ||
    normalized.startsWith("what ") ||
    normalized.startsWith("when ") ||
    normalized.startsWith("where ") ||
    normalized.startsWith("why ") ||
    normalized.startsWith("how ");

  return (hasGeneralSignal && !hasAirtelSignal) || (!hasAirtelSignal && looksLikeGeneralQuestion);
}

function isProjectDifferentiationQuestion(message) {
  const normalized = normalizeChatbotText(message);

  if (!normalized) {
    return false;
  }

  return (
    (normalized.includes("special") || normalized.includes("unique") || normalized.includes("different")) &&
    (normalized.includes("project") || normalized.includes("system") || normalized.includes("inventory") || normalized.includes("ims"))
  ) || (
    (normalized.includes("compare") || normalized.includes("difference between")) &&
    (normalized.includes("inventory system") || normalized.includes("other inventory"))
  );
}

function buildProjectDifferentiationAnswer() {
  return {
    intent: "project_differentiation",
    answer: [
      "This project goes beyond basic inventory tracking by managing the full employee device lifecycle from request to approval, assignment, return, maintenance, and retirement.",
      "It is also strongly role-based, with separate workflows for HR, IT support, IT leadership, storekeeping, and employees instead of treating inventory as a single admin-only process.",
      "Another standout feature is its operational control layer: OTP and Microsoft sign-in, audit logs, notifications, lifecycle history, branch-aware dashboards, and workflow-specific approvals are all built into the same platform.",
    ],
    suggestions: [
      "How does the request workflow work?",
      "What should we improve in this system?",
      "Summarize inventory status",
    ],
  };
}

async function generateGeneralKnowledgeAnswer(message) {
  if (!openAiApiKey) {
    return null;
  }

  const response = await fetch(`${openAiApiBaseUrl}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: openAiGeneralChatModel,
      reasoning: { effort: "low" },
      input: [
        {
          role: "developer",
          content: [
            {
              type: "input_text",
              text: [
                "You are a helpful assistant inside Airtel IMS.",
                "Answer general questions clearly and concisely.",
                "If the user asks about Airtel IMS live data, requests, approvals, assets, assignments, or workflow records, do not invent facts.",
                "For Airtel IMS data questions, say you need system data lookup and keep the answer grounded.",
                "For broad questions like improvements, writing help, planning, explanations, or general advice, answer normally.",
              ].join(" "),
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: String(message || ""),
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error("General AI fallback is unavailable right now.");
  }

  const payload = await response.json();
  const outputText = String(payload?.output_text || "").trim();

  if (!outputText) {
    return null;
  }

  return {
    intent: "general_knowledge",
    answer: outputText
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 6),
    suggestions: [
      "What should we improve in this system?",
      "Help me write a professional email",
      "Explain a concept simply",
    ],
  };
}

function buildChatbotHelpResponse(scope) {
  const responses = {
    employee: [
      "I can help you track your requests, assigned devices, and return status.",
      "Try asking about your current request status, devices assigned to you, or how the return workflow works.",
    ],
    "it-support": [
      "I can help with branch stock, fulfillment, maintenance, returns, and open issues.",
      "Try asking about available devices, assets under maintenance, or requests waiting for fulfillment.",
    ],
    "it-manager": [
      "I can summarize IT approvals, open issues, maintenance workload, and return approval queues.",
      "Try asking for pending approvals, issue summaries, or maintenance status.",
    ],
    hr: [
      "I can summarize HR approval queues and explain the request workflow.",
      "Try asking what requests are waiting for HR approval or how onboarding device requests flow.",
    ],
    admin: [
      "I can summarize inventory, requests, issues, maintenance, and help locate assets.",
      "Try asking for inventory status, pending requests, or a specific asset tag.",
    ],
    general: [
      "I can answer Airtel IMS questions and also help with broader work questions like explanations, writing, planning, and improvement ideas.",
      "Try asking for a system summary, request status, an asset lookup, or a general question.",
    ],
  };

  return {
    intent: "help",
    answer: responses[scope] ?? responses.general,
    suggestions: getChatbotSuggestionsForScope(scope),
  };
}

function extractAssetSearchTerm(message) {
  const directTagMatch = String(message || "").match(/\b[A-Z]{2,}[A-Z0-9-]{2,}\b/);
  if (directTagMatch) {
    return directTagMatch[0];
  }

  const quotedMatch = String(message || "").match(/"([^"]+)"/);
  if (quotedMatch) {
    return quotedMatch[1];
  }

  return "";
}

async function findEquipmentForChat(user, message) {
  const scope = getChatbotRoleScope(user);
  const searchTerm = extractAssetSearchTerm(message).trim();

  if (!searchTerm) {
    return {
      intent: "find_equipment",
      answer: ["Tell me the asset tag, serial number, or equipment name you want me to find."],
      suggestions: getChatbotSuggestionsForScope(scope),
    };
  }

  const isBranchScoped = scope === "it-support" && user.branch_id;
  const params = [`%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`];
  let branchClause = "";

  if (isBranchScoped) {
    branchClause = " AND e.branch_id = ? ";
    params.push(user.branch_id);
  }

  const [rows] = await pool.query(
    `
      SELECT
        e.asset_tag,
        e.serial_number,
        e.equipment_name,
        e.status,
        b.name AS branch_name,
        CONCAT(u.first_name, ' ', u.last_name) AS assignee_name
      FROM equipment e
      LEFT JOIN branches b ON b.id = e.branch_id
      LEFT JOIN assignments a ON a.equipment_id = e.id AND a.status = 'active'
      LEFT JOIN users u ON u.id = a.employee_user_id
      WHERE (
        e.asset_tag LIKE ?
        OR e.serial_number LIKE ?
        OR e.equipment_name LIKE ?
      )
      ${branchClause}
      ORDER BY e.updated_at DESC, e.id DESC
      LIMIT 5
    `,
    params,
  );

  if (rows.length === 0) {
    return {
      intent: "find_equipment",
      answer: [`I could not find any equipment matching "${searchTerm}".`],
      suggestions: getChatbotSuggestionsForScope(scope),
    };
  }

  return {
    intent: "find_equipment",
    answer: ["Here are the closest matching assets I found."],
    suggestions: getChatbotSuggestionsForScope(scope),
    records: rows.map((row) => ({
      title: `${row.asset_tag} • ${row.equipment_name}`,
      subtitle: `Status: ${row.status}${row.branch_name ? ` • Branch: ${row.branch_name}` : ""}`,
      meta: row.assignee_name ? `Assigned to ${row.assignee_name}` : "Currently not assigned",
    })),
  };
}

async function getEmployeeRequestSummary(user) {
  const [rows] = await pool.query(
    `
      SELECT
        r.id,
        r.request_status,
        r.fulfillment_status,
        c.name AS category_name,
        r.created_at
      FROM requests r
      INNER JOIN categories c ON c.id = r.category_id
      WHERE r.requester_id = ?
      ORDER BY r.created_at DESC
      LIMIT 5
    `,
    [user.id],
  );

  if (rows.length === 0) {
    return {
      intent: "my_requests",
      answer: ["You do not have any requests in the system yet."],
      suggestions: getChatbotSuggestionsForScope("employee"),
    };
  }

  const pendingCount = rows.filter((row) => row.request_status === "pending").length;
  const fulfilledCount = rows.filter((row) => row.request_status === "fulfilled").length;

  return {
    intent: "my_requests",
    answer: [
      `You have ${rows.length} recent requests.`,
      `${pendingCount} are still pending and ${fulfilledCount} are already fulfilled.`,
    ],
    suggestions: getChatbotSuggestionsForScope("employee"),
    records: rows.map((row) => ({
      title: `Request ${row.id} • ${row.category_name}`,
      subtitle: `Status: ${row.request_status}${row.fulfillment_status ? ` • Fulfillment: ${row.fulfillment_status}` : ""}`,
      meta: `Created ${new Date(row.created_at).toLocaleDateString()}`,
    })),
  };
}

async function getEmployeeAssignmentSummary(user) {
  const [rows] = await pool.query(
    `
      SELECT
        a.id,
        e.asset_tag,
        e.equipment_name,
        a.status,
        a.assigned_at,
        a.expected_return_date
      FROM assignments a
      INNER JOIN equipment e ON e.id = a.equipment_id
      WHERE a.employee_user_id = ?
      ORDER BY a.assigned_at DESC
      LIMIT 5
    `,
    [user.id],
  );

  if (rows.length === 0) {
    return {
      intent: "my_assignments",
      answer: ["You do not have any assigned equipment right now."],
      suggestions: getChatbotSuggestionsForScope("employee"),
    };
  }

  return {
    intent: "my_assignments",
    answer: [`You currently have ${rows.filter((row) => row.status === "active").length} active equipment assignment(s).`],
    suggestions: getChatbotSuggestionsForScope("employee"),
    records: rows.map((row) => ({
      title: `${row.asset_tag} • ${row.equipment_name}`,
      subtitle: `Assignment status: ${row.status}`,
      meta: row.expected_return_date ? `Expected return: ${new Date(row.expected_return_date).toLocaleDateString()}` : `Assigned ${new Date(row.assigned_at).toLocaleDateString()}`,
    })),
  };
}

async function getAvailableStockSummary(user) {
  const scope = getChatbotRoleScope(user);
  const isBranchScoped = scope === "it-support" && user.branch_id;
  const params = ["available"];
  let branchClause = "";

  if (isBranchScoped) {
    branchClause = " AND branch_id = ? ";
    params.push(user.branch_id);
  }

  const [[summary]] = await pool.query(
    `
      SELECT COUNT(*) AS total
      FROM equipment
      WHERE status = ?
      ${branchClause}
    `,
    params,
  );

  const [rows] = await pool.query(
    `
      SELECT asset_tag, equipment_name, model_name
      FROM equipment
      WHERE status = ?
      ${branchClause}
      ORDER BY updated_at DESC, id DESC
      LIMIT 5
    `,
    params,
  );

  const scopeLabel = isBranchScoped ? "in your branch" : "in the system";

  return {
    intent: "available_stock",
    answer: [`There are ${Number(summary?.total ?? 0)} available assets ${scopeLabel}.`],
    suggestions: getChatbotSuggestionsForScope(scope),
    records: rows.map((row) => ({
      title: `${row.asset_tag} • ${row.equipment_name}`,
      subtitle: row.model_name || "Model not set",
    })),
  };
}

async function getPendingApprovalSummary(user) {
  const scope = getChatbotRoleScope(user);
  let actorRole = null;

  if (scope === "it-support") {
    actorRole = "IT Support engineer";
  } else if (scope === "it-manager") {
    actorRole = "IT Director";
  } else if (scope === "hr") {
    actorRole = "HR DIRECTOR";
  } else if (scope === "admin") {
    actorRole = null;
  } else {
    return buildChatbotHelpResponse(scope);
  }

  let rows = [];

  if (actorRole) {
    [rows] = await pool.query(
      `
        SELECT
          r.id,
          c.name AS category_name,
          CONCAT(u.first_name, ' ', u.last_name) AS requester_name,
          s.step_label
        FROM request_workflow_steps s
        INNER JOIN requests r ON r.id = s.request_id
        INNER JOIN users u ON u.id = r.requester_id
        INNER JOIN categories c ON c.id = r.category_id
        WHERE s.actor_role = ?
          AND s.action_status = 'pending'
        ORDER BY r.created_at DESC
        LIMIT 6
      `,
      [actorRole],
    );
  } else {
    [rows] = await pool.query(
      `
        SELECT
          r.id,
          c.name AS category_name,
          CONCAT(u.first_name, ' ', u.last_name) AS requester_name,
          s.step_label
        FROM request_workflow_steps s
        INNER JOIN requests r ON r.id = s.request_id
        INNER JOIN users u ON u.id = r.requester_id
        INNER JOIN categories c ON c.id = r.category_id
        WHERE s.action_status = 'pending'
        ORDER BY r.created_at DESC
        LIMIT 6
      `,
    );
  }

  if (rows.length === 0) {
    return {
      intent: "pending_approvals",
      answer: ["There are no matching pending approvals right now."],
      suggestions: getChatbotSuggestionsForScope(scope),
    };
  }

  return {
    intent: "pending_approvals",
    answer: [`I found ${rows.length} pending approval item(s) in the current queue.`],
    suggestions: getChatbotSuggestionsForScope(scope),
    records: rows.map((row) => ({
      title: `Request ${row.id} • ${row.category_name}`,
      subtitle: row.step_label,
      meta: `Requester: ${row.requester_name}`,
    })),
  };
}

async function getFulfillmentQueueSummary(user) {
  const scope = getChatbotRoleScope(user);
  const isBranchScoped = scope === "it-support" && user.branch_id;
  const params = [];
  let branchClause = "";

  if (isBranchScoped) {
    branchClause = " AND req.branch_id = ? ";
    params.push(user.branch_id);
  }

  const [rows] = await pool.query(
    `
      SELECT
        req.id,
        req.request_status,
        req.fulfillment_status,
        req.category_name,
        req.requester_name
      FROM (
        SELECT
          r.id,
          r.request_status,
          r.fulfillment_status,
          r.created_at,
          u.branch_id,
          c.name AS category_name,
          CONCAT(u.first_name, ' ', u.last_name) AS requester_name
        FROM requests r
        INNER JOIN categories c ON c.id = r.category_id
        INNER JOIN users u ON u.id = r.requester_id
      ) req
      WHERE req.request_status = 'approved'
      ${branchClause}
      ORDER BY req.created_at DESC, req.id DESC
      LIMIT 8
    `,
    params,
  );

  if (rows.length === 0) {
    return {
      intent: "fulfillment_queue",
      answer: ["There are no approved requests waiting for fulfillment right now."],
      suggestions: getChatbotSuggestionsForScope(scope),
    };
  }

  const blockedCount = rows.filter((row) => ["waiting_stock", "backordered", "on_hold"].includes(row.fulfillment_status)).length;

  return {
    intent: "fulfillment_queue",
    answer: [
      `I found ${rows.length} approved request(s) in the fulfillment queue.`,
      blockedCount > 0 ? `${blockedCount} are currently waiting on stock, backorder, or hold status.` : "None of them are currently blocked by stock or hold status.",
    ],
    suggestions: getChatbotSuggestionsForScope(scope),
    records: rows.map((row) => ({
      title: `Request ${row.id} - ${row.category_name}`,
      subtitle: `Status: ${row.request_status} - Fulfillment: ${row.fulfillment_status}`,
      meta: `Requester: ${row.requester_name}`,
    })),
  };
}

async function getMaintenanceSummary(user) {
  const scope = getChatbotRoleScope(user);
  const isBranchScoped = scope === "it-support" && user.branch_id;
  const params = [];
  let branchClause = "";

  if (isBranchScoped) {
    branchClause = " WHERE m.branch_id = ? ";
    params.push(user.branch_id);
  }

  const [rows] = await pool.query(
    `
      SELECT
        m.asset_tag,
        m.equipment_name,
        m.maintenance_status,
        m.employee_name
      FROM (
        SELECT
          mr.maintenance_status,
          e.asset_tag,
          e.equipment_name,
          e.branch_id,
          CONCAT(u.first_name, ' ', u.last_name) AS employee_name
        FROM maintenance_records mr
        INNER JOIN equipment e ON e.id = mr.equipment_id
        LEFT JOIN returns r ON r.id = mr.return_id
        LEFT JOIN users u ON u.id = r.employee_user_id
      ) m
      ${branchClause}
      ORDER BY m.asset_tag ASC
      LIMIT 8
    `,
    params,
  );

  if (rows.length === 0) {
    return {
      intent: "maintenance_summary",
      answer: ["There are no maintenance records matching your scope right now."],
      suggestions: getChatbotSuggestionsForScope(scope),
    };
  }

  const underRepair = rows.filter((row) => row.maintenance_status === "under_repair").length;

  return {
    intent: "maintenance_summary",
    answer: [`I found ${rows.length} maintenance record(s), including ${underRepair} under repair.`],
    suggestions: getChatbotSuggestionsForScope(scope),
    records: rows.map((row) => ({
      title: `${row.asset_tag} • ${row.equipment_name}`,
      subtitle: `Maintenance status: ${row.maintenance_status}`,
      meta: row.employee_name ? `Linked employee: ${row.employee_name}` : "No employee linked",
    })),
  };
}

async function getIssueSummary(user) {
  const scope = getChatbotRoleScope(user);
  const isBranchScoped = scope === "it-support" && user.branch_id;
  const params = [];
  let branchClause = "";

  if (isBranchScoped) {
    branchClause = " AND e.branch_id = ? ";
    params.push(user.branch_id);
  }

  const [rows] = await pool.query(
    `
      SELECT
        i.issue_title,
        i.priority,
        i.issue_status,
        e.asset_tag,
        e.equipment_name
      FROM issues i
      INNER JOIN equipment e ON e.id = i.equipment_id
      WHERE i.issue_status <> 'closed'
      ${branchClause}
      ORDER BY i.created_at DESC
      LIMIT 8
    `,
    params,
  );

  if (rows.length === 0) {
    return {
      intent: "issue_summary",
      answer: ["There are no open issues matching your scope right now."],
      suggestions: getChatbotSuggestionsForScope(scope),
    };
  }

  const highPriority = rows.filter((row) => ["high", "critical"].includes(String(row.priority).toLowerCase())).length;

  return {
    intent: "issue_summary",
    answer: [`There are ${rows.length} open issues in this view, with ${highPriority} marked high or critical.`],
    suggestions: getChatbotSuggestionsForScope(scope),
    records: rows.map((row) => ({
      title: `${row.asset_tag} • ${row.equipment_name}`,
      subtitle: `${row.issue_title}`,
      meta: `Priority: ${row.priority} • Status: ${row.issue_status}`,
    })),
  };
}

async function getReturnSummary(user) {
  const scope = getChatbotRoleScope(user);

  if (scope === "employee") {
    const [rows] = await pool.query(
      `
        SELECT
          r.id,
          r.return_status,
          e.asset_tag,
          e.equipment_name,
          r.requested_at
        FROM returns r
        INNER JOIN equipment e ON e.id = r.equipment_id
        WHERE r.employee_user_id = ?
        ORDER BY r.requested_at DESC
        LIMIT 5
      `,
      [user.id],
    );

    if (rows.length === 0) {
      return {
        intent: "returns_status",
        answer: ["You have not submitted any return requests yet."],
        suggestions: getChatbotSuggestionsForScope(scope),
      };
    }

    return {
      intent: "returns_status",
      answer: [`You have ${rows.length} recent return request(s).`],
      suggestions: getChatbotSuggestionsForScope(scope),
      records: rows.map((row) => ({
        title: `${row.asset_tag} • ${row.equipment_name}`,
        subtitle: `Return status: ${row.return_status}`,
        meta: `Requested ${new Date(row.requested_at).toLocaleDateString()}`,
      })),
    };
  }

  const isBranchScoped = scope === "it-support" && user.branch_id;
  const params = [];
  let branchClause = "";

  if (isBranchScoped) {
    branchClause = " AND e.branch_id = ? ";
    params.push(user.branch_id);
  }

  const [rows] = await pool.query(
    `
      SELECT
        r.id,
        r.return_status,
        e.asset_tag,
        e.equipment_name,
        CONCAT(u.first_name, ' ', u.last_name) AS employee_name
      FROM returns r
      INNER JOIN equipment e ON e.id = r.equipment_id
      LEFT JOIN users u ON u.id = r.employee_user_id
      WHERE 1 = 1
      ${branchClause}
      ORDER BY r.requested_at DESC
      LIMIT 8
    `,
    params,
  );

  if (rows.length === 0) {
    return {
      intent: "returns_status",
      answer: ["There are no return records matching your scope right now."],
      suggestions: getChatbotSuggestionsForScope(scope),
    };
  }

  return {
    intent: "returns_status",
    answer: [`I found ${rows.length} recent return record(s).`],
    suggestions: getChatbotSuggestionsForScope(scope),
    records: rows.map((row) => ({
      title: `${row.asset_tag} • ${row.equipment_name}`,
      subtitle: `Return status: ${row.return_status}`,
      meta: row.employee_name ? `Employee: ${row.employee_name}` : "Employee not set",
    })),
  };
}

async function getInventorySummary(user) {
  const scope = getChatbotRoleScope(user);
  const isBranchScoped = scope === "it-support" && user.branch_id;
  const params = [];
  let branchClause = "";

  if (isBranchScoped) {
    branchClause = " WHERE branch_id = ? ";
    params.push(user.branch_id);
  }

  const [rows] = await pool.query(
    `
      SELECT status, COUNT(*) AS total
      FROM equipment
      ${branchClause}
      GROUP BY status
      ORDER BY status ASC
    `,
    params,
  );

  const summaryMap = Object.fromEntries(rows.map((row) => [row.status, Number(row.total)]));
  const total = rows.reduce((sum, row) => sum + Number(row.total), 0);

  return {
    intent: "inventory_summary",
    answer: [
      `There are ${total} tracked assets ${isBranchScoped ? "in your branch" : "in the system view available to you"}.`,
      `Available: ${summaryMap.available || 0}, Assigned: ${summaryMap.assigned || 0}, Maintenance: ${summaryMap.maintenance || 0}, Retired: ${summaryMap.retired || 0}, Lost: ${summaryMap.lost || 0}.`,
    ],
    suggestions: getChatbotSuggestionsForScope(scope),
  };
}

async function getSystemAdminSummary(user) {
  const scope = getChatbotRoleScope(user);

  if (scope !== "admin") {
    return getInventorySummary(user);
  }

  const [[userStats]] = await pool.query(
    `
      SELECT
        COUNT(*) AS totalUsers,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS activeUsers,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pendingUsers,
        SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) AS inactiveUsers
      FROM users
    `,
  );

  const [[assetStats]] = await pool.query(
    `
      SELECT
        COUNT(*) AS totalAssets,
        SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) AS availableAssets,
        SUM(CASE WHEN status = 'assigned' THEN 1 ELSE 0 END) AS assignedAssets,
        SUM(CASE WHEN status = 'maintenance' THEN 1 ELSE 0 END) AS maintenanceAssets
      FROM equipment
    `,
  );

  const [[requestStats]] = await pool.query(
    `
      SELECT
        COUNT(*) AS totalRequests,
        SUM(CASE WHEN request_status = 'pending' THEN 1 ELSE 0 END) AS pendingRequests,
        SUM(CASE WHEN request_status = 'approved' THEN 1 ELSE 0 END) AS approvedRequests,
        SUM(CASE WHEN request_status = 'fulfilled' THEN 1 ELSE 0 END) AS fulfilledRequests
      FROM requests
    `,
  );

  const [[issueStats]] = await pool.query(
    `
      SELECT
        SUM(CASE WHEN issue_status NOT IN ('resolved', 'closed') THEN 1 ELSE 0 END) AS openIssues
      FROM issues
    `,
  );

  const [[locationStats]] = await pool.query(
    `
      SELECT
        (SELECT COUNT(*) FROM branches) AS totalBranches,
        (SELECT COUNT(*) FROM country) AS totalCountries,
        (SELECT COUNT(*) FROM department) AS totalDepartments
    `,
  );

  const [roleBreakdown] = await pool.query(
    `
      SELECT
        r.name AS role_name,
        COUNT(*) AS total
      FROM users u
      INNER JOIN roles r ON r.id = u.role_id
      GROUP BY r.id, r.name
      ORDER BY total DESC, r.name ASC
      LIMIT 6
    `,
  );

  const totalUsers = Number(userStats?.totalUsers ?? 0);
  const activeUsers = Number(userStats?.activeUsers ?? 0);
  const pendingUsers = Number(userStats?.pendingUsers ?? 0);
  const inactiveUsers = Number(userStats?.inactiveUsers ?? 0);
  const totalAssets = Number(assetStats?.totalAssets ?? 0);
  const availableAssets = Number(assetStats?.availableAssets ?? 0);
  const assignedAssets = Number(assetStats?.assignedAssets ?? 0);
  const maintenanceAssets = Number(assetStats?.maintenanceAssets ?? 0);
  const totalRequests = Number(requestStats?.totalRequests ?? 0);
  const pendingRequests = Number(requestStats?.pendingRequests ?? 0);
  const approvedRequests = Number(requestStats?.approvedRequests ?? 0);
  const fulfilledRequests = Number(requestStats?.fulfilledRequests ?? 0);
  const openIssues = Number(issueStats?.openIssues ?? 0);
  const totalBranches = Number(locationStats?.totalBranches ?? 0);
  const totalCountries = Number(locationStats?.totalCountries ?? 0);
  const totalDepartments = Number(locationStats?.totalDepartments ?? 0);

  return {
    intent: "system_admin_summary",
    answer: [
      `There are ${totalUsers} users in the system: ${activeUsers} active, ${pendingUsers} pending, and ${inactiveUsers} inactive.`,
      `The platform currently tracks ${totalAssets} assets, ${totalRequests} requests, and ${openIssues} open issues.`,
      `Coverage includes ${totalBranches} branches, ${totalCountries} countries, and ${totalDepartments} departments. Assets currently available: ${availableAssets}; assigned: ${assignedAssets}; under maintenance: ${maintenanceAssets}.`,
      `Requests currently pending: ${pendingRequests}; approved: ${approvedRequests}; fulfilled: ${fulfilledRequests}.`,
    ],
    suggestions: [
      "How many users do we have by role?",
      "Summarize inventory status",
      "Show pending requests",
      "What makes this project special?",
    ],
    records: roleBreakdown.map((row) => ({
      title: row.role_name,
      subtitle: `${Number(row.total)} user(s)`,
      meta: "Role distribution",
    })),
  };
}

async function getWorkflowHelp() {
  return {
    intent: "workflow_help",
    answer: [
      "Replacement requests now flow from HR Recruitment Officer to IT Support Engineer for device health validation, then back to HR Recruitment Officer to book replacement equipment if needed.",
      "If IT Support confirms the device is still healthy, the HR Recruitment Officer can close the replacement request and tell the employee to continue using the device.",
      "A request can be approved, rejected, or fulfilled depending on the current workflow step and stock availability.",
    ],
    suggestions: [
      "What requests are waiting for approval?",
      "How do returns work?",
      "Summarize inventory status",
    ],
  };
}

function getDepreciationHelpResponse() {
  return {
    intent: "depreciation_help",
    answer: [
      "Airtel IMS now uses straight-line depreciation for device visibility.",
      "The annual depreciation is calculated as purchase cost divided by lifespan years, with a default lifespan of 4 years when none is set.",
      "Each device view can show annual depreciation, accumulated depreciation, and current book value based on the purchase date or purchase year.",
    ],
    suggestions: [
      "Summarize inventory status",
      "Find asset TAG-102",
      "What makes this project special?",
    ],
  };
}

function normalizeReplacementText(value) {
  return String(value || "").trim().toLowerCase();
}

function getReplacementRiskDaysBetween(startValue, endValue = null) {
  const startDate = startValue ? new Date(startValue) : null;
  const endDate = endValue ? new Date(endValue) : new Date();

  if (!startDate || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return 0;
  }

  const milliseconds = endDate.getTime() - startDate.getTime();
  return Math.max(Math.ceil(milliseconds / (1000 * 60 * 60 * 24)), 0);
}

function getEquipmentAgeSnapshot(item) {
  const cost = Number(item.purchase_cost ?? 0);
  const lifespanYears =
    typeof item.lifespan_years === "number" && Number.isFinite(item.lifespan_years) && item.lifespan_years > 0
      ? item.lifespan_years
      : 4;

  const startDate = item.purchase_date
    ? new Date(item.purchase_date)
    : item.purchase_year
      ? new Date(`${item.purchase_year}-01-01T00:00:00`)
      : null;

  if (!startDate || Number.isNaN(startDate.getTime())) {
    return null;
  }

  const ageYears = Math.max((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25), 0);
  const annualDepreciation = cost > 0 ? cost / lifespanYears : 0;
  const accumulatedDepreciation = Math.min(annualDepreciation * ageYears, cost > 0 ? cost : 0);
  const bookValue = cost > 0 ? Math.max(cost - accumulatedDepreciation, 0) : 0;

  return {
    ageYears: Number(ageYears.toFixed(1)),
    lifespanYears,
    bookValue,
  };
}

function sigmoid(value) {
  const numeric = Number(value) || 0;
  if (numeric >= 0) {
    const z = Math.exp(-numeric);
    return 1 / (1 + z);
  }
  const z = Math.exp(numeric);
  return z / (1 + z);
}

function dotProduct(a, b) {
  let sum = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    sum += a[i] * b[i];
  }
  return sum;
}

function normalizeDispositionLabel(value) {
  const normalized = normalizeReplacementText(value);
  if (!normalized) {
    return null;
  }
  if (["retired", "dispose", "disposed", "scrap", "replaced"].some((word) => normalized.includes(word))) {
    return 1;
  }
  return 0;
}

function buildReplacementMlFeatures({ equipmentRow, maintenanceRows, issueRows, returnRows }) {
  const snapshot = getEquipmentAgeSnapshot(equipmentRow);
  const repairedCount = maintenanceRows.filter((record) => record.maintenance_status === "repaired").length;
  const underRepairCount = maintenanceRows.filter((record) => record.maintenance_status === "under_repair").length;
  const notRepairableCount = maintenanceRows.filter((record) => record.maintenance_status === "not_repairable").length;
  const maintenanceEventsLast180Days = maintenanceRows.filter(
    (record) => getReplacementRiskDaysBetween(record.started_at) <= 180,
  ).length;
  const downtimeDays = maintenanceRows.reduce(
    (total, record) => total + getReplacementRiskDaysBetween(record.started_at, record.completed_at),
    0,
  );

  const unresolvedIssues = issueRows.filter(
    (issue) => !["closed", "resolved"].includes(normalizeReplacementText(issue.issue_status)),
  ).length;

  const latestReturn = returnRows
    .slice()
    .sort(
      (left, right) =>
        new Date(right.processed_at || right.returned_at || right.it_reviewed_at || right.requested_at).getTime() -
        new Date(left.processed_at || left.returned_at || left.it_reviewed_at || left.requested_at).getTime(),
    )[0];

  const ageYears = snapshot?.ageYears ?? 0;
  const lifespanYears = snapshot?.lifespanYears ?? (Number(equipmentRow.lifespan_years) || 4);
  const ageRatio = lifespanYears > 0 ? ageYears / lifespanYears : 0;
  const outOfWarranty = equipmentRow.warranty_end_date
    ? Number(new Date(equipmentRow.warranty_end_date).getTime() < Date.now())
    : 0;
  const healthBad = ["faulty", "poor", "damaged", "critical", "broken", "bad"].some((keyword) =>
    normalizeReplacementText(equipmentRow.device_health).includes(keyword),
  )
    ? 1
    : 0;

  const lastConditionBad = ["damaged", "broken", "faulty", "poor", "not compatible"].some((keyword) =>
    normalizeReplacementText(latestReturn?.condition_status).includes(keyword),
  )
    ? 1
    : 0;

  const lastDispositionRetire = normalizeDispositionLabel(latestReturn?.disposition || equipmentRow.replacement_disposition) || 0;

  return {
    featureNames: [
      "age_years",
      "age_ratio",
      "lifespan_years",
      "repaired_count",
      "under_repair_count",
      "not_repairable_count",
      "maintenance_events_last_180_days",
      "downtime_days",
      "unresolved_issues",
      "out_of_warranty",
      "health_bad",
      "last_condition_bad",
      "last_disposition_retire",
    ],
    values: [
      ageYears,
      ageRatio,
      lifespanYears,
      repairedCount,
      underRepairCount,
      notRepairableCount,
      maintenanceEventsLast180Days,
      downtimeDays,
      unresolvedIssues,
      outOfWarranty,
      healthBad,
      lastConditionBad,
      lastDispositionRetire,
    ].map((value) => (Number.isFinite(Number(value)) ? Number(value) : 0)),
  };
}

function predictReplacementProbability(featureVector, model) {
  if (!model?.weights?.length || !model?.featureNames?.length) {
    return null;
  }

  const aligned = model.featureNames.map((name) => {
    const idx = featureVector.featureNames.indexOf(name);
    return idx >= 0 ? featureVector.values[idx] : 0;
  });

  const imputerStats = model.preprocessing?.medianImputer?.statistics;
  const scalerMean = model.preprocessing?.standardScaler?.mean;
  const scalerScale = model.preprocessing?.standardScaler?.scale;

  const normalized = aligned.map((value, index) => {
    let current = Number(value);
    if (!Number.isFinite(current)) {
      current = Array.isArray(imputerStats) ? Number(imputerStats[index] ?? 0) : 0;
    }
    if (Array.isArray(scalerMean) && Array.isArray(scalerScale)) {
      const mean = Number(scalerMean[index] ?? 0);
      const scale = Number(scalerScale[index] ?? 1);
      return scale ? (current - mean) / scale : current - mean;
    }
    return current;
  });

  const logit = dotProduct(normalized, model.weights) + (Number(model.intercept) || 0);
  return sigmoid(logit);
}

async function runIotFailureTrainingScript() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "python",
      [
        IOT_FAILURE_TRAINING_SCRIPT,
        "--csv",
        IOT_FAILURE_DATA_FILE,
        "--model-out",
        IOT_FAILURE_PICKLE_FILE,
        "--metrics-out",
        IOT_FAILURE_METRICS_FILE,
        "--json-model-out",
        IOT_FAILURE_MODEL_FILE,
      ],
      {
        cwd: path.join(__dirname, ".."),
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(new Error(stderr.trim() || stdout.trim() || `IoT failure model training exited with code ${code}.`));
    });
  });
}

function buildReplacementPrediction(item, maintenanceRecords, issues, returns) {
  const reasons = [];
  let score = 0;
  const snapshot = getEquipmentAgeSnapshot(item);
  const equipmentMaintenance = maintenanceRecords.filter((record) => Number(record.equipment_id) === Number(item.id));
  const equipmentIssues = issues.filter(
    (issue) =>
      Number(issue.equipment_id) === Number(item.id) &&
      !["closed", "resolved"].includes(normalizeReplacementText(issue.issue_status)),
  );
  const latestReturn = returns
    .filter((record) => Number(record.equipment_id) === Number(item.id))
    .sort(
      (left, right) =>
        new Date(right.processed_at || right.returned_at || right.it_reviewed_at || right.requested_at).getTime() -
        new Date(left.processed_at || left.returned_at || left.it_reviewed_at || left.requested_at).getTime(),
    )[0];

  const repairedCount = equipmentMaintenance.filter((record) => record.maintenance_status === "repaired").length;
  const underRepairCount = equipmentMaintenance.filter((record) => record.maintenance_status === "under_repair").length;
  const notRepairableCount = equipmentMaintenance.filter((record) => record.maintenance_status === "not_repairable").length;
  const maintenanceEventsLast180Days = equipmentMaintenance.filter(
    (record) => getReplacementRiskDaysBetween(record.started_at) <= 180,
  ).length;
  const downtimeDays = equipmentMaintenance.reduce(
    (total, record) => total + getReplacementRiskDaysBetween(record.started_at, record.completed_at),
    0,
  );
  const normalizedHealth = normalizeReplacementText(item.device_health);
  const normalizedCondition = normalizeReplacementText(latestReturn?.condition_status);
  const normalizedDisposition = normalizeReplacementText(latestReturn?.disposition || item.replacement_disposition);

  if (notRepairableCount > 0) {
    score += 46;
    reasons.push("At least one maintenance outcome was marked not repairable");
  }

  if (underRepairCount >= 2) {
    score += 24;
    reasons.push(`${underRepairCount} active repair events`);
  } else if (underRepairCount === 1) {
    score += 12;
    reasons.push("Device is currently under repair");
  }

  if (repairedCount >= 3) {
    score += 24;
    reasons.push(`${repairedCount} repairs recorded`);
  } else if (repairedCount >= 1) {
    score += 10;
    reasons.push(`${repairedCount} repair record${repairedCount > 1 ? "s" : ""}`);
  }

  if (maintenanceEventsLast180Days >= 3) {
    score += 18;
    reasons.push(`${maintenanceEventsLast180Days} maintenance events in the last 180 days`);
  } else if (maintenanceEventsLast180Days === 2) {
    score += 10;
    reasons.push("Repeated maintenance in the last 180 days");
  }

  if (downtimeDays >= 30) {
    score += 18;
    reasons.push(`${downtimeDays} downtime day(s) accumulated`);
  } else if (downtimeDays >= 14) {
    score += 10;
    reasons.push(`${downtimeDays} downtime day(s) accumulated`);
  } else if (downtimeDays > 0) {
    score += 4;
  }

  if (equipmentIssues.length >= 3) {
    score += 18;
    reasons.push(`${equipmentIssues.length} unresolved issues`);
  } else if (equipmentIssues.length >= 1) {
    score += 8;
    reasons.push(`${equipmentIssues.length} unresolved issue${equipmentIssues.length > 1 ? "s" : ""}`);
  }

  if (snapshot) {
    const ageRatio = snapshot.lifespanYears > 0 ? snapshot.ageYears / snapshot.lifespanYears : 0;
    if (snapshot.ageYears >= snapshot.lifespanYears) {
      score += 20;
      reasons.push(`Reached planned lifespan (${snapshot.ageYears}/${snapshot.lifespanYears} years)`);
    } else if (ageRatio >= 0.75) {
      score += 12;
      reasons.push(`Near planned replacement age (${snapshot.ageYears}/${snapshot.lifespanYears} years)`);
    }

    if ((item.purchase_cost ?? 0) > 0 && snapshot.bookValue <= (item.purchase_cost ?? 0) * 0.2 && snapshot.ageYears >= 2) {
      score += 8;
      reasons.push("Low remaining book value");
    }
  }

  if (item.warranty_end_date) {
    const warrantyEnd = new Date(item.warranty_end_date);
    if (!Number.isNaN(warrantyEnd.getTime())) {
      const daysToWarrantyEnd = Math.ceil((warrantyEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (daysToWarrantyEnd < 0) {
        score += 12;
        reasons.push("Out of warranty");
      } else if (daysToWarrantyEnd <= 90) {
        score += 6;
        reasons.push(`Warranty ends in ${daysToWarrantyEnd} day(s)`);
      }
    }
  }

  if (["faulty", "poor", "damaged", "critical", "broken", "bad"].some((keyword) => normalizedHealth.includes(keyword))) {
    score += 16;
    reasons.push(`Device health marked as ${item.device_health}`);
  }

  if (["damaged", "broken", "faulty", "poor", "not compatible"].some((keyword) => normalizedCondition.includes(keyword))) {
    score += 12;
    reasons.push(`Latest return condition: ${latestReturn?.condition_status}`);
  }

  if (["retired", "dispose", "disposed", "scrap", "not repairable"].some((keyword) => normalizedDisposition.includes(keyword))) {
    score += 16;
    reasons.push(`Latest disposition suggests retirement: ${latestReturn?.disposition || item.replacement_disposition}`);
  }

  if (reasons.length === 0) {
    reasons.push("Maintenance and lifecycle signals are stable");
  }

  const mlFeatures = buildReplacementMlFeatures({
    equipmentRow: item,
    maintenanceRows: equipmentMaintenance,
    issueRows: equipmentIssues,
    returnRows: returns.filter((record) => Number(record.equipment_id) === Number(item.id)),
  });
  const mlProbability = predictReplacementProbability(mlFeatures, replacementMlModel);
  if (typeof mlProbability === "number") {
    const mlScore = Math.max(0, Math.min(Math.round(mlProbability * 100), 100));
    score = Math.round(score * 0.65 + mlScore * 0.35);
    reasons.unshift(`ML predictor score: ${mlScore}% likelihood of replacement need`);
  }

  const finalScore = Math.max(0, Math.min(Math.round(score), 100));
  let recommendation = "Keep in service";
  if (finalScore >= 75) {
    recommendation = "Replace recommended";
  } else if (finalScore >= 50) {
    recommendation = "Review for replacement";
  }

  let supportGuidance = "Continue monitoring the device through normal checks.";
  if (recommendation === "Replace recommended") {
    supportGuidance = "Prepare a replacement request, stop investing in repeated repairs, and plan handover to the user.";
  } else if (recommendation === "Review for replacement") {
    supportGuidance = "Inspect the latest maintenance outcome, confirm user impact, and decide whether repair or replacement is more cost-effective.";
  }

  return {
    equipmentId: item.id,
    assetTag: item.asset_tag,
    equipmentName: item.equipment_name,
    categoryName: item.category_name || null,
    branchName: item.branch_name || null,
    status: item.status,
    score: finalScore,
    recommendation,
    supportGuidance,
    reasons,
    maintenanceSummary: {
      repairedCount,
      underRepairCount,
      notRepairableCount,
      downtimeDays,
      maintenanceEventsLast180Days,
    },
    issueCount: equipmentIssues.length,
    ml: typeof mlProbability === "number"
      ? { modelVersion: replacementMlModel?.version || null, probability: mlProbability }
      : null,
  };
}

function applyReplacementScope(user, equipmentRows) {
  const scope = getChatbotRoleScope(user);

  if (scope === "employee") {
    return equipmentRows.filter((item) => item.employee_user_id === user.id);
  }

  if (scope === "it-support" && user.branch_id) {
    return equipmentRows.filter((item) => Number(item.branch_id) === Number(user.branch_id));
  }

  return equipmentRows;
}

async function getReplacementPredictionSummary(user) {
  const scope = getChatbotRoleScope(user);
  const dashboardData = await getWorkflowDashboardData(user.id);
  const visibleInsights = applyReplacementScope(user, dashboardData.replacementInsights || []);
  const flaggedInsights = visibleInsights.filter((item) => item.recommendation !== "Keep in service");

  if (flaggedInsights.length === 0) {
    return {
      intent: "replacement_candidates",
      answer: ["I do not see any devices currently flagged for replacement in your scope."],
      suggestions: getChatbotSuggestionsForScope(scope),
    };
  }

  const replaceNow = flaggedInsights.filter((item) => item.recommendation === "Replace recommended").length;
  const reviewSoon = flaggedInsights.filter((item) => item.recommendation === "Review for replacement").length;

  return {
    intent: "replacement_candidates",
    answer: [
      `I found ${flaggedInsights.length} device(s) needing attention for replacement planning.`,
      `${replaceNow} are marked Replace recommended and ${reviewSoon} are marked Review for replacement.`,
      "Use the support guidance on each item to decide whether to raise a replacement request immediately or validate the latest repair outcome first.",
    ],
    suggestions: [
      "How does replacement recommendation work?",
      "Show maintenance workload",
      "Summarize inventory status",
    ],
    records: flaggedInsights.slice(0, 8).map((item) => ({
      title: `${item.assetTag} • ${item.equipmentName}`,
      subtitle: `${item.recommendation} (${item.score}%)`,
      meta: `${item.supportGuidance} / ${item.reasons[0]}`,
    })),
  };
}

function getReplacementRecommendationHelpResponse() {
  return {
    intent: "replacement_recommendation_help",
    answer: [
      "Airtel IMS now uses an interpretable predictive replacement engine that behaves like a first-pass machine-learning model, with the strongest weight placed on maintenance outcomes and repeated repairs.",
      "The score looks at maintenance status such as under repair, repaired, and not repairable, then combines that with repeated maintenance in the last 180 days, downtime, unresolved issues, warranty, age, health, and final return condition.",
      "The recommendation bands are Keep in service, Review for replacement, and Replace recommended, and each result includes human-readable reasons plus support guidance for what to do next.",
      "As your team confirms real outcomes such as repaired and kept, replaced, or retired, these records can be used later to train a supervised model on your own historical labels.",
    ],
    suggestions: [
      "Which devices should be reviewed for replacement?",
      "How is device depreciation calculated?",
      "Show maintenance workload",
      "What makes this project special?",
    ],
  };
}

function detectDirectChatbotIntent(scope, normalized) {
  if (!normalized) {
    return "help";
  }

  if (
    normalized.includes("help") ||
    normalized.includes("what can you do") ||
    normalized.includes("what should i ask") ||
    normalized.includes("assist me")
  ) {
    return "help";
  }

  if (
    normalized.includes("workflow") ||
    normalized.includes("request steps") ||
    normalized.includes("how do approvals work") ||
    normalized.includes("request stages") ||
    normalized.includes("how to request") ||
    normalized.includes("how can i request") ||
    normalized.includes("how do i request") ||
    normalized.includes("who approve request first") ||
    normalized.includes("who approves request first") ||
    normalized.includes("who approves first") ||
    normalized.includes("approval order") ||
    normalized.includes("who approve first")
  ) {
    return "workflow_help";
  }

  if (
    normalized.includes("find asset") ||
    normalized.includes("find device") ||
    normalized.includes("asset tag") ||
    normalized.includes("serial number") ||
    normalized.includes("locate serial")
  ) {
    return "find_equipment";
  }

  if (normalized.includes("maintenance") || normalized.includes("under repair")) {
    return "maintenance_summary";
  }

  if (normalized.includes("issue") || normalized.includes("incident")) {
    return "issue_summary";
  }

  if (normalized.includes("return")) {
    return "returns_status";
  }

  if (
    normalized.includes("waiting for fulfillment") ||
    normalized.includes("fulfillment queue") ||
    normalized.includes("requests waiting for fulfillment")
  ) {
    return "fulfillment_queue";
  }

  if (
    normalized.includes("waiting for approval") ||
    normalized.includes("approval queue") ||
    normalized.includes("pending approvals")
  ) {
    return "pending_approvals";
  }

  if (scope === "employee" && (normalized.includes("assigned to me") || normalized.includes("my assigned devices"))) {
    return "my_assignments";
  }

  if (
    scope === "employee" &&
    (
      normalized.includes("my requests") ||
      normalized.includes("status of my request") ||
      normalized.includes("what is the status of my request") ||
      normalized.includes("track my request") ||
      normalized.includes("did my request get approved")
    )
  ) {
    return "my_requests";
  }

  if (
    normalized.includes("available stock") ||
    normalized.includes("available assets") ||
    normalized.includes("stock availability") ||
    normalized.includes("what is in stock")
  ) {
    return "available_stock";
  }

  if (
    normalized.includes("how many users") ||
    normalized.includes("total users") ||
    normalized.includes("user count") ||
    normalized.includes("users in the system") ||
    normalized.includes("system overview") ||
    normalized.includes("admin overview") ||
    normalized.includes("tell me about our system")
  ) {
    return "system_admin_summary";
  }

  if (
    normalized.includes("depreciation") ||
    normalized.includes("book value") ||
    normalized.includes("asset value") ||
    normalized.includes("device value")
  ) {
    return "depreciation_help";
  }

  if (
    normalized.includes("replacement recommendation") ||
    normalized.includes("replacement risk") ||
    normalized.includes("review for replacement") ||
    normalized.includes("which devices should be reviewed for replacement") ||
    normalized.includes("which devices need replacement") ||
    normalized.includes("devices need replacement") ||
    normalized.includes("replacement candidates") ||
    normalized.includes("risk score") ||
    normalized.includes("should be replaced") ||
    normalized.includes("replace recommended") ||
    normalized.includes("machine learning") ||
    normalized.includes("ml")
  ) {
    if (
      normalized.includes("which devices") ||
      normalized.includes("candidates") ||
      normalized.includes("need replacement") ||
      normalized.includes("should be reviewed")
    ) {
      return "replacement_candidates";
    }

    return "replacement_recommendation_help";
  }

  if (
    normalized.includes("inventory") ||
    normalized.includes("asset summary") ||
    normalized.includes("equipment overview") ||
    normalized.includes("stock summary")
  ) {
    return "inventory_summary";
  }

  return null;
}

async function resolveChatbotIntent(user, message) {
  const scope = getChatbotRoleScope(user);
  const normalized = normalizeChatbotText(message);
  const directIntent = detectDirectChatbotIntent(scope, normalized);

  if (directIntent) {
    return directIntent;
  }

  const serviceIntent = await classifyChatbotIntentWithService(message, user.role_name);
  if (serviceIntent?.intent) {
    return serviceIntent.intent;
  }

  const localIntent = await classifyChatbotIntentLocally(message);
  if (localIntent?.intent) {
    return localIntent.intent;
  }

  if (normalized.includes("maintenance")) {
    return "maintenance_summary";
  }

  if (normalized.includes("issue")) {
    return "issue_summary";
  }

  if (normalized.includes("return")) {
    return "returns_status";
  }

  if (normalized.includes("available") || normalized.includes("stock")) {
    return "available_stock";
  }

  if (normalized.includes("approval") || normalized.includes("approve") || normalized.includes("pending requests")) {
    return "pending_approvals";
  }

  if (
    scope === "employee" &&
    (
      normalized.includes("my request") ||
      normalized.includes("request status") ||
      normalized.includes("status of my request") ||
      normalized.includes("track my request") ||
      normalized.includes("did my request get approved")
    )
  ) {
    return "my_requests";
  }

  if (scope === "employee" && (normalized.includes("my device") || normalized.includes("assigned to me") || normalized.includes("my equipment"))) {
    return "my_assignments";
  }

  if (normalized.includes("inventory") || normalized.includes("summary")) {
    return "inventory_summary";
  }

  if (
    normalized.includes("users") ||
    normalized.includes("accounts") ||
    normalized.includes("system overview")
  ) {
    return scope === "admin" ? "system_admin_summary" : "fallback";
  }

  return "fallback";
}

async function buildChatbotResponseForIntent(user, intent, message) {
  const scope = getChatbotRoleScope(user);

  switch (intent) {
    case "help":
      return buildChatbotHelpResponse(scope);
    case "workflow_help":
      return getWorkflowHelp();
    case "find_equipment":
      return findEquipmentForChat(user, message);
    case "maintenance_summary":
      return getMaintenanceSummary(user);
    case "issue_summary":
      return getIssueSummary(user);
    case "returns_status":
      return getReturnSummary(user);
    case "available_stock":
      return getAvailableStockSummary(user);
    case "pending_approvals":
      return scope === "employee" ? getEmployeeRequestSummary(user) : getPendingApprovalSummary(user);
    case "my_requests":
      return getEmployeeRequestSummary(user);
    case "my_assignments":
      return getEmployeeAssignmentSummary(user);
    case "inventory_summary":
      return getInventorySummary(user);
    case "depreciation_help":
      return getDepreciationHelpResponse();
    case "replacement_candidates":
      return getReplacementPredictionSummary(user);
    case "replacement_recommendation_help":
      return getReplacementRecommendationHelpResponse();
    case "system_admin_summary":
      return getSystemAdminSummary(user);
    case "fulfillment_queue":
      return scope === "employee" ? getEmployeeRequestSummary(user) : getFulfillmentQueueSummary(user);
    default:
      return {
        intent: "fallback",
        answer: [
          "I could not map that to a specific Airtel IMS workflow or data lookup yet.",
          "Try asking about requests, assigned devices, approvals, fulfillment, stock, returns, maintenance, issues, a specific asset tag, or a general work question.",
        ],
        suggestions: getChatbotSuggestionsForScope(scope),
      };
  }
}

async function generateChatbotResponse(user, message) {
  if (isProjectDifferentiationQuestion(message)) {
    return buildProjectDifferentiationAnswer();
  }

  const groundedResponse = await resolveGroundedChatbotResponse(user, message);
  if (groundedResponse) {
    return groundedResponse;
  }

  const intent = await resolveChatbotIntent(user, message);
  const intentResponse = await buildChatbotResponseForIntent(user, intent, message);

  if (intentResponse.intent === "fallback") {
    const knowledgeFallback = await getKnowledgeGroundedAnswer(user, message);
    if (knowledgeFallback) {
      return knowledgeFallback;
    }

    if (shouldUseGeneralKnowledgeFallback(message)) {
      const generalAnswer = await generateGeneralKnowledgeAnswer(message);
      if (generalAnswer) {
        return generalAnswer;
      }
    }

    const generalAnswer = await generateGeneralKnowledgeAnswer(message);
    if (generalAnswer) {
      return generalAnswer;
    }
  }

  return intentResponse;
}

async function getUserById(userId) {
  if (!userId) {
    return null;
  }

  const [rows] = await pool.query(
    `
      SELECT
        u.id,
        u.first_name,
        u.last_name,
        u.email,
        u.phone_number,
        u.employee_code,
        u.job_title,
        u.employment_status,
        u.office_location,
        u.start_date,
        u.employee_grade,
        u.hrms_employee_id,
        r.name AS role_name
      FROM users u
      INNER JOIN roles r ON r.id = u.role_id
      WHERE u.id = ?
      LIMIT 1
    `,
    [Number(userId)],
  );

  return rows[0] ?? null;
}

async function getMicrosoftGraphProfile(accessToken) {
  const response = await fetch("https://graph.microsoft.com/v1.0/me?$select=id,displayName,givenName,surname,mail,userPrincipalName,jobTitle,department,officeLocation,employeeId", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error("Microsoft profile lookup failed.");
  }

  return response.json();
}

async function exchangeMicrosoftAuthCode(code) {
  const tokenUrl = `${getMicrosoftAuthorityBaseUrl()}/token`;
  const body = new URLSearchParams({
    client_id: microsoftClientId,
    client_secret: microsoftClientSecret,
    code: String(code || ""),
    grant_type: "authorization_code",
    redirect_uri: microsoftRedirectUri,
    scope: "openid profile email User.Read",
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error_description || data.error || "Microsoft token exchange failed.");
  }

  return data;
}

async function getOrCreateMicrosoftUser(microsoftProfile, tokenClaims) {
  const externalAuthId = String(microsoftProfile.id || tokenClaims.oid || tokenClaims.sub || "").trim();
  const email = String(microsoftProfile.mail || tokenClaims.email || tokenClaims.preferred_username || microsoftProfile.userPrincipalName || "").trim().toLowerCase();
  const usernameUpn = String(microsoftProfile.userPrincipalName || tokenClaims.preferred_username || email).trim();

  if (!externalAuthId || !email) {
    throw new Error("Microsoft account is missing required identity fields.");
  }

  const [rows] = await pool.query(
    `
      SELECT
        u.id,
        u.first_name,
        u.last_name,
        u.email,
        u.phone_number,
        u.profile_image_url,
        u.job_title,
        u.employment_status,
        u.office_location,
        u.start_date,
        u.branch_id,
        u.country_id,
        u.department_id,
        u.unit_id,
        u.status,
        r.name AS role_name,
        b.name AS branch_name,
        c.name AS country_name
      FROM users u
      INNER JOIN roles r ON r.id = u.role_id
      LEFT JOIN branches b ON b.id = u.branch_id
      LEFT JOIN country c ON c.id = u.country_id
      WHERE (u.auth_provider = 'microsoft' AND u.external_auth_id = ?)
         OR LOWER(u.email) = ?
      ORDER BY u.id ASC
      LIMIT 1
    `,
    [externalAuthId, email],
  );

  const firstName = String(microsoftProfile.givenName || tokenClaims.given_name || microsoftProfile.displayName || "Airtel").trim();
  const lastName = String(microsoftProfile.surname || tokenClaims.family_name || "").trim() || "User";

  if (rows.length > 0) {
    const existingUser = rows[0];

    await pool.query(
      `
        UPDATE users
        SET
          auth_provider = 'microsoft',
          external_auth_id = ?,
          username_upn = ?,
          email = ?,
          first_name = COALESCE(NULLIF(first_name, ''), ?),
          last_name = COALESCE(NULLIF(last_name, ''), ?),
          job_title = COALESCE(?, job_title),
          office_location = COALESCE(?, office_location)
        WHERE id = ?
      `,
      [
        externalAuthId,
        usernameUpn || null,
        email,
        firstName,
        lastName,
        microsoftProfile.jobTitle || null,
        microsoftProfile.officeLocation || null,
        existingUser.id,
      ],
    );

    const refreshedUser = await getLoginUserByIdentifier(email, null);
    return refreshedUser;
  }

  const [[employeeRole]] = await pool.query(
    "SELECT id, name FROM roles WHERE name = 'employee' LIMIT 1",
  );

  if (!employeeRole) {
    throw new Error("Employee role is not configured.");
  }

  const employeeCode = `SSO-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  const [result] = await pool.query(
    `
      INSERT INTO users (
        first_name,
        last_name,
        email,
        employee_code,
        password_hash,
        role_id,
        status,
        job_title,
        office_location,
        auth_provider,
        external_auth_id,
        username_upn,
        hrms_employee_id
      )
      VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, 'microsoft', ?, ?, ?)
    `,
    [
      firstName,
      lastName,
      email,
      employeeCode,
      hashPassword(crypto.randomBytes(32).toString("hex")),
      employeeRole.id,
      microsoftProfile.jobTitle || null,
      microsoftProfile.officeLocation || null,
      externalAuthId,
      usernameUpn || null,
      microsoftProfile.employeeId || null,
    ],
  );

  const createdUser = await getLoginUserByIdentifier(email, null, result.insertId);
  return createdUser;
}

async function getLoginUserByIdentifier(email, normalizedPhoneNumber = null, explicitUserId = null) {
  const [rows] = await pool.query(
    `
      SELECT
        u.id,
        u.first_name,
        u.last_name,
        u.email,
        u.phone_number,
        u.profile_image_url,
        u.job_title,
        u.employment_status,
        u.office_location,
        u.start_date,
        u.must_change_password,
        u.password_hash,
        u.status,
        u.branch_id,
        u.country_id,
        u.department_id,
        u.unit_id,
        r.name AS role_name,
        b.name AS branch_name,
        c.name AS country_name
      FROM users u
      INNER JOIN roles r ON r.id = u.role_id
      LEFT JOIN branches b ON b.id = u.branch_id
      LEFT JOIN country c ON c.id = u.country_id
      WHERE (? IS NOT NULL AND u.id = ?)
         OR LOWER(u.email) = LOWER(?)
         OR (? IS NOT NULL AND u.phone_number = ?)
      LIMIT 1
    `,
    [explicitUserId, explicitUserId, email, normalizedPhoneNumber, normalizedPhoneNumber],
  );

  return rows[0] ?? null;
}

async function getRequestNotificationContext(requestId) {
  const [rows] = await pool.query(
    `
      SELECT
        r.id,
        r.notes,
        r.request_status,
        r.request_type,
        r.report_type,
        r.target_employee_user_id,
        c.name AS category_name,
        CONCAT(req.first_name, ' ', req.last_name) AS requester_name,
        req.email AS requester_email,
        CONCAT(target_user.first_name, ' ', target_user.last_name) AS target_employee_name,
        target_user.email AS target_employee_email,
        b.name AS branch_name,
        co.name AS country_name
      FROM requests r
      INNER JOIN users req ON req.id = r.requester_id
      INNER JOIN categories c ON c.id = r.category_id
      LEFT JOIN users target_user ON target_user.id = r.target_employee_user_id
      LEFT JOIN branches b ON b.id = req.branch_id
      LEFT JOIN country co ON co.id = req.country_id
      WHERE r.id = ?
      LIMIT 1
    `,
    [Number(requestId)],
  );

  return rows[0] ?? null;
}

async function findActorForRole(roleName, requester) {
  const [sameBranchRows] = await pool.query(
    `
      SELECT
        u.id,
        CONCAT(u.first_name, ' ', u.last_name) AS full_name
      FROM users u
      INNER JOIN roles r ON r.id = u.role_id
      WHERE r.name = ?
        AND u.status = 'active'
        AND (? IS NULL OR u.branch_id = ?)
      ORDER BY u.id ASC
      LIMIT 1
    `,
    [roleName, requester.branch_id, requester.branch_id],
  );

  if (sameBranchRows.length > 0) {
    return sameBranchRows[0];
  }

  const [sameCountryRows] = await pool.query(
    `
      SELECT
        u.id,
        CONCAT(u.first_name, ' ', u.last_name) AS full_name
      FROM users u
      INNER JOIN roles r ON r.id = u.role_id
      WHERE r.name = ?
        AND u.status = 'active'
        AND (? IS NULL OR u.country_id = ?)
      ORDER BY u.id ASC
      LIMIT 1
    `,
    [roleName, requester.country_id, requester.country_id],
  );

  if (sameCountryRows.length > 0) {
    return sameCountryRows[0];
  }

  const [fallbackRows] = await pool.query(
    `
      SELECT
        u.id,
        CONCAT(u.first_name, ' ', u.last_name) AS full_name
      FROM users u
      INNER JOIN roles r ON r.id = u.role_id
      WHERE r.name = ?
        AND u.status = 'active'
      ORDER BY u.id ASC
      LIMIT 1
    `,
    [roleName],
  );

  return fallbackRows[0] ?? null;
}

async function createWorkflowStepsForRequest(requestId, requester, requestType = "standard", targetEmployeeUserId = null) {
  const workflowDefinitions = await getWorkflowDefinitions(requestType);

  for (const step of workflowDefinitions) {
    const shouldSkipHrBookingForNewHire =
      step.key === "hr_booking" &&
      requestType === "new_hire" &&
      Number(targetEmployeeUserId) > 0 &&
      String(requester?.role_name || "").trim().toLowerCase() === String(step.roleName || "").trim().toLowerCase();

    if (shouldSkipHrBookingForNewHire) {
      continue;
    }

    const actor = await findActorForRole(step.roleName, requester);

    await pool.query(
      `
        INSERT INTO request_workflow_steps (
          request_id,
          step_key,
          step_label,
          actor_role,
          actor_user_id,
          action_status
        )
        VALUES (?, ?, ?, ?, ?, 'pending')
      `,
      [requestId, step.key, step.label, step.roleName, actor?.id ?? null],
    );
  }
}

function buildCurrentStage(steps, requestStatus, fulfillmentStatus) {
  const rejectedStep = steps.find((step) => step.action_status === "rejected");

  if (rejectedStep) {
    return {
      key: "rejected",
      label: `Rejected at ${rejectedStep.step_label}`,
    };
  }

  if (requestStatus === "fulfilled") {
    if (fulfillmentStatus === "kept_in_service") {
      return {
        key: "kept_in_service",
        label: "Device kept in service",
      };
    }

    return {
      key: "fulfilled",
      label: "Equipment delivered",
    };
  }

  const pendingStep = steps.find((step) => step.action_status === "pending");

  if (pendingStep) {
    return {
      key: pendingStep.step_key,
      label: pendingStep.step_label,
    };
  }

  if (requestStatus === "approved") {
    return {
      key: "approved",
      label: "Approved and waiting for device handover",
    };
  }

  return {
    key: "completed",
    label: "Completed",
  };
}

async function getWorkflowRequestById(requestId) {
  const [requestRows] = await pool.query(
    `
      SELECT
        r.id,
        r.requester_id,
        r.category_id,
        r.approver_id,
        r.request_status,
        r.request_type,
        r.target_employee_user_id,
        r.source_request_id,
        r.source_equipment_id,
        r.replacement_disposition,
        r.replacement_condition_status,
        r.report_type,
        r.booked_equipment_id,
        r.hrms_snapshot,
        r.final_security_approval_status,
        r.final_security_approved_at,
        r.fulfillment_status,
        r.fulfillment_note,
        r.fulfillment_updated_at,
        r.clarification_status,
        r.clarification_note,
        r.clarification_requested_by,
        r.clarification_requested_at,
        r.clarification_target_user_id,
        r.clarification_target_role,
        r.notes,
        r.created_at,
        r.created_at AS requested_at,
        CONCAT(req.first_name, ' ', req.last_name) AS requester_name,
        req.email AS requester_email,
        d.name AS requester_department_name,
        req.job_title AS requester_job_title,
        req.employment_status AS requester_employment_status,
        req.office_location AS requester_office_location,
        req.start_date AS requester_start_date,
        req.branch_id AS requester_branch_id,
        req.country_id AS requester_country_id,
        cat.name AS category_name,
        b.name AS branch_name,
        co.name AS country_name,
        CONCAT(app.first_name, ' ', app.last_name) AS approver_name,
        CONCAT(target_user.first_name, ' ', target_user.last_name) AS target_employee_name,
        target_user.email AS target_employee_email,
        target_user.employee_code AS target_employee_code,
        target_user.phone_number AS target_employee_phone_number,
        target_user.job_title AS target_employee_job_title,
        target_user.employment_status AS target_employee_employment_status,
        target_user.office_location AS target_employee_office_location,
        target_user.start_date AS target_employee_start_date,
        target_user.employee_grade AS target_employee_grade,
        target_user.hrms_employee_id AS target_employee_hrms_employee_id,
        target_role.name AS target_employee_role_name,
        target_department.name AS target_employee_department_name
      FROM requests r
      INNER JOIN users req ON req.id = r.requester_id
      INNER JOIN categories cat ON cat.id = r.category_id
      LEFT JOIN users app ON app.id = r.approver_id
      LEFT JOIN users target_user ON target_user.id = r.target_employee_user_id
      LEFT JOIN roles target_role ON target_role.id = target_user.role_id
      LEFT JOIN department target_department ON target_department.id = target_user.department_id
      LEFT JOIN department d ON d.id = req.department_id
      LEFT JOIN branches b ON b.id = req.branch_id
      LEFT JOIN country co ON co.id = req.country_id
      WHERE r.id = ?
      LIMIT 1
    `,
    [requestId],
  );

  if (requestRows.length === 0) {
    return null;
  }

  const [stepRows] = await pool.query(
    `
      SELECT
        s.id,
        s.request_id,
        s.step_key,
        s.step_label,
        s.actor_role,
        s.actor_user_id,
        s.action_status,
        s.action_note,
        s.acted_at,
        CONCAT(u.first_name, ' ', u.last_name) AS actor_name
      FROM request_workflow_steps s
      LEFT JOIN users u ON u.id = s.actor_user_id
      WHERE s.request_id = ?
      ORDER BY s.id ASC
    `,
    [requestId],
  );

  const request = requestRows[0];
  const steps = stepRows;
  const currentStage = buildCurrentStage(steps, request.request_status, request.fulfillment_status);
  const fulfillmentLabels = {
    waiting_stock: "Waiting for stock",
    backordered: "Backordered",
    on_hold: "On hold",
  };
  const fulfillmentLabel = request.request_status !== "fulfilled" && request.request_status !== "rejected"
    ? fulfillmentLabels[request.fulfillment_status]
    : null;
  const clarificationLabel = request.clarification_status === "needed"
    ? `Clarification needed from ${request.target_employee_user_id ? "HR requester" : "requester"}`
    : null;

  return {
    ...request,
    workflowSteps: steps,
    currentStageKey: clarificationLabel ? "clarification" : fulfillmentLabel ? request.fulfillment_status : currentStage.key,
    currentStageLabel: clarificationLabel || fulfillmentLabel || currentStage.label,
  };
}

async function getWorkflowDashboardData(userId) {
  const currentUser = await getUserContext(userId);

  if (!currentUser) {
    throw new Error("User not found.");
  }

  const [categories] = await pool.query(
    "SELECT id, name, depreciation_rate FROM categories ORDER BY name ASC",
  );

  const [equipment] = await pool.query(
    `
      SELECT
        e.id,
        e.asset_tag,
        e.serial_number,
        e.computer_name,
        e.equipment_name,
        e.status,
        e.stock_location,
        e.category_id,
        e.branch_id,
        e.country_id,
        e.vendor_name,
        e.model_name,
        e.purchase_date,
        e.purchase_year,
        e.purchase_cost,
        e.location_details,
        e.device_health,
        e.warranty_end_date,
        e.lifespan_years,
        e.equipment_specs,
        replacement_request.id AS replacement_request_id,
        replacement_request.request_status AS replacement_request_status,
        replacement_request.replacement_disposition,
        replacement_request.replacement_condition_status,
        replacement_request.fulfillment_updated_at AS replacement_processed_at,
        c.name AS category_name,
        b.name AS branch_name,
        co.name AS country_name
      FROM equipment e
      LEFT JOIN (
        SELECT source_equipment_id, MAX(id) AS latest_replacement_request_id
        FROM requests
        WHERE request_type = 'replacement'
          AND request_status = 'fulfilled'
          AND source_equipment_id IS NOT NULL
        GROUP BY source_equipment_id
      ) latest_replacement ON latest_replacement.source_equipment_id = e.id
      LEFT JOIN requests replacement_request ON replacement_request.id = latest_replacement.latest_replacement_request_id
      LEFT JOIN categories c ON c.id = e.category_id
      LEFT JOIN branches b ON b.id = e.branch_id
      LEFT JOIN country co ON co.id = e.country_id
      ORDER BY e.id DESC
    `,
  );
  const scopedEquipment = currentUser.role_name === "IT Support engineer"
    ? equipment.filter((item) => item.stock_location !== "warehouse_stock")
    : equipment;

  const [requests] = await pool.query(
    `
      SELECT
        r.id,
        r.requester_id,
        r.category_id,
        r.approver_id,
        r.request_status,
        r.request_type,
        r.target_employee_user_id,
        r.source_request_id,
        r.source_equipment_id,
        r.replacement_disposition,
        r.replacement_condition_status,
        r.report_type,
        r.booked_equipment_id,
        r.hrms_snapshot,
        r.final_security_approval_status,
        r.final_security_approved_at,
        r.fulfillment_status,
        r.fulfillment_note,
        r.fulfillment_updated_at,
        r.clarification_status,
        r.clarification_note,
        r.clarification_requested_by,
        r.clarification_requested_at,
        r.clarification_target_user_id,
        r.clarification_target_role,
        r.notes,
        r.created_at,
        r.created_at AS requested_at,
        CONCAT(req.first_name, ' ', req.last_name) AS requester_name,
        req.email AS requester_email,
        d.name AS requester_department_name,
        req.job_title AS requester_job_title,
        req.employment_status AS requester_employment_status,
        req.office_location AS requester_office_location,
        req.start_date AS requester_start_date,
        req.branch_id AS requester_branch_id,
        req.country_id AS requester_country_id,
        cat.name AS category_name,
        b.name AS branch_name,
        co.name AS country_name,
        CONCAT(app.first_name, ' ', app.last_name) AS approver_name,
        CONCAT(target_user.first_name, ' ', target_user.last_name) AS target_employee_name,
        target_user.email AS target_employee_email,
        target_user.employee_code AS target_employee_code,
        target_user.phone_number AS target_employee_phone_number,
        target_user.job_title AS target_employee_job_title,
        target_user.employment_status AS target_employee_employment_status,
        target_user.office_location AS target_employee_office_location,
        target_user.start_date AS target_employee_start_date,
        target_user.employee_grade AS target_employee_grade,
        target_user.hrms_employee_id AS target_employee_hrms_employee_id,
        target_role.name AS target_employee_role_name,
        target_department.name AS target_employee_department_name
      FROM requests r
      INNER JOIN users req ON req.id = r.requester_id
      INNER JOIN categories cat ON cat.id = r.category_id
      LEFT JOIN users app ON app.id = r.approver_id
      LEFT JOIN users target_user ON target_user.id = r.target_employee_user_id
      LEFT JOIN roles target_role ON target_role.id = target_user.role_id
      LEFT JOIN department target_department ON target_department.id = target_user.department_id
      LEFT JOIN department d ON d.id = req.department_id
      LEFT JOIN branches b ON b.id = req.branch_id
      LEFT JOIN country co ON co.id = req.country_id
      ORDER BY r.created_at DESC
    `,
  );

  const requestIds = requests.map((request) => request.id);
  let stepRows = [];

  if (requestIds.length > 0) {
    const [rows] = await pool.query(
      `
        SELECT
          s.id,
          s.request_id,
          s.step_key,
          s.step_label,
          s.actor_role,
          s.actor_user_id,
          s.action_status,
          s.action_note,
          s.acted_at,
          CONCAT(u.first_name, ' ', u.last_name) AS actor_name
        FROM request_workflow_steps s
        LEFT JOIN users u ON u.id = s.actor_user_id
        WHERE s.request_id IN (?)
        ORDER BY s.request_id ASC, s.id ASC
      `,
      [requestIds],
    );

    stepRows = rows;
  }

  const stepsByRequest = new Map();

  for (const step of stepRows) {
    const existing = stepsByRequest.get(step.request_id) ?? [];
    existing.push(step);
    stepsByRequest.set(step.request_id, existing);
  }

  const requestData = requests.map((request) => {
    const steps = stepsByRequest.get(request.id) ?? [];
    const currentStage = buildCurrentStage(steps, request.request_status, request.fulfillment_status);
    const fulfillmentLabels = {
      waiting_stock: "Waiting for stock",
      backordered: "Backordered",
      on_hold: "On hold",
    };
    const fulfillmentLabel = request.request_status !== "fulfilled" && request.request_status !== "rejected"
      ? fulfillmentLabels[request.fulfillment_status]
      : null;
    const clarificationLabel = request.clarification_status === "needed"
      ? `Clarification needed from ${request.target_employee_user_id ? "HR requester" : "requester"}`
      : null;

    return {
      ...request,
      workflowSteps: steps,
      currentStageKey: clarificationLabel ? "clarification" : fulfillmentLabel ? request.fulfillment_status : currentStage.key,
      currentStageLabel: clarificationLabel || fulfillmentLabel || currentStage.label,
    };
  });
  const isLivePendingRequest = (request) =>
    request.request_status === "pending" ||
    (request.request_status === "approved" && ["waiting_stock", "backordered", "on_hold"].includes(request.fulfillment_status));

  const [assignments] = await pool.query(
    `
      SELECT
        a.id,
        a.equipment_id,
        a.employee_user_id,
        a.assigned_by,
        a.assigned_at,
        a.expected_return_date,
        a.status,
        a.receipt_status,
        a.received_confirmed_at,
        a.receipt_note,
        a.notes,
        e.asset_tag,
        e.equipment_name,
        e.serial_number,
        e.computer_name,
        e.vendor_name,
        e.model_name,
        e.purchase_date,
        e.purchase_year,
        e.purchase_cost,
        e.location_details,
        e.device_health,
        e.warranty_end_date,
        e.lifespan_years,
        e.equipment_specs,
        c.name AS category_name,
        b.name AS branch_name,
        co.name AS country_name,
        CONCAT(emp.first_name, ' ', emp.last_name) AS employee_name,
        emp.email AS employee_email,
        emp.job_title AS employee_job_title,
        emp.employment_status AS employee_employment_status,
        emp.office_location AS employee_office_location,
        emp.start_date AS employee_start_date,
        CONCAT(assigner.first_name, ' ', assigner.last_name) AS assigned_by_name,
        replacement_request.id AS replacement_request_id,
        replacement_request.request_status AS replacement_request_status,
        replacement_request.replacement_disposition,
        replacement_request.replacement_condition_status,
        replacement_request.fulfillment_updated_at AS replacement_processed_at
      FROM assignments a
      INNER JOIN equipment e ON e.id = a.equipment_id
      LEFT JOIN categories c ON c.id = e.category_id
      INNER JOIN users emp ON emp.id = a.employee_user_id
      INNER JOIN users assigner ON assigner.id = a.assigned_by
      LEFT JOIN (
        SELECT
          source_equipment_id,
          COALESCE(target_employee_user_id, requester_id) AS replacement_employee_user_id,
          MAX(id) AS latest_replacement_request_id
        FROM requests
        WHERE request_type = 'replacement'
          AND request_status = 'fulfilled'
          AND source_equipment_id IS NOT NULL
        GROUP BY source_equipment_id, COALESCE(target_employee_user_id, requester_id)
      ) latest_replacement
        ON latest_replacement.source_equipment_id = a.equipment_id
        AND latest_replacement.replacement_employee_user_id = a.employee_user_id
      LEFT JOIN requests replacement_request
        ON replacement_request.id = latest_replacement.latest_replacement_request_id
      LEFT JOIN branches b ON b.id = emp.branch_id
      LEFT JOIN country co ON co.id = emp.country_id
      ORDER BY a.assigned_at DESC
    `,
  );

  const [employees] = await pool.query(
    `
      SELECT
        u.id,
        u.employee_code,
        CONCAT(u.first_name, ' ', u.last_name) AS full_name,
        u.email,
        u.phone_number,
        u.job_title,
        u.employment_status,
        u.office_location,
        u.start_date,
        u.status,
        u.hrms_employee_id,
        u.employee_grade,
        u.branch_id,
        u.country_id,
        u.department_id,
        b.name AS branch_name,
        co.name AS country_name,
        d.name AS department_name
      FROM users u
      INNER JOIN roles r ON r.id = u.role_id
      LEFT JOIN branches b ON b.id = u.branch_id
      LEFT JOIN country co ON co.id = u.country_id
      LEFT JOIN department d ON d.id = u.department_id
      WHERE r.name = 'employee'
      ORDER BY b.name ASC, u.first_name ASC, u.last_name ASC
    `,
  );

  let hrmsEmployees = [];
  if (["HR Recruitment officer", "Hr department"].includes(currentUser.role_name)) {
    if (isHrmsApiConfigured()) {
      try {
        hrmsEmployees = await getHrmsEmployeesForActor(currentUser);
      } catch (error) {
        if (error?.hrmsUnavailable) {
          logHrmsUnavailableWarningOnce(error);
        } else {
          console.error("HRMS employee fetch failed:", error);
        }
      }
    }

    if (hrmsEmployees.length === 0) {
      hrmsEmployees = await getLocalHrEmployeesForActor(currentUser);
    }
  }

  const [returns] = await pool.query(
    `
      SELECT
        r.id,
        r.assignment_id,
        r.equipment_id,
        r.employee_user_id,
        r.requested_by,
        r.received_by,
        r.returned_at,
        r.it_manager_user_id,
        r.storekeeper_user_id,
        r.return_reason,
        r.request_note,
        r.it_review_note,
        r.intake_note,
        r.received_condition_comment,
        r.condition_status,
        r.disposition,
        r.return_attachment_name,
        r.return_attachment_type,
        r.return_status,
        r.requested_at,
        r.hr_notified_it_at,
        r.hr_notified_it_by,
        r.it_reviewed_at,
        r.processed_at,
        r.final_hrd_approval_status,
        r.final_hrd_approved_at,
        r.final_itd_approval_status,
        r.final_itd_approved_at,
        e.asset_tag,
        e.equipment_name,
        CONCAT(emp.first_name, ' ', emp.last_name) AS employee_name,
        emp.email AS employee_email,
        emp.job_title AS employee_job_title,
        emp.employment_status AS employee_employment_status,
        emp.office_location AS employee_office_location,
        emp.start_date AS employee_start_date,
        CONCAT(receiver.first_name, ' ', receiver.last_name) AS received_by_name,
        CONCAT(it.first_name, ' ', it.last_name) AS it_manager_name,
        CONCAT(sk.first_name, ' ', sk.last_name) AS storekeeper_name
      FROM returns r
      INNER JOIN equipment e ON e.id = r.equipment_id
      INNER JOIN users emp ON emp.id = r.employee_user_id
      LEFT JOIN users receiver ON receiver.id = r.received_by
      LEFT JOIN users it ON it.id = r.it_manager_user_id
      LEFT JOIN users sk ON sk.id = r.storekeeper_user_id
      ORDER BY r.requested_at DESC
    `,
  );

  const [issues] = await pool.query(
    `
      SELECT
        i.id,
        i.equipment_id,
        i.reported_by,
        i.issue_title,
        i.issue_description,
        i.priority,
        i.issue_status,
        i.created_at,
        e.asset_tag,
        e.equipment_name,
        CONCAT(u.first_name, ' ', u.last_name) AS reported_by_name
      FROM issues i
      INNER JOIN equipment e ON e.id = i.equipment_id
      INNER JOIN users u ON u.id = i.reported_by
      ORDER BY i.created_at DESC
    `,
  );

  const [maintenanceRecords] = await pool.query(
    `
      SELECT
        m.id,
        m.equipment_id,
        m.return_id,
        m.reported_by,
        m.assigned_to,
        m.maintenance_status,
        m.condition_status,
        m.problem_description,
        m.resolution_note,
        m.final_disposition,
        m.started_at,
        m.completed_at,
        e.asset_tag,
        e.equipment_name,
        e.branch_id,
        e.country_id,
        b.name AS branch_name,
        co.name AS country_name,
        CONCAT(reporter.first_name, ' ', reporter.last_name) AS reported_by_name,
        CONCAT(owner.first_name, ' ', owner.last_name) AS employee_name
      FROM maintenance_records m
      INNER JOIN equipment e ON e.id = m.equipment_id
      LEFT JOIN branches b ON b.id = e.branch_id
      LEFT JOIN country co ON co.id = e.country_id
      LEFT JOIN users reporter ON reporter.id = m.reported_by
      LEFT JOIN assignments a ON a.equipment_id = e.id AND a.status = 'active'
      LEFT JOIN users owner ON owner.id = a.employee_user_id
      ORDER BY m.started_at DESC
    `,
  );

  const equipmentIds = scopedEquipment.map((item) => item.id);
  let lifecycleEvents = [];

  if (equipmentIds.length > 0) {
    const [rows] = await pool.query(
      `
        SELECT
          l.id,
          l.equipment_id,
          l.actor_user_id,
          l.event_type,
          l.event_label,
          l.event_note,
          l.from_status,
          l.to_status,
          l.related_record_type,
          l.related_record_id,
          l.created_at,
          e.asset_tag,
          e.equipment_name,
          CONCAT(actor.first_name, ' ', actor.last_name) AS actor_name
        FROM asset_lifecycle_events l
        INNER JOIN equipment e ON e.id = l.equipment_id
        LEFT JOIN users actor ON actor.id = l.actor_user_id
        WHERE l.equipment_id IN (?)
        ORDER BY l.created_at DESC
        LIMIT 120
      `,
      [equipmentIds],
    );

    lifecycleEvents = rows;
  }

  const [notifications] = await pool.query(
    `
      SELECT id, title, message, status, created_at
      FROM notifications
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 12
    `,
    [userId],
  );

  const [roleCounts] = await pool.query(
    `
      SELECT r.name AS role_name, COUNT(*) AS total
      FROM users u
      INNER JOIN roles r ON r.id = u.role_id
      GROUP BY r.name
      ORDER BY r.name ASC
    `,
  );

  const smartAlerts = await createSmartAlerts(currentUser, scopedEquipment, requestData, assignments, returns, issues, maintenanceRecords);
  const replacementInsights = scopedEquipment
    .map((item) => buildReplacementPrediction(item, maintenanceRecords, issues, returns))
    .sort((left, right) => right.score - left.score)
    .slice(0, 12);

  return {
    currentUser: toSessionUser(currentUser),
    categories,
    equipment: scopedEquipment,
    requests: requestData,
    employees: ["HR Recruitment officer", "Hr department"].includes(currentUser.role_name) ? hrmsEmployees : employees,
    assignments,
    returns,
    issues,
    maintenanceRecords,
    lifecycleEvents,
    smartAlerts,
    replacementInsights,
    notifications,
    reports: {
      requestStatus: ["pending", "approved", "rejected", "fulfilled"].map((status) => ({
        label: status,
        total: requestData.filter((item) =>
          status === "pending" ? isLivePendingRequest(item) : item.request_status === status,
        ).length,
      })),
      equipmentStatus: ["available", "assigned", "maintenance", "retired", "lost"].map((status) => ({
        label: status,
        total: scopedEquipment.filter((item) => item.status === status).length,
      })),
      assignmentStatus: ["active", "returned", "overdue"].map((status) => ({
        label: status,
        total: assignments.filter((item) => item.status === status).length,
      })),
      roleCounts,
    },
  };
}

async function getEquipmentDetails(equipmentId) {
  const [rows] = await pool.query(
    `
      SELECT
        e.id,
        e.asset_tag,
        e.serial_number,
        e.computer_name,
        e.equipment_name,
        e.status,
        e.stock_location,
        e.category_id,
        e.branch_id,
        e.country_id,
        e.vendor_name,
        e.model_name,
        e.purchase_date,
        e.purchase_year,
        e.purchase_cost,
        e.location_details,
        e.device_health,
        e.warranty_end_date,
        e.lifespan_years,
        e.equipment_specs,
        c.name AS category_name,
        b.name AS branch_name,
        co.name AS country_name
      FROM equipment e
      LEFT JOIN categories c ON c.id = e.category_id
      LEFT JOIN branches b ON b.id = e.branch_id
      LEFT JOIN country co ON co.id = e.country_id
      WHERE e.id = ?
      LIMIT 1
    `,
    [equipmentId],
  );

  return rows[0] ?? null;
}

async function getMoveOrdersForUser(userId) {
  const actor = await getUserContext(userId);

  if (!actor) {
    throw new Error("User not found.");
  }

  const isWarehouse = isWarehouseRole(actor.role_name);
  const [requestRows] = await pool.query(
    `
      SELECT
        r.id,
        r.request_number,
        r.requested_by_user_id,
        r.warehouse_user_id,
        r.destination_branch_id,
        r.status,
        r.receipt_status,
        r.reason,
        r.note,
        r.reviewed_note,
        r.reviewed_at,
        r.received_confirmed_at,
        r.fulfilled_at,
        r.created_at,
        CONCAT(requester.first_name, ' ', requester.last_name) AS requester_name,
        requester.email AS requester_email,
        CONCAT(warehouse_user.first_name, ' ', warehouse_user.last_name) AS warehouse_name,
        warehouse_user.email AS warehouse_email,
        destination_branch.name AS destination_branch_name
      FROM move_order_requests r
      INNER JOIN users requester ON requester.id = r.requested_by_user_id
      LEFT JOIN users warehouse_user ON warehouse_user.id = r.warehouse_user_id
      LEFT JOIN branches destination_branch ON destination_branch.id = r.destination_branch_id
      WHERE ${isWarehouse ? "1=1" : "r.requested_by_user_id = ?"}
      ORDER BY r.created_at DESC
    `,
    isWarehouse ? [] : [userId],
  );

  const requestIds = requestRows.map((row) => row.id);
  let itemRows = [];

  if (requestIds.length > 0) {
    const [rows] = await pool.query(
      `
        SELECT
          i.id,
          i.move_order_request_id,
          i.equipment_id,
          i.requested_category_id,
          i.requested_quantity,
          i.item_note,
          e.asset_tag,
          e.equipment_name,
          e.serial_number,
          e.status AS equipment_status,
          e.stock_location,
          e.branch_id,
          b.name AS branch_name,
          c.name AS category_name,
          requested_category.name AS requested_category_name
        FROM move_order_request_items i
        LEFT JOIN equipment e ON e.id = i.equipment_id
        LEFT JOIN categories c ON c.id = e.category_id
        LEFT JOIN categories requested_category ON requested_category.id = i.requested_category_id
        LEFT JOIN branches b ON b.id = e.branch_id
        WHERE i.move_order_request_id IN (?)
        ORDER BY i.id ASC
      `,
      [requestIds],
    );
    itemRows = rows;
  }

  const itemsByRequest = new Map();
  for (const item of itemRows) {
    const existing = itemsByRequest.get(item.move_order_request_id) ?? [];
    existing.push(item);
    itemsByRequest.set(item.move_order_request_id, existing);
  }

  return requestRows.map((row) => ({
    ...row,
    items: itemsByRequest.get(row.id) ?? [],
  }));
}

async function ensureOperationalDemoData() {
  await ensureRequestWorkflowTable();
  await ensureRequestClarificationColumns();
  await ensureUserPasswordOnboardingColumns();
  await ensureUserPhoneColumn();
  await ensureUserProfileImageColumn();
  await ensureUserFederatedAuthColumns();
  await ensureUserEmploymentColumns();
  await ensureRequestFulfillmentColumns();
  await ensureAssignmentReceiptColumns();
  await ensureEquipmentLifespanColumn();
  await ensureEquipmentSpecsColumn();
  await ensureEquipmentStatusColumn();
  await ensureEquipmentProfileColumns();
  await ensureDeviceConfigurationTable();
  await ensureDeviceBundleTable();
  await ensureDeviceBookingsTable();
  await ensureSecurityReviewTable();
  await ensureLossTheftReportsTable();
  await ensureAuthProvidersTable();
  await ensureAssetLifecycleEventsTable();
  await ensureMaintenanceRecordsTable();
  await ensureDeviceMonitoringTables();
  await ensureUserIdentifierSecurityColumns();
  await ensureReplacementMlModelsTable();
  await ensureIotFailureModel();
  await ensureMoveOrderTables();
  await seedExistingAssetLifecycleEvents();
  await ensureSystemLogsTable();
  await ensureSystemSettingsTable();
  await ensureBackupSnapshotsTable();
  await ensureReturnsTable();
  await ensurePasswordResetTokensTable();
  await backfillLegacyReplacementRecords();

  for (const category of demoCategories) {
    await pool.query(
      `
        INSERT INTO categories (name, depreciation_rate)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE depreciation_rate = VALUES(depreciation_rate)
      `,
      [category.name, category.depreciationRate],
    );
  }

  const [[rwandaCountry]] = await pool.query(
    "SELECT id FROM country WHERE name = 'Rwanda' LIMIT 1",
  );
  const [[kigaliBranch]] = await pool.query(
    "SELECT id FROM branches WHERE name = 'Kigali HQ' ORDER BY id ASC LIMIT 1",
  );
  const [[musanzeBranch]] = await pool.query(
    "SELECT id FROM branches WHERE name = 'Musanze Branch' ORDER BY id ASC LIMIT 1",
  );

  if (!rwandaCountry || !kigaliBranch) {
    return;
  }

  for (const [roleName, roleDescription] of requiredRoles) {
    await pool.query(
      `
        INSERT INTO roles (name, description)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE description = VALUES(description)
      `,
      [roleName, roleDescription],
    );
  }

  for (const departmentName of demoDepartmentNames) {
    const [rows] = await pool.query(
      "SELECT id FROM department WHERE name = ? AND branch_id = ? LIMIT 1",
      [departmentName, kigaliBranch.id],
    );

    if (rows.length === 0) {
      await pool.query(
        "INSERT INTO department (country_id, branch_id, name) VALUES (?, ?, ?)",
        [rwandaCountry.id, kigaliBranch.id, departmentName],
      );
    }
  }

  const [departmentRows] = await pool.query(
    "SELECT id, name FROM department WHERE branch_id = ?",
    [kigaliBranch.id],
  );

  const departmentMap = new Map(departmentRows.map((department) => [department.name, department.id]));

  for (const orgUnitName of demoOrgUnitNames) {
    await pool.query(
      "INSERT IGNORE INTO org_units (name) VALUES (?)",
      [orgUnitName]
    );
  }

  const [orgUnitRows] = await pool.query("SELECT id, name FROM org_units");
  const orgUnitMap = new Map(orgUnitRows.map((unit) => [unit.name, unit.id]));

  const [roleRows] = await pool.query(
    "SELECT id, name FROM roles",
  );
  const roleMap = new Map(roleRows.map((role) => [role.name, role.id]));

  // Remove the legacy warehouse officer demo account so only the warehouse manager remains.
  const [legacyUsers] = await pool.query("SELECT id FROM users WHERE email = ? LIMIT 1", ["warehouse@airtel.com"]);
  if (legacyUsers.length > 0) {
    const legacyUserId = legacyUsers[0].id;
    await pool.query("UPDATE system_logs SET actor_user_id = NULL WHERE actor_user_id = ?", [legacyUserId]);
    await pool.query("UPDATE system_logs SET target_user_id = NULL WHERE target_user_id = ?", [legacyUserId]);
    await pool.query("DELETE FROM users WHERE id = ?", [legacyUserId]);
  }
  await pool.query(
    `
      DELETE FROM roles
      WHERE name = 'Warehouse officer'
        AND NOT EXISTS (
          SELECT 1
          FROM users
          WHERE users.role_id = roles.id
        )
    `,
  );

  for (const user of demoUsers) {
    const roleId = roleMap.get(user.roleName) ?? null;
    const [existingUsers] = await pool.query(
      "SELECT id, phone_number FROM users WHERE email = ? LIMIT 1",
      [user.email],
    );

    if (existingUsers.length > 0) {
      await pool.query(
        `
          UPDATE users
          SET
            first_name = ?,
            last_name = ?,
            employee_code = ?,
            password_hash = ?,
            role_id = ?,
            department_id = ?,
            branch_id = ?,
            country_id = ?,
            unit_id = ?,
            status = 'active'
          WHERE id = ?
        `,
        [
          user.firstName,
          user.lastName,
          user.employeeCode,
          hashPassword(user.password),
          roleId,
          departmentMap.get(user.departmentName) ?? null,
          kigaliBranch.id,
          rwandaCountry.id,
          orgUnitMap.get(user.orgUnitName) ?? null,
          existingUsers[0].id,
        ],
      );

      if (!existingUsers[0].phone_number) {
        const [phoneOwnerRows] = await pool.query(
          "SELECT id FROM users WHERE phone_number = ? AND id <> ? LIMIT 1",
          [user.phoneNumber, existingUsers[0].id],
        );

        if (phoneOwnerRows.length === 0) {
          await pool.query(
            "UPDATE users SET phone_number = ? WHERE id = ?",
            [user.phoneNumber, existingUsers[0].id],
          );
        }
      }
      continue;
    }

    const [phoneOwnerRows] = await pool.query(
      "SELECT id FROM users WHERE phone_number = ? LIMIT 1",
      [user.phoneNumber],
    );
    const seedPhoneNumber = phoneOwnerRows.length > 0 ? null : user.phoneNumber;

    await pool.query(
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
          location_id,
          country_id,
          unit_id,
          status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 'active')
      `,
      [
        user.firstName,
        user.lastName,
        user.email,
        seedPhoneNumber,
        user.employeeCode,
        hashPassword(user.password),
        roleId,
        departmentMap.get(user.departmentName) ?? null,
        kigaliBranch.id,
        rwandaCountry.id,
        orgUnitMap.get(user.orgUnitName) ?? null,
      ],
    );
  }

  const [[branchManager]] = await pool.query(
    "SELECT id FROM users WHERE email = 'branch.manager@airtel.com' LIMIT 1",
  );

  if (branchManager) {
    await pool.query(
      "UPDATE branches SET manager_user_id = ? WHERE id = ?",
      [branchManager.id, kigaliBranch.id],
    );
  }

  const [categoryRows] = await pool.query(
    "SELECT id, name FROM categories",
  );
  const categoryMap = new Map(categoryRows.map((category) => [category.name, category.id]));

  const branchMap = new Map([
    ["Kigali HQ", kigaliBranch.id],
    ["Musanze Branch", musanzeBranch?.id ?? kigaliBranch.id],
  ]);

  for (const item of demoEquipment) {
    const [existingEquipment] = await pool.query(
      "SELECT id FROM equipment WHERE asset_tag = ? LIMIT 1",
      [item.assetTag],
    );

    if (existingEquipment.length > 0) {
      continue;
    }

    await pool.query(
      `
        INSERT INTO equipment (
          asset_tag,
          serial_number,
          equipment_name,
          category_id,
          unit_id,
          vendor_id,
          country_id,
          branch_id,
          location_id,
          status,
          stock_location,
          purchase_date,
          purchase_cost,
          warranty_end_date,
          lifespan_years
        )
        VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, NULL, ?, ?, CURDATE(), ?, DATE_ADD(CURDATE(), INTERVAL 365 DAY), 3)
      `,
      [
        item.assetTag,
        item.serialNumber,
        item.equipmentName,
        categoryMap.get(item.categoryName),
        rwandaCountry.id,
        branchMap.get(item.branchName) ?? kigaliBranch.id,
        item.status,
        item.stockLocation || "it_stock",
        item.purchaseCost,
      ],
    );
  }

  const [[employeeUser]] = await pool.query(
    "SELECT id FROM users WHERE email = 'employee@airtel.com' LIMIT 1",
  );
  const [[firstEquipment]] = await pool.query(
    "SELECT id FROM equipment ORDER BY id ASC LIMIT 1",
  );
  const [[existingIssue]] = await pool.query(
    "SELECT id FROM issues LIMIT 1",
  );

  if (!existingIssue && employeeUser && firstEquipment) {
    await pool.query(
      `
        INSERT INTO issues (
          equipment_id,
          reported_by,
          issue_title,
          issue_description,
          priority,
          issue_status
        )
        VALUES (?, ?, ?, ?, 'medium', 'open')
      `,
      [
        firstEquipment.id,
        employeeUser.id,
        "Battery performance check",
        "Battery health dropped and needs IT review for replacement planning.",
      ],
    );
  }
}

async function ensureDefaultAdmin() {
  const [existingAdmins] = await pool.query(
    "SELECT id FROM users WHERE email = ? LIMIT 1",
    [defaultAdminEmail],
  );

  if (existingAdmins.length > 0) {
    return;
  }

  const [roles] = await pool.query(
    "SELECT id FROM roles WHERE name = 'admin' LIMIT 1",
  );

  if (roles.length === 0) {
    throw new Error("admin role is missing from the database.");
  }

  await pool.query(
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
        location_id,
        country_id,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, 'active')
    `,
    [
      "System",
      "Admin",
      defaultAdminEmail,
      null,
      "ADM-001",
      hashPassword(defaultAdminPassword),
      roles[0].id,
    ],
  );
}

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", database: "connected" });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Database connection failed",
      details: error.message,
    });
  }
});

app.post("/api/device-agent/register", async (req, res) => {
  if (!isAuthorizedDeviceAgentRequest(req)) {
    return res.status(401).json({ message: "Unauthorized device agent request." });
  }

  const assetTag = String(req.body?.assetTag || "").trim();
  const deviceUuid = String(req.body?.deviceUuid || "").trim();
  const hostname = String(req.body?.hostname || "").trim();
  const operatingSystem = String(req.body?.operatingSystem || "").trim();
  const agentVersion = String(req.body?.agentVersion || "").trim();

  if (!assetTag || !deviceUuid || !hostname) {
    return res.status(400).json({ message: "assetTag, deviceUuid, and hostname are required." });
  }

  try {
    const equipment = await getEquipmentByAssetTag(assetTag);
    if (!equipment) {
      return res.status(404).json({ message: "No equipment record exists for the supplied asset tag." });
    }

    const agent = await upsertDeviceAgentRecord({
      equipmentId: Number(equipment.id),
      deviceUuid,
      hostname,
      operatingSystem,
      agentVersion,
      ipAddress: getClientIpAddress(req),
    });

    if (!equipment.computer_name || equipment.computer_name !== hostname) {
      await pool.query("UPDATE equipment SET computer_name = ? WHERE id = ?", [hostname, Number(equipment.id)]);
    }

    return res.status(201).json({
      message: "Device agent registered successfully.",
      agent: {
        id: agent?.id || null,
        equipmentId: Number(equipment.id),
        assetTag: equipment.asset_tag,
        hostname,
        operatingSystem: operatingSystem || null,
        agentVersion: agentVersion || null,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.post("/api/device-agent/metrics", async (req, res) => {
  if (!isAuthorizedDeviceAgentRequest(req)) {
    return res.status(401).json({ message: "Unauthorized device agent request." });
  }

  const assetTag = String(req.body?.assetTag || "").trim();
  const deviceUuid = String(req.body?.deviceUuid || "").trim();
  const hostname = String(req.body?.hostname || "").trim();
  const operatingSystem = String(req.body?.operatingSystem || "").trim();
  const agentVersion = String(req.body?.agentVersion || "").trim();
  const metricsPayload = req.body?.metrics ?? {};

  if (!assetTag || !deviceUuid || !hostname) {
    return res.status(400).json({ message: "assetTag, deviceUuid, and hostname are required." });
  }

  try {
    const equipment = await getEquipmentByAssetTag(assetTag);
    if (!equipment) {
      return res.status(404).json({ message: "No equipment record exists for the supplied asset tag." });
    }

    const agent = await upsertDeviceAgentRecord({
      equipmentId: Number(equipment.id),
      deviceUuid,
      hostname,
      operatingSystem,
      agentVersion,
      ipAddress: getClientIpAddress(req),
    });

    const normalizedMetrics = {
      cpuUsage: toMetricScore(metricsPayload.cpuUsage),
      ramUsage: toMetricScore(metricsPayload.ramUsage),
      diskUsage: toMetricScore(metricsPayload.diskUsage),
      diskHealth: coerceFiniteNumber(metricsPayload.diskHealth, null),
      batteryHealth: coerceFiniteNumber(metricsPayload.batteryHealth, null),
      batteryLevel: coerceFiniteNumber(metricsPayload.batteryLevel, null),
      networkLatency: coerceFiniteNumber(metricsPayload.networkLatency, null),
      packetLoss: coerceFiniteNumber(metricsPayload.packetLoss, null),
      temperature: coerceFiniteNumber(metricsPayload.temperature, null),
      uptimeSeconds: Math.max(Number(metricsPayload.uptimeSeconds || 0), 0),
      workloadIntensity: coerceFiniteNumber(metricsPayload.workloadIntensity, null),
      errorCount: Math.max(Number(metricsPayload.errorCount || 0), 0),
    };

    const [metricInsert] = await pool.query(
      `
        INSERT INTO device_metrics (
          equipment_id,
          agent_id,
          cpu_usage,
          ram_usage,
          disk_usage,
          disk_health,
          battery_health,
          battery_level,
          network_latency,
          packet_loss,
          temperature,
          uptime_seconds,
          workload_intensity,
          error_count,
          metrics_payload
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        Number(equipment.id),
        agent?.id || null,
        normalizedMetrics.cpuUsage,
        normalizedMetrics.ramUsage,
        normalizedMetrics.diskUsage,
        normalizedMetrics.diskHealth,
        normalizedMetrics.batteryHealth,
        normalizedMetrics.batteryLevel,
        normalizedMetrics.networkLatency,
        normalizedMetrics.packetLoss,
        normalizedMetrics.temperature,
        normalizedMetrics.uptimeSeconds,
        normalizedMetrics.workloadIntensity,
        normalizedMetrics.errorCount,
        JSON.stringify(metricsPayload),
      ],
    );

    const metricId = Number(metricInsert.insertId);
    const derivedHealth = deriveDeviceHealthLabel(normalizedMetrics);
    await pool.query(
      `
        UPDATE equipment
        SET computer_name = ?, device_health = ?
        WHERE id = ?
      `,
      [hostname, derivedHealth, Number(equipment.id)],
    );

    const generatedAlerts = buildDeviceMonitoringAlerts(normalizedMetrics);
    for (const alert of generatedAlerts) {
      await pool.query(
        `
          INSERT INTO alerts (
            equipment_id,
            metric_id,
            alert_type,
            severity,
            status,
            message
          ) VALUES (?, ?, ?, ?, 'open', ?)
        `,
        [Number(equipment.id), metricId, alert.alertType, alert.severity, alert.message],
      );
    }

    const recommendation = await generateDeviceRecommendation({
      equipment,
      metricId,
      metrics: normalizedMetrics,
    });

    return res.status(201).json({
      message: "Device metrics ingested successfully.",
      equipmentId: Number(equipment.id),
      metricId,
      alertsCreated: generatedAlerts.length,
      deviceHealth: derivedHealth,
      recommendation,
    });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.get("/api/device-agent/recommendation", async (req, res) => {
  if (!isAuthorizedDeviceAgentRequest(req)) {
    return res.status(401).json({ message: "Unauthorized device agent request." });
  }

  const assetTag = String(req.query.assetTag || "").trim();
  if (!assetTag) {
    return res.status(400).json({ message: "assetTag is required." });
  }

  try {
    const equipment = await getEquipmentByAssetTag(assetTag);
    if (!equipment) {
      return res.status(404).json({ message: "No equipment record exists for the supplied asset tag." });
    }

    const [rows] = await pool.query(
      `
        SELECT recommendation, confidence_score, probability, model_version, reasons_json, generated_at
        FROM ml_recommendations
        WHERE equipment_id = ?
        ORDER BY id DESC
        LIMIT 1
      `,
      [Number(equipment.id)],
    );

    if (!rows.length) {
      return res.json({
        equipmentId: Number(equipment.id),
        assetTag: equipment.asset_tag,
        recommendation: "No recommendation generated yet",
        confidenceScore: null,
        probability: null,
        modelVersion: iotFailureModel?.version || "untrained",
        reasons: [],
        generatedAt: null,
      });
    }

    const latest = rows[0];
    return res.json({
      equipmentId: Number(equipment.id),
      assetTag: equipment.asset_tag,
      recommendation: latest.recommendation,
      confidenceScore: latest.confidence_score === null ? null : Number(latest.confidence_score),
      probability: latest.probability === null ? null : Number(latest.probability),
      modelVersion: latest.model_version || iotFailureModel?.version || "untrained",
      reasons: latest.reasons_json ? JSON.parse(latest.reasons_json) : [],
      generatedAt: latest.generated_at,
    });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.get("/api/device-monitoring/overview", async (req, res) => {
  const userId = Number(req.query.userId);

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ message: "A valid user id is required." });
  }

  try {
    const actor = await getUserContext(userId);
    if (!canAccessDeviceMonitoring(actor)) {
      return res.status(403).json({ message: "You do not have access to device monitoring." });
    }

    const branchScope = actor.role_name === "admin" || actor.role_name === "IT Director" ? null : Number(actor.branch_id || 0) || null;
    const [rows] = await pool.query(
      `
        SELECT
          e.id AS equipment_id,
          e.asset_tag,
          e.equipment_name,
          e.computer_name,
          e.status,
          e.device_health,
          e.branch_id,
          b.name AS branch_name,
          da.hostname AS agent_hostname,
          da.operating_system,
          da.agent_version,
          da.last_seen_at,
          dm.id AS metric_id,
          dm.cpu_usage,
          dm.ram_usage,
          dm.disk_usage,
          dm.battery_health,
          dm.battery_level,
          dm.network_latency,
          dm.packet_loss,
          dm.temperature,
          dm.uptime_seconds,
          dm.recorded_at,
          mr.recommendation,
          mr.confidence_score,
          mr.model_version,
          mr.generated_at
        FROM equipment e
        LEFT JOIN branches b ON b.id = e.branch_id
        LEFT JOIN device_agents da ON da.equipment_id = e.id
        LEFT JOIN device_metrics dm ON dm.id = (
          SELECT dm2.id
          FROM device_metrics dm2
          WHERE dm2.equipment_id = e.id
          ORDER BY dm2.recorded_at DESC, dm2.id DESC
          LIMIT 1
        )
        LEFT JOIN ml_recommendations mr ON mr.id = (
          SELECT mr2.id
          FROM ml_recommendations mr2
          WHERE mr2.equipment_id = e.id
          ORDER BY mr2.generated_at DESC, mr2.id DESC
          LIMIT 1
        )
        WHERE (? IS NULL OR e.branch_id = ?)
        ORDER BY COALESCE(dm.recorded_at, da.last_seen_at, e.updated_at, e.created_at) DESC, e.id DESC
        LIMIT 30
      `,
      [branchScope, branchScope],
    );

    const [openAlertRows] = await pool.query(
      `
        SELECT COUNT(*) AS total
        FROM alerts a
        INNER JOIN equipment e ON e.id = a.equipment_id
        WHERE a.status = 'open'
          AND (? IS NULL OR e.branch_id = ?)
      `,
      [branchScope, branchScope],
    );

    const [activeAgentRows] = await pool.query(
      `
        SELECT COUNT(DISTINCT da.id) AS total
        FROM device_agents da
        INNER JOIN equipment e ON e.id = da.equipment_id
        WHERE da.is_active = 1
          AND (? IS NULL OR e.branch_id = ?)
      `,
      [branchScope, branchScope],
    );

    return res.json({
      generatedAt: new Date().toISOString(),
      summary: {
        trackedAssets: rows.length,
        activeAgents: Number(activeAgentRows[0]?.total || 0),
        onlineRecently: rows.filter((row) => row.last_seen_at && Date.now() - new Date(row.last_seen_at).getTime() <= 15 * 60 * 1000).length,
        openAlerts: Number(openAlertRows[0]?.total || 0),
      },
      records: rows.map((row) => ({
        equipmentId: Number(row.equipment_id),
        assetTag: row.asset_tag,
        equipmentName: row.equipment_name,
        computerName: row.computer_name,
        branchName: row.branch_name,
        status: row.status,
        deviceHealth: row.device_health,
        agent: row.agent_hostname
          ? {
              hostname: row.agent_hostname,
              operatingSystem: row.operating_system,
              version: row.agent_version,
              lastSeenAt: row.last_seen_at,
            }
          : null,
        latestMetric: row.metric_id
          ? {
              id: Number(row.metric_id),
              cpuUsage: Number(row.cpu_usage || 0),
              ramUsage: Number(row.ram_usage || 0),
              diskUsage: Number(row.disk_usage || 0),
              batteryHealth: row.battery_health === null ? null : Number(row.battery_health),
              batteryLevel: row.battery_level === null ? null : Number(row.battery_level),
              networkLatency: row.network_latency === null ? null : Number(row.network_latency),
              packetLoss: row.packet_loss === null ? null : Number(row.packet_loss),
              temperature: row.temperature === null ? null : Number(row.temperature),
              uptimeSeconds: Number(row.uptime_seconds || 0),
              recordedAt: row.recorded_at,
            }
          : null,
        recommendation: row.recommendation
          ? {
              label: row.recommendation,
              confidenceScore: row.confidence_score === null ? null : Number(row.confidence_score),
              modelVersion: row.model_version,
              generatedAt: row.generated_at,
            }
          : null,
      })),
    });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.post("/api/device-monitoring/sample-device", async (req, res) => {
  const actorUserId = Number(req.body?.actorUserId);
  const requestedHostName = String(req.body?.computerName || "").trim();

  if (!Number.isInteger(actorUserId) || actorUserId <= 0) {
    return res.status(400).json({ message: "A valid actor user id is required." });
  }

  try {
    const actor = await getUserContext(actorUserId);
    if (!canAccessDeviceMonitoring(actor)) {
      return res.status(403).json({ message: "You do not have access to create a sample monitored device." });
    }

    const branchId = Number(actor.branch_id || 0);
    const countryId = Number(actor.country_id || 0);
    if (!branchId || !countryId) {
      return res.status(400).json({ message: "Your user profile must be assigned to a branch and country first." });
    }

    const [categoryRows] = await pool.query(
      `
        SELECT id
        FROM categories
        WHERE LOWER(name) IN ('laptop', 'desktop', 'computer')
        ORDER BY FIELD(LOWER(name), 'laptop', 'desktop', 'computer')
        LIMIT 1
      `,
    );

    if (!categoryRows.length) {
      return res.status(400).json({ message: "No laptop or desktop category exists yet in IMS." });
    }

    const suffix = Date.now().toString().slice(-6);
    const assetTag = `MON-${suffix}`;
    const serialNumber = `MON-SN-${suffix}`;
    const computerName = requestedHostName || `Sample-${suffix}`;

    const [insertResult] = await pool.query(
      `
        INSERT INTO equipment (
          asset_tag,
          serial_number,
          computer_name,
          equipment_name,
          category_id,
          country_id,
          branch_id,
          vendor_name,
          model_name,
          status,
          purchase_year,
          purchase_cost,
          device_health,
          asset_type,
          base_configuration_name,
          base_configuration_grade
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'available', ?, ?, ?, ?, ?, ?)
      `,
      [
        assetTag,
        serialNumber,
        computerName,
        "Monitoring Test Laptop",
        Number(categoryRows[0].id),
        countryId,
        branchId,
        "Airtel Lab",
        "Telemetry Sample Build",
        new Date().getFullYear(),
        1250000,
        "healthy",
        "laptop",
        "Monitoring Sandbox",
        "Test",
      ],
    );

    return res.status(201).json({
      message: "Sample monitored device created.",
      equipment: {
        id: Number(insertResult.insertId),
        assetTag,
        computerName,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.get("/api/device-monitoring/config", async (req, res) => {
  const userId = Number(req.query.userId);
  const assetTag = String(req.query.assetTag || "").trim();

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ message: "A valid user id is required." });
  }

  if (!assetTag) {
    return res.status(400).json({ message: "assetTag is required." });
  }

  try {
    const actor = await getUserContext(userId);
    if (!canAccessDeviceMonitoring(actor)) {
      return res.status(403).json({ message: "You do not have access to device monitoring." });
    }

    const apiBase = process.env.APP_BASE_URL || getFrontendBaseUrl() || "http://localhost:5173";
    const apiUrl = String(apiBase).replace(/\/$/, "").replace(/:\d+$/, ":4000");
    const configJson = JSON.stringify(
      {
        apiUrl,
        apiKey: deviceAgentApiKey,
        assetTag,
        interval: 300,
      },
      null,
      2,
    );

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="agent-config-${assetTag}.json"`);
    return res.send(configJson);
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.get("/api/device-monitoring/download", async (req, res) => {
  const userId = Number(req.query.userId);
  const file = String(req.query.file || "").trim();

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ message: "A valid user id is required." });
  }

  try {
    const actor = await getUserContext(userId);
    if (!canAccessDeviceMonitoring(actor)) {
      return res.status(403).json({ message: "You do not have access to device monitoring." });
    }

    const allowedFiles = new Map([
      ["AirtelIMSDeviceAgent.exe", path.join(__dirname, "..", "device-agent", "dist", "AirtelIMSDeviceAgent.exe")],
      ["agent.py", path.join(__dirname, "..", "device-agent", "agent.py")],
      ["requirements.txt", path.join(__dirname, "..", "device-agent", "requirements.txt")],
      ["install-agent.ps1", path.join(__dirname, "..", "device-agent", "install-agent.ps1")],
      ["README.md", path.join(__dirname, "..", "device-agent", "README.md")],
    ]);

    const filePath = allowedFiles.get(file);
    if (!filePath) {
      return res.status(404).json({ message: "Requested file is not available." });
    }

    return res.download(filePath, file);
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.get("/api/dashboard", async (_req, res) => {
  const response = {
    users: ["admin", "HR DIRECTOR", "IT Director", "IT Support engineer", "IT security manager", "HR Recruitment officer", "Hr department", "IT officer", "IT infrastructure manager", "employee"],
    tables: [
      "users",
      "equipment",
      "country",
      "location",
      "equipment_logs",
      "roles",
      "permission",
      "branches",
      "department",
      "categories",
      "stock",
      "notifications",
      "assignments",
      "issues",
      "requests",
      "units",
      "depreciations",
      "maintenance",
      "returns",
      "transfer",
      "stockout",
      "stockin",
      "vendors",
    ],
  };

  res.json(response);
});

app.get("/api/auth/providers", async (_req, res) => {
  return res.json({
    local: {
      isEnabled: true,
      label: "Email or Phone",
    },
    microsoft: {
      isEnabled: isMicrosoftSsoConfigured(),
      label: "Microsoft",
    },
  });
});

app.get("/api/auth/microsoft/start", async (_req, res) => {
  if (!isMicrosoftSsoConfigured()) {
    return res.status(400).json({ message: "Microsoft SSO is not configured yet." });
  }

  const state = createMicrosoftAuthState();
  return res.json({ authUrl: buildMicrosoftAuthUrl(state) });
});

app.post("/api/auth/microsoft/complete", async (req, res) => {
  const { code, state } = req.body ?? {};

  if (!isMicrosoftSsoConfigured()) {
    return res.status(400).json({ message: "Microsoft SSO is not configured yet." });
  }

  if (!code || !state) {
    return res.status(400).json({ message: "Microsoft authorization code and state are required." });
  }

  if (!consumeMicrosoftAuthState(String(state))) {
    return res.status(400).json({ message: "Microsoft sign-in session is invalid or has expired." });
  }

  try {
    const tokenData = await exchangeMicrosoftAuthCode(code);
    const tokenClaims = decodeJwtPayload(tokenData.id_token);
    const microsoftProfile = await getMicrosoftGraphProfile(tokenData.access_token);
    const user = await getOrCreateMicrosoftUser(microsoftProfile, tokenClaims);

    if (!user) {
      return res.status(404).json({ message: "Unable to find the Microsoft user in Airtel IMS." });
    }

    if (user.status === "pending") {
      return res.status(403).json({ message: "Your account is pending approval by the administrator." });
    }

    if (user.status !== "active") {
      return res.status(403).json({ message: "This user account is inactive." });
    }

    await writeAuditLog({
      actorUserId: user.id,
      targetUserId: user.id,
      actionKey: "auth.sign_in_microsoft",
      actionLabel: "User signed in with Microsoft SSO",
      details: `${user.email} signed in through Microsoft SSO.`,
    });

    return res.json({
      user: toSessionUser(user),
      otpTrustToken: createOtpTrustToken(user.id),
      message: "Signed in with Microsoft.",
    });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { identifier, email, password, otpTrustToken } = req.body ?? {};
  const loginIdentifier = String(identifier || email || "").trim();

  if (!loginIdentifier || !password) {
    return res.status(400).json({ message: "Email or phone number and password are required." });
  }

  const normalizedPhoneNumber = normalizeAirtelPhoneNumber(loginIdentifier, "Rwanda");

  if (!isEmailIdentifier(loginIdentifier) && !normalizedPhoneNumber) {
    return res.status(400).json({
      message: "Use a valid email address or phone number.",
    });
  }

  try {
    const user = await getLoginUserByIdentifier(loginIdentifier, normalizedPhoneNumber);

    if (!user) {
      return res.status(401).json({ message: "Invalid email or password." });
    }
    const incomingHash = hashPassword(password);

    if (user.password_hash !== incomingHash) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    if (user.status === "pending") {
      return res.status(403).json({ message: "Your account is pending approval by the administrator." });
    }

    if (user.status !== "active") {
      return res.status(403).json({ message: "This user account is inactive." });
    }

    if (!isEmailOtpEnabled) {
      try {
        await sendSignInAlertEmail({
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          roleName: user.role_name,
        });
      } catch (mailError) {
        console.error("Sign-in alert email failed:", mailError?.message || mailError);
      }

      await writeAuditLog({
        actorUserId: user.id,
        targetUserId: user.id,
        actionKey: "auth.sign_in_no_otp",
        actionLabel: "User signed in while email OTP was disabled",
        details: `${user.email} signed in successfully without email OTP because EMAIL_OTP_ENABLED is false.`,
      });

      return res.json({
        user: toSessionUser(user),
        message: "Signed in successfully.",
      });
    }

    if (verifyOtpTrustToken(otpTrustToken, user.id)) {
      try {
        await sendSignInAlertEmail({
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          roleName: user.role_name,
        });
      } catch (mailError) {
        console.error("Sign-in alert email failed:", mailError?.message || mailError);
      }

      await writeAuditLog({
        actorUserId: user.id,
        targetUserId: user.id,
        actionKey: "auth.sign_in_trusted",
        actionLabel: "User signed in with recent OTP verification",
        details: `${user.email} signed in without OTP because email verification was still trusted.`,
      });

      return res.json({
        user: toSessionUser(user),
        otpTrustToken: createOtpTrustToken(user.id),
        message: "Signed in using recent email verification.",
      });
    }

    const challenge = await createAndSendAuthChallenge(user);

    return res.json({
      requiresOtp: true,
      challengeId: challenge.challengeId,
      emailHint: challenge.emailHint,
      expiresInSeconds: challenge.expiresInSeconds,
      message: "A verification code was sent to the user's email address.",
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.post("/api/auth/verify-otp", async (req, res) => {
  if (!isEmailOtpEnabled) {
    return res.status(400).json({ message: "Email OTP verification is currently disabled." });
  }

  const { challengeId, emailOtp } = req.body ?? {};
  const challenge = authChallenges.get(String(challengeId || ""));

  if (!challengeId || !emailOtp) {
    return res.status(400).json({ message: "Challenge and email OTP are required." });
  }

  if (!challenge) {
    return res.status(400).json({ message: "This verification session is invalid or has expired." });
  }

  if (Date.now() > challenge.expiresAt) {
    authChallenges.delete(challengeId);
    return res.status(400).json({ message: "This verification code has expired. Please sign in again." });
  }

  if (String(emailOtp).trim() !== challenge.emailOtp) {
    return res.status(400).json({ message: "Invalid verification code. Please try again." });
  }

  authChallenges.delete(challengeId);

  try {
    await sendSignInAlertEmail({
      email: challenge.user.email,
      firstName: challenge.user.first_name,
      lastName: challenge.user.last_name,
      roleName: challenge.user.role_name,
    });
  } catch (mailError) {
    console.error("Sign-in alert email failed:", mailError?.message || mailError);
  }

  await writeAuditLog({
    actorUserId: challenge.user.id,
    targetUserId: challenge.user.id,
    actionKey: "auth.sign_in",
    actionLabel: "User signed in",
    details: `${challenge.user.email} signed in successfully.`,
  });

  return res.json({
    user: toSessionUser(challenge.user),
    otpTrustToken: createOtpTrustToken(challenge.user.id),
  });
});

app.post("/api/auth/password-reset/request", async (req, res) => {
  const identifier = String(req.body?.identifier || "").trim();

  if (!identifier) {
    return res.status(400).json({ message: "Email address is required." });
  }

  try {
    const [rows] = await pool.query(
      `
        SELECT id, first_name, last_name, email, status
        FROM users
        WHERE email = ?
        LIMIT 1
      `,
      [identifier],
    );

    if (rows.length > 0 && rows[0].status === "active") {
      const user = rows[0];
      const resetLink = await issuePasswordResetToken(user, req);

      await sendPasswordResetLinkEmail({
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        resetLink,
      });

      await writeAuditLog({
        actorUserId: user.id,
        targetUserId: user.id,
        actionKey: "auth.password_reset_requested",
        actionLabel: "Password reset requested",
        details: `Password reset link issued to ${user.email}.`,
      });
    }

    return res.json({
      message: "If that email exists in the system, a secure reset link has been sent.",
    });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.get("/api/auth/password-reset/validate", async (req, res) => {
  const token = String(req.query.token || "").trim();

  if (!token) {
    return res.json({ valid: false, message: "Reset token is required." });
  }

  try {
    const [rows] = await pool.query(
      `
        SELECT id
        FROM password_reset_tokens
        WHERE token_hash = ?
          AND used_at IS NULL
          AND expires_at > NOW()
        LIMIT 1
      `,
      [hashToken(token)],
    );

    if (rows.length === 0) {
      return res.json({ valid: false, message: "This reset link is invalid or has expired." });
    }

    return res.json({ valid: true });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.post("/api/auth/password-reset/complete", async (req, res) => {
  const token = String(req.body?.token || "").trim();
  const newPassword = String(req.body?.newPassword || "");

  if (!token || !newPassword) {
    return res.status(400).json({ message: "Reset token and new password are required." });
  }

  try {
    const [rows] = await pool.query(
      `
        SELECT prt.id, prt.user_id, u.email
        FROM password_reset_tokens prt
        INNER JOIN users u ON u.id = prt.user_id
        WHERE prt.token_hash = ?
          AND prt.used_at IS NULL
          AND prt.expires_at > NOW()
        LIMIT 1
      `,
      [hashToken(token)],
    );

    if (rows.length === 0) {
      return res.status(400).json({ message: "This reset link is invalid or has expired." });
    }

    const resetRecord = rows[0];

    await pool.query(
      "UPDATE users SET password_hash = ? WHERE id = ?",
      [hashPassword(newPassword), resetRecord.user_id],
    );

    await pool.query(
      "UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ?",
      [resetRecord.id],
    );

    await writeAuditLog({
      actorUserId: resetRecord.user_id,
      targetUserId: resetRecord.user_id,
      actionKey: "auth.password_reset_completed",
      actionLabel: "Password reset completed",
      details: `${resetRecord.email} completed password reset through secure link.`,
    });

    return res.json({ message: "Password reset successfully. You can now sign in." });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.post("/api/auth/resend-otp", async (req, res) => {
  if (!isEmailOtpEnabled) {
    return res.status(400).json({ message: "Email OTP is currently disabled." });
  }

  const { challengeId } = req.body ?? {};
  const challenge = authChallenges.get(String(challengeId || ""));

  if (!challengeId || !challenge) {
    return res.status(400).json({ message: "This verification session is invalid or has expired." });
  }

  const renewedChallenge = await createAndSendAuthChallenge(challenge.user);
  authChallenges.delete(challengeId);

  return res.json({
    challengeId: renewedChallenge.challengeId,
    emailHint: renewedChallenge.emailHint,
    expiresInSeconds: renewedChallenge.expiresInSeconds,
    message: "A new email verification code was sent.",
  });
});

app.post("/api/account/profile", async (req, res) => {
  const { userId, firstName, lastName, email, phoneNumber, profileImageUrl } = req.body ?? {};

  if (!userId || !firstName || !lastName || !email) {
    return res.status(400).json({ message: "User, first name, last name, and email are required." });
  }

  if (
    profileImageUrl &&
    !String(profileImageUrl).startsWith("data:image/") &&
    !String(profileImageUrl).startsWith("/") &&
    !/^https?:\/\//.test(String(profileImageUrl))
  ) {
    return res.status(400).json({ message: "Profile image must be a valid uploaded image." });
  }

  try {
    const [userRows] = await pool.query(
      `
        SELECT country_id
        FROM users
        WHERE id = ?
        LIMIT 1
      `,
      [Number(userId)],
    );

    if (userRows.length === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    const countryName = userRows[0].country_id ? await getCountryNameById(userRows[0].country_id) : null;
    const normalizedPhoneNumber = phoneNumber ? normalizeAirtelPhoneNumber(phoneNumber, countryName) : null;

    if (phoneNumber && !normalizedPhoneNumber) {
      return res.status(400).json({ message: "Phone number must be a valid Airtel number for the selected country." });
    }

    await pool.query(
      `
        UPDATE users
        SET first_name = ?, last_name = ?, email = ?, phone_number = ?, profile_image_url = ?
        WHERE id = ?
      `,
      [firstName, lastName, email, normalizedPhoneNumber, profileImageUrl || null, Number(userId)],
    );

    const [rows] = await pool.query(
      `
        SELECT
          u.id,
          u.first_name,
          u.last_name,
          u.email,
          u.phone_number,
          u.profile_image_url,
          u.job_title,
          u.employment_status,
          u.office_location,
          u.start_date,
          u.must_change_password,
          u.status,
          u.branch_id,
          u.country_id,
          u.department_id,
          r.name AS role_name,
          b.name AS branch_name,
          c.name AS country_name
        FROM users u
        INNER JOIN roles r ON r.id = u.role_id
        LEFT JOIN branches b ON b.id = u.branch_id
        LEFT JOIN country c ON c.id = u.country_id
        WHERE u.id = ?
        LIMIT 1
      `,
      [Number(userId)],
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    return res.json({
      message: "Profile updated successfully.",
      user: toSessionUser(rows[0]),
    });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.post("/api/account/password", async (req, res) => {
  const { userId, currentPassword, newPassword } = req.body ?? {};

  if (!userId || !currentPassword || !newPassword) {
    return res.status(400).json({ message: "User, current password, and new password are required." });
  }

  try {
    const [rows] = await pool.query(
      "SELECT id, password_hash FROM users WHERE id = ? LIMIT 1",
      [Number(userId)],
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    const user = rows[0];

    if (user.password_hash !== hashPassword(currentPassword)) {
      return res.status(401).json({ message: "Current password is incorrect." });
    }

    await pool.query(
      "UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?",
      [hashPassword(newPassword), Number(userId)],
    );

    const refreshedUser = await getLoginUserByIdentifier("", null, Number(userId));

    return res.json({
      message: "Password updated successfully.",
      user: refreshedUser ? toSessionUser(refreshedUser) : undefined,
    });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.get("/api/admin/summary", async (_req, res) => {
  try {
    const [[userStats]] = await pool.query(
      `
        SELECT
          COUNT(*) AS totalUsers,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS activeUsers
        FROM users
      `,
    );

    const [[roleStats]] = await pool.query(
      "SELECT COUNT(*) AS totalRoles FROM roles",
    );

    const [[tableStats]] = await pool.query(
      `
        SELECT COUNT(*) AS totalTables
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
      `,
    );

    const [[requestStats]] = await pool.query(
      `
        SELECT COUNT(*) AS pendingRequests
        FROM requests
        WHERE request_status = 'pending'
      `,
    );

    const [[alertStats]] = await pool.query(
      `
        SELECT COUNT(*) AS unreadNotifications
        FROM notifications
        WHERE status = 'unread'
      `,
    );

    res.json({
      cards: [
        {
          label: "System roles",
          value: String(roleStats.totalRoles ?? 0),
          note: "Roles available for dashboard access control",
        },
        {
          label: "Core tables",
          value: String(tableStats.totalTables ?? 0),
          note: "Live tables currently available in your XAMPP database",
        },
        {
          label: "Pending approvals",
          value: String(requestStats.pendingRequests ?? 0),
          note: "Requests waiting for action",
        },
        {
          label: "Open alerts",
          value: String(alertStats.unreadNotifications ?? 0),
          note: "Unread notification records in the system",
        },
      ],
      totals: {
        totalUsers: Number(userStats.totalUsers ?? 0),
        activeUsers: Number(userStats.activeUsers ?? 0),
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get("/api/admin/lookups", async (_req, res) => {
  try {
    const [roles] = await pool.query(
      "SELECT id, name, description FROM roles ORDER BY name ASC",
    );
    const [permissions] = await pool.query(
      "SELECT id, code, name, module_name FROM permission ORDER BY module_name ASC, name ASC",
    );
    const [countries] = await pool.query(
      "SELECT id, name, iso_code, currency_code FROM country ORDER BY name ASC",
    );
    const [branches] = await pool.query(
      `
        SELECT
          b.id,
          b.name,
          b.branch_code,
          b.country_id,
          c.name AS country_name
        FROM branches b
        INNER JOIN country c ON c.id = b.country_id
        ORDER BY b.name ASC
      `,
    );
    const [departments] = await pool.query(
      `
        SELECT
          d.id,
          d.name,
          d.country_id,
          d.branch_id,
          c.name AS country_name,
          b.name AS branch_name
        FROM department d
        INNER JOIN country c ON c.id = d.country_id
        INNER JOIN branches b ON b.id = d.branch_id
        ORDER BY d.name ASC
      `,
    );

    res.json({ roles, permissions, countries, branches, departments });
  } catch (error) {
    res.status(500).json({ message: normalizeError(error) });
  }
});

app.get("/api/admin/users", async (req, res) => {
  const { unitId } = req.query;

  try {
    let query = `
      SELECT
        u.id,
        u.first_name,
        u.last_name,
        u.employee_code,
        u.job_title,
        u.employment_status,
        u.office_location,
        u.start_date,
        CONCAT(u.first_name, ' ', u.last_name) AS full_name,
        u.email,
        u.phone_number,
        u.role_id,
        r.name AS role_name,
        u.country_id,
        u.branch_id,
        u.department_id,
        u.unit_id,
        u.status,
        u.created_at
      FROM users u
      INNER JOIN roles r ON r.id = u.role_id
    `;

    const params = [];
    if (unitId) {
      query += " WHERE u.unit_id = ? ";
      params.push(Number(unitId));
    }

    query += " ORDER BY u.created_at DESC LIMIT 100";

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get("/api/admin/users/:id", async (req, res) => {
  const userId = Number(req.params.id);

  if (!userId) {
    return res.status(400).json({ message: "A valid user id is required." });
  }

  try {
    const [rows] = await pool.query(
      `
        SELECT
          u.id,
          u.first_name,
          u.last_name,
          u.employee_code,
          u.job_title,
          u.employment_status,
          u.office_location,
          u.start_date,
          CONCAT(u.first_name, ' ', u.last_name) AS full_name,
          u.email,
          u.phone_number,
          u.role_id,
          r.name AS role_name,
          u.country_id,
          u.branch_id,
          u.department_id,
          u.status,
          u.created_at
        FROM users u
        INNER JOIN roles r ON r.id = u.role_id
        WHERE u.id = ?
        LIMIT 1
      `,
      [userId],
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    return res.json(rows[0]);
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.get("/api/admin/audit-logs", async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `
        SELECT
          a.id,
          a.actor_user_id,
          a.target_user_id,
          a.action_key,
          a.action_label,
          a.details,
          a.created_at,
          CONCAT(actor.first_name, ' ', actor.last_name) AS actor_name,
          actor.email AS actor_email,
          CONCAT(target.first_name, ' ', target.last_name) AS target_name,
          target.email AS target_email
        FROM system_logs a
        LEFT JOIN users actor ON actor.id = a.actor_user_id
        LEFT JOIN users target ON target.id = a.target_user_id
        ORDER BY a.created_at DESC
        LIMIT 40
      `,
    );

    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.get("/api/admin/reports", async (_req, res) => {
  try {
    const [[assetMetrics]] = await pool.query(
      `
        SELECT
          COUNT(*) AS totalAssets,
          SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) AS availableAssets,
          SUM(CASE WHEN status = 'assigned' THEN 1 ELSE 0 END) AS assignedAssets,
          SUM(CASE WHEN status = 'maintenance' THEN 1 ELSE 0 END) AS maintenanceAssets,
          SUM(CASE WHEN status = 'retired' THEN 1 ELSE 0 END) AS retiredAssets,
          SUM(CASE WHEN status = 'lost' THEN 1 ELSE 0 END) AS lostAssets
        FROM equipment
      `,
    );

    const [[requestMetrics]] = await pool.query(
      `
        SELECT
          COUNT(*) AS totalRequests,
          SUM(CASE WHEN request_status = 'pending' THEN 1 ELSE 0 END) AS pendingRequests,
          SUM(CASE WHEN request_status = 'approved' THEN 1 ELSE 0 END) AS approvedRequests,
          SUM(CASE WHEN request_status = 'rejected' THEN 1 ELSE 0 END) AS rejectedRequests,
          SUM(CASE WHEN request_status = 'fulfilled' THEN 1 ELSE 0 END) AS fulfilledRequests
        FROM requests
      `,
    );

    const [[assignmentMetrics]] = await pool.query(
      `
        SELECT
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS activeAssignments,
          SUM(CASE WHEN status = 'returned' THEN 1 ELSE 0 END) AS returnedAssignments,
          SUM(CASE WHEN status = 'overdue' THEN 1 ELSE 0 END) AS overdueAssignments
        FROM assignments
      `,
    );

    const [[issueMetrics]] = await pool.query(
      `
        SELECT
          SUM(CASE WHEN issue_status NOT IN ('resolved', 'closed') THEN 1 ELSE 0 END) AS openIssues,
          SUM(CASE WHEN priority = 'high' AND issue_status NOT IN ('resolved', 'closed') THEN 1 ELSE 0 END) AS highPriorityIssues
        FROM issues
      `,
    );

    const [recentAssets] = await pool.query(
      `
        SELECT
          e.id,
          e.asset_tag,
          e.equipment_name,
          e.status,
          c.name AS category_name,
          b.name AS branch_name,
          co.name AS country_name,
          e.purchase_date,
          e.purchase_year,
          e.purchase_cost,
          e.lifespan_years,
          e.refresh_due_at
        FROM equipment e
        LEFT JOIN categories c ON c.id = e.category_id
        LEFT JOIN branches b ON b.id = e.branch_id
        LEFT JOIN country co ON co.id = e.country_id
        ORDER BY e.id DESC
        LIMIT 6
      `,
    );

    const [recentRequests] = await pool.query(
      `
        SELECT
          r.id,
          CONCAT(u.first_name, ' ', u.last_name) AS requester_name,
          u.email AS requester_email,
          c.name AS category_name,
          r.request_status,
          b.name AS branch_name,
          co.name AS country_name,
          r.created_at
        FROM requests r
        INNER JOIN users u ON u.id = r.requester_id
        INNER JOIN categories c ON c.id = r.category_id
        LEFT JOIN branches b ON b.id = u.branch_id
        LEFT JOIN country co ON co.id = u.country_id
        ORDER BY r.created_at DESC
        LIMIT 6
      `,
    );

    return res.json({
      assetMetrics: {
        totalAssets: Number(assetMetrics?.totalAssets ?? 0),
        availableAssets: Number(assetMetrics?.availableAssets ?? 0),
        assignedAssets: Number(assetMetrics?.assignedAssets ?? 0),
        maintenanceAssets: Number(assetMetrics?.maintenanceAssets ?? 0),
        retiredAssets: Number(assetMetrics?.retiredAssets ?? 0),
        lostAssets: Number(assetMetrics?.lostAssets ?? 0),
      },
      requestMetrics: {
        totalRequests: Number(requestMetrics?.totalRequests ?? 0),
        pendingRequests: Number(requestMetrics?.pendingRequests ?? 0),
        approvedRequests: Number(requestMetrics?.approvedRequests ?? 0),
        rejectedRequests: Number(requestMetrics?.rejectedRequests ?? 0),
        fulfilledRequests: Number(requestMetrics?.fulfilledRequests ?? 0),
      },
      assignmentMetrics: {
        activeAssignments: Number(assignmentMetrics?.activeAssignments ?? 0),
        returnedAssignments: Number(assignmentMetrics?.returnedAssignments ?? 0),
        overdueAssignments: Number(assignmentMetrics?.overdueAssignments ?? 0),
      },
      issueMetrics: {
        openIssues: Number(issueMetrics?.openIssues ?? 0),
        highPriorityIssues: Number(issueMetrics?.highPriorityIssues ?? 0),
      },
      recentAssets,
      recentRequests,
    });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.get("/api/admin/system-controls", async (_req, res) => {
  try {
    const settings = await getSystemSettingsMap();
    const [backupRows] = await pool.query(
      `
        SELECT
          b.id,
          b.label,
          b.file_name,
          b.snapshot_status,
          b.created_by_user_id,
          b.restored_by_user_id,
          b.restored_at,
          b.created_at,
          CONCAT(u.first_name, ' ', u.last_name) AS created_by_name,
          CONCAT(r.first_name, ' ', r.last_name) AS restored_by_name
        FROM backup_snapshots b
        LEFT JOIN users u ON u.id = b.created_by_user_id
        LEFT JOIN users r ON r.id = b.restored_by_user_id
        ORDER BY b.created_at DESC
        LIMIT 12
      `,
    );

    return res.json({
      approvalRoles: {
        branchManagerRole: settings.workflow_hr_booking_role || "HR Recruitment officer",
        hrRole: settings.workflow_hrd_role || "HR DIRECTOR",
        itRole: settings.workflow_itd_role || "IT Director",
        storekeeperRole: settings.workflow_fulfillment_role || "IT Support engineer",
      },
      alertThresholds: {
        lowStockThreshold: Number(settings.low_stock_threshold || 3),
        overdueAssignmentDays: Number(settings.overdue_assignment_days || 7),
        highPriorityIssueThreshold: Number(settings.high_priority_issue_threshold || 5),
      },
      backups: backupRows,
    });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.put("/api/admin/system-controls/approval", async (req, res) => {
  const { actorUserId, branchManagerRole, hrRole, itRole, storekeeperRole } = req.body ?? {};

  if (!branchManagerRole || !hrRole || !itRole || !storekeeperRole) {
    return res.status(400).json({ message: "All approval role settings are required." });
  }

  try {
    await updateSystemSettings({
      workflow_hr_booking_role: branchManagerRole,
      workflow_hrd_role: hrRole,
      workflow_itd_role: itRole,
      workflow_fulfillment_role: storekeeperRole,
    });

    await writeAuditLog({
      actorUserId: actorUserId ? Number(actorUserId) : null,
      actionKey: "admin.update_approval_policy",
      actionLabel: "Updated approval policy",
      details: `Workflow roles updated to booking=${branchManagerRole}, HRD=${hrRole}, ITD=${itRole}, fulfillment=${storekeeperRole}.`,
    });

    return res.json({ message: "Approval workflow settings updated successfully." });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.put("/api/admin/system-controls/alerts", async (req, res) => {
  const { actorUserId, lowStockThreshold, overdueAssignmentDays, highPriorityIssueThreshold } = req.body ?? {};

  if (
    Number(lowStockThreshold) < 0 ||
    Number(overdueAssignmentDays) < 0 ||
    Number(highPriorityIssueThreshold) < 0
  ) {
    return res.status(400).json({ message: "Alert thresholds must be zero or higher." });
  }

  try {
    await updateSystemSettings({
      low_stock_threshold: Number(lowStockThreshold),
      overdue_assignment_days: Number(overdueAssignmentDays),
      high_priority_issue_threshold: Number(highPriorityIssueThreshold),
    });

    await writeAuditLog({
      actorUserId: actorUserId ? Number(actorUserId) : null,
      actionKey: "admin.update_alert_thresholds",
      actionLabel: "Updated alert thresholds",
      details: `Low stock ${lowStockThreshold}, overdue days ${overdueAssignmentDays}, high-priority issue limit ${highPriorityIssueThreshold}.`,
    });

    return res.json({ message: "Alert thresholds updated successfully." });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.post("/api/admin/backups", async (req, res) => {
  const { actorUserId, label } = req.body ?? {};

  try {
    await fs.mkdir(backupsDirectory, { recursive: true });

    const snapshotPayload = await buildBackupSnapshotPayload();
    const fileName = `backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    const filePath = path.join(backupsDirectory, fileName);
    const backupLabel = String(label || "Manual backup").trim();

    await fs.writeFile(filePath, JSON.stringify(snapshotPayload, null, 2), "utf8");

    const [result] = await pool.query(
      `
        INSERT INTO backup_snapshots (label, file_name, created_by_user_id)
        VALUES (?, ?, ?)
      `,
      [backupLabel, fileName, actorUserId ? Number(actorUserId) : null],
    );

    await writeAuditLog({
      actorUserId: actorUserId ? Number(actorUserId) : null,
      actionKey: "admin.create_backup",
      actionLabel: "Created backup snapshot",
      details: `${backupLabel} saved as ${fileName}.`,
    });

    return res.status(201).json({
      message: "Backup snapshot created successfully.",
      backupId: result.insertId,
      fileName,
    });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.get("/api/admin/backups/:id/download", async (req, res) => {
  const backupId = Number(req.params.id);

  if (!Number.isInteger(backupId) || backupId <= 0) {
    return res.status(400).json({ message: "A valid backup id is required." });
  }

  try {
    const [rows] = await pool.query(
      "SELECT file_name FROM backup_snapshots WHERE id = ? LIMIT 1",
      [backupId],
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Backup snapshot not found." });
    }

    const filePath = path.join(backupsDirectory, rows[0].file_name);
    return res.download(filePath, rows[0].file_name);
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.post("/api/admin/backups/:id/restore", async (req, res) => {
  const backupId = Number(req.params.id);
  const { actorUserId } = req.body ?? {};

  if (!Number.isInteger(backupId) || backupId <= 0) {
    return res.status(400).json({ message: "A valid backup id is required." });
  }

  try {
    const [rows] = await pool.query(
      "SELECT id, label, file_name FROM backup_snapshots WHERE id = ? LIMIT 1",
      [backupId],
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Backup snapshot not found." });
    }

    const snapshot = rows[0];
    const filePath = path.join(backupsDirectory, snapshot.file_name);
    const fileContents = await fs.readFile(filePath, "utf8");
    const snapshotData = JSON.parse(fileContents);

    await restoreBackupSnapshot(snapshotData);

    await pool.query(
      `
        UPDATE backup_snapshots
        SET snapshot_status = 'restored', restored_by_user_id = ?, restored_at = NOW()
        WHERE id = ?
      `,
      [actorUserId ? Number(actorUserId) : null, backupId],
    );

    await writeAuditLog({
      actorUserId: actorUserId ? Number(actorUserId) : null,
      actionKey: "admin.restore_backup",
      actionLabel: "Restored backup snapshot",
      details: `System restored from snapshot ${snapshot.label}.`,
    });

    return res.json({ message: "Backup snapshot restored successfully." });
  } catch (error) {
    if (backupId) {
      await pool.query(
        "UPDATE backup_snapshots SET snapshot_status = 'failed' WHERE id = ?",
        [backupId],
      ).catch(() => undefined);
    }

    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.get("/api/admin/export/users", async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `
        SELECT
          u.id,
          u.first_name,
          u.last_name,
          CONCAT(u.first_name, ' ', u.last_name) AS full_name,
          u.email,
          u.phone_number,
          u.employee_code,
          u.job_title,
          u.employment_status,
          u.office_location,
          u.start_date,
          r.name AS role_name,
          co.name AS country_name,
          b.name AS branch_name,
          d.name AS department_name,
          u.status,
          u.created_at
        FROM users u
        INNER JOIN roles r ON r.id = u.role_id
        LEFT JOIN country co ON co.id = u.country_id
        LEFT JOIN branches b ON b.id = u.branch_id
        LEFT JOIN department d ON d.id = u.department_id
        ORDER BY u.created_at DESC
      `,
    );

    const columns = [
      { key: "id", label: "User ID" },
      { key: "full_name", label: "Full Name" },
      { key: "first_name", label: "First Name" },
      { key: "last_name", label: "Last Name" },
      { key: "email", label: "Email" },
      { key: "phone_number", label: "Phone Number" },
      { key: "employee_code", label: "Employee Code" },
      { key: "job_title", label: "Job Title" },
      { key: "employment_status", label: "Employment Status" },
      { key: "office_location", label: "Office Location" },
      { key: "start_date", label: "Start Date" },
      { key: "role_name", label: "Role" },
      { key: "country_name", label: "Country" },
      { key: "branch_name", label: "Branch" },
      { key: "department_name", label: "Department" },
      { key: "status", label: "Status" },
      { key: "created_at", label: "Created At" },
    ];
    const documentHtml = buildBrandedHtmlDocument({
      title: "Admin Users Export",
      subtitle: "Airtel IMS user account directory with identity, role, branch, and employment details.",
      rows,
      columns,
      footerNote: "Generated from Airtel IMS admin user management.",
    });

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="admin-users-${new Date().toISOString().slice(0, 10)}.html"`);
    return res.send(documentHtml);
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.get("/api/admin/export/audit-logs", async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `
        SELECT
          a.id,
          a.action_key,
          a.action_label,
          a.details,
          a.created_at,
          CONCAT(actor.first_name, ' ', actor.last_name) AS actor_name,
          actor.email AS actor_email,
          CONCAT(target.first_name, ' ', target.last_name) AS target_name,
          target.email AS target_email
        FROM system_logs a
        LEFT JOIN users actor ON actor.id = a.actor_user_id
        LEFT JOIN users target ON target.id = a.target_user_id
        ORDER BY a.created_at DESC
      `,
    );

    const exportRows = rows.map((row) => ({
      ...row,
      actor_identity: row.actor_name || row.actor_email || "System",
      target_identity: row.target_name || row.target_email || "N/A",
    }));
    const columns = [
      { key: "id", label: "Event ID" },
      { key: "action_key", label: "Action Key" },
      { key: "action_label", label: "Action" },
      { key: "details", label: "Details" },
      { key: "actor_identity", label: "Actor" },
      { key: "target_identity", label: "Target" },
      { key: "created_at", label: "Created At" },
    ];
    const documentHtml = buildBrandedHtmlDocument({
      title: "Admin Audit Log Export",
      subtitle: "Airtel IMS audit history showing actions, actors, targets, and timestamped system activity.",
      rows: exportRows,
      columns,
      footerNote: "Generated from Airtel IMS audit logs.",
    });

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="admin-audit-${new Date().toISOString().slice(0, 10)}.html"`);
    return res.send(documentHtml);
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.get("/api/admin/export/assets", async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `
        SELECT
          e.id,
          e.asset_tag,
          e.serial_number,
          e.computer_name,
          e.equipment_name,
          c.name AS category_name,
          e.status,
          co.name AS country_name,
          b.name AS branch_name,
          e.vendor_name,
          e.model_name,
          e.purchase_year,
          e.purchase_date,
          e.purchase_cost,
          e.location_details,
          e.device_health,
          e.warranty_end_date,
          e.lifespan_years
        FROM equipment e
        LEFT JOIN categories c ON c.id = e.category_id
        LEFT JOIN country co ON co.id = e.country_id
        LEFT JOIN branches b ON b.id = e.branch_id
        ORDER BY e.id DESC
      `,
    );

    const columns = [
      { key: "id", label: "Asset ID" },
      { key: "asset_tag", label: "Asset Tag" },
      { key: "serial_number", label: "Serial Number" },
      { key: "computer_name", label: "Computer Name" },
      { key: "equipment_name", label: "Equipment Name" },
      { key: "category_name", label: "Category" },
      { key: "status", label: "Status" },
      { key: "country_name", label: "Country" },
      { key: "branch_name", label: "Branch" },
      { key: "vendor_name", label: "Vendor" },
      { key: "model_name", label: "Model" },
      { key: "purchase_year", label: "Purchase Year" },
      { key: "purchase_date", label: "Purchase Date" },
      { key: "purchase_cost", label: "Purchase Cost" },
      { key: "location_details", label: "Location" },
      { key: "device_health", label: "Device Health" },
      { key: "warranty_end_date", label: "Warranty End Date" },
      { key: "lifespan_years", label: "Lifespan Years" },
    ];
    const documentHtml = buildBrandedHtmlDocument({
      title: "Admin Asset Export",
      subtitle: "Airtel IMS asset register with category, branch, status, vendor, and lifecycle-related details.",
      rows,
      columns,
      footerNote: "Generated from Airtel IMS asset inventory.",
    });

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="admin-assets-${new Date().toISOString().slice(0, 10)}.html"`);
    return res.send(documentHtml);
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.get("/api/admin/export/requests", async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `
        SELECT
          r.id,
          CONCAT(req.first_name, ' ', req.last_name) AS requester_name,
          req.email AS requester_email,
          c.name AS category_name,
          r.request_status,
          r.notes,
          CONCAT(app.first_name, ' ', app.last_name) AS approver_name,
          b.name AS branch_name,
          co.name AS country_name,
          r.created_at
        FROM requests r
        INNER JOIN users req ON req.id = r.requester_id
        INNER JOIN categories c ON c.id = r.category_id
        LEFT JOIN users app ON app.id = r.approver_id
        LEFT JOIN branches b ON b.id = req.branch_id
        LEFT JOIN country co ON co.id = req.country_id
        ORDER BY r.created_at DESC
      `,
    );

    const columns = [
      { key: "id", label: "Request ID" },
      { key: "requester_name", label: "Requester" },
      { key: "requester_email", label: "Requester Email" },
      { key: "category_name", label: "Requested Category" },
      { key: "request_status", label: "Status" },
      { key: "approver_name", label: "Approver" },
      { key: "branch_name", label: "Branch" },
      { key: "country_name", label: "Country" },
      { key: "notes", label: "Notes" },
      { key: "created_at", label: "Created At" },
    ];
    const documentHtml = buildBrandedHtmlDocument({
      title: "Admin Request Export",
      subtitle: "Airtel IMS request overview with requester, category, approval ownership, and branch context.",
      rows,
      columns,
      footerNote: "Generated from Airtel IMS request administration.",
    });

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="admin-requests-${new Date().toISOString().slice(0, 10)}.html"`);
    return res.send(documentHtml);
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.post("/api/admin/users", async (req, res) => {
  const {
    actorUserId,
    firstName,
    lastName,
    email,
    phoneNumber,
    roleId,
    employeeCode,
    jobTitle,
    employmentStatus,
    officeLocation,
    startDate,
    countryId,
    branchId,
    departmentId,
    unitId,
  } = req.body ?? {};

  const normalizedFirstName = normalizeRequiredText(firstName, 100);
  const normalizedLastName = normalizeRequiredText(lastName, 100);
  const normalizedEmail = normalizeRequiredText(email, 180);
  const normalizedEmployeeCode = normalizeOptionalText(employeeCode, 80);
  const normalizedJobTitle = normalizeOptionalText(jobTitle, 120);
  const normalizedEmploymentStatus = normalizeOptionalText(employmentStatus, 80);
  const normalizedOfficeLocation = normalizeOptionalText(officeLocation, 180);
  const normalizedStartDate = normalizeOptionalText(startDate, 20);

  if (!normalizedFirstName || !normalizedLastName || !normalizedEmail || !roleId) {
    return res.status(400).json({
      message: "First name, last name, email, and role are required.",
    });
  }

  const resolvedCountryId = countryId ? Number(countryId) : await getCountryIdByBranchId(branchId);
  const countryName = resolvedCountryId ? await getCountryNameById(resolvedCountryId) : null;
  const normalizedPhoneNumber = phoneNumber ? normalizeAirtelPhoneNumber(phoneNumber, countryName) : null;

  if (phoneNumber && !normalizedPhoneNumber) {
    return res.status(400).json({ message: "Phone number must be a valid Airtel number for the selected country." });
  }

  const generatedPassword = generateTemporaryPassword();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    let userStatus = "active";
    let targetUnitId = unitId ? Number(unitId) : null;

    if (actorUserId) {
      const [[actor]] = await connection.query(
        `
          SELECT u.id, u.unit_id, r.name AS role_name 
          FROM users u 
          JOIN roles r ON u.role_id = r.id 
          WHERE u.id = ?
        `,
        [Number(actorUserId)]
      );

      if (actor && actor.role_name === "HR DIRECTOR") {
        userStatus = "pending";
        targetUnitId = actor.unit_id; // Restrict to same unit

        if (!targetUnitId) {
          throw new Error("HR Director must belong to a unit before creating users.");
        }

        const [unitRoleRows] = await connection.query(
          `
            SELECT DISTINCT role_id
            FROM users
            WHERE unit_id = ?
              AND role_id IS NOT NULL
          `,
          [targetUnitId],
        );
        const allowedRoleIds = new Set(unitRoleRows.map((row) => Number(row.role_id)));

        if (!allowedRoleIds.has(Number(roleId))) {
          throw new Error("HR Director can only assign roles that belong to their unit.");
        }
      }
    }

    await connection.query(
      `
        INSERT INTO users (
          first_name,
          last_name,
          email,
          phone_number,
          employee_code,
          job_title,
          employment_status,
          office_location,
          start_date,
          password_hash,
          role_id,
          department_id,
          branch_id,
          country_id,
          unit_id,
          status,
          must_change_password
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `,
      [
        normalizedFirstName,
        normalizedLastName,
        normalizedEmail,
        normalizedPhoneNumber,
        normalizedEmployeeCode,
        normalizedJobTitle,
        normalizedEmploymentStatus,
        normalizedOfficeLocation,
        normalizedStartDate,
        hashPassword(generatedPassword),
        Number(roleId),
        departmentId ? Number(departmentId) : null,
        branchId ? Number(branchId) : null,
        resolvedCountryId,
        targetUnitId,
        userStatus,
      ],
    );

    const emailResult = await sendAccountCreatedEmail({
      email: normalizedEmail,
      firstName: normalizedFirstName,
      lastName: normalizedLastName,
      password: generatedPassword,
    });

    await connection.commit();

    await writeAuditLog({
      actorUserId: actorUserId ? Number(actorUserId) : null,
      actionKey: "admin.user.create",
      actionLabel: "Admin created user",
      details: `${normalizedFirstName} ${normalizedLastName} (${normalizedEmail}) was created.`,
    });

    res.status(201).json({
      message: emailResult.sent
        ? "User created successfully. The new account password was sent by email."
        : `User created successfully. ${emailResult.configurationHint} An email preview was written to the backend log.`,
    });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ message: normalizeError(error) });
  } finally {
    connection.release();
  }
});

app.put("/api/admin/users/:id", async (req, res) => {
  const userId = Number(req.params.id);
  const {
    actorUserId,
    firstName,
    lastName,
    email,
    phoneNumber,
    roleId,
    employeeCode,
    jobTitle,
    employmentStatus,
    officeLocation,
    startDate,
    countryId,
    branchId,
    departmentId,
  } = req.body ?? {};

  const normalizedFirstName = normalizeRequiredText(firstName, 100);
  const normalizedLastName = normalizeRequiredText(lastName, 100);
  const normalizedEmail = normalizeRequiredText(email, 180);
  const normalizedEmployeeCode = normalizeOptionalText(employeeCode, 80);
  const normalizedJobTitle = normalizeOptionalText(jobTitle, 120);
  const normalizedEmploymentStatus = normalizeOptionalText(employmentStatus, 80);
  const normalizedOfficeLocation = normalizeOptionalText(officeLocation, 180);
  const normalizedStartDate = normalizeOptionalText(startDate, 20);

  if (!userId || !normalizedFirstName || !normalizedLastName || !normalizedEmail || !roleId) {
    return res.status(400).json({
      message: "User, first name, last name, email, and role are required.",
    });
  }

  const resolvedCountryId = countryId ? Number(countryId) : await getCountryIdByBranchId(branchId);
  const countryName = resolvedCountryId ? await getCountryNameById(resolvedCountryId) : null;
  const normalizedPhoneNumber = phoneNumber ? normalizeAirtelPhoneNumber(phoneNumber, countryName) : null;

  if (phoneNumber && !normalizedPhoneNumber) {
    return res.status(400).json({ message: "Phone number must be a valid Airtel number for the selected country." });
  }

  try {
    const [result] = await pool.query(
      `
        UPDATE users
        SET
          first_name = ?,
          last_name = ?,
          email = ?,
          phone_number = ?,
          role_id = ?,
          employee_code = ?,
          job_title = ?,
          employment_status = ?,
          office_location = ?,
          start_date = ?,
          country_id = ?,
          branch_id = ?,
          department_id = ?
        WHERE id = ?
      `,
      [
        normalizedFirstName,
        normalizedLastName,
        normalizedEmail,
        normalizedPhoneNumber,
        Number(roleId),
        normalizedEmployeeCode,
        normalizedJobTitle,
        normalizedEmploymentStatus,
        normalizedOfficeLocation,
        normalizedStartDate,
        resolvedCountryId,
        branchId ? Number(branchId) : null,
        departmentId ? Number(departmentId) : null,
        userId,
      ],
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    await writeAuditLog({
      actorUserId: actorUserId ? Number(actorUserId) : null,
      targetUserId: userId,
      actionKey: "admin.user.update",
      actionLabel: "Admin updated user",
      details: `${normalizedFirstName} ${normalizedLastName} (${normalizedEmail}) was updated.`,
    });

    return res.json({ message: "User updated successfully." });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.post("/api/admin/users/:id/status", async (req, res) => {
  const userId = Number(req.params.id);
  const { status, actorUserId } = req.body ?? {};

  if (!userId || !["active", "inactive", "pending"].includes(status)) {
    return res.status(400).json({ message: "A valid user and status are required." });
  }

  try {
    const [result] = await pool.query(
      "UPDATE users SET status = ? WHERE id = ?",
      [status, userId],
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    await writeAuditLog({
      actorUserId: actorUserId ? Number(actorUserId) : null,
      targetUserId: userId,
      actionKey: "admin.user.status",
      actionLabel: "Admin changed user status",
      details: `User status changed to ${status}.`,
    });

    return res.json({
      message: `User marked ${status}.`,
    });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.post("/api/admin/users/:id/approve", async (req, res) => {
  const userId = Number(req.params.id);
  const { actorUserId } = req.body ?? {};

  try {
    const [[user]] = await pool.query(
      "SELECT status, first_name, last_name, email FROM users WHERE id = ?",
      [userId]
    );

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    if (user.status !== "pending") {
      return res.status(400).json({ message: "User is not in pending status." });
    }

    await pool.query(
      "UPDATE users SET status = 'active' WHERE id = ?",
      [userId]
    );

    await writeAuditLog({
      actorUserId: actorUserId ? Number(actorUserId) : null,
      targetUserId: userId,
      actionKey: "admin.user.approve",
      actionLabel: "Admin approved user",
      details: `User ${user.first_name} ${user.last_name} (${user.email}) was approved and activated.`,
    });

    return res.json({ message: "User approved and activated successfully." });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.delete("/api/admin/users/:id", async (req, res) => {
  const userId = Number(req.params.id);
  const actorUserId = Number(req.body?.actorUserId || 0);

  if (!userId) {
    return res.status(400).json({ message: "A valid user id is required." });
  }

  if (actorUserId && actorUserId === userId) {
    return res.status(400).json({ message: "You cannot delete the account you are currently using." });
  }

  try {
    const [rows] = await pool.query(
      `
        SELECT id, email, employee_code
        FROM users
        WHERE id = ?
        LIMIT 1
      `,
      [userId],
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    const account = rows[0];

    if (String(account.email).trim().toLowerCase() === String(defaultAdminEmail).trim().toLowerCase()) {
      return res.status(400).json({ message: "The default admin account cannot be deleted." });
    }

    const [result] = await pool.query("DELETE FROM users WHERE id = ?", [userId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    await writeAuditLog({
      actorUserId: actorUserId || null,
      targetUserId: userId,
      actionKey: "admin.user.delete",
      actionLabel: "Admin deleted user",
      details: `${account.email} account was deleted.`,
    });

    return res.json({ message: "User deleted successfully." });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.post("/api/admin/users/:id/resend-welcome", async (req, res) => {
  const userId = Number(req.params.id);
  const actorUserId = Number(req.body?.actorUserId || 0);

  if (!userId) {
    return res.status(400).json({ message: "A valid user id is required." });
  }

  try {
    const [rows] = await pool.query(
      `
        SELECT id, first_name, last_name, email
        FROM users
        WHERE id = ?
        LIMIT 1
      `,
      [userId],
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    const account = rows[0];
    const temporaryPassword = generateTemporaryPassword();

    await pool.query("UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?", [hashPassword(temporaryPassword), userId]);

    const emailResult = await sendTemporaryPasswordEmail({
      email: account.email,
      firstName: account.first_name,
      lastName: account.last_name,
      password: temporaryPassword,
      purpose: "welcome",
    });

    await writeAuditLog({
      actorUserId: actorUserId || null,
      targetUserId: userId,
      actionKey: "admin.user.resend_welcome",
      actionLabel: "Admin resent welcome email",
      details: `Welcome email resent to ${account.email}.`,
    });

    return res.json({
      message: emailResult.sent
        ? "Welcome email resent successfully with a fresh temporary password."
        : `Welcome email prepared. ${emailResult.configurationHint} A preview was written to the backend log.`,
    });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.post("/api/admin/users/:id/reset-password", async (req, res) => {
  const userId = Number(req.params.id);
  const actorUserId = Number(req.body?.actorUserId || 0);

  if (!userId) {
    return res.status(400).json({ message: "A valid user id is required." });
  }

  try {
    const [rows] = await pool.query(
      `
        SELECT id, first_name, last_name, email
        FROM users
        WHERE id = ?
        LIMIT 1
      `,
      [userId],
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    const account = rows[0];
    const temporaryPassword = generateTemporaryPassword();

    await pool.query("UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?", [hashPassword(temporaryPassword), userId]);

    const emailResult = await sendTemporaryPasswordEmail({
      email: account.email,
      firstName: account.first_name,
      lastName: account.last_name,
      password: temporaryPassword,
      purpose: "reset",
    });

    await writeAuditLog({
      actorUserId: actorUserId || null,
      targetUserId: userId,
      actionKey: "admin.user.reset_password",
      actionLabel: "Admin reset user password",
      details: `Password reset email sent to ${account.email}.`,
    });

    return res.json({
      message: emailResult.sent
        ? "Password reset successfully and emailed to the user."
        : `Password reset completed. ${emailResult.configurationHint} A preview was written to the backend log.`,
    });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.post("/api/admin/roles", async (req, res) => {
  const { name, description } = req.body ?? {};

  if (!name) {
    return res.status(400).json({ message: "Role name is required." });
  }

  try {
    await pool.query(
      "INSERT INTO roles (name, description) VALUES (?, ?)",
      [name, description || null],
    );

    res.status(201).json({ message: "Role created successfully." });
  } catch (error) {
    res.status(500).json({ message: normalizeError(error) });
  }
});

app.post("/api/admin/permissions", async (req, res) => {
  const { code, name, moduleName } = req.body ?? {};

  if (!code || !name || !moduleName) {
    return res.status(400).json({ message: "Code, name, and module are required." });
  }

  try {
    await pool.query(
      "INSERT INTO permission (code, name, module_name) VALUES (?, ?, ?)",
      [code, name, moduleName],
    );

    res.status(201).json({ message: "Permission created successfully." });
  } catch (error) {
    res.status(500).json({ message: normalizeError(error) });
  }
});

app.post("/api/admin/countries", async (req, res) => {
  const { name, isoCode, currencyCode } = req.body ?? {};

  if (!name || !isoCode) {
    return res.status(400).json({ message: "Country name and ISO code are required." });
  }

  try {
    await pool.query(
      "INSERT INTO country (name, iso_code, currency_code) VALUES (?, ?, ?)",
      [name, isoCode, currencyCode || null],
    );

    res.status(201).json({ message: "Country created successfully." });
  } catch (error) {
    res.status(500).json({ message: normalizeError(error) });
  }
});

app.post("/api/admin/countries/seed", async (_req, res) => {
  try {
    for (const country of airtelCountries) {
      await pool.query(
        `
          INSERT INTO country (name, iso_code, currency_code)
          VALUES (?, ?, ?)
          ON DUPLICATE KEY UPDATE
            name = VALUES(name),
            currency_code = VALUES(currency_code)
        `,
        [country.name, country.isoCode, country.currencyCode],
      );
    }

    res.status(201).json({
      message: "Airtel countries loaded successfully.",
      count: airtelCountries.length,
    });
  } catch (error) {
    res.status(500).json({ message: normalizeError(error) });
  }
});

app.post("/api/admin/branches", async (req, res) => {
  const { name, branchCode, countryId } = req.body ?? {};

  if (!name || !branchCode) {
    return res.status(400).json({ message: "Branch name and code are required." });
  }

  try {
    const resolvedCountryId = countryId ? Number(countryId) : await getFallbackCountryId();

    if (!resolvedCountryId) {
      return res.status(400).json({ message: "No default country record is available for new branches." });
    }

    await pool.query(
      "INSERT INTO branches (country_id, name, branch_code, manager_user_id) VALUES (?, ?, ?, NULL)",
      [resolvedCountryId, name, branchCode],
    );

    res.status(201).json({ message: "Branch created successfully." });
  } catch (error) {
    res.status(500).json({ message: normalizeError(error) });
  }
});

app.post("/api/admin/branches/seed", async (_req, res) => {
  try {
    const [countries] = await pool.query(
      "SELECT id, name FROM country",
    );

    const countryMap = new Map(countries.map((country) => [country.name, country.id]));
    let inserted = 0;

    for (const branch of airtelBranches) {
      const countryId = countryMap.get(branch.countryName);

      if (!countryId) {
        continue;
      }

      await pool.query(
        `
          INSERT INTO branches (country_id, name, branch_code, manager_user_id)
          VALUES (?, ?, ?, NULL)
          ON DUPLICATE KEY UPDATE
            name = VALUES(name),
            country_id = VALUES(country_id)
        `,
        [countryId, branch.name, branch.branchCode],
      );

      inserted += 1;
    }

    res.status(201).json({
      message: "Airtel branches loaded successfully.",
      count: inserted,
    });
  } catch (error) {
    res.status(500).json({ message: normalizeError(error) });
  }
});

app.post("/api/admin/departments", async (req, res) => {
  const { name, countryId, branchId } = req.body ?? {};

  if (!name || !branchId) {
    return res.status(400).json({ message: "Department name and branch are required." });
  }

  try {
    const resolvedCountryId = countryId ? Number(countryId) : await getCountryIdByBranchId(branchId);

    if (!resolvedCountryId) {
      return res.status(400).json({ message: "Could not determine the branch country for this department." });
    }

    await pool.query(
      "INSERT INTO department (country_id, branch_id, name) VALUES (?, ?, ?)",
      [resolvedCountryId, Number(branchId), name],
    );

    res.status(201).json({ message: "Department created successfully." });
  } catch (error) {
    res.status(500).json({ message: normalizeError(error) });
  }
});

app.get("/api/admin/users/:id/qr", async (req, res) => {
  const userId = Number(req.params.id);

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ message: "A valid user id is required." });
  }

  try {
    const [rows] = await pool.query(
      `
        SELECT
          u.id,
          u.first_name,
          u.last_name,
          u.email,
          u.employee_code,
          u.status,
          r.name AS role_name
        FROM users u
        INNER JOIN roles r ON r.id = u.role_id
        WHERE u.id = ?
        LIMIT 1
      `,
      [userId],
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    const account = rows[0];
    const qrPayload = JSON.stringify({
      type: "airtel-user",
      id: account.id,
      name: `${account.first_name} ${account.last_name}`,
      email: account.email,
      employeeCode: account.employee_code,
      role: account.role_name,
      status: account.status,
    });

    return res.json({
      user: {
        id: account.id,
        fullName: `${account.first_name} ${account.last_name}`,
        email: account.email,
        employeeCode: account.employee_code,
        role: account.role_name,
        status: account.status,
      },
      qrPayload,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.get("/api/equipment", async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        e.id,
        e.asset_tag,
        e.serial_number,
        e.computer_name,
        e.equipment_name,
        e.status,
        e.stock_location,
        e.category_id,
        e.branch_id,
        e.country_id,
        e.vendor_name,
        e.model_name,
        e.purchase_date,
        e.purchase_year,
        e.purchase_cost,
        e.location_details,
        e.device_health,
        e.warranty_end_date,
        e.lifespan_years,
        e.equipment_specs,
        c.name AS category_name,
        b.name AS branch_name,
        co.name AS country_name
      FROM equipment e
      LEFT JOIN categories c ON c.id = e.category_id
      LEFT JOIN branches b ON b.id = e.branch_id
      LEFT JOIN country co ON co.id = e.country_id
      ORDER BY e.id DESC
      LIMIT 50
    `);

    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get("/api/warehouse/equipment", async (req, res) => {
  try {
    const userId = Number(req.query.userId);
    const actor = Number.isInteger(userId) && userId > 0 ? await getUserContext(userId) : null;
    const branchScope = actor?.branch_id ? Number(actor.branch_id) : null;

    const [rows] = await pool.query(
      `
        SELECT
          e.id,
          e.asset_tag,
          e.serial_number,
          e.computer_name,
          e.equipment_name,
          e.status,
          e.stock_location,
          e.category_id,
          e.branch_id,
          e.country_id,
          e.vendor_name,
          e.model_name,
          e.purchase_date,
          e.purchase_year,
          e.purchase_cost,
          e.location_details,
          e.device_health,
          e.warranty_end_date,
          e.lifespan_years,
          e.equipment_specs,
          c.name AS category_name,
          b.name AS branch_name,
          co.name AS country_name
        FROM equipment e
        LEFT JOIN categories c ON c.id = e.category_id
        LEFT JOIN branches b ON b.id = e.branch_id
        LEFT JOIN country co ON co.id = e.country_id
        WHERE e.stock_location = 'warehouse_stock'
          AND (? IS NULL OR e.branch_id = ?)
        ORDER BY e.id DESC
      `,
      [branchScope, branchScope],
    );

    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.get("/api/move-orders", async (req, res) => {
  const userId = Number(req.query.userId);

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ message: "A valid user id is required." });
  }

  try {
    const rows = await getMoveOrdersForUser(userId);
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.post("/api/move-orders", async (req, res) => {
  const { actorUserId, requestedItems, reason, note, destinationBranchId } = req.body ?? {};
  const actor = await getUserContext(Number(actorUserId));

  if (!actor || actor.role_name !== "IT Support engineer") {
    return res.status(403).json({ message: "Only an IT Support engineer can create move orders." });
  }

  const normalizedReason = normalizeOptionalText(reason, 255);
  const normalizedNote = normalizeOptionalText(note, 1000);
  const normalizedRequestedItems = Array.isArray(requestedItems)
    ? requestedItems
        .map((item) => ({
          categoryId: Number(item?.categoryId),
          quantity: Number(item?.quantity),
        }))
        .filter((item) => Number.isInteger(item.categoryId) && item.categoryId > 0 && Number.isInteger(item.quantity) && item.quantity > 0)
    : [];
  const targetBranchId = Number(destinationBranchId || actor.branch_id || 0);

  if (normalizedRequestedItems.length === 0) {
    return res.status(400).json({ message: "Add at least one requested item." });
  }

  try {
    const requestedCategoryIds = Array.from(new Set(normalizedRequestedItems.map((item) => item.categoryId)));
    const [categoryRows] = await pool.query(
      `
        SELECT id
        FROM categories
        WHERE id IN (?)
      `,
      [requestedCategoryIds],
    );

    if (categoryRows.length !== requestedCategoryIds.length) {
      return res.status(400).json({ message: "Some requested categories could not be found." });
    }

    const requestNumber = `MO-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Date.now().toString().slice(-5)}`;
    const [result] = await pool.query(
      `
        INSERT INTO move_order_requests (
          request_number,
          requested_by_user_id,
          destination_branch_id,
          status,
          reason,
          note
        )
        VALUES (?, ?, ?, 'pending', ?, ?)
      `,
      [requestNumber, actor.id, targetBranchId || null, normalizedReason, normalizedNote],
    );

    const requestId = result.insertId;

    for (const requestedItem of normalizedRequestedItems) {
      for (let index = 0; index < requestedItem.quantity; index += 1) {
        await pool.query(
          `
            INSERT INTO move_order_request_items (
              move_order_request_id,
              equipment_id,
              requested_category_id,
              requested_quantity
            )
            VALUES (?, NULL, ?, 1)
          `,
          [requestId, requestedItem.categoryId],
        );
      }
    }

    const moveOrders = await getMoveOrdersForUser(actor.id);
    const createdOrder = moveOrders.find((item) => item.id === requestId) ?? null;

    return res.status(201).json({
      message: "Move order request submitted to warehouse.",
      moveOrder: createdOrder,
    });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.post("/api/move-orders/:id/decision", async (req, res) => {
  const moveOrderId = Number(req.params.id);
  const { actorUserId, decision, note } = req.body ?? {};
  const actor = await getUserContext(Number(actorUserId));
  let finalDecision = String(decision);

  if (!Number.isInteger(moveOrderId) || moveOrderId <= 0) {
    return res.status(400).json({ message: "A valid move order id is required." });
  }

  if (!actor || !isWarehouseRole(actor.role_name)) {
    return res.status(403).json({ message: "Only the Warehouse manager can approve or reject move orders." });
  }

  if (!["approved", "partial", "rejected"].includes(finalDecision)) {
    return res.status(400).json({ message: "Choose a valid decision." });
  }

  try {
    const [requestRows] = await pool.query(
      "SELECT id, requested_by_user_id, destination_branch_id, status FROM move_order_requests WHERE id = ? LIMIT 1",
      [moveOrderId],
    );

    const requestRecord = requestRows[0];
    if (!requestRecord) {
      return res.status(404).json({ message: "Move order not found." });
    }

    if (requestRecord.status !== "pending") {
      return res.status(400).json({ message: "This move order has already been processed." });
    }

    const [itemRows] = await pool.query(
      `
        SELECT i.id, i.equipment_id, i.requested_category_id, requested_category.name AS requested_category_name, e.asset_tag, e.stock_location, e.status
        FROM move_order_request_items i
        LEFT JOIN equipment e ON e.id = i.equipment_id
        LEFT JOIN categories requested_category ON requested_category.id = i.requested_category_id
        WHERE i.move_order_request_id = ?
      `,
      [moveOrderId],
    );

    if (["approved", "partial"].includes(finalDecision)) {
      let approvedCount = 0;

      for (const item of itemRows) {
        if (!item.requested_category_id) {
          continue;
        }

        const [availableRows] = await pool.query(
          `
            SELECT id, asset_tag
            FROM equipment
            WHERE category_id = ?
              AND stock_location = 'warehouse_stock'
              AND status = 'available'
            ORDER BY id ASC
            LIMIT 1
          `,
          [item.requested_category_id],
        );

        const availableEquipment = availableRows[0];
        if (!availableEquipment) {
          continue;
        }

        await pool.query(
          `
            UPDATE move_order_request_items
            SET equipment_id = ?
            WHERE id = ?
          `,
          [availableEquipment.id, item.id],
        );

        await pool.query(
          `
            UPDATE equipment
            SET status = 'reserved'
            WHERE id = ?
          `,
          [availableEquipment.id],
        );

        approvedCount += 1;

        await logAssetLifecycle({
          equipmentId: availableEquipment.id,
          eventType: "move_order_approved",
          eventLabel: "Reserved for IT stock transfer",
          eventNote: `Warehouse approved move order ${moveOrderId} and reserved the device for IT receipt confirmation.`,
          fromStatus: "available",
          toStatus: "reserved",
          relatedRecordType: "move_order",
          relatedRecordId: moveOrderId,
        });
      }

      if (approvedCount === 0) {
        return res.status(400).json({ message: "No requested devices are currently available in warehouse stock." });
      }

      if (finalDecision === "approved" && approvedCount < itemRows.length) {
        finalDecision = "partial";
      }
    }

    await pool.query(
      `
        UPDATE move_order_requests
        SET warehouse_user_id = ?,
            status = ?,
            receipt_status = CASE WHEN ? IN ('approved', 'partial') THEN 'pending' ELSE receipt_status END,
            reviewed_note = ?,
            reviewed_at = CURRENT_TIMESTAMP,
            fulfilled_at = CASE WHEN ? IN ('approved', 'partial') THEN NULL ELSE fulfilled_at END
        WHERE id = ?
      `,
      [actor.id, finalDecision, finalDecision, normalizeOptionalText(note, 1000), finalDecision, moveOrderId],
    );

    const requesterOrders = await getMoveOrdersForUser(requestRecord.requested_by_user_id);
    const updatedOrder = requesterOrders.find((item) => item.id === moveOrderId) ?? null;

    return res.json({
      message:
        finalDecision === "approved"
          ? "Move order fully approved and devices reserved for IT receipt."
          : finalDecision === "partial"
            ? "Move order partially approved based on available warehouse stock."
            : "Move order rejected.",
      moveOrder: updatedOrder,
    });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.post("/api/move-orders/:id/receive", async (req, res) => {
  const moveOrderId = Number(req.params.id);
  const { actorUserId } = req.body ?? {};
  const actor = await getUserContext(Number(actorUserId));

  if (!Number.isInteger(moveOrderId) || moveOrderId <= 0) {
    return res.status(400).json({ message: "A valid move order id is required." });
  }

  if (!actor || actor.role_name !== "IT Support engineer") {
    return res.status(403).json({ message: "Only an IT Support engineer can confirm warehouse receipt." });
  }

  try {
    const [requestRows] = await pool.query(
      `
        SELECT id, requested_by_user_id, destination_branch_id, status, receipt_status
        FROM move_order_requests
        WHERE id = ?
        LIMIT 1
      `,
      [moveOrderId],
    );

    const requestRecord = requestRows[0];
    if (!requestRecord) {
      return res.status(404).json({ message: "Move order not found." });
    }

    if (requestRecord.requested_by_user_id !== actor.id) {
      return res.status(403).json({ message: "Only the requesting IT Support engineer can confirm this receipt." });
    }

    if (!["approved", "partial"].includes(String(requestRecord.status))) {
      return res.status(400).json({ message: "Only approved or partially approved move orders can be confirmed as received." });
    }

    if (requestRecord.receipt_status === "received") {
      return res.status(400).json({ message: "This move order receipt was already confirmed." });
    }

    const [itemRows] = await pool.query(
      `
        SELECT i.equipment_id, e.asset_tag, e.stock_location, e.status
        FROM move_order_request_items i
        INNER JOIN equipment e ON e.id = i.equipment_id
        WHERE i.move_order_request_id = ?
      `,
      [moveOrderId],
    );

    if (itemRows.length === 0) {
      return res.status(400).json({ message: "No reserved devices are attached to this move order yet." });
    }

    const unavailableItem = itemRows.find((item) => item.stock_location !== "warehouse_stock" || item.status !== "reserved");
    if (unavailableItem) {
      return res.status(400).json({ message: `${unavailableItem.asset_tag} is not waiting in reserved warehouse stock.` });
    }

    for (const item of itemRows) {
      await pool.query(
        `
          UPDATE equipment
          SET stock_location = 'it_stock',
              status = 'available',
              branch_id = COALESCE(?, branch_id)
          WHERE id = ?
        `,
        [requestRecord.destination_branch_id || null, item.equipment_id],
      );

      await logAssetLifecycle({
        equipmentId: item.equipment_id,
        actorUserId: actor.id,
        eventType: "move_order_received",
        eventLabel: "Received into IT stock",
        eventNote: `IT Support confirmed receipt for move order ${moveOrderId}.`,
        fromStatus: "reserved",
        toStatus: "available",
        relatedRecordType: "move_order",
        relatedRecordId: moveOrderId,
      });
    }

    await pool.query(
      `
        UPDATE move_order_requests
        SET receipt_status = 'received',
            received_confirmed_at = CURRENT_TIMESTAMP,
            status = CASE WHEN status = 'approved' THEN 'fulfilled' ELSE status END,
            fulfilled_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [moveOrderId],
    );

    return res.json({ message: "Receipt confirmed. Devices are now available in IT stock." });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.get("/api/super-user/country-usage", async (_req, res) => {
  try {
    const [countries] = await pool.query(
      "SELECT id, name, iso_code, currency_code FROM country ORDER BY name ASC",
    );
    const [branchRows] = await pool.query(
      "SELECT country_id, COUNT(*) AS total FROM branches GROUP BY country_id",
    );
    const [userRows] = await pool.query(
      "SELECT country_id, COUNT(*) AS total FROM users WHERE country_id IS NOT NULL GROUP BY country_id",
    );
    const [equipmentRows] = await pool.query(
      `
        SELECT country_id, status, COUNT(*) AS total
        FROM equipment
        WHERE country_id IS NOT NULL
        GROUP BY country_id, status
      `,
    );
    const [requestRows] = await pool.query(
      `
        SELECT req.country_id, r.request_status, COUNT(*) AS total
        FROM requests r
        INNER JOIN users req ON req.id = r.requester_id
        WHERE req.country_id IS NOT NULL
        GROUP BY req.country_id, r.request_status
      `,
    );
    const [assignmentRows] = await pool.query(
      `
        SELECT emp.country_id, a.status, a.receipt_status, COUNT(*) AS total
        FROM assignments a
        INNER JOIN users emp ON emp.id = a.employee_user_id
        WHERE emp.country_id IS NOT NULL
        GROUP BY emp.country_id, a.status, a.receipt_status
      `,
    );
    const [returnRows] = await pool.query(
      `
        SELECT emp.country_id, r.return_status, COUNT(*) AS total
        FROM returns r
        INNER JOIN users emp ON emp.id = r.employee_user_id
        WHERE emp.country_id IS NOT NULL
        GROUP BY emp.country_id, r.return_status
      `,
    );
    const [issueRows] = await pool.query(
      `
        SELECT e.country_id, i.issue_status, i.priority, COUNT(*) AS total
        FROM issues i
        INNER JOIN equipment e ON e.id = i.equipment_id
        WHERE e.country_id IS NOT NULL
        GROUP BY e.country_id, i.issue_status, i.priority
      `,
    );

    const incrementMetric = (target, key, value) => {
      target[key] = (target[key] || 0) + Number(value || 0);
    };

    const usageByCountry = new Map(
      countries.map((country) => [
        country.id,
        {
          countryId: country.id,
          countryName: country.name,
          isoCode: country.iso_code,
          currencyCode: country.currency_code,
          branches: 0,
          users: 0,
          equipment: {
            total: 0,
            available: 0,
            assigned: 0,
            maintenance: 0,
            retired: 0,
            lost: 0,
          },
          requests: {
            total: 0,
            pending: 0,
            approved: 0,
            rejected: 0,
            fulfilled: 0,
          },
          assignments: {
            total: 0,
            active: 0,
            returned: 0,
            overdue: 0,
            receiptPending: 0,
            receiptConfirmed: 0,
          },
          returns: {
            total: 0,
            requested: 0,
            completed: 0,
            rejected: 0,
          },
          issues: {
            total: 0,
            open: 0,
            in_progress: 0,
            resolved: 0,
            closed: 0,
            highPriority: 0,
          },
          utilizationRate: 0,
        },
      ]),
    );

    for (const row of branchRows) {
      const stats = usageByCountry.get(row.country_id);
      if (stats) {
        stats.branches = Number(row.total || 0);
      }
    }

    for (const row of userRows) {
      const stats = usageByCountry.get(row.country_id);
      if (stats) {
        stats.users = Number(row.total || 0);
      }
    }

    for (const row of equipmentRows) {
      const stats = usageByCountry.get(row.country_id);
      if (stats) {
        incrementMetric(stats.equipment, "total", row.total);
        incrementMetric(stats.equipment, row.status, row.total);
      }
    }

    for (const row of requestRows) {
      const stats = usageByCountry.get(row.country_id);
      if (stats) {
        incrementMetric(stats.requests, "total", row.total);
        incrementMetric(stats.requests, row.request_status, row.total);
      }
    }

    for (const row of assignmentRows) {
      const stats = usageByCountry.get(row.country_id);
      if (stats) {
        incrementMetric(stats.assignments, "total", row.total);
        incrementMetric(stats.assignments, row.status, row.total);
        if (row.receipt_status === "received") {
          incrementMetric(stats.assignments, "receiptConfirmed", row.total);
        } else {
          incrementMetric(stats.assignments, "receiptPending", row.total);
        }
      }
    }

    for (const row of returnRows) {
      const stats = usageByCountry.get(row.country_id);
      if (stats) {
        incrementMetric(stats.returns, "total", row.total);
        incrementMetric(stats.returns, row.return_status, row.total);
      }
    }

    for (const row of issueRows) {
      const stats = usageByCountry.get(row.country_id);
      if (stats) {
        incrementMetric(stats.issues, "total", row.total);
        incrementMetric(stats.issues, row.issue_status, row.total);
        if (row.priority === "high" || row.priority === "critical") {
          incrementMetric(stats.issues, "highPriority", row.total);
        }
      }
    }

    const usage = Array.from(usageByCountry.values()).map((stats) => ({
      ...stats,
      utilizationRate: stats.equipment.total > 0
        ? Math.round((stats.equipment.assigned / stats.equipment.total) * 100)
        : 0,
    }));

    return res.json(usage);
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.post("/api/categories", async (req, res) => {
  const { name, depreciationRate } = req.body ?? {};

  if (!name || !String(name).trim()) {
    return res.status(400).json({ message: "Category name is required." });
  }

  try {
    const normalizedName = String(name).trim();
    const [existingRows] = await pool.query(
      "SELECT id, name, depreciation_rate FROM categories WHERE LOWER(name) = LOWER(?) LIMIT 1",
      [normalizedName],
    );

    if (existingRows.length > 0) {
      return res.json({
        message: "Category already exists.",
        category: existingRows[0],
      });
    }

    const [result] = await pool.query(
      "INSERT INTO categories (name, depreciation_rate) VALUES (?, ?)",
      [normalizedName, Number(depreciationRate) > 0 ? Number(depreciationRate) : 20],
    );

    const [rows] = await pool.query(
      "SELECT id, name, depreciation_rate FROM categories WHERE id = ? LIMIT 1",
      [result.insertId],
    );

    return res.status(201).json({
      message: "Category created successfully.",
      category: rows[0] ?? null,
    });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.post("/api/equipment", async (req, res) => {
  const {
    actorUserId,
    assetTag,
    serialNumber,
    computerName,
    equipmentName,
    categoryId,
    countryId,
    branchId,
    vendorName,
    modelName,
    status,
    purchaseYear,
    purchaseCost,
    purchaseDate,
    locationDetails,
    deviceHealth,
    warrantyEndDate,
    lifespanYears,
    equipmentSpecs,
    stockLocation,
  } = req.body ?? {};

  const categoryName = categoryId ? await getCategoryNameById(Number(categoryId)) : null;
  const countryName = countryId ? await getCountryNameById(Number(countryId)) : null;
  const computedAssetTag = !assetTag && categoryName && countryName ? await buildNextEquipmentAssetTag(countryName, categoryName) : assetTag;
  const normalizedAssetTag = normalizeRequiredText(computedAssetTag, 80);
  const normalizedSerialNumber = normalizeRequiredText(serialNumber, 120);
  const normalizedComputerName = normalizeOptionalText(computerName, 120);
  const normalizedEquipmentName = normalizeRequiredText(equipmentName, 160);
  const normalizedVendorName = normalizeOptionalText(vendorName, 150);
  const normalizedModelName = normalizeOptionalText(modelName, 150);
  const normalizedStatus = normalizeOptionalText(status, 40) || "available";
  const normalizedPurchaseDate = normalizeOptionalText(purchaseDate, 20);
  const normalizedLocationDetails = normalizeOptionalText(locationDetails, 180);
  const normalizedDeviceHealth = normalizeOptionalText(deviceHealth, 80);
  const normalizedWarrantyEndDate = normalizeOptionalText(warrantyEndDate, 20);
  const sanitizedEquipmentSpecs = sanitizeEquipmentSpecs(equipmentSpecs);
  const normalizedStockLocation = normalizeStockLocation(stockLocation);
  const actor = await getUserContext(Number(actorUserId));

  if (!actor || !canManageWarehouseInventory(actor.role_name)) {
    return res.status(403).json({ message: "Only the Warehouse manager can register devices." });
  }

  if (!normalizedAssetTag || !normalizedSerialNumber || !normalizedEquipmentName || !categoryId || !countryId || !branchId) {
    return res.status(400).json({ message: "Asset tag, serial number, name, category, country, and branch are required." });
  }

  let failureStage = "insert equipment";

  try {
    await pool.query(
      `
        INSERT INTO equipment (
          asset_tag,
          serial_number,
          computer_name,
          equipment_name,
          category_id,
          country_id,
          branch_id,
          vendor_name,
          model_name,
          status,
          stock_location,
          purchase_year,
          purchase_date,
          purchase_cost,
          location_details,
          device_health,
          warranty_end_date,
          lifespan_years,
          equipment_specs
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        normalizedAssetTag,
        normalizedSerialNumber,
        normalizedComputerName,
        normalizedEquipmentName,
        Number(categoryId),
        Number(countryId),
        Number(branchId),
        normalizedVendorName,
        normalizedModelName,
        normalizedStatus,
        normalizedStockLocation,
        Number(purchaseYear) > 0 ? Number(purchaseYear) : null,
        normalizedPurchaseDate,
        normalizeOptionalNumber(purchaseCost, 0) ?? 0,
        normalizedLocationDetails,
        normalizedDeviceHealth,
        normalizedWarrantyEndDate,
        Number(lifespanYears) > 0 ? Number(lifespanYears) : 4,
        sanitizedEquipmentSpecs ? JSON.stringify(sanitizedEquipmentSpecs) : null,
      ],
    );

    failureStage = "fetch inserted equipment id";
    const [createdRows] = await pool.query("SELECT LAST_INSERT_ID() AS id");
    const equipmentId = createdRows[0]?.id;

    failureStage = "load inserted equipment details";
    const equipment = equipmentId ? await getEquipmentDetails(equipmentId) : null;

    failureStage = "log asset lifecycle";
    await logAssetLifecycle({
      equipmentId,
      eventType: "stock_created",
      eventLabel: "Stock item registered",
      eventNote: `${normalizedEquipmentName} was added to inventory.`,
      toStatus: normalizedStatus,
      relatedRecordType: "equipment",
      relatedRecordId: equipmentId,
    });

    return res.status(201).json({
      message: "Equipment created successfully.",
      equipmentId,
      equipment,
    });
  } catch (error) {
    console.error("Equipment creation failed during", failureStage, error);
    return res.status(500).json({ message: `${failureStage}: ${normalizeError(error)}` });
  }
});

app.put("/api/equipment/:id", async (req, res) => {
  const equipmentId = Number(req.params.id);
  const {
    actorUserId,
    assetTag,
    serialNumber,
    computerName,
    equipmentName,
    categoryId,
    countryId,
    branchId,
    vendorName,
    modelName,
    status,
    purchaseYear,
    purchaseCost,
    purchaseDate,
    locationDetails,
    deviceHealth,
    warrantyEndDate,
    lifespanYears,
    equipmentSpecs,
    stockLocation,
  } = req.body ?? {};

  const normalizedAssetTag = normalizeRequiredText(assetTag, 80);
  const normalizedSerialNumber = normalizeRequiredText(serialNumber, 120);
  const normalizedComputerName = normalizeOptionalText(computerName, 120);
  const normalizedEquipmentName = normalizeRequiredText(equipmentName, 160);
  const normalizedVendorName = normalizeOptionalText(vendorName, 150);
  const normalizedModelName = normalizeOptionalText(modelName, 150);
  const normalizedStatus = normalizeOptionalText(status, 40) || "available";
  const normalizedPurchaseDate = normalizeOptionalText(purchaseDate, 20);
  const normalizedLocationDetails = normalizeOptionalText(locationDetails, 180);
  const normalizedDeviceHealth = normalizeOptionalText(deviceHealth, 80);
  const normalizedWarrantyEndDate = normalizeOptionalText(warrantyEndDate, 20);
  const sanitizedEquipmentSpecs = sanitizeEquipmentSpecs(equipmentSpecs);
  const normalizedStockLocation = normalizeStockLocation(stockLocation);
  const actor = await getUserContext(Number(actorUserId));

  if (!Number.isInteger(equipmentId) || equipmentId <= 0) {
    return res.status(400).json({ message: "A valid equipment id is required." });
  }

  if (!actor || !canManageWarehouseInventory(actor.role_name)) {
    return res.status(403).json({ message: "Only the Warehouse manager can update registered devices." });
  }

  if (!normalizedAssetTag || !normalizedSerialNumber || !normalizedEquipmentName || !categoryId || !countryId || !branchId) {
    return res.status(400).json({ message: "Asset tag, serial number, name, category, country, and branch are required." });
  }

  try {
    const previousEquipment = await getEquipmentDetails(equipmentId);
    await pool.query(
      `
        UPDATE equipment
        SET
          asset_tag = ?,
          serial_number = ?,
          computer_name = ?,
          equipment_name = ?,
          category_id = ?,
          country_id = ?,
          branch_id = ?,
          vendor_name = ?,
          model_name = ?,
          status = ?,
          stock_location = ?,
          purchase_year = ?,
          purchase_date = ?,
          purchase_cost = ?,
          location_details = ?,
          device_health = ?,
          warranty_end_date = ?,
          lifespan_years = ?,
          equipment_specs = ?
        WHERE id = ?
      `,
      [
        normalizedAssetTag,
        normalizedSerialNumber,
        normalizedComputerName,
        normalizedEquipmentName,
        Number(categoryId),
        Number(countryId),
        Number(branchId),
        normalizedVendorName,
        normalizedModelName,
        normalizedStatus,
        normalizedStockLocation,
        Number(purchaseYear) > 0 ? Number(purchaseYear) : null,
        normalizedPurchaseDate,
        normalizeOptionalNumber(purchaseCost, 0) ?? 0,
        normalizedLocationDetails,
        normalizedDeviceHealth,
        normalizedWarrantyEndDate,
        Number(lifespanYears) > 0 ? Number(lifespanYears) : 4,
        sanitizedEquipmentSpecs ? JSON.stringify(sanitizedEquipmentSpecs) : null,
        equipmentId,
      ],
    );

    const equipment = await getEquipmentDetails(equipmentId);
    await logAssetLifecycle({
      equipmentId,
      eventType: "stock_updated",
      eventLabel: "Stock item updated",
      eventNote: `${normalizedEquipmentName} details were updated.`,
      fromStatus: previousEquipment?.status || null,
      toStatus: normalizedStatus,
      relatedRecordType: "equipment",
      relatedRecordId: equipmentId,
    });

    return res.json({
      message: "Equipment updated successfully.",
      equipmentId,
      equipment,
    });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.delete("/api/equipment/:id", async (req, res) => {
  const equipmentId = Number(req.params.id);
  const actor = await getUserContext(Number(req.body?.actorUserId));

  if (!Number.isInteger(equipmentId) || equipmentId <= 0) {
    return res.status(400).json({ message: "A valid equipment id is required." });
  }

  if (!actor || !canManageWarehouseInventory(actor.role_name)) {
    return res.status(403).json({ message: "Only the Warehouse manager can delete registered devices." });
  }

  try {
    const [assignmentRows] = await pool.query(
      "SELECT id FROM assignments WHERE equipment_id = ? AND status = 'active' LIMIT 1",
      [equipmentId],
    );

    if (assignmentRows.length > 0) {
      return res.status(400).json({ message: "Assigned equipment cannot be deleted." });
    }

    await pool.query("DELETE FROM equipment WHERE id = ?", [equipmentId]);
    return res.json({ message: "Equipment deleted successfully." });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.get("/api/workflow/dashboard", async (req, res) => {
  const userId = Number(req.query.userId);

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ message: "A valid user id is required." });
  }

  try {
    const dashboardData = await getWorkflowDashboardData(userId);
    return res.json(dashboardData);
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.get("/api/replacement-insights", async (req, res) => {
  const userId = Number(req.query.userId);

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ message: "A valid user id is required." });
  }

  try {
    const actor = await getUserContext(userId);

    if (!actor) {
      return res.status(404).json({ message: "User not found." });
    }

    const dashboardData = await getWorkflowDashboardData(userId);
    const visibleInsights = applyReplacementScope(actor, dashboardData.replacementInsights || []);

    return res.json({
      generatedAt: new Date().toISOString(),
      total: visibleInsights.length,
      records: visibleInsights,
    });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

function trainLogisticRegressionBinary(examples, { learningRate = 0.08, epochs = 260, l2 = 0.001 } = {}) {
  if (!examples.length) {
    return null;
  }

  const featureNames = examples[0].x.featureNames.slice();
  let weights = new Array(featureNames.length).fill(0);
  let intercept = 0;

  for (let epoch = 0; epoch < epochs; epoch += 1) {
    const gradW = new Array(weights.length).fill(0);
    let gradB = 0;

    for (const ex of examples) {
      const aligned = featureNames.map((name) => {
        const idx = ex.x.featureNames.indexOf(name);
        return idx >= 0 ? ex.x.values[idx] : 0;
      });
      const p = sigmoid(dotProduct(aligned, weights) + intercept);
      const error = p - ex.y;
      for (let i = 0; i < gradW.length; i += 1) {
        gradW[i] += error * aligned[i];
      }
      gradB += error;
    }

    const n = examples.length;
    for (let i = 0; i < weights.length; i += 1) {
      const regularized = gradW[i] / n + l2 * weights[i];
      weights[i] -= learningRate * regularized;
    }
    intercept -= learningRate * (gradB / n);
  }

  const probs = examples.map((ex) => {
    const aligned = featureNames.map((name) => {
      const idx = ex.x.featureNames.indexOf(name);
      return idx >= 0 ? ex.x.values[idx] : 0;
    });
    return sigmoid(dotProduct(aligned, weights) + intercept);
  });
  const avg = probs.reduce((sum, value) => sum + value, 0) / Math.max(probs.length, 1);

  return {
    featureNames,
    weights,
    intercept,
    metrics: {
      samples: examples.length,
      positiveRate: examples.reduce((sum, ex) => sum + ex.y, 0) / Math.max(examples.length, 1),
      avgPred: avg,
    },
  };
}

app.post("/api/ml/replacement/train", async (req, res) => {
  const actorUserId = Number(req.body?.actorUserId);
  if (!Number.isInteger(actorUserId) || actorUserId <= 0) {
    return res.status(400).json({ message: "A valid actor user id is required." });
  }

  try {
    const actor = await getUserContext(actorUserId);
    if (!actor || !["admin", "IT Director"].includes(actor.role_name)) {
      return res.status(403).json({ message: "Only admin or IT Director can train the replacement model." });
    }

    const dashboardData = await getWorkflowDashboardData(actorUserId);
    const equipment = dashboardData.equipment || [];
    const issues = dashboardData.issues || [];
    const returns = dashboardData.returns || [];
    const maintenanceRecords = dashboardData.maintenanceRecords || [];

    const examples = [];

    for (const item of equipment) {
      const maintenanceRows = maintenanceRecords.filter((row) => Number(row.equipment_id) === Number(item.id));
      const returnRows = returns.filter((row) => Number(row.equipment_id) === Number(item.id));
      const issueRows = issues.filter((row) => Number(row.equipment_id) === Number(item.id));

      const hardPositive =
        maintenanceRows.some((row) => row.maintenance_status === "not_repairable") ||
        maintenanceRows.some((row) => normalizeDispositionLabel(row.final_disposition) === 1) ||
        returnRows.some((row) => normalizeDispositionLabel(row.disposition) === 1) ||
        normalizeDispositionLabel(item.status) === 1;

      const hardNegative =
        maintenanceRows.length === 0 &&
        returnRows.length === 0 &&
        normalizeReplacementText(item.status) === "assigned";

      if (!hardPositive && !hardNegative) {
        continue;
      }

      examples.push({
        x: buildReplacementMlFeatures({ equipmentRow: item, maintenanceRows, issueRows, returnRows }),
        y: hardPositive ? 1 : 0,
      });
    }

    if (examples.length < 20) {
      return res.status(400).json({
        message: "Not enough labeled history to train yet. Add more maintenance outcomes / retirement dispositions, then retry.",
        samples: examples.length,
      });
    }

    const trained = trainLogisticRegressionBinary(examples);
    if (!trained) {
      return res.status(500).json({ message: "Training failed." });
    }

    const modelVersion = `v${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "")}`;
    await pool.query(
      `
        INSERT INTO replacement_ml_models (
          model_key,
          model_version,
          feature_names_json,
          weights_json,
          intercept,
          metrics_json,
          created_by_user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        "device_replacement",
        modelVersion,
        JSON.stringify(trained.featureNames),
        JSON.stringify(trained.weights),
        Number(trained.intercept || 0),
        JSON.stringify(trained.metrics || null),
        actorUserId,
      ],
    );

    replacementMlModel = {
      key: "device_replacement",
      version: modelVersion,
      featureNames: trained.featureNames,
      weights: trained.weights,
      intercept: trained.intercept,
      metrics: trained.metrics,
      createdAt: new Date().toISOString(),
    };

    return res.json({
      message: "Replacement ML model trained successfully.",
      model: {
        key: replacementMlModel.key,
        version: replacementMlModel.version,
        metrics: replacementMlModel.metrics,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.post("/api/ml/failure/train", async (req, res) => {
  const actorUserId = Number(req.body?.actorUserId);
  if (!Number.isInteger(actorUserId) || actorUserId <= 0) {
    return res.status(400).json({ message: "A valid actor user id is required." });
  }

  try {
    const actor = await getUserContext(actorUserId);
    if (!actor || !["admin", "IT Director", "it-manager"].includes(actor.role_name)) {
      return res.status(403).json({ message: "Only admin, IT Director, or IT Manager can train the failure model." });
    }

    const examples = await loadIotFailureExamples();
    if (examples.length < 20) {
      return res.status(400).json({ message: "Not enough rows in the IoT dataset to train the model yet.", samples: examples.length });
    }

    await runIotFailureTrainingScript();
    await ensureIotFailureModel();

    if (!iotFailureModel) {
      return res.status(500).json({ message: "Failure model training completed, but the trained model could not be loaded." });
    }

    return res.json({
      message: "Device failure ML model trained successfully.",
      model: {
        key: iotFailureModel.key,
        version: iotFailureModel.version,
        metrics: iotFailureModel.metrics,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.get("/api/ml/failure/predict", async (req, res) => {
  const equipmentId = Number(req.query.equipmentId);
  const actorUserId = Number(req.query.actorUserId);

  if (!Number.isInteger(equipmentId) || equipmentId <= 0) {
    return res.status(400).json({ message: "A valid equipmentId is required." });
  }

  if (!Number.isInteger(actorUserId) || actorUserId <= 0) {
    return res.status(400).json({ message: "A valid actorUserId is required." });
  }

  try {
    const actor = await getUserContext(actorUserId);
    if (!actor) {
      return res.status(404).json({ message: "Actor not found." });
    }

    const dashboardData = await getWorkflowDashboardData(actorUserId);
    const item = (dashboardData.equipment || []).find((row) => Number(row.id) === Number(equipmentId));
    if (!item) {
      return res.status(404).json({ message: "Equipment not found or not visible to this user." });
    }

    const equipmentAssignment = (dashboardData.assignments || []).find((assignment) => Number(assignment.equipment_id) === Number(equipmentId));
    const assignmentHours = equipmentAssignment?.assigned_at
      ? Math.max((Date.now() - new Date(equipmentAssignment.assigned_at).getTime()) / (1000 * 60 * 60), 0)
      : 0;
    const issueCount = (dashboardData.issues || []).filter((issue) => Number(issue.equipment_id) === Number(equipmentId)).length;
    const repairCount = (dashboardData.maintenanceRecords || []).filter((record) => Number(record.equipment_id) === Number(equipmentId)).length;
    const featureVector = buildIotFailureFeatureVectorFromEquipment(item, assignmentHours, issueCount, repairCount);
    const probability = iotFailureModel ? predictReplacementProbability(featureVector, iotFailureModel) : null;

    return res.json({
      equipmentId: item.id,
      probability: typeof probability === "number" ? probability : null,
      recommendation: typeof probability === "number" ? (probability >= 0.65 ? "Review for replacement" : probability >= 0.35 ? "Monitor closely" : "Continue monitoring") : "Model not trained yet",
      modelVersion: iotFailureModel?.version || "untrained",
    });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.get("/api/ml/replacement/predict", async (req, res) => {
  const equipmentId = Number(req.query.equipmentId);
  const actorUserId = Number(req.query.actorUserId);

  if (!Number.isInteger(equipmentId) || equipmentId <= 0) {
    return res.status(400).json({ message: "A valid equipmentId is required." });
  }

  if (!Number.isInteger(actorUserId) || actorUserId <= 0) {
    return res.status(400).json({ message: "A valid actorUserId is required." });
  }

  try {
    const actor = await getUserContext(actorUserId);
    if (!actor) {
      return res.status(404).json({ message: "Actor not found." });
    }

    const dashboardData = await getWorkflowDashboardData(actorUserId);
    const equipment = dashboardData.equipment || [];
    const issues = dashboardData.issues || [];
    const returns = dashboardData.returns || [];
    const maintenanceRecords = dashboardData.maintenanceRecords || [];

    const item = equipment.find((row) => Number(row.id) === Number(equipmentId));
    if (!item) {
      return res.status(404).json({ message: "Equipment not found or not visible to this user." });
    }

    const equipmentMaintenance = maintenanceRecords.filter((row) => Number(row.equipment_id) === Number(item.id));
    const equipmentIssues = issues.filter((row) => Number(row.equipment_id) === Number(item.id));
    const equipmentReturns = returns.filter((row) => Number(row.equipment_id) === Number(item.id));

    const prediction = buildReplacementPrediction(item, equipmentMaintenance, equipmentIssues, equipmentReturns);
    return res.json({
      equipmentId: item.id,
      probability: prediction.ml?.probability ?? 0,
      recommendation: prediction.recommendation,
      modelVersion: prediction.ml?.modelVersion ?? "untrained",
    });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.get("/api/hr/employees", async (req, res) => {
  const userId = Number(req.query.userId);

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ message: "A valid user id is required." });
  }

  try {
    const actor = await getUserContext(userId);

    if (!actor) {
      return res.status(404).json({ message: "HR user not found." });
    }

    let employees = [];
    let source = "hrms";

    if (isHrmsApiConfigured()) {
      try {
        employees = await getHrmsEmployeesForActor(actor);
      } catch (error) {
        if (error?.hrmsUnavailable) {
          logHrmsUnavailableWarningOnce(error);
        } else {
          console.error("HRMS employee fetch failed:", error);
        }
      }
    }

    if (employees.length === 0) {
      employees = await getLocalHrEmployeesForActor(actor);
      source = "ims";
    }

    const hydratedEmployees = [];

    for (const employee of employees) {
      const syncResult = await ensureImsEmployeeForHrmsProfile(employee, { createIfMissing: false });
      hydratedEmployees.push({
        ...employee,
        linked_user_id: syncResult.linkedUserId || employee.linked_user_id || null,
      });
    }

    return res.json({
      employees: hydratedEmployees,
      source,
      message: source === "hrms" ? "Employee records loaded from HRMS." : "HRMS was unavailable, so IMS employee records were used as a fallback.",
    });
  } catch (error) {
    return res.status(error?.statusCode || 500).json({ message: normalizeError(error) });
  }
});

app.post("/api/hrms/sso", async (req, res) => {
  const userId = Number(req.body?.userId);

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ message: "A valid user id is required." });
  }

  try {
    if (!isHrmsApiConfigured()) {
      return res.status(503).json({
        message: "HRMS integration is disabled. Set HRMS_API_BASE_URL in backend/.env and start the HRMS service.",
      });
    }

    const actor = await getUserContext(userId);

    if (!actor) {
      return res.status(404).json({ message: "User not found." });
    }

    const payload = await callHrmsApi("/api/auth/sso", {
      method: "POST",
      actor,
      authorizationHeader: req.headers.authorization || "",
    });

    return res.json({
      message: payload?.message || "HRMS SSO session created successfully.",
      token: payload?.token || "",
      user: payload?.user || null,
      launchUrl: `${hrmsApiBaseUrl.replace(/\/$/, "")}/?ssoToken=${encodeURIComponent(String(payload?.token || ""))}`,
    });
  } catch (error) {
    return res.status(error?.statusCode || 500).json({ message: normalizeError(error) });
  }
});

app.post("/api/hr/employees", async (req, res) => {
  return res.status(403).json({
    message: "HRMS is the source of truth for employee records. Create employees in HRMS only.",
  });
});

app.put("/api/hr/employees/:id", async (req, res) => {
  return res.status(403).json({
    message: "HRMS is the source of truth for employee records. Update employees in HRMS only.",
  });
});

app.post("/api/hr/employees/:id/status", async (req, res) => {
  const hrmsEmployeeId = normalizeOptionalText(req.params.id, 120);
  const { actorUserId, status } = req.body ?? {};
  const normalizedStatus = normalizeOptionalText(status, 20)?.toLowerCase();

  if (!hrmsEmployeeId || !normalizedStatus || !["active", "inactive", "pending"].includes(normalizedStatus)) {
    return res.status(400).json({ message: "A valid HRMS employee id and status are required." });
  }

  try {
    if (!isHrmsApiConfigured()) {
      return res.status(503).json({
        message: "HRMS integration is disabled. Set HRMS_API_BASE_URL in backend/.env and start the HRMS service.",
      });
    }

    const actor = await getUserContext(Number(actorUserId));

    if (!actor) {
      return res.status(404).json({ message: "HR actor not found." });
    }

    const hrmsEmployee = await getHrmsEmployeeProfile(actor, hrmsEmployeeId);

    if (!hrmsEmployee) {
      return res.status(404).json({ message: "HRMS employee was not found." });
    }

    const normalizedEmploymentStatus =
      normalizedStatus === "inactive"
        ? "Inactive"
        : hrmsEmployee.employment_status || (normalizedStatus === "pending" ? "Pending" : "Active");

    await callHrmsApi(buildHrmsEmployeeByIdPath(hrmsEmployee.id), {
      method: "PUT",
      actor,
      body: {
        firstName: normalizeRequiredText(hrmsEmployee.first_name, 40),
        lastName: normalizeRequiredText(hrmsEmployee.last_name, 40),
        email: hrmsEmployee.email,
        phoneNumber: normalizeOptionalText(hrmsEmployee.phone_number, 13),
        employeeCode: normalizeOptionalText(hrmsEmployee.employee_code, 40),
        hrmsEmployeeId: normalizeOptionalText(hrmsEmployee.hrms_employee_id, 40),
        employeeGrade: normalizeOptionalText(hrmsEmployee.employee_grade, 40),
        jobTitle: hrmsEmployee.job_title || null,
        employmentStatus: normalizedEmploymentStatus,
        officeLocation: hrmsEmployee.office_location || null,
        startDate: hrmsEmployee.start_date || null,
        departmentId: hrmsEmployee.department_id || null,
        departmentName: normalizeOptionalText(hrmsEmployee.department_name, 40),
        imsUserId: hrmsEmployee.linked_user_id ? Number(hrmsEmployee.linked_user_id) : null,
        imsAccountStatus: normalizedStatus,
        status: normalizedStatus,
      },
    });

    if (hrmsEmployee.linked_user_id) {
      await pool.query(
        `
          UPDATE users
          SET
            status = ?,
            employment_status = ?
          WHERE id = ?
        `,
        [normalizedStatus, normalizedEmploymentStatus, Number(hrmsEmployee.linked_user_id)],
      );
    }

    await writeAuditLog({
      actorUserId: Number(actorUserId) || null,
      targetUserId: hrmsEmployee.linked_user_id ? Number(hrmsEmployee.linked_user_id) : null,
      actionKey: "hr.employee.status",
      actionLabel: "HR updated employee status",
      details: `${hrmsEmployee.full_name || `${hrmsEmployee.first_name} ${hrmsEmployee.last_name}`.trim() || hrmsEmployee.email} was marked ${normalizedStatus}.`,
    });

    return res.json({
      message: `Employee marked ${normalizedStatus}.`,
    });
  } catch (error) {
    return res.status(error?.statusCode || 500).json({ message: normalizeError(error) });
  }
});

app.post("/api/ai/chat", async (req, res) => {
  const userId = Number(req.body?.userId);
  const message = String(req.body?.message || "").trim();

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ message: "A valid user id is required." });
  }

  if (!message) {
    return res.status(400).json({ message: "A message is required." });
  }

  try {
    const user = await getUserContext(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const result = await generateChatbotResponse(user, message);

    return res.json({
      ...result,
      mode: "advisory",
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.post("/api/requests", async (req, res) => {
  const {
    requesterId,
    categoryId,
    notes,
    requestType = "standard",
    hrmsEmployeeRecordId = null,
    targetEmployeeUserId = null,
    expectedDeviceSpecs = null,
    sourceRequestId = null,
    sourceEquipmentId = null,
    reportType = null,
    requestDate = null,
  } = req.body ?? {};

  const normalizedNotes = normalizeOptionalText(notes, 2000);
  const normalizedRequestType = normalizeOptionalText(requestType, 40) || "standard";
  const normalizedReportType = normalizeOptionalText(reportType, 40);
  const normalizedExpectedDeviceSpecs = normalizeOptionalText(expectedDeviceSpecs, 500);
  const normalizedHrmsEmployeeRecordId = normalizeOptionalText(hrmsEmployeeRecordId, 120);

  if (!requesterId || !categoryId) {
    return res.status(400).json({ message: "Requester and category are required." });
  }

  try {
    const todayDate = new Date().toISOString().slice(0, 10);
    const normalizedRequestDate = String(requestDate || todayDate).slice(0, 10);

    if (normalizedRequestDate !== todayDate) {
      return res.status(400).json({ message: "Request date must be today's date." });
    }

    const requester = await getUserContext(Number(requesterId));

    if (!requester) {
      return res.status(404).json({ message: "Requester was not found." });
    }

    const directoryEmployeeMatch = normalizedHrmsEmployeeRecordId
      ? await resolveEmployeeDirectoryRecord(requester, normalizedHrmsEmployeeRecordId)
      : null;
    const hrmsEmployee = directoryEmployeeMatch?.source === "hrms" ? directoryEmployeeMatch.employee : null;
    const localDirectoryEmployee = directoryEmployeeMatch?.source === "ims" ? directoryEmployeeMatch.employee : null;
    const syncResult = hrmsEmployee ? await ensureImsEmployeeForHrmsProfile(hrmsEmployee, { sendWelcomeEmail: true }) : { linkedUserId: null };
    if (hrmsEmployee && syncResult.linkedUserId) {
      await syncHrmsEmployeeLink(requester, hrmsEmployee, syncResult.linkedUserId, "active");
    }
    const effectiveTargetEmployeeUserId =
      syncResult.linkedUserId ||
      (localDirectoryEmployee?.linked_user_id ? Number(localDirectoryEmployee.linked_user_id) : null) ||
      (targetEmployeeUserId ? Number(targetEmployeeUserId) : null);
    const targetEmployee = effectiveTargetEmployeeUserId ? await getUserContext(effectiveTargetEmployeeUserId) : null;

    if (targetEmployeeUserId && !targetEmployee) {
      return res.status(404).json({ message: "Target employee was not found." });
    }

    if (normalizedHrmsEmployeeRecordId && !directoryEmployeeMatch) {
      return res.status(404).json({ message: "The selected employee record was not found in HRMS or IMS." });
    }

    const snapshotUser = hrmsEmployee ?? localDirectoryEmployee ?? targetEmployee ?? requester;
    const categoryName = await getCategoryNameById(categoryId);

    const hrmsSnapshot = {
      requesterId: requester.id,
      hrmsEmployeeRecordId: hrmsEmployee?.id || localDirectoryEmployee?.id || normalizedHrmsEmployeeRecordId || null,
      targetEmployeeUserId: targetEmployee?.id || null,
      employeeCode: snapshotUser.employee_code || null,
      employeeName: `${snapshotUser.first_name || ""} ${snapshotUser.last_name || ""}`.trim() || null,
      employeeEmail: snapshotUser.email || null,
      roleName: snapshotUser.role_name || "employee",
      departmentName: hrmsEmployee?.department_name || null,
      employeeGrade: snapshotUser.employee_grade || null,
      hrmsEmployeeId: snapshotUser.hrms_employee_id || null,
      jobTitle: snapshotUser.job_title || null,
      employmentStatus: snapshotUser.employment_status || null,
      officeLocation: snapshotUser.office_location || null,
      startDate: snapshotUser.start_date || null,
      linkedImsUserId: syncResult.linkedUserId || targetEmployee?.id || null,
      source: directoryEmployeeMatch?.source || (hrmsEmployee ? "hrms" : localDirectoryEmployee ? "ims" : "requester"),
      protectedIdentifiers: {
        hrmsEmployeeRecordId: buildProtectedIdentifierBundle(hrmsEmployee?.id || localDirectoryEmployee?.id || normalizedHrmsEmployeeRecordId || null),
        employeeCode: buildProtectedIdentifierBundle(snapshotUser.employee_code || null),
        hrmsEmployeeId: buildProtectedIdentifierBundle(snapshotUser.hrms_employee_id || null),
        linkedImsUserId: buildProtectedIdentifierBundle(syncResult.linkedUserId || targetEmployee?.id || null),
      },
      expectedDeviceSpecs: normalizedExpectedDeviceSpecs,
      recommendedDeviceProfile: buildRecommendedDeviceProfile({
        categoryName,
        employeeGrade: snapshotUser.employee_grade,
        jobTitle: snapshotUser.job_title,
        requestType: normalizedRequestType,
      }),
    };

    const [result] = await pool.query(
      `
        INSERT INTO requests (
          requester_id,
          category_id,
          approver_id,
          request_status,
          notes,
          request_type,
          target_employee_user_id,
          source_request_id,
          source_equipment_id,
          report_type,
          hrms_snapshot,
          created_at
        )
        VALUES (?, ?, NULL, 'pending', ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        Number(requesterId),
        Number(categoryId),
        normalizedNotes,
        normalizedRequestType,
        effectiveTargetEmployeeUserId,
        sourceRequestId ? Number(sourceRequestId) : null,
        sourceEquipmentId ? Number(sourceEquipmentId) : null,
        normalizedReportType,
        JSON.stringify(hrmsSnapshot),
        `${normalizedRequestDate} ${new Date().toTimeString().slice(0, 8)}`,
      ],
    );

    await createWorkflowStepsForRequest(result.insertId, requester, normalizedRequestType, effectiveTargetEmployeeUserId);

    if (normalizedRequestType === "loss_theft" && sourceEquipmentId) {
      const sourceEquipment = await getEquipmentDetails(Number(sourceEquipmentId));
      if (sourceEquipment) {
        await pool.query(
          "UPDATE equipment SET status = 'lost' WHERE id = ?",
          [Number(sourceEquipmentId)],
        );
        await pool.query(
          `
            INSERT INTO loss_theft_reports (
              equipment_id,
              employee_user_id,
              report_type,
              incident_note,
              created_request_id
            )
            VALUES (?, ?, ?, ?, ?)
          `,
          [Number(sourceEquipmentId), Number(requesterId), normalizedReportType || "loss", normalizedNotes, result.insertId],
        );
        await logAssetLifecycle({
          equipmentId: Number(sourceEquipmentId),
          actorUserId: Number(requesterId),
          eventType: "loss_theft_declared",
          eventLabel: "Loss or theft declared",
          eventNote: normalizedNotes || `${normalizedReportType || "loss"} reported through replacement workflow.`,
          fromStatus: sourceEquipment.status,
          toStatus: "lost",
          relatedRecordType: "request",
          relatedRecordId: result.insertId,
        });
      }
    }

    const [firstStepRows] = await pool.query(
      `
        SELECT actor_user_id, step_label
        FROM request_workflow_steps
        WHERE request_id = ?
          AND action_status = 'pending'
        ORDER BY id ASC
        LIMIT 1
      `,
      [result.insertId],
    );

    await createNotification(
      requester.id,
      "Request submitted",
      `${getRequestTypeLabel(requestType)} request has entered the approval workflow.`,
    );

    if (targetEmployee?.id && targetEmployee.id !== requester.id) {
      await createNotification(
        targetEmployee.id,
        "Equipment request created for you",
        `${requester.first_name} ${requester.last_name} created a ${getRequestTypeLabel(requestType).toLowerCase()} for you.`,
      );
    }

    const requestContext = await getRequestNotificationContext(result.insertId);

    if (firstStepRows.length > 0) {
      const requestTypeLabel = getRequestTypeLabel(requestType);
      const employeeLabel = requestContext?.target_employee_name || `${requester.first_name} ${requester.last_name}`;
      const isLossTheftRequest = requestType === "loss_theft";
      await createNotification(
        firstStepRows[0].actor_user_id,
        "Request awaiting action",
        `${requester.first_name} ${requester.last_name} submitted a request that needs ${firstStepRows[0].step_label}.`,
      );

      const nextActor = await getUserById(firstStepRows[0].actor_user_id);

      if (nextActor?.email) {
        await trySendRequestLifecycleEmail({
          to: nextActor.email,
          subject: isLossTheftRequest ? "Airtel IMS loss or theft declaration awaiting review" : "Airtel IMS request awaiting review",
          headline: isLossTheftRequest ? "A loss or theft declaration requires your action" : "A request requires your action",
          intro: isLossTheftRequest
            ? `${requester.first_name} ${requester.last_name} submitted a loss or theft declaration that now requires ${firstStepRows[0].step_label}.`
            : `${requester.first_name} ${requester.last_name} submitted a ${requestTypeLabel.toLowerCase()} that now requires ${firstStepRows[0].step_label}.`,
          details: [
            `Request type: ${requestTypeLabel}`,
            `Requested category: ${requestContext?.category_name || "Equipment request"}`,
            `Employee: ${employeeLabel}`,
          ],
          closing: isLossTheftRequest
            ? "Please sign in to Airtel IMS to review the declaration and take the next action."
            : "Please sign in to Airtel IMS to review the request and record your decision.",
        });
      }
    }

    const requestTypeLabel = getRequestTypeLabel(requestType);
    const isLossTheftRequest = requestType === "loss_theft";

    if (requester.email) {
      await trySendRequestLifecycleEmail({
        to: requester.email,
        subject: isLossTheftRequest ? "Airtel IMS loss or theft declaration submitted" : "Airtel IMS request submitted",
        headline: isLossTheftRequest ? "Your incident declaration has been submitted" : "Your request has been submitted",
        intro: isLossTheftRequest
          ? "Your device loss or theft declaration has been recorded and sent for review."
          : `Your ${requestTypeLabel.toLowerCase()} has entered the approval workflow.`,
        details: [
          `Request type: ${requestTypeLabel}`,
          `Requested category: ${requestContext?.category_name || "Requested equipment"}`,
          `Branch: ${requestContext?.branch_name || requestContext?.country_name || "Not assigned"}`,
        ],
        closing: isLossTheftRequest
          ? "You will receive further updates by email as the declaration is reviewed and processed."
          : "You will receive further email updates as the request moves through review, rejection, or fulfillment.",
      });
    }

    if (targetEmployee?.email && targetEmployee.id !== requester.id) {
      await trySendRequestLifecycleEmail({
        to: targetEmployee.email,
        subject: isLossTheftRequest ? "Airtel IMS incident declaration created for you" : "Airtel IMS equipment request created for you",
        headline: isLossTheftRequest ? "An incident declaration was created on your behalf" : "An equipment request was created on your behalf",
        intro: isLossTheftRequest
          ? `${requester.first_name} ${requester.last_name} submitted a loss or theft declaration on your behalf.`
          : `${requester.first_name} ${requester.last_name} submitted a ${requestTypeLabel.toLowerCase()} for you.`,
        details: [
          `Request type: ${requestTypeLabel}`,
          `Requested category: ${requestContext?.category_name || "Requested equipment"}`,
          `Branch: ${requestContext?.branch_name || requestContext?.country_name || "Not assigned"}`,
        ],
        closing: isLossTheftRequest
          ? "You can sign in to Airtel IMS to review the declaration and track its progress."
          : "You can sign in to Airtel IMS to track the progress of this request.",
      });
    }

    return res.status(201).json({ message: "Equipment request submitted successfully." });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.post("/api/requests/:id/approve", async (req, res) => {
  const requestId = Number(req.params.id);
  const { actorUserId, note, equipmentId } = req.body ?? {};

  if (!Number.isInteger(requestId) || requestId <= 0 || !actorUserId) {
    return res.status(400).json({ message: "Request id and actor user are required." });
  }

  try {
    const actor = await getUserContext(Number(actorUserId));

    if (!actor) {
      return res.status(404).json({ message: "Approver was not found." });
    }

    const [requestRows] = await pool.query(
      "SELECT id, requester_id, request_status, request_type, category_id, booked_equipment_id, fulfillment_status FROM requests WHERE id = ? LIMIT 1",
      [requestId],
    );

    if (requestRows.length === 0) {
      return res.status(404).json({ message: "Request was not found." });
    }

    if (requestRows[0].request_status === "rejected" || requestRows[0].request_status === "fulfilled") {
      return res.status(400).json({ message: "This request is already closed." });
    }

    const [stepRows] = await pool.query(
      `
        SELECT id, step_key, step_label, actor_role, actor_user_id
        FROM request_workflow_steps
        WHERE request_id = ? AND action_status = 'pending'
        ORDER BY id ASC
        LIMIT 1
      `,
      [requestId],
    );

    if (stepRows.length === 0) {
      return res.status(400).json({ message: "There is no pending approval step left." });
    }

    const currentStep = stepRows[0];

    if (currentStep.actor_role !== actor.role_name) {
      return res.status(403).json({ message: "This user cannot approve the current workflow step." });
    }

    let approvedEquipmentId = null;
    const selectedEquipmentId = equipmentId ? Number(equipmentId) : null;

    if (currentStep.step_key === "it_inventory_review" && selectedEquipmentId) {
      const [equipmentRows] = await pool.query(
        `
          SELECT id, category_id, status
          FROM equipment
          WHERE id = ?
          LIMIT 1
        `,
        [selectedEquipmentId],
      );

      if (equipmentRows.length === 0) {
        return res.status(404).json({ message: "Selected equipment was not found." });
      }

      const equipmentRecord = equipmentRows[0];

      if (equipmentRecord.status !== "available") {
        return res.status(400).json({ message: "Selected equipment is not currently available." });
      }

      if (equipmentRecord.category_id !== requestRows[0].category_id) {
        return res.status(400).json({ message: "Selected equipment does not match the requested category." });
      }

      const [conflictingBookingRows] = await pool.query(
        `
          SELECT id
          FROM requests
          WHERE booked_equipment_id = ?
            AND id <> ?
            AND request_status NOT IN ('fulfilled', 'rejected')
          LIMIT 1
        `,
        [selectedEquipmentId, requestId],
      );

      if (conflictingBookingRows.length > 0) {
        return res.status(400).json({ message: "Selected equipment is already reserved for another request." });
      }

      approvedEquipmentId = selectedEquipmentId;
    }

    await pool.query(
      `
        UPDATE request_workflow_steps
        SET actor_user_id = ?, action_status = 'approved', action_note = ?, acted_at = NOW()
        WHERE id = ?
      `,
      [actor.id, note || null, currentStep.id],
    );

    const [nextStepRows] = await pool.query(
      `
        SELECT actor_user_id, step_key, step_label
        FROM request_workflow_steps
        WHERE request_id = ? AND action_status = 'pending'
        ORDER BY id ASC
        LIMIT 1
      `,
      [requestId],
    );

    const nextStatus = nextStepRows.length === 0 || nextStepRows[0].step_key === "store_fulfillment"
      ? "approved"
      : "pending";

    await pool.query(
      `
        UPDATE requests
        SET
          approver_id = ?,
          request_status = ?,
          booked_equipment_id = COALESCE(?, booked_equipment_id),
          fulfillment_status = CASE
            WHEN ? IS NOT NULL THEN 'ready'
            ELSE fulfillment_status
          END,
          fulfillment_note = CASE
            WHEN ? IS NOT NULL THEN COALESCE(?, fulfillment_note)
            ELSE fulfillment_note
          END,
          fulfillment_updated_at = CASE
            WHEN ? IS NOT NULL THEN NOW()
            ELSE fulfillment_updated_at
          END,
          final_security_approval_status = CASE WHEN ? = 'security_review' THEN 'approved' ELSE final_security_approval_status END,
          final_security_approved_at = CASE WHEN ? = 'security_review' THEN NOW() ELSE final_security_approved_at END,
          final_security_approved_by = CASE WHEN ? = 'security_review' THEN ? ELSE final_security_approved_by END
        WHERE id = ?
      `,
      [
        actor.id,
        nextStatus,
        approvedEquipmentId,
        approvedEquipmentId,
        approvedEquipmentId,
        approvedEquipmentId ? `Equipment reserved during IT inventory review.${note ? ` ${note}` : ""}` : null,
        approvedEquipmentId,
        currentStep.step_key,
        currentStep.step_key,
        currentStep.step_key,
        actor.id,
        requestId,
      ],
    );

    await createNotification(
      requestRows[0].requester_id,
      "Request updated",
      `${currentStep.step_label} was approved.`,
    );

    if (nextStepRows.length > 0) {
      await createNotification(
        nextStepRows[0].actor_user_id,
        "Request awaiting action",
        `A request is waiting for ${nextStepRows[0].step_label}.`,
      );

      const nextActor = await getUserById(nextStepRows[0].actor_user_id);
      const requestContext = await getRequestNotificationContext(requestId);

      if (nextActor?.email) {
        await trySendRequestLifecycleEmail({
          to: nextActor.email,
          subject: "Airtel IMS request moved to your step",
          headline: "A request needs your review",
          intro: `${currentStep.step_label} has been completed and the request now needs ${nextStepRows[0].step_label}.`,
          details: [
            `Request type: ${getRequestTypeLabel(requestRows[0].request_type)}`,
            `Requester: ${requestContext?.requester_name || "Employee"}`,
            `Requested category: ${requestContext?.category_name || "Equipment request"}`,
          ],
          closing: "Please sign in to Airtel IMS and take the next approval action.",
        });
      }
    }

    const requester = await getUserById(requestRows[0].requester_id);
    const requestContext = await getRequestNotificationContext(requestId);

    if (requester?.email) {
      await trySendRequestLifecycleEmail({
        to: requester.email,
        subject: "Airtel IMS request update",
        headline: "Your request moved forward",
        intro: `${currentStep.step_label} approved your request.`,
        details: [
          `Request type: ${getRequestTypeLabel(requestRows[0].request_type)}`,
          `Requested category: ${requestContext?.category_name || "Equipment request"}`,
          `Current status: ${nextStatus}`,
        ],
        closing: nextStepRows.length > 0 ? `The request is now waiting for ${nextStepRows[0].step_label}.` : "Your request is now waiting for fulfillment.",
      });
    }

    const updatedRequest = await getWorkflowRequestById(requestId);

    return res.json({
      message: `${currentStep.step_label} completed successfully.`,
      request: updatedRequest,
    });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.post("/api/requests/:id/reject", async (req, res) => {
  const requestId = Number(req.params.id);
  const { actorUserId, note } = req.body ?? {};
  const rejectionReason = String(note || "").trim();

  if (!Number.isInteger(requestId) || requestId <= 0 || !actorUserId) {
    return res.status(400).json({ message: "Request id and actor user are required." });
  }

  if (!rejectionReason) {
    return res.status(400).json({ message: "A rejection reason is required." });
  }

  try {
    const actor = await getUserContext(Number(actorUserId));

    if (!actor) {
      return res.status(404).json({ message: "Reviewer was not found." });
    }

    const [requestRows] = await pool.query(
      "SELECT id, requester_id FROM requests WHERE id = ? LIMIT 1",
      [requestId],
    );

    if (requestRows.length === 0) {
      return res.status(404).json({ message: "Request was not found." });
    }

    const [stepRows] = await pool.query(
      `
        SELECT id, step_label, actor_role
        FROM request_workflow_steps
        WHERE request_id = ? AND action_status = 'pending'
        ORDER BY id ASC
        LIMIT 1
      `,
      [requestId],
    );

    if (stepRows.length === 0) {
      return res.status(400).json({ message: "There is no pending workflow step to reject." });
    }

    const currentStep = stepRows[0];

    if (currentStep.actor_role !== actor.role_name) {
      return res.status(403).json({ message: "This user cannot reject the current workflow step." });
    }

    await pool.query(
      `
        UPDATE request_workflow_steps
        SET action_status = 'rejected', actor_user_id = ?, action_note = ?, acted_at = NOW()
        WHERE id = ?
      `,
      [actor.id, rejectionReason, currentStep.id],
    );

    await pool.query(
      "UPDATE requests SET approver_id = ?, request_status = 'rejected', notes = ? WHERE id = ?",
      [actor.id, rejectionReason, requestId],
    );

    await createNotification(
      requestRows[0].requester_id,
      "Request rejected",
      `${currentStep.step_label} rejected your request. Reason: ${rejectionReason}`,
    );

    const requester = await getUserById(requestRows[0].requester_id);
    const requestContext = await getRequestNotificationContext(requestId);

    if (requester?.email) {
      await trySendRequestLifecycleEmail({
        to: requester.email,
        subject: "Airtel IMS request rejected",
        headline: "Your request was rejected",
        intro: `${currentStep.step_label} rejected your equipment request.`,
        details: [
          `Requested category: ${requestContext?.category_name || "Equipment request"}`,
          `Reason: ${rejectionReason}`,
        ],
        closing: "Please sign in to Airtel IMS if you need to review the notes or submit a new request.",
      });
    }

    const updatedRequest = await getWorkflowRequestById(requestId);

    return res.json({
      message: "Request rejected successfully.",
      request: updatedRequest,
    });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.post("/api/requests/:id/keep-device", async (req, res) => {
  const requestId = Number(req.params.id);
  const { actorUserId, note } = req.body ?? {};
  const actionNote = String(note || "").trim() || null;

  if (!Number.isInteger(requestId) || requestId <= 0 || !actorUserId) {
    return res.status(400).json({ message: "Request id and actor user are required." });
  }

  try {
    const actor = await getUserContext(Number(actorUserId));

    if (!actor) {
      return res.status(404).json({ message: "Reviewer was not found." });
    }

    const [requestRows] = await pool.query(
      "SELECT id, requester_id, request_type, request_status FROM requests WHERE id = ? LIMIT 1",
      [requestId],
    );

    if (requestRows.length === 0) {
      return res.status(404).json({ message: "Request was not found." });
    }

    const requestRecord = requestRows[0];

    if (requestRecord.request_type !== "replacement") {
      return res.status(400).json({ message: "Keep device is only available for replacement requests." });
    }

    if (requestRecord.request_status === "rejected" || requestRecord.request_status === "fulfilled") {
      return res.status(400).json({ message: "This request is already closed." });
    }

    const [stepRows] = await pool.query(
      `
        SELECT id, step_key, step_label, actor_role
        FROM request_workflow_steps
        WHERE request_id = ? AND action_status = 'pending'
        ORDER BY id ASC
        LIMIT 1
      `,
      [requestId],
    );

    if (stepRows.length === 0) {
      return res.status(400).json({ message: "There is no pending workflow step left." });
    }

    const currentStep = stepRows[0];

    if (currentStep.actor_role !== actor.role_name) {
      return res.status(403).json({ message: "This user cannot approve the current workflow step." });
    }

    if (currentStep.step_key !== "hr_replacement_booking") {
      return res.status(400).json({ message: "Keep device is only allowed during HR replacement booking." });
    }

    await pool.query(
      `
        UPDATE request_workflow_steps
        SET actor_user_id = ?, action_status = 'approved', action_note = ?, acted_at = NOW()
        WHERE id = ?
      `,
      [actor.id, actionNote, currentStep.id],
    );

    await pool.query(
      `
        UPDATE request_workflow_steps
        SET action_status = 'fulfilled', actor_user_id = ?, action_note = ?, acted_at = NOW()
        WHERE request_id = ? AND action_status = 'pending'
      `,
      [actor.id, "Skipped because device was kept in service.", requestId],
    );

    await pool.query(
      `
        UPDATE requests
        SET
          approver_id = ?,
          request_status = 'fulfilled',
          fulfillment_status = 'kept_in_service',
          fulfillment_note = COALESCE(?, fulfillment_note),
          fulfillment_updated_at = NOW()
        WHERE id = ?
      `,
      [
        actor.id,
        actionNote ? `No replacement required. ${actionNote}` : "No replacement required.",
        requestId,
      ],
    );

    await createNotification(
      requestRecord.requester_id,
      "Request kept in service",
      `${currentStep.step_label} marked the request to keep the existing device in service.`,
    );

    const requester = await getUserById(requestRecord.requester_id);
    const requestContext = await getRequestNotificationContext(requestId);

    if (requester?.email) {
      await trySendRequestLifecycleEmail({
        to: requester.email,
        subject: "Airtel IMS request completed: keep existing device",
        headline: "Your replacement request was completed without a new device.",
        intro: `${currentStep.step_label} closed your request and confirmed that the current device can stay in service.`,
        details: [
          `Request type: ${getRequestTypeLabel(requestRecord.request_type)}`,
          `Requested category: ${requestContext?.category_name || "Equipment request"}`,
          actionNote ? `Notes: ${actionNote}` : "No additional notes provided.",
        ].filter(Boolean),
        closing: "You can sign in to Airtel IMS to view the request details.",
      });
    }

    const updatedRequest = await getWorkflowRequestById(requestId);

    return res.json({
      message: "Request marked to keep the device in service.",
      request: updatedRequest,
    });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.post("/api/requests/:id/return", async (req, res) => {
  const requestId = Number(req.params.id);
  const { actorUserId, note } = req.body ?? {};
  const clarificationReason = String(note || "").trim();

  if (!Number.isInteger(requestId) || requestId <= 0 || !actorUserId) {
    return res.status(400).json({ message: "Request id and actor user are required." });
  }

  if (!clarificationReason) {
    return res.status(400).json({ message: "A clarification note is required before returning a request." });
  }

  try {
    const actor = await getUserContext(Number(actorUserId));

    if (!actor) {
      return res.status(404).json({ message: "Reviewer was not found." });
    }

    const [requestRows] = await pool.query(
      "SELECT id, requester_id, request_status FROM requests WHERE id = ? LIMIT 1",
      [requestId],
    );

    if (requestRows.length === 0) {
      return res.status(404).json({ message: "Request was not found." });
    }

    const requestRecord = requestRows[0];

    if (["rejected", "fulfilled"].includes(requestRecord.request_status)) {
      return res.status(400).json({ message: "Closed requests cannot be returned for clarification." });
    }

    const [stepRows] = await pool.query(
      `
        SELECT id, step_label, actor_role
        FROM request_workflow_steps
        WHERE request_id = ? AND action_status = 'pending'
        ORDER BY id ASC
        LIMIT 1
      `,
      [requestId],
    );

    if (stepRows.length === 0) {
      return res.status(400).json({ message: "There is no pending workflow step to return." });
    }

    const currentStep = stepRows[0];

    if (currentStep.actor_role !== actor.role_name) {
      return res.status(403).json({ message: "This user cannot return the current workflow step." });
    }

    await pool.query(
      `
        UPDATE request_workflow_steps
        SET action_status = 'returned', actor_user_id = ?, action_note = ?, acted_at = NOW()
        WHERE id = ?
      `,
      [actor.id, clarificationReason, currentStep.id],
    );

    await pool.query(
      `
        UPDATE requests
        SET
          request_status = 'pending',
          clarification_status = 'needed',
          clarification_note = ?,
          clarification_requested_by = ?,
          clarification_requested_at = NOW(),
          clarification_target_user_id = requester_id,
          clarification_target_role = 'requester',
          fulfillment_status = CASE WHEN fulfillment_status = 'ready' THEN 'on_hold' ELSE fulfillment_status END,
          fulfillment_note = CASE
            WHEN ? IS NULL OR ? = '' THEN fulfillment_note
            ELSE ?
          END
        WHERE id = ?
      `,
      [clarificationReason, actor.id, clarificationReason, clarificationReason, `Clarification requested: ${clarificationReason}`, requestId],
    );

    await createNotification(
      requestRecord.requester_id,
      "Request returned for clarification",
      `${currentStep.step_label} returned your request and needs more information: ${clarificationReason}`,
    );

    const requester = await getUserById(requestRecord.requester_id);
    const requestContext = await getRequestNotificationContext(requestId);

    if (requester?.email) {
      await trySendRequestLifecycleEmail({
        to: requester.email,
        subject: "Airtel IMS request returned for clarification",
        headline: "Your request needs more detail",
        intro: `${currentStep.step_label} returned your request so you can clarify the information provided.`,
        details: [
          `Requested category: ${requestContext?.category_name || "Equipment request"}`,
          `Reason: ${clarificationReason}`,
        ],
        closing: "Please sign in to Airtel IMS, update the request details, and resubmit it.",
      });
    }

    const updatedRequest = await getWorkflowRequestById(requestId);

    return res.json({
      message: "Request returned for clarification.",
      request: updatedRequest,
    });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.put("/api/requests/:id", async (req, res) => {
  const requestId = Number(req.params.id);
  const {
    requesterId,
    categoryId,
    notes,
    requestType = "standard",
    hrmsEmployeeRecordId = null,
    targetEmployeeUserId = null,
    expectedDeviceSpecs = null,
    sourceEquipmentId = null,
    reportType = null,
  } = req.body ?? {};

  const normalizedNotes = normalizeOptionalText(notes, 2000);
  const normalizedRequestType = normalizeOptionalText(requestType, 40) || "standard";
  const normalizedReportType = normalizeOptionalText(reportType, 40);
  const normalizedExpectedDeviceSpecs = normalizeOptionalText(expectedDeviceSpecs, 500);
  const normalizedHrmsEmployeeRecordId = normalizeOptionalText(hrmsEmployeeRecordId, 120);

  if (!Number.isInteger(requestId) || requestId <= 0 || !requesterId || !categoryId) {
    return res.status(400).json({ message: "Request id, requester, and category are required." });
  }

  try {
    const [requestRows] = await pool.query(
      `
        SELECT id, requester_id, request_status, clarification_status, clarification_target_user_id
        FROM requests
        WHERE id = ?
        LIMIT 1
      `,
      [requestId],
    );

    if (requestRows.length === 0) {
      return res.status(404).json({ message: "Request was not found." });
    }

    const requestRecord = requestRows[0];

    const requester = await getUserById(Number(requesterId));
    const hrmsEmployee = normalizedHrmsEmployeeRecordId ? await getHrmsEmployeeProfile(requester, normalizedHrmsEmployeeRecordId) : null;
    const syncResult = hrmsEmployee ? await ensureImsEmployeeForHrmsProfile(hrmsEmployee) : { linkedUserId: null };
    if (hrmsEmployee && syncResult.linkedUserId) {
      await syncHrmsEmployeeLink(requester, hrmsEmployee, syncResult.linkedUserId, "active");
    }
    const effectiveTargetEmployeeUserId = syncResult.linkedUserId || (targetEmployeeUserId ? Number(targetEmployeeUserId) : null);
    const targetEmployee = effectiveTargetEmployeeUserId ? await getUserById(effectiveTargetEmployeeUserId) : null;

    if (targetEmployeeUserId && !targetEmployee) {
      return res.status(404).json({ message: "Target employee was not found." });
    }

    if (normalizedHrmsEmployeeRecordId && !hrmsEmployee) {
      return res.status(404).json({ message: "HRMS employee was not found." });
    }

    const snapshotUser = hrmsEmployee ?? targetEmployee ?? requester;
    const categoryName = await getCategoryNameById(categoryId);

    if (
      requestRecord.requester_id !== Number(requesterId) &&
      !(requestRecord.clarification_status === "needed" && requestRecord.clarification_target_user_id === Number(requesterId))
    ) {
      return res.status(403).json({ message: "Only the requester can update this request." });
    }

    if (requestRecord.request_status !== "pending") {
      return res.status(400).json({ message: "Only pending requests can be updated." });
    }

    const [stepRows] = await pool.query(
      `
        SELECT step_key, action_status
        FROM request_workflow_steps
        WHERE request_id = ?
        ORDER BY id ASC
      `,
      [requestId],
    );

    const hasStartedReview =
      requestRecord.clarification_status === "needed"
        ? false
        : stepRows.some((step) => step.action_status !== "pending");

    if (hasStartedReview) {
      return res.status(400).json({ message: "This request is already under review and can no longer be edited." });
    }

    await pool.query(
      `
        UPDATE requests
        SET
          category_id = ?,
          notes = ?,
          request_type = ?,
          target_employee_user_id = ?,
          source_equipment_id = ?,
          report_type = ?,
          hrms_snapshot = ?,
          clarification_status = 'none',
          clarification_note = NULL,
          clarification_requested_by = NULL,
          clarification_requested_at = NULL,
          clarification_target_user_id = NULL,
          clarification_target_role = NULL,
          fulfillment_status = CASE WHEN fulfillment_status = 'on_hold' THEN 'ready' ELSE fulfillment_status END
        WHERE id = ?
      `,
      [
        Number(categoryId),
        normalizedNotes,
        normalizedRequestType,
        effectiveTargetEmployeeUserId,
        sourceEquipmentId ? Number(sourceEquipmentId) : null,
        normalizedReportType,
        JSON.stringify({
          requesterId: Number(requesterId),
          hrmsEmployeeRecordId: hrmsEmployee?.id || normalizedHrmsEmployeeRecordId || null,
          targetEmployeeUserId: targetEmployee?.id || null,
          employeeCode: snapshotUser?.employee_code || null,
          employeeName: snapshotUser ? `${snapshotUser.first_name || ""} ${snapshotUser.last_name || ""}`.trim() || null : null,
          employeeEmail: snapshotUser?.email || null,
          roleName: snapshotUser?.role_name || "employee",
          departmentName: hrmsEmployee?.department_name || null,
          employeeGrade: snapshotUser?.employee_grade || null,
          hrmsEmployeeId: snapshotUser?.hrms_employee_id || null,
          jobTitle: snapshotUser?.job_title || null,
          employmentStatus: snapshotUser?.employment_status || null,
          officeLocation: snapshotUser?.office_location || null,
          startDate: snapshotUser?.start_date || null,
          linkedImsUserId: syncResult.linkedUserId || targetEmployee?.id || null,
          expectedDeviceSpecs: normalizedExpectedDeviceSpecs,
          recommendedDeviceProfile: buildRecommendedDeviceProfile({
            categoryName,
            employeeGrade: snapshotUser?.employee_grade,
            jobTitle: snapshotUser?.job_title,
            requestType: normalizedRequestType,
          }),
        }),
        requestId,
      ],
    );

    await pool.query(
      `
        UPDATE request_workflow_steps
        SET action_status = 'pending', actor_user_id = NULL, action_note = NULL, acted_at = NULL
        WHERE request_id = ? AND action_status = 'returned'
      `,
      [requestId],
    );

    return res.json({ message: "Request updated successfully." });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.delete("/api/requests/:id", async (req, res) => {
  const requestId = Number(req.params.id);
  const requesterId = Number(req.query.requesterId);

  if (!Number.isInteger(requestId) || requestId <= 0 || !Number.isInteger(requesterId) || requesterId <= 0) {
    return res.status(400).json({ message: "Request id and requester are required." });
  }

  try {
    const [requestRows] = await pool.query(
      `
        SELECT id, requester_id, request_status
        FROM requests
        WHERE id = ?
        LIMIT 1
      `,
      [requestId],
    );

    if (requestRows.length === 0) {
      return res.status(404).json({ message: "Request was not found." });
    }

    const requestRecord = requestRows[0];

    if (requestRecord.requester_id !== requesterId) {
      return res.status(403).json({ message: "Only the requester can delete this request." });
    }

    if (requestRecord.request_status !== "pending") {
      return res.status(400).json({ message: "Only pending requests can be deleted." });
    }

    const [stepRows] = await pool.query(
      `
        SELECT step_key, action_status
        FROM request_workflow_steps
        WHERE request_id = ?
        ORDER BY id ASC
      `,
      [requestId],
    );

    const hasStartedReview = stepRows.some((step) => step.action_status !== "pending");

    if (hasStartedReview) {
      return res.status(400).json({ message: "This request is already under review and can no longer be deleted." });
    }

    await pool.query("DELETE FROM requests WHERE id = ?", [requestId]);

    return res.json({ message: "Request deleted successfully." });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.post("/api/requests/:id/fulfillment-status", async (req, res) => {
  const requestId = Number(req.params.id);
  const { actorUserId, fulfillmentStatus, note } = req.body ?? {};
  const allowedStatuses = new Set(["ready", "waiting_stock", "backordered", "on_hold"]);
  const statusLabels = {
    ready: "ready for fulfillment",
    waiting_stock: "waiting for stock",
    backordered: "backordered",
    on_hold: "on hold",
  };

  if (!Number.isInteger(requestId) || requestId <= 0 || !actorUserId) {
    return res.status(400).json({ message: "Request id and storekeeper are required." });
  }

  if (!allowedStatuses.has(fulfillmentStatus)) {
    return res.status(400).json({ message: "Choose a valid fulfillment status." });
  }

  try {
    const actor = await getUserContext(Number(actorUserId));

    if (!actor || actor.role_name !== "IT Support engineer") {
      return res.status(403).json({ message: "Only an IT Support engineer can update fulfillment status." });
    }

    const [requestRows] = await pool.query(
      `
        SELECT id, requester_id, request_status
        FROM requests
        WHERE id = ?
        LIMIT 1
      `,
      [requestId],
    );

    if (requestRows.length === 0) {
      return res.status(404).json({ message: "Request was not found." });
    }

    const requestRecord = requestRows[0];

    if (requestRecord.request_status === "rejected" || requestRecord.request_status === "fulfilled") {
      return res.status(400).json({ message: "This request is already closed." });
    }

    const [stepRows] = await pool.query(
      `
        SELECT id, step_key, actor_role
        FROM request_workflow_steps
        WHERE request_id = ? AND action_status = 'pending'
        ORDER BY id ASC
        LIMIT 1
      `,
      [requestId],
    );

    if (stepRows.length === 0 || stepRows[0].step_key !== "store_fulfillment") {
      return res.status(400).json({ message: "This request is not waiting for store fulfillment." });
    }

    await pool.query(
      `
        UPDATE requests
        SET fulfillment_status = ?, fulfillment_note = ?, fulfillment_updated_at = NOW()
        WHERE id = ?
      `,
      [fulfillmentStatus, note || null, requestId],
    );

    await pool.query(
      `
        UPDATE request_workflow_steps
        SET actor_user_id = ?, action_note = ?
        WHERE id = ?
      `,
      [actor.id, note || `Marked ${statusLabels[fulfillmentStatus]}.`, stepRows[0].id],
    );

    await createNotification(
      requestRecord.requester_id,
      "Fulfillment status updated",
      `Your equipment request is now ${statusLabels[fulfillmentStatus]}. ${note || ""}`.trim(),
    );

    const requester = await getUserById(requestRecord.requester_id);
    const requestContext = await getRequestNotificationContext(requestId);

    if (requester?.email) {
      await trySendRequestLifecycleEmail({
        to: requester.email,
        subject: "Airtel IMS fulfillment update",
        headline: "Your request fulfillment status changed",
        intro: `The storekeeper marked your equipment request as ${statusLabels[fulfillmentStatus]}.`,
        details: [
          `Requested category: ${requestContext?.category_name || "Equipment request"}`,
          `Store note: ${note || "No extra note provided."}`,
        ],
        closing: "You will receive another update when the device is assigned.",
      });
    }

    return res.json({ message: `Request marked ${statusLabels[fulfillmentStatus]}.` });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.post("/api/requests/:id/fulfill", async (req, res) => {
  const requestId = Number(req.params.id);
  const {
    actorUserId,
    equipmentId,
    expectedReturnDate,
    note,
    replacementDisposition = null,
    replacementConditionStatus = null,
  } = req.body ?? {};

  if (!Number.isInteger(requestId) || requestId <= 0 || !actorUserId) {
    return res.status(400).json({ message: "Request id and storekeeper are required." });
  }

  try {
    const actor = await getUserContext(Number(actorUserId));

    if (!actor || actor.role_name !== "IT Support engineer") {
      return res.status(403).json({ message: "Only an IT Support engineer can fulfill a request." });
    }

    const [requestRows] = await pool.query(
      `
        SELECT id, requester_id, target_employee_user_id, category_id, request_status, booked_equipment_id, request_type, source_equipment_id
        FROM requests
        WHERE id = ?
        LIMIT 1
      `,
      [requestId],
    );

    if (requestRows.length === 0) {
      return res.status(404).json({ message: "Request was not found." });
    }

    const requestRecord = requestRows[0];
    const requestedEquipmentId = equipmentId ? Number(equipmentId) : null;
    const reservedEquipmentId = requestRecord.booked_equipment_id ? Number(requestRecord.booked_equipment_id) : null;
    const targetEmployeeId = requestRecord.target_employee_user_id || requestRecord.requester_id;
    const normalizedReplacementDisposition = replacementDisposition ? String(replacementDisposition).trim().toLowerCase() : null;
    const normalizedReplacementConditionStatus = replacementConditionStatus
      ? String(replacementConditionStatus).trim()
      : null;

    if (reservedEquipmentId && requestedEquipmentId && reservedEquipmentId !== requestedEquipmentId) {
      return res.status(400).json({ message: "This request already has reserved equipment. Fulfill it with the reserved item." });
    }

    const finalEquipmentId = reservedEquipmentId || requestedEquipmentId;

    if (!finalEquipmentId) {
      return res.status(400).json({ message: "Select or reserve equipment before fulfilling this request." });
    }

    let sourceEquipment = null;
    let sourceAssignment = null;

    if (requestRecord.request_type === "replacement" && requestRecord.source_equipment_id) {
      if (!["available", "retired"].includes(normalizedReplacementDisposition || "")) {
        return res.status(400).json({ message: "Choose whether the replaced device returns to stock or is disposed." });
      }

      sourceEquipment = await getEquipmentDetails(Number(requestRecord.source_equipment_id));

      if (!sourceEquipment) {
        return res.status(404).json({ message: "The current device linked to this replacement request was not found." });
      }

      if (Number(requestRecord.source_equipment_id) === finalEquipmentId) {
        return res.status(400).json({ message: "The replacement device cannot be the same as the current assigned device." });
      }

      const [sourceAssignmentRows] = await pool.query(
        `
          SELECT id, status
          FROM assignments
          WHERE equipment_id = ? AND employee_user_id = ? AND status = 'active'
          ORDER BY id DESC
          LIMIT 1
        `,
        [Number(requestRecord.source_equipment_id), targetEmployeeId],
      );

      if (sourceAssignmentRows.length === 0) {
        return res.status(400).json({ message: "The current device is not actively assigned to this employee, so the replacement cannot be completed." });
      }

      sourceAssignment = sourceAssignmentRows[0];
    }

    const [stepRows] = await pool.query(
      `
        SELECT id, step_key, actor_role
        FROM request_workflow_steps
        WHERE request_id = ? AND action_status = 'pending'
        ORDER BY id ASC
        LIMIT 1
      `,
      [requestId],
    );

    if (stepRows.length === 0 || stepRows[0].step_key !== "store_fulfillment") {
      return res.status(400).json({ message: "This request is not ready for fulfillment." });
    }

    const [equipmentRows] = await pool.query(
      `
        SELECT id, category_id, status
        FROM equipment
        WHERE id = ?
        LIMIT 1
      `,
      [finalEquipmentId],
    );

    if (equipmentRows.length === 0) {
      return res.status(404).json({ message: "Selected equipment was not found." });
    }

    const equipmentRecord = equipmentRows[0];

    if (equipmentRecord.status !== "available") {
      return res.status(400).json({ message: "Selected equipment is not currently available." });
    }

    if (equipmentRecord.category_id !== requestRecord.category_id) {
      return res.status(400).json({ message: "Selected equipment does not match the requested category." });
    }

    const [assignmentResult] = await pool.query(
      `
        INSERT INTO assignments (
          equipment_id,
          employee_user_id,
          assigned_by,
          request_id,
          expected_return_date,
          status,
          notes
        )
        VALUES (?, ?, ?, ?, ?, 'active', ?)
      `,
      [
        finalEquipmentId,
        targetEmployeeId,
        actor.id,
        requestId,
        expectedReturnDate || null,
        note || "Equipment issued through request workflow.",
      ],
    );

    await pool.query(
      "UPDATE equipment SET status = 'assigned' WHERE id = ?",
      [finalEquipmentId],
    );
    await logAssetLifecycle({
      equipmentId: finalEquipmentId,
      actorUserId: actor.id,
      eventType: "assigned",
      eventLabel: "Equipment assigned to employee",
      eventNote: note || "Equipment issued through request workflow.",
      fromStatus: equipmentRecord.status,
      toStatus: "assigned",
      relatedRecordType: "assignment",
      relatedRecordId: assignmentResult.insertId,
    });

    await pool.query(
      `
        UPDATE request_workflow_steps
        SET actor_user_id = ?, action_status = 'fulfilled', action_note = ?, acted_at = NOW()
        WHERE id = ?
      `,
      [actor.id, note || "Equipment issued to employee.", stepRows[0].id],
    );

    await pool.query(
      `
        UPDATE requests
        SET
          approver_id = ?,
          request_status = 'fulfilled',
          fulfillment_status = 'fulfilled',
          fulfillment_note = ?,
          fulfillment_updated_at = NOW(),
          booked_equipment_id = ?,
          replacement_disposition = COALESCE(?, replacement_disposition),
          replacement_condition_status = COALESCE(?, replacement_condition_status),
          final_security_approval_status = CASE WHEN final_security_approval_status = 'pending' THEN 'approved' ELSE final_security_approval_status END,
          final_security_approved_at = COALESCE(final_security_approved_at, NOW()),
          final_security_approved_by = COALESCE(final_security_approved_by, ?)
        WHERE id = ?
      `,
      [
        actor.id,
        note || "Equipment issued to employee.",
        finalEquipmentId,
        normalizedReplacementDisposition,
        normalizedReplacementConditionStatus,
        actor.id,
        requestId,
      ],
    );

    await pool.query(
      `
        INSERT INTO security_handover_reviews (
          request_id,
          equipment_id,
          reviewed_by_user_id,
          review_status,
          review_note,
          reviewed_at
        )
        VALUES (?, ?, ?, 'approved', ?, NOW())
      `,
      [requestId, finalEquipmentId, actor.id, note || "Device handover completed after final workflow approvals."],
    );

    await createNotification(
      requestRecord.target_employee_user_id || requestRecord.requester_id,
      "Equipment assigned",
      "Your equipment request has been fulfilled and the asset is now assigned to you.",
    );

    const requester = await getUserById(requestRecord.target_employee_user_id || requestRecord.requester_id);
    const requestContext = await getRequestNotificationContext(requestId);
    const equipmentDetails = await getEquipmentDetails(finalEquipmentId);

    if (requester?.email) {
      await trySendRequestLifecycleEmail({
        to: requester.email,
        subject: "Airtel IMS request fulfilled",
        headline: "Your equipment has been assigned",
        intro: "Your request has been fulfilled and the asset is now assigned to you.",
        details: [
          `Category: ${requestContext?.category_name || "Equipment"}`,
          `Assigned asset: ${equipmentDetails?.asset_tag || "Assigned item"}`,
          `Equipment name: ${equipmentDetails?.equipment_name || "Equipment item"}`,
          `Expected return date: ${expectedReturnDate || "Not set"}`,
        ],
        closing: "Please sign in to Airtel IMS to view the assignment details.",
      });
    }

    if (requestRecord.request_type === "replacement" && requestRecord.source_equipment_id) {
      const sourceEquipmentId = Number(requestRecord.source_equipment_id);
      const sourceDisposition = normalizedReplacementDisposition || "retired";
      const sourceCondition = normalizedReplacementConditionStatus || "Returned during replacement";
      const replacementNote = note || `Replacement completed. Previous device marked ${sourceDisposition === "available" ? "returned to stock" : "disposed"}.`;

      await pool.query(
        `
          UPDATE assignments
          SET status = 'returned'
          WHERE id = ?
        `,
        [sourceAssignment.id],
      );

      await pool.query(
        `
          INSERT INTO returns (
            assignment_id,
            equipment_id,
            received_by,
            condition_status,
            returned_at,
            notes,
            employee_user_id,
            requested_by,
            storekeeper_user_id,
            it_manager_user_id,
            request_note,
            it_review_note,
            intake_note,
            disposition,
            return_status,
            requested_at,
            it_reviewed_at,
            processed_at,
            received_condition_comment,
            final_hrd_approval_status,
            final_hrd_approved_at,
            final_hrd_approved_by,
            final_itd_approval_status,
            final_itd_approved_at,
            final_itd_approved_by
          )
          VALUES (?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', NOW(), NOW(), NOW(), ?, 'approved', NOW(), ?, 'approved', NOW(), ?)
        `,
        [
          sourceAssignment.id,
          sourceEquipmentId,
          actor.id,
          sourceCondition,
          replacementNote,
          targetEmployeeId,
          targetEmployeeId,
          actor.id,
          actor.id,
          replacementNote,
          replacementNote,
          replacementNote,
          sourceDisposition,
          sourceCondition,
          actor.id,
          actor.id,
        ],
      );

      await pool.query(
        "UPDATE equipment SET status = ? WHERE id = ?",
        [sourceDisposition, sourceEquipmentId],
      );
      await logAssetLifecycle({
        equipmentId: sourceEquipmentId,
        actorUserId: actor.id,
        eventType: "replacement_processed",
        eventLabel: "Replaced equipment processed",
        eventNote: replacementNote,
        fromStatus: sourceEquipment?.status || null,
        toStatus: sourceDisposition,
        relatedRecordType: "request",
        relatedRecordId: requestId,
      });
    }

    return res.json({ message: "Request fulfilled and equipment assigned successfully." });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.post("/api/assignments/:id/confirm-receipt", async (req, res) => {
  const assignmentId = Number(req.params.id);
  const { employeeUserId, note } = req.body ?? {};

  if (!Number.isInteger(assignmentId) || assignmentId <= 0 || !employeeUserId) {
    return res.status(400).json({ message: "Assignment and employee are required." });
  }

  try {
    const [assignmentRows] = await pool.query(
      `
        SELECT
          a.id,
          a.request_id,
          a.equipment_id,
          a.employee_user_id,
          a.assigned_by,
          a.status,
          a.receipt_status,
          e.asset_tag,
          e.equipment_name,
          CONCAT(emp.first_name, ' ', emp.last_name) AS employee_name,
          emp.email AS employee_email
        FROM assignments a
        INNER JOIN equipment e ON e.id = a.equipment_id
        INNER JOIN users emp ON emp.id = a.employee_user_id
        WHERE a.id = ?
        LIMIT 1
      `,
      [assignmentId],
    );

    if (assignmentRows.length === 0) {
      return res.status(404).json({ message: "Assignment was not found." });
    }

    const assignment = assignmentRows[0];

    if (assignment.employee_user_id !== Number(employeeUserId)) {
      return res.status(403).json({ message: "Only the assigned employee can confirm this receipt." });
    }

    if (assignment.status !== "active") {
      return res.status(400).json({ message: "Only active assignments can be confirmed as received." });
    }

    if (assignment.receipt_status === "received") {
      return res.status(400).json({ message: "This equipment receipt was already confirmed." });
    }

    await pool.query(
      `
        UPDATE assignments
        SET receipt_status = 'received', received_confirmed_at = NOW(), receipt_note = ?
        WHERE id = ?
      `,
      [note || "Employee confirmed receipt.", assignmentId],
    );

    await createNotification(
      assignment.assigned_by,
      "Equipment receipt confirmed",
      `${assignment.employee_name} confirmed receipt of ${assignment.asset_tag}.`,
    );
    await logAssetLifecycle({
      equipmentId: assignment.equipment_id,
      actorUserId: Number(employeeUserId),
      eventType: "handover_acknowledged",
      eventLabel: "Employee acknowledged device receipt",
      eventNote: note || "Employee confirmed receipt in the asset management system.",
      fromStatus: "assigned",
      toStatus: "assigned",
      relatedRecordType: "assignment",
      relatedRecordId: assignmentId,
    });

    if (assignment.employee_email) {
      await trySendRequestLifecycleEmail({
        to: assignment.employee_email,
        subject: "Airtel IMS receipt confirmed",
        headline: "Equipment receipt confirmed",
        intro: `You confirmed that you received ${assignment.asset_tag}.`,
        details: [
          `Assignment ID: ${assignmentId}`,
          `Equipment: ${assignment.equipment_name}`,
          `Note: ${note || "Employee confirmed receipt."}`,
        ],
        closing: "This confirmation is now recorded in Airtel IMS.",
      });
    }

    return res.json({ message: "Equipment receipt confirmed successfully." });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.post("/api/returns/request", async (req, res) => {
  const {
    assignmentId,
    employeeUserId,
    note,
    returnReason = "standard",
    returnAttachmentName,
    returnAttachmentType,
    returnAttachmentData,
  } = req.body ?? {};

  if (!assignmentId || !employeeUserId) {
    return res.status(400).json({ message: "Assignment and employee are required." });
  }

  try {
    const normalizedReturnReason = returnReason === "leaving_job" ? "leaving_job" : "standard";

    const [assignmentRows] = await pool.query(
      `
        SELECT
          a.id,
          a.equipment_id,
          a.employee_user_id,
          a.status,
          e.asset_tag,
          e.equipment_name,
          e.branch_id,
          emp.employment_status,
          CONCAT(emp.first_name, ' ', emp.last_name) AS employee_name,
          emp.email AS employee_email
        FROM assignments a
        INNER JOIN equipment e ON e.id = a.equipment_id
        INNER JOIN users emp ON emp.id = a.employee_user_id
        WHERE a.id = ?
        LIMIT 1
      `,
      [Number(assignmentId)],
    );

    if (assignmentRows.length === 0) {
      return res.status(404).json({ message: "Assignment was not found." });
    }

    const assignment = assignmentRows[0];

    if (assignment.employee_user_id !== Number(employeeUserId)) {
      return res.status(403).json({ message: "Only the assigned employee can request this return." });
    }

    if (assignment.status !== "active" && assignment.status !== "overdue") {
      return res.status(400).json({ message: "Only active assigned equipment can be returned." });
    }

    const [existingRows] = await pool.query(
      "SELECT id FROM returns WHERE assignment_id = ? AND return_status IN ('it_review', 'store_intake', 'requested', 'awaiting_final_approval', 'maintenance') LIMIT 1",
      [Number(assignmentId)],
    );

    if (existingRows.length > 0) {
      return res.status(400).json({ message: "A return request is already pending for this assignment." });
    }

    const attachmentName = typeof returnAttachmentName === "string" && returnAttachmentName.trim() ? returnAttachmentName.trim() : null;
    const attachmentType = typeof returnAttachmentType === "string" && returnAttachmentType.trim() ? returnAttachmentType.trim() : null;
    const attachmentData = typeof returnAttachmentData === "string" && returnAttachmentData.trim() ? returnAttachmentData.trim() : null;

    if (normalizedReturnReason === "leaving_job" && (!attachmentName || !attachmentData)) {
      return res.status(400).json({ message: "Attach the reception letter or final letter for leaving-job returns." });
    }

    const [result] = await pool.query(
      `
        INSERT INTO returns (
          assignment_id,
          equipment_id,
          employee_user_id,
          requested_by,
          return_reason,
          request_note,
          return_attachment_name,
          return_attachment_type,
          return_attachment_data,
          return_status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'it_review')
      `,
      [
        Number(assignmentId),
        Number(assignment.equipment_id),
        Number(employeeUserId),
        Number(employeeUserId),
        normalizedReturnReason,
        note || null,
        attachmentName,
        attachmentType,
        attachmentData,
      ],
    );
    await logAssetLifecycle({
      equipmentId: Number(assignment.equipment_id),
      actorUserId: Number(employeeUserId),
      eventType: "return_requested",
      eventLabel: "Employee requested return",
      eventNote: note || "Return request submitted for IT inspection.",
      fromStatus: "assigned",
      toStatus: "it_review",
      relatedRecordType: "return",
      relatedRecordId: result.insertId,
    });

    const [itManagerRows] = await pool.query(
      `
        SELECT u.id, u.email, CONCAT(u.first_name, ' ', u.last_name) AS full_name
        FROM users u
        INNER JOIN roles r ON r.id = u.role_id
        WHERE r.name = 'IT Support engineer'
          AND u.status = 'active'
          AND (? IS NULL OR u.branch_id = ? OR u.branch_id IS NULL)
        ORDER BY CASE WHEN u.branch_id = ? THEN 0 ELSE 1 END, u.id ASC
        LIMIT 1
      `,
      [assignment.branch_id, assignment.branch_id, assignment.branch_id],
    );

    if (itManagerRows.length > 0 && normalizedReturnReason !== "leaving_job") {
      const itManager = itManagerRows[0];
      await createNotification(
        itManager.id,
        normalizedReturnReason === "leaving_job" ? "Exit return awaiting IT check" : "Return request awaiting IT check",
        normalizedReturnReason === "leaving_job"
          ? `${assignment.employee_name} is leaving the company and returned ${assignment.asset_tag}. Please inspect the device and accessories before final approval.`
          : `${assignment.employee_name} requested to return ${assignment.asset_tag}. Please inspect it before store intake.`,
      );

      if (itManager.email) {
        await trySendRequestLifecycleEmail({
          to: itManager.email,
          subject: normalizedReturnReason === "leaving_job" ? "Airtel IMS exit return needs IT check" : "Airtel IMS return request needs IT check",
          headline: normalizedReturnReason === "leaving_job" ? "Offboarding device return needs IT inspection" : "Equipment return needs IT inspection",
          intro: normalizedReturnReason === "leaving_job"
            ? `${assignment.employee_name} is leaving the company and returned assigned equipment. Please assess the device, record accessories, and trigger final approval.`
            : `${assignment.employee_name} requested to return assigned equipment. Please check the device before storekeeper intake.`,
          details: [
            `Return ID: ${result.insertId}`,
            `Asset: ${assignment.asset_tag}`,
            `Equipment: ${assignment.equipment_name}`,
            `Employee: ${assignment.employee_name}`,
            `Return reason: ${normalizedReturnReason === "leaving_job" ? "Employee leaving job" : "Standard return"}`,
            `Note: ${note || "No return note provided."}`,
          ],
          closing: normalizedReturnReason === "leaving_job"
            ? "Please sign in to Airtel IMS, acknowledge the return, and send it for HRD and ITD final approval."
            : "Please sign in to Airtel IMS and review this return from the IT Support dashboard.",
        });
      }
    }

    if (normalizedReturnReason === "leaving_job") {
      const [hrRows] = await pool.query(
        `
          SELECT u.id, u.email, CONCAT(u.first_name, ' ', u.last_name) AS full_name
          FROM users u
          INNER JOIN roles r ON r.id = u.role_id
          WHERE r.name = 'HR recruitment officer'
            AND u.status = 'active'
            AND (? IS NULL OR u.branch_id = ? OR u.branch_id IS NULL)
          ORDER BY CASE WHEN u.branch_id = ? THEN 0 ELSE 1 END, u.id ASC
          LIMIT 1
        `,
        [assignment.branch_id, assignment.branch_id, assignment.branch_id],
      );

      if (hrRows.length > 0) {
        const hrRecruitment = hrRows[0];
        await createNotification(
          hrRecruitment.id,
          "Exit return requires HR recruitment action",
          `${assignment.employee_name} submitted a leaving-job equipment return for ${assignment.asset_tag}. Review the attachment and coordinate the offboarding handover.`,
        );

        if (hrRecruitment.email) {
          await trySendRequestLifecycleEmail({
            to: hrRecruitment.email,
            subject: "Airtel IMS leaving-job return requires HR recruitment review",
            headline: "Offboarding device return submitted",
            intro: `${assignment.employee_name} has requested an offboarding return for ${assignment.asset_tag}. Please review the return request and supporting file.`,
            details: [
              `Return ID: ${result.insertId}`,
              `Asset: ${assignment.asset_tag}`,
              `Equipment: ${assignment.equipment_name}`,
              `Employee: ${assignment.employee_name}`,
              "Return reason: Employee leaving job",
              `Note: ${note || "No return note provided."}`,
            ],
            closing: "Review the request in Airtel IMS and complete any HR recruitment exit checks.",
            attachments: attachmentData
              ? [
                  {
                    filename: attachmentName || `return-attachment-${result.insertId}`,
                    content: attachmentData,
                    encoding: "base64",
                    contentType: attachmentType || "application/octet-stream",
                  },
                ]
              : undefined,
          });
        }
      }
    }

    if (assignment.employee_email) {
      await trySendRequestLifecycleEmail({
        to: assignment.employee_email,
        subject: "Airtel IMS return request submitted",
        headline: "Your return request has been submitted",
        intro: normalizedReturnReason === "leaving_job"
          ? `Your offboarding return for ${assignment.asset_tag} has been recorded.`
          : `Your request to return ${assignment.asset_tag} has been recorded.`,
        details: [
          `Return ID: ${result.insertId}`,
          `Asset: ${assignment.asset_tag}`,
          `Equipment: ${assignment.equipment_name}`,
          `Return reason: ${normalizedReturnReason === "leaving_job" ? "Employee leaving job" : "Standard return"}`,
        ],
        closing: normalizedReturnReason === "leaving_job"
          ? "IT will inspect the device first, then HRD and ITD will complete final approval before the device returns to IT stock."
          : "Your return will first be checked by IT, then sent to the storekeeper for final stock recording.",
      });
    }

    return res.status(201).json({
      message:
        normalizedReturnReason === "leaving_job"
          ? "Leaving-job return request submitted. HR Recruitment has been notified and IT Support is pending HR notification."
          : "Return request submitted successfully.",
    });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.post("/api/returns/:id/hr-notify-it", async (req, res) => {
  const returnId = Number(req.params.id);
  const { actorUserId } = req.body ?? {};

  if (!returnId || !actorUserId) {
    return res.status(400).json({ message: "Return and HR recruitment actor are required." });
  }

  try {
    const actor = await getUserContext(Number(actorUserId));

    if (!actor || !["HR Recruitment officer", "Hr department"].includes(actor.role_name)) {
      return res.status(403).json({ message: "Only HR recruitment users can notify IT Support for this return." });
    }

    const actorFullName = [actor.first_name, actor.last_name].filter(Boolean).join(" ") || actor.email || "HR Recruitment";

    const [returnRows] = await pool.query(
      `
        SELECT
          r.id,
          r.assignment_id,
          r.equipment_id,
          r.employee_user_id,
          r.return_reason,
          r.return_status,
          r.request_note,
          r.return_attachment_name,
          r.hr_notified_it_at,
          e.asset_tag,
          e.equipment_name,
          e.branch_id,
          emp.email AS employee_email,
          CONCAT(emp.first_name, ' ', emp.last_name) AS employee_name
        FROM returns r
        INNER JOIN equipment e ON e.id = r.equipment_id
        INNER JOIN users emp ON emp.id = r.employee_user_id
        WHERE r.id = ?
        LIMIT 1
      `,
      [returnId],
    );

    if (returnRows.length === 0) {
      return res.status(404).json({ message: "Return request not found." });
    }

    const returnRecord = returnRows[0];

    if (returnRecord.return_reason !== "leaving_job") {
      return res.status(400).json({ message: "HR notification to IT is only required for leaving-job returns." });
    }

    if (returnRecord.return_status !== "it_review") {
      return res.status(400).json({ message: "Only pending IT review returns can be sent to IT Support." });
    }

    if (returnRecord.hr_notified_it_at) {
      return res.status(400).json({ message: "IT Support has already been notified for this return." });
    }

    const [itManagerRows] = await pool.query(
      `
        SELECT u.id, u.email, CONCAT(u.first_name, ' ', u.last_name) AS full_name
        FROM users u
        INNER JOIN roles r ON r.id = u.role_id
        WHERE r.name = 'IT Support engineer'
          AND u.status = 'active'
          AND (? IS NULL OR u.branch_id = ? OR u.branch_id IS NULL)
        ORDER BY CASE WHEN u.branch_id = ? THEN 0 ELSE 1 END, u.id ASC
        LIMIT 1
      `,
      [returnRecord.branch_id, returnRecord.branch_id, returnRecord.branch_id],
    );

    if (itManagerRows.length === 0) {
      return res.status(404).json({ message: "No active IT Support engineer was found for this return." });
    }

    await pool.query(
      `
        UPDATE returns
        SET hr_notified_it_at = NOW(), hr_notified_it_by = ?
        WHERE id = ?
      `,
      [actor.id, returnId],
    );

    const itManager = itManagerRows[0];
    await createNotification(
      itManager.id,
      "HR notified IT about an exit return",
      `${actorFullName} asked IT Support to collect and inspect ${returnRecord.asset_tag} for ${returnRecord.employee_name}'s offboarding return.`,
    );

    if (itManager.email) {
      await trySendRequestLifecycleEmail({
        to: itManager.email,
        subject: "Airtel IMS HR notification for exit return",
        headline: "HR has sent an offboarding return to IT Support",
        intro: `${actorFullName} has notified IT Support that ${returnRecord.employee_name}'s returned device is ready for collection and inspection.`,
        details: [
          `Return ID: ${returnId}`,
          `Asset: ${returnRecord.asset_tag}`,
          `Equipment: ${returnRecord.equipment_name}`,
          `Employee: ${returnRecord.employee_name}`,
          "Return reason: Employee leaving job",
          `HR note: ${returnRecord.request_note || "No employee return note provided."}`,
          `Attached document: ${returnRecord.return_attachment_name || "Available in Airtel IMS"}`,
        ],
        closing: "Please sign in to Airtel IMS, receive the device from HR, and complete the IT Support assessment.",
      });
    }

    await logAssetLifecycle({
      equipmentId: returnRecord.equipment_id,
      actorUserId: actor.id,
      eventType: "hr_notified_it_return",
      eventLabel: "HR notified IT about return",
      eventNote: `${actorFullName} sent the offboarding return to IT Support for collection and review.`,
      fromStatus: "it_review",
      toStatus: "it_review",
      relatedRecordType: "return",
      relatedRecordId: returnId,
    });

    return res.json({ message: "IT Support notified successfully." });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.post("/api/returns/:id/it-review", async (req, res) => {
  const returnId = Number(req.params.id);
  const { actorUserId, conditionStatus, disposition, reviewNote, action = "forward" } = req.body ?? {};

  if (!returnId || !actorUserId) {
    return res.status(400).json({ message: "Return and IT Support engineer are required." });
  }

  try {
    const actor = await getUserContext(Number(actorUserId));

    if (!actor || actor.role_name !== "IT Support engineer") {
      return res.status(403).json({ message: "Only an IT Support engineer can review return requests." });
    }

    const [returnRows] = await pool.query(
      `
        SELECT
          r.id,
          r.assignment_id,
          r.equipment_id,
          r.employee_user_id,
          r.return_reason,
          r.return_status,
          e.asset_tag,
          e.equipment_name,
          e.branch_id,
          emp.email AS employee_email,
          CONCAT(emp.first_name, ' ', emp.last_name) AS employee_name
        FROM returns r
        INNER JOIN equipment e ON e.id = r.equipment_id
        INNER JOIN users emp ON emp.id = r.employee_user_id
        WHERE r.id = ?
        LIMIT 1
      `,
      [returnId],
    );

    if (returnRows.length === 0) {
      return res.status(404).json({ message: "Return request not found." });
    }

    const returnRecord = returnRows[0];

    if (returnRecord.return_status !== "it_review") {
      return res.status(400).json({ message: "This return request is not waiting for IT review." });
    }

    if (returnRecord.return_reason === "leaving_job") {
      const [notificationRows] = await pool.query(
        "SELECT hr_notified_it_at FROM returns WHERE id = ? LIMIT 1",
        [returnId],
      );
      const hrNotifiedItAt = notificationRows[0]?.hr_notified_it_at || null;

      if (!hrNotifiedItAt) {
        return res.status(400).json({ message: "HR Recruitment must notify IT Support before IT can process this leaving-job return." });
      }
    }

    if (action === "reject") {
      await pool.query(
        `
          UPDATE returns
          SET
            it_manager_user_id = ?,
            it_review_note = ?,
            return_status = 'rejected',
            it_reviewed_at = NOW(),
            processed_at = NOW()
          WHERE id = ?
        `,
        [actor.id, reviewNote || "Return rejected during IT inspection.", returnId],
      );

      await createNotification(
        returnRecord.employee_user_id,
        "Return request rejected by IT",
        `${returnRecord.asset_tag} return request was rejected during IT inspection.`,
      );

      if (returnRecord.employee_email) {
        await trySendRequestLifecycleEmail({
          to: returnRecord.employee_email,
          subject: "Airtel IMS return request rejected",
          headline: "Your return request was rejected by IT",
          intro: `${returnRecord.asset_tag} could not move to store intake after IT inspection.`,
          details: [
            `Return ID: ${returnId}`,
            `Asset: ${returnRecord.asset_tag}`,
            `Reason: ${reviewNote || "No extra IT review note provided."}`,
          ],
          closing: "Please contact the IT department or sign in to Airtel IMS for more detail.",
        });
      }

      return res.json({ message: "Return request rejected by IT." });
    }

    if (action === "return_to_employee") {
      await pool.query(
        `
          UPDATE returns
          SET
            it_manager_user_id = ?,
            it_review_note = ?,
            condition_status = ?,
            disposition = 'employee_keeps',
            received_by = ?,
            returned_at = NOW(),
            received_condition_comment = ?,
            return_status = 'returned_to_employee',
            it_reviewed_at = NOW(),
            processed_at = NOW()
          WHERE id = ?
        `,
        [
          actor.id,
          reviewNote || "IT checked the equipment and sent it back to the employee.",
          conditionStatus || "good",
          actor.id,
          reviewNote || "IT checked the equipment and sent it back to the employee.",
          returnId,
        ],
      );

      await createNotification(
        returnRecord.employee_user_id,
        "Equipment returned to you",
        `${returnRecord.asset_tag} was checked by IT and returned to you because it is still usable.`,
      );
      await logAssetLifecycle({
        equipmentId: returnRecord.equipment_id,
        actorUserId: actor.id,
        eventType: "return_to_employee",
        eventLabel: "IT returned item to employee",
        eventNote: reviewNote || "IT checked the equipment and sent it back to the employee.",
        fromStatus: "it_review",
        toStatus: "assigned",
        relatedRecordType: "return",
        relatedRecordId: returnId,
      });

      if (returnRecord.employee_email) {
        await trySendRequestLifecycleEmail({
          to: returnRecord.employee_email,
          subject: "Airtel IMS equipment returned to you",
          headline: "IT returned the equipment to you",
          intro: `${returnRecord.asset_tag} was checked by IT and returned to you because it is still usable.`,
          details: [
            `Return ID: ${returnId}`,
            `Asset: ${returnRecord.asset_tag}`,
            `Equipment: ${returnRecord.equipment_name}`,
            `IT condition: ${conditionStatus || "good"}`,
            `IT note: ${reviewNote || "No extra IT note provided."}`,
          ],
          closing: "The assignment remains active in Airtel IMS, so no storekeeper stock action is needed.",
        });
      }

      return res.json({ message: "Equipment sent back to employee by IT." });
    }

    if (!conditionStatus || !disposition) {
      return res.status(400).json({ message: "IT condition and recommendation are required." });
    }

    if (disposition === "maintenance") {
      await pool.query(
        `
          UPDATE returns
          SET
            it_manager_user_id = ?,
            it_review_note = ?,
            condition_status = ?,
            disposition = ?,
            received_by = ?,
            returned_at = NOW(),
            received_condition_comment = ?,
            return_status = 'maintenance',
            it_reviewed_at = NOW()
          WHERE id = ?
        `,
        [actor.id, reviewNote || null, conditionStatus, disposition, actor.id, reviewNote || null, returnId],
      );

      const [maintenanceResult] = await pool.query(
        `
          INSERT INTO maintenance_records (
            equipment_id,
            return_id,
            reported_by,
            assigned_to,
            maintenance_status,
            condition_status,
            problem_description
          )
          VALUES (?, ?, ?, ?, 'under_repair', ?, ?)
        `,
        [returnRecord.equipment_id, returnId, actor.id, actor.id, conditionStatus, reviewNote || "Device sent to maintenance after IT inspection."],
      );

      await pool.query("UPDATE equipment SET status = 'maintenance' WHERE id = ?", [returnRecord.equipment_id]);
      await logAssetLifecycle({
        equipmentId: returnRecord.equipment_id,
        actorUserId: actor.id,
        eventType: "maintenance_started",
        eventLabel: "Moved to maintenance",
        eventNote: reviewNote || "IT sent this device to maintenance after inspection.",
        fromStatus: "assigned",
        toStatus: "maintenance",
        relatedRecordType: "maintenance",
        relatedRecordId: maintenanceResult.insertId,
      });

      await createNotification(
        returnRecord.employee_user_id,
        "Equipment moved to maintenance",
        `${returnRecord.asset_tag} was checked by IT and moved to maintenance for repair.`,
      );

      return res.json({ message: "Return moved into maintenance workflow." });
    }

    await pool.query(
        `
          UPDATE returns
          SET
            it_manager_user_id = ?,
            it_review_note = ?,
            condition_status = ?,
            disposition = ?,
            received_by = ?,
            returned_at = NOW(),
            received_condition_comment = ?,
            return_status = 'awaiting_final_approval',
            it_reviewed_at = NOW(),
            final_hrd_approval_status = 'pending',
            final_itd_approval_status = 'pending'
        WHERE id = ?
      `,
      [actor.id, reviewNote || null, conditionStatus, disposition, actor.id, reviewNote || null, returnId],
    );

    const settings = await getSystemSettingsMap();
    const approvalScope = {
      branch_id: returnRecord.branch_id,
      country_id: actor.country_id,
    };
    const hrdActor = await findActorForRole(settings.return_hrd_role || "HR DIRECTOR", approvalScope);
    const itdActor = await findActorForRole(settings.return_itd_role || "IT Director", approvalScope);

    for (const approver of [hrdActor, itdActor]) {
      if (!approver?.id) {
        continue;
      }
      await createNotification(
        approver.id,
        returnRecord.return_reason === "leaving_job" ? "Exit return awaiting final approval" : "Return awaiting final approval",
        returnRecord.return_reason === "leaving_job"
          ? `${returnRecord.asset_tag} was received from a leaving employee and now needs HRD and ITD final approval before returning to stock.`
          : `${returnRecord.asset_tag} has been received by IT and now needs final approval before returning to stock.`,
      );

      const approverUser = await getUserById(approver.id);
      if (approverUser?.email) {
        await trySendRequestLifecycleEmail({
          to: approverUser.email,
          subject: returnRecord.return_reason === "leaving_job" ? "Airtel IMS exit return awaiting final approval" : "Airtel IMS return awaiting final approval",
          headline: returnRecord.return_reason === "leaving_job" ? "An offboarding device return needs your approval" : "A returned device needs your approval",
          intro: returnRecord.return_reason === "leaving_job"
            ? `${returnRecord.asset_tag} was received during employee offboarding and now requires final approval before it goes back to IT stock.`
            : `${returnRecord.asset_tag} passed IT receipt and now requires final approval before it goes back to IT stock.`,
          details: [
            `Return ID: ${returnId}`,
            `Asset: ${returnRecord.asset_tag}`,
            `Employee: ${returnRecord.employee_name}`,
            `Return reason: ${returnRecord.return_reason === "leaving_job" ? "Employee leaving job" : "Standard return"}`,
            `IT condition: ${conditionStatus}`,
            `IT recommendation: ${disposition}`,
            `IT note: ${reviewNote || "No extra IT note provided."}`,
          ],
          closing: "Please sign in to Airtel IMS and approve or reject the final stock return decision.",
        });
      }
    }

    await createNotification(
      returnRecord.employee_user_id,
      returnRecord.return_reason === "leaving_job" ? "Exit return checked by IT" : "Return checked by IT",
      returnRecord.return_reason === "leaving_job"
        ? `${returnRecord.asset_tag} was checked by IT and is waiting for final HRD and ITD offboarding approval.`
        : `${returnRecord.asset_tag} was checked by IT and is waiting for final HRD and ITD approval.`,
    );
    await logAssetLifecycle({
      equipmentId: returnRecord.equipment_id,
      actorUserId: actor.id,
      eventType: "it_return_review",
      eventLabel: "IT checked return",
      eventNote: reviewNote || `IT recommended ${disposition}.`,
      fromStatus: "it_review",
      toStatus: "awaiting_final_approval",
      relatedRecordType: "return",
      relatedRecordId: returnId,
    });

    return res.json({ message: "Return checked by IT and sent for final approval." });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.post("/api/returns/:id/final-approve", async (req, res) => {
  const returnId = Number(req.params.id);
  const { actorUserId, decision = "approve", note } = req.body ?? {};

  if (!returnId || !actorUserId) {
    return res.status(400).json({ message: "Return and approver are required." });
  }

  try {
    const actor = await getUserContext(Number(actorUserId));

    if (!actor || !["HR DIRECTOR", "IT Director"].includes(actor.role_name)) {
      return res.status(403).json({ message: "Only HRD or ITD mapped roles can take final approval action." });
    }

    const [returnRows] = await pool.query(
      `
        SELECT
          r.*,
          e.asset_tag,
          e.equipment_name,
          e.branch_id,
          emp.email AS employee_email,
          CONCAT(emp.first_name, ' ', emp.last_name) AS employee_name
        FROM returns r
        INNER JOIN equipment e ON e.id = r.equipment_id
        INNER JOIN users emp ON emp.id = r.employee_user_id
        WHERE r.id = ?
        LIMIT 1
      `,
      [returnId],
    );

    if (returnRows.length === 0) {
      return res.status(404).json({ message: "Return request not found." });
    }

    const returnRecord = returnRows[0];

    if (returnRecord.return_status !== "awaiting_final_approval") {
      return res.status(400).json({ message: "This return is not waiting for final approval." });
    }

    const settings = await getSystemSettingsMap();
    const hrdRole = settings.return_hrd_role || "HR DIRECTOR";
    const itdRole = settings.return_itd_role || "IT Director";
    const isHrdActor = actor.role_name === hrdRole;
    const isItdActor = actor.role_name === itdRole;

    if (!isHrdActor && !isItdActor) {
      return res.status(403).json({ message: "This user is not mapped to the configured final approval roles." });
    }

    if (decision === "reject") {
      const updateFragments = [];
      const values = [];

      if (isHrdActor) {
        updateFragments.push("final_hrd_approval_status = 'rejected'", "final_hrd_approved_at = NOW()", "final_hrd_approved_by = ?");
        values.push(actor.id);
      }
      if (isItdActor) {
        updateFragments.push("final_itd_approval_status = 'rejected'", "final_itd_approved_at = NOW()", "final_itd_approved_by = ?");
        values.push(actor.id);
      }

      values.push(note || "Final return approval rejected.", returnId);

      await pool.query(
        `
          UPDATE returns
          SET ${updateFragments.join(", ")}, intake_note = COALESCE(?, intake_note), return_status = 'rejected', processed_at = NOW()
          WHERE id = ?
        `,
        values,
      );

      await createNotification(
        returnRecord.employee_user_id,
        "Return rejected",
        `${returnRecord.asset_tag} was rejected during final approval.`,
      );

      return res.json({ message: "Final return approval rejected." });
    }

    if (isHrdActor) {
      await pool.query(
        `
          UPDATE returns
          SET final_hrd_approval_status = 'approved', final_hrd_approved_at = NOW(), final_hrd_approved_by = ?
          WHERE id = ?
        `,
        [actor.id, returnId],
      );
    }

    if (isItdActor) {
      await pool.query(
        `
          UPDATE returns
          SET final_itd_approval_status = 'approved', final_itd_approved_at = NOW(), final_itd_approved_by = ?
          WHERE id = ?
        `,
        [actor.id, returnId],
      );
    }

    const [freshRows] = await pool.query(
      `
        SELECT
          final_hrd_approval_status,
          final_itd_approval_status,
          disposition,
          assignment_id,
          equipment_id,
          employee_user_id
        FROM returns
        WHERE id = ?
        LIMIT 1
      `,
      [returnId],
    );

    const freshReturn = freshRows[0];
    const bothApproved =
      freshReturn?.final_hrd_approval_status === "approved" &&
      freshReturn?.final_itd_approval_status === "approved";

    if (!bothApproved) {
      return res.json({ message: "Final approval recorded. Waiting for the other approver." });
    }

    await pool.query("UPDATE assignments SET status = 'returned' WHERE id = ?", [freshReturn.assignment_id]);
    if (returnRecord.return_reason === "leaving_job") {
      await pool.query(
        `
          UPDATE users
          SET employment_status = 'Exited', status = 'inactive'
          WHERE id = ?
        `,
        [freshReturn.employee_user_id],
      );
    }
    await pool.query(
      "UPDATE equipment SET status = ? WHERE id = ?",
      [freshReturn.disposition || "available", freshReturn.equipment_id],
    );
    await pool.query(
      "UPDATE returns SET return_status = 'completed', processed_at = NOW() WHERE id = ?",
      [returnId],
    );

    await logAssetLifecycle({
      equipmentId: freshReturn.equipment_id,
      actorUserId: actor.id,
      eventType: "return_completed",
      eventLabel: "Final return approval completed",
      eventNote: note || `HRD and ITD approved return to ${freshReturn.disposition || "available"} stock.`,
      fromStatus: "awaiting_final_approval",
      toStatus: freshReturn.disposition || "available",
      relatedRecordType: "return",
      relatedRecordId: returnId,
    });

    const alertScope = { branch_id: returnRecord.branch_id, country_id: actor.country_id };
    const securityActor = await findActorForRole(settings.return_security_alert_role || "IT security manager", alertScope);
    const alertActors = [securityActor];
    if (returnRecord.return_reason === "leaving_job") {
      const infrastructureActor = await findActorForRole(
        settings.return_infrastructure_alert_role || "IT infrastructure manager",
        alertScope,
      );
      alertActors.push(infrastructureActor);
    }

    for (const alertActor of alertActors) {
      if (!alertActor?.id) {
        continue;
      }
      await createNotification(
        alertActor.id,
        returnRecord.return_reason === "leaving_job" ? "Offboarding device added to stock" : "Returned device added to stock",
        returnRecord.return_reason === "leaving_job"
          ? `${returnRecord.asset_tag} completed offboarding approval and is now available in IT stock for future reuse or recycle.`
          : `${returnRecord.asset_tag} completed final approval and is back in IT stock.`,
      );
    }

    await createNotification(
      returnRecord.employee_user_id,
      returnRecord.return_reason === "leaving_job" ? "Offboarding return completed" : "Return completed",
      returnRecord.return_reason === "leaving_job"
        ? `${returnRecord.asset_tag} completed offboarding approval and was returned to IT stock.`
        : `${returnRecord.asset_tag} completed final approval and was returned to IT stock.`,
    );

    return res.json({
      message: returnRecord.return_reason === "leaving_job"
        ? "Offboarding approvals completed and device returned to stock."
        : "Final approvals completed and device returned to stock.",
    });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.get("/api/returns/:id/attachment", async (req, res) => {
  const returnId = Number(req.params.id);
  const actorUserId = Number(req.query.actorUserId);

  if (!returnId || !actorUserId) {
    return res.status(400).json({ message: "Return and actor user are required." });
  }

  try {
    const actor = await getUserContext(actorUserId);
    if (
      !actor ||
      !["HR Recruitment officer", "HR DIRECTOR", "IT Director", "admin"].includes(actor.role_name)
    ) {
      return res.status(403).json({ message: "You are not allowed to download this attachment." });
    }

    const [rows] = await pool.query(
      `
        SELECT
          id,
          return_attachment_name,
          return_attachment_type,
          return_attachment_data
        FROM returns
        WHERE id = ?
        LIMIT 1
      `,
      [returnId],
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Return was not found." });
    }

    const record = rows[0];
    if (!record.return_attachment_data) {
      return res.status(404).json({ message: "No attachment is available for this return." });
    }

    const fileName = record.return_attachment_name || `return-${returnId}-attachment`;
    const contentType = record.return_attachment_type || "application/octet-stream";
    const buffer = Buffer.from(String(record.return_attachment_data), "base64");

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${String(fileName).replace(/"/g, "")}"`);
    return res.send(buffer);
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.post("/api/returns/:id/process", async (req, res) => {
  const returnId = Number(req.params.id);
  const { actorUserId, conditionStatus, disposition, intakeNote, action = "complete" } = req.body ?? {};

  if (!returnId || !actorUserId) {
    return res.status(400).json({ message: "Return and IT Support engineer are required." });
  }

  try {
    const actor = await getUserContext(Number(actorUserId));

    if (!actor || actor.role_name !== "IT Support engineer") {
      return res.status(403).json({ message: "Only an IT Support engineer can process returns." });
    }

    const [returnRows] = await pool.query(
      `
        SELECT
          r.id,
          r.assignment_id,
          r.equipment_id,
          r.employee_user_id,
          r.return_status,
          e.asset_tag,
          e.equipment_name,
          emp.email AS employee_email,
          CONCAT(emp.first_name, ' ', emp.last_name) AS employee_name
        FROM returns r
        INNER JOIN equipment e ON e.id = r.equipment_id
        INNER JOIN users emp ON emp.id = r.employee_user_id
        WHERE r.id = ?
        LIMIT 1
      `,
      [returnId],
    );

    if (returnRows.length === 0) {
      return res.status(404).json({ message: "Return request not found." });
    }

    const returnRecord = returnRows[0];

    if (!["store_intake", "requested"].includes(returnRecord.return_status)) {
      return res.status(400).json({ message: "This return request must be checked by IT before store intake." });
    }

    if (action === "reject") {
      await pool.query(
        `
          UPDATE returns
          SET
            storekeeper_user_id = ?,
            intake_note = ?,
            return_status = 'rejected',
            processed_at = NOW()
          WHERE id = ?
        `,
        [actor.id, intakeNote || "Return request rejected during intake.", returnId],
      );

      await createNotification(
        returnRecord.employee_user_id,
        "Return request rejected",
        `${returnRecord.asset_tag} return request was rejected by the IT Support engineer.`,
      );
      await logAssetLifecycle({
        equipmentId: returnRecord.equipment_id,
        actorUserId: actor.id,
        eventType: "return_rejected",
        eventLabel: "IT Support engineer rejected return",
        eventNote: intakeNote || "Return request rejected during intake.",
        fromStatus: returnRecord.return_status,
        toStatus: "assigned",
        relatedRecordType: "return",
        relatedRecordId: returnId,
      });

      if (returnRecord.employee_email) {
        await trySendRequestLifecycleEmail({
          to: returnRecord.employee_email,
          subject: "Airtel IMS return request rejected",
          headline: "Your return request was rejected",
          intro: `${returnRecord.asset_tag} could not be accepted for return at this time.`,
          details: [
            `Return ID: ${returnId}`,
            `Asset: ${returnRecord.asset_tag}`,
            `Reason: ${intakeNote || "No extra intake note provided."}`,
          ],
          closing: "Please contact the IT Support engineer or sign in to Airtel IMS for more detail.",
        });
      }

      return res.json({ message: "Return request rejected." });
    }

    if (!conditionStatus || !disposition) {
      return res.status(400).json({ message: "Condition and disposition are required to complete intake." });
    }

    if (returnRecord.return_reason === "leaving_job") {
      await pool.query(
        `
          UPDATE returns
          SET
            storekeeper_user_id = ?,
            intake_note = ?,
            condition_status = ?,
            disposition = ?,
            received_by = ?,
            returned_at = NOW(),
            received_condition_comment = ?,
            return_status = 'awaiting_final_approval',
            final_hrd_approval_status = 'pending',
            final_itd_approval_status = 'pending'
          WHERE id = ?
        `,
        [actor.id, intakeNote || null, conditionStatus, disposition, actor.id, intakeNote || null, returnId],
      );

      const settings = await getSystemSettingsMap();
      const approvalScope = {
        branch_id: returnRecord.branch_id,
        country_id: actor.country_id,
      };
      const hrdActor = await findActorForRole(settings.return_hrd_role || "HR DIRECTOR", approvalScope);
      const itdActor = await findActorForRole(settings.return_itd_role || "IT Director", approvalScope);

      for (const approver of [hrdActor, itdActor]) {
        if (!approver?.id) {
          continue;
        }

        await createNotification(
          approver.id,
          "Exit return awaiting final approval",
          `${returnRecord.asset_tag} was received by IT Support and now needs HRD and ITD approval before returning to stock.`,
        );

        const approverUser = await getUserById(approver.id);
        if (approverUser?.email) {
          await trySendRequestLifecycleEmail({
            to: approverUser.email,
            subject: "Airtel IMS exit return awaiting final approval",
            headline: "An offboarding device return needs your approval",
            intro: `${returnRecord.asset_tag} was received by IT Support and assessed for offboarding. Final approval is now required before it returns to IT stock.`,
            details: [
              `Return ID: ${returnId}`,
              `Asset: ${returnRecord.asset_tag}`,
              `Employee: ${returnRecord.employee_name}`,
              `Condition: ${conditionStatus}`,
              `Recommended stock status: ${disposition}`,
              `IT Support note: ${intakeNote || "No extra intake note provided."}`,
            ],
            closing: "Please sign in to Airtel IMS and approve or reject the final offboarding stock decision.",
          });
        }
      }

      await createNotification(
        returnRecord.employee_user_id,
        "Exit return received by IT Support",
        `${returnRecord.asset_tag} was received by IT Support and is waiting for HRD and ITD approval.`,
      );

      await logAssetLifecycle({
        equipmentId: returnRecord.equipment_id,
        actorUserId: actor.id,
        eventType: "return_received",
        eventLabel: "IT Support received offboarding return",
        eventNote: intakeNote || `Device assessed and recommended as ${disposition}.`,
        fromStatus: returnRecord.return_status,
        toStatus: "awaiting_final_approval",
        relatedRecordType: "return",
        relatedRecordId: returnId,
      });

      return res.json({ message: "Return received and sent for HRD and ITD approval." });
    }

    await pool.query(
      `
        UPDATE returns
        SET
          storekeeper_user_id = ?,
          intake_note = ?,
          condition_status = ?,
          disposition = ?,
          received_by = ?,
          returned_at = NOW(),
          received_condition_comment = ?,
          return_status = 'completed',
          processed_at = NOW()
        WHERE id = ?
      `,
      [actor.id, intakeNote || null, conditionStatus, disposition, actor.id, intakeNote || null, returnId],
    );

    await pool.query(
      "UPDATE assignments SET status = 'returned' WHERE id = ?",
      [returnRecord.assignment_id],
    );

    await pool.query(
      "UPDATE equipment SET status = ? WHERE id = ?",
      [disposition, returnRecord.equipment_id],
    );
    await logAssetLifecycle({
      equipmentId: returnRecord.equipment_id,
      actorUserId: actor.id,
      eventType: "return_completed",
      eventLabel: "IT Support engineer completed return intake",
      eventNote: intakeNote || `Device recorded as ${disposition}.`,
      fromStatus: "store_intake",
      toStatus: disposition,
      relatedRecordType: "return",
      relatedRecordId: returnId,
    });

    await createNotification(
      returnRecord.employee_user_id,
      "Return completed",
      `${returnRecord.asset_tag} was received and marked as ${disposition}.`,
    );

    if (returnRecord.employee_email) {
      await trySendRequestLifecycleEmail({
        to: returnRecord.employee_email,
        subject: "Airtel IMS return completed",
        headline: "Your equipment return has been completed",
        intro: `${returnRecord.asset_tag} was received by the IT Support engineer and processed.`,
        details: [
          `Return ID: ${returnId}`,
          `Asset: ${returnRecord.asset_tag}`,
          `Condition: ${conditionStatus}`,
          `Disposition: ${disposition}`,
          `Store note: ${intakeNote || "No extra intake note provided."}`,
        ],
        closing: "Thank you. You can sign in to Airtel IMS to review the updated asset history.",
      });
    }

    return res.json({ message: "Return intake completed successfully." });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.post("/api/maintenance/:id/complete", async (req, res) => {
  const maintenanceId = Number(req.params.id);
  const { actorUserId, maintenanceStatus, finalDisposition, resolutionNote } = req.body ?? {};

  if (!maintenanceId || !actorUserId) {
    return res.status(400).json({ message: "Maintenance record and IT Support engineer are required." });
  }

  if (!["repaired", "not_repairable"].includes(maintenanceStatus)) {
    return res.status(400).json({ message: "Choose repaired or not repairable." });
  }

  if (!["available", "retired", "lost", "maintenance"].includes(finalDisposition)) {
    return res.status(400).json({ message: "Choose a valid final stock disposition." });
  }

  try {
    const actor = await getUserContext(Number(actorUserId));

    if (!actor || actor.role_name !== "IT Support engineer") {
      return res.status(403).json({ message: "Only an IT Support engineer can close maintenance records." });
    }

    const [maintenanceRows] = await pool.query(
      `
        SELECT
          m.id,
          m.equipment_id,
          m.return_id,
          m.maintenance_status,
          e.asset_tag,
          e.equipment_name,
          r.assignment_id,
          r.employee_user_id
        FROM maintenance_records m
        INNER JOIN equipment e ON e.id = m.equipment_id
        LEFT JOIN returns r ON r.id = m.return_id
        WHERE m.id = ?
        LIMIT 1
      `,
      [maintenanceId],
    );

    if (maintenanceRows.length === 0) {
      return res.status(404).json({ message: "Maintenance record not found." });
    }

    const maintenance = maintenanceRows[0];

    if (maintenance.maintenance_status !== "under_repair") {
      return res.status(400).json({ message: "This maintenance record is already closed." });
    }

    await pool.query(
      `
        UPDATE maintenance_records
        SET maintenance_status = ?, final_disposition = ?, resolution_note = ?, completed_at = NOW()
        WHERE id = ?
      `,
      [maintenanceStatus, finalDisposition, resolutionNote || null, maintenanceId],
    );

    if (maintenance.return_id) {
      await pool.query(
        `
          UPDATE returns
          SET return_status = 'completed', disposition = ?, intake_note = ?, processed_at = NOW()
          WHERE id = ?
        `,
        [finalDisposition, resolutionNote || "Maintenance completed and final stock status recorded.", maintenance.return_id],
      );
    }

    if (maintenance.assignment_id && finalDisposition !== "maintenance") {
      await pool.query("UPDATE assignments SET status = 'returned' WHERE id = ?", [maintenance.assignment_id]);
    }

    await pool.query("UPDATE equipment SET status = ? WHERE id = ?", [finalDisposition, maintenance.equipment_id]);
    await logAssetLifecycle({
      equipmentId: maintenance.equipment_id,
      actorUserId: actor.id,
      eventType: "maintenance_completed",
      eventLabel: maintenanceStatus === "repaired" ? "Maintenance repaired" : "Maintenance not repairable",
      eventNote: resolutionNote || `Final stock status recorded as ${finalDisposition}.`,
      fromStatus: "maintenance",
      toStatus: finalDisposition,
      relatedRecordType: "maintenance",
      relatedRecordId: maintenanceId,
    });

    if (maintenance.employee_user_id) {
      await createNotification(
        maintenance.employee_user_id,
        "Maintenance completed",
        `${maintenance.asset_tag} maintenance is complete and was recorded as ${finalDisposition}.`,
      );
    }

    return res.json({ message: "Maintenance completed and final stock status recorded." });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.post("/api/issues", async (req, res) => {
  const { equipmentId, reportedBy, issueTitle, issueDescription, priority } = req.body ?? {};

  if (!equipmentId || !reportedBy || !issueTitle) {
    return res.status(400).json({ message: "Equipment, reporter, and title are required." });
  }

  try {
    const [result] = await pool.query(
      `
        INSERT INTO issues (
          equipment_id,
          reported_by,
          issue_title,
          issue_description,
          priority,
          issue_status
        )
        VALUES (?, ?, ?, ?, ?, 'open')
      `,
      [Number(equipmentId), Number(reportedBy), issueTitle, issueDescription || null, priority || "medium"],
    );
    await logAssetLifecycle({
      equipmentId: Number(equipmentId),
      actorUserId: Number(reportedBy),
      eventType: "issue_reported",
      eventLabel: "Equipment issue reported",
      eventNote: issueDescription || issueTitle,
      relatedRecordType: "issue",
      relatedRecordId: result.insertId,
    });

    return res.status(201).json({ message: "Issue created successfully." });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.put("/api/issues/:id", async (req, res) => {
  const issueId = Number(req.params.id);
  const { issueTitle, issueDescription, priority, issueStatus } = req.body ?? {};

  if (!Number.isInteger(issueId) || issueId <= 0 || !issueTitle) {
    return res.status(400).json({ message: "Issue id and title are required." });
  }

  try {
    await pool.query(
      `
        UPDATE issues
        SET issue_title = ?, issue_description = ?, priority = ?, issue_status = ?
        WHERE id = ?
      `,
      [issueTitle, issueDescription || null, priority || "medium", issueStatus || "open", issueId],
    );

    return res.json({ message: "Issue updated successfully." });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.delete("/api/issues/:id", async (req, res) => {
  const issueId = Number(req.params.id);

  if (!Number.isInteger(issueId) || issueId <= 0) {
    return res.status(400).json({ message: "A valid issue id is required." });
  }

  try {
    await pool.query("DELETE FROM issues WHERE id = ?", [issueId]);
    return res.json({ message: "Issue deleted successfully." });
  } catch (error) {
    return res.status(500).json({ message: normalizeError(error) });
  }
});

app.use(express.static(frontendDistDirectory));

app.get(/^\/(?!api(?:\/|$)).*/, async (req, res) => {
  res.sendFile(path.join(frontendDistDirectory, "index.html"));
});

async function initializeSystem() {
  await ensureUserPhoneColumn();
  await ensureUserProfileImageColumn();
  await ensureUserFederatedAuthColumns();

  for (const country of airtelCountries) {
    await pool.query(
      `
        INSERT INTO country (name, iso_code, currency_code)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          currency_code = VALUES(currency_code)
      `,
      [country.name, country.isoCode, country.currencyCode],
    );
  }

  const [countries] = await pool.query("SELECT id, name FROM country");
  const countryMap = new Map(countries.map((country) => [country.name, country.id]));

  for (const branch of airtelBranches) {
    const countryId = countryMap.get(branch.countryName);

    if (!countryId) {
      continue;
    }

    await pool.query(
      `
        INSERT INTO branches (country_id, name, branch_code, manager_user_id)
        VALUES (?, ?, ?, NULL)
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          country_id = VALUES(country_id)
      `,
      [countryId, branch.name, branch.branchCode],
    );
  }

  await ensureDefaultAdmin();
  await ensureOperationalDemoData();
}

initializeSystem()
  .then(() => {
    app.listen(port, () => {
      console.log(`Airtel Global IMS API running on http://localhost:${port}`);
    });
  })
.catch((error) => {
    console.error("Failed to start API:", error);
    process.exit(1);
});
