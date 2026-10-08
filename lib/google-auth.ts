const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

export const googleOAuthConfigured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export function googleRedirectUri(requestUrl: string) {
  return new URL("/api/auth/google/callback", new URL(requestUrl).origin).toString();
}

export function googleAuthorizeUrl(requestUrl: string, state: string) {
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!);
  url.searchParams.set("redirect_uri", googleRedirectUri(requestUrl));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export async function exchangeGoogleCode(code: string, requestUrl: string) {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: googleRedirectUri(requestUrl),
      grant_type: "authorization_code",
    }),
  });
  if (!response.ok) throw new Error(`Google token exchange failed: ${await response.text()}`);
  return response.json() as Promise<{ access_token: string }>;
}

export async function fetchGoogleProfile(accessToken: string) {
  const response = await fetch(USERINFO_URL, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(`Google userinfo request failed: ${await response.text()}`);
  return response.json() as Promise<{ email?: string; email_verified?: boolean; name?: string }>;
}
