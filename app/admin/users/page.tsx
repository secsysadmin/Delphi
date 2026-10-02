import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminUserManager } from "@/components/admin-user-manager";
import { currentAdminEmail, isAdmin } from "@/lib/auth";
import { listAdminUsers } from "@/lib/admin-users";
import { hasDatabase } from "@/lib/db";

export const metadata: Metadata = { title: "Manage administrators" };

export default async function AdminUsersPage() {
  if (!(await isAdmin())) redirect("/admin/login");
  if (!hasDatabase) redirect("/admin");
  const [users, currentEmail] = await Promise.all([listAdminUsers(), currentAdminEmail()]);
  return <AdminUserManager initialUsers={users} currentEmail={currentEmail ?? ""} />;
}
