import { randomUUID } from "node:crypto";
import { sql } from "@/lib/db";
import { demoEvents, demoRegistrations } from "@/lib/demo-data";
import { slugify } from "@/lib/utils";
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
    sortOrder: Number(row.sortOrder ?? 0),
    accentColor: String(row.accentColor ?? "#500000"),
    formFields: (row.formFields ?? []) as FormField[],
    confirmationSubject: String(row.confirmationSubject ?? "Registration confirmed: {{event}}"),
    confirmationBody: String(row.confirmationBody ?? "Howdy {{firstName}}! Your registration for {{event}} is confirmed."),
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
      e.capacity_mode as "capacityMode", e.capacity, e.sort_order as "sortOrder",
      e.accent_color as "accentColor", e.form_fields as "formFields",
      e.confirmation_subject as "confirmationSubject", e.confirmation_body as "confirmationBody",
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

function cleanInput(input: EventInput): EventInput {
  const title = String(input.title ?? "").trim();
  if (!title) throw new Error("Event title is required.");
  if (!input.startAt || !input.endAt || !input.registrationOpenAt || !input.registrationCloseAt) {
    throw new Error("Event and registration dates are required.");
  }
  if (new Date(input.endAt) <= new Date(input.startAt)) throw new Error("Event end time must be after its start time.");
  if (new Date(input.registrationCloseAt) <= new Date(input.registrationOpenAt)) throw new Error("Registration close time must be after its open time.");
  if (input.capacityMode === "event" && (!input.capacity || input.capacity < 1)) throw new Error("Set a valid event capacity.");
  if (input.capacityMode === "slot" && input.slots.length === 0) throw new Error("Add at least one time slot for slot capacity.");
  return {
    ...input,
    title,
    slug: slugify(input.slug || title),
    summary: String(input.summary ?? "").trim(),
    description: String(input.description ?? "").trim(),
    location: String(input.location ?? "").trim(),
    accentColor: /^#[0-9a-f]{6}$/i.test(input.accentColor) ? input.accentColor : "#500000",
    capacity: input.capacityMode === "event" ? Number(input.capacity) : null,
    sortOrder: Number(input.sortOrder ?? 0),
    formFields: (input.formFields ?? []).map((field, index) => ({ ...field, id: field.id || `field-${Date.now()}-${index}`, label: field.label.trim() })),
    slots: (input.slots ?? []).map((slot, index) => ({ ...slot, id: slot.id || randomUUID(), label: slot.label.trim() || `Session ${index + 1}`, capacity: input.capacityMode === "slot" ? Number(slot.capacity) || null : null })),
  };
}

export async function saveEvent(rawInput: EventInput, id?: string) {
  const input = cleanInput(rawInput);
  const eventId = id || randomUUID();
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
        registration_open_at, registration_close_at, status, capacity_mode, capacity, sort_order,
        accent_color, form_fields, confirmation_subject, confirmation_body, updated_at)
      values (${eventId}, ${input.slug}, ${input.title}, ${input.summary}, ${input.description}, ${input.location},
        ${input.startAt}, ${input.endAt}, ${input.registrationOpenAt}, ${input.registrationCloseAt}, ${input.status},
        ${input.capacityMode}, ${input.capacity}, ${input.sortOrder}, ${input.accentColor},
        ${tx.json(input.formFields as never)}, ${input.confirmationSubject}, ${input.confirmationBody}, now())
      on conflict (id) do update set slug = excluded.slug, title = excluded.title, summary = excluded.summary,
        description = excluded.description, location = excluded.location, start_at = excluded.start_at,
        end_at = excluded.end_at, registration_open_at = excluded.registration_open_at,
        registration_close_at = excluded.registration_close_at, status = excluded.status,
        capacity_mode = excluded.capacity_mode, capacity = excluded.capacity, sort_order = excluded.sort_order,
        accent_color = excluded.accent_color, form_fields = excluded.form_fields,
        confirmation_subject = excluded.confirmation_subject, confirmation_body = excluded.confirmation_body,
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
  answers: Record<string, string | string[] | boolean>;
};

export async function createRegistration(eventId: string, input: RegistrationInput) {
  const event = await getEvent(eventId);
  if (!event) throw new Error("Event not found.");
  const now = Date.now();
  if (new Date(event.registrationOpenAt).getTime() > now) throw new Error("Registration has not opened yet.");
  if (new Date(event.registrationCloseAt).getTime() < now) throw new Error("Registration is closed.");
  if (!input.firstName?.trim() || !input.lastName?.trim()) throw new Error("First and last name are required.");
  if (!/^\S+@\S+\.\S+$/.test(input.email ?? "")) throw new Error("Enter a valid email address.");
  const slot = input.slotId ? event.slots.find((item) => item.id === input.slotId) : null;
  if (event.slots.length && !slot) throw new Error("Select a time slot.");
  for (const field of event.formFields) {
    const value = input.answers?.[field.id];
    if (field.required && (value === undefined || value === "" || (Array.isArray(value) && !value.length) || value === false)) {
      throw new Error(`${field.label} is required.`);
    }
  }
  const id = randomUUID();
  if (!sql) {
    if (demo.registrations.some((item) => item.eventId === eventId && item.email.toLowerCase() === input.email.toLowerCase() && item.status !== "cancelled")) {
      throw new Error("This email is already registered for the event.");
    }
    if (event.capacityMode === "event" && event.remaining !== null && event.remaining <= 0) throw new Error("This event is full.");
    if (event.capacityMode === "slot" && slot?.remaining !== null && slot?.remaining !== undefined && slot.remaining <= 0) throw new Error("This time slot is full.");
    const registration: Registration = {
      id, eventId, slotId: slot?.id ?? null, firstName: input.firstName.trim(), lastName: input.lastName.trim(),
      email: input.email.trim().toLowerCase(), uin: input.uin?.trim() ?? "", answers: input.answers ?? {},
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
      values (${id}, ${eventId}, ${slot?.id ?? null}, ${input.firstName.trim()}, ${input.lastName.trim()},
        ${input.email.trim().toLowerCase()}, ${input.uin?.trim() ?? ""}, ${tx.json((input.answers ?? {}) as never)})
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
