import { NextResponse } from "next/server";
import { isSameOriginRequest, registrationIdFromManageToken } from "@/lib/auth";
import { publicError } from "@/lib/errors";
import { sendConfirmation, sendWithdrawal } from "@/lib/email";
import { findRegistration, updateEmailStatus, updateRegistration, withdrawRegistration } from "@/lib/store";

async function registrationFor(request: Request, params: Promise<{ token: string }>) {
  if (!isSameOriginRequest(request)) return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  const registrationId = registrationIdFromManageToken((await params).token);
  const registration = registrationId ? await findRegistration(registrationId) : null;
  if (!registration) return { response: NextResponse.json({ error: "This link isn't valid. Request a new one from the event page." }, { status: 404 }) };
  return { registration };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { registration, response } = await registrationFor(request, params);
  if (!registration) return response;
  try {
    const result = await updateRegistration(registration, await request.json());
    // A new session means a new time and room, so send a confirmation they can rely on.
    if (result.slotChanged) {
      let emailStatus = "failed";
      try {
        emailStatus = (await sendConfirmation(result.registration, result.event, result.slot)).status;
      } catch (error) {
        console.error("Updated confirmation email failed", error);
      }
      await updateEmailStatus(result.registration.id, emailStatus);
      result.registration.emailStatus = emailStatus;
    }
    return NextResponse.json({ registration: result.registration, emailed: result.slotChanged });
  } catch (error) {
    return NextResponse.json({ error: publicError(error, "Your changes couldn't be saved. Please try again.") }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { registration, response } = await registrationFor(request, params);
  if (!registration) return response;
  try {
    const result = await withdrawRegistration(registration);
    if (result.withdrawn) {
      await sendWithdrawal(registration, result.event).catch((error) => console.error("Withdrawal email failed", error));
    }
    return NextResponse.json({ status: "cancelled" });
  } catch (error) {
    return NextResponse.json({ error: publicError(error, "Your registration couldn't be withdrawn. Please try again.") }, { status: 400 });
  }
}
