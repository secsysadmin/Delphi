import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { AdminLogin } from "@/components/admin-login";

export const metadata: Metadata = { title: "Admin sign in" };

type AdminLoginPageProps = { searchParams: Promise<{ error?: string }> };

export default async function AdminLoginPage({ searchParams }: AdminLoginPageProps) {
  if (await isAdmin()) redirect("/admin");
  const { error } = await searchParams;
  return <AdminLogin error={error} />;
}
