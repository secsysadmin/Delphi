"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronUp, Copy, GripVertical, Plus, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import type { EventInput, FormField, QuestionType } from "@/types";
import { ConfirmDialog } from "@/components/confirm-dialog";

const questionTypes: Array<{ value: QuestionType; label: string }> = [
  { value: "short_text", label: "Short answer" }, { value: "long_text", label: "Long answer" },
  { value: "email", label: "Email" }, { value: "phone", label: "Phone" }, { value: "number", label: "Number" },
  { value: "select", label: "Dropdown" }, { value: "radio", label: "Single choice" },
  { value: "multiselect", label: "Multiple choice" }, { value: "checkbox", label: "Acknowledgement" }, { value: "date", label: "Date" },
];
const hasOptions = (type: QuestionType) => ["select", "radio", "multiselect"].includes(type);
const pad = (value: number) => String(value).padStart(2, "0");
const localInput = (value: string | Date) => { const date = new Date(value); return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`; };
const future = (days: number, hour = 9) => { const date = new Date(); date.setDate(date.getDate() + days); date.setHours(hour, 0, 0, 0); return localInput(date); };
const previewTime = (value: string) => {
  const [hour, minute] = value.slice(11, 16).split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return "Event time";
  return `${hour % 12 || 12}:${pad(minute)} ${hour >= 12 ? "PM" : "AM"}`;
};
const previewDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Event date" : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const blankEvent = (): EventInput => ({
  slug: "", title: "", summary: "", description: "", location: "",
  startAt: future(30, 9), endAt: future(30, 11), registrationOpenAt: localInput(new Date()), registrationCloseAt: future(28, 23),
  status: "draft", capacityMode: "event", capacity: 100, tamuEmailOnly: false, sortOrder: 0, accentColor: "#500000",
  formFields: [], confirmationSubject: "Registration confirmed: {{event}}", showDateInConfirmation: true,
  confirmationBody: "Howdy {{firstName}}!\n\nYour registration for {{event}} is confirmed. We look forward to seeing you on {{date}} at {{time}} in {{room}}.", slots: [],
});

export function EventEditor({ eventId }: { eventId?: string }) {
  const router = useRouter();
  const [event, setEvent] = useState<EventInput>(blankEvent);
  const [loading, setLoading] = useState(Boolean(eventId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [draftId, setDraftId] = useState(eventId);
  const [autosaveState, setAutosaveState] = useState<"idle" | "pending" | "saving" | "saved" | "error">("idle");
  const [autosaveTick, setAutosaveTick] = useState(0);
  const draftIdRef = useRef(eventId);
  const hasUserEditsRef = useRef(false);
  const creatingDraftRef = useRef(false);
  const revisionRef = useRef(0);

  useEffect(() => {
    if (!eventId) return;
    fetch(`/api/events/${eventId}?admin=1`).then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error); return data.event; }).then((data) => setEvent({ ...data, startAt: localInput(data.startAt), endAt: localInput(data.endAt), registrationOpenAt: localInput(data.registrationOpenAt), registrationCloseAt: localInput(data.registrationCloseAt), slots: data.slots.map((slot: EventInput["slots"][number]) => ({ ...slot, startAt: localInput(slot.startAt), endAt: localInput(slot.endAt) })) })).catch((reason) => setError(reason.message)).finally(() => setLoading(false));
  }, [eventId]);

  const set = <K extends keyof EventInput>(key: K, value: EventInput[K]) => {
    hasUserEditsRef.current = true;
    revisionRef.current += 1;
    setEvent((current) => ({ ...current, [key]: value }));
  };
  const updateField = (index: number, values: Partial<FormField>) => set("formFields", event.formFields.map((field, fieldIndex) => fieldIndex === index ? { ...field, ...values } : field));
  const moveField = (index: number, direction: -1 | 1) => { const next = [...event.formFields]; const target = index + direction; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; set("formFields", next); };
  const updateSlot = (index: number, values: Partial<EventInput["slots"][number]>) => set("slots", event.slots.map((slot, slotIndex) => slotIndex === index ? { ...slot, ...values } : slot));
  const addSlot = () => set("slots", [...event.slots, { id: crypto.randomUUID(), label: `Session ${event.slots.length + 1}`, startAt: event.startAt, endAt: event.endAt, location: event.location, capacity: 30, confirmationSubject: "", confirmationBody: "", accentColor: event.accentColor }]);
  const duplicateSlot = (index: number) => { const slot = event.slots[index]; set("slots", [...event.slots.slice(0, index + 1), { ...slot, id: crypto.randomUUID(), label: `${slot.label} copy` }, ...event.slots.slice(index + 1)]); };

  const toPayload = (source: EventInput, status = source.status) => ({ ...source, status, startAt: new Date(source.startAt).toISOString(), endAt: new Date(source.endAt).toISOString(), registrationOpenAt: new Date(source.registrationOpenAt).toISOString(), registrationCloseAt: new Date(source.registrationCloseAt).toISOString(), slots: source.slots.map((slot) => ({ ...slot, startAt: new Date(slot.startAt).toISOString(), endAt: new Date(slot.endAt).toISOString() })) });

  useEffect(() => {
    if (!hasUserEditsRef.current || event.status !== "draft" || !event.title.trim() || saving) return;
    if (!draftIdRef.current && creatingDraftRef.current) return;
    const revision = revisionRef.current;
    const snapshot = event;
    setAutosaveState("pending");
    const timer = window.setTimeout(async () => {
      setAutosaveState("saving");
      if (!draftIdRef.current) creatingDraftRef.current = true;
      try {
        const id = draftIdRef.current;
        const response = await fetch(id ? `/api/events/${id}` : "/api/events", { method: id ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(toPayload(snapshot, "draft")) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not autosave the draft.");
        if (!draftIdRef.current) {
          draftIdRef.current = data.event.id;
          setDraftId(data.event.id);
          router.replace(`/admin/events/${data.event.id}/edit`);
        }
        setAutosaveState("saved");
      } catch {
        setAutosaveState("error");
      } finally {
        creatingDraftRef.current = false;
        if (revisionRef.current !== revision) setAutosaveTick((value) => value + 1);
      }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [autosaveTick, event, router, saving]);

  async function save(status?: EventInput["status"]) {
    setSaving(true); setError("");
    const id = draftIdRef.current;
    const response = await fetch(id ? `/api/events/${id}` : "/api/events", { method: id ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(toPayload(event, status)) });
    const data = await response.json(); setSaving(false);
    if (!response.ok) return setError(data.error || "Could not save event.");
    router.push("/admin"); router.refresh();
  }

  const [confirmArchiveOpen, setConfirmArchiveOpen] = useState(false);

  async function archive() {
    setConfirmArchiveOpen(false);
    await fetch(`/api/events/${eventId}`, { method: "DELETE" }); router.push("/admin"); router.refresh();
  }

  if (loading) return <div className="shell page-loading">Loading event…</div>;
  return <div className="shell editor-shell">
    <div className="editor-head"><div><Link href="/admin" className="back-link back-link--dark"><ArrowLeft /> Dashboard</Link><h1>{draftId ? event.title : "Create an event"}</h1><p>Build the event, registration form, sessions, and confirmation messages in one place.</p></div><div className="editor-actions">{event.status === "draft" && <span className={`autosave-status autosave-status--${autosaveState}`} aria-live="polite">{autosaveState === "pending" ? "Draft pending" : autosaveState === "saving" ? "Saving draft…" : autosaveState === "saved" ? "Draft saved" : autosaveState === "error" ? "Autosave failed" : "Drafts save automatically"}</span>}<button className="button button--secondary" onClick={() => save("draft")} disabled={saving}><Save /> Save draft</button><button className="button button--primary" onClick={() => save("published")} disabled={saving}>{saving ? "Saving…" : event.status === "published" ? "Save changes" : "Publish event"}</button></div></div>
    {error && <div className="form-error editor-error">{error}</div>}
    <div className="editor-layout"><aside className="editor-nav"><a href="#details">Event details</a><a href="#registration">Registration settings</a><a href="#slots">Time slots</a><a href="#form">Form builder</a><a href="#email">Confirmation email</a></aside><div className="editor-sections">
      <EditorSection id="details" number="01" title="Event details" description="The information students see before they register.">
        <div className="form-stack"><label>Event name <em>*</em><input value={event.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Industry Night: Aerospace" /></label><label>Short summary <em>*</em><input value={event.summary} onChange={(e) => set("summary", e.target.value)} maxLength={180} placeholder="A one-sentence overview for the event card" /><small>{event.summary.length}/180</small></label><label>Description <em>*</em><textarea value={event.description} onChange={(e) => set("description", e.target.value)} rows={5} placeholder="What should students know?" /></label><label>Location <em>*</em><input value={event.location} onChange={(e) => set("location", e.target.value)} placeholder="Building and room" /></label><div className="form-grid"><label>Starts <em>*</em><input type="datetime-local" value={event.startAt} onChange={(e) => set("startAt", e.target.value)} /></label><label>Ends <em>*</em><input type="datetime-local" value={event.endAt} onChange={(e) => set("endAt", e.target.value)} /></label></div><label className="color-field"><span>Event color</span><span className="color-field__controls"><input type="color" value={event.accentColor} onChange={(e) => set("accentColor", e.target.value)} aria-label="Select event color" /><input className="color-field__value" value={event.accentColor} onChange={(e) => set("accentColor", e.target.value)} aria-label="Event color hex value" /></span></label></div>
      </EditorSection>
      <EditorSection id="registration" number="02" title="Registration settings" description="Control when registration is visible and how capacity works.">
        <div className="form-grid"><label>Registration opens <em>*</em><input type="datetime-local" value={event.registrationOpenAt} onChange={(e) => set("registrationOpenAt", e.target.value)} /></label><label>Registration closes <em>*</em><input type="datetime-local" value={event.registrationCloseAt} onChange={(e) => set("registrationCloseAt", e.target.value)} /></label></div><label className="stack-label">Capacity model<div className="segmented"><button className={event.capacityMode === "event" ? "active" : ""} onClick={() => set("capacityMode", "event")} type="button">Whole event</button><button className={event.capacityMode === "slot" ? "active" : ""} onClick={() => set("capacityMode", "slot")} type="button">Per time slot</button><button className={event.capacityMode === "unlimited" ? "active" : ""} onClick={() => set("capacityMode", "unlimited")} type="button">Unlimited</button></div></label>{event.capacityMode === "event" && <label>Maximum registrants<input type="number" min="1" value={event.capacity ?? ""} onChange={(e) => set("capacity", Number(e.target.value))} /></label>}<label className="checkbox-row checkbox-row--editor"><input type="checkbox" checked={event.tamuEmailOnly} onChange={(e) => set("tamuEmailOnly", e.target.checked)} /><span><strong>TAMU email addresses only</strong><small>Only people using an @tamu.edu address can register.</small></span></label><p className="help-callout">Closing registration never removes participant data. You can view and export registrations from past events at any time.</p>
      </EditorSection>
      <EditorSection id="slots" number="03" title="Time slots" description="Offer multiple sessions, rooms, and individual capacity limits.">
        {event.slots.length === 0 ? <div className="builder-empty"><CalendarSlotIcon /><h3>No time slots yet</h3><p>Add sessions when students need to choose a time.</p></div> : <div className="builder-list">{event.slots.map((slot, index) => <div className="builder-card slot-builder" key={slot.id}><div className="builder-card__head"><span className="drag-handle"><GripVertical /></span><strong>{slot.label || `Session ${index + 1}`}</strong><div><button onClick={() => duplicateSlot(index)} title="Duplicate" type="button"><Copy /></button><button onClick={() => set("slots", event.slots.filter((_, i) => i !== index))} title="Delete" type="button"><Trash2 /></button></div></div><div className="form-stack"><label>Session name<input value={slot.label} onChange={(e) => updateSlot(index, { label: e.target.value })} /></label><div className="form-grid"><label>Starts<input type="datetime-local" value={slot.startAt} onChange={(e) => updateSlot(index, { startAt: e.target.value })} /></label><label>Ends<input type="datetime-local" value={slot.endAt} onChange={(e) => updateSlot(index, { endAt: e.target.value })} /></label></div><div className="form-grid"><label>Room / location<input value={slot.location} onChange={(e) => updateSlot(index, { location: e.target.value })} /></label>{event.capacityMode === "slot" && <label>Maximum registrants<input type="number" min="1" value={slot.capacity ?? ""} onChange={(e) => updateSlot(index, { capacity: Number(e.target.value) })} /></label>}</div><details className="slot-email"><summary>Customize this slot&apos;s confirmation</summary><label>Accent color<input type="color" value={slot.accentColor || event.accentColor} onChange={(e) => updateSlot(index, { accentColor: e.target.value })} /></label><label>Subject override<input value={slot.confirmationSubject || ""} onChange={(e) => updateSlot(index, { confirmationSubject: e.target.value })} placeholder="Leave blank to use event template" /></label><label>Message override<textarea rows={4} value={slot.confirmationBody || ""} onChange={(e) => updateSlot(index, { confirmationBody: e.target.value })} placeholder="Leave blank to use event template" /></label></details></div></div>)}</div>}<button type="button" className="button button--add" onClick={addSlot}><Plus /> Add time slot</button>
      </EditorSection>
      <EditorSection id="form" number="04" title="Registration form" description="Collect exactly what this event needs. You can edit questions after publishing.">
        {event.formFields.length === 0 ? <div className="builder-empty"><FormIcon /><h3>No custom questions</h3><p>Name, email, and UIN are included automatically.</p></div> : <div className="builder-list">{event.formFields.map((field, index) => <div className="builder-card" key={field.id}><div className="builder-card__head"><span className="drag-handle"><GripVertical /></span><strong>{field.label || "Untitled question"}</strong><div><button onClick={() => moveField(index, -1)} disabled={index === 0} title="Move up" type="button"><ChevronUp /></button><button onClick={() => moveField(index, 1)} disabled={index === event.formFields.length - 1} title="Move down" type="button"><ChevronDown /></button><button onClick={() => set("formFields", event.formFields.filter((_, i) => i !== index))} title="Delete" type="button"><Trash2 /></button></div></div><div className="form-grid"><label>Question<input value={field.label} onChange={(e) => updateField(index, { label: e.target.value })} /></label><label>Answer type<select value={field.type} onChange={(e) => updateField(index, { type: e.target.value as QuestionType })}>{questionTypes.map((type) => <option value={type.value} key={type.value}>{type.label}</option>)}</select></label></div>{hasOptions(field.type) && <label>Options <small>(one per line)</small><textarea rows={4} value={(field.options ?? []).join("\n")} onChange={(e) => updateField(index, { options: e.target.value.split("\n").filter(Boolean) })} /></label>}<div className="form-grid"><label>Help text<input value={field.helpText || ""} onChange={(e) => updateField(index, { helpText: e.target.value })} placeholder="Optional context" /></label><label className="checkbox-row checkbox-row--editor"><input type="checkbox" checked={field.required} onChange={(e) => updateField(index, { required: e.target.checked })} /><span>Required question</span></label></div></div>)}</div>}<button type="button" className="button button--add" onClick={() => set("formFields", [...event.formFields, { id: crypto.randomUUID(), label: "", type: "short_text", required: false }])}><Plus /> Add question</button>
      </EditorSection>
      <EditorSection id="email" number="05" title="Confirmation email" description="Sent automatically after a successful registration. Slots can override this template.">
        <div className="template-variables"><strong>Available variables</strong>{["{{firstName}}", "{{name}}", "{{event}}", "{{slot}}", "{{date}}", "{{time}}", "{{room}}"].map((variable) => <code key={variable}>{variable}</code>)}</div><div className="form-stack"><label>Subject<input value={event.confirmationSubject} onChange={(e) => set("confirmationSubject", e.target.value)} /></label><label>Message<textarea rows={7} value={event.confirmationBody} onChange={(e) => set("confirmationBody", e.target.value)} /></label><label className="checkbox-row checkbox-row--editor"><input type="checkbox" checked={event.showDateInConfirmation !== false} onChange={(e) => set("showDateInConfirmation", e.target.checked)} /><span><strong>Show the event date in the confirmation card</strong><small>Turn off to show only the time and location, useful for recurring or date-flexible events.</small></span></label></div><div className="email-preview"><div><small>STUDENT ENGINEERS&apos; COUNCIL</small><strong>Registration Confirmed</strong></div><div><p>{event.confirmationBody.replaceAll("{{firstName}}", "Reveille").replaceAll("{{event}}", event.title || "Your event").replaceAll("{{date}}", "Mar 4").replaceAll("{{time}}", "11:30 AM").replaceAll("{{room}}", event.location || "ZACH 340")}</p><section style={{ borderColor: event.accentColor }}><strong>{event.title || "Your event"}</strong><span>{event.showDateInConfirmation !== false ? `${previewDate(event.startAt)}, ` : ""}{previewTime(event.startAt)} – {previewTime(event.endAt)}</span><span>{event.location || "Event location"}</span></section></div></div>
      </EditorSection>
      <div className="editor-bottom-actions">{eventId && event.status !== "archived" && <button className="danger-link" onClick={() => setConfirmArchiveOpen(true)}>Archive event</button>}<div><button className="button button--secondary" onClick={() => save("draft")} disabled={saving}>Save draft</button><button className="button button--primary" onClick={() => save("published")} disabled={saving}>{saving ? "Saving…" : "Save & publish"}</button></div></div>
    </div></div>
    <ConfirmDialog
      open={confirmArchiveOpen}
      title="Archive this event?"
      description="The event moves out of the active list and registration closes right away. Nothing is deleted — past registrations and participant data stay fully available to view and export."
      confirmLabel="Archive event"
      tone="danger"
      onConfirm={archive}
      onCancel={() => setConfirmArchiveOpen(false)}
    />
  </div>;
}

function EditorSection({ id, number, title, description, children }: { id: string; number: string; title: string; description: string; children: React.ReactNode }) { return <section id={id} className="editor-section"><div className="editor-section__head"><span>{number}</span><div><h2>{title}</h2><p>{description}</p></div></div><div className="editor-section__body">{children}</div></section>; }
function CalendarSlotIcon() { return <div className="builder-empty__icon">12:30</div>; }
function FormIcon() { return <div className="builder-empty__icon">Aa</div>; }
