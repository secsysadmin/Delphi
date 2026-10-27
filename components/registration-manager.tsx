"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Download, Mail, RotateCw, Search, Send, Trash2, Users } from "lucide-react";
import { getJson, jsonRequest, sendJson } from "@/lib/api-client";
import { TEMPLATE_VARIABLES, formatAnswer, formatDate, formatRange, isQuestion, plural } from "@/lib/utils";
import type { FormField, Registration, RegistrationEvent } from "@/types";
import { ConfirmDialog } from "@/components/confirm-dialog";

type Notice = { ok: boolean; text: string };
type BroadcastResponse = { sent: number; failed: number; failedEmails: string[]; preview: boolean };
type RegistrationManagerProps = { eventId: string };
type ParticipantRowProps = {
  registration: Registration;
  event: RegistrationEvent;
  questions: FormField[];
  selected: boolean;
  resending: boolean;
  deleting: boolean;
  onSelect: (selected: boolean) => void;
  onResend: () => void;
  onRemove: () => void;
};

const EMAIL_STATUS_LABELS: Record<string, string> = { sent: "Sent", delivered: "Sent", failed: "Failed", previewed: "Not sent", pending: "Pending" };
const SENT_EMAIL_STATUSES = new Set(["sent", "delivered"]);
const DEFAULT_BROADCAST_SUBJECT = "An update about {{event}}";
const DEFAULT_BROADCAST_BODY = "Howdy {{firstName}}!\n\nWe have an update to share about {{event}}:";

function broadcastNotice({ sent, failed, failedEmails, preview }: Partial<BroadcastResponse>): Notice {
  const count = plural(sent ?? 0, "recipient");
  if (preview) return { ok: true, text: `Previewed for ${count}. Email sending isn't set up on this server, so nothing was sent.` };
  if (!failed) return { ok: true, text: `Sent to ${count}.` };
  return { ok: false, text: `Sent to ${count}. Couldn't deliver to ${failedEmails?.join(", ") || `${failed} recipients`}.` };
}

function ParticipantRow({ registration, event, questions, selected, resending, deleting, onSelect, onResend, onRemove }: ParticipantRowProps) {
  const name = `${registration.firstName} ${registration.lastName}`;
  return <tr><td><input type="checkbox" checked={selected} onChange={(e) => onSelect(e.target.checked)} /></td><td><strong>{name}</strong><small>{registration.status}</small></td><td>{registration.email}</td><td>{registration.uin || "—"}</td><td>{event.slots.find((slot) => slot.id === registration.slotId)?.label || "—"}</td>{questions.map((field) => <td key={field.id}>{formatAnswer(registration.answers[field.id]) || "—"}</td>)}<td><span className={`email-status email-status--${registration.emailStatus}`}>{EMAIL_STATUS_LABELS[registration.emailStatus] ?? registration.emailStatus}</span></td><td>{formatDate(registration.createdAt, true)}</td><td className="registration-table__actions"><button type="button" className="registration-resend" onClick={onResend} disabled={resending} aria-label={`Resend confirmation to ${name}`} title="Resend confirmation email"><RotateCw /></button><button type="button" className="registration-delete" onClick={onRemove} disabled={deleting} aria-label={`Remove ${name}`} title="Remove participant"><Trash2 /></button></td></tr>;
}

export function RegistrationManager({ eventId }: RegistrationManagerProps) {
  const [event, setEvent] = useState<RegistrationEvent | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [showEmail, setShowEmail] = useState(false);
  const [subject, setSubject] = useState(DEFAULT_BROADCAST_SUBJECT);
  const [body, setBody] = useState(DEFAULT_BROADCAST_BODY);
  const [message, setMessage] = useState<Notice | null>(null);
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [pendingRemoval, setPendingRemoval] = useState<Registration | null>(null);
  const [resendingId, setResendingId] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    getJson<{ event: RegistrationEvent; registrations?: Registration[] }>(`/api/events/${eventId}/registrations`)
      .then((data) => { setEvent(data.event); setRegistrations(data.registrations ?? []); })
      .catch((error: Error) => setLoadError(error.message));
  }, [eventId]);
  const visible = useMemo(() => registrations.filter((item) => `${item.firstName} ${item.lastName} ${item.email} ${item.uin}`.toLowerCase().includes(query.toLowerCase())), [registrations, query]);
  const questions = event?.formFields.filter(isQuestion) ?? [];
  const hasSelectedRegistrants = selected.length > 0;
  const failedCount = registrations.filter((item) => item.emailStatus === "failed").length;

  async function sendEmail() {
    if (!hasSelectedRegistrants) return;
    setSending(true); setMessage(null);
    const { ok, data, error } = await sendJson<BroadcastResponse>(`/api/events/${eventId}/email`, jsonRequest("POST", { subject, body, registrationIds: selected }));
    setSending(false);
    setMessage(ok ? broadcastNotice(data) : { ok: false, text: error || "Could not send email." });
  }

  async function removeParticipant(registration: Registration) {
    setPendingRemoval(null);
    setDeletingId(registration.id);
    const { ok, error } = await sendJson<{ deleted: boolean }>(`/api/events/${eventId}/registrations/${registration.id}`, { method: "DELETE" });
    setDeletingId("");
    if (!ok) return setNotice({ ok: false, text: error || "Could not remove this participant." });
    setRegistrations((current) => current.filter((item) => item.id !== registration.id));
    setSelected((current) => current.filter((id) => id !== registration.id));
  }

  async function resendConfirmation(registration: Registration) {
    setResendingId(registration.id);
    setNotice(null);
    const { ok, data, error } = await sendJson<{ emailStatus: string }>(`/api/events/${eventId}/registrations/${registration.id}/confirmation`, { method: "POST" });
    setResendingId("");
    const { emailStatus } = data;
    if (emailStatus) setRegistrations((current) => current.map((item) => item.id === registration.id ? { ...item, emailStatus } : item));
    if (!ok) return setNotice({ ok: false, text: error || "Could not resend the confirmation." });
    setNotice({ ok: true, text: data.emailStatus === "sent" ? `Confirmation re-sent to ${registration.email}.` : `Email sending isn't set up on this server, so nothing was sent to ${registration.email}.` });
  }

  if (loadError) return <div className="shell empty-state page-space"><h2>Registrations unavailable</h2><p>{loadError}</p><Link href="/admin" className="button button--primary">Back to dashboard</Link></div>;
  if (!event) return <div className="shell page-loading">Loading registrations…</div>;
  return <div className="shell admin-shell registrations-page">
    <Link href="/admin" className="back-link back-link--dark"><ArrowLeft /> Dashboard</Link>
    <div className="registrations-head"><div><span className="eyebrow">Registrations</span><h1>{event.title}</h1><p>{formatRange(event.startAt, event.endAt)} · {event.location}</p></div><div><a className="button button--secondary" href={`/api/events/${event.id}/registrations?format=csv`}><Download /> Export CSV</a><button className={`button button--selection ${hasSelectedRegistrants ? "button--primary" : "button--secondary"}`} onClick={() => setShowEmail((value) => !value)} disabled={!hasSelectedRegistrants} title={hasSelectedRegistrants ? "Email selected registrants" : "Select at least one participant to email"}><Mail /> Email registrants</button></div></div>
    <div className="metric-grid metric-grid--three"><div className="metric-card"><span><Users /></span><div><strong>{registrations.length}</strong><small>Total registrations</small></div></div><div className="metric-card"><span><Check /></span><div><strong>{registrations.filter((item) => item.status === "confirmed").length}</strong><small>Confirmed</small></div></div><div className="metric-card"><span><Mail /></span><div><strong>{registrations.filter((item) => SENT_EMAIL_STATUSES.has(item.emailStatus)).length}</strong><small>Confirmations sent{failedCount ? ` · ${failedCount} failed` : ""}</small></div></div></div>
    {showEmail && <section className="broadcast-panel"><div className="broadcast-panel__head"><div><span className="eyebrow">New message</span><h2>Email {plural(selected.length, "selected registrant")}</h2></div><button onClick={() => setShowEmail(false)}>×</button></div><div className="form-stack"><label>Subject<input value={subject} onChange={(e) => setSubject(e.target.value)} /></label><label>Message<textarea rows={6} value={body} onChange={(e) => setBody(e.target.value)} /></label><small>Variables supported: {TEMPLATE_VARIABLES.map((variable) => `{{${variable}}}`).join(", ")}</small></div>{message && <div className={message.ok ? "form-success" : "form-error"} role="status">{message.text}</div>}<button className="button button--primary" onClick={sendEmail} disabled={sending || !hasSelectedRegistrants}><Send /> {sending ? "Sending…" : "Send message"}</button></section>}
    {notice && <div className={notice.ok ? "form-success" : "form-error"} role="status">{notice.text}</div>}
    <section className="admin-panel registration-table-panel"><div className="admin-panel__head"><h2>Participant list</h2><label className="search-box search-box--small"><Search /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search participants" /></label></div>{visible.length ? <div className="registration-table-wrap"><table className="registration-table"><thead><tr><th><input type="checkbox" aria-label="Select all" checked={visible.length > 0 && visible.every((item) => selected.includes(item.id))} onChange={(e) => setSelected(e.target.checked ? visible.map((item) => item.id) : [])} /></th><th>Name</th><th>Email</th><th>UIN</th><th>Session</th>{questions.map((field) => <th key={field.id}>{field.label}</th>)}<th>Confirmation</th><th>Registered</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{visible.map((registration) => <ParticipantRow key={registration.id} registration={registration} event={event} questions={questions} selected={selected.includes(registration.id)} resending={resendingId === registration.id} deleting={deletingId === registration.id} onSelect={(checked) => setSelected((current) => checked ? [...current, registration.id] : current.filter((id) => id !== registration.id))} onResend={() => resendConfirmation(registration)} onRemove={() => setPendingRemoval(registration)} />)}</tbody></table></div> : <div className="empty-state"><Users /><h3>No registrations yet</h3><p>Registrants will appear here, even after the form closes.</p></div>}</section>
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
