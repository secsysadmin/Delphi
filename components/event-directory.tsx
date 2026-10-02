"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, CalendarDays, Clock3, MapPin, Search, Users } from "lucide-react";
import { eventPhase, formatDate } from "@/lib/utils";
import type { RegistrationEvent } from "@/types";

export function EventDirectory() {
  const [events, setEvents] = useState<RegistrationEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("custom");
  const [revealedEventIds, setRevealedEventIds] = useState<Set<string>>(() => new Set());
  const [motionReady, setMotionReady] = useState(false);
  const [revealDurations, setRevealDurations] = useState<Record<string, number>>({});
  const eventCardRefs = useRef(new Map<string, HTMLElement>());
  const revealedEventIdsRef = useRef(new Set<string>());
  const nextRevealAtRef = useRef(0);

  useEffect(() => {
    fetch("/api/events").then((response) => response.json()).then((data) => setEvents(data.events ?? [])).finally(() => setLoading(false));
  }, []);

  const visible = useMemo(() => {
    const normalized = query.toLowerCase().trim();
    const next = events.filter((event) => eventPhase(event) !== "past" && event.status === "published" && (!normalized || `${event.title} ${event.summary} ${event.location}`.toLowerCase().includes(normalized)));
    if (sort === "alphabetical") next.sort((a, b) => a.title.localeCompare(b.title));
    if (sort === "date") next.sort((a, b) => a.startAt.localeCompare(b.startAt));
    return next;
  }, [events, query, sort]);

  useEffect(() => {
    if (!visible.length) return;
    if (typeof IntersectionObserver === "undefined") {
      const ids = visible.map((event) => event.id);
      revealedEventIdsRef.current = new Set([...revealedEventIdsRef.current, ...ids]);
      setRevealedEventIds(new Set(revealedEventIdsRef.current));
      return;
    }
    setMotionReady(true);
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
      <section className="events-section shell">
        <div className="section-heading">
          <div className="directory-title"><h1>Upcoming Events</h1></div>
          <div className="directory-controls">
            <div className="events-tools">
              <label className="search-box"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search events" aria-label="Search events" /></label>
              <label className="select-label"><span>Sort by</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="custom">Featured</option><option value="date">Soonest</option><option value="alphabetical">A–Z</option></select></label>
            </div>
          </div>
        </div>

        {loading ? <div className="loading-grid"><div /><div /><div /></div> : visible.length ? (
          <div className="event-grid">
            {visible.map((event) => {
              const phase = eventPhase(event);
              const soldOut = event.capacityMode === "event" ? event.remaining === 0 : Boolean(event.slots.length && event.slots.every((slot) => slot.remaining === 0));
              return (
                <article
                  className={`event-card ${motionReady ? "event-card--motion-ready" : ""} ${revealedEventIds.has(event.id) ? "event-card--revealed" : ""}`}
                  data-event-id={event.id}
                  key={event.id}
                  ref={(node) => { if (node) eventCardRefs.current.set(event.id, node); else eventCardRefs.current.delete(event.id); }}
                  style={{ "--event-accent": event.accentColor, "--reveal-duration": `${revealDurations[event.id] ?? 480}ms` } as React.CSSProperties}
                >
                  <div className="event-card__stripe" />
                  <div className="event-card__top"><span className={`status-pill status-pill--${phase}`}>{soldOut ? "Full" : phase === "open" ? "Registration open" : phase === "upcoming" ? "Opens soon" : "Registration closed"}</span><span className="event-card__date"><strong>{new Date(event.startAt).toLocaleString("en-US", { month: "short", timeZone: "America/Chicago" }).toUpperCase()}</strong>{new Date(event.startAt).toLocaleString("en-US", { day: "2-digit", timeZone: "America/Chicago" })}</span></div>
                  <div className="event-card__body"><h3>{event.title}</h3><p>{event.summary}</p><ul><li><CalendarDays size={17} />{formatDate(event.startAt, true)}</li><li><MapPin size={17} />{event.location}</li>{event.slots.length > 0 && <li><Clock3 size={17} />{event.slots.length} time slots available</li>}{event.remaining !== null && <li><Users size={17} />{event.remaining} spots remaining</li>}</ul></div>
                  <Link href={`/events/${event.slug}`} className="event-card__link">View event <ArrowRight size={18} /></Link>
                </article>
              );
            })}
          </div>
        ) : <div className="empty-state"><CalendarDays size={36} /><h3>No matching events</h3><p>Try another search, or check back soon for new opportunities.</p></div>}
      </section>
    </>
  );
}
