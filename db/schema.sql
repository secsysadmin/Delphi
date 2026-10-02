create extension if not exists pgcrypto;

create schema if not exists sec_registration;

create table if not exists sec_registration.events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  summary text not null default '',
  description text not null default '',
  location text not null default '',
  start_at timestamptz not null,
  end_at timestamptz not null,
  registration_open_at timestamptz not null,
  registration_close_at timestamptz not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  capacity_mode text not null default 'unlimited' check (capacity_mode in ('event', 'slot', 'unlimited')),
  capacity integer check (capacity is null or capacity > 0),
  sort_order integer not null default 0,
  accent_color text not null default '#500000',
  form_fields jsonb not null default '[]'::jsonb,
  confirmation_subject text not null default 'Registration confirmed: {{event}}',
  confirmation_body text not null default 'Howdy {{firstName}}! Your registration for {{event}} is confirmed.',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at > start_at),
  check (registration_close_at > registration_open_at)
);

create table if not exists sec_registration.event_slots (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references sec_registration.events(id) on delete cascade,
  label text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  location text not null default '',
  capacity integer check (capacity is null or capacity > 0),
  confirmation_subject text,
  confirmation_body text,
  accent_color text,
  created_at timestamptz not null default now(),
  check (end_at > start_at)
);

create index if not exists event_slots_event_id_idx on sec_registration.event_slots(event_id);

create table if not exists sec_registration.registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references sec_registration.events(id) on delete restrict,
  slot_id uuid references sec_registration.event_slots(id) on delete set null,
  first_name text not null,
  last_name text not null,
  email text not null,
  uin text not null default '',
  answers jsonb not null default '{}'::jsonb,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled', 'waitlisted')),
  email_status text not null default 'pending',
  created_at timestamptz not null default now()
);

create unique index if not exists registrations_active_email_idx
  on sec_registration.registrations(event_id, lower(email)) where status != 'cancelled';
create index if not exists registrations_event_id_idx on sec_registration.registrations(event_id);
create index if not exists registrations_slot_id_idx on sec_registration.registrations(slot_id);

create table if not exists sec_registration.email_logs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references sec_registration.events(id) on delete set null,
  recipient_count integer not null default 0,
  subject text not null,
  status text not null,
  provider_id text,
  created_at timestamptz not null default now()
);
