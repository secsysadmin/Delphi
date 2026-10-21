import { randomUUID } from "node:crypto";
import { sql } from "@/lib/db";
import { demoEvents, demoRegistrations } from "@/lib/demo-data";
import { isQuestion, slugify } from "@/lib/utils";
import type { EventInput, EventSlot, FormField, Registration, RegistrationEvent } from "@/types";

type DemoState = { events: RegistrationEvent[]; registrations: Registration[] };
const globalDemo = globalThis as unknown as { secDemo?: DemoState };
const demo = (globalDemo.secDemo ??= {
  events: structuredClone(demoEvents),
  registrations: structuredClone(demoRegistrations),
});

const toIso = (value: unknown) => value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
const asNumber = (value: unknown) => value === null || value === undefined ? null : Number(value);

function mapEvent(row: Record<string, unknown>, slots: EventSlot[] = []): RegistrationEvent {
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
    accentColor: String(row.accentColor ?? "#500000"),
    formFields: (row.formFields ?? []) as FormField[],
    confirmationSubject: String(row.confirmationSubject ?? "Registration confirmed: {{event}}"),
    confirmationBody: String(row.confirmationBody ?? "Howdy {{firstName}}! Your registration for {{event}} is confirmed."),
    showDateInConfirmation: row.showDateInConfirmation === undefined ? true : Boolean(row.showDateInConfirmation),
    slots,
    registeredCount,
    remaining: capacity === null || row.capacityMode !== "event" ? null : Math.max(0, capacity - registeredCount),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function mapSlot(row: Record<string, unknown>): EventSlot {
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
    remaining: capacity === null ? null : Math.max(0, capacity - registeredCount),
  };
}

async function dbEvents(): Promise<RegistrationEvent[]> {
  if (!sql) return [];
  const eventRows = await sql<Record<string, unknown>[]>`
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
  const slotRows = await sql<Record<string, unknown>[]>`
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

const STATUSES = ["draft", "published", "archived"] as const;
const CAPACITY_MODES = ["event", "slot", "unlimited"] as const;
const QUESTION_TYPES = ["short_text", "long_text", "email", "phone", "number", "select", "multiselect", "radio", "checkbox", "date", "section"] as const;
const CHOICE_TYPES = new Set(["select", "radio", "multiselect"]);

const text = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);

function isoDate(value: unknown, label: string) {
  const date = new Date(String(value ?? ""));
  if (!value || Number.isNaN(date.getTime())) throw new Error(`${label} is missing or invalid.`);
  return date.toISOString();
}

function positiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function cleanInput(input: EventInput): EventInput {
  const title = text(input.title, 160);
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
  const slots = (input.slots ?? []).map((slot, index) => {
    const label = text(slot.label, 120) || `Session ${index + 1}`;
    const slotStart = isoDate(slot.startAt, `${label} start`);
    const slotEnd = isoDate(slot.endAt, `${label} end`);
    if (slotEnd <= slotStart) throw new Error(`${label} must end after it starts.`);
    return {
      ...slot,
      id: slot.id || randomUUID(),
      label,
      startAt: slotStart,
      endAt: slotEnd,
      location: text(slot.location, 200),
      capacity: capacityMode === "slot" ? positiveInteger(slot.capacity) : null,
      accentColor: slot.accentColor && /^#[0-9a-f]{6}$/i.test(slot.accentColor) ? slot.accentColor : undefined,
    };
  });
  const formFields = (input.formFields ?? []).filter((field) => QUESTION_TYPES.includes(field.type)).map((field, index) => {
    const options = CHOICE_TYPES.has(field.type) ? [...new Set((field.options ?? []).map((option) => text(option, 200)).filter(Boolean))] : undefined;
    return {
      ...field,
      id: field.id || `field-${Date.now()}-${index}`,
      label: text(field.label, 300),
      helpText: field.helpText ? String(field.helpText).slice(0, 10000) : undefined,
      placeholder: field.placeholder ? text(field.placeholder, 300) : undefined,
      required: isQuestion(field) ? Boolean(field.required) : false,
      options,
    };
  });
  if (status === "published") {
    const unlabeled = formFields.find((field) => isQuestion(field) && !field.label);
    if (unlabeled) throw new Error("Every registration question needs a question title.");
    const noOptions = formFields.find((field) => CHOICE_TYPES.has(field.type) && !field.options?.length);
    if (noOptions) throw new Error(`Add at least one option to "${noOptions.label}".`);
  }
  return {
    ...input,
    title,
    slug: slugify(input.slug || title) || "event",
    status,
    startAt,
    endAt,
    registrationOpenAt,
    registrationCloseAt,
    summary: text(input.summary, 180),
    description: text(input.description, 20000),
    location: text(input.location, 200),
    accentColor: /^#[0-9a-f]{6}$/i.test(input.accentColor) ? input.accentColor : "#500000",
    capacityMode,
    capacity,
    tamuEmailOnly: Boolean(input.tamuEmailOnly),
    uinRequired: Boolean(input.uinRequired),
    showDateInConfirmation: input.showDateInConfirmation !== false,
    sortOrder: Number(input.sortOrder) || 0,
    confirmationSubject: text(input.confirmationSubject, 200) || "Registration confirmed: {{event}}",
    confirmationBody: String(input.confirmationBody ?? "").slice(0, 20000) || "Howdy {{firstName}}! Your registration for {{event}} is confirmed.",
    formFields,
    slots,
  };
}

// Event URLs must be unique; a repeated title gets "-2", "-3", ...
async function uniqueSlug(slug: string, eventId: string) {
  const taken = new Set(sql
    ? (await sql<{ slug: string }[]>`select slug from sec_registration.events where id != ${eventId} and (slug = ${slug} or slug like ${`${slug}-%`})`).map((row) => row.slug)
    : demo.events.filter((event) => event.id !== eventId).map((event) => event.slug));
  if (!taken.has(slug)) return slug;
  for (let n = 2; ; n++) if (!taken.has(`${slug}-${n}`)) return `${slug}-${n}`;
}

export async function saveEvent(rawInput: EventInput, id?: string) {
  const eventId = id || randomUUID();
  const cleaned = cleanInput(rawInput);
  const input = { ...cleaned, slug: await uniqueSlug(cleaned.slug, eventId) };
  const timestamp = new Date().toISOString();
  if (!sql) {
    const current = demo.events.find((item) => item.id === eventId);
    const slots = input.slots.map((slot) => {
      const existing = current?.slots.find((item) => item.id === slot.id);
      const count = existing?.registeredCount ?? 0;
      return { ...slot, registeredCount: count, remaining: slot.capacity === null ? null : Math.max(0, slot.capacity - count) };
    });
    const next: RegistrationEvent = {
      ...input,
      id: eventId,
      slots,
      registeredCount: current?.registeredCount ?? 0,
      remaining: input.capacityMode === "event" && input.capacity !== null ? Math.max(0, input.capacity - (current?.registeredCount ?? 0)) : null,
      createdAt: current?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    if (current) Object.assign(current, next);
    else demo.events.push(next);
    return next;
  }

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
  return (await getEvent(eventId, true))!;
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
  const rows = await sql<Record<string, unknown>[]>`
    select id, event_id as "eventId", slot_id as "slotId", first_name as "firstName",
      last_name as "lastName", email, uin, answers, status, email_status as "emailStatus",
      created_at as "createdAt" from sec_registration.registrations where event_id = ${eventId} order by created_at desc
  `;
  return rows.map((row) => ({ ...row, createdAt: toIso(row.createdAt) })) as Registration[];
}

export async function deleteRegistration(eventId: string, registrationId: string) {
  if (!sql) {
    const index = demo.registrations.findIndex((registration) => registration.id === registrationId && registration.eventId === eventId);
    if (index < 0) return false;
    const [registration] = demo.registrations.splice(index, 1);
    const event = demo.events.find((item) => item.id === eventId);
    const slot = event?.slots.find((item) => item.id === registration.slotId);
    if (event && registration.status !== "cancelled") {
      event.registeredCount = Math.max(0, event.registeredCount - 1);
      if (event.remaining !== null) event.remaining += 1;
    }
    if (slot && registration.status !== "cancelled") {
      slot.registeredCount = Math.max(0, slot.registeredCount - 1);
      if (slot.remaining !== null) slot.remaining += 1;
    }
    return true;
  }
  const deleted = await sql`delete from sec_registration.registrations where id = ${registrationId} and event_id = ${eventId} returning id`;
  return deleted.length > 0;
}

type RegistrationInput = {
  slotId?: string | null;
  firstName: string;
  lastName: string;
  email: string;
  uin?: string;
  answers: Record<string, unknown>;
};

type Answer = string | string[] | boolean;

// Keep only answers to this event's questions, in the shape each question type expects.
function cleanAnswers(fields: FormField[], raw: unknown) {
  const source = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const answers: Record<string, Answer> = {};
  for (const field of fields.filter(isQuestion)) {
    const value = source[field.id];
    let answer: Answer | undefined;
    if (field.type === "checkbox") answer = value === true;
    else if (field.type === "multiselect") answer = Array.isArray(value) ? value.map(String).filter((item) => field.options?.includes(item)) : [];
    else if (typeof value === "string" && value.trim()) {
      answer = value.trim().slice(0, field.type === "long_text" ? 5000 : 500);
      if ((field.type === "select" || field.type === "radio") && !field.options?.includes(answer)) throw new Error(`Choose one of the options for ${field.label}.`);
    }
    const empty = answer === undefined || answer === false || (Array.isArray(answer) && !answer.length);
    if (field.required && empty) throw new Error(`${field.label} is required.`);
    if (answer !== undefined) answers[field.id] = answer;
  }
  return answers;
}

export async function createRegistration(eventId: string, rawInput: RegistrationInput) {
  const event = await getEvent(eventId);
  if (!event) throw new Error("Event not found.");
  const now = Date.now();
  if (new Date(event.registrationOpenAt).getTime() > now) throw new Error("Registration has not opened yet.");
  if (new Date(event.registrationCloseAt).getTime() < now) throw new Error("Registration is closed.");
  const input = {
    slotId: rawInput.slotId ? String(rawInput.slotId) : null,
    firstName: text(rawInput.firstName, 100),
    lastName: text(rawInput.lastName, 100),
    email: text(rawInput.email, 254).toLowerCase(),
    uin: text(rawInput.uin, 20),
    answers: cleanAnswers(event.formFields, rawInput.answers),
  };
  if (!input.firstName || !input.lastName) throw new Error("First and last name are required.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) throw new Error("Enter a valid email address.");
  if (event.tamuEmailOnly && !input.email.endsWith("@tamu.edu")) {
    throw new Error("This event is only open to @tamu.edu email addresses.");
  }
  if (input.uin && !/^\d{9}$/.test(input.uin)) throw new Error("Enter your 9-digit UIN.");
  if (event.uinRequired && !input.uin) throw new Error("UIN is required.");
  const slot = input.slotId ? event.slots.find((item) => item.id === input.slotId) : null;
  if (event.slots.length && !slot) throw new Error("Select a time slot.");
  const id = randomUUID();
  if (!sql) {
    if (demo.registrations.some((item) => item.eventId === eventId && item.email.toLowerCase() === input.email && item.status !== "cancelled")) {
      throw new Error("This email is already registered for the event.");
    }
    if (event.capacityMode === "event" && event.remaining !== null && event.remaining <= 0) throw new Error("This event is full.");
    if (event.capacityMode === "slot" && slot?.remaining !== null && slot?.remaining !== undefined && slot.remaining <= 0) throw new Error("This time slot is full.");
    const registration: Registration = {
      id, eventId, slotId: slot?.id ?? null, firstName: input.firstName, lastName: input.lastName,
      email: input.email, uin: input.uin, answers: input.answers,
      status: "confirmed", emailStatus: "pending", createdAt: new Date().toISOString(),
    };
    demo.registrations.push(registration);
    event.registeredCount++;
    if (event.remaining !== null) event.remaining = Math.max(0, event.remaining - 1);
    if (slot) {
      slot.registeredCount++;
      if (slot.remaining !== null) slot.remaining = Math.max(0, slot.remaining - 1);
    }
    return { registration, event, slot };
  }

  return sql.begin(async (tx) => {
    const lockedEvents = await tx<Record<string, unknown>[]>`select id, capacity_mode as "capacityMode", capacity from sec_registration.events where id = ${eventId} for update`;
    if (!lockedEvents.length) throw new Error("Event not found.");
    const duplicate = await tx`select id from sec_registration.registrations where event_id = ${eventId} and lower(email) = lower(${input.email}) and status != 'cancelled' limit 1`;
    if (duplicate.length) throw new Error("This email is already registered for the event.");
    if (lockedEvents[0].capacityMode === "event" && lockedEvents[0].capacity) {
      const [{ count }] = await tx<{ count: number }[]>`select count(*)::int as count from sec_registration.registrations where event_id = ${eventId} and status != 'cancelled'`;
      if (count >= Number(lockedEvents[0].capacity)) throw new Error("This event is full.");
    }
    if (slot?.id) {
      const slots = await tx<Record<string, unknown>[]>`select id, capacity from sec_registration.event_slots where id = ${slot.id} and event_id = ${eventId} for update`;
      if (!slots.length) throw new Error("Time slot not found.");
      if (slots[0].capacity) {
        const [{ count }] = await tx<{ count: number }[]>`select count(*)::int as count from sec_registration.registrations where slot_id = ${slot.id} and status != 'cancelled'`;
        if (count >= Number(slots[0].capacity)) throw new Error("This time slot is full.");
      }
    }
    const rows = await tx<Record<string, unknown>[]>`
      insert into sec_registration.registrations (id, event_id, slot_id, first_name, last_name, email, uin, answers)
      values (${id}, ${eventId}, ${slot?.id ?? null}, ${input.firstName}, ${input.lastName},
        ${input.email}, ${input.uin}, ${tx.json(input.answers as never)})
      returning id, event_id as "eventId", slot_id as "slotId", first_name as "firstName",
        last_name as "lastName", email, uin, answers, status, email_status as "emailStatus", created_at as "createdAt"
    `;
    return { registration: { ...rows[0], createdAt: toIso(rows[0].createdAt) } as Registration, event, slot };
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
