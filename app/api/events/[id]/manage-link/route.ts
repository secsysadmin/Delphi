import { after, NextResponse } from "next/server";
import { isSameOriginRequest } from "@/lib/auth";
import { canSendEmail, sendManageLink } from "@/lib/email";
import { rateLimiter } from "@/lib/rate-limit";
import { findActiveRegistrationByEmail, getEvent, REGISTRANT_EMAIL_PATTERN } from "@/lib/store";
import type { Registration, RegistrationEvent } from "@/types";

const RATE_LIMIT_MAX_ATTEMPTS = 5;

const rateLimited = rateLimiter({ limit: RATE_LIMIT_MAX_ATTEMPTS });

async function emailManageLink(registration: Registration, event: RegistrationEvent) {
  try {
    await sendManageLink(registration, event);
  } catch (error) {
    console.error(`Manage link email for registration ${registration.id} failed`, error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (rateLimited(request)) return NextResponse.json({ error: "Too many attempts. Please wait a minute." }, { status: 429 });
  const { id } = await params;
  const { email } = await request.json().catch(() => ({})) as { email?: unknown };
  if (typeof email !== "string" || !REGISTRANT_EMAIL_PATTERN.test(email.trim())) {
    return NextResponse.json({ error: "Enter the email address you registered with." }, { status: 400 });
  }
  const event = await getEvent(id);
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });
  const registration = await findActiveRegistrationByEmail(event.id, email);
  // Sent after responding so response timing doesn't reveal whether the address is registered.
  if (registration) after(() => emailManageLink(registration, event));
  return NextResponse.json({ ok: true, preview: !canSendEmail() });
}
