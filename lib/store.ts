import { randomUUID } from "node:crypto";
import { sql } from "@/lib/db";
import { demoEvents, demoRegistrations } from "@/lib/demo-data";
import { isUniqueViolation } from "@/lib/errors";
import {
  DEFAULT_ACCENT_COLOR,
  DEFAULT_CONFIRMATION_BODY,
  DEFAULT_CONFIRMATION_SUBJECT,
  SUMMARY_MAX_LENGTH,
  isHexColor,
  isQuestion,
  plural,
  registrationWindowChanged,
  registrationWindowProblem,
  remainingSpots,
  slugify,
} from "@/lib/utils";
import type { EventInput, EventSlot, FormField, Registration, RegistrationEvent } from "@/types";

const STATUSES = ["draft", "published", "archived"] as const;
const CAPACITY_MODES = ["event", "slot", "unlimited"] as const;
const QUESTION_TYPES = ["short_text", "long_text", "email", "phone", "number", "select", "multiselect", "radio", "checkbox", "date", "section"] as const;
const CHOICE_TYPES = new Set(["select", "radio", "multiselect"]);
const FALLBACK_SLUG = "event";
const SLUG_SAVE_ATTEMPTS = 3;
const UIN_PATTERN = /^\d{9}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TAMU_EMAIL_SUFFIX = "@tamu.edu";
const MAX_LENGTH = {
  title: 160,
  summary: SUMMARY_MAX_LENGTH,
  description: 20000,
  location: 200,
  slotLabel: 120,
  fieldLabel: 300,
  placeholder: 300,
  helpText: 10000,
  option: 200,
  confirmationSubject: 200,
  confirmationBody: 20000,
  shortAnswer: 500,
  longAnswer: 5000,
  name: 100,
  email: 254,
  uin: 20,
};

type DemoState = { events: RegistrationEvent[]; registrations: Registration[] };
type Row = Record<string, unknown>;
type Answer = string | string[] | boolean;
type CleanSlot = EventInput["slots"][number];
type RegistrationInput = {
  slotId?: string | null;
  firstName: string;
  lastName: string;
  email: string;
  uin?: string;
  answers: Record<string, unknown>;
};
type CleanRegistration = Omit<Registration, "id" | "eventId" | "status" | "emailStatus" | "createdAt">;

const globalDemo = globalThis as unknown as { secDemo?: DemoState };
const demo = (globalDemo.secDemo ??= {
  events: structuredClone(demoEvents),
  registrations: structuredClone(demoRegistrations),
});

const toIso = (value: unknown) => value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
const asNumber = (value: unknown) => value === null || value === undefined ? null : Number(value);
const text = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);

function mapEvent(row: Row, slots: EventSlot[] = []): RegistrationEvent {
  const registeredCount = Number(row.registeredCount ?? 0);
  const capacity = asNumber(row.capacity);
  return {
    id: String(row.id),
    slug: String(row.slug),
    title: String(row.title),
    summary: String(row.summary ?? ""),
    description: String(row.description ?? ""),
    location: String(row.location ?? ""),
    startAt: toIso(row.startAt),
    endAt: toIso(row.endAt),
    registrationOpenAt: toIso(row.registrationOpenAt),
    registrationCloseAt: toIso(row.registrationCloseAt),
    status: row.status as RegistrationEvent["status"],
    capacityMode: row.capacityMode as RegistrationEvent["capacityMode"],
    capacity,
    tamuEmailOnly: Boolean(row.tamuEmailOnly),
    uinRequired: Boolean(row.uinRequired),
    sortOrder: Number(row.sortOrder ?? 0),
    accentColor: String(row.accentColor ?? DEFAULT_ACCENT_COLOR),
    formFields: (row.formFields ?? []) as FormField[],
    confirmationSubject: String(row.confirmationSubject ?? DEFAULT_CONFIRMATION_SUBJECT),
    confirmationBody: String(row.confirmationBody ?? DEFAULT_CONFIRMATION_BODY),
    showDateInConfirmation: row.showDateInConfirmation === undefined ? true : Boolean(row.showDateInConfirmation),
    slots,
    registeredCount,
    remaining: row.capacityMode === "event" ? remainingSpots(capacity, registeredCount) : null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function mapSlot(row: Row): EventSlot {
  const registeredCount = Number(row.registeredCount ?? 0);
  const capacity = asNumber(row.capacity);
  return {
    id: String(row.id),
    label: String(row.label),
    startAt: toIso(row.startAt),
    endAt: toIso(row.endAt),
    location: String(row.location ?? ""),
    capacity,
    confirmationSubject: row.confirmationSubject ? String(row.confirmationSubject) : undefined,
    confirmationBody: row.confirmationBody ? String(row.confirmationBody) : undefined,
    accentColor: row.accentColor ? String(row.accentColor) : undefined,
    registeredCount,
    remaining: remainingSpots(capacity, registeredCount),
  };
}

function mapRegistration(row: Row) {
  return { ...row, createdAt: toIso(row.createdAt) } as Registration;
}

async function dbEvents(): Promise<RegistrationEvent[]> {
  if (!sql) return [];
  const eventRows = await sql<Row[]>`
    select e.id, e.slug, e.title, e.summary, e.description, e.location,
      e.start_at as "startAt", e.end_at as "endAt",
      e.registration_open_at as "registrationOpenAt",
      e.registration_close_at as "registrationCloseAt", e.status,
      e.capacity_mode as "capacityMode", e.capacity, e.tamu_email_only as "tamuEmailOnly", e.uin_required as "uinRequired", e.sort_order as "sortOrder",
      e.accent_color as "accentColor", e.form_fields as "formFields",
      e.confirmation_subject as "confirmationSubject", e.confirmation_body as "confirmationBody",
      e.show_date_in_confirmation as "showDateInConfirmation",
      e.created_at as "createdAt", e.updated_at as "updatedAt",
      count(r.id) filter (where r.status != 'cancelled')::int as "registeredCount"
    from sec_registration.events e
    left join sec_registration.registrations r on r.event_id = e.id
    group by e.id
    order by e.sort_order asc, e.start_at asc
  `;
  const slotRows = await sql<Row[]>`
    select s.id, s.event_id as "eventId", s.label, s.start_at as "startAt", s.end_at as "endAt",
      s.location, s.capacity, s.confirmation_subject as "confirmationSubject",
      s.confirmation_body as "confirmationBody", s.accent_color as "accentColor",
      count(r.id) filter (where r.status != 'cancelled')::int as "registeredCount"
    from sec_registration.event_slots s
    left join sec_registration.registrations r on r.slot_id = s.id
    group by s.id
    order by s.start_at asc
  `;
  return eventRows.map((row) => mapEvent(row, slotRows.filter((slot) => slot.eventId === row.id).map(mapSlot)));
}

export async function getEvents(options: { includeDrafts?: boolean } = {}) {
  const events = sql ? await dbEvents() : demo.events;
  return events
    .filter((event) => options.includeDrafts || event.status === "published")
    .sort((a, b) => a.sortOrder - b.sortOrder || a.startAt.localeCompare(b.startAt));
}

export async function getEvent(idOrSlug: string, includeDrafts = false) {
  const events = await getEvents({ includeDrafts });
  return events.find((event) => event.id === idOrSlug || event.slug === idOrSlug) ?? null;
}

function isoDate(value: unknown, label: string) {
  const date = new Date(String(value ?? ""));
  if (!value || Number.isNaN(date.getTime())) throw new Error(`${label} is missing or invalid.`);
  return date.toISOString();
}

function positiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function cleanSlots(input: EventInput, capacityMode: EventInput["capacityMode"]): CleanSlot[] {
  return (input.slots ?? []).map((slot, index) => {
    const label = text(slot.label, MAX_LENGTH.slotLabel) || `Session ${index + 1}`;
    const startAt = isoDate(slot.startAt, `${label} start`);
    const endAt = isoDate(slot.endAt, `${label} end`);
    if (endAt <= startAt) throw new Error(`${label} must end after it starts.`);
    return {
      ...slot,
      id: slot.id || randomUUID(),
      label,
      startAt,
      endAt,
      location: text(slot.location, MAX_LENGTH.location),
      capacity: capacityMode === "slot" ? positiveInteger(slot.capacity) : null,
      accentColor: isHexColor(slot.accentColor) ? slot.accentColor : undefined,
    };
  });
}

function cleanFormFields(input: EventInput): FormField[] {
  return (input.formFields ?? []).filter((field) => QUESTION_TYPES.includes(field.type)).map((field, index) => ({
    ...field,
    id: field.id || `field-${Date.now()}-${index}`,
    label: text(field.label, MAX_LENGTH.fieldLabel),
    helpText: field.helpText ? String(field.helpText).slice(0, MAX_LENGTH.helpText) : undefined,
    placeholder: field.placeholder ? text(field.placeholder, MAX_LENGTH.placeholder) : undefined,
    required: isQuestion(field) ? Boolean(field.required) : false,
    options: CHOICE_TYPES.has(field.type) ? [...new Set((field.options ?? []).map((option) => text(option, MAX_LENGTH.option)).filter(Boolean))] : undefined,
  }));
}

function assertPublishable({ startAt, endAt, capacityMode, slots, formFields }: Pick<EventInput, "startAt" | "endAt" | "capacityMode" | "slots" | "formFields">) {
  const outside = slots.find((slot) => slot.startAt < startAt || slot.endAt > endAt);
  if (outside) throw new Error(`${outside.label} runs outside the event's start and end time. Change the session or the event times.`);
  const uncapped = capacityMode === "slot" ? slots.find((slot) => !slot.capacity) : undefined;
  if (uncapped) throw new Error(`Set a maximum number of registrants for ${uncapped.label}.`);
  const unlabeled = formFields.find((field) => isQuestion(field) && !field.label);
  if (unlabeled) throw new Error("Every registration question needs a question title.");
  const noOptions = formFields.find((field) => CHOICE_TYPES.has(field.type) && !field.options?.length);
  if (noOptions) throw new Error(`Add at least one option to "${noOptions.label}".`);
}

function cleanInput(input: EventInput): EventInput {
  const title = text(input.title, MAX_LENGTH.title);
  if (!title) throw new Error("Event title is required.");
  const startAt = isoDate(input.startAt, "Event start");
  const endAt = isoDate(input.endAt, "Event end");
  const registrationOpenAt = isoDate(input.registrationOpenAt, "Registration open time");
  const registrationCloseAt = isoDate(input.registrationCloseAt, "Registration close time");
  if (endAt <= startAt) throw new Error("Event end time must be after its start time.");
  if (registrationCloseAt <= registrationOpenAt) throw new Error("Registration close time must be after its open time.");
  const status = STATUSES.includes(input.status) ? input.status : "draft";
  const capacityMode = CAPACITY_MODES.includes(input.capacityMode) ? input.capacityMode : "unlimited";
  const capacity = capacityMode === "event" ? positiveInteger(input.capacity) : null;
  if (capacityMode === "event" && !capacity) throw new Error("Set a valid event capacity.");
  if (capacityMode === "slot" && !(input.slots ?? []).length) throw new Error("Add at least one time slot for slot capacity.");
  const slots = cleanSlots(input, capacityMode);
  const formFields = cleanFormFields(input);
  if (status === "published") assertPublishable({ startAt, endAt, capacityMode, slots, formFields });
  return {
    ...input,
    title,
    slug: slugify(input.slug || title) || FALLBACK_SLUG,
    status,
    startAt,
    endAt,
    registrationOpenAt,
    registrationCloseAt,
    summary: text(input.summary, MAX_LENGTH.summary),
    description: text(input.description, MAX_LENGTH.description),
    location: text(input.location, MAX_LENGTH.location),
    accentColor: isHexColor(input.accentColor) ? input.accentColor : DEFAULT_ACCENT_COLOR,
    capacityMode,
    capacity,
    tamuEmailOnly: Boolean(input.tamuEmailOnly),
    uinRequired: Boolean(input.uinRequired),
    showDateInConfirmation: input.showDateInConfirmation !== false,
    sortOrder: Number(input.sortOrder) || 0,
    confirmationSubject: text(input.confirmationSubject, MAX_LENGTH.confirmationSubject) || DEFAULT_CONFIRMATION_SUBJECT,
    confirmationBody: String(input.confirmationBody ?? "").slice(0, MAX_LENGTH.confirmationBody) || DEFAULT_CONFIRMATION_BODY,
    formFields,
    slots,
  };
}

async function uniqueSlug(slug: string, eventId: string) {
  const taken = new Set(sql
    ? (await sql<{ slug: string }[]>`select slug from sec_registration.events where id != ${eventId} and (slug = ${slug} or slug like ${`${slug}-%`})`).map((row) => row.slug)
    : demo.events.filter((event) => event.id !== eventId).map((event) => event.slug));
  if (!taken.has(slug)) return slug;
  for (let n = 2; ; n++) if (!taken.has(`${slug}-${n}`)) return `${slug}-${n}`;
}

function assertNoOrphanedSlots(current: RegistrationEvent | null, slots: CleanSlot[]) {
  const orphaned = current?.slots.find((slot) => slot.registeredCount > 0 && !slots.some((item) => item.id === slot.id));
  if (orphaned) throw new Error(`${orphaned.label} has ${plural(orphaned.registeredCount, "registrant")}, so it can't be deleted. Change its time or room instead, or remove those registrants first.`);
}

function assertOpenRegistrationWindow(current: RegistrationEvent | null, next: EventInput) {
  if (next.status !== "published" || !registrationWindowChanged(current, next)) return;
  const problem = registrationWindowProblem(next);
  if (problem) throw new Error(problem);
}

function saveDemoEvent(eventId: string, input: EventInput) {
  const current = demo.events.find((item) => item.id === eventId);
  const timestamp = new Date().toISOString();
  const slots = input.slots.map((slot) => {
    const count = current?.slots.find((item) => item.id === slot.id)?.registeredCount ?? 0;
    return { ...slot, registeredCount: count, remaining: remainingSpots(slot.capacity, count) };
  });
  const registeredCount = current?.registeredCount ?? 0;
  const next: RegistrationEvent = {
    ...input,
    id: eventId,
    slots,
    registeredCount,
    remaining: input.capacityMode === "event" ? remainingSpots(input.capacity, registeredCount) : null,
    createdAt: current?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
  if (current) Object.assign(current, next);
  else demo.events.push(next);
  return next;
}

async function writeEventWithUniqueSlug({ eventId, input, baseSlug }: { eventId: string; input: EventInput; baseSlug: string }) {
  for (let attempt = 1; ; attempt++) {
    try {
      await writeEvent(eventId, input);
      return;
    } catch (error) {
      if (attempt >= SLUG_SAVE_ATTEMPTS || !isUniqueViolation(error, "slug")) throw error;
      input.slug = await uniqueSlug(baseSlug, eventId);
    }
  }
}

export async function saveEvent(rawInput: EventInput, id?: string) {
  const eventId = id || randomUUID();
  const cleaned = cleanInput(rawInput);
  const current = id ? await getEvent(id, true) : null;
  assertNoOrphanedSlots(current, cleaned.slots);
  assertOpenRegistrationWindow(current, cleaned);
  const input = { ...cleaned, slug: await uniqueSlug(cleaned.slug, eventId) };
  if (!sql) return saveDemoEvent(eventId, input);
  await writeEventWithUniqueSlug({ eventId, input, baseSlug: cleaned.slug });
  const saved = await getEvent(eventId, true);
  if (!saved) throw new Error("The event was saved but could not be reloaded. Refresh the dashboard.");
  return saved;
}

async function writeEvent(eventId: string, input: EventInput) {
  if (!sql) return;
  await sql.begin(async (tx) => {
    await tx`
      insert into sec_registration.events (id, slug, title, summary, description, location, start_at, end_at,
        registration_open_at, registration_close_at, status, capacity_mode, capacity, tamu_email_only, uin_required, sort_order,
        accent_color, form_fields, confirmation_subject, confirmation_body, show_date_in_confirmation, updated_at)
      values (${eventId}, ${input.slug}, ${input.title}, ${input.summary}, ${input.description}, ${input.location},
        ${input.startAt}, ${input.endAt}, ${input.registrationOpenAt}, ${input.registrationCloseAt}, ${input.status},
        ${input.capacityMode}, ${input.capacity}, ${input.tamuEmailOnly}, ${Boolean(input.uinRequired)}, ${input.sortOrder}, ${input.accentColor},
        ${tx.json(input.formFields as never)}, ${input.confirmationSubject}, ${input.confirmationBody},
        ${Boolean(input.showDateInConfirmation)}, now())
      on conflict (id) do update set slug = excluded.slug, title = excluded.title, summary = excluded.summary,
        description = excluded.description, location = excluded.location, start_at = excluded.start_at,
        end_at = excluded.end_at, registration_open_at = excluded.registration_open_at,
        registration_close_at = excluded.registration_close_at, status = excluded.status,
        capacity_mode = excluded.capacity_mode, capacity = excluded.capacity, tamu_email_only = excluded.tamu_email_only, uin_required = excluded.uin_required, sort_order = excluded.sort_order,
        accent_color = excluded.accent_color, form_fields = excluded.form_fields,
        confirmation_subject = excluded.confirmation_subject, confirmation_body = excluded.confirmation_body,
        show_date_in_confirmation = excluded.show_date_in_confirmation,
        updated_at = now()
    `;
    const slotIds = input.slots.map((slot) => slot.id);
    if (slotIds.length) await tx`delete from sec_registration.event_slots where event_id = ${eventId} and id not in ${tx(slotIds)}`;
    else await tx`delete from sec_registration.event_slots where event_id = ${eventId}`;
    for (const slot of input.slots) {
      await tx`
        insert into sec_registration.event_slots (id, event_id, label, start_at, end_at, location, capacity,
          confirmation_subject, confirmation_body, accent_color)
        values (${slot.id}, ${eventId}, ${slot.label}, ${slot.startAt}, ${slot.endAt}, ${slot.location},
          ${slot.capacity}, ${slot.confirmationSubject || null}, ${slot.confirmationBody || null}, ${slot.accentColor || null})
        on conflict (id) do update set label = excluded.label, start_at = excluded.start_at,
          end_at = excluded.end_at, location = excluded.location, capacity = excluded.capacity,
          confirmation_subject = excluded.confirmation_subject, confirmation_body = excluded.confirmation_body,
          accent_color = excluded.accent_color
      `;
    }
  });
}

export async function archiveEvent(id: string) {
  if (!sql) {
    const event = demo.events.find((item) => item.id === id);
    if (!event) throw new Error("Event not found.");
    event.status = "archived";
    event.updatedAt = new Date().toISOString();
    return;
  }
  await sql`update sec_registration.events set status = 'archived', updated_at = now() where id = ${id}`;
}

export async function reorderEvents(ids: string[]) {
  if (!sql) {
    ids.forEach((id, index) => {
      const event = demo.events.find((item) => item.id === id);
      if (event) event.sortOrder = index + 1;
    });
    return;
  }
  await sql.begin(async (tx) => {
    for (let index = 0; index < ids.length; index++) {
      await tx`update sec_registration.events set sort_order = ${index + 1}, updated_at = now() where id = ${ids[index]}`;
    }
  });
}

export async function getRegistrations(eventId: string) {
  if (!sql) return demo.registrations.filter((registration) => registration.eventId === eventId);
  const rows = await sql<Row[]>`
    select id, event_id as "eventId", slot_id as "slotId", first_name as "firstName",
      last_name as "lastName", email, uin, answers, status, email_status as "emailStatus",
      created_at as "createdAt" from sec_registration.registrations where event_id = ${eventId} order by created_at desc
  `;
  return rows.map(mapRegistration);
}

export async function getRegistration(eventId: string, registrationId: string) {
  return (await getRegistrations(eventId)).find((registration) => registration.id === registrationId) ?? null;
}

export async function logEmail({ eventId, recipientCount, subject, status }: { eventId: string; recipientCount: number; subject: string; status: string }) {
  if (!sql) return;
  await sql`insert into sec_registration.email_logs (event_id, recipient_count, subject, status) values (${eventId}, ${recipientCount}, ${subject}, ${status})`;
}

export function previewEvent(rawInput: EventInput): RegistrationEvent {
  const input = cleanInput({ ...rawInput, status: "draft" });
  const timestamp = new Date().toISOString();
  return {
    ...input,
    id: "preview",
    slots: input.slots.map((slot) => ({ ...slot, registeredCount: 0, remaining: slot.capacity })),
    registeredCount: 0,
    remaining: input.capacity,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function releaseSpot(holder: { registeredCount: number; remaining: number | null } | undefined) {
  if (!holder) return;
  holder.registeredCount = Math.max(0, holder.registeredCount - 1);
  if (holder.remaining !== null) holder.remaining += 1;
}

function claimSpot(holder: { registeredCount: number; remaining: number | null }) {
  holder.registeredCount++;
  if (holder.remaining !== null) holder.remaining = Math.max(0, holder.remaining - 1);
}

function deleteDemoRegistration(eventId: string, registrationId: string) {
  const index = demo.registrations.findIndex((registration) => registration.id === registrationId && registration.eventId === eventId);
  if (index < 0) return false;
  const [registration] = demo.registrations.splice(index, 1);
  if (registration.status === "cancelled") return true;
  const event = demo.events.find((item) => item.id === eventId);
  releaseSpot(event);
  releaseSpot(event?.slots.find((item) => item.id === registration.slotId));
  return true;
}

export async function deleteRegistration(eventId: string, registrationId: string) {
  if (!sql) return deleteDemoRegistration(eventId, registrationId);
  const deleted = await sql`delete from sec_registration.registrations where id = ${registrationId} and event_id = ${eventId} returning id`;
  return deleted.length > 0;
}

function cleanAnswer(field: FormField, value: unknown): Answer | undefined {
  const options = (field.options ?? []).map((option) => String(option).trim());
  if (field.type === "checkbox") return value === true;
  if (field.type === "multiselect") return Array.isArray(value) ? value.map((item) => String(item).trim()).filter((item) => options.includes(item)) : [];
  if (typeof value !== "string" || !value.trim()) return undefined;
  const answer = value.trim().slice(0, field.type === "long_text" ? MAX_LENGTH.longAnswer : MAX_LENGTH.shortAnswer);
  if ((field.type === "select" || field.type === "radio") && !options.includes(answer)) throw new Error(`Choose one of the options for ${field.label}.`);
  return answer;
}

function cleanAnswers(fields: FormField[], raw: unknown) {
  const source = raw && typeof raw === "object" ? raw as Row : {};
  const answers: Record<string, Answer> = {};
  for (const field of fields.filter(isQuestion)) {
    const answer = cleanAnswer(field, source[field.id]);
    const empty = answer === undefined || answer === false || (Array.isArray(answer) && !answer.length);
    if (field.required && empty) throw new Error(`${field.label} is required.`);
    if (answer !== undefined) answers[field.id] = answer;
  }
  return answers;
}

function assertRegistrationOpen(event: RegistrationEvent) {
  const now = Date.now();
  if (new Date(event.registrationOpenAt).getTime() > now) throw new Error("Registration has not opened yet.");
  if (new Date(event.registrationCloseAt).getTime() < now) throw new Error("Registration is closed.");
}

function cleanRegistration(event: RegistrationEvent, rawInput: RegistrationInput): CleanRegistration {
  const input = {
    slotId: rawInput.slotId ? String(rawInput.slotId) : null,
    firstName: text(rawInput.firstName, MAX_LENGTH.name),
    lastName: text(rawInput.lastName, MAX_LENGTH.name),
    email: text(rawInput.email, MAX_LENGTH.email).toLowerCase(),
    uin: text(rawInput.uin, MAX_LENGTH.uin),
    answers: cleanAnswers(event.formFields, rawInput.answers),
  };
  if (!input.firstName || !input.lastName) throw new Error("First and last name are required.");
  if (!EMAIL_PATTERN.test(input.email)) throw new Error("Enter a valid email address.");
  if (event.tamuEmailOnly && !input.email.endsWith(TAMU_EMAIL_SUFFIX)) throw new Error("This event is only open to @tamu.edu email addresses.");
  if (input.uin && !UIN_PATTERN.test(input.uin)) throw new Error("Enter your 9-digit UIN.");
  if (event.uinRequired && !input.uin) throw new Error("UIN is required.");
  const slot = input.slotId ? event.slots.find((item) => item.id === input.slotId) : null;
  if (event.slots.length && !slot) throw new Error("Select a time slot.");
  return { ...input, slotId: slot?.id ?? null };
}

function createDemoRegistration({ id, event, slot, input }: { id: string; event: RegistrationEvent; slot: EventSlot | null; input: CleanRegistration }) {
  if (demo.registrations.some((item) => item.eventId === event.id && item.email.toLowerCase() === input.email && item.status !== "cancelled")) {
    throw new Error("This email is already registered for the event.");
  }
  if (event.capacityMode === "event" && event.remaining !== null && event.remaining <= 0) throw new Error("This event is full.");
  if (event.capacityMode === "slot" && slot && slot.remaining !== null && slot.remaining <= 0) throw new Error("This time slot is full.");
  const registration: Registration = { ...input, id, eventId: event.id, status: "confirmed", emailStatus: "pending", createdAt: new Date().toISOString() };
  demo.registrations.push(registration);
  claimSpot(event);
  if (slot) claimSpot(slot);
  return { registration, event, slot };
}

export async function createRegistration(eventId: string, rawInput: RegistrationInput) {
  const event = await getEvent(eventId);
  if (!event) throw new Error("Event not found.");
  assertRegistrationOpen(event);
  const input = cleanRegistration(event, rawInput);
  const slot = event.slots.find((item) => item.id === input.slotId) ?? null;
  const id = randomUUID();
  if (!sql) return createDemoRegistration({ id, event, slot, input });

  return sql.begin(async (tx) => {
    const lockedEvents = await tx<Row[]>`select id, capacity_mode as "capacityMode", capacity from sec_registration.events where id = ${eventId} for update`;
    if (!lockedEvents.length) throw new Error("Event not found.");
    const duplicate = await tx`select id from sec_registration.registrations where event_id = ${eventId} and lower(email) = lower(${input.email}) and status != 'cancelled' limit 1`;
    if (duplicate.length) throw new Error("This email is already registered for the event.");
    if (lockedEvents[0].capacityMode === "event" && lockedEvents[0].capacity) {
      const [{ count }] = await tx<{ count: number }[]>`select count(*)::int as count from sec_registration.registrations where event_id = ${eventId} and status != 'cancelled'`;
      if (count >= Number(lockedEvents[0].capacity)) throw new Error("This event is full.");
    }
    if (slot) {
      const slots = await tx<Row[]>`select id, capacity from sec_registration.event_slots where id = ${slot.id} and event_id = ${eventId} for update`;
      if (!slots.length) throw new Error("Time slot not found.");
      if (slots[0].capacity) {
        const [{ count }] = await tx<{ count: number }[]>`select count(*)::int as count from sec_registration.registrations where slot_id = ${slot.id} and status != 'cancelled'`;
        if (count >= Number(slots[0].capacity)) throw new Error("This time slot is full.");
      }
    }
    const rows = await tx<Row[]>`
      insert into sec_registration.registrations (id, event_id, slot_id, first_name, last_name, email, uin, answers)
      values (${id}, ${eventId}, ${slot?.id ?? null}, ${input.firstName}, ${input.lastName},
        ${input.email}, ${input.uin}, ${tx.json(input.answers as never)})
      returning id, event_id as "eventId", slot_id as "slotId", first_name as "firstName",
        last_name as "lastName", email, uin, answers, status, email_status as "emailStatus", created_at as "createdAt"
    `;
    return { registration: mapRegistration(rows[0]), event, slot };
  });
}

export async function updateEmailStatus(registrationId: string, status: string) {
  if (!sql) {
    const registration = demo.registrations.find((item) => item.id === registrationId);
    if (registration) registration.emailStatus = status;
    return;
  }
  await sql`update sec_registration.registrations set email_status = ${status} where id = ${registrationId}`;
}
