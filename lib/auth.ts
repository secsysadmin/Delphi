import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getAdminUserByEmail, normalizeEmail } from "@/lib/admin-users";
import { hasDatabase } from "@/lib/db";

const COOKIE_NAME = "sec_admin_session";
const STATE_COOKIE_NAME = "sec_google_oauth_state";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;
const OAUTH_STATE_MAX_AGE_SECONDS = 60 * 10;
const PREVIEW_SECRET = "local-preview-secret-change-before-deploy";
const DEFAULT_PREVIEW_ADMIN = "admin@sec.tamu.edu";
const SAME_SITE_FETCH_VALUES = new Set(["same-origin", "none"]);

export const sessionCookie = { name: COOKIE_NAME, maxAge: SESSION_MAX_AGE_SECONDS };
export const oauthStateCookie = { name: STATE_COOKIE_NAME, maxAge: OAUTH_STATE_MAX_AGE_SECONDS };
export const expiredCookie = { expires: new Date(0), path: "/" };

type Session = { email?: string; exp: number };

export function cookieOptions(maxAge: number) {
  return { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge };
}

function secret() {
  const configured = process.env.AUTH_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET must be configured in production.");
  return PREVIEW_SECRET;
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function previewAdminEmails() {
  return (process.env.ADMIN_EMAIL || DEFAULT_PREVIEW_ADMIN).split(",").map(normalizeEmail).filter(Boolean);
}

export async function isWhitelistedAdminEmail(email: string) {
  if (hasDatabase) return Boolean(await getAdminUserByEmail(email));
  return previewAdminEmails().includes(normalizeEmail(email));
}

export function createSessionValue(email: string) {
  const session: Session = { email, exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000 };
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function hasValidSignature(payload: string, signature: string) {
  const expected = sign(payload);
  return signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

function parseSession(payload: string): Session | null {
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString()) as Session;
  } catch {
    return null;
  }
}

function sessionEmail(value?: string) {
  const [payload, signature] = value?.split(".") ?? [];
  if (!payload || !signature || !hasValidSignature(payload, signature)) return null;
  const session = parseSession(payload);
  if (typeof session?.exp !== "number" || session.exp <= Date.now()) return null;
  return session.email?.toLowerCase() ?? null;
}

export async function currentAdminEmail() {
  return sessionEmail((await cookies()).get(COOKIE_NAME)?.value);
}

export async function isAdmin() {
  const email = await currentAdminEmail();
  if (!email) return false;
  return hasDatabase ? Boolean(await getAdminUserByEmail(email)) : true;
}

function originMatches(origin: string, requestUrl: string) {
  try {
    return new URL(origin).origin === new URL(requestUrl).origin;
  } catch {
    return false;
  }
}

export function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (origin) return originMatches(origin, request.url);
  const fetchSite = request.headers.get("sec-fetch-site");
  return fetchSite === null || SAME_SITE_FETCH_VALUES.has(fetchSite);
}
