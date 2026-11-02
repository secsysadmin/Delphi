import { NextResponse } from "next/server";
import { rejectNonAdminMutation } from "@/lib/api-guard";
import { sendBroadcast, type BroadcastResult } from "@/lib/email";
import { publicError } from "@/lib/errors";
import { getEvent, getRegistrations, logEmail } from "@/lib/store";

export const maxDuration = 60;

function broadcastStatus(result: BroadcastResult) {
  if (result.preview) return "previewed";
  if (!result.failed) return "sent";
  return result.sent ? "partial" : "failed";
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rejected = await rejectNonAdminMutation(request);
  if (rejected) return rejected;
  try {
    const { id } = await params;
    const { subject, body, registrationIds } = await request.json() as { subject?: string; body?: string; registrationIds?: string[] };
    if (!subject?.trim() || !body?.trim()) return NextResponse.json({ error: "Subject and message are required." }, { status: 400 });
    const [event, all] = await Promise.all([getEvent(id, true), getRegistrations(id)]);
    if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });
    if (!Array.isArray(registrationIds) || !registrationIds.length) return NextResponse.json({ error: "Select at least one confirmed recipient." }, { status: 400 });
    const registrations = all.filter((item) => registrationIds.includes(item.id) && item.status === "confirmed");
    if (!registrations.length) return NextResponse.json({ error: "No confirmed recipients selected." }, { status: 400 });
    const result = await sendBroadcast({ registrations, event, subject, body });
    await logEmail({ eventId: event.id, recipientCount: registrations.length, subject, status: broadcastStatus(result) })
      .catch((error) => console.error(`Could not log broadcast for event ${event.id}`, error));
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: publicError(error, "Could not send email.") }, { status: 400 });
  }
}
