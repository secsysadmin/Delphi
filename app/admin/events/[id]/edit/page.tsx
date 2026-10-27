import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { EventEditor } from "@/components/event-editor";

type EditEventPageProps = { params: Promise<{ id: string }> };

export default async function EditEventPage({ params }: EditEventPageProps) {
  if (!(await isAdmin())) redirect("/admin/login");
  const { id } = await params;
  return <EventEditor eventId={id} />;
}
