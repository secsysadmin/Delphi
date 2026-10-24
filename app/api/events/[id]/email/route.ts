import { NextResponse } from "next/server";
import { publicError } from "@/lib/errors";
import { isAdmin, isSameOriginRequest } from "@/lib/auth";
import { sendBroadcast } from "@/lib/email";
import { getEvent, getRegistrations, logEmail } from "@/lib/store";

export const maxDuration = 60;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const { subject, body, registrationIds } = await request.json() as { subject?: string; body?: string; registrationIds?: string[] };
    if (!subject?.trim() || !body?.trim()) return NextResponse.json({ error: "Subject and message are required." }, { status: 400 });
    const [event, all] = await Promise.all([getEvent(id, true), getRegistrations(id)]);
    if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });
    if (!Array.isArray(registrationIds) || !registrationIds.length) return NextResponse.json({ error: "Select at least one confirmed recipient." }, { status: 400 });
    const registrations = all.filter((item) => registrationIds.includes(item.id) && item.status === "confirmed");
    if (!registrations.length) return NextResponse.json({ error: "No confirmed recipients selected." }, { status: 400 });
    const result = await sendBroadcast(registrations, event, subject, body);
    const status = result.preview ? "previewed" : result.failed ? (result.sent ? "partial" : "failed") : "sent";
    await logEmail(event.id, registrations.length, subject, status).catch((error) => console.error("Could not log broadcast", error));
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: publicError(error, "Could not send email.") }, { status: 400 });
  }
}
