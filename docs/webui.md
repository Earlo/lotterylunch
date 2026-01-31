# Web UI System

## Tokens
- Colors: `--ink`, `--haze`, `--ember`, `--moss`, `--sand`, `--ring` in `src/app/globals.css`.
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
- `Dialog`: modal overlay for confirmations and form flows.
- `Notice`: low-contrast info banner for pending features.
- `EmptyState`: standard empty state wrapper with optional CTA.
- `AppShell`: portal layout with nav and hero header.
