import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { EventEditor } from "@/components/event-editor";

export default async function NewEventPage() {
  if (!(await isAdmin())) redirect("/admin/login");
  return <EventEditor />;
}
