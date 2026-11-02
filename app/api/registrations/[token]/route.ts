import { NextResponse } from "next/server";
import { isSameOriginRequest, registrationIdFromManageToken } from "@/lib/auth";
import { sendConfirmation, sendWithdrawal } from "@/lib/email";
import { publicError } from "@/lib/errors";
import { findRegistration, getEvent, updateEmailStatus, updateRegistration, withdrawRegistration } from "@/lib/store";
import type { Registration } from "@/types";

type TokenParams = { params: Promise<{ token: string }> };
type UpdateResult = Awaited<ReturnType<typeof updateRegistration>>;

const INVALID_LINK_MESSAGE = "This link isn't valid. Request a new one from the event page.";
const INCLUDE_DRAFTS = true;

async function registrationFor(request: Request, params: TokenParams["params"]) {
  if (!isSameOriginRequest(request)) return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  const registrationId = registrationIdFromManageToken((await params).token);
  const registration = registrationId ? await findRegistration(registrationId) : null;
  if (!registration) return { response: NextResponse.json({ error: INVALID_LINK_MESSAGE }, { status: 404 }) };
  return { registration };
}

async function resendConfirmation(result: UpdateResult) {
  let emailStatus = "failed";
  try {
    emailStatus = (await sendConfirmation(result.registration, result.event, result.slot)).status;
  } catch (error) {
    console.error(`Updated confirmation for registration ${result.registration.id} failed`, error);
  }
  await updateEmailStatus(result.registration.id, emailStatus);
  return emailStatus;
}

async function refreshedEvent(result: UpdateResult) {
  try {
    return await getEvent(result.event.id, INCLUDE_DRAFTS) ?? result.event;
  } catch (error) {
    console.error(`Refreshing event after update to registration ${result.registration.id} failed`, error);
    return result.event;
  }
}

async function confirmWithdrawal(registration: Registration, event: UpdateResult["event"]) {
  try {
    await sendWithdrawal(registration, event);
  } catch (error) {
    console.error(`Withdrawal email for registration ${registration.id} failed`, error);
  }
}

export async function PATCH(request: Request, { params }: TokenParams) {
  const { registration, response } = await registrationFor(request, params);
  if (!registration) return response;
  try {
    const result = await updateRegistration(registration, await request.json());
    const event = await refreshedEvent(result);
    if (!result.slotChanged) return NextResponse.json({ registration: result.registration, event, emailed: false });
    const emailStatus = await resendConfirmation(result);
    return NextResponse.json({ registration: { ...result.registration, emailStatus }, event, emailed: true });
  } catch (error) {
    return NextResponse.json({ error: publicError(error, "Your changes couldn't be saved. Please try again.") }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: TokenParams) {
  const { registration, response } = await registrationFor(request, params);
  if (!registration) return response;
  try {
    const result = await withdrawRegistration(registration);
    if (result.withdrawn) await confirmWithdrawal(registration, result.event);
    return NextResponse.json({ status: "cancelled" });
  } catch (error) {
    return NextResponse.json({ error: publicError(error, "Your registration couldn't be withdrawn. Please try again.") }, { status: 400 });
  }
}
