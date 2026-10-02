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

export function csvEscape(value: unknown) {
  const text = Array.isArray(value) ? value.join("; ") : String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}
