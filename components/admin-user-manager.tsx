"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import type { AdminUser } from "@/lib/admin-users";
import { ConfirmDialog } from "@/components/confirm-dialog";

export function AdminUserManager({ initialUsers, currentEmail }: { initialUsers: AdminUser[]; currentEmail: string }) {
  const [users, setUsers] = useState(initialUsers);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<AdminUser | null>(null);

  async function addUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    setSaving(true); setMessage(""); setError("");
    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: fields.get("email") }),
    });
    const data = await response.json();
    setSaving(false);
    if (!response.ok) { setError(data.error || "Unable to add administrator."); return; }
    setUsers((existing) => [...existing, data.user]);
    form.reset();
    setMessage("Administrator added. They can sign in with Google using that email address.");
  }

  async function removeUser(user: AdminUser) {
    setPendingRemoval(null);
    setDeletingId(user.id); setMessage(""); setError("");
    const response = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
    const data = await response.json();
    setDeletingId(null);
    if (!response.ok) { setError(data.error || "Unable to remove administrator."); return; }
    setUsers((existing) => existing.filter((candidate) => candidate.id !== user.id));
    setMessage("Administrator removed.");
  }

  return <main className="admin-shell shell admin-users-page">
    <Link className="back-link" href="/admin"><ArrowLeft size={15} /> Dashboard</Link>
    <div className="admin-users-heading">
      <div><h1>Manage administrators</h1><p>Whitelist the Google accounts that can sign in to create events, manage registrations, and send participant email.</p></div>
    </div>
    <div className="admin-users-layout">
      <section className="admin-panel admin-user-list" aria-labelledby="admin-list-heading">
        <div className="admin-user-list__head"><h2 id="admin-list-heading">Administrator accounts</h2><span>{users.length} {users.length === 1 ? "account" : "accounts"}</span></div>
        {users.length ? <ul>{users.map((user) => {
          const isCurrentUser = user.email === currentEmail.toLowerCase();
          return <li key={user.id}><div><strong>{user.email}</strong><small>{isCurrentUser ? "Current account" : "Administrator access"}</small></div><button className="registration-delete" type="button" onClick={() => setPendingRemoval(user)} disabled={isCurrentUser || deletingId === user.id} title={isCurrentUser ? "You cannot remove the account currently signed in" : `Remove ${user.email}`} aria-label={`Remove ${user.email}`}><Trash2 size={16} /></button></li>;
        })}</ul> : <p className="admin-user-list__empty">No administrator accounts exist yet.</p>}
      </section>
      <div className="admin-user-actions">
        <section className="admin-panel admin-user-form" aria-labelledby="add-admin-heading">
          <h2 id="add-admin-heading">Add an administrator</h2>
          <p>Whitelist a Google account by email. They&apos;ll be able to sign in immediately with &quot;Sign in with Google&quot; using that address.</p>
          <form onSubmit={addUser}>
            <label>Email address<input name="email" type="email" autoComplete="email" required /></label>
            {error && <p className="form-error" role="alert">{error}</p>}
            {message && <p className="form-success" role="status">{message}</p>}
            <button className="button button--primary" disabled={saving}><Plus size={16} /> {saving ? "Adding…" : "Add administrator"}</button>
          </form>
        </section>
      </div>
    </div>
    <ConfirmDialog
      open={pendingRemoval !== null}
      title="Remove administrator access?"
      description={pendingRemoval ? `${pendingRemoval.email} will no longer be able to sign in to the admin dashboard. You can whitelist them again at any time.` : ""}
      confirmLabel="Remove access"
      tone="danger"
      onConfirm={() => pendingRemoval && removeUser(pendingRemoval)}
      onCancel={() => setPendingRemoval(null)}
    />
  </main>;
}
