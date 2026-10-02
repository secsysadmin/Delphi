import fs from "node:fs/promises";
import postgres from "postgres";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required. Copy .env.example to .env.local or run with DATABASE_URL set.");
  process.exit(1);
}

const year = new Date().getFullYear();
const at = (value) => new Date(value).toISOString();
const events = [
  {
    id: "7f317a6a-b7de-4b56-9fb7-00f41e1cb001",
    slug: "engineering-career-discovery-day",
    title: "Engineering Career Discovery Day",
    summary: "Meet practicing engineers and explore the disciplines shaping tomorrow.",
    description: "Spend an afternoon with Texas A&M engineering organizations and industry guests. Choose the session that works best for you, then complete the short registration form.",
    location: "Zachry Engineering Education Complex",
    startAt: at(`${year + 1}-03-04T11:30:00-06:00`), endAt: at(`${year + 1}-03-04T15:50:00-06:00`),
    registrationOpenAt: at(`${year}-10-01T08:00:00-05:00`), registrationCloseAt: at(`${year + 1}-03-02T23:59:00-06:00`),
    status: "published", capacityMode: "slot", capacity: null, sortOrder: 1, accentColor: "#7d1735",
    formFields: [{ id: "classification", label: "Classification", type: "select", required: true, options: ["Freshman", "Sophomore", "Junior", "Senior", "Graduate"] }, { id: "major", label: "Major", type: "short_text", required: true, placeholder: "e.g. Mechanical Engineering" }],
    confirmationSubject: "You're registered for {{event}}", confirmationBody: "Howdy {{firstName}}! Your registration is confirmed. Please show this email to the SEC volunteer at the room entrance.",
    slots: [
      { id: "slot-discovery-1130", label: "Morning session", startAt: at(`${year + 1}-03-04T11:30:00-06:00`), endAt: at(`${year + 1}-03-04T12:20:00-06:00`), location: "ZACH 340", capacity: 40, accentColor: "#7d1735", confirmationSubject: "Your 11:30 session is confirmed", confirmationBody: "Howdy {{firstName}}! Please show this confirmation at the entrance. Your {{event}} session begins at {{time}} in {{room}}." },
      { id: "slot-discovery-1350", label: "Early afternoon session", startAt: at(`${year + 1}-03-04T13:50:00-06:00`), endAt: at(`${year + 1}-03-04T14:40:00-06:00`), location: "ZACH 420", capacity: 40, accentColor: "#d6a84b" },
      { id: "slot-discovery-1500", label: "Late afternoon session", startAt: at(`${year + 1}-03-04T15:00:00-06:00`), endAt: at(`${year + 1}-03-04T15:50:00-06:00`), location: "ZACH 420", capacity: 40, accentColor: "#49796b" },
    ],
  },
  {
    id: "7f317a6a-b7de-4b56-9fb7-00f41e1cb002",
    slug: "industry-night-aerospace", title: "Industry Night: Aerospace", summary: "An evening of conversation with leaders across the aerospace industry.",
    description: "Connect with recruiters and engineers, ask questions, and learn where an engineering degree can take you.", location: "Memorial Student Center, Bethancourt Ballroom",
    startAt: at(`${year + 1}-01-22T18:00:00-06:00`), endAt: at(`${year + 1}-01-22T20:00:00-06:00`), registrationOpenAt: at(`${year}-10-01T08:00:00-05:00`), registrationCloseAt: at(`${year + 1}-01-20T17:00:00-06:00`),
    status: "published", capacityMode: "event", capacity: 180, sortOrder: 2, accentColor: "#500000",
    formFields: [{ id: "major", label: "Major", type: "short_text", required: true }, { id: "resume", label: "Would you like a resume review?", type: "radio", required: true, options: ["Yes", "No"] }],
    confirmationSubject: "Registration confirmed: {{event}}", confirmationBody: "Howdy {{firstName}}! We look forward to seeing you at {{event}} on {{date}}. Doors open 15 minutes early.", slots: [],
  },
  {
    id: "7f317a6a-b7de-4b56-9fb7-00f41e1cb003",
    slug: "spark-stem-day", title: "SPARK STEM Day", summary: "Hands-on engineering activities for visiting middle school students.",
    description: "A full day of guided challenges led by SEC volunteers.", location: "Zachry Engineering Education Complex",
    startAt: at(`${year - 1}-04-12T09:00:00-05:00`), endAt: at(`${year - 1}-04-12T15:00:00-05:00`), registrationOpenAt: at(`${year - 1}-01-15T08:00:00-06:00`), registrationCloseAt: at(`${year - 1}-04-05T23:59:00-05:00`),
    status: "published", capacityMode: "event", capacity: 120, sortOrder: 3, accentColor: "#9f6b30", formFields: [{ id: "school", label: "School", type: "short_text", required: true }],
    confirmationSubject: "SPARK STEM Day registration", confirmationBody: "Howdy {{firstName}}! Your place at {{event}} is confirmed.", slots: [],
  },
];

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
try {
  const schema = await fs.readFile(new URL("../db/schema.sql", import.meta.url), "utf8");
  await sql.unsafe(schema);
  let inserted = 0;
  await sql.begin(async (tx) => {
    for (const event of events) {
      const rows = await tx`
        insert into sec_registration.events (id, slug, title, summary, description, location, start_at, end_at,
          registration_open_at, registration_close_at, status, capacity_mode, capacity, sort_order, accent_color,
          form_fields, confirmation_subject, confirmation_body)
        values (${event.id}, ${event.slug}, ${event.title}, ${event.summary}, ${event.description}, ${event.location},
          ${event.startAt}, ${event.endAt}, ${event.registrationOpenAt}, ${event.registrationCloseAt}, ${event.status},
          ${event.capacityMode}, ${event.capacity}, ${event.sortOrder}, ${event.accentColor}, ${tx.json(event.formFields)},
          ${event.confirmationSubject}, ${event.confirmationBody})
        on conflict (id) do nothing
        returning id
      `;
      inserted += rows.length;
      for (const slot of event.slots) {
        await tx`
          insert into sec_registration.event_slots (id, event_id, label, start_at, end_at, location, capacity,
            confirmation_subject, confirmation_body, accent_color)
          values (${slot.id}, ${event.id}, ${slot.label}, ${slot.startAt}, ${slot.endAt}, ${slot.location}, ${slot.capacity},
            ${slot.confirmationSubject ?? null}, ${slot.confirmationBody ?? null}, ${slot.accentColor ?? null})
          on conflict (id) do nothing
        `;
      }
    }
  });
  console.log(`SEC demo seed complete: ${inserted} event${inserted === 1 ? "" : "s"} added; existing records were left unchanged.`);
} finally {
  await sql.end();
}
