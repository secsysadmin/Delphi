import { NextResponse } from "next/server";
import { isSameOriginRequest } from "@/lib/auth";
import { sendConfirmation } from "@/lib/email";
import { isDatabaseError, isUniqueViolation } from "@/lib/errors";
import { rateLimiter } from "@/lib/rate-limit";
import { createRegistration, DuplicateRegistrationError, updateEmailStatus } from "@/lib/store";

const RATE_LIMIT_MAX_ATTEMPTS = 10;

const rateLimited = rateLimiter({ limit: RATE_LIMIT_MAX_ATTEMPTS });

async function confirmationStatus(result: Awaited<ReturnType<typeof createRegistration>>) {
  try {
    return (await sendConfirmation(result.registration, result.event, result.slot)).status;
  } catch (error) {
    console.error(`Confirmation email for registration ${result.registration.id} failed`, error);
    return "failed";
  }
}

function registrationError(error: unknown) {
  if (error instanceof DuplicateRegistrationError || isUniqueViolation(error)) return NextResponse.json({ error: "This email is already registered for the event." }, { status: 409 });
  if (isDatabaseError(error) || !(error instanceof Error)) {
    console.error("Registration failed", error);
    return NextResponse.json({ error: "Registration failed. Please try again." }, { status: 500 });
  }
  return NextResponse.json({ error: error.message }, { status: 400 });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (rateLimited(request)) return NextResponse.json({ error: "Too many attempts. Please wait a minute." }, { status: 429 });
  try {
    const { id } = await params;
    const result = await createRegistration(id, await request.json());
    const emailStatus = await confirmationStatus(result);
    await updateEmailStatus(result.registration.id, emailStatus);
    return NextResponse.json({ registration: { ...result.registration, emailStatus }, emailStatus }, { status: 201 });
  } catch (error) {
    return registrationError(error);
  }
}
