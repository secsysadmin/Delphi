"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowLeft, CalendarDays, Check, Clock3, MapPin, UserRound } from "lucide-react";
import { Field, UIN_PATTERN } from "@/components/event-registration";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { RichText } from "@/components/rich-text";
import { jsonRequest, sendJson } from "@/lib/api-client";
import { validateFields } from "@/lib/form-validation";
import { formatDate, formatRange, formatTime, plural } from "@/lib/utils";
import type { Registration, RegistrationEvent } from "@/types";

type ManageRegistrationProps = { token: string; event: RegistrationEvent; initialRegistration: Registration };
type UpdateResponse = { registration: Registration; emailed: boolean };

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function ManageRegistration({ token, event, initialRegistration }: ManageRegistrationProps) {
  const [registration, setRegistration] = useState(initialRegistration);
  const [slotId, setSlotId] = useState(initialRegistration.slotId ?? "");
  const [answers, setAnswers] = useState(initialRegistration.answers);
  const [saving, setSaving] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const noticeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (notice) noticeRef.current?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });
  }, [notice]);

  const [now] = useState(() => Date.now());
  const canEdit = event.status === "published" && new Date(event.registrationCloseAt).getTime() > now;
  const canWithdraw = new Date(event.startAt).getTime() > now;
  const slot = event.slots.find((item) => item.id === registration.slotId);
  const accent = slot?.accentColor || event.accentColor;

  async function save(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (!validateFields(formEvent.currentTarget)) return;
    const form = new FormData(formEvent.currentTarget);
    setSaving(true);
    setNotice(null);
    const payload = { slotId: slotId || null, firstName: form.get("firstName"), lastName: form.get("lastName"), uin: form.get("uin"), answers };
    const { ok, data, error } = await sendJson<UpdateResponse>(`/api/registrations/${token}`, jsonRequest("PATCH", payload));
    setSaving(false);
    if (!ok || !data.registration) return setNotice({ ok: false, text: error || "Your changes couldn't be saved. Please try again." });
    setRegistration(data.registration);
    setNotice({ ok: true, text: data.emailed && data.registration.emailStatus === "sent" ? `Changes saved. We emailed an updated confirmation to ${registration.email}.` : "Changes saved." });
  }

  async function withdraw() {
    setConfirmWithdraw(false);
    setWithdrawing(true);
    setNotice(null);
    const { ok, error } = await sendJson<{ status: string }>(`/api/registrations/${token}`, { method: "DELETE" });
    setWithdrawing(false);
    if (!ok) return setNotice({ ok: false, text: error || "Your registration couldn't be withdrawn. Please try again." });
    setRegistration((current) => ({ ...current, status: "cancelled" }));
    window.scrollTo({ top: 0 });
  }

  if (registration.status === "cancelled") return (
    <section className="shell confirmation-page">
      <div className="confirmation-card" style={{ "--event-accent": event.accentColor } as React.CSSProperties}>
        <span className="eyebrow">Registration withdrawn</span><h1>You&apos;re no longer registered.</h1>
        <p>Your spot at <strong>{event.title}</strong> has been released. If your plans change, you can register again while registration is open.</p>
        <Link href={`/events/${event.slug}`} className="text-link"><ArrowLeft size={17} /> Back to the event</Link>
      </div>
    </section>
  );

  return (
    <>
      <section className="event-detail-hero" style={{ "--event-accent": accent } as React.CSSProperties}>
        <div className="shell"><Link href={`/events/${event.slug}`} className="back-link"><ArrowLeft size={17} /> Event details</Link><span className="eyebrow eyebrow--light">Your registration</span><h1>{event.title}</h1><p>Registered as {registration.email}</p></div>
      </section>
      <div className="shell event-detail-layout">
        <aside className="event-facts">
          <div><CalendarDays /><span><small>{slot ? slot.label : "Date"}</small>{formatRange(slot?.startAt || event.startAt, slot?.endAt || event.endAt)}</span></div>
          <div><MapPin /><span><small>Location</small>{slot?.location || event.location}</span></div>
          <div><UserRound /><span><small>Registered</small>{formatDate(registration.createdAt, true)}</span></div>
          <div className="event-window"><small>Changes allowed until</small><span>{formatDate(event.registrationCloseAt, true)}</span></div>
        </aside>
        <div className="registration-column">
          {notice && <div ref={noticeRef} className={`manage-notice ${notice.ok ? "form-success" : "form-error"}`} role={notice.ok ? "status" : "alert"}>{notice.ok && <Check size={16} />}{notice.text}</div>}
          {!canEdit && <div className="notice-card"><Clock3 /><div><h3>{event.status === "published" ? "Registration has closed" : "This event is no longer listed"}</h3><p>Your answers can no longer be changed.{canWithdraw ? " If you can't make it, you can still withdraw below so someone else can take your spot." : ""}</p></div></div>}
          {canEdit && (
            <form className="registration-form" onSubmit={save} noValidate>
              {event.slots.length > 0 && <fieldset><legend><span>01</span> Your session</legend><p className="fieldset-intro">Switch to another session if one still has room.</p><div className="slot-grid" data-field data-required-message="Choose a time slot">{event.slots.map((item) => {
                const current = item.id === registration.slotId;
                const full = item.remaining === 0 && !current;
                return <label key={item.id} className={`slot-card ${slotId === item.id ? "slot-card--selected" : ""} ${full ? "slot-card--full" : ""}`}><input type="radio" name="slot" value={item.id} checked={slotId === item.id} onChange={() => setSlotId(item.id)} required disabled={full} /><span className="slot-card__check"><Check /></span><strong>{item.label}</strong><span>{formatDate(item.startAt)} · {formatTime(item.startAt)}–{formatTime(item.endAt)}</span><span><MapPin size={15} /> {item.location}</span><small>{current ? "Your current session" : full ? "Full" : item.remaining === null ? "Available" : `${plural(item.remaining, "spot")} left`}</small></label>;
              })}</div></fieldset>}
              <fieldset><legend><span>{event.slots.length ? "02" : "01"}</span> Your information</legend><div className="form-grid"><label><span>First name <em>*</em></span><input name="firstName" autoComplete="given-name" required defaultValue={registration.firstName} /></label><label><span>Last name <em>*</em></span><input name="lastName" autoComplete="family-name" required defaultValue={registration.lastName} /></label><label><span>Email address</span><input type="email" value={registration.email} disabled aria-describedby="manage-email-help" /><small id="manage-email-help">To use a different email, withdraw and register again.</small></label><label><span>UIN {event.uinRequired ? <em>*</em> : <small>(optional)</small>}</span><input name="uin" inputMode="numeric" pattern={UIN_PATTERN} placeholder="9 digits" title="Enter your 9-digit UIN" required={event.uinRequired} defaultValue={registration.uin} /></label></div></fieldset>
              {event.formFields.length > 0 && <fieldset><legend><span>{event.slots.length ? "03" : "02"}</span> Event questions</legend><div className="form-stack">{event.formFields.map((field) => field.type === "section" ? <div key={field.id} className="form-section-block">{field.label && <h3>{field.label}</h3>}{field.helpText && <RichText text={field.helpText} />}</div> : <label key={field.id} className="custom-field" data-field htmlFor={`field-${field.id}`}><span>{field.label} {field.required && <em>*</em>}</span>{field.helpText && <small id={`field-${field.id}-help`}>{field.helpText}</small>}<Field field={field} value={answers[field.id]} onChange={(value) => setAnswers((current) => ({ ...current, [field.id]: value }))} /></label>)}</div></fieldset>}
              <button className="button button--primary button--large" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
            </form>
          )}
          {canWithdraw && <section className="withdraw-panel"><div><h2>Can&apos;t make it?</h2><p>Withdrawing releases your spot so someone else can register. You can sign up again later while registration is open.</p></div><button type="button" className="button button--danger" onClick={() => setConfirmWithdraw(true)} disabled={withdrawing}>{withdrawing ? "Withdrawing…" : "Withdraw registration"}</button></section>}
        </div>
      </div>
      <ConfirmDialog open={confirmWithdraw} title="Withdraw your registration?" description={`You'll lose your spot at ${event.title}${slot ? ` (${slot.label})` : ""}.`} confirmLabel="Withdraw" cancelLabel="Keep my spot" tone="danger" onConfirm={withdraw} onCancel={() => setConfirmWithdraw(false)} />
    </>
  );
}
