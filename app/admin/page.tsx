import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { AdminDashboard } from "@/components/admin-dashboard";

export const metadata: Metadata = { title: "Admin dashboard" };

export default async function AdminPage() {
  if (!(await isAdmin())) redirect("/admin/login");
  return <AdminDashboard preview={!process.env.DATABASE_URL} />;
}
