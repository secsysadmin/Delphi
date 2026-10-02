# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Texas A&M engineering students use the public site to find Student Engineers' Council (SEC) events, understand availability, and register. SEC administrators use the protected workspace to create and manage events, capacity, forms, registrations, confirmation emails, and attendee exports.

## Product Purpose

SEC Registration Hub is the event-registration platform for the Texas A&M Student Engineers' Council. It makes event discovery and registration clear for students while giving organizers a practical workflow for publishing, operating, and following up on events.

## Positioning

The product combines a student-facing SEC event directory with administrator-controlled, capacity-safe registration, configurable forms and time slots, confirmation messaging, and post-event registration management in one branded workflow.

## Operating Context

Students browse upcoming published events, filter and sort the catalog, view event details, then submit registrations. Administrators sign in to manage events and registrations. Without environment variables, the product runs in a populated preview mode with in-memory data; preview data resets after a server restart.

## Capabilities and Constraints

- Public event catalog, event detail pages, and registration flows.
- Capacity handling for unlimited, whole-event, and per-slot registration; event and registration open/close dates.
- Configurable forms, time slots, email templates, broadcasts, CSV export, custom ordering, and active/past event organization.
- Next.js web application with PostgreSQL/Neon, Resend, and Vercel production integration paths documented in the repository.
- SEC/Texas A&M branding and the existing preview-mode workflow are to be preserved.
- Future UI work may use React Bits for visually distinctive effects or interactions, limited to one or two conspicuous effects per page unless explicitly expanded.

## Brand Commitments

The product represents the Texas A&M Student Engineers' Council. It uses the SEC name and mark, Texas A&M references, and a campus-focused, clear, professional voice.

## Evidence on Hand

- Product overview and setup guidance: `README.md`.
- Public and administrative workflows: `app/` and `components/`.
- SEC mark asset: `public/sec_favicon.png`.
- Preview credentials and sample content are documented in `README.md`.

## Product Principles

- Make event discovery and availability immediately understandable.
- Keep registration trustworthy around capacity, timing, and confirmations.
- Let organizers operate events without separate tools or manual reconciliation.
- Preserve the SEC and Texas A&M institutional context without obscuring the task.
