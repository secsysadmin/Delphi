import { NextResponse } from "next/server";
import { isAdmin, isSameOriginRequest } from "@/lib/auth";
import { sendConfirmation } from "@/lib/email";
import { getEvent, getRegistration, updateEmailStatus } from "@/lib/store";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; registrationId: string }> }) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, registrationId } = await params;
  const [event, registration] = await Promise.all([getEvent(id, true), getRegistration(id, registrationId)]);
  if (!event || !registration) return NextResponse.json({ error: "Participant not found." }, { status: 404 });
  let emailStatus = "failed";
  try {
    emailStatus = (await sendConfirmation(registration, event, event.slots.find((slot) => slot.id === registration.slotId) ?? null)).status;
  } catch (error) {
    console.error("Confirmation resend failed", error);
  }
  await updateEmailStatus(registration.id, emailStatus);
  if (emailStatus === "failed") return NextResponse.json({ error: "The confirmation couldn't be sent. Check the email address and try again.", emailStatus }, { status: 502 });
  return NextResponse.json({ emailStatus });
}
