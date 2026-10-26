if (!Bun.env.JWT_SECRET) {
  console.warn(
    "[config] JWT_SECRET is niet ingesteld; er wordt een onveilige standaardwaarde gebruikt.",
  );
}

export const JWT_SECRET = Bun.env.JWT_SECRET || "SuperSecretKey";

export const ADMIN_EMAIL = (Bun.env.ADMIN_EMAIL || "admin@bakkerai.nl")
  .trim()
  .toLowerCase();

export const STUDENT_EMAIL_DOMAIN = "student.talland.nl";

export const AUTH_COOKIE_MAX_AGE = 7 * 86400;

export const VERIFICATION_CODE_TTL_MS = 10 * 60 * 1000;
export const VERIFICATION_RESEND_COOLDOWN_MS = 60 * 1000;
export const VERIFICATION_MAX_ATTEMPTS = 5;

export const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;
export const PASSWORD_RESET_COOLDOWN_MS = 60 * 1000;

const APP_URL = (Bun.env.APP_URL || "").replace(/\/+$/, "");

export function getAppUrl(requestUrl: string) {
  return APP_URL || new URL(requestUrl).origin;
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isStudentEmail(email: string) {
  const normalized = normalizeEmail(email);
  const separator = normalized.lastIndexOf("@");

  if (separator <= 0) return false;

  return (
    normalized.slice(separator + 1) === STUDENT_EMAIL_DOMAIN &&
    !normalized.slice(0, separator).includes(" ")
  );
}

export function isAdminEmail(email: string) {
  return normalizeEmail(email) === ADMIN_EMAIL;
}
