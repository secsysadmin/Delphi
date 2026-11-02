"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, CalendarCheck, ChevronRight, Pencil, Plus, Search, Users } from "lucide-react";
import { getJson, jsonRequest, sendJson } from "@/lib/api-client";
import { eventPhase, formatDate } from "@/lib/utils";
import type { RegistrationEvent } from "@/types";

type Tab = "active" | "past" | "drafts";
type Sort = "custom" | "date" | "alphabetical";
type Phase = ReturnType<typeof eventPhase>;
type AdminDashboardProps = { preview: boolean };
type EventRowProps = {
  event: RegistrationEvent;
  reorderable: boolean;
  isFirst: boolean;
  isLast: boolean;
  onMove: (id: string, direction: -1 | 1) => void;
};

const TABS: Array<{ value: Tab; label: string }> = [
  { value: "active", label: "Active" },
  { value: "past", label: "Past" },
  { value: "drafts", label: "Drafts & archived" },
];
const SORTS: Array<{ value: Sort; label: string }> = [
  { value: "custom", label: "Custom order" },
  { value: "date", label: "Date" },
  { value: "alphabetical", label: "Alphabetical" },
];
const PHASE_LABELS: Record<Phase, string> = { open: "Open", upcoming: "Opens soon", past: "Ended", closed: "Closed" };
const STATUS_LABELS: Partial<Record<RegistrationEvent["status"], string>> = { draft: "Draft", archived: "Archived" };

function registrationStatus(event: RegistrationEvent) {
  const phase = eventPhase(event);
  const label = STATUS_LABELS[event.status] ?? PHASE_LABELS[phase];
  const detail = phase === "upcoming" ? `Opens ${formatDate(event.registrationOpenAt)}` : phase === "open" ? `Closes ${formatDate(event.registrationCloseAt)}` : phase === "past" ? `Ended ${formatDate(event.endAt)}` : `Closed ${formatDate(event.registrationCloseAt)}`;
  return { phase, label, detail };
}

function inTab(event: RegistrationEvent, tab: Tab) {
  if (tab === "drafts") return event.status === "draft" || event.status === "archived";
  if (event.status !== "published") return false;
  const past = eventPhase(event) === "past";
  return tab === "past" ? past : !past;
}

function capacityDetail(event: RegistrationEvent) {
  if (event.capacityMode === "event" && event.capacity) return `of ${event.capacity}`;
  return event.capacityMode === "slot" ? "across slots" : "registered";
}

function EventRow({ event, reorderable, isFirst, isLast, onMove }: EventRowProps) {
  const { phase, label, detail } = registrationStatus(event);
  return <div className="event-table__row"><div className="event-name"><span className="event-dot" style={{ "--event-accent": event.accentColor } as React.CSSProperties} /><div><strong>{event.title}</strong><small>{formatDate(event.startAt, true)} · {event.location}</small></div></div><div><span className={`status-pill status-pill--${event.status === "published" ? phase : "closed"}`}>{label}</span><small>{detail}</small></div><div><strong>{event.registeredCount}</strong><small>{capacityDetail(event)}</small></div><div className="row-actions">{reorderable && <span className="reorder-actions"><button onClick={() => onMove(event.id, -1)} disabled={isFirst} aria-label={`Move ${event.title} up`} title="Move up"><ArrowUp /></button><button onClick={() => onMove(event.id, 1)} disabled={isLast} aria-label={`Move ${event.title} down`} title="Move down"><ArrowDown /></button></span>}<Link className="row-actions__text" href={`/admin/events/${event.id}/registrations`} aria-label={`Registrations for ${event.title}`} title="Participants, export, and email"><Users /> Registrations</Link><Link href={`/admin/events/${event.id}/edit`} aria-label={`Edit ${event.title}`} title="Edit event"><Pencil /></Link><Link href={`/events/${event.slug}`} aria-label={`View ${event.title}`} title="View event"><ChevronRight /></Link></div></div>;
}

export function AdminDashboard({ preview }: AdminDashboardProps) {
  const [events, setEvents] = useState<RegistrationEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("active");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("custom");
  const [loadError, setLoadError] = useState(false);
  const [reorderError, setReorderError] = useState("");

  useEffect(() => {
    getJson<{ events?: RegistrationEvent[] }>("/api/events?scope=all")
      .then((data) => setEvents(data.events ?? []))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const list = events.filter((event) => inTab(event, tab) && event.title.toLowerCase().includes(query.toLowerCase()));
    if (sort === "alphabetical") return list.sort((a, b) => a.title.localeCompare(b.title));
    if (sort === "date") return list.sort((a, b) => a.startAt.localeCompare(b.startAt));
    return list;
  }, [events, tab, query, sort]);

  async function swapWithVisibleNeighbor(id: string, direction: -1 | 1) {
    const neighbor = filtered[filtered.findIndex((event) => event.id === id) + direction];
    if (!neighbor) return;
    const previous = events;
    const ordered = [...events].sort((a, b) => a.sortOrder - b.sortOrder);
    const from = ordered.findIndex((event) => event.id === id);
    const to = ordered.findIndex((event) => event.id === neighbor.id);
    [ordered[from], ordered[to]] = [ordered[to], ordered[from]];
    setEvents(ordered.map((event, position) => ({ ...event, sortOrder: position + 1 })));
    setReorderError("");
    const { ok, error } = await sendJson<{ ok: boolean }>("/api/events/reorder", jsonRequest("POST", { ids: ordered.map((event) => event.id) }));
    if (ok) return;
    setEvents(previous);
    setReorderError(error || "Could not save the new order.");
  }

  const active = events.filter((event) => event.status === "published" && eventPhase(event) !== "past");
  const registrations = active.reduce((sum, event) => sum + event.registeredCount, 0);
  return (
    <div className="admin-shell shell">
      <div className="admin-title-row"><div><h1>Event dashboard</h1><p>Published events, registration activity, and outreach in one place.</p></div><div className="admin-actions">{!preview && <Link className="button button--secondary" href="/admin/users"><Users size={17} /> Manage admins</Link>}<Link className="button button--primary" href="/admin/events/new"><Plus size={18} /> New event</Link></div></div>
      <div className="admin-overview" aria-label="Dashboard summary">
        <p><strong>{active.length}</strong> active events <span aria-hidden="true">·</span> <strong>{registrations}</strong> registrations</p>
        {preview && <p className="admin-overview__preview"><strong>Preview mode.</strong> Local changes reset when the server restarts.</p>}
      </div>
      {reorderError && <p className="form-error" role="alert">{reorderError}</p>}
      <section className="admin-panel">
        <div className="admin-panel__head"><div className="tabs" role="tablist">{TABS.map((item) => <button key={item.value} role="tab" aria-selected={tab === item.value} className={tab === item.value ? "active" : ""} onClick={() => setTab(item.value)}>{item.label}</button>)}</div><div className="table-tools"><label className="search-box search-box--small"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search events" aria-label="Search events" /></label><select aria-label="Sort events" value={sort} onChange={(event) => setSort(event.target.value as Sort)}>{SORTS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div></div>
        {loading ? <div className="admin-loading">Loading events…</div> : loadError ? <div className="empty-state"><CalendarCheck /><h3>Events couldn&apos;t load</h3><p>Refresh the page to try again.</p></div> : filtered.length ? <div className="event-table"><div className="event-table__header"><span>Event</span><span>Registration</span><span>Capacity</span><span>Actions</span></div>{filtered.map((event, position) => <EventRow key={event.id} event={event} reorderable={sort === "custom"} isFirst={position === 0} isLast={position === filtered.length - 1} onMove={swapWithVisibleNeighbor} />)}</div> : <div className="empty-state"><CalendarCheck /><h3>No events here yet</h3><p>Create an event or try a different tab.</p></div>}
      </section>
    </div>
  );
}
