import { NextResponse } from "next/server";
import { createRegistration, updateEmailStatus } from "@/lib/store";
import { sendConfirmation } from "@/lib/email";

const attempts = new Map<string, { count: number; resetAt: number }>();

function rateLimited(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "local";
  const now = Date.now();
  const current = attempts.get(ip);
  if (!current || current.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  current.count++;
  return current.count > 10;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
    return NextResponse.json({ error: error instanceof Error ? error.message : "Registration failed." }, { status: 400 });
  }
}
