# NexusHOS

NexusHOS is a full-stack hotel operating-system prototype. It combines a public direct-booking engine, front-desk and reservation operations, folios, housekeeping, maintenance, guest profiles, POS posting, revenue rules, portfolio records, inventory-holding group blocks, reputation workflows, ESG requests, double-entry accounting, procurement, HR, a permissioned workflow engine, administrator access control, immutable API auditing, signed outbound webhooks, and an OpenAPI developer portal.

## Quick start

Requirements: **Node.js 22.5 or newer** and a PostgreSQL connection. The production target is the same Supabase PostgreSQL project used by NexusERP.

```bash
npm install
npm run dev
```

This starts the API at `http://localhost:4000` and Vite at `http://localhost:3000`. Vite proxies browser requests from `/api` to the API. Stop both processes with `Ctrl+C`.

The staff workspace opens at the root URL. The guest-facing booking engine is available from **Book a Guest Stay** on the sign-in screen or directly at `http://localhost:3000/book`.

## Demo accounts

These credentials are seeded into a new local database and are for development only.

| Role | Email | Password |
| --- | --- | --- |
| General Manager | `gm@aura.com` | `admin123` |
| Front Desk | `frontdesk@aura.com` | `front123` |
| Housekeeping | `house@aura.com` | `house123` |
| Finance | `finance@aura.com` | `fin123` |

## Architecture

```text
React 18 + TypeScript + Tailwind CSS
                |
     Cloudflare Worker static assets
                |
          Supabase Edge Function
       /          |          |            \
 public IBE    hotel/ERP   workflow     platform API
  + quotes      + GL      durable events  audit/webhooks
       \          |          |            /
       NexusERP Supabase PostgreSQL
          (`nexushos` schema)
```

**Two backend implementations of the same API exist side by side.** `server/`
(Express + PostgreSQL) is the **local development and test backend only** —
it is what `npm run dev` and `npm test` exercise, and it is not deployed
anywhere. `supabase/functions/nexushos-api/` (Deno) is the **only backend
that serves production traffic** at `www.nexushos.com`; it is deployed
independently through `deploy-supabase.yml` and is not started by `npm run
dev`. The two reimplement overlapping business logic (rooms, reservations,
admin user management, public booking) in different languages, so a rule
change made in one is not automatically reflected in the other — when
changing anything under "Demo operating policies" below, check whether the
same change is needed in `supabase/functions/nexushos-api/index.ts` before
assuming a passing `npm test` run covers production behavior.

- `src/` contains the Vite client, API wrapper, screens, and shared types.
- `supabase/functions/nexushos-api/` is the production API used by
  `www.nexushos.com`. It authenticates Supabase access tokens and scopes every
  hotel-owned query to the caller's property membership.
- `supabase/migrations/` is the production database migration history. Tenant
  tables use mandatory `property_id` foreign keys and per-property uniqueness.
- `server/index.js` (local dev/test only) wires secure sessions, throttling, authentication evidence, fail-closed production configuration, durable delivery workers, and the modular hotel, ERP, AI, booking, portfolio, workflow, administration, developer, and platform route groups.
- `server/db.js` (local dev/test only) initializes versioned hotel tables in an isolated PostgreSQL schema. Set `NEXUSHOS_DATABASE_URL` to the Supabase Session-pooler URI and keep `NEXUSHOS_DB_SCHEMA=nexushos` so ERP tables with similar names cannot collide.
- `server/security.js`, `server/audit.js`, and `server/webhooks.js` (local dev/test only) provide request IDs, response hardening, persistent rate-limit buckets, an HMAC-chained append-only audit log, encrypted webhook secrets, signed delivery, expiring worker leases, retries, and SSRF controls.
- `server/inventory.js` (local dev/test only) accounts for reservations and active group holds by room type and stay date, so public quotes, final booking, and group contracting share one transactional availability model.
- `server/routes/booking.js` (local dev/test only) owns public availability, server-authoritative 15-minute quotes, transactional booking, and idempotent confirmation.
- `server/routes/workflows.js` (local dev/test only) owns versioned automations, risk-based approvals, immutable run evidence, task execution, and a leased transactional event outbox.
- `server/routes/admin.js` (local dev/test only) provides General-Manager-only user lifecycle, property memberships, session revocation, and forced temporary-password rotation. `server/routes/developer.js` publishes the OpenAPI 3.1 contract and live integration readiness.
- The property business date uses `Europe/Copenhagen` by default in the local dev backend; set `HMS_TIME_ZONE` to another IANA time-zone name when running a property elsewhere. The production Edge Function instead derives the business date per-property from `properties.timezone`.
- Copy `.env.example` into the runtime secret/configuration system when preparing a deployment. Production rejects absent, weak, placeholder, or reused audit, webhook-encryption, and rate-limit secrets; it also requires exact HTTPS CORS origins.
- `test/` starts isolated PostgreSQL-compatible PGlite databases. Its integration suite covers browser and bearer sessions, authentication evidence, throttling, production bootstrap safety, administrator controls, OpenAPI discovery, public booking and replay safety, group inventory, event/outbox crash recovery, webhook leases, portfolio workflows, approval gates, audit-chain verification, role redaction, reservations, settlement, accounting, procurement, and Night Audit idempotency. A separate `test/supabase.migrations.test.mjs` applies the production migrations and exercises production-only SQL functions directly — this is the only automated coverage of the Supabase-specific code path, since the Deno Edge Function itself has no local integration test runner wired up.

The AI Operations workspace always provides a transparent rules-based briefing from aggregate live property data. When the optional server-side `OPENAI_API_KEY` is configured, it also uses the OpenAI Responses API for structured briefings and broader natural-language analysis. Model context is role-scoped, excludes guest personal data, and never directly performs a database write; operational commands require an explicit review-and-approve step. Revenue calculations and action execution remain deterministic and auditable.

## Demo operating policies

These policies describe the local development backend (`server/`) in full;
the production Edge Function implements the same reservation, folio, and
booking rules but currently authenticates with Supabase Auth bearer tokens
rather than the `HttpOnly` session cookie described below, and does not yet
implement the workflow/webhook/audit-chain items — see "Current limitations".

- Cancellations are accepted before the arrival business date and fully reverse the local folio. From the arrival date onward, an unarrived confirmed booking uses **Mark No-Show**; the demo's no-penalty policy also reverses the folio and releases inventory.
- Early departures retain the full contracted room and tax total. Checkout posts every unposted contract night, recognizes future-night contract charges on the current business date, and records `actualCheckOut` separately so operational departure counts do not recur on the former scheduled date.
- Advance deposits are evaluated against projected contracted room charges, so they are not shown or accepted as refundable credit before the room contract is posted.
- General-ledger balances are shown as of the property business date; future-dated estimates remain available in the journal but do not affect current dashboard balances.
- POS requests from the dashboard carry an idempotency key, so a safe retry cannot create a second room, folio, or GL charge.
- Maintenance dispatch uses the same safe-retry pattern, and receiving a purchase order posts Inventory/AP double-entry alongside the stock update.
- The public booking engine never trusts a browser-supplied price. It persists a short-lived quote, rechecks inventory inside the booking transaction, records the tax estimate, emits a signed-event outbox record, and creates a follow-up task through the workflow engine.
- High- and critical-risk workflows cannot bypass manager approval. Every run keeps its template snapshot, policy decision, idempotency key, task output, and immutable evidence.
- Browser authentication uses a `HttpOnly`, `SameSite=Strict` session cookie. Bearer tokens remain available for test and future integration clients but are no longer written to browser storage.
- New and reset accounts must replace their temporary password before any operational route is available. Disabled users lose active sessions immediately, and all authentication outcomes are added to the signed audit chain without storing credentials or raw network identifiers.
- Tentative and definite groups consume dated room-type inventory. Released and cancelled groups restore it; stale public quotes and overlapping group contracts are rejected transactionally.
- Reservation and safety triggers commit to a durable outbox with the business change. Workflow and webhook workers use expiring ownership leases, bounded exponential retries, crash reclamation, and stable idempotency identifiers.

## First production administrator

Public demo identities are never created when `NODE_ENV=production`, and the API refuses to start against a production database with no administrator. For a new database, supply the one-use `NEXUSHOS_BOOTSTRAP_*` values shown in `.env.example` through the deployment secret manager, run:

```bash
NODE_ENV=production npm run bootstrap:admin
```

The command creates one organization, one property shell, and one active General Manager without printing the password. First login requires rotation; remove the bootstrap inputs from the runtime environment immediately afterward. It deliberately does not invent saleable rooms or rates—those still require an approved migration/configuration process before opening inventory.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the API and Vite together; either process stopping also stops the other. |
| `npm run dev:client` | Start only Vite (useful when the API is already running). |
| `npm run server` | Start only the API. |
| `npm test` | Run isolated API integration tests with Node's built-in test runner. |
| `npm run build` | Type-check the client and create a production bundle in `dist/`. |
| `npm run preview` | Serve the built client locally. |
| `npm run backup` | Create a PostgreSQL custom-format archive of the NexusHOS schema with `pg_dump`. |
| `npm run backup:verify -- /path/to/backup.dump` | Validate a PostgreSQL archive and its checksum manifest with `pg_restore`. |
| `npm run migrate:sqlite -- --source=/path/to/hms.db` | Copy a legacy SQLite database into an empty NexusHOS PostgreSQL schema. |
| `NODE_ENV=production npm run bootstrap:admin` | One-time creation of the first production property and General Manager from secret-managed inputs. |

GitHub Actions runs the production build, isolated API suite, migration test,
and Supabase Edge Function type-check on every pull request and push to `main`.

## Production deployment

The frontend and backend are separate deployment targets:

- Cloudflare automatically builds and deploys the frontend after a successful
  push to `main`, using `npm run build` and `npx wrangler deploy`.
- The Supabase database migrations and `nexushos-api` Edge Function deploy
  through `.github/workflows/deploy-supabase.yml`. Configure the GitHub
  repository variable `SUPABASE_PROJECT_REF` and the production-environment
  secrets `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` once. Until those
  values exist, the backend deployment job intentionally remains skipped.
- Keep public buyer self-registration disabled until Turnstile and the buyer
  lifecycle are operational. Enabling it requires Edge Function secrets
  `NEXUSHOS_SELF_SERVICE_SIGNUP_ENABLED=true`, `TURNSTILE_SECRET_KEY`, and a
  strong random `NEXUSHOS_RATE_LIMIT_PEPPER`.

Before accepting a paying customer, also verify the hosted Supabase Auth
settings: direct email signup disabled, 12-character strong passwords, secure
password changes enabled, production SMTP configured, and the correct Site URL.
The checked-in `supabase/config.toml` applies these defaults to local stacks but
does not silently change every hosted Auth setting.

## Current limitations

- Tenant isolation is implemented in the migration and Edge Function, but it is
  effective in production only after both are deployed by the Supabase workflow.
- PostgreSQL persistence and a baseline migration ledger are implemented. The current compatibility adapter preserves the original synchronous route contracts through a worker-owned database connection; a later scalability pass should convert route handlers to native asynchronous queries and add a distributed worker tier, high availability, observability, and restore drills.
- Passwords, secure cookie sessions, throttling, account administration, forced password rotation, session revocation, fixed roles, audit evidence, and integration scopes are implemented. Invitation/recovery delivery, MFA/passkeys, SSO/SAML/OIDC, SCIM, configurable permissions, retention controls, and compliance evidence automation remain.
- Direct booking is a real pay-at-property reservation flow, not a card-payment flow. Tokenization, 3DS/SCA, authorization/capture/refunds, terminals, virtual cards, payouts, disputes, and PCI-isolated provider integration require a payment provider and merchant credentials.
- Signed webhooks, crash-recoverable delivery, and an OpenAPI/event portal exist, but OTA/channel, SiteMinder, review publication, messaging, digital key, BMS/IoT, accounting, tax/fiscal, and email providers are not connected. Channel sync and guest portal screens remain clearly labeled demonstrations.
- Groups are persisted room-block contracts, not a complete MICE product. Rooming lists, function-space inventory, BEOs, sales pipeline, concessions, deposits, routing, commissions, and displacement analysis remain.
- Reputation responses are stored and approved but not externally published. ESG actions are queued but deliberately do not claim device execution without a BMS connector.
- Workflow templates run manually or from durable reservation and safety events; the production API enables a continuous leased processor by default. A distributed queue/worker tier and broader domain trigger coverage remain necessary for high-availability automation.
- Revenue recommendations remain transparent deterministic rules. External demand/compset feeds, statistical forecasting, backtesting, confidence intervals, guarded rate publishing, group displacement, and profit optimization remain future work.
- The local `npm run dev` launcher intentionally uses ports 3000 and 4000, matching the Vite proxy configuration.

The staged path from this release to competitive parity is tracked in [`PRODUCT_ROADMAP.md`](./PRODUCT_ROADMAP.md).
