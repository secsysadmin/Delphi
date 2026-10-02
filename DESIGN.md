---
name: SEC Registration Hub
description: A confident campus field guide for finding and joining engineering events.
colors:
  maroon: "#4d0710"
  paper: "#f5f0e7"
  sand: "#e9dfd0"
  ink: "#26221f"
  line: "#c9bdad"
  green: "#285e4d"
  gold: "#a6752d"
typography:
  display:
    fontFamily: "Newsreader, Georgia, serif"
    fontSize: "clamp(3.35rem, 7.2vw, 7.35rem)"
    fontWeight: 500
    lineHeight: 0.89
    letterSpacing: "-0.047em"
  body:
    fontFamily: "DM Sans, Arial, sans-serif"
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

**Creative North Star: "The Engineering Field Guide"**

This is a practical campus guide, not a generic SaaS dashboard. It uses paper-like fields, precise rules, decisive editorial type, and Texas A&M maroon as wayfinding. The public directory should make the next event obvious; admin surfaces retain the same material discipline while prioritizing speed and scanability.

## Colors

Maroon signals action and institutional ownership; cream paper carries reading; ink and rules do the functional work.

## Typography

Newsreader carries large, compact editorial statements. DM Sans carries information, controls, and labels. Labels are small uppercase wayfinding, never decorative eyebrows.

## Layout

Use a 1216px max-width shell with 56px desktop gutters and 32px mobile gutters. The public program is a ruled ledger: event date, narrative, and facts each have distinct columns. It becomes a clear vertical reading order on narrow screens.

## Elevation & Depth

Flat by default. Borders, paper-tone shifts, and whitespace separate regions; shadows only appear for true interaction feedback.

## Shapes

Forms, buttons, panels, and data rows are square-cornered. Circles are reserved for the SEC mark and compass-like wayfinding artwork.

## Components

### Buttons

Primary buttons are solid maroon, square, compact, and uppercase. Secondary controls are paper-toned with a single precise rule.

### Inputs / Fields

Fields use square borders and a maroon offset focus treatment. Never use soft floating pills.

### Navigation

The identity bar is quiet paper; the action rail is maroon with uppercase labels.

### Program Ledger

Public events are editorial rows, not equal marketing cards: date at left, story in the center, logistics at right.

## Do's and Don'ts

### Do:

- **Do** use maroon for action, wayfinding, and decisive anchors.
- **Do** let information hierarchy—not decorative containers—organize the page.
- **Do** reserve motion for the React Bits text reveal or a single meaningful state transition per page.

### Don't:

- **Don't** use rounded card grids, gradient text, or generic dashboard metrics as decoration.
- **Don't** add more than one or two conspicuous React Bits effects to a page without explicit direction.
- **Don't** introduce faux technical grids, terminal styling, or AI-stock visual metaphors.
