# TODOS

## Build phase gates (from /plan-ceo-review D7)
Every feature in `docs/designs/paiseguru-mvp.md` is in scope. A build phase starts only when its gate is met. Tick the gate and date it when it is met.

### Gate 1: Notebook replay matches (before the family uses the app)
**What:** Replay the last 2 months of the family hisaab notebook using the S7 formula (in the app or a spreadsheet).
**Why:** Proves the Hisaab math matches what the family actually does. Changed by eng review D2: phase 1 is built now, and this gate must pass before the family starts using the app.
**Context:** See "The Assignment" in the design doc. Record any case the formula cannot express. The two months become the first Hisaab fixtures (anonymized).
**Effort:** S
**Priority:** P1
**Depends on:** None
- [ ] Met on: ____

### Gate 2: Family closes one real month in the app
**What:** The family runs one full month (e.g. October, closed on 1 Nov) in PaiseGuru after phase 1 ships.
**Why:** Starts phase 2 (pool, carry, weights, cycle day, one-time, recurring). Build first the extensions the family or the 2 other households asked for.
**Effort:** S
**Priority:** P1
**Depends on:** Gate 1, phase 1 shipped
- [ ] Met on: ____ · Extensions requested: ____

### Gate 3: 6 or more friends said yes
**What:** At least 6 friends from the Assignment agree to try split-as-we-go groups for 30 days.
**Why:** Starts phase 3 (split-as-we-go groups, settle-up, budget).
**Effort:** S
**Priority:** P2
**Depends on:** None
- [ ] Met on: ____ · Yes count: ____

### Gate 4: 20+ manual entries a week
**What:** Users in phases 1–3 add at least 20 entries a week by hand.
**Why:** Starts phase 4 (SMS capture, bill photos, bill scan): manual entry is the pain these remove.
**Effort:** S
**Priority:** P2
**Depends on:** Phases 1–3 in use
- [ ] Met on: ____

### Gate 5: A Hisaab with 3 closed months
**What:** At least one Hisaab has 3 closed months.
**Why:** Starts phase 5 (Year view, CSV, PWA polish).
**Effort:** S
**Priority:** P3
**Depends on:** Gate 2
- [ ] Met on: ____

## Before the family uses phase 1

### T7: Notebook replay fixture (founder)
**What:** Add the 2 anonymized notebook months as a test in `src/domain/hisaab.test.ts`, written like the "no-pool fixture" test there (participants with their exceptions, one bill per payment, expected shares and payments). Then `pnpm test`.
**Why:** Gate 1. Proves the S7 formula matches what the family really did.
**Effort:** S · **Priority:** P1

### Set up Google sign-in (better-auth)
**What:** Google Cloud console → OAuth client (Web). Authorized redirect URI: `<BETTER_AUTH_URL>/api/auth/callback/google` (dev: `http://localhost:5180/api/auth/callback/google`). Put `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`. The sign-in page shows the Google button once both are set.
**Production:** `NODE_ENV=production`, no `DEV_LOGIN`, a new `BETTER_AUTH_SECRET` (`openssl rand -base64 32`), `BETTER_AUTH_URL` = the public https URL. Changing the secret turns off every invite and statement link.
**Effort:** S · **Priority:** P1

### Finish the custom domain
**What:** At BigRock (DNS for gopalmohapatra.in) add `A` record `paiseguru` → `76.76.21.21`. Vercel then issues HTTPS for https://paiseguru.gopalmohapatra.in. Until then use https://paiseguru.vercel.app. Deployed 2026-09-27 on Vercel.
**Effort:** S · **Priority:** P1

### Uptime ping
**What:** A free uptime monitor on `/health` (checks the database too).
**Effort:** S · **Priority:** P2

### Check UPI links on real phones (CEO T1)
**What:** On a deployed https URL, tap "Pay with UPI" on a month's payment from GPay, PhonePe and Paytm (Android and iPhone). Record whether the amount is filled, blocked or warned. "Copy UPI ID + amount" is the fallback that already ships.
**Effort:** S · **Priority:** P1

### Confirm CI is green
**What:** Push branch `rebuild` and check the GitHub Actions run (Postgres 18 service, typecheck, unit + integration, e2e). Not yet run on GitHub.
**Effort:** S · **Priority:** P1

## Phase 1 follow-ups

### Save QR image for payments (S8)
**What:** "Save QR image" next to "Copy UPI ID + amount" on each payment. Skipped in phase 1; add if the UPI link check shows apps block P2P links.
**Effort:** S · **Priority:** P2

### Design review of the phase 1 screens
**What:** Run /design-review on the running app (390 px). Screens use plain Tailwind; shadcn/ui components were not needed yet.
**Effort:** S · **Priority:** P2

### Faster local tests
**What:** Integration tests take ~4 minutes against Neon (network latency per query). A Neon branch closer to India or a local Postgres for `TEST_DATABASE_URL` makes them take seconds. CI already uses a local Postgres service.
**Effort:** S · **Priority:** P3

## Before inviting people outside the family

### Privacy page
**What:** A plain-English page stating what PaiseGuru stores, what is sent to the AI, and how to delete an account.
**Why:** DPDP Act expectations and user trust (bill photos can be medical).
**Context:** CEO review Section 3. Account deletion is specified in spec S3.
**Effort:** S
**Priority:** P1
**Depends on:** None

### Revisit error reporting
**What:** Reconsider browser and server error reporting (e.g. Sentry with PII scrubbing: no bodies, notes, SMS or amounts).
**Why:** Eng review D7 chose logs only, so browser-side errors are invisible until a user reports them.
**Context:** Decision ef00621d; code marker `gstack-shortcut(dec-ef00621d)` at the Hono error handler. Trigger: before inviting non-family users, or the first bug report the logs cannot explain.
**Effort:** S
**Priority:** P2
**Depends on:** None

## Completed

- Build phase 1, T1–T6 (2026-09-27, branch `rebuild`): scaffold; money and Hisaab domain with S2/S7 fixtures and invariant property test; Drizzle schema and better-auth wiring; Hono API with authz, sheet versions, close snapshot, reopen, payments, statement page; client pages; Playwright e2e (4 flows) and CI workflow.
