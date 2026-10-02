import { NextResponse } from "next/server";
import { createSessionValue, sessionCookie, validAdminCredentials } from "@/lib/auth";

const attempts = new Map<string, { count: number; resetAt: number }>();

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "local";
  const current = attempts.get(ip);
  if (current && current.resetAt > Date.now() && current.count >= 5) {
    return NextResponse.json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429 });
  }
  const { email, password } = await request.json() as { email?: string; password?: string };
  if (!email || !password || !(await validAdminCredentials(email, password))) {
    attempts.set(ip, { count: (current?.count ?? 0) + 1, resetAt: Date.now() + 15 * 60_000 });
    return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
  }
  attempts.delete(ip);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(sessionCookie.name, createSessionValue(email), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionCookie.maxAge,
  });
  return response;
}
