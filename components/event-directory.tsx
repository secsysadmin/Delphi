"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, BadgeCheck, CalendarClock, CalendarDays, ChevronLeft, ChevronRight, Clock3, LockKeyhole, MapPin, Search, Users } from "lucide-react";
import { eventPhase, formatRange } from "@/lib/utils";
import type { RegistrationEvent } from "@/types";

const chicagoDateParts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" });
// Calendar dates are calendar values, not instants. Keep their arithmetic and
// formatting in UTC so the server and browser produce identical initial HTML.
const monthLabel = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const dayLabel = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

function dayKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function eventDayKey(date: string) {
  const parts = Object.fromEntries(chicagoDateParts.formatToParts(new Date(date)).filter(({ type }) => type !== "literal").map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function EventStatus({ phase, soldOut }: { phase: ReturnType<typeof eventPhase>; soldOut: boolean }) {
  if (soldOut) return <span className="status-pill status-pill--closed"><LockKeyhole aria-hidden="true" size={14} /><span>Event full</span></span>;
  if (phase === "open") return <span className="status-pill status-pill--open"><BadgeCheck aria-hidden="true" size={14} /><span>Registration open</span></span>;
  if (phase === "upcoming") return <span className="status-pill status-pill--upcoming"><CalendarClock aria-hidden="true" size={14} /><span>Opens soon</span></span>;
  return <span className="status-pill status-pill--closed"><LockKeyhole aria-hidden="true" size={14} /><span>Registration closed</span></span>;
}

export function EventDirectory({ calendarStart }: { calendarStart: { year: number; month: number } }) {
  const [events, setEvents] = useState<RegistrationEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("custom");
  const [loadError, setLoadError] = useState(false);
  const [chosenMonthOffset, setCalendarMonthOffset] = useState<number | null>(null);
  const [revealedEventIds, setRevealedEventIds] = useState<Set<string>>(() => new Set());
  const [revealDurations, setRevealDurations] = useState<Record<string, number>>({});
  const eventCardRefs = useRef(new Map<string, HTMLElement>());
  const revealedEventIdsRef = useRef(new Set<string>());
  const nextRevealAtRef = useRef(0);

  useEffect(() => {
    fetch("/api/events").then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setEvents(data.events ?? []);
    }).catch(() => setLoadError(true)).finally(() => setLoading(false));
  }, []);

  const visible = useMemo(() => {
    const normalized = query.toLowerCase().trim();
    const next = events.filter((event) => eventPhase(event) !== "past" && event.status === "published" && (!normalized || `${event.title} ${event.summary} ${event.location}`.toLowerCase().includes(normalized)));
    if (sort === "alphabetical") next.sort((a, b) => a.title.localeCompare(b.title));
    if (sort === "date") next.sort((a, b) => a.startAt.localeCompare(b.startAt));
    return next;
  }, [events, query, sort]);

  const nextEvent = useMemo(() => events.filter((event) => eventPhase(event) !== "past" && event.status === "published").sort((a, b) => a.startAt.localeCompare(b.startAt))[0], [events]);
  const nextEventMonthOffset = useMemo(() => {
    if (!nextEvent) return 0;
    const [year, month] = eventDayKey(nextEvent.startAt).split("-").map(Number);
    const offset = (year - calendarStart.year) * 12 + (month - calendarStart.month);
    return offset > 0 && offset <= 11 ? offset : 0;
  }, [nextEvent, calendarStart.month, calendarStart.year]);
  const calendarMonthOffset = chosenMonthOffset ?? nextEventMonthOffset;
  const calendarMonth = useMemo(() => new Date(Date.UTC(calendarStart.year, calendarStart.month - 1 + calendarMonthOffset, 1)), [calendarMonthOffset, calendarStart.month, calendarStart.year]);
  const calendarDays = useMemo(() => {
    const year = calendarMonth.getUTCFullYear();
    const month = calendarMonth.getUTCMonth();
    const firstDay = new Date(Date.UTC(year, month, 1));
    const dayCount = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return [...Array<Date | null>(firstDay.getUTCDay()).fill(null), ...Array.from({ length: dayCount }, (_, index) => new Date(Date.UTC(year, month, index + 1)))];
  }, [calendarMonth]);
  const calendarEvents = useMemo(() => events.filter((event) => event.status === "published" && eventPhase(event) !== "past").reduce<Record<string, RegistrationEvent[]>>((byDay, event) => {
    const key = eventDayKey(event.startAt);
    (byDay[key] ??= []).push(event);
    return byDay;
  }, {}), [events]);
  // These are derived directly from serializable client state. Comparing Date
  // instances here made the server and browser disagree in some time zones.
  const isFirstCalendarMonth = calendarMonthOffset === 0;
  const isLastCalendarMonth = calendarMonthOffset === 11;

  function scrollToCalendar(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    const calendar = document.getElementById("event-calendar");
    if (!calendar) return;
    const root = document.documentElement;
    const previousScrollBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto";
    window.scrollTo(0, Math.max(0, calendar.getBoundingClientRect().top + window.scrollY - 32));
    root.style.scrollBehavior = previousScrollBehavior;
    window.history.replaceState(null, "", "#event-calendar");
  }

  useEffect(() => {
    if (!visible.length) return;
    if (typeof IntersectionObserver === "undefined") {
      const ids = visible.map((event) => event.id);
      revealedEventIdsRef.current = new Set([...revealedEventIdsRef.current, ...ids]);
      setRevealedEventIds(new Set(revealedEventIdsRef.current));
      return;
    }
    const queuedIds = new Set<string>();
    const queue: string[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    let startFrame: number | undefined;
    let lastScrollY = window.scrollY;
    let lastScrollTime = performance.now();
    let scrollVelocity = 0;

    const onScroll = () => {
      const now = performance.now();
      const elapsed = Math.max(now - lastScrollTime, 16);
      scrollVelocity = Math.min(Math.abs(window.scrollY - lastScrollY) / elapsed, 3);
      lastScrollY = window.scrollY;
      lastScrollTime = now;
    };
    const revealNext = () => {
      timer = undefined;
      const now = performance.now();
      const wait = nextRevealAtRef.current - now;
      if (wait > 0) {
        timer = setTimeout(revealNext, wait);
        return;
      }
      const id = queue.shift();
      if (!id) return;
      queuedIds.delete(id);
      const duration = Math.max(220, Math.round(480 - scrollVelocity * 90));
      const startStagger = Math.max(18, Math.round(84 - scrollVelocity * 18));
      revealedEventIdsRef.current.add(id);
      setRevealDurations((current) => ({ ...current, [id]: duration }));
      setRevealedEventIds(new Set(revealedEventIdsRef.current));
      nextRevealAtRef.current = now + startStagger;
      timer = setTimeout(revealNext, startStagger);
    };
    const observer = new IntersectionObserver((entries) => {
      const ids = entries.filter((entry) => entry.isIntersecting).map((entry) => entry.target.getAttribute("data-event-id")).filter((id): id is string => id !== null).filter((id) => !revealedEventIdsRef.current.has(id) && !queuedIds.has(id));
      if (!ids.length) return;
      ids.forEach((id) => { queuedIds.add(id); queue.push(id); });
      if (!timer) revealNext();
      entries.filter((entry) => entry.isIntersecting).forEach((entry) => observer.unobserve(entry.target));
    }, { threshold: 0.15, rootMargin: "0px 0px -8% 0px" });

    // Give the hidden state a paint before observing. Without this beat, the
    // first visible row can receive both classes in one render and skip its entrance.
    startFrame = requestAnimationFrame(() => {
      startFrame = requestAnimationFrame(() => {
        eventCardRefs.current.forEach((node, id) => {
          if (!revealedEventIdsRef.current.has(id)) observer.observe(node);
        });
      });
    });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { observer.disconnect(); window.removeEventListener("scroll", onScroll); if (timer) clearTimeout(timer); if (startFrame) cancelAnimationFrame(startFrame); };
  }, [visible]);

  return (
    <>
      <section className="directory-desk" aria-labelledby="events-heading">
        <div className="shell directory-desk__inner">
          <div className="directory-desk__workspace">
            <div className="directory-desk__heading">
              <h1 id="events-heading">SEC Events</h1>
              <p aria-live="polite">{loading ? "Loading events" : query ? `${visible.length} matching event${visible.length === 1 ? "" : "s"}` : `${visible.length} upcoming event${visible.length === 1 ? "" : "s"}`}</p>
            </div>
            <div className="directory-desk__controls">
              <label className="search-box"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search events" aria-label="Search events" /></label>
              <label className="select-label"><span>Sort by</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="custom">Featured</option><option value="date">Soonest</option><option value="alphabetical">A–Z</option></select></label>
              <a className="directory-desk__calendar-link" href="#event-calendar" onClick={scrollToCalendar}>Browse calendar <ArrowRight size={17} /></a>
            </div>
          </div>
          <aside className="directory-desk__next" aria-live="polite">
            {nextEvent ? <Link href={`/events/${nextEvent.slug}`}>
              <span>Next on the calendar</span>
              <strong>{nextEvent.title}</strong>
              <p><CalendarDays size={17} />{formatRange(nextEvent.startAt, nextEvent.endAt)}</p>
              <p><MapPin size={17} />{nextEvent.location}</p>
              <em>View event <ArrowRight size={18} /></em>
            </Link> : <div><span>Next on the calendar</span><strong>{loading ? "Loading upcoming events…" : "New events are being scheduled."}</strong></div>}
          </aside>
        </div>
      </section>
      <section id="event-directory" className="events-section shell">
        {loading ? <div className="loading-grid"><div /><div /><div /></div> : visible.length ? (
          <div className="event-grid">
            {visible.map((event) => {
              const phase = eventPhase(event);
              const openSlots = event.slots.filter((slot) => slot.remaining !== 0).length;
              const soldOut = event.capacityMode === "event" ? event.remaining === 0 : Boolean(event.slots.length && event.slots.every((slot) => slot.remaining === 0));
              return (
                <Link
                  href={`/events/${event.slug}`}
                  className={`event-card event-card--motion-ready ${revealedEventIds.has(event.id) ? "event-card--revealed" : ""}`}
                  data-event-id={event.id}
                  key={event.id}
                  ref={(node) => { if (node) eventCardRefs.current.set(event.id, node); else eventCardRefs.current.delete(event.id); }}
                  style={{ "--event-accent": event.accentColor, "--reveal-duration": `${revealDurations[event.id] ?? 480}ms` } as React.CSSProperties}
                >
                  <div className="event-card__stripe" />
                  <div className="event-card__top"><EventStatus phase={phase} soldOut={soldOut} /><span className="event-card__date"><strong>{new Date(event.startAt).toLocaleString("en-US", { month: "short", timeZone: "America/Chicago" }).toUpperCase()}</strong>{new Date(event.startAt).toLocaleString("en-US", { day: "2-digit", timeZone: "America/Chicago" })}</span></div>
                  <div className="event-card__body"><h3>{event.title}</h3><p>{event.summary}</p></div>
                  <ul><li><CalendarDays size={17} />{formatRange(event.startAt, event.endAt)}</li><li><MapPin size={17} />{event.location}</li>{openSlots > 0 && <li><Clock3 size={17} />{openSlots} time slot{openSlots === 1 ? "" : "s"} available</li>}{event.remaining !== null && <li><Users size={17} />{event.remaining} spot{event.remaining === 1 ? "" : "s"} remaining</li>}</ul>
                  <span className="event-card__link">View event <ArrowRight size={20} /></span>
                </Link>
              );
            })}
          </div>
        ) : loadError ? <div className="empty-state"><CalendarDays size={36} /><h3>Events couldn&apos;t load</h3><p>Refresh the page to try again.</p></div> : <div className="empty-state"><CalendarDays size={36} /><h3>No matching events</h3><p>Try another search, or check back soon for new opportunities.</p></div>}
      </section>
      <section id="event-calendar" className="calendar-section" aria-labelledby="calendar-heading">
        <div className="shell">
          <div className="calendar-section__head">
            <div><h2 id="calendar-heading">Plan ahead</h2><p>Browse SEC events through the next twelve months.</p></div>
            <div className="calendar-controls">
              <button type="button" onClick={() => setCalendarMonthOffset(calendarMonthOffset - 1)} disabled={isFirstCalendarMonth} aria-label="Previous month"><ChevronLeft size={19} /></button>
              <h3 aria-live="polite">{monthLabel.format(calendarMonth)}</h3>
              <button type="button" onClick={() => setCalendarMonthOffset(calendarMonthOffset + 1)} disabled={isLastCalendarMonth} aria-label="Next month"><ChevronRight size={19} /></button>
            </div>
          </div>
          <div className="calendar-grid" role="grid" aria-label={`${monthLabel.format(calendarMonth)} event calendar`}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span className="calendar-grid__day-name" role="columnheader" key={day}>{day}</span>)}
            {calendarDays.map((day, index) => {
              const dayEvents = day ? calendarEvents[dayKey(day)] ?? [] : [];
              return <div className={`calendar-grid__day ${day ? "" : "calendar-grid__day--blank"}`} role="gridcell" key={day ? dayKey(day) : `blank-${index}`} aria-label={day ? `${dayLabel.format(day)}${dayEvents.length ? `, ${dayEvents.length} event${dayEvents.length === 1 ? "" : "s"}` : ""}` : undefined}>
                {day && <span className="calendar-grid__date">{day.getUTCDate()}</span>}
                {dayEvents.length > 0 && <span className="calendar-grid__events">{dayEvents.map((event) => <Link className="calendar-event" href={`/events/${event.slug}`} key={event.id} aria-label={`View ${event.title}, ${formatRange(event.startAt, event.endAt)}, ${event.location}`}>
                  <span aria-hidden="true">{event.title}</span>
                  <span className="calendar-event__tooltip" role="tooltip"><strong>{event.title}</strong><small>{formatRange(event.startAt, event.endAt)} · {event.location}</small></span>
                </Link>)}</span>}
              </div>;
            })}
          </div>
          <p className="calendar-note">Select an event marker to view details and register.</p>
        </div>
      </section>
    </>
  );
}
