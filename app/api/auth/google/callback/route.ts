import { NextRequest, NextResponse } from "next/server";
import { cookieOptions, createSessionValue, expiredCookie, isWhitelistedAdminEmail, oauthStateCookie, sessionCookie } from "@/lib/auth";
import { exchangeGoogleCode, fetchGoogleProfile, googleOAuthConfigured } from "@/lib/google-auth";

function clearState(response: NextResponse) {
  response.cookies.set(oauthStateCookie.name, "", expiredCookie);
  return response;
}

export async function GET(request: NextRequest) {
  const loginUrl = new URL("/admin/login", request.url);
  if (!googleOAuthConfigured) return NextResponse.redirect(`${loginUrl}?error=not_configured`);

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const cookieState = request.cookies.get(oauthStateCookie.name)?.value;
  if (!code || !state || !cookieState || state !== cookieState) {
    return clearState(NextResponse.redirect(`${loginUrl}?error=state`));
  }

  try {
    const { access_token } = await exchangeGoogleCode(code, request.url);
    const profile = await fetchGoogleProfile(access_token);
    if (!profile.email || !profile.email_verified) {
      return clearState(NextResponse.redirect(`${loginUrl}?error=unverified`));
    }

    const email = profile.email.toLowerCase();
    if (!(await isWhitelistedAdminEmail(email))) {
      const blockedUrl = new URL("/admin/blocked", request.url);
      blockedUrl.searchParams.set("email", email);
      return clearState(NextResponse.redirect(blockedUrl));
    }

    const response = NextResponse.redirect(new URL("/admin", request.url));
    response.cookies.set(sessionCookie.name, createSessionValue(email), cookieOptions(sessionCookie.maxAge));
    return clearState(response);
  } catch (error) {
    console.error("Google sign-in failed", error);
    return clearState(NextResponse.redirect(`${loginUrl}?error=google`));
  }
}
