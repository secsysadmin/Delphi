import { NextResponse } from "next/server";
import { rejectNonAdminMutation } from "@/lib/api-guard";
import { currentAdminEmail } from "@/lib/auth";
import { canSendEmail, sendConfirmation } from "@/lib/email";
import { publicError } from "@/lib/errors";
import { previewEvent } from "@/lib/store";
import { PREVIEW_PERSON } from "@/lib/utils";
import type { EventInput, Registration } from "@/types";

export async function POST(request: Request) {
  const rejected = await rejectNonAdminMutation(request);
  if (rejected) return rejected;
  const to = await currentAdminEmail();
  if (!to) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { event: input, slotId } = await request.json() as { event: EventInput; slotId?: string | null };
    const event = previewEvent(input);
    if (!canSendEmail()) return NextResponse.json({ to, status: "previewed" });
    const slot = event.slots.find((item) => item.id === slotId) ?? null;
    const registration: Registration = { ...PREVIEW_PERSON, id: "test", eventId: event.id, slotId: slot?.id ?? null, email: to, uin: "", answers: {}, status: "confirmed", emailStatus: "pending", createdAt: new Date().toISOString() };
    const result = await sendConfirmation(registration, event, slot);
    return NextResponse.json({ to, status: result.status });
  } catch (error) {
    return NextResponse.json({ error: publicError(error, "Could not send the test email.") }, { status: 400 });
  }
}
