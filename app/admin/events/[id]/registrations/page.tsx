import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { RegistrationManager } from "@/components/registration-manager";

export default async function RegistrationsPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) redirect("/admin/login");
  const { id } = await params;
  return <RegistrationManager eventId={id} />;
}
