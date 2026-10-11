import { NextResponse } from "next/server";
import { isSameOriginRequest, sessionCookie } from "@/lib/auth";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const response = NextResponse.redirect(new URL("/", request.url), 303);
  response.cookies.set(sessionCookie.name, "", { expires: new Date(0), path: "/" });
  return response;
}
