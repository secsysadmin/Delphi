import { NextResponse } from "next/server";
import { isSameOriginRequest } from "@/lib/auth";
import { sendConfirmation } from "@/lib/email";
import { isDatabaseError, isUniqueViolation } from "@/lib/errors";
import { createRegistration, updateEmailStatus } from "@/lib/store";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_ATTEMPTS = 10;
const RATE_LIMIT_PRUNE_SIZE = 5000;

const attempts = new Map<string, { count: number; resetAt: number }>();

function pruneExpiredAttempts(now: number) {
  attempts.forEach((entry, key) => {
    if (entry.resetAt < now) attempts.delete(key);
  });
}

function rateLimited(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  if (attempts.size > RATE_LIMIT_PRUNE_SIZE) pruneExpiredAttempts(now);
  const current = attempts.get(ip);
  if (!current || current.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  current.count++;
  return current.count > RATE_LIMIT_MAX_ATTEMPTS;
}

async function confirmationStatus(result: Awaited<ReturnType<typeof createRegistration>>) {
  try {
    return (await sendConfirmation(result.registration, result.event, result.slot)).status;
  } catch (error) {
    console.error(`Confirmation email for registration ${result.registration.id} failed`, error);
    return "failed";
  }
}

function registrationError(error: unknown) {
  if (isUniqueViolation(error)) return NextResponse.json({ error: "This email is already registered for the event." }, { status: 409 });
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
