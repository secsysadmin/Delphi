import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { getEvent, getRegistrations } from "@/lib/store";
import { csvEscape } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const [event, registrations] = await Promise.all([getEvent(id, true), getRegistrations(id)]);
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });
  if (new URL(request.url).searchParams.get("format") === "csv") {
    const fields = event.formFields;
    const header = ["First name", "Last name", "Email", "UIN", "Status", "Time slot", "Registered at", ...fields.map((field) => field.label)];
    const lines = registrations.map((registration) => {
      const slot = event.slots.find((item) => item.id === registration.slotId)?.label ?? "";
      return [registration.firstName, registration.lastName, registration.email, registration.uin, registration.status, slot, registration.createdAt, ...fields.map((field) => registration.answers[field.id])].map(csvEscape).join(",");
    });
    return new Response([header.map(csvEscape).join(","), ...lines].join("\n"), {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${event.slug}-registrations.csv"` },
    });
  }
  return NextResponse.json({ event, registrations });
}
