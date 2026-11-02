import { NextResponse } from "next/server";
import { isAdmin, isSameOriginRequest } from "@/lib/auth";
import { sendConfirmation } from "@/lib/email";
import { publicError } from "@/lib/errors";
import { deleteRegistration, DuplicateRegistrationError, updateEmailStatus, updateRegistrationEmail } from "@/lib/store";

// Corrects a registrant's email, then sends the confirmation (and its manage link) to the new address.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; registrationId: string }> }) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, registrationId } = await params;
  try {
    const { email } = await request.json() as { email?: unknown };
    const { registration, event } = await updateRegistrationEmail(id, registrationId, email);
    let emailStatus = "failed";
    try {
      emailStatus = (await sendConfirmation(registration, event, event.slots.find((slot) => slot.id === registration.slotId) ?? null)).status;
    } catch (error) {
      console.error("Confirmation to corrected email failed", error);
    }
    await updateEmailStatus(registration.id, emailStatus);
    return NextResponse.json({ registration: { ...registration, emailStatus } });
  } catch (error) {
    // A unique-index race surfaces as Postgres 23505; treat it like the pre-check.
    const duplicate = error instanceof DuplicateRegistrationError || (error as { code?: string })?.code === "23505";
    if (duplicate) return NextResponse.json({ error: "Someone is already registered for this event with that email." }, { status: 409 });
    return NextResponse.json({ error: publicError(error, "Could not update the email.") }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; registrationId: string }> }) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, registrationId } = await params;
  const deleted = await deleteRegistration(id, registrationId);
  if (!deleted) return NextResponse.json({ error: "Participant not found." }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
