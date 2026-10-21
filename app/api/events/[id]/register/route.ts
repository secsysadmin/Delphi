import { NextResponse } from "next/server";
import { isSameOriginRequest } from "@/lib/auth";
import { createRegistration, updateEmailStatus } from "@/lib/store";
import { sendConfirmation } from "@/lib/email";

const attempts = new Map<string, { count: number; resetAt: number }>();

function rateLimited(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  if (attempts.size > 5000) attempts.forEach((entry, key) => { if (entry.resetAt < now) attempts.delete(key); });
  const current = attempts.get(ip);
  if (!current || current.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  current.count++;
  return current.count > 10;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (rateLimited(request)) return NextResponse.json({ error: "Too many attempts. Please wait a minute." }, { status: 429 });
  try {
    const { id } = await params;
    const result = await createRegistration(id, await request.json());
    let emailStatus = "previewed";
    try {
      const email = await sendConfirmation(result.registration, result.event, result.slot);
      emailStatus = email.status;
    } catch (error) {
      emailStatus = "failed";
      console.error("Confirmation email failed", error);
    }
    await updateEmailStatus(result.registration.id, emailStatus);
    return NextResponse.json({ registration: { ...result.registration, emailStatus }, emailStatus }, { status: 201 });
  } catch (error) {
    // Postgres errors carry a code; only our own validation messages are safe to show students.
    const code = (error as { code?: string })?.code;
    if (code === "23505") return NextResponse.json({ error: "This email is already registered for the event." }, { status: 409 });
    if (code || !(error instanceof Error)) {
      console.error("Registration failed", error);
      return NextResponse.json({ error: "Registration failed. Please try again." }, { status: 500 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
