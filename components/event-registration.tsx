"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CalendarDays, Check, Clock3, MapPin, Users } from "lucide-react";
import { jsonRequest, readJson, sendJson } from "@/lib/api-client";
import { validateFields } from "@/lib/form-validation";
import { eventPhase, formatDate, formatRange, formatTime, isSoldOut, plural, suggestEmail } from "@/lib/utils";
import { RichText } from "@/components/rich-text";
import type { FormField, QuestionType, Registration, RegistrationEvent } from "@/types";

type Answer = string | string[] | boolean;
type FieldProps = { field: FormField; value: Answer | undefined; onChange: (value: Answer) => void };
type EventRegistrationProps = { slug: string };
type RegisterResponse = { emailStatus: string; registration: Registration };
type ManageLinkRequestProps = { eventId: string; initialEmail: string; startOpen: boolean };
type ManageLinkStatus = "idle" | "sending" | "sent" | "preview";

const INPUT_TYPES: Partial<Record<QuestionType, string>> = { email: "email", phone: "tel", number: "number", date: "date" };
const TAMU_EMAIL_PATTERN = ".+@[Tt][Aa][Mm][Uu]\\.[Ee][Dd][Uu]";
export const UIN_PATTERN = "[0-9]{9}";
const DUPLICATE_STATUS = 409;
const MANAGE_LINK_REQUEST_ID = "manage-link-request";

export function Field({ field, value, onChange }: FieldProps) {
  const id = `field-${field.id}`;
  const common = { id, required: field.required, "aria-describedby": field.helpText ? `${id}-help` : undefined };
  if (field.type === "long_text") return <textarea {...common} value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} placeholder={field.placeholder} rows={4} />;
  if (field.type === "select") return <select {...common} value={String(value ?? "")} onChange={(event) => onChange(event.target.value)}><option value="">Choose an option</option>{field.options?.map((option) => <option key={option}>{option}</option>)}</select>;
  if (field.type === "radio") return <div className="choice-list">{field.options?.map((option) => <label key={option}><input type="radio" name={id} required={field.required} checked={value === option} onChange={() => onChange(option)} /><span>{option}</span></label>)}</div>;
  if (field.type === "multiselect") {
    const selected = Array.isArray(value) ? value : [];
    return <div className="choice-list">{field.options?.map((option) => <label key={option}><input type="checkbox" required={field.required && !selected.length} checked={selected.includes(option)} onChange={(event) => onChange(event.target.checked ? [...selected, option] : selected.filter((item) => item !== option))} /><span>{option}</span></label>)}</div>;
  }
  if (field.type === "checkbox") return <label className="checkbox-row"><input type="checkbox" required={field.required} checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} /><span>{field.placeholder || "Yes, I agree"}</span></label>;
  return <input {...common} type={INPUT_TYPES[field.type] ?? "text"} value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} placeholder={field.placeholder} />;
}

function availability(event: RegistrationEvent) {
  if (event.remaining !== null) return `${plural(event.remaining, "spot")} remaining`;
  return event.capacityMode === "slot" ? "Varies by session" : "No capacity limit";
}

export function EventRegistration({ slug }: EventRegistrationProps) {
  const [event, setEvent] = useState<RegistrationEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [slotId, setSlotId] = useState("");
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [complete, setComplete] = useState<{ email: string; emailStatus: string } | null>(null);
  const [duplicateEmail, setDuplicateEmail] = useState("");
  const [emailSuggestion, setEmailSuggestion] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/events/${encodeURIComponent(slug)}`).then(async (response) => {
      if (response.status === 404) return;
      const data = await readJson<{ event?: RegistrationEvent }>(response);
      if (!response.ok) throw new Error(data.error);
      if (!data.event) throw new Error("Event details were unavailable. Please try again.");
      setEvent(data.event);
    }).catch((reason) => setError(reason.message)).finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    if (!event) return;
    const frame = requestAnimationFrame(() => document.getElementById("event-detail")?.scrollIntoView({ block: "start" }));
    return () => cancelAnimationFrame(frame);
  }, [event]);

  const selectedSlot = useMemo(() => event?.slots.find((slot) => slot.id === slotId), [event, slotId]);

  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (!event || !validateFields(formEvent.currentTarget)) return;
    const form = new FormData(formEvent.currentTarget);
    setError("");
    setDuplicateEmail("");
    setSending(true);
    const payload = { slotId: slotId || null, firstName: form.get("firstName"), lastName: form.get("lastName"), email: form.get("email"), uin: form.get("uin"), answers };
    const { ok, status, data, error: failure } = await sendJson<RegisterResponse>(`/api/events/${event.id}/register`, jsonRequest("POST", payload));
    setSending(false);
    if (status === DUPLICATE_STATUS) showManageLinkRequest(String(form.get("email") ?? ""));
    if (!ok) return setError(failure || "Registration failed.");
    setComplete({ email: data.registration?.email ?? String(form.get("email") ?? ""), emailStatus: data.emailStatus ?? "previewed" });
    window.scrollTo({ top: 0 });
  }

  function showManageLinkRequest(email: string) {
    setDuplicateEmail(email);
    requestAnimationFrame(() => document.getElementById(MANAGE_LINK_REQUEST_ID)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }

  function acceptEmailSuggestion(suggestion: string) {
    if (emailRef.current) {
      emailRef.current.value = suggestion;
      emailRef.current.dispatchEvent(new Event("input", { bubbles: true }));
    }
    setEmailSuggestion(null);
  }

  if (loading) return <div className="shell page-loading">Loading event…</div>;
  if (!event) return <div className="shell empty-state page-space"><h2>Event not found</h2><p>{error || "This event may have been removed, or the link may be incorrect."}</p><Link href="/" className="button button--primary">Back to events</Link></div>;
  const phase = eventPhase(event);
  const full = isSoldOut(event);
  const canRegister = phase === "open" && !full;

  if (complete) return (
    <section className="shell confirmation-page">
      <div className="confirmation-card" style={{ "--event-accent": selectedSlot?.accentColor || event.accentColor } as React.CSSProperties}>
        <div className="confirmation-icon"><Check /></div><span className="eyebrow">You&apos;re registered</span><h1>We&apos;ll see you there.</h1>
        <p>{complete.emailStatus === "sent" ? <>We emailed a confirmation to <strong>{complete.email}</strong>. Keep it handy when you arrive. If you need to change your answers or withdraw, use the link in that email.</> : complete.emailStatus === "failed" ? <>You&apos;re registered, but we couldn&apos;t send the confirmation email to <strong>{complete.email}</strong>. Take a screenshot of this page to show at the door.</> : <>You&apos;re registered as <strong>{complete.email}</strong>. Confirmation emails are turned off on this preview server.</>}</p>
        <div className="confirmation-ticket"><strong>{event.title}</strong>{selectedSlot && <span>{selectedSlot.label}</span>}<span>{formatRange(selectedSlot?.startAt || event.startAt, selectedSlot?.endAt || event.endAt)}</span><span>{selectedSlot?.location || event.location}</span></div>
        <Link href="/" className="text-link"><ArrowLeft size={17} /> Back to all events</Link>
      </div>
    </section>
  );

  return (
    <>
      <section id="event-detail" className="event-detail-hero" style={{ "--event-accent": event.accentColor } as React.CSSProperties}>
        <div className="shell"><Link href="/" className="back-link"><ArrowLeft size={17} /> All events</Link><span className="eyebrow eyebrow--light">SEC Event</span><h1>{event.title}</h1><p>{event.summary}</p></div>
      </section>
      <div className="shell event-detail-layout">
        <aside className="event-facts">
          <div><CalendarDays /><span><small>Date</small>{formatRange(event.startAt, event.endAt)}</span></div>
          <div><MapPin /><span><small>Location</small>{event.location}</span></div>
          <div><Users /><span><small>Availability</small>{availability(event)}</span></div>
          <div className="event-window"><small>Registration window</small><span>{formatDate(event.registrationOpenAt, true)}</span><span>through {formatDate(event.registrationCloseAt, true)}</span></div>
        </aside>
        <div className="registration-column">
          <section className="detail-description"><h2>About this event</h2><RichText text={event.description} /></section>
          {!canRegister ? <div className="notice-card"><Clock3 /><div><h3>{phase === "open" && full ? "This event is full" : phase === "upcoming" ? "Registration opens soon" : "Registration is closed"}</h3><p>{phase === "open" && full ? "Every spot has been claimed. Check back in case a spot opens up." : phase === "upcoming" ? `Come back ${formatDate(event.registrationOpenAt, true)}.` : "This event is no longer accepting registrations."}</p></div></div> : (
            <form className="registration-form" onSubmit={submit} noValidate>
              {event.slots.length > 0 && <fieldset><legend><span>01</span> Choose a time</legend><p className="fieldset-intro">Select one available session.</p><div className="slot-grid" data-field data-required-message="Choose a time slot">{event.slots.map((slot) => {
                const full = slot.remaining === 0;
                return <label key={slot.id} className={`slot-card ${slotId === slot.id ? "slot-card--selected" : ""} ${full ? "slot-card--full" : ""}`}><input type="radio" name="slot" value={slot.id} checked={slotId === slot.id} onChange={() => setSlotId(slot.id)} required disabled={full} /><span className="slot-card__check"><Check /></span><strong>{slot.label}</strong><span>{formatDate(slot.startAt)} · {formatTime(slot.startAt)}–{formatTime(slot.endAt)}</span><span><MapPin size={15} /> {slot.location}</span><small>{full ? "Full" : slot.remaining === null ? "Available" : `${plural(slot.remaining, "spot")} left`}</small></label>;
              })}</div></fieldset>}
              <fieldset><legend><span>{event.slots.length ? "02" : "01"}</span> Your information</legend><div className="form-grid"><label><span>First name <em>*</em></span><input name="firstName" autoComplete="given-name" required /></label><label><span>Last name <em>*</em></span><input name="lastName" autoComplete="family-name" required /></label><label><span>Email address <em>*</em></span><input ref={emailRef} name="email" type="email" autoComplete="email" required placeholder="name@tamu.edu" pattern={event.tamuEmailOnly ? TAMU_EMAIL_PATTERN : undefined} title={event.tamuEmailOnly ? "Use your @tamu.edu email address" : undefined} onBlur={(blurEvent) => setEmailSuggestion(suggestEmail(blurEvent.target.value))} onInput={() => setEmailSuggestion(null)} aria-describedby="email-suggestion" />{event.tamuEmailOnly && <small>This event requires an @tamu.edu email address.</small>}<span id="email-suggestion" aria-live="polite">{emailSuggestion && <small className="email-suggestion">Did you mean <button type="button" onClick={() => acceptEmailSuggestion(emailSuggestion)}>{emailSuggestion}</button>?</small>}</span></label><label><span>UIN {event.uinRequired ? <em>*</em> : <small>(optional)</small>}</span><input name="uin" inputMode="numeric" pattern={UIN_PATTERN} placeholder="9 digits" title="Enter your 9-digit UIN" required={event.uinRequired} /></label></div></fieldset>
              {event.formFields.length > 0 && <fieldset><legend><span>{event.slots.length ? "03" : "02"}</span> Event questions</legend><div className="form-stack">{event.formFields.map((field) => field.type === "section" ? <div key={field.id} className="form-section-block">{field.label && <h3>{field.label}</h3>}{field.helpText && <RichText text={field.helpText} />}</div> : <label key={field.id} className="custom-field" data-field htmlFor={`field-${field.id}`}><span>{field.label} {field.required && <em>*</em>}</span>{field.helpText && <small id={`field-${field.id}-help`}>{field.helpText}</small>}<Field field={field} value={answers[field.id]} onChange={(value) => setAnswers((current) => ({ ...current, [field.id]: value }))} /></label>)}</div></fieldset>}
              {error && <div className="form-error" role="alert">{error}</div>}
              <button className="button button--primary button--large" disabled={sending}>{sending ? "Registering…" : "Complete registration"} <ArrowRightIcon /></button><p className="form-fine-print">You&apos;ll receive a confirmation with your date, time, and room details.</p>
            </form>
          )}
          {(phase === "open" || phase === "closed") && <ManageLinkRequest key={duplicateEmail} eventId={event.id} initialEmail={duplicateEmail} startOpen={Boolean(duplicateEmail)} />}
        </div>
      </div>
    </>
  );
}

function ManageLinkRequest({ eventId, initialEmail, startOpen }: ManageLinkRequestProps) {
  const [email, setEmail] = useState(initialEmail);
  const [status, setStatus] = useState<ManageLinkStatus>("idle");
  const [error, setError] = useState("");

  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (!validateFields(formEvent.currentTarget)) return;
    setError("");
    setStatus("sending");
    const { ok, data, error: failure } = await sendJson<{ preview: boolean }>(`/api/events/${eventId}/manage-link`, jsonRequest("POST", { email }));
    if (!ok) {
      setStatus("idle");
      return setError(failure || "Could not send the link. Please try again.");
    }
    setStatus(data.preview ? "preview" : "sent");
  }

  return (
    <details id={MANAGE_LINK_REQUEST_ID} className="manage-link-request" open={startOpen || undefined}>
      <summary>Already registered? Change or withdraw your registration</summary>
      {status === "sent" || status === "preview" ? <p className="form-success" role="status">{status === "sent" ? <>If <strong>{email}</strong> is registered for this event, we&apos;ve emailed it a link to manage the registration.</> : "Email sending is turned off on this preview server, so no link was sent."}</p> : (
        <form onSubmit={submit} noValidate>
          <p>Enter the email you registered with and we&apos;ll send you a link to change your answers or withdraw.</p>
          <div className="manage-link-request__row"><label><span className="sr-only">Email address</span><input type="email" required autoComplete="email" placeholder="name@tamu.edu" value={email} onChange={(event) => setEmail(event.target.value)} /></label><button className="button button--secondary" disabled={status === "sending"}>{status === "sending" ? "Sending…" : "Email me a link"}</button></div>
          {error && <div className="form-error" role="alert">{error}</div>}
        </form>
      )}
    </details>
  );
}

function ArrowRightIcon() { return <span aria-hidden="true">→</span>; }
