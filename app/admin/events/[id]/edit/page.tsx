import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { EventEditor } from "@/components/event-editor";

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) redirect("/admin/login");
  const { id } = await params;
  return <EventEditor eventId={id} />;
}
