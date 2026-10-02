# Web UI System

## Tokens

- Colors: `--ink`, `--haze`, `--ember`, `--moss`, `--sand`, `--ring` in `styles/globals.css`.
- Radii: `--radius-md` (12px), `--radius-lg` (18px).
- Shadow: `--shadow-lift` for lifted surfaces and CTAs.

## Typography

- Body: Space Grotesk (`--font-body`).
- Display: Fraunces (`--font-display`).
- Headings use the display font; body text inherits the body font.

## Spacing Scale

Use consistent spacing multiples (in px): 4, 8, 12, 16, 24, 32, 40, 48, 64.

## Component Usage

- `Button`: primary actions (default), `accent` for calls-to-action, `ghost` for secondary.
- `Input`: text fields with consistent focus ring and border.
- `Card`: lightweight panels for summaries and empty states.
- `Notice`: low-contrast info banner for pending features.
- `EmptyState`: standard empty state wrapper with optional CTA.
- `AppShell`: portal layout with nav and hero header.

## Current flows

Group detail includes participation, owner/admin draw execution, persisted results,
private ICS exports, and manual Google Calendar actions. Members can leave, admins
edit group details and member role/status, and the owner can transfer ownership or
delete the group. A suspension requires explicit administrator reinstatement.

Settings includes full availability replacement (including clearing), profile and
display preferences, and Google Calendar OAuth. Optional profile fields clear when
saved empty; display preference changes update the schedule without a reload.
Availability dates and times use the profile time zone, including when the browser
uses another zone. Nonexistent local times during daylight-saving changes are
rejected; repeated times use the earlier occurrence.
Outlook, Apple, subscription feeds, automatic reminders, and webhook delivery are
not exposed as working controls.
