import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { AdminLogin } from "@/components/admin-login";

export const metadata: Metadata = { title: "Admin sign in" };

export default async function AdminLoginPage() {
  if (await isAdmin()) redirect("/admin");
  return <AdminLogin preview={!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD} />;
}
