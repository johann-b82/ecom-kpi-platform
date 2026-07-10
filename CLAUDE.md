# Project instructions

## Deployment

- **Never start or run a local deployment.** Do not `docker compose up` the app
  stack, `npm run dev`, or otherwise bring the app up on this machine.
- **Always deploy on the VPS.** The app runs at https://budp.lumeapps.de on the
  shared VPS (`root@194.164.204.249`). Deploy and verify there.
- This overrides the global engineering guideline about deploying locally via
  Docker as part of testing. Automated tests (`npx vitest`) still run locally;
  only the running/deployed app must live on the VPS.

## Design-Standard

The warm Amber **ERP design system** is the binding frontend standard. Full
reference: `docs/design/design-system.md`. Non-negotiable rules:

- Accent color always via `--accent` (which maps to `var(--brand)`) — never a
  hardcoded competing accent.
- Warm `neutral` palette only — no cold gray/slate/zinc/stone, no pure
  white/black outside the `neutral-0`/`neutral-950` tokens.
- Fonts: Plus Jakarta Sans (`font-sans`) + DM Mono (`font-mono`, `.anno` for
  UPPERCASE micro-labels — the only sanctioned uppercase styling).
- Dark mode is required for anything new (`dark:` variants on the warmed
  `neutral` scale).
- White-label must keep working (`getBranding()` → `RootLayout` inline style).
- New apps register in `src/lib/apps.ts` and mount under the `(shell)` route
  group.
