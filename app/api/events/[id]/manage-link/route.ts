import { after, NextResponse } from "next/server";
import { isSameOriginRequest } from "@/lib/auth";
import { emailProvider, sendManageLink } from "@/lib/email";
import { rateLimiter } from "@/lib/rate-limit";
import { findActiveRegistrationByEmail, getEvent } from "@/lib/store";

const rateLimited = rateLimiter(5);

// Emails a registrant their manage link. The reply is the same whether or not the address is
// registered, so this can't be used to find out who signed up.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (rateLimited(request)) return NextResponse.json({ error: "Too many attempts. Please wait a minute." }, { status: 429 });
  const { id } = await params;
  const { email } = await request.json().catch(() => ({})) as { email?: unknown };
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return NextResponse.json({ error: "Enter the email address you registered with." }, { status: 400 });
  }
  const event = await getEvent(id);
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });
  const registration = await findActiveRegistrationByEmail(event.id, email);
  // Sent after responding, so a slower reply doesn't give away that the address is registered.
  if (registration) after(() => sendManageLink(registration, event).catch((error) => console.error("Manage link email failed", error)));
  return NextResponse.json({ ok: true, preview: !emailProvider() });
}
