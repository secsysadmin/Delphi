"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, BadgeCheck, CalendarClock, CalendarDays, ChevronLeft, ChevronRight, Clock3, LockKeyhole, MapPin, Search, Users } from "lucide-react";
import { getJson } from "@/lib/api-client";
import { EVENT_TIME_ZONE, centralWall, dateKey, eventPhase, formatRange, isSoldOut, plural } from "@/lib/utils";
import type { RegistrationEvent } from "@/types";

type Sort = "custom" | "date" | "alphabetical";
type Phase = ReturnType<typeof eventPhase>;
type CalendarStart = { year: number; month: number };
type EventDirectoryProps = { calendarStart: CalendarStart };
type EventStatusProps = { phase: Phase; soldOut: boolean };
type EventCardProps = { event: RegistrationEvent; revealed: boolean; revealDuration: number; cardRef: (node: HTMLElement | null) => void };
type CalendarDayProps = { day: Date | null; events: RegistrationEvent[] };
type MonthAgendaProps = { events: RegistrationEvent[]; monthName: string };

const CALENDAR_ID = "event-calendar";
const CALENDAR_MONTHS = 12;
const MONTHS_PER_YEAR = 12;
const CALENDAR_SCROLL_OFFSET_PX = 32;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SORTS: Array<{ value: Sort; label: string }> = [
  { value: "custom", label: "Featured" },
  { value: "date", label: "Soonest" },
  { value: "alphabetical", label: "A–Z" },
];
const REVEAL_DURATION_MS = 480;
const MIN_REVEAL_DURATION_MS = 220;
const REVEAL_SPEEDUP_PER_VELOCITY_MS = 90;
const REVEAL_STAGGER_MS = 84;
const MIN_REVEAL_STAGGER_MS = 18;
const STAGGER_SPEEDUP_PER_VELOCITY_MS = 18;
const MAX_SCROLL_VELOCITY = 3;
const MIN_FRAME_MS = 16;
const REVEAL_OBSERVER_OPTIONS: IntersectionObserverInit = { threshold: 0.15, rootMargin: "0px 0px -8% 0px" };

const monthLabel = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const dayLabel = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
const cardMonth = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: EVENT_TIME_ZONE });
const cardDay = new Intl.DateTimeFormat("en-US", { day: "2-digit", timeZone: EVENT_TIME_ZONE });

function dayKey(date: Date) {
  return dateKey(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function eventDayKey(date: string) {
  const { year, month, day } = centralWall(new Date(date));
  return dateKey(year, month, day);
}

function isUpcoming(event: RegistrationEvent) {
  return event.status === "published" && eventPhase(event) !== "past";
}

function monthDays(month: Date) {
  const year = month.getUTCFullYear();
  const index = month.getUTCMonth();
  const leadingBlanks = new Date(Date.UTC(year, index, 1)).getUTCDay();
  const dayCount = new Date(Date.UTC(year, index + 1, 0)).getUTCDate();
  return [...Array<Date | null>(leadingBlanks).fill(null), ...Array.from({ length: dayCount }, (_, day) => new Date(Date.UTC(year, index, day + 1)))];
}

function afterNextPaint(callback: () => void) {
  let frame = requestAnimationFrame(() => {
    frame = requestAnimationFrame(callback);
  });
  return () => cancelAnimationFrame(frame);
}

function useStaggeredReveal(visible: RegistrationEvent[]) {
  const [revealedIds, setRevealedIds] = useState<Set<string>>(() => new Set());
  const [durations, setDurations] = useState<Record<string, number>>({});
  const nodes = useRef(new Map<string, HTMLElement>());
  const revealedRef = useRef(new Set<string>());
  const nextRevealAt = useRef(0);

  useEffect(() => {
    if (!visible.length) return;
    if (typeof IntersectionObserver === "undefined") {
      revealedRef.current = new Set([...revealedRef.current, ...visible.map((event) => event.id)]);
      setRevealedIds(new Set(revealedRef.current));
      return;
    }
    const queuedIds = new Set<string>();
    const queue: string[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastScrollY = window.scrollY;
    let lastScrollTime = performance.now();
    let scrollVelocity = 0;

    const onScroll = () => {
      const now = performance.now();
      const elapsed = Math.max(now - lastScrollTime, MIN_FRAME_MS);
      scrollVelocity = Math.min(Math.abs(window.scrollY - lastScrollY) / elapsed, MAX_SCROLL_VELOCITY);
      lastScrollY = window.scrollY;
      lastScrollTime = now;
    };
    const revealNext = () => {
      timer = undefined;
      const now = performance.now();
      const wait = nextRevealAt.current - now;
      if (wait > 0) {
        timer = setTimeout(revealNext, wait);
        return;
      }
      const id = queue.shift();
      if (!id) return;
      queuedIds.delete(id);
      const duration = Math.max(MIN_REVEAL_DURATION_MS, Math.round(REVEAL_DURATION_MS - scrollVelocity * REVEAL_SPEEDUP_PER_VELOCITY_MS));
      const stagger = Math.max(MIN_REVEAL_STAGGER_MS, Math.round(REVEAL_STAGGER_MS - scrollVelocity * STAGGER_SPEEDUP_PER_VELOCITY_MS));
      revealedRef.current.add(id);
      setDurations((current) => ({ ...current, [id]: duration }));
      setRevealedIds(new Set(revealedRef.current));
      nextRevealAt.current = now + stagger;
      timer = setTimeout(revealNext, stagger);
    };
    const observer = new IntersectionObserver((entries) => {
      const intersecting = entries.filter((entry) => entry.isIntersecting);
      const ids = intersecting
        .map((entry) => entry.target.getAttribute("data-event-id"))
        .filter((id): id is string => id !== null && !revealedRef.current.has(id) && !queuedIds.has(id));
      if (!ids.length) return;
      ids.forEach((id) => { queuedIds.add(id); queue.push(id); });
      if (!timer) revealNext();
      intersecting.forEach((entry) => observer.unobserve(entry.target));
    }, REVEAL_OBSERVER_OPTIONS);

    const cancelObserve = afterNextPaint(() => {
      nodes.current.forEach((node, id) => {
        if (!revealedRef.current.has(id)) observer.observe(node);
      });
    });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      if (timer) clearTimeout(timer);
      cancelObserve();
    };
  }, [visible]);

  const refFor = (id: string) => (node: HTMLElement | null) => {
    if (node) nodes.current.set(id, node);
    else nodes.current.delete(id);
  };
  return { revealedIds, durationFor: (id: string) => durations[id] ?? REVEAL_DURATION_MS, refFor };
}

function EventStatus({ phase, soldOut }: EventStatusProps) {
  if (soldOut) return <span className="status-pill status-pill--closed"><LockKeyhole aria-hidden="true" size={14} /><span>Event full</span></span>;
  if (phase === "open") return <span className="status-pill status-pill--open"><BadgeCheck aria-hidden="true" size={14} /><span>Registration open</span></span>;
  if (phase === "upcoming") return <span className="status-pill status-pill--upcoming"><CalendarClock aria-hidden="true" size={14} /><span>Opens soon</span></span>;
  return <span className="status-pill status-pill--closed"><LockKeyhole aria-hidden="true" size={14} /><span>Registration closed</span></span>;
}

function EventCard({ event, revealed, revealDuration, cardRef }: EventCardProps) {
  const openSlots = event.slots.filter((slot) => slot.remaining !== 0).length;
  const start = new Date(event.startAt);
  return (
    <Link
      href={`/events/${event.slug}`}
      className={`event-card event-card--motion-ready ${revealed ? "event-card--revealed" : ""}`}
      data-event-id={event.id}
      ref={cardRef}
      style={{ "--event-accent": event.accentColor, "--reveal-duration": `${revealDuration}ms` } as React.CSSProperties}
    >
      <div className="event-card__stripe" />
      <div className="event-card__top"><EventStatus phase={eventPhase(event)} soldOut={isSoldOut(event)} /><span className="event-card__date"><strong>{cardMonth.format(start).toUpperCase()}</strong>{cardDay.format(start)}</span></div>
      <div className="event-card__body"><h3>{event.title}</h3><p>{event.summary}</p></div>
      <ul><li><CalendarDays size={17} />{formatRange(event.startAt, event.endAt)}</li><li><MapPin size={17} />{event.location}</li>{openSlots > 0 && <li><Clock3 size={17} />{plural(openSlots, "time slot")} available</li>}{event.remaining !== null && <li><Users size={17} />{plural(event.remaining, "spot")} remaining</li>}</ul>
      <span className="event-card__link">View event <ArrowRight size={20} /></span>
    </Link>
  );
}

function CalendarDay({ day, events }: CalendarDayProps) {
  if (!day) return <div className="calendar-grid__day calendar-grid__day--blank" role="gridcell" />;
  return <div className="calendar-grid__day" role="gridcell" aria-label={`${dayLabel.format(day)}${events.length ? `, ${plural(events.length, "event")}` : ""}`}>
    <span className="calendar-grid__date">{day.getUTCDate()}</span>
    {events.length > 0 && <span className="calendar-grid__events">{events.map((event) => <Link className="calendar-event" href={`/events/${event.slug}`} key={event.id} aria-label={`View ${event.title}, ${formatRange(event.startAt, event.endAt)}, ${event.location}`}>
      <span aria-hidden="true">{event.title}</span>
      <span className="calendar-event__tooltip" role="tooltip"><strong>{event.title}</strong><small>{formatRange(event.startAt, event.endAt)} · {event.location}</small></span>
    </Link>)}</span>}
  </div>;
}

function MonthAgenda({ events, monthName }: MonthAgendaProps) {
  if (!events.length) return <p className="calendar-agenda calendar-agenda--empty">No events in {monthName}.</p>;
  return <ul className="calendar-agenda" aria-label={`Events in ${monthName}`}>
    {events.map((event) => <li key={event.id}><Link href={`/events/${event.slug}`}><strong>{event.title}</strong><span>{formatRange(event.startAt, event.endAt)}</span><span>{event.location}</span></Link></li>)}
  </ul>;
}

function scrollToCalendar(clickEvent: React.MouseEvent<HTMLAnchorElement>) {
  clickEvent.preventDefault();
  const calendar = document.getElementById(CALENDAR_ID);
  if (!calendar) return;
  const root = document.documentElement;
  const previousScrollBehavior = root.style.scrollBehavior;
  root.style.scrollBehavior = "auto";
  window.scrollTo(0, Math.max(0, calendar.getBoundingClientRect().top + window.scrollY - CALENDAR_SCROLL_OFFSET_PX));
  root.style.scrollBehavior = previousScrollBehavior;
  window.history.replaceState(null, "", `#${CALENDAR_ID}`);
}

export function EventDirectory({ calendarStart }: EventDirectoryProps) {
  const [events, setEvents] = useState<RegistrationEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("custom");
  const [loadError, setLoadError] = useState(false);
  const [chosenMonthOffset, setCalendarMonthOffset] = useState<number | null>(null);

  useEffect(() => {
    getJson<{ events?: RegistrationEvent[] }>("/api/events")
      .then((data) => setEvents(data.events ?? []))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, []);

  const upcoming = useMemo(() => events.filter(isUpcoming), [events]);
  const visible = useMemo(() => {
    const normalized = query.toLowerCase().trim();
    const next = upcoming.filter((event) => !normalized || `${event.title} ${event.summary} ${event.location}`.toLowerCase().includes(normalized));
    if (sort === "alphabetical") next.sort((a, b) => a.title.localeCompare(b.title));
    if (sort === "date") next.sort((a, b) => a.startAt.localeCompare(b.startAt));
    return next;
  }, [upcoming, query, sort]);
  const { revealedIds, durationFor, refFor } = useStaggeredReveal(visible);

  const nextEvent = useMemo(() => [...upcoming].sort((a, b) => a.startAt.localeCompare(b.startAt))[0], [upcoming]);
  const nextEventMonthOffset = useMemo(() => {
    if (!nextEvent) return 0;
    const { year, month } = centralWall(new Date(nextEvent.startAt));
    const offset = (year - calendarStart.year) * MONTHS_PER_YEAR + (month - calendarStart.month);
    return offset > 0 && offset < CALENDAR_MONTHS ? offset : 0;
  }, [nextEvent, calendarStart.month, calendarStart.year]);
  const calendarMonthOffset = chosenMonthOffset ?? nextEventMonthOffset;
  const calendarMonth = useMemo(() => new Date(Date.UTC(calendarStart.year, calendarStart.month - 1 + calendarMonthOffset, 1)), [calendarMonthOffset, calendarStart.month, calendarStart.year]);
  const calendarDays = useMemo(() => monthDays(calendarMonth), [calendarMonth]);
  const monthEvents = useMemo(() => {
    const monthPrefix = dayKey(calendarMonth).slice(0, 7);
    return upcoming.filter((event) => eventDayKey(event.startAt).startsWith(monthPrefix)).sort((a, b) => a.startAt.localeCompare(b.startAt));
  }, [upcoming, calendarMonth]);
  const eventsByDay = useMemo(() => upcoming.reduce<Record<string, RegistrationEvent[]>>((byDay, event) => {
    (byDay[eventDayKey(event.startAt)] ??= []).push(event);
    return byDay;
  }, {}), [upcoming]);

  return (
    <>
      <section className="directory-desk" aria-labelledby="events-heading">
        <div className="shell directory-desk__inner">
          <div className="directory-desk__workspace">
            <div className="directory-desk__heading">
              <h1 id="events-heading">SEC Events</h1>
              <p aria-live="polite">{loading ? "Loading events" : plural(visible.length, query ? "matching event" : "upcoming event")}</p>
            </div>
            <div className="directory-desk__controls">
              <label className="search-box"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search events" aria-label="Search events" /></label>
              <label className="select-label"><span>Sort by</span><select value={sort} onChange={(event) => setSort(event.target.value as Sort)}>{SORTS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
              <a className="directory-desk__calendar-link" href={`#${CALENDAR_ID}`} onClick={scrollToCalendar}>Browse calendar <ArrowRight size={17} /></a>
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
            {visible.map((event) => <EventCard key={event.id} event={event} revealed={revealedIds.has(event.id)} revealDuration={durationFor(event.id)} cardRef={refFor(event.id)} />)}
          </div>
        ) : loadError ? <div className="empty-state"><CalendarDays size={36} /><h3>Events couldn&apos;t load</h3><p>Refresh the page to try again.</p></div> : <div className="empty-state"><CalendarDays size={36} /><h3>No matching events</h3><p>Try another search, or check back soon for new opportunities.</p></div>}
      </section>
      <section id={CALENDAR_ID} className="calendar-section" aria-labelledby="calendar-heading">
        <div className="shell">
          <div className="calendar-section__head">
            <div><h2 id="calendar-heading">Plan ahead</h2><p>Browse SEC events through the next twelve months.</p></div>
            <div className="calendar-controls">
              <button type="button" onClick={() => setCalendarMonthOffset(calendarMonthOffset - 1)} disabled={calendarMonthOffset === 0} aria-label="Previous month"><ChevronLeft size={19} /></button>
              <h3 aria-live="polite">{monthLabel.format(calendarMonth)}</h3>
              <button type="button" onClick={() => setCalendarMonthOffset(calendarMonthOffset + 1)} disabled={calendarMonthOffset === CALENDAR_MONTHS - 1} aria-label="Next month"><ChevronRight size={19} /></button>
            </div>
          </div>
          <div className="calendar-grid" role="grid" aria-label={`${monthLabel.format(calendarMonth)} event calendar`}>
            {WEEKDAYS.map((day) => <span className="calendar-grid__day-name" role="columnheader" key={day}>{day}</span>)}
            {calendarDays.map((day, index) => <CalendarDay key={day ? dayKey(day) : `blank-${index}`} day={day} events={day ? eventsByDay[dayKey(day)] ?? [] : []} />)}
          </div>
          <MonthAgenda events={monthEvents} monthName={monthLabel.format(calendarMonth)} />
          <p className="calendar-note">Select an event marker to view details and register.</p>
        </div>
      </section>
    </>
  );
}
