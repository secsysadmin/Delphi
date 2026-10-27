import { NextResponse } from "next/server";
import { rejectNonAdmin } from "@/lib/api-guard";
import { getEvent, getRegistrations } from "@/lib/store";
import { csvEscape, formatDate, isQuestion } from "@/lib/utils";
import type { Registration, RegistrationEvent } from "@/types";

export const dynamic = "force-dynamic";

const UTF8_BOM = "\uFEFF";
const FIXED_COLUMNS = ["First name", "Last name", "Email", "UIN", "Status", "Time slot", "Registered at"];

function registrationsCsv(event: RegistrationEvent, registrations: Registration[]) {
  const fields = event.formFields.filter(isQuestion);
  const header = [...FIXED_COLUMNS, ...fields.map((field) => field.label)];
  const lines = registrations.map((registration) => {
    const slot = event.slots.find((item) => item.id === registration.slotId)?.label ?? "";
    const answers = fields.map((field) => registration.answers[field.id]);
    return [registration.firstName, registration.lastName, registration.email, registration.uin, registration.status, slot, formatDate(registration.createdAt, true), ...answers].map(csvEscape).join(",");
  });
  return UTF8_BOM + [header.map(csvEscape).join(","), ...lines].join("\r\n");
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rejected = await rejectNonAdmin();
  if (rejected) return rejected;
  const { id } = await params;
  const [event, registrations] = await Promise.all([getEvent(id, true), getRegistrations(id)]);
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });
  if (new URL(request.url).searchParams.get("format") !== "csv") return NextResponse.json({ event, registrations });
  return new Response(registrationsCsv(event, registrations), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${event.slug}-registrations.csv"` },
  });
}
