"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, CalendarCheck, ChevronRight, Mail, Pencil, Plus, Search, Users } from "lucide-react";
import { eventPhase, formatDate } from "@/lib/utils";
import type { RegistrationEvent } from "@/types";

type Tab = "active" | "past" | "drafts";

export function AdminDashboard({ preview }: { preview: boolean }) {
  const [events, setEvents] = useState<RegistrationEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("active");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("custom");

  useEffect(() => {
    fetch("/api/events?scope=all").then((response) => response.json()).then((data) => setEvents(data.events ?? [])).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let list = events.filter((event) => {
      const phase = eventPhase(event);
      if (tab === "drafts") return event.status === "draft" || event.status === "archived";
      if (event.status !== "published") return false;
      return tab === "past" ? phase === "past" : phase !== "past";
    }).filter((event) => event.title.toLowerCase().includes(query.toLowerCase()));
    if (sort === "alphabetical") list = [...list].sort((a, b) => a.title.localeCompare(b.title));
    if (sort === "date") list = [...list].sort((a, b) => a.startAt.localeCompare(b.startAt));
    return list;
  }, [events, tab, query, sort]);

  async function move(id: string, direction: -1 | 1) {
    const ordered = [...events].sort((a, b) => a.sortOrder - b.sortOrder);
    const index = ordered.findIndex((event) => event.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ordered.length) return;
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    setEvents(ordered.map((event, position) => ({ ...event, sortOrder: position + 1 })));
    await fetch("/api/events/reorder", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids: ordered.map((event) => event.id) }) });
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
      <section className="admin-panel">
        <div className="admin-panel__head"><div className="tabs" role="tablist"><button role="tab" aria-selected={tab === "active"} className={tab === "active" ? "active" : ""} onClick={() => setTab("active")}>Active</button><button role="tab" aria-selected={tab === "past"} className={tab === "past" ? "active" : ""} onClick={() => setTab("past")}>Past</button><button role="tab" aria-selected={tab === "drafts"} className={tab === "drafts" ? "active" : ""} onClick={() => setTab("drafts")}>Drafts &amp; archived</button></div><div className="table-tools"><label className="search-box search-box--small"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search events" aria-label="Search events" /></label><select aria-label="Sort events" value={sort} onChange={(event) => setSort(event.target.value)}><option value="custom">Custom order</option><option value="date">Date</option><option value="alphabetical">Alphabetical</option></select></div></div>
        {loading ? <div className="admin-loading">Loading events…</div> : filtered.length ? <div className="event-table"><div className="event-table__header"><span>Event</span><span>Registration</span><span>Capacity</span><span>Actions</span></div>{filtered.map((event) => {
          const phase = eventPhase(event);
          return <div className="event-table__row" key={event.id}><div className="event-name"><span className="event-dot" style={{ background: event.accentColor }} /><div><strong>{event.title}</strong><small>{formatDate(event.startAt, true)} · {event.location}</small></div></div><div><span className={`status-pill status-pill--${phase}`}>{event.status === "draft" ? "Draft" : event.status === "archived" ? "Archived" : phase === "open" ? "Open" : phase === "upcoming" ? "Scheduled" : "Closed"}</span><small>{formatDate(event.registrationCloseAt)}</small></div><div><strong>{event.registeredCount}</strong><small>{event.capacityMode === "event" && event.capacity ? `of ${event.capacity}` : event.capacityMode === "slot" ? "across slots" : "registered"}</small></div><div className="row-actions">{sort === "custom" && <span className="reorder-actions"><button onClick={() => move(event.id, -1)} aria-label={`Move ${event.title} up`} title="Move up"><ArrowUp /></button><button onClick={() => move(event.id, 1)} aria-label={`Move ${event.title} down`} title="Move down"><ArrowDown /></button></span>}<Link href={`/admin/events/${event.id}/registrations`} aria-label={`View registrations for ${event.title}`} title="Registrations and email"><Mail /></Link><Link href={`/admin/events/${event.id}/edit`} aria-label={`Edit ${event.title}`} title="Edit event"><Pencil /></Link><Link href={`/events/${event.slug}`} aria-label={`View ${event.title}`} title="View event"><ChevronRight /></Link></div></div>;
        })}</div> : <div className="empty-state"><CalendarCheck /><h3>No events here yet</h3><p>Create an event or try a different tab.</p></div>}
      </section>
    </div>
  );
}
