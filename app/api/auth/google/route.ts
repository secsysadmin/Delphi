import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { oauthStateCookie } from "@/lib/auth";
import { googleAuthorizeUrl, googleOAuthConfigured } from "@/lib/google-auth";

export async function GET(request: Request) {
  if (!googleOAuthConfigured) {
    return NextResponse.redirect(new URL("/admin/login?error=not_configured", request.url));
  }
  const state = randomBytes(24).toString("base64url");
  const response = NextResponse.redirect(googleAuthorizeUrl(request.url, state));
  response.cookies.set(oauthStateCookie.name, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: oauthStateCookie.maxAge,
  });
  return response;
}
