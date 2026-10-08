import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";

export const metadata: Metadata = { title: "Access denied" };

export default async function AdminBlockedPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  return (
    <section className="login-page">
      <div className="login-card">
        <div className="login-icon"><ShieldAlert /></div>
        <span className="eyebrow">SEC team access</span>
        <h1>You&apos;re not on the admin list</h1>
        <p>This Google account isn&apos;t whitelisted for SEC Registration Hub administration.</p>
        {email && <span className="blocked-email">{email}</span>}
        <div className="login-card__actions">
          <a className="button button--primary button--full" href="/api/auth/google">Try a different account</a>
          <Link className="button button--secondary button--full" href="/">Back to the event directory</Link>
        </div>
        <p className="login-note">Ask an existing administrator to add your email from the Manage administrators page.</p>
      </div>
    </section>
  );
}
