---
name: SEC Registration Hub
description: A crisp Texas A&M event service built from white space, maroon authority, and editorial clarity.
colors:
  maroon: "#4d0710"
  paper: "#ffffff"
  sand: "#f4f5f6"
  ink: "#1f1f1f"
  line: "#d6d6d6"
  green: "#285e4d"
  gold: "#a6752d"
typography:
  display:
    fontFamily: "Source Serif 4, Georgia, serif"
    fontSize: "clamp(3.1rem, 5vw, 5rem)"
    fontWeight: 500
    lineHeight: 0.95
    letterSpacing: "-0.032em"
  body:
    fontFamily: "Work Sans, Arial, sans-serif"
    fontSize: "1rem"
    lineHeight: 1.6
rounded:
  none: "0"
spacing:
  page: "56px"
  section: "94px"
  control: "48px"
components:
  button-primary:
    backgroundColor: "{colors.maroon}"
    textColor: "#fff8ef"
    rounded: "{rounded.none}"
    padding: "10px 18px"
---

# Design System: SEC Registration Hub

## Overview

**Creative North Star: "The Aggie Event Desk"**

This is a crisp campus service, not a generic SaaS dashboard. It borrows the confidence of Texas A&M's institutional communications: generous white space, decisive maroon, exact rules, and direct editorial type. The public directory makes the next event obvious; admin surfaces retain the same visual authority while prioritizing speed and scanability.

## Colors

Maroon signals action and institutional ownership. White carries reading. A cool, nearly-white gray is used only to group dense operational information; black ink and neutral gray rules do the functional work. Do not reintroduce cream, parchment, or tan panel treatments.

## Typography

Source Serif 4 carries large, restrained editorial statements. Work Sans carries information, controls, and labels. Labels are small uppercase wayfinding, never decorative eyebrows.

## Layout

Use a 1216px max-width shell with 56px desktop gutters and 32px mobile gutters. The public program is a ruled ledger: event date, narrative, and facts each have distinct columns. The masthead is white with a maroon action rail; the public hero is a single confident maroon field. It becomes a clear vertical reading order on narrow screens.

## Elevation & Depth

Flat by default. Borders, white-space, and the contrast between white and maroon separate regions; shadows only appear for true interaction feedback.

## Shapes

Forms, buttons, panels, and data rows are square-cornered. Circles are reserved for the SEC mark and compass-like wayfinding artwork.

## Components

### Buttons

Primary buttons are solid maroon, square, compact, and uppercase. Secondary controls are white with a single neutral-gray rule.

### Inputs / Fields

Fields use square borders and a maroon offset focus treatment. Never use soft floating pills.

### Navigation

The identity bar is white; the action rail is maroon with uppercase labels.

### Program Ledger

Public events are editorial rows, not equal marketing cards: date at left, story in the center, logistics at right.

## Do's and Don'ts

### Do:

- **Do** use maroon for action, wayfinding, and decisive anchors.
- **Do** make white space do real organizational work.
- **Do** let information hierarchy—not decorative containers—organize the page.
- **Do** reserve motion for the React Bits text reveal or a single meaningful state transition per page.

### Don't:

- **Don't** use rounded card grids, gradient text, parchment textures, or generic dashboard metrics as decoration.
- **Don't** add more than one or two conspicuous React Bits effects to a page without explicit direction.
- **Don't** introduce faux technical grids, terminal styling, or AI-stock visual metaphors.
