"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Download, Mail, Pencil, RotateCw, Search, Send, Trash2, Users } from "lucide-react";
import { TEMPLATE_VARIABLES, formatAnswer, formatDate, formatRange, isQuestion } from "@/lib/utils";
import type { Registration, RegistrationEvent } from "@/types";
import { ConfirmDialog } from "@/components/confirm-dialog";

const emailStatusLabels: Record<string, string> = { sent: "Sent", delivered: "Sent", failed: "Failed", previewed: "Not sent", pending: "Pending" };

export function RegistrationManager({ eventId }: { eventId: string }) {
  const [event, setEvent] = useState<RegistrationEvent | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [showEmail, setShowEmail] = useState(false);
  const [subject, setSubject] = useState("An update about {{event}}");
  const [body, setBody] = useState("Howdy {{firstName}}!\n\nWe have an update to share about {{event}}:");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [pendingRemoval, setPendingRemoval] = useState<Registration | null>(null);
  const [resendingId, setResendingId] = useState("");
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    fetch(`/api/events/${eventId}/registrations`).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load registrations.");
      setEvent(data.event); setRegistrations(data.registrations ?? []);
    }).catch((error) => setLoadError(error instanceof Error && error.message !== "Failed to fetch" ? error.message : "Could not load registrations. Please refresh."));
  }, [eventId]);
  const visible = useMemo(() => registrations.filter((item) => `${item.firstName} ${item.lastName} ${item.email} ${item.uin}`.toLowerCase().includes(query.toLowerCase())), [registrations, query]);
  const fieldValues = event?.formFields.filter(isQuestion) ?? [];
  const hasSelectedRegistrants = selected.length > 0;

  async function sendEmail() {
    if (!hasSelectedRegistrants) return;
    setSending(true); setMessage("");
    const response = await fetch(`/api/events/${eventId}/email`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subject, body, registrationIds: selected }) }).catch(() => null);
    const data = response ? await response.json().catch(() => ({})) : {};
    setSending(false);
    if (!response?.ok) return setMessage(data.error || "Could not reach the server. Check your connection and try again.");
    const count = `${data.sent} recipient${data.sent === 1 ? "" : "s"}`;
    if (data.preview) return setMessage(`Previewed for ${count}. Email sending isn't set up on this server, so nothing was sent.`);
    setMessage(`Sent to ${count}.${data.failed ? ` Couldn't deliver to ${data.failedEmails?.join(", ") || `${data.failed} recipients`}.` : ""}`);
  }

  async function removeParticipant(registration: Registration) {
    setPendingRemoval(null);
    setDeletingId(registration.id);
    try {
      const response = await fetch(`/api/events/${eventId}/registrations/${registration.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not remove this participant.");
      setRegistrations((current) => current.filter((item) => item.id !== registration.id));
      setSelected((current) => current.filter((id) => id !== registration.id));
    } catch (error) {
      setNotice({ ok: false, text: error instanceof Error ? error.message : "Could not remove this participant." });
    } finally {
      setDeletingId("");
    }
  }

  async function resendConfirmation(registration: Registration) {
    setResendingId(registration.id);
    setNotice(null);
    const response = await fetch(`/api/events/${eventId}/registrations/${registration.id}/confirmation`, { method: "POST" }).catch(() => null);
    const data = response ? await response.json().catch(() => ({})) : {};
    setResendingId("");
    if (data.emailStatus) setRegistrations((current) => current.map((item) => item.id === registration.id ? { ...item, emailStatus: data.emailStatus } : item));
    if (!response?.ok) return setNotice({ ok: false, text: data.error || "Could not resend the confirmation." });
    setNotice({ ok: true, text: data.emailStatus === "sent" ? `Confirmation re-sent to ${registration.email}.` : `Email sending isn't set up on this server, so nothing was sent to ${registration.email}.` });
  }

  async function correctEmail(registration: Registration, email: string) {
    setNotice(null);
    const response = await fetch(`/api/events/${eventId}/registrations/${registration.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) }).catch(() => null);
    const data = response ? await response.json().catch(() => ({})) : {};
    if (!response?.ok || !data.registration) {
      setNotice({ ok: false, text: data.error || "Could not reach the server. Check your connection and try again." });
      return false;
    }
    const updated = data.registration as Registration;
    setRegistrations((current) => current.map((item) => item.id === updated.id ? updated : item));
    setNotice({ ok: updated.emailStatus !== "failed", text: updated.emailStatus === "sent" ? `Email changed to ${updated.email}. A new confirmation with their manage link is on its way.` : updated.emailStatus === "failed" ? `Email changed to ${updated.email}, but the confirmation couldn't be sent. Try the resend button.` : `Email changed to ${updated.email}. Email sending isn't set up on this server, so no confirmation was sent.` });
    return true;
  }

  if (loadError) return <div className="shell empty-state page-space"><h2>Registrations unavailable</h2><p>{loadError}</p><Link href="/admin" className="button button--primary">Back to dashboard</Link></div>;
  if (!event) return <div className="shell page-loading">Loading registrations…</div>;
  return <div className="shell admin-shell registrations-page">
    <Link href="/admin" className="back-link back-link--dark"><ArrowLeft /> Dashboard</Link>
    <div className="registrations-head"><div><span className="eyebrow">Registrations</span><h1>{event.title}</h1><p>{formatRange(event.startAt, event.endAt)} · {event.location}</p></div><div><a className="button button--secondary" href={`/api/events/${event.id}/registrations?format=csv`}><Download /> Export CSV</a><button className={`button button--selection ${hasSelectedRegistrants ? "button--primary" : "button--secondary"}`} onClick={() => setShowEmail((value) => !value)} disabled={!hasSelectedRegistrants} title={hasSelectedRegistrants ? "Email selected registrants" : "Select at least one participant to email"}><Mail /> Email registrants</button></div></div>
    <div className="metric-grid metric-grid--three"><div className="metric-card"><span><Users /></span><div><strong>{registrations.length}</strong><small>Total registrations</small></div></div><div className="metric-card"><span><Check /></span><div><strong>{registrations.filter((item) => item.status === "confirmed").length}</strong><small>Confirmed</small></div></div><div className="metric-card"><span><Mail /></span><div><strong>{registrations.filter((item) => ["sent", "delivered"].includes(item.emailStatus)).length}</strong><small>Confirmations sent{registrations.some((item) => item.emailStatus === "failed") ? ` · ${registrations.filter((item) => item.emailStatus === "failed").length} failed` : ""}</small></div></div></div>
    {showEmail && <section className="broadcast-panel"><div className="broadcast-panel__head"><div><span className="eyebrow">New message</span><h2>Email {selected.length} selected registrant{selected.length === 1 ? "" : "s"}</h2></div><button onClick={() => setShowEmail(false)}>×</button></div><div className="form-stack"><label>Subject<input value={subject} onChange={(e) => setSubject(e.target.value)} /></label><label>Message<textarea rows={6} value={body} onChange={(e) => setBody(e.target.value)} /></label><small>Variables supported: {TEMPLATE_VARIABLES.map((variable) => `{{${variable}}}`).join(", ")}</small></div>{message && <div className={(message.startsWith("Sent") || message.startsWith("Previewed")) && !message.includes("Couldn't deliver") ? "form-success" : "form-error"} role="status">{message}</div>}<button className="button button--primary" onClick={sendEmail} disabled={sending || !hasSelectedRegistrants}><Send /> {sending ? "Sending…" : "Send message"}</button></section>}
    {notice && <div className={notice.ok ? "form-success" : "form-error"} role="status">{notice.text}</div>}
    <section className="admin-panel registration-table-panel"><div className="admin-panel__head"><h2>Participant list</h2><label className="search-box search-box--small"><Search /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search participants" /></label></div>{visible.length ? <div className="registration-table-wrap"><table className="registration-table"><thead><tr><th><input type="checkbox" aria-label="Select all" checked={visible.length > 0 && visible.every((item) => selected.includes(item.id))} onChange={(e) => setSelected(e.target.checked ? visible.map((item) => item.id) : [])} /></th><th>Name</th><th>Email</th><th>UIN</th><th>Session</th>{fieldValues.map((field) => <th key={field.id}>{field.label}</th>)}<th>Confirmation</th><th>Registered</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{visible.map((registration) => <tr key={registration.id}><td><input type="checkbox" checked={selected.includes(registration.id)} onChange={(e) => setSelected((current) => e.target.checked ? [...current, registration.id] : current.filter((id) => id !== registration.id))} /></td><td><strong>{registration.firstName} {registration.lastName}</strong><small className={`registration-status registration-status--${registration.status}`}>{registration.status === "cancelled" ? "Withdrawn" : registration.status}</small></td><EmailCell registration={registration} onSave={(email) => correctEmail(registration, email)} /><td>{registration.uin || "—"}</td><td>{event.slots.find((slot) => slot.id === registration.slotId)?.label || "—"}</td>{fieldValues.map((field) => <td key={field.id}>{formatAnswer(registration.answers[field.id]) || "—"}</td>)}<td><span className={`email-status email-status--${registration.emailStatus}`}>{emailStatusLabels[registration.emailStatus] ?? registration.emailStatus}</span></td><td>{formatDate(registration.createdAt, true)}</td><td className="registration-table__actions"><button type="button" className="registration-resend" onClick={() => resendConfirmation(registration)} disabled={resendingId === registration.id || registration.status === "cancelled"} aria-label={`Resend confirmation to ${registration.firstName} ${registration.lastName}`} title={registration.status === "cancelled" ? "Withdrawn registrations can't be confirmed" : "Resend confirmation email"}><RotateCw /></button><button type="button" className="registration-delete" onClick={() => setPendingRemoval(registration)} disabled={deletingId === registration.id} aria-label={`Remove ${registration.firstName} ${registration.lastName}`} title="Remove participant"><Trash2 /></button></td></tr>)}</tbody></table></div> : <div className="empty-state"><Users /><h3>No registrations yet</h3><p>Registrants will appear here, even after the form closes.</p></div>}</section>
    <ConfirmDialog
      open={pendingRemoval !== null}
      title="Remove this participant?"
      description={pendingRemoval ? `${pendingRemoval.firstName} ${pendingRemoval.lastName} will be removed from this event's registration list. This can't be undone.` : ""}
      confirmLabel="Remove participant"
      tone="danger"
      onConfirm={() => pendingRemoval && removeParticipant(pendingRemoval)}
      onCancel={() => setPendingRemoval(null)}
    />
  </div>;
}

// Staff fix mistyped addresses here; saving re-sends the confirmation to the corrected email.
function EmailCell({ registration, onSave }: { registration: Registration; onSave: (email: string) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(registration.email);
  const [saving, setSaving] = useState(false);
  const name = `${registration.firstName} ${registration.lastName}`;

  async function save(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (!formEvent.currentTarget.reportValidity()) return;
    setSaving(true);
    const saved = await onSave(draft.trim());
    setSaving(false);
    if (saved) setEditing(false);
  }

  if (!editing) return <td><span className="registration-email">{registration.email}{registration.status !== "cancelled" && <button type="button" className="registration-email__edit" onClick={() => { setDraft(registration.email); setEditing(true); }} aria-label={`Fix email for ${name}`} title="Fix a mistyped email"><Pencil /></button>}</span></td>;
  return <td><form className="registration-email-form" onSubmit={save} onKeyDown={(event) => { if (event.key === "Escape") setEditing(false); }}><input type="email" required autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} aria-label={`Corrected email for ${name}`} /><div><button className="button button--primary" disabled={saving}>{saving ? "Saving…" : "Save & resend"}</button><button type="button" className="button button--secondary" onClick={() => setEditing(false)} disabled={saving}>Cancel</button></div></form></td>;
}
