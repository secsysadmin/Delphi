import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { cookieOptions, oauthStateCookie } from "@/lib/auth";
import { googleAuthorizeUrl, googleOAuthConfigured } from "@/lib/google-auth";

const STATE_BYTES = 24;

export async function GET(request: Request) {
  if (!googleOAuthConfigured) {
    return NextResponse.redirect(new URL("/admin/login?error=not_configured", request.url));
  }
  const state = randomBytes(STATE_BYTES).toString("base64url");
  const response = NextResponse.redirect(googleAuthorizeUrl(request.url, state));
  response.cookies.set(oauthStateCookie.name, state, cookieOptions(oauthStateCookie.maxAge));
  return response;
}
