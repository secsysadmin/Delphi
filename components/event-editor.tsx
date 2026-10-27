"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronUp, Copy, EyeOff, GripVertical, Plus, Save, Send, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import type { EventInput, FormField, QuestionType, RegistrationEvent } from "@/types";
import { getJson, jsonRequest, sendJson } from "@/lib/api-client";
import { scrollIntoViewCentered, validateFields } from "@/lib/form-validation";
import {
  DEFAULT_ACCENT_COLOR,
  DEFAULT_CONFIRMATION_SUBJECT,
  PREVIEW_PERSON,
  SUMMARY_MAX_LENGTH,
  TEMPLATE_VARIABLES,
  centralInputFromToday,
  confirmationColors,
  confirmationTemplate,
  convertEventTimes,
  fillTemplate,
  formatRange,
  fromCentralInput,
  registrationWindowChanged,
  registrationWindowProblem,
  type RegistrationWindow,
  templateValues,
  toCentralInput,
} from "@/lib/utils";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { RichText } from "@/components/rich-text";

type Slot = EventInput["slots"][number];
type AutosaveState = "idle" | "pending" | "saving" | "saved" | "error";
type TemplateTarget = HTMLInputElement | HTMLTextAreaElement;
type EventEditorProps = { eventId?: string };
type EditorSectionProps = { id: string; number: string; title: string; description: string; children: React.ReactNode };
type SlotCardProps = {
  slot: Slot;
  index: number;
  event: EventInput;
  registered: number;
  onChange: (values: Partial<Slot>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onTemplateFocus: (focusEvent: React.FocusEvent<TemplateTarget>) => void;
};
type QuestionCardProps = {
  field: FormField;
  isFirst: boolean;
  isLast: boolean;
  onChange: (values: Partial<FormField>) => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
};
type EmailPreviewProps = { event: EventInput; previewSlotId: string };

const QUESTION_TYPE_OPTIONS: Array<{ value: QuestionType; label: string }> = [
  { value: "short_text", label: "Short answer" }, { value: "long_text", label: "Long answer" },
  { value: "email", label: "Email" }, { value: "phone", label: "Phone" }, { value: "number", label: "Number" },
  { value: "select", label: "Dropdown" }, { value: "radio", label: "Single choice" },
  { value: "multiselect", label: "Multiple choice" }, { value: "checkbox", label: "Acknowledgement" }, { value: "date", label: "Date" },
  { value: "section", label: "Title and description" },
];
const CHOICE_TYPES = new Set<QuestionType>(["select", "radio", "multiselect"]);
const CAPACITY_MODES: Array<{ value: EventInput["capacityMode"]; label: string }> = [
  { value: "event", label: "Whole event" },
  { value: "slot", label: "Per time slot" },
  { value: "unlimited", label: "Unlimited" },
];
const AUTOSAVE_LABELS: Record<AutosaveState, string> = {
  idle: "Drafts save automatically",
  pending: "Draft pending",
  saving: "Saving draft…",
  saved: "Draft saved",
  error: "Autosave failed",
};
const AUTOSAVE_DELAY_MS = 900;
const DEFAULT_EVENT_CAPACITY = 100;
const DEFAULT_SLOT_CAPACITY = 30;
const NEW_EVENT_DAYS_AHEAD = 30;
const NEW_EVENT_START_HOUR = 9;
const NEW_EVENT_END_HOUR = 11;
const NEW_EVENT_CLOSE_DAYS_AHEAD = 28;
const NEW_EVENT_CLOSE_HOUR = 23;
const NEW_EVENT_CONFIRMATION_BODY = "Howdy {{firstName}}!\n\nYour registration for {{event}} is confirmed. We look forward to seeing you on {{date}} at {{time}} in {{room}}.";
const FORMATTING_HINT = "Formatting: **bold**, *italics*, start a line with - for bullets or 1. for a numbered list.";

const toPayload = (source: EventInput, status = source.status) => ({ ...convertEventTimes(source, fromCentralInput), status });

const blankEvent = (): EventInput => ({
  slug: "", title: "", summary: "", description: "", location: "",
  startAt: centralInputFromToday(NEW_EVENT_DAYS_AHEAD, NEW_EVENT_START_HOUR),
  endAt: centralInputFromToday(NEW_EVENT_DAYS_AHEAD, NEW_EVENT_END_HOUR),
  registrationOpenAt: toCentralInput(new Date()),
  registrationCloseAt: centralInputFromToday(NEW_EVENT_CLOSE_DAYS_AHEAD, NEW_EVENT_CLOSE_HOUR),
  status: "draft", capacityMode: "event", capacity: DEFAULT_EVENT_CAPACITY, tamuEmailOnly: false, uinRequired: false, sortOrder: 0, accentColor: DEFAULT_ACCENT_COLOR,
  formFields: [], confirmationSubject: DEFAULT_CONFIRMATION_SUBJECT, showDateInConfirmation: true,
  confirmationBody: NEW_EVENT_CONFIRMATION_BODY, slots: [],
});

const sessionName = (slot: Slot, index: number) => slot.label || `Session ${index + 1}`;
const numberOrNull = (value: string) => value === "" ? null : Number(value);

function saveRequest(id: string | undefined, payload: EventInput) {
  return sendJson<{ event: RegistrationEvent }>(id ? `/api/events/${id}` : "/api/events", jsonRequest(id ? "PUT" : "POST", payload));
}

function EditorSection({ id, number, title, description, children }: EditorSectionProps) {
  return <section id={id} className="editor-section"><div className="editor-section__head"><span>{number}</span><div><h2>{title}</h2><p>{description}</p></div></div><div className="editor-section__body">{children}</div></section>;
}

function SlotCard({ slot, index, event, registered, onChange, onDuplicate, onDelete, onTemplateFocus }: SlotCardProps) {
  const name = sessionName(slot, index);
  return <div className="builder-card slot-builder"><div className="builder-card__head"><span className="drag-handle"><GripVertical /></span><strong>{name}</strong>{registered > 0 && <small className="builder-card__meta">{registered} registered</small>}<div><button onClick={onDuplicate} title="Duplicate" aria-label={`Duplicate ${slot.label || `session ${index + 1}`}`} type="button"><Copy /></button><button onClick={onDelete} disabled={registered > 0} title={registered > 0 ? "People are registered for this session. Change its time or room instead, or remove them first." : "Delete"} aria-label={`Delete ${slot.label || `session ${index + 1}`}`} type="button"><Trash2 /></button></div></div><div className="form-stack"><label>Session name<input value={slot.label} onChange={(e) => onChange({ label: e.target.value })} /></label><div className="form-grid"><label><span>Starts <em>*</em></span><input required type="datetime-local" value={slot.startAt} onChange={(e) => onChange({ startAt: e.target.value })} /></label><label><span>Ends <em>*</em></span><input required type="datetime-local" value={slot.endAt} onChange={(e) => onChange({ endAt: e.target.value })} /></label></div><div className="form-grid"><label>Room / location<input value={slot.location} onChange={(e) => onChange({ location: e.target.value })} /></label>{event.capacityMode === "slot" && <label><span>Maximum registrants <em>*</em></span><input required type="number" min="1" value={slot.capacity ?? ""} onChange={(e) => onChange({ capacity: numberOrNull(e.target.value) })} /></label>}</div><details className="slot-email"><summary>Customize this slot&apos;s confirmation</summary><label><span>Accent color <small>(defaults to the event color)</small></span><input type="color" value={slot.accentColor || event.accentColor} onChange={(e) => onChange({ accentColor: e.target.value === event.accentColor ? "" : e.target.value })} /></label><label>Subject override<input value={slot.confirmationSubject || ""} onChange={(e) => onChange({ confirmationSubject: e.target.value })} data-template={`slot-subject:${index}`} onFocus={onTemplateFocus} placeholder="Leave blank to use event template" /></label><label>Message override<textarea rows={4} value={slot.confirmationBody || ""} onChange={(e) => onChange({ confirmationBody: e.target.value })} data-template={`slot-body:${index}`} onFocus={onTemplateFocus} placeholder="Leave blank to use event template" /></label></details></div></div>;
}

function QuestionCard({ field, isFirst, isLast, onChange, onMove, onDelete }: QuestionCardProps) {
  const isSection = field.type === "section";
  return <div className="builder-card"><div className="builder-card__head"><span className="drag-handle"><GripVertical /></span><strong>{field.label || (isSection ? "Untitled section" : "Untitled question")}</strong><div><button onClick={() => onMove(-1)} disabled={isFirst} title="Move up" aria-label="Move up" type="button"><ChevronUp /></button><button onClick={() => onMove(1)} disabled={isLast} title="Move down" aria-label="Move down" type="button"><ChevronDown /></button><button onClick={onDelete} title="Delete" aria-label="Delete question" type="button"><Trash2 /></button></div></div><div className="form-grid"><label>{isSection ? "Title" : <span>Question <em>*</em></span>}<input required={!isSection} value={field.label} onChange={(e) => onChange({ label: e.target.value })} /></label><label>Answer type<select value={field.type} onChange={(e) => onChange({ type: e.target.value as QuestionType })}>{QUESTION_TYPE_OPTIONS.map((type) => <option value={type.value} key={type.value}>{type.label}</option>)}</select></label></div>{CHOICE_TYPES.has(field.type) && <label><span>Options <small>(one per line)</small></span><textarea required rows={4} value={(field.options ?? []).join("\n")} onChange={(e) => onChange({ options: e.target.value.split("\n") })} /></label>}{isSection ? <><label>Description<textarea rows={8} value={field.helpText || ""} onChange={(e) => onChange({ helpText: e.target.value })} placeholder="Policies, instructions, or other context shown to registrants" /><small className="field-hint">{FORMATTING_HINT}</small></label>{field.helpText?.trim() && <div className="section-preview"><span>Preview</span><div className="form-section-block">{field.label && <h3>{field.label}</h3>}<RichText text={field.helpText} /></div></div>}</> : <div className="form-grid"><label>Help text<input value={field.helpText || ""} onChange={(e) => onChange({ helpText: e.target.value })} placeholder="Optional context" /></label><label className="checkbox-row checkbox-row--editor"><input type="checkbox" checked={field.required} onChange={(e) => onChange({ required: e.target.checked })} /><span>Required question</span></label></div>}</div>;
}

function previewSlotFor(event: EventInput, previewSlotId: string) {
  return event.slots.find((slot) => slot.id === previewSlotId) ?? event.slots[0];
}

function EmailPreview({ event, previewSlotId }: EmailPreviewProps) {
  const slot = previewSlotFor(event, previewSlotId);
  const start = fromCentralInput(slot?.startAt || event.startAt);
  const end = fromCentralInput(slot?.endAt || event.endAt);
  const previewEvent = { title: event.title || "Your event", startAt: start, location: event.location || "Event location", confirmationSubject: event.confirmationSubject, confirmationBody: event.confirmationBody };
  const previewSlot = slot ? { label: slot.label || "Session", startAt: start, location: slot.location, confirmationSubject: slot.confirmationSubject, confirmationBody: slot.confirmationBody } : null;
  const values = start
    ? templateValues(PREVIEW_PERSON, previewEvent, previewSlot)
    : { firstName: PREVIEW_PERSON.firstName, name: `${PREVIEW_PERSON.firstName} ${PREVIEW_PERSON.lastName}`, event: previewEvent.title, slot: previewSlot?.label ?? "", date: "Event date", time: "Event time", room: previewSlot?.location || previewEvent.location };
  const template = confirmationTemplate(previewEvent, previewSlot);
  const when = start && end ? formatRange(start, end, event.showDateInConfirmation !== false) : "Event date and time";
  const colors = confirmationColors(event.accentColor, slot?.accentColor);
  const usesSlotTemplate = Boolean(slot?.confirmationSubject || slot?.confirmationBody);
  return <>
    <p className="email-preview__subject"><span>Subject</span>{fillTemplate(template.subject, values)}</p>
    <div className="email-preview"><div><small>STUDENT ENGINEERS&apos; COUNCIL</small><strong>Registration Confirmed</strong></div><div><p>{fillTemplate(template.body, values)}</p><section className="email-preview__card" style={{ "--card-background": colors.background, "--card-foreground": colors.foreground } as React.CSSProperties}><strong>{event.title || "Your event"}</strong>{slot && <span>{slot.label}</span>}<span>{when}</span><span>{values.room}</span></section><small className="email-preview__note">The card uses the <a href="#details">event color</a>{event.slots.length ? "; each time slot can override it under “Customize this slot’s confirmation.”" : "."}</small>{slot && <small className="email-preview__note">{usesSlotTemplate ? `${slot.label || "This session"} has its own subject or message, so its registrants get the override above instead of the event template.` : `Showing what ${slot.label || "this session"} registrants receive.`}</small>}</div></div>
  </>;
}

function CalendarSlotIcon() { return <div className="builder-empty__icon">12:30</div>; }
function FormIcon() { return <div className="builder-empty__icon">Aa</div>; }

export function EventEditor({ eventId }: EventEditorProps) {
  const router = useRouter();
  const [event, setEvent] = useState<EventInput>(blankEvent);
  const [loading, setLoading] = useState(Boolean(eventId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [errorTick, setErrorTick] = useState(0);
  const [autosaveError, setAutosaveError] = useState("");
  const [draftId, setDraftId] = useState(eventId);
  const [autosaveState, setAutosaveState] = useState<AutosaveState>("idle");
  const [autosaveTick, setAutosaveTick] = useState(0);
  const [slotCounts, setSlotCounts] = useState<Record<string, number>>({});
  const [previewSlotId, setPreviewSlotId] = useState("");
  const [testEmail, setTestEmail] = useState<{ sending: boolean; ok: boolean; message: string }>({ sending: false, ok: true, message: "" });
  const [confirmArchiveOpen, setConfirmArchiveOpen] = useState(false);
  const [confirmUnpublishOpen, setConfirmUnpublishOpen] = useState(false);
  const draftIdRef = useRef(eventId);
  const layoutRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const pendingAutosaveRef = useRef<Promise<void> | null>(null);
  const hasUserEditsRef = useRef(false);
  const creatingDraftRef = useRef(false);
  const revisionRef = useRef(0);
  const closeInputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const templateTargetRef = useRef<TemplateTarget | null>(null);
  const loadedWindowRef = useRef<RegistrationWindow | null>(null);

  useEffect(() => {
    if (!eventId) return;
    getJson<{ event: RegistrationEvent }>(`/api/events/${eventId}?admin=1`).then(({ event: loaded }) => {
      const local = convertEventTimes(loaded, toCentralInput);
      loadedWindowRef.current = { status: local.status, registrationCloseAt: local.registrationCloseAt, endAt: local.endAt };
      setSlotCounts(Object.fromEntries(loaded.slots.map((slot) => [slot.id, slot.registeredCount])));
      setEvent(local);
    }).catch((reason: Error) => setError(reason.message)).finally(() => setLoading(false));
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
  const moveField = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= event.formFields.length) return;
    const next = [...event.formFields];
    [next[index], next[target]] = [next[target], next[index]];
    set("formFields", next);
  };
  const updateSlot = (index: number, values: Partial<Slot>) => {
    markEdited();
    setEvent((current) => ({ ...current, slots: current.slots.map((slot, slotIndex) => slotIndex === index ? { ...slot, ...values } : slot) }));
  };
  const addSlot = () => set("slots", [...event.slots, { id: crypto.randomUUID(), label: `Session ${event.slots.length + 1}`, startAt: event.startAt, endAt: event.endAt, location: event.location, capacity: DEFAULT_SLOT_CAPACITY, confirmationSubject: "", confirmationBody: "", accentColor: "" }]);
  const duplicateSlot = (index: number) => {
    const slot = event.slots[index];
    set("slots", [...event.slots.slice(0, index + 1), { ...slot, id: crypto.randomUUID(), label: `${slot.label} copy` }, ...event.slots.slice(index + 1)]);
  };

  const rememberTemplateField = (focusEvent: React.FocusEvent<TemplateTarget>) => { templateTargetRef.current = focusEvent.currentTarget; };
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
    const runAutosave = async () => {
      setAutosaveState("saving");
      if (!draftIdRef.current) creatingDraftRef.current = true;
      const { ok, data, error: failure } = await saveRequest(draftIdRef.current, toPayload(snapshot, "draft"));
      creatingDraftRef.current = false;
      if (ok && data.event) {
        if (!draftIdRef.current) {
          draftIdRef.current = data.event.id;
          setDraftId(data.event.id);
          window.history.replaceState(null, "", `/admin/events/${data.event.id}/edit`);
        }
        setAutosaveState("saved");
        setAutosaveError("");
      } else {
        setAutosaveError(failure || "Could not autosave the draft.");
        setAutosaveState("error");
      }
      if (revisionRef.current !== revision) setAutosaveTick((value) => value + 1);
    };
    setAutosaveState("pending");
    const timer = window.setTimeout(() => { pendingAutosaveRef.current = runAutosave(); }, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [autosaveTick, event, saving]);

  const showError = (message: string) => { setError(message); setErrorTick((tick) => tick + 1); };
  useEffect(() => {
    if (errorTick && errorRef.current) scrollIntoViewCentered(errorRef.current);
  }, [errorTick]);

  function flagClosedRegistrationWindow() {
    const problem = registrationWindowChanged(loadedWindowRef.current, event)
      ? registrationWindowProblem({ registrationCloseAt: fromCentralInput(event.registrationCloseAt), endAt: fromCentralInput(event.endAt) })
      : null;
    closeInputRef.current?.setCustomValidity(problem ?? "");
  }

  async function save(status?: EventInput["status"]) {
    if (status === "published") {
      flagClosedRegistrationWindow();
      if (!validateFields(layoutRef.current)) return showError(closeInputRef.current?.validationMessage || "Fill in the highlighted fields before publishing.");
    }
    setSaving(true); setError("");
    await pendingAutosaveRef.current;
    const { ok, error: failure } = await saveRequest(draftIdRef.current, toPayload(event, status));
    setSaving(false);
    if (!ok) return showError(failure || "Could not save event.");
    router.push("/admin"); router.refresh();
  }

  async function archive() {
    setConfirmArchiveOpen(false);
    const { ok, error: failure } = await sendJson<{ ok: boolean }>(`/api/events/${draftIdRef.current}`, { method: "DELETE" });
    if (!ok) return showError(failure || "Could not archive event.");
    router.push("/admin"); router.refresh();
  }

  function unpublish() {
    setConfirmUnpublishOpen(false);
    save("draft");
  }

  async function sendTestEmail() {
    setTestEmail({ sending: true, ok: true, message: "" });
    const slotId = previewSlotFor(event, previewSlotId)?.id ?? null;
    const { ok, data, error: failure } = await sendJson<{ to: string; status: string }>("/api/admin/test-email", jsonRequest("POST", { event: toPayload(event, "draft"), slotId }));
    if (!ok) return setTestEmail({ sending: false, ok: false, message: failure || "Could not send the test email." });
    setTestEmail({ sending: false, ok: true, message: data.status === "sent" ? `Test sent to ${data.to}. Check your inbox.` : `Email sending isn't set up on this server, so nothing was sent. In production the test goes to ${data.to}.` });
  }

  const published = event.status === "published";
  const autosaveLabel = autosaveState === "error" && autosaveError ? `Autosave failed: ${autosaveError}` : AUTOSAVE_LABELS[autosaveState];
  const actionButtons = (top: boolean) => <>
    {published
      ? <button className="button button--secondary" onClick={() => setConfirmUnpublishOpen(true)} disabled={saving}>{top && <EyeOff />} Unpublish</button>
      : <button className="button button--secondary" onClick={() => save("draft")} disabled={saving}>{top && <Save />} Save draft</button>}
    <button className="button button--primary" onClick={() => save("published")} disabled={saving}>{saving ? "Saving…" : published ? "Save changes" : "Publish event"}</button>
  </>;

  if (loading) return <div className="shell page-loading">Loading event…</div>;
  return <div className="shell editor-shell">
    <div className="editor-head"><div><Link href="/admin" className="back-link back-link--dark"><ArrowLeft /> Dashboard</Link><h1>{draftId ? event.title : "Create an event"}</h1><p>Build the event, registration form, sessions, and confirmation messages in one place.</p></div><div className="editor-actions">{event.status === "draft" && <span className={`autosave-status autosave-status--${autosaveState}`} aria-live="polite">{autosaveLabel}</span>}{actionButtons(true)}</div></div>
    {error && <div className="form-error editor-error" ref={errorRef} role="alert">{error}</div>}
    <div className="editor-layout" ref={layoutRef}><aside className="editor-nav"><a href="#details">Event details</a><a href="#registration">Registration settings</a><a href="#slots">Time slots</a><a href="#form">Form builder</a><a href="#email">Confirmation email</a></aside><div className="editor-sections">
      <EditorSection id="details" number="01" title="Event details" description="The information students see before they register. All times are Central Time.">
        <div className="form-stack"><label><span>Event name <em>*</em></span><input required value={event.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Industry Night: Aerospace" /></label><label><span>Short summary <em>*</em></span><input required value={event.summary} onChange={(e) => set("summary", e.target.value)} maxLength={SUMMARY_MAX_LENGTH} placeholder="A one-sentence overview for the event card" /><small>{event.summary.length}/{SUMMARY_MAX_LENGTH}</small></label><label><span>Description <em>*</em></span><textarea required value={event.description} onChange={(e) => set("description", e.target.value)} rows={5} placeholder="What should students know?" /><small className="field-hint">{FORMATTING_HINT}</small></label><label><span>Location <em>*</em></span><input required value={event.location} onChange={(e) => set("location", e.target.value)} placeholder="Building and room" /></label><div className="form-grid"><label><span>Starts <em>*</em></span><input required type="datetime-local" value={event.startAt} onChange={(e) => set("startAt", e.target.value)} /></label><label><span>Ends <em>*</em></span><input required type="datetime-local" value={event.endAt} onChange={(e) => set("endAt", e.target.value)} /></label></div><label className="color-field"><span>Event color</span><span className="color-field__controls"><input type="color" value={event.accentColor} onChange={(e) => set("accentColor", e.target.value)} aria-label="Select event color" /><input className="color-field__value" value={event.accentColor} onChange={(e) => set("accentColor", e.target.value)} aria-label="Event color hex value" /></span></label></div>
      </EditorSection>
      <EditorSection id="registration" number="02" title="Registration settings" description="Control when registration is visible and how capacity works. All times are Central Time.">
        <div className="form-grid"><label><span>Registration opens <em>*</em></span><input required type="datetime-local" value={event.registrationOpenAt} onChange={(e) => set("registrationOpenAt", e.target.value)} /></label><label><span>Registration closes <em>*</em></span><input ref={closeInputRef} required type="datetime-local" value={event.registrationCloseAt} onChange={(e) => { e.target.setCustomValidity(""); set("registrationCloseAt", e.target.value); }} /></label></div><label className="stack-label">Capacity model<div className="segmented">{CAPACITY_MODES.map((mode) => <button key={mode.value} className={event.capacityMode === mode.value ? "active" : ""} onClick={() => set("capacityMode", mode.value)} type="button">{mode.label}</button>)}</div></label>{event.capacityMode === "event" && <label><span>Maximum registrants <em>*</em></span><input required type="number" min="1" value={event.capacity ?? ""} onChange={(e) => set("capacity", numberOrNull(e.target.value))} /></label>}{event.capacityMode === "slot" && <p className="field-hint">Set a maximum for each session under Time slots.</p>}<label className="checkbox-row checkbox-row--editor"><input type="checkbox" checked={event.tamuEmailOnly} onChange={(e) => set("tamuEmailOnly", e.target.checked)} /><span><strong>TAMU email addresses only</strong><small>Only people using an @tamu.edu address can register.</small></span></label><label className="checkbox-row checkbox-row--editor"><input type="checkbox" checked={Boolean(event.uinRequired)} onChange={(e) => set("uinRequired", e.target.checked)} /><span><strong>Require UIN</strong><small>Registrants must enter their 9-digit UIN.</small></span></label><p className="help-callout">Closing registration never removes participant data. You can view and export registrations from past events at any time.</p>
      </EditorSection>
      <EditorSection id="slots" number="03" title="Time slots" description="Offer multiple sessions, rooms, and individual capacity limits. Sessions must fall within the event's start and end time.">
        {event.slots.length === 0 ? <div className="builder-empty"><CalendarSlotIcon /><h3>No time slots yet</h3><p>Add sessions when students need to choose a time.</p></div> : <div className="builder-list">{event.slots.map((slot, index) => <SlotCard key={slot.id} slot={slot} index={index} event={event} registered={slotCounts[slot.id] ?? 0} onChange={(values) => updateSlot(index, values)} onDuplicate={() => duplicateSlot(index)} onDelete={() => set("slots", event.slots.filter((_, i) => i !== index))} onTemplateFocus={rememberTemplateField} />)}</div>}<button type="button" className="button button--add" onClick={addSlot}><Plus /> Add time slot</button>
      </EditorSection>
      <EditorSection id="form" number="04" title="Registration form" description="Collect exactly what this event needs. You can edit questions after publishing.">
        {event.formFields.length === 0 ? <div className="builder-empty"><FormIcon /><h3>No custom questions</h3><p>Name, email, and UIN are included automatically.</p></div> : <div className="builder-list">{event.formFields.map((field, index) => <QuestionCard key={field.id} field={field} isFirst={index === 0} isLast={index === event.formFields.length - 1} onChange={(values) => updateField(index, values)} onMove={(direction) => moveField(index, direction)} onDelete={() => set("formFields", event.formFields.filter((_, i) => i !== index))} />)}</div>}<button type="button" className="button button--add" onClick={() => set("formFields", [...event.formFields, { id: crypto.randomUUID(), label: "", type: "short_text", required: false }])}><Plus /> Add question</button>
      </EditorSection>
      <EditorSection id="email" number="05" title="Confirmation email" description="Sent automatically after a successful registration. Slots can override this template.">
        <div className="template-variables"><strong>Insert a variable</strong>{TEMPLATE_VARIABLES.map((variable) => <button type="button" key={variable} onMouseDown={(e) => e.preventDefault()} onClick={() => insertVariable(variable)} title={`Insert {{${variable}}} at the cursor`}><code>{`{{${variable}}}`}</code></button>)}</div>
        <div className="form-stack"><label><span>Subject <em>*</em></span><input required value={event.confirmationSubject} onChange={(e) => set("confirmationSubject", e.target.value)} data-template="subject" onFocus={rememberTemplateField} /></label><label><span>Message <em>*</em></span><textarea ref={bodyRef} required rows={7} value={event.confirmationBody} onChange={(e) => set("confirmationBody", e.target.value)} data-template="body" onFocus={rememberTemplateField} /></label><label className="checkbox-row checkbox-row--editor"><input type="checkbox" checked={event.showDateInConfirmation !== false} onChange={(e) => set("showDateInConfirmation", e.target.checked)} /><span><strong>Show the event date in the confirmation card</strong><small>Turn off to show only the time and location, useful for recurring or date-flexible events.</small></span></label></div>
        <div className="email-preview-tools">
          {event.slots.length > 1 ? <label className="email-preview__picker">Preview as<select value={previewSlotFor(event, previewSlotId)?.id ?? ""} onChange={(e) => setPreviewSlotId(e.target.value)}>{event.slots.map((slot, index) => <option key={slot.id} value={slot.id}>{sessionName(slot, index)}</option>)}</select></label> : <span />}
          <button type="button" className="button button--secondary" onClick={sendTestEmail} disabled={testEmail.sending}><Send /> {testEmail.sending ? "Sending…" : "Send test to me"}</button>
        </div>
        {testEmail.message && <div className={testEmail.ok ? "form-success" : "form-error"} role="status">{testEmail.message}</div>}
        <EmailPreview event={event} previewSlotId={previewSlotId} />
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
