<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
# Frontend Development Guidelines

## Design

Before implementing substantial new UI:
- Determine the visual direction first.
- Use Stitch or design references when exploration is needed.
- Avoid generic AI-generated SaaS aesthetics.
- Maintain clear typography, spacing, hierarchy, and visual rhythm.

## Components

- Prefer shadcn/ui for standard UI primitives.
- Prefer existing project components over introducing new dependencies.
- Watermelon UI may be used for richer application components and sections.
- React Bits may be used selectively for visually distinctive interactions.
- Do not add decorative effects simply because they are available.

## Animation

- Use Motion for React for non-trivial animation.
- Prefer CSS transitions for simple hover and state changes.
- Motion should reinforce hierarchy and interaction, not distract from content.

## Quality

After substantial UI implementation:
1. Render the page in a browser.
2. Inspect it with Chrome DevTools.
3. Check console and network errors.
4. Verify desktop and mobile layouts.
5. Run an Impeccable audit or critique.
6. Fix relevant findings.
7. Verify the result again visually.

## Browser Compatibility

Chrome is the primary development/debugging browser.

Before completing significant UI work:
- Verify the page in Firefox.
- Check for Firefox-specific CSS, layout, or interaction differences.

## Accessibility

- Use semantic HTML.
- Preserve keyboard navigation.
- Ensure interactive controls have visible focus states.
- Respect reduced-motion preferences where appropriate.
# Coding rules

Rules, not preferences. Each one is a defect in review. They are adapted from the sechat bot's
rules; when in doubt, mirror the existing code that already follows them.

**Comments**
- Zero comments: no JSDoc, no banner or section-divider comments, no narration inside
  functions, no commented-out code, no TODOs. Code explains itself through names and small
  functions. If a line seems to need a comment, rename the constant or extract a function with
  a descriptive name, then delete the comment.
- The only exception is one line for a genuinely non-obvious external quirk that code cannot
  express: a browser or API limitation, or a security invariant (CSV formula injection, the
  same-origin check). Keep these rare; every one is a deletion candidate in review.
- `// eslint-disable`, `/// <reference`, and the `"use client"` / `"use server"` pragmas are
  directives, not comments.

**Types and shape**
- Strict TypeScript, no `any`. No type assertions or non-null assertions except at a typed
  boundary (request bodies, DB rows, Google, SES/Resend, `fetch` JSON, DOM values): type the
  payload at the fields you read and keep loose shapes out of callers.
- Functions do one thing; extract instead of nesting. No long parameter lists; pass an object.
- No magic values. Thresholds, limits, lengths, delays, colors, and default copy are
  `SCREAMING_SNAKE_CASE` constants at module scope, or come from env with a named default.
  Module-level constants sit at the top of the file above the functions, never inside a
  function body.
- No IIFEs and no `typeof import("…")` type imports.
- In `.tsx`: props use a named type declared at the top of the file, not an inline annotation;
  React 19 refs go on that props type as `ref?: React.Ref<…>`, never `forwardRef`; no inline
  `style={{}}` where a class or stylesheet works (per-event colors passed as CSS variables are
  the exception).
- Kebab-case file names. Match the surrounding file's style when editing it.

**Reuse**
- Grep for the canonical example (an existing route, component, or `lib/` helper) before
  writing pattern-shaped code, and mirror it exactly, defaults and quirks included.
- Shared logic lives in one place: the admin route guards (`rejectNonAdmin`, `rejectNonAdminMutation` in `lib/api-guard.ts`), client JSON
  requests (`lib/api-client.ts`), error-to-message (`lib/errors.ts`), dates, templates, and
  formatting (`lib/utils.ts`).
- Default to the durable option over the shortcut.

**Errors and replies**
- Never `catch {}` into silence. A catch returns a typed value the caller acts on, rethrows,
  or logs and produces a user-visible message.
- Every route and UI path ends in something the user sees. A DB, email, Google, or network
  failure is a visible message, never a dropped request or a spinner that never stops.
- Only our own validation messages reach users; DB and driver errors are logged and replaced
  with a plain message (`publicError`).
- Logs go through `console.error` / `console.warn` for failures with the identifying id in the
  message. No `console.log` in `app/`, `components/`, or `lib/`. Never log tokens, secrets,
  session values, or full payloads.

**Non-negotiables (easy to violate, always checked)**
- Access control is code. Every admin route checks `isSameOriginRequest` (for mutations) and
  `isAdmin` before touching data, and every admin page redirects when `isAdmin` is false.
- Nothing that validates secrets runs at import time, because `next build` imports every
  route. Required secrets (`AUTH_SECRET`, Google credentials) are read and checked on first
  use, never at module scope.
- Preview mode (no `DATABASE_URL`) keeps working: every store function has an in-memory path,
  and email without a provider reports `previewed` instead of failing.
- Registration capacity and duplicate checks run inside the row-locked transaction in
  `createRegistration`; never move them before it.
- All times are entered and shown in Central Time (`EVENT_TIME_ZONE`); calendar day math stays
  in UTC so server and browser render identical HTML.

**Scope and verification**
- Change only what the task needs: no cosmetic cleanups in touched files, no repo-wide
  refactors to make verification pass.
- `npm run typecheck`, `npm run lint`, and `npm run build` before finishing. Run checks
  through the package scripts, never one-off substitutes, and never `echo` a success marker.
  A pre-existing failure you did not cause gets raised, not worked around.
- A failing check gets its cause fixed: never skip it, loosen it, or special-case around it.
- UI changes follow the Quality steps above. Every hand-off includes the local steps to
  verify it.
- Before every push, a code-reviewer subagent reviews the diff for dead code, rule violations
  and edge cases. Read the whole batch of findings, group them by root cause, and fix each
  cause once.
- Never commit or push without an explicit instruction. Single-line conventional-commit
  messages (`feat:`, `fix:`, `perf:`, `chore:`, `refactor:`, `docs:`, `test:`), lowercase after
  the colon, aiming under 50 chars, saying what changed (not why), no ticket ids, no body, no
  trailing period.
- Worktrees live at `.claude/worktrees/<name>` (gitignored).
- "Reset" or "clean" tooling replays the flow; it never deletes data.

# Audit rubric (flag these)

Each is a defect to fix, not a preference:

1. Any comment beyond the single-line external-quirk exception: banners, narration, JSDoc.
2. Commented-out code or TODOs.
3. `any`, type assertions, or non-null assertions outside a typed boundary.
4. Functions or components doing several things, deep nesting, long parameter lists.
5. Duplicated logic (route guards, fetch handling, date math, pluralizing, color checks).
6. Magic numbers or meaningful bare string literals (limits, delays, colors, time zones).
7. Swallowed errors, or a failure path that does not end in a user-visible message.
8. Dead code, unused exports/imports/params, env vars in `.env.example` nothing reads.
9. An admin route or page missing its `isAdmin` / same-origin check.
10. A required secret read or validated at module top level.
11. A store change that breaks the in-memory preview path.
12. Secrets or tokens in code, logs, comments, or committed files.
13. `console.log` in `app/`, `components/`, or `lib/`; module constants declared mid-file or
    inside functions; IIFEs; `typeof import()` types; inline `.tsx` props types, `forwardRef`,
    or avoidable inline styles.
