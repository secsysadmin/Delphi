"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, Check, Clock3, MapPin, Users } from "lucide-react";
import { eventPhase, formatDate, formatTime } from "@/lib/utils";
import type { FormField, RegistrationEvent } from "@/types";

function Field({ field, value, onChange }: { field: FormField; value: string | string[] | boolean | undefined; onChange: (value: string | string[] | boolean) => void }) {
  const id = `field-${field.id}`;
  const common = { id, required: field.required, "aria-describedby": field.helpText ? `${id}-help` : undefined };
  if (field.type === "long_text") return <textarea {...common} value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} placeholder={field.placeholder} rows={4} />;
  if (field.type === "select") return <select {...common} value={String(value ?? "")} onChange={(event) => onChange(event.target.value)}><option value="">Choose an option</option>{field.options?.map((option) => <option key={option}>{option}</option>)}</select>;
  if (field.type === "radio") return <div className="choice-list">{field.options?.map((option) => <label key={option}><input type="radio" name={id} required={field.required} checked={value === option} onChange={() => onChange(option)} /><span>{option}</span></label>)}</div>;
  if (field.type === "multiselect") {
    const selected = Array.isArray(value) ? value : [];
    return <div className="choice-list">{field.options?.map((option) => <label key={option}><input type="checkbox" checked={selected.includes(option)} onChange={(event) => onChange(event.target.checked ? [...selected, option] : selected.filter((item) => item !== option))} /><span>{option}</span></label>)}</div>;
  }
  if (field.type === "checkbox") return <label className="checkbox-row"><input type="checkbox" required={field.required} checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} /><span>{field.placeholder || "Yes, I agree"}</span></label>;
  const inputType = ({ email: "email", phone: "tel", number: "number", date: "date" } as Record<string, string>)[field.type] || "text";
  return <input {...common} type={inputType} value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} placeholder={field.placeholder} />;
}

export function EventRegistration({ slug }: { slug: string }) {
  const [event, setEvent] = useState<RegistrationEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [slotId, setSlotId] = useState("");
  const [answers, setAnswers] = useState<Record<string, string | string[] | boolean>>({});
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    fetch(`/api/events/${encodeURIComponent(slug)}`).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setEvent(data.event);
    }).catch((reason) => setError(reason.message)).finally(() => setLoading(false));
  }, [slug]);

  const selectedSlot = useMemo(() => event?.slots.find((slot) => slot.id === slotId), [event, slotId]);

  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (!event) return;
    const form = new FormData(formEvent.currentTarget);
    setError("");
    setSending(true);
    const response = await fetch(`/api/events/${event.id}/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slotId: slotId || null, firstName: form.get("firstName"), lastName: form.get("lastName"), email: form.get("email"), uin: form.get("uin"), answers }),
    });
    const data = await response.json();
    setSending(false);
    if (!response.ok) return setError(data.error || "Registration failed.");
    setComplete(true);
  }

  if (loading) return <div className="shell page-loading">Loading event…</div>;
  if (!event) return <div className="shell empty-state page-space"><h2>Event not found</h2><p>{error || "This event may no longer be available."}</p><Link href="/" className="button button--primary">Back to events</Link></div>;
  const phase = eventPhase(event);
  const canRegister = phase === "open";

  if (complete) return (
    <section className="shell confirmation-page">
      <div className="confirmation-card" style={{ "--event-accent": selectedSlot?.accentColor || event.accentColor } as React.CSSProperties}>
        <div className="confirmation-icon"><Check /></div><span className="eyebrow">You&apos;re registered</span><h1>We&apos;ll see you there.</h1>
        <p>A confirmation has been prepared for your email address. Keep it handy when you arrive.</p>
        <div className="confirmation-ticket"><strong>{event.title}</strong>{selectedSlot && <span>{selectedSlot.label}</span>}<span>{formatDate(selectedSlot?.startAt || event.startAt, true)}</span><span>{selectedSlot?.location || event.location}</span></div>
        <Link href="/" className="text-link"><ArrowLeft size={17} /> Back to all events</Link>
      </div>
    </section>
  );

  return (
    <>
      <section className="event-detail-hero" style={{ "--event-accent": event.accentColor } as React.CSSProperties}>
        <div className="shell"><Link href="/" className="back-link"><ArrowLeft size={17} /> All events</Link><span className="eyebrow eyebrow--light">SEC Event</span><h1>{event.title}</h1><p>{event.summary}</p></div>
      </section>
      <div className="shell event-detail-layout">
        <aside className="event-facts">
          <div><CalendarDays /><span><small>Date</small>{formatDate(event.startAt, true)}</span></div>
          <div><MapPin /><span><small>Location</small>{event.location}</span></div>
          <div><Users /><span><small>Availability</small>{event.remaining === null ? event.capacityMode === "slot" ? "Varies by session" : "No capacity limit" : `${event.remaining} spots remaining`}</span></div>
          <div className="event-window"><small>Registration window</small><span>{formatDate(event.registrationOpenAt, true)}</span><span>through {formatDate(event.registrationCloseAt, true)}</span></div>
        </aside>
        <div className="registration-column">
          <section className="detail-description"><h2>About this event</h2><p>{event.description}</p></section>
          {!canRegister ? <div className="notice-card"><Clock3 /><div><h3>{phase === "upcoming" ? "Registration opens soon" : "Registration is closed"}</h3><p>{phase === "upcoming" ? `Come back ${formatDate(event.registrationOpenAt, true)}.` : "This event is no longer accepting registrations."}</p></div></div> : (
            <form className="registration-form" onSubmit={submit}>
              {event.slots.length > 0 && <fieldset><legend><span>01</span> Choose a time</legend><p className="fieldset-intro">Select one available session.</p><div className="slot-grid">{event.slots.map((slot) => {
                const full = slot.remaining === 0;
                return <label key={slot.id} className={`slot-card ${slotId === slot.id ? "slot-card--selected" : ""} ${full ? "slot-card--full" : ""}`}><input type="radio" name="slot" value={slot.id} checked={slotId === slot.id} onChange={() => setSlotId(slot.id)} required disabled={full} /><span className="slot-card__check"><Check /></span><strong>{slot.label}</strong><span>{formatDate(slot.startAt)} · {formatTime(slot.startAt)}–{formatTime(slot.endAt)}</span><span><MapPin size={15} /> {slot.location}</span><small>{full ? "Full" : slot.remaining === null ? "Available" : `${slot.remaining} spots left`}</small></label>;
              })}</div></fieldset>}
              <fieldset><legend><span>{event.slots.length ? "02" : "01"}</span> Your information</legend><div className="form-grid"><label>First name <em>*</em><input name="firstName" autoComplete="given-name" required /></label><label>Last name <em>*</em><input name="lastName" autoComplete="family-name" required /></label><label>Email address <em>*</em><input name="email" type="email" autoComplete="email" required placeholder="name@tamu.edu" /></label><label>UIN <small>(optional)</small><input name="uin" inputMode="numeric" pattern="[0-9]{9}" placeholder="9 digits" /></label></div></fieldset>
              {event.formFields.length > 0 && <fieldset><legend><span>{event.slots.length ? "03" : "02"}</span> Event questions</legend><div className="form-stack">{event.formFields.map((field) => <label key={field.id} className="custom-field" htmlFor={`field-${field.id}`}><span>{field.label} {field.required && <em>*</em>}</span>{field.helpText && <small id={`field-${field.id}-help`}>{field.helpText}</small>}<Field field={field} value={answers[field.id]} onChange={(value) => setAnswers((current) => ({ ...current, [field.id]: value }))} /></label>)}</div></fieldset>}
              {error && <div className="form-error" role="alert">{error}</div>}
              <button className="button button--primary button--large" disabled={sending}>{sending ? "Registering…" : "Complete registration"} <ArrowRightIcon /></button><p className="form-fine-print">You&apos;ll receive a confirmation with your date, time, and room details.</p>
            </form>
          )}
        </div>
      </div>
    </>
  );
}

function ArrowRightIcon() { return <span aria-hidden="true">→</span>; }
