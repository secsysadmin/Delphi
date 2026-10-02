"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Download, Mail, Search, Send, Users } from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { Registration, RegistrationEvent } from "@/types";

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

  useEffect(() => { fetch(`/api/events/${eventId}/registrations`).then((response) => response.json()).then((data) => { setEvent(data.event); setRegistrations(data.registrations ?? []); }); }, [eventId]);
  const visible = useMemo(() => registrations.filter((item) => `${item.firstName} ${item.lastName} ${item.email} ${item.uin}`.toLowerCase().includes(query.toLowerCase())), [registrations, query]);
  const fieldValues = event?.formFields ?? [];
  const hasSelectedRegistrants = selected.length > 0;

  async function sendEmail() {
    if (!hasSelectedRegistrants) return;
    setSending(true); setMessage("");
    const response = await fetch(`/api/events/${eventId}/email`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subject, body, registrationIds: selected }) });
    const data = await response.json(); setSending(false);
    if (!response.ok) return setMessage(data.error);
    setMessage(`${data.preview ? "Previewed" : "Sent"} for ${data.sent} recipient${data.sent === 1 ? "" : "s"}.`);
  }

  if (!event) return <div className="shell page-loading">Loading registrations…</div>;
  return <div className="shell admin-shell registrations-page">
    <Link href="/admin" className="back-link back-link--dark"><ArrowLeft /> Dashboard</Link>
    <div className="registrations-head"><div><span className="eyebrow">Registrations</span><h1>{event.title}</h1><p>{formatDate(event.startAt, true)} · {event.location}</p></div><div><a className="button button--secondary" href={`/api/events/${event.id}/registrations?format=csv`}><Download /> Export CSV</a><button className={`button button--selection ${hasSelectedRegistrants ? "button--primary" : "button--secondary"}`} onClick={() => setShowEmail((value) => !value)} disabled={!hasSelectedRegistrants} title={hasSelectedRegistrants ? "Email selected registrants" : "Select at least one participant to email"}><Mail /> Email registrants</button></div></div>
    <div className="metric-grid metric-grid--three"><div className="metric-card"><span><Users /></span><div><strong>{registrations.length}</strong><small>Total registrations</small></div></div><div className="metric-card"><span><Check /></span><div><strong>{registrations.filter((item) => item.status === "confirmed").length}</strong><small>Confirmed</small></div></div><div className="metric-card"><span><Mail /></span><div><strong>{registrations.filter((item) => ["sent", "delivered"].includes(item.emailStatus)).length}</strong><small>Emails sent</small></div></div></div>
    {showEmail && <section className="broadcast-panel"><div className="broadcast-panel__head"><div><span className="eyebrow">New message</span><h2>Email {selected.length} selected registrant{selected.length === 1 ? "" : "s"}</h2></div><button onClick={() => setShowEmail(false)}>×</button></div><div className="form-stack"><label>Subject<input value={subject} onChange={(e) => setSubject(e.target.value)} /></label><label>Message<textarea rows={6} value={body} onChange={(e) => setBody(e.target.value)} /></label><small>Variables supported: {"{{firstName}}"}, {"{{name}}"}, {"{{event}}"}, {"{{date}}"}, {"{{time}}"}, {"{{room}}"}</small></div>{message && <div className={message.startsWith("Sent") || message.startsWith("Previewed") ? "form-success" : "form-error"}>{message}</div>}<button className="button button--primary" onClick={sendEmail} disabled={sending || !hasSelectedRegistrants}><Send /> {sending ? "Sending…" : "Send message"}</button></section>}
    <section className="admin-panel registration-table-panel"><div className="admin-panel__head"><h2>Participant list</h2><label className="search-box search-box--small"><Search /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search participants" /></label></div>{visible.length ? <div className="registration-table-wrap"><table className="registration-table"><thead><tr><th><input type="checkbox" aria-label="Select all" checked={visible.length > 0 && visible.every((item) => selected.includes(item.id))} onChange={(e) => setSelected(e.target.checked ? visible.map((item) => item.id) : [])} /></th><th>Name</th><th>Email</th><th>UIN</th><th>Session</th>{fieldValues.map((field) => <th key={field.id}>{field.label}</th>)}<th>Registered</th></tr></thead><tbody>{visible.map((registration) => <tr key={registration.id}><td><input type="checkbox" checked={selected.includes(registration.id)} onChange={(e) => setSelected((current) => e.target.checked ? [...current, registration.id] : current.filter((id) => id !== registration.id))} /></td><td><strong>{registration.firstName} {registration.lastName}</strong><small>{registration.status}</small></td><td>{registration.email}</td><td>{registration.uin || "—"}</td><td>{event.slots.find((slot) => slot.id === registration.slotId)?.label || "—"}</td>{fieldValues.map((field) => <td key={field.id}>{Array.isArray(registration.answers[field.id]) ? (registration.answers[field.id] as string[]).join(", ") : String(registration.answers[field.id] ?? "—")}</td>)}<td>{formatDate(registration.createdAt, true)}</td></tr>)}</tbody></table></div> : <div className="empty-state"><Users /><h3>No registrations yet</h3><p>Registrants will appear here, even after the form closes.</p></div>}</section>
  </div>;
}
