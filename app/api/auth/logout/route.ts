import { NextResponse } from "next/server";
import { sessionCookie } from "@/lib/auth";

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/", request.url), 303);
  response.cookies.set(sessionCookie.name, "", { expires: new Date(0), path: "/" });
  return response;
}
