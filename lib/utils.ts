import type { FormField } from "@/types";

export const isQuestion = (field: FormField) => field.type !== "section";

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export function eventPhase(event: { startAt: string; endAt: string; registrationOpenAt: string; registrationCloseAt: string }) {
  const now = Date.now();
  if (new Date(event.endAt).getTime() < now) return "past";
  if (new Date(event.registrationOpenAt).getTime() > now) return "upcoming";
  if (new Date(event.registrationCloseAt).getTime() < now) return "closed";
  return "open";
}

export const EVENT_TIME_ZONE = "America/Chicago";

export function formatDate(value: string, includeTime = false) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(includeTime ? { hour: "numeric", minute: "2-digit" } : {}),
    timeZone: EVENT_TIME_ZONE,
  }).format(new Date(value));
}

export function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: EVENT_TIME_ZONE }).format(new Date(value));
}

export function formatRange(start: string, end: string, includeDate = true) {
  const sameDay = formatDate(start) === formatDate(end);
  const startText = includeDate ? formatDate(start, true) : formatTime(start);
  const endText = sameDay || !includeDate ? formatTime(end) : formatDate(end, true);
  return `${startText} – ${endText}`;
}

const pad = (value: number) => String(value).padStart(2, "0");
const centralParts = new Intl.DateTimeFormat("en-US", { timeZone: EVENT_TIME_ZONE, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

function centralWall(ms: number) {
  const parts = Object.fromEntries(centralParts.formatToParts(new Date(ms)).map(({ type, value }) => [type, value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), hour: Number(parts.hour) % 24, minute: Number(parts.minute) };
}

export function toCentralInput(value: string | Date) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const wall = centralWall(date.getTime());
  return `${wall.year}-${pad(wall.month)}-${pad(wall.day)}T${pad(wall.hour)}:${pad(wall.minute)}`;
}

export function fromCentralInput(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value ?? "");
  if (!match) return "";
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let instant = target;
  for (let attempt = 0; attempt < 3; attempt++) {
    const wall = centralWall(instant);
    const drift = target - Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
    if (!drift) break;
    instant += drift;
  }
  return new Date(instant).toISOString();
}

export function centralInputFromToday(days: number, hour: number) {
  const today = centralWall(Date.now());
  const date = new Date(Date.UTC(today.year, today.month - 1, today.day + days));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(hour)}:00`;
}

export const TEMPLATE_VARIABLES = ["firstName", "name", "event", "slot", "date", "time", "room"] as const;

type TemplatePerson = { firstName: string; lastName: string };
type TemplateEvent = { title: string; startAt: string; location: string; confirmationSubject: string; confirmationBody: string };
type TemplateSlot = { label: string; startAt: string; location: string; confirmationSubject?: string; confirmationBody?: string };

export function templateValues(person: TemplatePerson, event: TemplateEvent, slot?: TemplateSlot | null): Record<(typeof TEMPLATE_VARIABLES)[number], string> {
  const start = slot?.startAt || event.startAt;
  return {
    firstName: person.firstName,
    name: `${person.firstName} ${person.lastName}`.trim(),
    event: event.title,
    slot: slot?.label ?? "",
    date: formatDate(start),
    time: formatTime(start),
    room: slot?.location || event.location,
  };
}

export function fillTemplate(template: string, values: Record<string, string>) {
  return template.replace(/\{\{(\w+)\}\}/g, (token, key: string) => (Object.hasOwn(values, key) ? values[key] : token));
}

export function confirmationTemplate(event: TemplateEvent, slot?: TemplateSlot | null) {
  return { subject: slot?.confirmationSubject || event.confirmationSubject, body: slot?.confirmationBody || event.confirmationBody };
}

// Event card colors in confirmation emails. Maroon (#500000), the default, keeps the card cream because the
// email header is already maroon. A slot still carrying the default inherits the event's color.
export function confirmationColors(eventColor?: string | null, slotColor?: string | null) {
  const usable = (color?: string | null) => (color && /^#[0-9a-f]{6}$/i.test(color) && color.toLowerCase() !== "#500000" ? color : "");
  const background = usable(slotColor) || usable(eventColor) || "#f7f4f1";
  const [red, green, blue] = (background.slice(1).match(/.{2}/g) ?? []).map((value) => Number.parseInt(value, 16));
  const foreground = (red * 299 + green * 587 + blue * 114) / 1000 < 150 ? "#fff8ef" : "#242321";
  return { background, foreground };
}

export function formatAnswer(value: unknown) {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return value === undefined || value === null ? "" : String(value);
}

export function csvEscape(value: unknown) {
  const text = Array.isArray(value) ? value.join("; ") : typeof value === "boolean" ? formatAnswer(value) : String(value ?? "");
  // A leading = + - @ makes spreadsheets run the cell as a formula; registrants control these values.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

// Why a registration window can't be published: closing in the past would shut registration the moment
// the event goes live, and closing after the event ends makes no sense. Returns null when it's fine.
export function registrationWindowProblem(event: { registrationCloseAt: string; endAt: string }, now = Date.now()) {
  const close = new Date(event.registrationCloseAt).getTime();
  if (close <= now) return "Registration closes in the past, so it would close as soon as you publish. Pick a future close time.";
  if (close > new Date(event.endAt).getTime()) return "Registration has to close before the event ends.";
  return null;
}
