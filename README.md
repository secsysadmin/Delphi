# SEC Registration Hub

A modern event registration platform for the Texas A&M Student Engineers' Council. It includes a public event catalog, capacity-safe registration, configurable forms and time slots, editable confirmation emails, exports, and an admin workspace.

## Local Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Without environment variables, the app opens in a fully populated preview mode. Preview data is held in memory and resets when the server restarts. Admin sign-in still requires Google OAuth credentials (see below); in preview mode, any Google account listed in `ADMIN_EMAIL` (comma-separated) can sign in.

## Neon + Vercel setup

1. Create or connect a Neon Postgres database in the Vercel project. Vercel should populate `DATABASE_URL`.
2. Run `npm run db:migrate` locally with the production `DATABASE_URL`.
3. Run `npm run db:seed` once to copy the bundled demo events and slots into the database. It is idempotent: existing records are never overwritten. Demo registrations are deliberately not imported as real people.
4. The app stores its tables in the dedicated `sec_registration` schema, so it can safely share a database with other Vercel projects.
5. Admin sign-in uses Google OAuth. Create an OAuth 2.0 Web client in Google Cloud Console, add `<app origin>/api/auth/google/callback` as an authorized redirect URI (for both the local dev origin and the production origin), and set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in Vercel. Add a long random `AUTH_SECRET` in Vercel. Whitelist the first administrator with `INITIAL_ADMIN_EMAIL=... npm run db:seed-admin`; afterwards, admins can add or remove other administrators from the "Manage admins" page. `ADMIN_EMAIL` is only the no-database preview fallback.
6. For the established SEC sender, add `EMAIL_PROVIDER=ses`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, and `AWS_SECRET_ACCESS_KEY` in Vercel. Set `EMAIL_FROM` to `Student Engineers' Council <no-reply@sec.tamu.edu>`. SES must have that address or domain verified, and the account must be out of the SES sandbox to send to unverified registrant addresses. Resend remains available as an alternative provider. Broadcasts send at `EMAIL_SEND_RATE` emails per second (default 10, under SES's default limit of 14); throttled sends are retried, and any addresses that still fail are listed back to the admin.
7. Set `NEXT_PUBLIC_APP_URL` to the production URL and deploy. Confirmation emails use it to build each registrant's "Manage your registration" link. Those links are signed with `AUTH_SECRET`, so changing `AUTH_SECRET` invalidates every link already sent (registrants can request a new one from the event page).

## Testing

**Test locally in preview mode, not against a shared database.** `npm run dev` reads `.env`, and a `.env` pulled from Vercel points at the same database as the live site. A test registration made there is a real registration: it appears in staff participant lists and CSV exports, takes a real spot, and sends real email through SES. Until Development and Preview have their own database (for example a Neon `dev` branch), don't test on a Vercel preview URL either.

Blank out the database and email settings for the test run. Command-line values take priority over `.env`:

```bash
DATABASE_URL= DATABASE_URL_UNPOOLED= AWS_ACCESS_KEY_ID= AWS_SECRET_ACCESS_KEY= \
  EMAIL_PROVIDER=none NEXT_PUBLIC_APP_URL=http://localhost:3000 \
  ADMIN_EMAIL=you@tamu.edu npm run dev
```

The site then runs on the bundled demo events with everything held in memory; restarting the server resets it. If the events page shows the demo events (such as "Engineering Career Discovery Day"), you are in preview mode. No email is sent: each one is printed in the terminal instead, including its links, so copy the manage link from there.

Staff pages need Google sign-in: keep `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in your `.env`, make sure `http://localhost:3000/api/auth/google/callback` is an authorized redirect URI, and list your Google address in `ADMIN_EMAIL`. Without them you can still test everything students see.

### Registration self-service checklist

Students don't log in. Every confirmation email has a signed "Manage your registration" link, and the event page can email a fresh one.

1. Register for an open event. In the email printed in the terminal, open the manage link.
2. Change an answer and save. Switch to another session and save: a new confirmation with the new time and room is printed. A full session can't be chosen.
3. Withdraw (there's a confirmation dialog). The page shows you're no longer registered, a "withdrawn" email is printed, and the spot count goes back up. Opening the link again shows the withdrawn state; you can register again with the same email.
4. On the event page, open "Already registered? Change or withdraw your registration" and enter your email. A manage link is printed. An unregistered address gets the same on-screen reply, so the form doesn't reveal who signed up.
5. Try to register twice with the same email. The error appears and the "Already registered?" box opens with your email filled in.
6. Type an email like `you@tamu.edy` or `you@gmial.com` and leave the field. "Did you mean …?" appears; clicking it fixes the address.
7. As staff, open the event's registrations. Withdrawn registrants are labelled "Withdrawn" and can't be re-sent a confirmation. Use the pencil next to an email to correct it: the confirmation is re-sent to the new address, and an address already registered for the event is refused.
8. Check that a broken link (change a character in it) shows "This link isn't valid".

Editing locks when registration closes; withdrawing stays open until the event starts. Before handing off UI changes, also run `npm run typecheck` and `npm run lint`, and check the pages in Chrome and Firefox at desktop and phone widths.

## Email Template Variables

Use `{{firstName}}`, `{{name}}`, `{{event}}`, `{{slot}}`, `{{date}}`, `{{time}}`, and `{{room}}` in event or slot templates.

## Wishlist Coverage

- Registration form builder with ten question types; forms remain editable after publishing
- Alphabetical and custom event sorting with persistent manual reordering
- Active and past event tabs
- Independent event and registration open/close dates
- Unlimited, whole-event, or per-slot capacity
- Multiple time slots with room, color, capacity, and email overrides
- Branded confirmation emails and admin broadcasts
- Permanent admin access and CSV export after a form closes
- Registrants edit or withdraw through a signed link in their confirmation email, with no account needed
- Typo suggestions for email addresses, and staff can correct a mistyped address
