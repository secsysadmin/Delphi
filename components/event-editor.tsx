"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronUp, Copy, EyeOff, GripVertical, Plus, Save, Send, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import type { EventInput, FormField, QuestionType } from "@/types";
import { TEMPLATE_VARIABLES, centralInputFromToday, confirmationColors, confirmationTemplate, fillTemplate, formatRange, fromCentralInput, registrationWindowProblem, templateValues, toCentralInput } from "@/lib/utils";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { RichText } from "@/components/rich-text";
import { validateFields } from "@/lib/form-validation";

const questionTypes: Array<{ value: QuestionType; label: string }> = [
  { value: "short_text", label: "Short answer" }, { value: "long_text", label: "Long answer" },
  { value: "email", label: "Email" }, { value: "phone", label: "Phone" }, { value: "number", label: "Number" },
  { value: "select", label: "Dropdown" }, { value: "radio", label: "Single choice" },
  { value: "multiselect", label: "Multiple choice" }, { value: "checkbox", label: "Acknowledgement" }, { value: "date", label: "Date" },
  { value: "section", label: "Title and description" },
];
const hasOptions = (type: QuestionType) => ["select", "radio", "multiselect"].includes(type);

const toPayload = (source: EventInput, status = source.status) => ({ ...source, status, startAt: fromCentralInput(source.startAt), endAt: fromCentralInput(source.endAt), registrationOpenAt: fromCentralInput(source.registrationOpenAt), registrationCloseAt: fromCentralInput(source.registrationCloseAt), slots: source.slots.map((slot) => ({ ...slot, startAt: fromCentralInput(slot.startAt), endAt: fromCentralInput(slot.endAt) })) });

const blankEvent = (): EventInput => ({
  slug: "", title: "", summary: "", description: "", location: "",
  startAt: centralInputFromToday(30, 9), endAt: centralInputFromToday(30, 11), registrationOpenAt: toCentralInput(new Date()), registrationCloseAt: centralInputFromToday(28, 23),
  status: "draft", capacityMode: "event", capacity: 100, tamuEmailOnly: false, uinRequired: false, sortOrder: 0, accentColor: "#500000",
  formFields: [], confirmationSubject: "Registration confirmed: {{event}}", showDateInConfirmation: true,
  confirmationBody: "Howdy {{firstName}}!\n\nYour registration for {{event}} is confirmed. We look forward to seeing you on {{date}} at {{time}} in {{room}}.", slots: [],
});

export function EventEditor({ eventId }: { eventId?: string }) {
  const router = useRouter();
  const [event, setEvent] = useState<EventInput>(blankEvent);
  const [loading, setLoading] = useState(Boolean(eventId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [errorTick, setErrorTick] = useState(0);
  const [autosaveError, setAutosaveError] = useState("");
  const [draftId, setDraftId] = useState(eventId);
  const [autosaveState, setAutosaveState] = useState<"idle" | "pending" | "saving" | "saved" | "error">("idle");
  const [autosaveTick, setAutosaveTick] = useState(0);
  const [slotCounts, setSlotCounts] = useState<Record<string, number>>({});
  const [previewSlotId, setPreviewSlotId] = useState("");
  const [testEmail, setTestEmail] = useState<{ sending: boolean; ok: boolean; message: string }>({ sending: false, ok: true, message: "" });
  const draftIdRef = useRef(eventId);
  const layoutRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const autosaveRef = useRef<Promise<void> | null>(null);
  const hasUserEditsRef = useRef(false);
  const creatingDraftRef = useRef(false);
  const revisionRef = useRef(0);
  const closeInputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const templateTargetRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  // The registration window as last loaded, so republishing an old event doesn't trip the date check.
  const loadedRef = useRef<{ status: EventInput["status"]; registrationCloseAt: string; endAt: string } | null>(null);

  useEffect(() => {
    if (!eventId) return;
    fetch(`/api/events/${eventId}?admin=1`).then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error); return data.event; }).then((data) => {
      loadedRef.current = { status: data.status, registrationCloseAt: toCentralInput(data.registrationCloseAt), endAt: toCentralInput(data.endAt) };
      setSlotCounts(Object.fromEntries(data.slots.map((slot: { id: string; registeredCount: number }) => [slot.id, slot.registeredCount])));
      setEvent({ ...data, startAt: toCentralInput(data.startAt), endAt: toCentralInput(data.endAt), registrationOpenAt: toCentralInput(data.registrationOpenAt), registrationCloseAt: toCentralInput(data.registrationCloseAt), slots: data.slots.map((slot: EventInput["slots"][number]) => ({ ...slot, startAt: toCentralInput(slot.startAt), endAt: toCentralInput(slot.endAt) })) });
    }).catch((reason) => setError(reason.message)).finally(() => setLoading(false));
  }, [eventId]);

  const markEdited = () => {
    hasUserEditsRef.current = true;
    revisionRef.current += 1;
  };
  const set = <K extends keyof EventInput>(key: K, value: EventInput[K]) => {
    markEdited();
    setEvent((current) => ({ ...current, [key]: value }));
  };
  const updateField = (index: number, values: Partial<FormField>) => {
    markEdited();
    setEvent((current) => ({ ...current, formFields: current.formFields.map((field, fieldIndex) => fieldIndex === index ? { ...field, ...values } : field) }));
  };
  const moveField = (index: number, direction: -1 | 1) => { const next = [...event.formFields]; const target = index + direction; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; set("formFields", next); };
  const updateSlot = (index: number, values: Partial<EventInput["slots"][number]>) => {
    markEdited();
    setEvent((current) => ({ ...current, slots: current.slots.map((slot, slotIndex) => slotIndex === index ? { ...slot, ...values } : slot) }));
  };
  const addSlot = () => set("slots", [...event.slots, { id: crypto.randomUUID(), label: `Session ${event.slots.length + 1}`, startAt: event.startAt, endAt: event.endAt, location: event.location, capacity: 30, confirmationSubject: "", confirmationBody: "", accentColor: "" }]);
  const duplicateSlot = (index: number) => { const slot = event.slots[index]; set("slots", [...event.slots.slice(0, index + 1), { ...slot, id: crypto.randomUUID(), label: `${slot.label} copy` }, ...event.slots.slice(index + 1)]); };

  const rememberTemplateField = (focusEvent: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => { templateTargetRef.current = focusEvent.currentTarget; };
  const insertVariable = (variable: string) => {
    const element = templateTargetRef.current?.isConnected ? templateTargetRef.current : bodyRef.current;
    if (!element) return;
    const token = `{{${variable}}}`;
    const start = element.selectionStart ?? element.value.length;
    const end = element.selectionEnd ?? start;
    const value = element.value.slice(0, start) + token + element.value.slice(end);
    const [kind, index] = (element.dataset.template ?? "body").split(":");
    if (kind === "subject") set("confirmationSubject", value);
    else if (kind === "slot-subject") updateSlot(Number(index), { confirmationSubject: value });
    else if (kind === "slot-body") updateSlot(Number(index), { confirmationBody: value });
    else set("confirmationBody", value);
    requestAnimationFrame(() => { element.focus(); element.setSelectionRange(start + token.length, start + token.length); });
  };

  useEffect(() => {
    if (!hasUserEditsRef.current || event.status !== "draft" || !event.title.trim() || saving) return;
    if (!draftIdRef.current && creatingDraftRef.current) return;
    const revision = revisionRef.current;
    const snapshot = event;
    setAutosaveState("pending");
    const timer = window.setTimeout(() => { autosaveRef.current = runAutosave(); }, 900);
    const runAutosave = async () => {
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
          // Update the address bar without remounting the editor, so nothing typed meanwhile is lost.
          window.history.replaceState(null, "", `/admin/events/${data.event.id}/edit`);
        }
        setAutosaveState("saved");
        setAutosaveError("");
      } catch (reason) {
        setAutosaveError(reason instanceof Error ? reason.message : "");
        setAutosaveState("error");
      } finally {
        creatingDraftRef.current = false;
        if (revisionRef.current !== revision) setAutosaveTick((value) => value + 1);
      }
    };
    return () => window.clearTimeout(timer);
  }, [autosaveTick, event, saving]);

  // Scroll the banner into view once React has drawn it (scrolling in the same tick found nothing to scroll to).
  const showError = (message: string) => { setError(message); setErrorTick((tick) => tick + 1); };
  useEffect(() => {
    if (!errorTick || !errorRef.current) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    errorRef.current.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
  }, [errorTick]);

  async function save(status?: EventInput["status"]) {
    if (status === "published") {
      // Flag a registration window that would close immediately on the field itself, alongside the required fields.
      const loaded = loadedRef.current;
      const changed = !loaded || loaded.status !== "published" || loaded.registrationCloseAt !== event.registrationCloseAt || loaded.endAt !== event.endAt;
      closeInputRef.current?.setCustomValidity(changed ? registrationWindowProblem({ registrationCloseAt: fromCentralInput(event.registrationCloseAt), endAt: fromCentralInput(event.endAt) }) ?? "" : "");
      if (!validateFields(layoutRef.current)) return showError(closeInputRef.current?.validationMessage || "Fill in the highlighted fields before publishing.");
    }
    setSaving(true); setError("");
    // An autosave still in flight could create a duplicate event or land after this save and undo it.
    await autosaveRef.current;
    const id = draftIdRef.current;
    try {
      const response = await fetch(id ? `/api/events/${id}` : "/api/events", { method: id ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(toPayload(event, status)) });
      const data = await response.json();
      if (!response.ok) return showError(data.error || "Could not save event.");
      router.push("/admin"); router.refresh();
    } catch {
      showError("Could not reach the server. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  const [confirmArchiveOpen, setConfirmArchiveOpen] = useState(false);
  const [confirmUnpublishOpen, setConfirmUnpublishOpen] = useState(false);

  async function archive() {
    setConfirmArchiveOpen(false);
    await fetch(`/api/events/${draftIdRef.current}`, { method: "DELETE" }); router.push("/admin"); router.refresh();
  }

  function unpublish() {
    setConfirmUnpublishOpen(false);
    save("draft");
  }

  const previewSlot = event.slots.find((slot) => slot.id === previewSlotId) ?? event.slots[0];
  const previewStart = fromCentralInput(previewSlot?.startAt || event.startAt);
  const previewEnd = fromCentralInput(previewSlot?.endAt || event.endAt);
  const previewEvent = { title: event.title || "Your event", startAt: previewStart, location: event.location || "Event location", confirmationSubject: event.confirmationSubject, confirmationBody: event.confirmationBody };
  const previewSlotShape = previewSlot ? { label: previewSlot.label || "Session", startAt: previewStart, location: previewSlot.location, confirmationSubject: previewSlot.confirmationSubject, confirmationBody: previewSlot.confirmationBody } : null;
  const previewValues = previewStart
    ? templateValues({ firstName: "Reveille", lastName: "Aggie" }, previewEvent, previewSlotShape)
    : { firstName: "Reveille", name: "Reveille Aggie", event: previewEvent.title, slot: previewSlotShape?.label ?? "", date: "Event date", time: "Event time", room: previewSlotShape?.location || previewEvent.location };
  const previewTemplate = confirmationTemplate(previewEvent, previewSlotShape);
  const previewSubject = fillTemplate(previewTemplate.subject, previewValues);
  const previewBody = fillTemplate(previewTemplate.body, previewValues);
  const previewWhen = previewStart && previewEnd ? formatRange(previewStart, previewEnd, event.showDateInConfirmation !== false) : "Event date and time";
  const previewColors = confirmationColors(event.accentColor, previewSlot?.accentColor);
  const previewUsesSlotTemplate = Boolean(previewSlot?.confirmationSubject || previewSlot?.confirmationBody);

  async function sendTestEmail() {
    setTestEmail({ sending: true, ok: true, message: "" });
    const response = await fetch("/api/admin/test-email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event: toPayload(event, "draft"), slotId: previewSlot?.id ?? null }) }).catch(() => null);
    const data = response ? await response.json().catch(() => ({})) : {};
    if (!response?.ok) return setTestEmail({ sending: false, ok: false, message: data.error || "Could not send the test email." });
    setTestEmail({ sending: false, ok: true, message: data.status === "sent" ? `Test sent to ${data.to}. Check your inbox.` : `Email sending isn't set up on this server, so nothing was sent. In production the test goes to ${data.to}.` });
  }

  const published = event.status === "published";
  const actionButtons = (top: boolean) => <>
    {published
      ? <button className="button button--secondary" onClick={() => setConfirmUnpublishOpen(true)} disabled={saving}>{top && <EyeOff />} Unpublish</button>
      : <button className="button button--secondary" onClick={() => save("draft")} disabled={saving}>{top && <Save />} Save draft</button>}
    <button className="button button--primary" onClick={() => save("published")} disabled={saving}>{saving ? "Saving…" : published ? "Save changes" : "Publish event"}</button>
  </>;

  if (loading) return <div className="shell page-loading">Loading event…</div>;
  return <div className="shell editor-shell">
    <div className="editor-head"><div><Link href="/admin" className="back-link back-link--dark"><ArrowLeft /> Dashboard</Link><h1>{draftId ? event.title : "Create an event"}</h1><p>Build the event, registration form, sessions, and confirmation messages in one place.</p></div><div className="editor-actions">{event.status === "draft" && <span className={`autosave-status autosave-status--${autosaveState}`} aria-live="polite">{autosaveState === "pending" ? "Draft pending" : autosaveState === "saving" ? "Saving draft…" : autosaveState === "saved" ? "Draft saved" : autosaveState === "error" ? (autosaveError ? `Autosave failed: ${autosaveError}` : "Autosave failed") : "Drafts save automatically"}</span>}{actionButtons(true)}</div></div>
    {error && <div className="form-error editor-error" ref={errorRef} role="alert">{error}</div>}
    <div className="editor-layout" ref={layoutRef}><aside className="editor-nav"><a href="#details">Event details</a><a href="#registration">Registration settings</a><a href="#slots">Time slots</a><a href="#form">Form builder</a><a href="#email">Confirmation email</a></aside><div className="editor-sections">
      <EditorSection id="details" number="01" title="Event details" description="The information students see before they register. All times are Central Time.">
        <div className="form-stack"><label><span>Event name <em>*</em></span><input required value={event.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Industry Night: Aerospace" /></label><label><span>Short summary <em>*</em></span><input required value={event.summary} onChange={(e) => set("summary", e.target.value)} maxLength={180} placeholder="A one-sentence overview for the event card" /><small>{event.summary.length}/180</small></label><label><span>Description <em>*</em></span><textarea required value={event.description} onChange={(e) => set("description", e.target.value)} rows={5} placeholder="What should students know?" /><small className="field-hint">Formatting: **bold**, *italics*, start a line with - for bullets or 1. for a numbered list.</small></label><label><span>Location <em>*</em></span><input required value={event.location} onChange={(e) => set("location", e.target.value)} placeholder="Building and room" /></label><div className="form-grid"><label><span>Starts <em>*</em></span><input required type="datetime-local" value={event.startAt} onChange={(e) => set("startAt", e.target.value)} /></label><label><span>Ends <em>*</em></span><input required type="datetime-local" value={event.endAt} onChange={(e) => set("endAt", e.target.value)} /></label></div><label className="color-field"><span>Event color</span><span className="color-field__controls"><input type="color" value={event.accentColor} onChange={(e) => set("accentColor", e.target.value)} aria-label="Select event color" /><input className="color-field__value" value={event.accentColor} onChange={(e) => set("accentColor", e.target.value)} aria-label="Event color hex value" /></span></label></div>
      </EditorSection>
      <EditorSection id="registration" number="02" title="Registration settings" description="Control when registration is visible and how capacity works. All times are Central Time.">
        <div className="form-grid"><label><span>Registration opens <em>*</em></span><input required type="datetime-local" value={event.registrationOpenAt} onChange={(e) => set("registrationOpenAt", e.target.value)} /></label><label><span>Registration closes <em>*</em></span><input ref={closeInputRef} required type="datetime-local" value={event.registrationCloseAt} onChange={(e) => { e.target.setCustomValidity(""); set("registrationCloseAt", e.target.value); }} /></label></div><label className="stack-label">Capacity model<div className="segmented"><button className={event.capacityMode === "event" ? "active" : ""} onClick={() => set("capacityMode", "event")} type="button">Whole event</button><button className={event.capacityMode === "slot" ? "active" : ""} onClick={() => set("capacityMode", "slot")} type="button">Per time slot</button><button className={event.capacityMode === "unlimited" ? "active" : ""} onClick={() => set("capacityMode", "unlimited")} type="button">Unlimited</button></div></label>{event.capacityMode === "event" && <label><span>Maximum registrants <em>*</em></span><input required type="number" min="1" value={event.capacity ?? ""} onChange={(e) => set("capacity", e.target.value === "" ? null : Number(e.target.value))} /></label>}{event.capacityMode === "slot" && <p className="field-hint">Set a maximum for each session under Time slots.</p>}<label className="checkbox-row checkbox-row--editor"><input type="checkbox" checked={event.tamuEmailOnly} onChange={(e) => set("tamuEmailOnly", e.target.checked)} /><span><strong>TAMU email addresses only</strong><small>Only people using an @tamu.edu address can register.</small></span></label><label className="checkbox-row checkbox-row--editor"><input type="checkbox" checked={Boolean(event.uinRequired)} onChange={(e) => set("uinRequired", e.target.checked)} /><span><strong>Require UIN</strong><small>Registrants must enter their 9-digit UIN.</small></span></label><p className="help-callout">Closing registration never removes participant data. You can view and export registrations from past events at any time.</p>
      </EditorSection>
      <EditorSection id="slots" number="03" title="Time slots" description="Offer multiple sessions, rooms, and individual capacity limits. Sessions must fall within the event's start and end time.">
        {event.slots.length === 0 ? <div className="builder-empty"><CalendarSlotIcon /><h3>No time slots yet</h3><p>Add sessions when students need to choose a time.</p></div> : <div className="builder-list">{event.slots.map((slot, index) => {
          const registered = slotCounts[slot.id] ?? 0;
          return <div className="builder-card slot-builder" key={slot.id}><div className="builder-card__head"><span className="drag-handle"><GripVertical /></span><strong>{slot.label || `Session ${index + 1}`}</strong>{registered > 0 && <small className="builder-card__meta">{registered} registered</small>}<div><button onClick={() => duplicateSlot(index)} title="Duplicate" aria-label={`Duplicate ${slot.label || `session ${index + 1}`}`} type="button"><Copy /></button><button onClick={() => set("slots", event.slots.filter((_, i) => i !== index))} disabled={registered > 0} title={registered > 0 ? "People are registered for this session. Change its time or room instead, or remove them first." : "Delete"} aria-label={`Delete ${slot.label || `session ${index + 1}`}`} type="button"><Trash2 /></button></div></div><div className="form-stack"><label>Session name<input value={slot.label} onChange={(e) => updateSlot(index, { label: e.target.value })} /></label><div className="form-grid"><label><span>Starts <em>*</em></span><input required type="datetime-local" value={slot.startAt} onChange={(e) => updateSlot(index, { startAt: e.target.value })} /></label><label><span>Ends <em>*</em></span><input required type="datetime-local" value={slot.endAt} onChange={(e) => updateSlot(index, { endAt: e.target.value })} /></label></div><div className="form-grid"><label>Room / location<input value={slot.location} onChange={(e) => updateSlot(index, { location: e.target.value })} /></label>{event.capacityMode === "slot" && <label><span>Maximum registrants <em>*</em></span><input required type="number" min="1" value={slot.capacity ?? ""} onChange={(e) => updateSlot(index, { capacity: e.target.value === "" ? null : Number(e.target.value) })} /></label>}</div><details className="slot-email"><summary>Customize this slot&apos;s confirmation</summary><label><span>Accent color <small>(defaults to the event color)</small></span><input type="color" value={slot.accentColor || event.accentColor} onChange={(e) => updateSlot(index, { accentColor: e.target.value === event.accentColor ? "" : e.target.value })} /></label><label>Subject override<input value={slot.confirmationSubject || ""} onChange={(e) => updateSlot(index, { confirmationSubject: e.target.value })} data-template={`slot-subject:${index}`} onFocus={rememberTemplateField} placeholder="Leave blank to use event template" /></label><label>Message override<textarea rows={4} value={slot.confirmationBody || ""} onChange={(e) => updateSlot(index, { confirmationBody: e.target.value })} data-template={`slot-body:${index}`} onFocus={rememberTemplateField} placeholder="Leave blank to use event template" /></label></details></div></div>;
        })}</div>}<button type="button" className="button button--add" onClick={addSlot}><Plus /> Add time slot</button>
      </EditorSection>
      <EditorSection id="form" number="04" title="Registration form" description="Collect exactly what this event needs. You can edit questions after publishing.">
        {event.formFields.length === 0 ? <div className="builder-empty"><FormIcon /><h3>No custom questions</h3><p>Name, email, and UIN are included automatically.</p></div> : <div className="builder-list">{event.formFields.map((field, index) => <div className="builder-card" key={field.id}><div className="builder-card__head"><span className="drag-handle"><GripVertical /></span><strong>{field.label || (field.type === "section" ? "Untitled section" : "Untitled question")}</strong><div><button onClick={() => moveField(index, -1)} disabled={index === 0} title="Move up" aria-label="Move up" type="button"><ChevronUp /></button><button onClick={() => moveField(index, 1)} disabled={index === event.formFields.length - 1} title="Move down" aria-label="Move down" type="button"><ChevronDown /></button><button onClick={() => set("formFields", event.formFields.filter((_, i) => i !== index))} title="Delete" aria-label="Delete question" type="button"><Trash2 /></button></div></div><div className="form-grid"><label>{field.type === "section" ? "Title" : <span>Question <em>*</em></span>}<input required={field.type !== "section"} value={field.label} onChange={(e) => updateField(index, { label: e.target.value })} /></label><label>Answer type<select value={field.type} onChange={(e) => updateField(index, { type: e.target.value as QuestionType })}>{questionTypes.map((type) => <option value={type.value} key={type.value}>{type.label}</option>)}</select></label></div>{hasOptions(field.type) && <label><span>Options <small>(one per line)</small></span><textarea required rows={4} value={(field.options ?? []).join("\n")} onChange={(e) => updateField(index, { options: e.target.value.split("\n") })} /></label>}{field.type === "section" ? <><label>Description<textarea rows={8} value={field.helpText || ""} onChange={(e) => updateField(index, { helpText: e.target.value })} placeholder="Policies, instructions, or other context shown to registrants" /><small className="field-hint">Formatting: **bold**, *italics*, start a line with - for bullets or 1. for a numbered list.</small></label>{field.helpText?.trim() && <div className="section-preview"><span>Preview</span><div className="form-section-block">{field.label && <h3>{field.label}</h3>}<RichText text={field.helpText} /></div></div>}</> : <div className="form-grid"><label>Help text<input value={field.helpText || ""} onChange={(e) => updateField(index, { helpText: e.target.value })} placeholder="Optional context" /></label><label className="checkbox-row checkbox-row--editor"><input type="checkbox" checked={field.required} onChange={(e) => updateField(index, { required: e.target.checked })} /><span>Required question</span></label></div>}</div>)}</div>}<button type="button" className="button button--add" onClick={() => set("formFields", [...event.formFields, { id: crypto.randomUUID(), label: "", type: "short_text", required: false }])}><Plus /> Add question</button>
      </EditorSection>
      <EditorSection id="email" number="05" title="Confirmation email" description="Sent automatically after a successful registration. Slots can override this template.">
        <div className="template-variables"><strong>Insert a variable</strong>{TEMPLATE_VARIABLES.map((variable) => <button type="button" key={variable} onMouseDown={(e) => e.preventDefault()} onClick={() => insertVariable(variable)} title={`Insert {{${variable}}} at the cursor`}><code>{`{{${variable}}}`}</code></button>)}</div>
        <div className="form-stack"><label><span>Subject <em>*</em></span><input required value={event.confirmationSubject} onChange={(e) => set("confirmationSubject", e.target.value)} data-template="subject" onFocus={rememberTemplateField} /></label><label><span>Message <em>*</em></span><textarea ref={bodyRef} required rows={7} value={event.confirmationBody} onChange={(e) => set("confirmationBody", e.target.value)} data-template="body" onFocus={rememberTemplateField} /></label><label className="checkbox-row checkbox-row--editor"><input type="checkbox" checked={event.showDateInConfirmation !== false} onChange={(e) => set("showDateInConfirmation", e.target.checked)} /><span><strong>Show the event date in the confirmation card</strong><small>Turn off to show only the time and location, useful for recurring or date-flexible events.</small></span></label></div>
        <div className="email-preview-tools">
          {event.slots.length > 1 ? <label className="email-preview__picker">Preview as<select value={previewSlot?.id ?? ""} onChange={(e) => setPreviewSlotId(e.target.value)}>{event.slots.map((slot, index) => <option key={slot.id} value={slot.id}>{slot.label || `Session ${index + 1}`}</option>)}</select></label> : <span />}
          <button type="button" className="button button--secondary" onClick={sendTestEmail} disabled={testEmail.sending}><Send /> {testEmail.sending ? "Sending…" : "Send test to me"}</button>
        </div>
        {testEmail.message && <div className={testEmail.ok ? "form-success" : "form-error"} role="status">{testEmail.message}</div>}
        <p className="email-preview__subject"><span>Subject</span>{previewSubject}</p>
        <div className="email-preview"><div><small>STUDENT ENGINEERS&apos; COUNCIL</small><strong>Registration Confirmed</strong></div><div><p>{previewBody}</p><section style={{ background: previewColors.background, borderColor: previewColors.background, color: previewColors.foreground }}><strong>{event.title || "Your event"}</strong>{previewSlot && <span>{previewSlot.label}</span>}<span>{previewWhen}</span><span>{previewValues.room}</span></section><small className="email-preview__note">The card uses the <a href="#details">event color</a>{event.slots.length ? "; each time slot can override it under “Customize this slot’s confirmation.”" : "."}</small>{previewSlot && <small className="email-preview__note">{previewUsesSlotTemplate ? `${previewSlot.label || "This session"} has its own subject or message, so its registrants get the override above instead of the event template.` : `Showing what ${previewSlot.label || "this session"} registrants receive.`}</small>}</div></div>
      </EditorSection>
      <div className="editor-bottom-actions">{draftId && event.status !== "archived" && <button className="danger-link" onClick={() => setConfirmArchiveOpen(true)}>Archive event</button>}<div>{actionButtons(false)}</div></div>
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
    <ConfirmDialog
      open={confirmUnpublishOpen}
      title="Unpublish this event?"
      description="Students will no longer see it or be able to register, and its link will stop working. Existing registrations are kept, and you can publish it again any time."
      confirmLabel="Unpublish"
      onConfirm={unpublish}
      onCancel={() => setConfirmUnpublishOpen(false)}
    />
  </div>;
}

function EditorSection({ id, number, title, description, children }: { id: string; number: string; title: string; description: string; children: React.ReactNode }) { return <section id={id} className="editor-section"><div className="editor-section__head"><span>{number}</span><div><h2>{title}</h2><p>{description}</p></div></div><div className="editor-section__body">{children}</div></section>; }
function CalendarSlotIcon() { return <div className="builder-empty__icon">12:30</div>; }
function FormIcon() { return <div className="builder-empty__icon">Aa</div>; }
