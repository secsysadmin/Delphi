import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { sendBroadcast } from "@/lib/email";
import { getEvent, getRegistrations } from "@/lib/store";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const { subject, body, registrationIds } = await request.json() as { subject?: string; body?: string; registrationIds?: string[] };
    if (!subject?.trim() || !body?.trim()) return NextResponse.json({ error: "Subject and message are required." }, { status: 400 });
    const [event, all] = await Promise.all([getEvent(id, true), getRegistrations(id)]);
    if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });
    const registrations = Array.isArray(registrationIds) && registrationIds.length
      ? all.filter((item) => registrationIds.includes(item.id) && item.status === "confirmed")
      : all.filter((item) => item.status === "confirmed");
    if (!registrations.length) return NextResponse.json({ error: "No confirmed recipients selected." }, { status: 400 });
    const result = await sendBroadcast(registrations, event, subject, body);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not send email." }, { status: 400 });
  }
}
