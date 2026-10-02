import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getAdminUserByEmail, verifyAdminPassword } from "@/lib/admin-users";
import { hasDatabase } from "@/lib/db";

const COOKIE_NAME = "sec_admin_session";
const maxAge = 60 * 60 * 12;

function secret() {
  return process.env.AUTH_SECRET || "local-preview-secret-change-before-deploy";
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export async function validAdminCredentials(email: string, password: string) {
  if (hasDatabase) {
    const admin = await getAdminUserByEmail(email);
    return Boolean(admin && verifyAdminPassword(password, admin.passwordHash));
  }
  const expectedEmail = process.env.ADMIN_EMAIL || "admin@sec.tamu.edu";
  const expectedPassword = process.env.ADMIN_PASSWORD || "gig-em";
  const leftEmail = Buffer.from(email.toLowerCase());
  const rightEmail = Buffer.from(expectedEmail.toLowerCase());
  const leftPassword = Buffer.from(password);
  const rightPassword = Buffer.from(expectedPassword);
  return leftEmail.length === rightEmail.length && leftPassword.length === rightPassword.length
    && timingSafeEqual(leftEmail, rightEmail) && timingSafeEqual(leftPassword, rightPassword);
}

export function createSessionValue(email: string) {
  const payload = Buffer.from(JSON.stringify({ email, exp: Date.now() + maxAge * 1000 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifySessionValue(value?: string) {
  if (!value) return false;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return false;
  const expected = sign(payload);
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { exp: number };
    return data.exp > Date.now();
  } catch { return false; }
}

function sessionEmail(value?: string) {
  if (!verifySessionValue(value)) return null;
  const [payload] = value!.split(".");
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { email?: string };
    return data.email?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

export async function currentAdminEmail() {
  return sessionEmail((await cookies()).get(COOKIE_NAME)?.value);
}

export async function isAdmin() {
  const email = await currentAdminEmail();
  if (!email) return false;
  return hasDatabase ? Boolean(await getAdminUserByEmail(email)) : true;
}

export const sessionCookie = { name: COOKIE_NAME, maxAge };
