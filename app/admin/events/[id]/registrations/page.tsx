import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { RegistrationManager } from "@/components/registration-manager";

type RegistrationsPageProps = { params: Promise<{ id: string }> };

export default async function RegistrationsPage({ params }: RegistrationsPageProps) {
  if (!(await isAdmin())) redirect("/admin/login");
  const { id } = await params;
  return <RegistrationManager eventId={id} />;
}
