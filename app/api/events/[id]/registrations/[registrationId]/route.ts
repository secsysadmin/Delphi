import { NextResponse } from "next/server";
import { rejectNonAdminMutation } from "@/lib/api-guard";
import { sendConfirmation } from "@/lib/email";
import { isUniqueViolation, publicError } from "@/lib/errors";
import { deleteRegistration, DuplicateRegistrationError, updateEmailStatus, updateRegistrationEmail } from "@/lib/store";
import type { Registration, RegistrationEvent } from "@/types";

async function confirmCorrectedEmail(registration: Registration, event: RegistrationEvent) {
  try {
    return (await sendConfirmation(registration, event, event.slots.find((slot) => slot.id === registration.slotId) ?? null)).status;
  } catch (error) {
    console.error(`Confirmation to corrected email for registration ${registration.id} failed`, error);
    return "failed";
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; registrationId: string }> }) {
  const rejected = await rejectNonAdminMutation(request);
  if (rejected) return rejected;
  const { id, registrationId } = await params;
  try {
    const { email } = await request.json() as { email?: unknown };
    const { registration, event } = await updateRegistrationEmail(id, registrationId, email);
    const emailStatus = await confirmCorrectedEmail(registration, event);
    await updateEmailStatus(registration.id, emailStatus);
    return NextResponse.json({ registration: { ...registration, emailStatus } });
  } catch (error) {
    if (error instanceof DuplicateRegistrationError || isUniqueViolation(error)) return NextResponse.json({ error: "Someone is already registered for this event with that email." }, { status: 409 });
    return NextResponse.json({ error: publicError(error, "Could not update the email.") }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; registrationId: string }> }) {
  const rejected = await rejectNonAdminMutation(request);
  if (rejected) return rejected;
  const { id, registrationId } = await params;
  const deleted = await deleteRegistration(id, registrationId);
  if (!deleted) return NextResponse.json({ error: "Participant not found." }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
