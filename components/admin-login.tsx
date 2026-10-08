import { LockKeyhole } from "lucide-react";

const errorMessages: Record<string, string> = {
  not_configured: "Google sign-in isn't configured yet. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
  state: "Your sign-in session expired. Please try again.",
  unverified: "Your Google account's email isn't verified, so we can't sign you in.",
  google: "Something went wrong talking to Google. Please try again.",
};

export function AdminLogin({ error }: { error?: string }) {
  const message = error ? errorMessages[error] ?? "Something went wrong. Please try again." : null;
  return (
    <section className="login-page">
      <div className="login-card">
        <div className="login-icon"><LockKeyhole /></div>
        <span className="eyebrow">SEC team access</span>
        <h1>Administrator sign in</h1>
        {message && <div className="form-error">{message}</div>}
        <a className="button button--primary button--full" href="/api/auth/google">Sign in with Google</a>
        <p className="login-note">Access is limited to authorized SEC admins.</p>
      </div>
    </section>
  );
}
