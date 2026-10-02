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