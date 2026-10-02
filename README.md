# SEC Registration Hub

A modern event registration platform for the Texas A&M Student Engineers' Council. It includes a public event catalog, capacity-safe registration, configurable forms and time slots, editable confirmation emails, exports, and an admin workspace.

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Without environment variables, the app opens in a fully populated preview mode. Use `admin@sec.tamu.edu` / `gig-em` to explore the admin workflow. Preview data is held in memory and resets when the server restarts.

## Neon + Vercel setup

1. Create or connect a Neon Postgres database in the Vercel project. Vercel should populate `DATABASE_URL`.
2. Run `npm run db:migrate` locally with the production `DATABASE_URL`.
3. Run `npm run db:seed` once to copy the bundled demo events and slots into the database. It is idempotent: existing records are never overwritten. Demo registrations are deliberately not imported as real people.
4. The app stores its tables in the dedicated `sec_registration` schema, so it can safely share a database with other Vercel projects.
5. Create the first database-backed administrator with `INITIAL_ADMIN_EMAIL=... INITIAL_ADMIN_PASSWORD=... npm run db:seed-admin`. Passwords are stored only as hashes. Add a long random `AUTH_SECRET` in Vercel; `ADMIN_EMAIL` and `ADMIN_PASSWORD` are only the no-database preview fallback.
6. For the established SEC sender, add `EMAIL_PROVIDER=ses`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, and `AWS_SECRET_ACCESS_KEY` in Vercel. Set `EMAIL_FROM` to `Student Engineers' Council <no-reply@sec.tamu.edu>`. SES must have that address or domain verified, and the account must be out of the SES sandbox to send to unverified registrant addresses. Resend remains available as an alternative provider.
7. Set `NEXT_PUBLIC_APP_URL` to the production URL and deploy.

## Email template variables

Use `{{firstName}}`, `{{name}}`, `{{event}}`, `{{slot}}`, `{{date}}`, `{{time}}`, and `{{room}}` in event or slot templates.

## Wishlist coverage

- Registration form builder with ten question types; forms remain editable after publishing
- Alphabetical and custom event sorting with persistent manual reordering
- Active and past event tabs
- Independent event and registration open/close dates
- Unlimited, whole-event, or per-slot capacity
- Multiple time slots with room, color, capacity, and email overrides
- Branded confirmation emails and admin broadcasts
- Permanent admin access and CSV export after a form closes
