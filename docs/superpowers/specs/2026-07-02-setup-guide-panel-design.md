# Setup guide panel ("Setupbeschreibung einblenden") — Design

**Date:** 2026-07-02
**Status:** Approved
**Branch:** `worktree-oauth-external-systems` (extends PR #30)

## Problem

The OAuth "Mit … verbinden" flow (PR #30) needs the user to do provider-side setup
(create an OAuth app, register callback URLs, enter client id/secret) before the button
works. A non-technical user has no guidance for this. We want a **layperson-friendly,
interactive setup guide** that can be toggled open on the Einstellungen page and reflects
the user's real progress.

## Scope

A collapsible right-hand **guide panel** on `/setup`, toggled by a
**"Setupbeschreibung einblenden / …ausblenden"** button in the page header. The panel has
per-provider tabs (Google / Meta / TikTok) and a step checklist whose step states derive
from the **real** OAuth status already loaded server-side (`OAuthProviderStatus`). No new
data fetching, no changes to the OAuth logic itself.

Out of scope (YAGNI): editing provider consoles from the app, screenshots/images,
persisting the toggle state, live polling (page reload after connect already refreshes
status).

## Architecture

```
setup/page.tsx (server, force-dynamic)
  loads oauth = listOAuthStatus()  [already exists]
  └─ <SetupShell oauth={oauth}>            ← client wrapper: toggle + 2-col layout
       {existing left-column sections (Branding, Benutzer, Verbindungen+CredentialsForm)}
       aside → <SetupGuide oauth={oauth}/> ← client: tabs + accordion, live states
     </SetupShell>
                     guideSteps(status)   ← pure: OAuthProviderStatus → GuideStep[]
```

### Components (small, focused)

1. **`src/lib/oauth/guide.ts`** — pure. `guideSteps(status: OAuthProviderStatus): GuideStep[]`
   returning the provider's steps, each with `state: 'done' | 'current' | 'todo'`. Copy is
   layperson German. No I/O. Unit-testable.
2. **`src/components/SetupGuide.tsx`** — client. Provider tabs + a step accordion for the
   selected provider; shows ✓ for done steps, highlights + auto-expands the current step;
   overall "Verbunden/Nicht verbunden" line. Consumes `guideSteps`.
3. **`src/components/SetupShell.tsx`** — client. Renders `<main>` + header (title, toggle
   button, dashboard link). Holds the show/hide state. When shown: widens the container
   (`max-w-3xl` → `max-w-6xl`) and lays out a two-column grid
   (`lg:grid-cols-[minmax(0,1fr)_360px]`) with `children` left and a sticky `SetupGuide`
   right; on narrow screens the guide stacks below. When hidden: today's single column.
4. **`src/app/setup/page.tsx`** — wraps its existing content in `<SetupShell oauth={oauth}>`;
   moves the header into `SetupShell`. No other change.

## Step model & live state

Steps per provider (same skeleton, provider-specific copy):

1. Bei `<Provider>` einen Zugang (OAuth-App) anlegen und die nötigen APIs aktivieren.
2. Beide Weiterleitungs-Adressen eintragen: `http://localhost:3000/api/oauth/<key>/callback`
   und `https://budp.lumeapps.de/api/oauth/<key>/callback`.
3. OAuth Client-ID & Secret unten ins Formular eintragen.
4. Auf „Mit `<Provider>` verbinden" klicken und im Fenster zustimmen.
5. Fertig — der Status zeigt „Verbunden".

State derivation from `OAuthProviderStatus`:

- `connected` → **all** steps `done`.
- `hasAppCreds && !connected` → steps 1–3 `done`, step 4 `current`, step 5 `todo`.
- neither → step 1 `current`, steps 2–5 `todo`.

General rule: a step is `done` per the flags above; the first non-done step is `current`;
the rest are `todo`. Steps 1–3 share the "`hasAppCreds || connected`" done-condition
(you cannot have entered valid client id/secret without having created the app), so a
laperson sees a coherent "you're here" marker without us needing to detect console
actions we can't observe.

Provider-specific copy notes: Google — one connection covers GA4 **and** Google Ads;
enable GA4 Data API + Google Ads API. Meta — token lasts ~60 days, then reconnect here.
TikTok — TikTok for Business app.

## Testing

- **Unit (`tests/lib/oauth/guide.test.ts`):** `guideSteps` for the three status scenarios
  (neither / hasAppCreds-not-connected / connected) asserts the exact `state` sequence,
  and that the callback URLs contain the provider key.
- **Component (`tests/components/setup-guide.test.tsx`, jsdom):** `SetupGuide` renders the
  three provider tabs; the default-selected provider shows its steps; switching tabs
  changes the shown steps; a `connected` provider shows done markers while a
  not-configured one shows a current/first step.
- **Build:** `npm run build` clean. Browser-drive once the auth stack is available.

## Notes

- `SetupShell` receives the server-rendered sections as `children` (a client component may
  render server children passed as props), so `page.tsx` stays a server component and no
  data fetching moves to the client.
- The guide reflects status as of page load; after a connect/disconnect the callback
  redirects back to `/setup` (full navigation, `force-dynamic`), so states refresh with no
  client polling.
