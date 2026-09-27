# PaiseGuru

Rebuild of an old Next.js expense app into a split-first personal finance PWA for Indian families and friend groups. The USP is **Hisaab**: a reusable project where bills pile up all month, then get divided at month-end with per-member exceptions and settled in the fewest UPI payments.

## Source of truth
- `docs/designs/paiseguru-mvp.md` — approved design doc, CEO review and eng review. **Product Spec v1 (sections S1–S18a) is authoritative for every money rule.** Every worked example in S2 and S7 is a required test fixture.
- `docs/designs/mvp-wireframe.png` (+ `.html`) — layout only. The spec wins where they differ.
- `TODOS.md` — build phase gates and follow-ups.
- The old Next.js app is **reference only** (tag `v1-legacy`). Never port its code.

## Stack (decided)
TypeScript, pnpm · React 19 + Vite + Tailwind v4 + shadcn/ui + TanStack Router (file-based) + TanStack Query · Hono on Node (typed client `hc<AppType>`) · better-auth (Google; email+password only when NODE_ENV is test/development, server refuses to boot in production with it on) · Drizzle ORM + Postgres (local Postgres 18 on this machine) · Vitest + Playwright · structured JSON logs only (no Sentry, decision ef00621d).

## Current work: build phase 1 (Hisaab core)
Branch `rebuild`. **Status (2026-09-27): T1–T6 done and committed; T7 and the release steps are in `TODOS.md`** (Google sign-in keys, deploy, UPI link check on phones, first CI run on GitHub). Merge to `main` when phase 1 ships. The build steps are "Implementation Tasks" T1–T7 at the end of the design doc (eng review), in this order:
1. **T1** Tag `main` as `v1-legacy`, create branch `rebuild`, remove the old Next.js files (keep `docs/`, `TODOS.md`, `CLAUDE.md`; rewrite `README.md`), scaffold the new app at the repo root.
2. **T2** `src/domain/money.ts` + `src/domain/hisaab.ts`: pure functions, tests first, all phase-1 fixtures plus a property test for the S7 invariants.
3. **T3** Drizzle schema (eng review Section 1 data model) + better-auth.
4. **T4** Hono routes (eng review Section 1 API list) with authz, version checks, open-on-demand sheets, close snapshot, statement page, share text.
5. **T5** Client pages: Login, Home, New Hisaab, Hisaab, Sheet, Close, Join, Me. Mobile-first (390 px).
6. **T6** Playwright e2e (4 flows) + GitHub Actions CI with a Postgres service.
7. **T7** (founder) Notebook replay fixture must pass before the family uses the app.

Phase 1 excludes: pool, carry, weights other than 1 share, percent mode, cycle day ≠ 1, one-time Hisaab, recurring entries, the daily job, split-as-we-go groups, budget screen, SMS/AI/photos, Year view/CSV, PWA manifest. Their columns exist with defaults so later phases need no destructive migration.

## Code layout (decided, "smaller arrangement")
```
src/domain/money.ts, hisaab.ts (+ tests)   pure: no DB, no clock (take `today` as a parameter), no randomness
src/server/app.ts      Hono app, AppError → HTTP mapping, authz helper, static SPA + /s/:token
src/server/auth.ts     better-auth
src/server/db.ts       Drizzle schema + client
src/server/routes/hisaab.ts, sheet.ts, public.ts
src/shared/schemas.ts  zod, used by server validation and client forms
src/client/            main.tsx, api.ts, routes/ (TanStack file routes)
```
Split a file when it passes ~400 lines.

## Non-negotiable rules
- Money is integer **paise** everywhere (`*Paise` fields, zod-validated, bigint columns). Never `parseFloat` money. `allocate()` uses BigInt internally. Bounds: entry ≤ 10⁹ paise, ≤ 5,000 entries per sheet, ≤ 100 members.
- Balances, nets and spend are **derived**, never stored as running balances. Closed sheets display from `sheet_snapshot`.
- Every sheet mutation (entries, exceptions, close, reopen, transfers, and membership changes that touch Open sheets) bumps `sheet.version` with `UPDATE … WHERE version = $expected` in the same transaction; a stale version is a 409.
- All dates are calendar `date`s in IST (Asia/Kolkata). No server-local-time month math.
- Authz on every route; foreign ids return 404. Former members get read-only access to sheets they took part in.
- Invite and statement tokens: 128-bit random; store only SHA-256 hashes.
- UI copy in plain, easy English. No "equal" labels: show only exceptions.
- Put `gstack-shortcut(dec-ef00621d): browser errors not reported, upgrade before non-family users` at the Hono error handler.

## Commands
`pnpm dev` · `pnpm test` · `pnpm test:e2e` · `pnpm db:migrate` · `pnpm db:generate` · `pnpm build` · `pnpm typecheck`

## Local setup notes
- Database: Neon (`DATABASE_URL`, pooled). Migrations use the direct host automatically. Tests use `TEST_DATABASE_URL` (Neon database `neondb_test`) and truncate it; `tests/helpers.ts` refuses any other database.
- Dev ports: API `PORT=3100`, Vite `DEV_PORT=5180` (3000 and 5173 are used by another project on this machine). e2e serves the built app on 3200.
- Dev login: `DEV_LOGIN=1` with `NODE_ENV=development` shows a test email login. Google appears once `GOOGLE_CLIENT_ID`/`SECRET` are set.
- Server code runs on Node's type stripping (no build step): relative imports need the `.ts` extension; no enums or parameter properties.
- Shared server helpers live in `src/server/core.ts` (errors, clock, authz, sheet locks and versions, opening sheets, tokens); `src/server/routes/me.ts` holds profile, account deletion and Home.
