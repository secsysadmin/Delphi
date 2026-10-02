"use client";

import { FormEvent, useState } from "react";
import { LockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";

export function AdminLogin({ preview }: { preview: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setLoading(true); setError("");
    const response = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: form.get("email"), password: form.get("password") }) });
    const data = await response.json();
    if (!response.ok) { setLoading(false); setError(data.error); return; }
    router.push("/admin"); router.refresh();
  }
  return <section className="login-page"><div className="login-card"><div className="login-icon"><LockKeyhole /></div><span className="eyebrow">SEC team access</span><h1>Administrator sign in</h1><p>Manage events, registrations, forms, and participant email.</p>{preview && <div className="preview-note"><strong>Preview credentials</strong><span>admin@sec.tamu.edu / gig-em</span></div>}<form onSubmit={submit}><label>Email address<input name="email" type="email" required defaultValue={preview ? "admin@sec.tamu.edu" : ""} autoComplete="username" /></label><label>Password<input name="password" type="password" required defaultValue={preview ? "gig-em" : ""} autoComplete="current-password" /></label>{error && <div className="form-error">{error}</div>}<button className="button button--primary button--full" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</button></form></div></section>;
}
