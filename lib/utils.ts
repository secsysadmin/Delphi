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

export function formatDate(value: string, includeTime = false) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(includeTime ? { hour: "numeric", minute: "2-digit" } : {}),
    timeZone: "America/Chicago",
  }).format(new Date(value));
}

export function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }).format(new Date(value));
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

export function csvEscape(value: unknown) {
  const text = Array.isArray(value) ? value.join("; ") : String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}
