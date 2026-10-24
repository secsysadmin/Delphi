import { NextResponse } from "next/server";
import { publicError } from "@/lib/errors";
import { currentAdminEmail, isAdmin, isSameOriginRequest } from "@/lib/auth";
import { emailProvider, sendConfirmation } from "@/lib/email";
import { previewEvent } from "@/lib/store";
import type { EventInput } from "@/types";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const to = await currentAdminEmail();
  if (!to) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { event: input, slotId } = await request.json() as { event: EventInput; slotId?: string | null };
    const event = previewEvent(input);
    if (!emailProvider()) return NextResponse.json({ to, status: "previewed" });
    const slot = event.slots.find((item) => item.id === slotId) ?? null;
    const registration = { id: "test", eventId: event.id, slotId: slot?.id ?? null, firstName: "Reveille", lastName: "Aggie", email: to, uin: "", answers: {}, status: "confirmed" as const, emailStatus: "pending", createdAt: new Date().toISOString() };
    const result = await sendConfirmation(registration, event, slot, to);
    return NextResponse.json({ to, status: result.status });
  } catch (error) {
    return NextResponse.json({ error: publicError(error, "Could not send the test email.") }, { status: 400 });
  }
}
