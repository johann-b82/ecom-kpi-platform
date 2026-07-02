# OAuth for external systems (Google, Meta, TikTok) — Design

**Date:** 2026-07-02
**Status:** Approved for planning
**Branch:** `worktree-oauth-external-systems`

## Problem

Connectors currently authenticate against external systems with **manually obtained**
credentials pasted into *Einstellungen → Verbindungen* and stored AES-256-GCM-encrypted:

- **GA4** — a Service-Account JSON (`GA4_SERVICE_ACCOUNT_JSON`).
- **Google Ads** — a manually generated OAuth refresh token plus client id/secret and a
  developer token.
- **Meta / TikTok** — long-lived access tokens obtained by hand.

Obtaining these tokens by hand is error-prone and opaque. We want a proper
**"Connect with …" OAuth flow**: the user clicks a button, goes through the provider's
consent screen, and the app exchanges the returned authorization code for tokens
server-side, storing them encrypted. Connectors then read those tokens automatically.

## Scope

A **generic OAuth framework** covering the providers where a 3-legged OAuth flow is
meaningful:

| OAuth provider | Covers connector(s) | Token model |
|---|---|---|
| `google` | `ga4` **and** `google` (Ads) | Long-lived refresh token; access token is refreshed on demand |
| `meta` | `meta` | **No** refresh token — long-lived (~60-day) access token; on expiry the user must reconnect |
| `tiktok` | `tiktok` | Access **and** refresh token (both expire); access token refreshed on demand |

`shopware` (client-credentials grant, no user login) and `klaviyo` (private API key) are
**out of scope** — no meaningful 3-legged OAuth flow.

**Key insight:** an OAuth *provider* is distinct from a *connector*. One `google`
authorization (scopes `analytics.readonly` + `adwords`) covers both the GA4 and the
Google Ads connectors.

**Fallback is retained:** all existing manual credential fields stay. Resolution order per
connector is **OAuth connection first, manual credentials otherwise.**

**Implementation is phased:** framework + Google first (verified end-to-end in a browser),
then Meta, then TikTok. One spec, one plan with explicit phases; each phase builds and
passes tests.

## Architecture

```
Browser ──"Mit Google verbinden"──► GET /api/oauth/[provider]/start
                                        │ set signed `state` cookie (CSRF)
                                        └─► 302 to provider consent screen
Provider consent ──code+state──► GET /api/oauth/[provider]/callback
                                        │ verify state, exchange code → TokenSet
                                        │ store encrypted in oauth_connections
                                        └─► 302 back to /setup (success / error msg)

Connector sync ──► getOAuthAccessToken(provider)
                       │ load TokenSet; if access token valid → return
                       │ else provider.refresh() → update stored token → return
                       └─ no connection → connector falls back to manual credentials
```

### Components (each independently testable)

1. **Provider registry** (`src/lib/oauth/providers.ts`) — one `OAuthProvider` per provider,
   encapsulating the provider-specific differences. No I/O beyond `fetch` it is handed.
2. **Token store** (`src/lib/oauth/store.ts`) — CRUD over the `oauth_connections` table;
   encrypt/decrypt via existing `crypto.ts`.
3. **Token resolver** (`src/lib/oauth/token.ts`) — `getOAuthAccessToken(provider)`:
   returns a valid access token, refreshing when expired; throws a clear error when the
   connection is missing or revoked.
4. **Routes** (`src/app/api/oauth/[provider]/start` + `.../callback`) — the browser-facing
   flow, CSRF via signed state.
5. **App-credential fields** — per-provider OAuth client id/secret added to the existing
   vault (`connector-fields.ts`) so the "Connect" button can function.
6. **UI** — connection status + Connect/Disconnect controls in `CredentialsForm`, above the
   (retained) manual fields.
7. **Connector integration** — GA4, Google Ads, Meta, TikTok clients gain an
   OAuth-first-then-manual token path.

## Provider adapter interface

```ts
export interface TokenSet {
  accessToken: string;
  refreshToken?: string;   // absent for Meta
  expiresAt?: number;      // epoch ms; absent → treat as long-lived / unknown
  scope?: string;
  accountLabel?: string;   // e.g. connected account name, for display
}

export interface AppCredentials { clientId: string; clientSecret: string; }

export interface OAuthProvider {
  key: 'google' | 'meta' | 'tiktok';
  label: string;                              // "Google", "Meta", "TikTok"
  connectors: Connector[];                    // connectors this provider authorizes
  scopes: string[];
  authorizeUrl(redirectUri: string, state: string, creds: AppCredentials): string;
  exchangeCode(code: string, redirectUri: string, creds: AppCredentials,
               fetchImpl?: typeof fetch): Promise<TokenSet>;
  refresh?(current: TokenSet, creds: AppCredentials,
           fetchImpl?: typeof fetch): Promise<TokenSet>;   // omitted for Meta
}
```

### Provider specifics

- **Google** — authorize `https://accounts.google.com/o/oauth2/v2/auth` with
  `access_type=offline&prompt=consent` (forces a refresh token); token endpoint
  `https://oauth2.googleapis.com/token`; scopes `analytics.readonly` + `adwords`.
  `refresh` uses `grant_type=refresh_token`.
- **Meta** — authorize `https://www.facebook.com/v19.0/dialog/oauth`; scope `ads_read`;
  token endpoint `https://graph.facebook.com/v19.0/oauth/access_token`, then exchange the
  short-lived token for a long-lived one (`grant_type=fb_exchange_token`). **No `refresh`.**
  Store `expiresAt`; when expired, surface "läuft ab / bitte neu verbinden".
- **TikTok** — authorize on the TikTok for Business auth endpoint; token endpoint
  `.../open_api/v1.3/oauth2/access_token/` returns `access_token` + `refresh_token` (both
  with explicit expiry). `refresh` uses the refresh token per TikTok's API.

## Data model

New table (migration in `db/schema.sql`, RLS in `db/rls.sql`):

```sql
CREATE TABLE IF NOT EXISTS oauth_connections (
  provider          text PRIMARY KEY,          -- 'google' | 'meta' | 'tiktok'
  refresh_token_enc text,                       -- nullable (Meta has none)
  access_token_enc  text,
  expires_at        timestamptz,
  scope             text,
  account_label     text,
  updated_at        timestamptz NOT NULL DEFAULT now()
);
```

RLS: **enabled with no public policy** — identical posture to `connector_credentials` and
`app_settings`; reachable only via the privileged server-side `pg` connection. Tokens are
stored as AES-256-GCM ciphertext via the existing `encrypt`/`decrypt` helpers.

OAuth **app credentials** (client id/secret per provider) live in the existing
`connector_credentials` vault as new fields, e.g. `GOOGLE_OAUTH_CLIENT_ID` /
`GOOGLE_OAUTH_CLIENT_SECRET`. Google Ads developer token and customer id remain manual
fields (not part of OAuth).

## Routes & flow

- `GET /api/oauth/[provider]/start`
  - Validates the provider and that app credentials are set.
  - Generates a random `state`, stores it in a signed **httpOnly** cookie.
  - Computes `redirectUri` from the request origin (works for `localhost:3000` and
    `budp.lumeapps.de`) and 302-redirects to `provider.authorizeUrl(...)`.
- `GET /api/oauth/[provider]/callback`
  - If provider returned `error` → 302 to `/setup?oauth=<provider>&error=…`.
  - Verify `state` against the cookie (mismatch → 400).
  - `exchangeCode(...)` → `TokenSet` → store encrypted → clear state cookie.
  - 302 to `/setup?oauth=<provider>&connected=1`.
- Both live under `/api`, already gated by the auth middleware; the browser carries the
  Supabase session cookie during the redirect round-trip, so `getUser()` passes.

**Deployment note:** each provider's developer console must whitelist both redirect URIs:
`http://localhost:3000/api/oauth/<provider>/callback` and
`https://budp.lumeapps.de/api/oauth/<provider>/callback`.

## Connector integration (OAuth-first, manual fallback)

A shared resolver decides the token source per connector:

- **GA4** (`Ga4Client`) — add a constructor path taking a `TokenProvider` backed by
  `getOAuthAccessToken('google')`. If no Google OAuth connection, fall back to
  `fromCredentials(propertyId, serviceAccountJson)` (unchanged).
- **Google Ads** (`GoogleAdsClient`) — replace `getAccessToken()` with the shared token
  provider when Google OAuth is connected; developer token / customer id stay manual.
  Fallback: existing manual `clientId/secret/refreshToken`.
- **Meta** — use the stored OAuth long-lived token if connected; fallback:
  `META_ACCESS_TOKEN`.
- **TikTok** — use the stored OAuth access token (refreshed on demand) if connected;
  fallback: `TIKTOK_ACCESS_TOKEN`.

No manual fields are removed.

## UI

In `CredentialsForm`, for each OAuth-capable provider, render above the manual fields:

- **Not connected:** a "Mit `<Provider>` verbinden" button (links to
  `/api/oauth/<provider>/start`), enabled once client id/secret are set.
- **Connected:** connected account label, granted scopes, expiry ("läuft ab am …"), and a
  "Verbindung trennen" button (deletes the row via a small server action / route).
- The success/error query params from the callback drive a status message on `/setup`.

The retained manual fields are shown below, labelled as a fallback.

## Error handling

- Consent denied / provider `error` param → friendly message on `/setup`, no row written.
- `state` mismatch or missing cookie → 400 (CSRF protection).
- Token exchange / refresh HTTP failure → surfaced with the provider's status/body.
- Refresh fails because the grant was revoked → the resolver throws a clear "bitte neu
  verbinden" error; the sync command reports it.

## Testing (Vitest)

- **Provider adapters (pure, with injected `fetch`):** authorize-URL construction (params,
  scopes, redirect uri), `exchangeCode` response normalization, `refresh` for Google and
  TikTok; Meta has no `refresh`.
- **Token resolver:** returns cached token when valid; refreshes when `expiresAt` is in the
  past (fake clock); throws on missing/revoked connection.
- **Routes:** `start` sets the state cookie and redirects; `callback` rejects a mismatched
  `state` (400) and stores a token on the happy path (mocked `fetch`).
- **Fallback selection:** each connector picks OAuth when connected and manual otherwise.
- **RLS:** `oauth_connections` denies the `authenticated`/`anon` PostgREST surface (same
  `SET ROLE` pattern as the `connector_credentials` test).

No live provider calls in tests — `fetch` is always injected/mocked, consistent with the
existing connector client tests.

## Out of scope (YAGNI)

- Multi-tenant / per-user connections (single shared connection per provider, matching the
  app's single shared access level).
- Automatic background token refresh jobs (refresh happens lazily at sync time).
- Provider webhooks or token-revocation callbacks.
- OAuth for Shopware / Klaviyo.
