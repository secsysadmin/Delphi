import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { sql } from "@/lib/db";

type AdminUserRow = {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
};

export type AdminUser = Omit<AdminUserRow, "passwordHash" | "createdAt"> & { createdAt: string };

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function publicUser(row: AdminUserRow): AdminUser {
  return { id: row.id, email: row.email, createdAt: row.createdAt.toISOString() };
}

export function hashAdminPassword(password: string) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export function verifyAdminPassword(password: string, storedHash: string) {
  const [algorithm, salt, expected] = storedHash.split("$");
  if (algorithm !== "scrypt" || !salt || !expected) return false;
  try {
    const expectedBuffer = Buffer.from(expected, "base64url");
    const actual = scryptSync(password, Buffer.from(salt, "base64url"), expectedBuffer.length);
    return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
  } catch {
    return false;
  }
}

export async function getAdminUserByEmail(email: string): Promise<AdminUserRow | null> {
  if (!sql) return null;
  const [user] = await sql<AdminUserRow[]>`
    select id, email, password_hash as "passwordHash", created_at as "createdAt"
    from sec_registration.admin_users
    where email = ${normalizeEmail(email)}
    limit 1
  `;
  return user ?? null;
}

export async function listAdminUsers(): Promise<AdminUser[]> {
  if (!sql) return [];
  const users = await sql<AdminUserRow[]>`
    select id, email, password_hash as "passwordHash", created_at as "createdAt"
    from sec_registration.admin_users
    order by created_at asc, email asc
  `;
  return users.map(publicUser);
}

export async function createAdminUser(email: string, password: string) {
  if (!sql) throw new Error("A database connection is required to manage administrators.");
  const normalizedEmail = normalizeEmail(email);
  if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) throw new Error("Enter a valid administrator email address.");
  if (password.length < 8) throw new Error("Administrator passwords must be at least 8 characters.");
  const existing = await getAdminUserByEmail(normalizedEmail);
  if (existing) throw new Error("An administrator with that email already exists.");
  const [user] = await sql<AdminUserRow[]>`
    insert into sec_registration.admin_users (email, password_hash)
    values (${normalizedEmail}, ${hashAdminPassword(password)})
    returning id, email, password_hash as "passwordHash", created_at as "createdAt"
  `;
  return publicUser(user);
}

export async function deleteAdminUser(id: string, currentEmail: string) {
  if (!sql) throw new Error("A database connection is required to manage administrators.");
  const [target] = await sql<AdminUserRow[]>`
    select id, email, password_hash as "passwordHash", created_at as "createdAt"
    from sec_registration.admin_users
    where id = ${id}
    limit 1
  `;
  if (!target) throw new Error("That administrator no longer exists.");
  if (target.email === normalizeEmail(currentEmail)) throw new Error("You cannot remove the account currently signed in.");
  const [{ count }] = await sql<{ count: string }[]>`select count(*)::text as count from sec_registration.admin_users`;
  if (Number(count) <= 1) throw new Error("At least one administrator must remain.");
  await sql`delete from sec_registration.admin_users where id = ${id}`;
}

export async function updateAdminPassword(email: string, oldPassword: string, newPassword: string) {
  if (!sql) throw new Error("A database connection is required to change an administrator password.");
  if (newPassword.length < 8) throw new Error("New passwords must be at least 8 characters.");
  const user = await getAdminUserByEmail(email);
  if (!user || !verifyAdminPassword(oldPassword, user.passwordHash)) {
    throw new Error("Your current password is incorrect.");
  }
  await sql`update sec_registration.admin_users set password_hash = ${hashAdminPassword(newPassword)} where id = ${user.id}`;
}
