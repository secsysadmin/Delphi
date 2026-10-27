import { NextResponse } from "next/server";
import { rejectNonAdminMutation } from "@/lib/api-guard";
import { sendConfirmation } from "@/lib/email";
import { getEvent, getRegistration, updateEmailStatus } from "@/lib/store";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; registrationId: string }> }) {
  const rejected = await rejectNonAdminMutation(request);
  if (rejected) return rejected;
  const { id, registrationId } = await params;
  const [event, registration] = await Promise.all([getEvent(id, true), getRegistration(id, registrationId)]);
  if (!event || !registration) return NextResponse.json({ error: "Participant not found." }, { status: 404 });
  let emailStatus = "failed";
  try {
    emailStatus = (await sendConfirmation(registration, event, event.slots.find((slot) => slot.id === registration.slotId) ?? null)).status;
  } catch (error) {
    console.error(`Confirmation resend for registration ${registration.id} failed`, error);
  }
  await updateEmailStatus(registration.id, emailStatus);
  if (emailStatus === "failed") return NextResponse.json({ error: "The confirmation couldn't be sent. Check the email address and try again.", emailStatus }, { status: 502 });
  return NextResponse.json({ emailStatus });
}
