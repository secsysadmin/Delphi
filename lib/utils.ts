import type { FormField } from "@/types";

export const EVENT_TIME_ZONE = "America/Chicago";
export const DEFAULT_ACCENT_COLOR = "#500000";
export const DEFAULT_CONFIRMATION_SUBJECT = "Registration confirmed: {{event}}";
export const DEFAULT_CONFIRMATION_BODY = "Howdy {{firstName}}! Your registration for {{event}} is confirmed.";
export const SUMMARY_MAX_LENGTH = 180;
export const PREVIEW_PERSON = { firstName: "Reveille", lastName: "Aggie" };
export const TEMPLATE_VARIABLES = ["firstName", "name", "event", "slot", "date", "time", "room"] as const;

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const SLUG_MAX_LENGTH = 80;
const CARD_FALLBACK_BACKGROUND = "#f7f4f1";
const CARD_LIGHT_TEXT = "#fff8ef";
const CARD_DARK_TEXT = "#242321";
const DARK_BACKGROUND_BRIGHTNESS = 150;
const SPREADSHEET_FORMULA_PREFIX = /^[=+\-@\t\r]/;
const TIME_ZONE_DRIFT_PASSES = 3;

const centralParts = new Intl.DateTimeFormat("en-US", { timeZone: EVENT_TIME_ZONE, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

type EventTimes = { startAt: string; endAt: string; registrationOpenAt: string; registrationCloseAt: string };
export type RegistrationWindow = { status: string; registrationCloseAt: string; endAt: string };
type CapacityShape = { capacityMode: string; remaining: number | null; slots: Array<{ remaining: number | null }> };
type TemplatePerson = { firstName: string; lastName: string };
type TemplateEvent = { title: string; startAt: string; location: string; confirmationSubject: string; confirmationBody: string };
type TemplateSlot = { label: string; startAt: string; location: string; confirmationSubject?: string; confirmationBody?: string };

export const isQuestion = (field: FormField) => field.type !== "section";

export const isHexColor = (value: string | null | undefined): value is string => Boolean(value && HEX_COLOR.test(value));

export function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export function remainingSpots(capacity: number | null, registered: number) {
  return capacity === null ? null : Math.max(0, capacity - registered);
}

export function isSoldOut(event: CapacityShape) {
  if (event.capacityMode === "event") return event.remaining === 0;
  return event.capacityMode === "slot" && event.slots.length > 0 && event.slots.every((slot) => slot.remaining === 0);
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, SLUG_MAX_LENGTH);
}

export function eventPhase(event: EventTimes) {
  const now = Date.now();
  if (new Date(event.endAt).getTime() < now) return "past";
  if (new Date(event.registrationOpenAt).getTime() > now) return "upcoming";
  if (new Date(event.registrationCloseAt).getTime() < now) return "closed";
  return "open";
}

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

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function dateKey(year: number, month: number, day: number) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function centralWall(instant: Date | number) {
  const parts = Object.fromEntries(centralParts.formatToParts(instant).map(({ type, value }) => [type, value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), hour: Number(parts.hour) % 24, minute: Number(parts.minute) };
}

export function toCentralInput(value: string | Date) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const wall = centralWall(date);
  return `${dateKey(wall.year, wall.month, wall.day)}T${pad(wall.hour)}:${pad(wall.minute)}`;
}

export function fromCentralInput(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value ?? "");
  if (!match) return "";
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let instant = target;
  for (let attempt = 0; attempt < TIME_ZONE_DRIFT_PASSES; attempt++) {
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
  return `${dateKey(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())}T${pad(hour)}:00`;
}

export function convertEventTimes<T extends EventTimes & { slots: Array<{ startAt: string; endAt: string }> }>(event: T, convert: (value: string) => string): T {
  return {
    ...event,
    startAt: convert(event.startAt),
    endAt: convert(event.endAt),
    registrationOpenAt: convert(event.registrationOpenAt),
    registrationCloseAt: convert(event.registrationCloseAt),
    slots: event.slots.map((slot) => ({ ...slot, startAt: convert(slot.startAt), endAt: convert(slot.endAt) })),
  };
}

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

function cardColor(color?: string | null) {
  return isHexColor(color) && color.toLowerCase() !== DEFAULT_ACCENT_COLOR ? color : "";
}

export function confirmationColors(eventColor?: string | null, slotColor?: string | null) {
  const background = cardColor(slotColor) || cardColor(eventColor) || CARD_FALLBACK_BACKGROUND;
  const [red, green, blue] = (background.slice(1).match(/.{2}/g) ?? []).map((value) => Number.parseInt(value, 16));
  const brightness = (red * 299 + green * 587 + blue * 114) / 1000;
  return { background, foreground: brightness < DARK_BACKGROUND_BRIGHTNESS ? CARD_LIGHT_TEXT : CARD_DARK_TEXT };
}

export function formatAnswer(value: unknown) {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return value === undefined || value === null ? "" : String(value);
}

export function csvEscape(value: unknown) {
  const text = Array.isArray(value) ? value.join("; ") : typeof value === "boolean" ? formatAnswer(value) : String(value ?? "");
  // Spreadsheets run a cell starting with = + - @ as a formula, and registrants control these values.
  const safe = SPREADSHEET_FORMULA_PREFIX.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function registrationWindowChanged(previous: RegistrationWindow | null, next: RegistrationWindow) {
  return !previous || previous.status !== "published" || previous.registrationCloseAt !== next.registrationCloseAt || previous.endAt !== next.endAt;
}

export function registrationWindowProblem(event: { registrationCloseAt: string; endAt: string }, now = Date.now()) {
  const close = new Date(event.registrationCloseAt).getTime();
  if (close <= now) return "Registration closes in the past, so it would close as soon as you publish. Pick a future close time.";
  if (close > new Date(event.endAt).getTime()) return "Registration has to close before the event ends.";
  return null;
}
