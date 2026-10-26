# PaiseGuru

Split-first money PWA for India: friends, flatmates, trips, couples and families. Every **group** settles one of two ways: **as you go** (each expense split when added, Splitwise-style) or **monthly** (bills divided at month end with Fixed / Extra / Skip per person, the original "Hisaab"). Settled in the fewest UPI payments.

## Source of truth
- Issue #2 (v2 epic) — the current model and decisions D1–D6. `docs/research/2026-10-split-apps.md` — why.
- `docs/designs/paiseguru-mvp.md` — the phase-1 design. Its S2 rounding and S7 close rules still hold; its Hisaab-only data model and "For" person are replaced by v2.
- `TODOS.md` — follow-ups.
- The old Next.js app is **reference only** (tag `v1-legacy`). Never port its code.

## Stack (decided)
TypeScript, pnpm · React 19 + Vite + Tailwind v4 + shadcn/ui + TanStack Router (file-based) + TanStack Query · Hono on Node (typed client `hc<AppType>`) · better-auth (email + password with open sign-up and email verification, plus Google) · Resend for mail · Drizzle ORM + Postgres (local Postgres 18 on this machine) · Vitest + Playwright · structured JSON logs only (no Sentry, decision ef00621d).

## Current work: v2 (issue #2)
Default branch `main` (protected: PR + green `test` check; a merge deploys production via the CI `deploy` job). v2 launched 2026-10-23 on a clean database (phase-1 data in Neon branch `backup-pre-v2-2026-10-23`). Live at https://paiseguru.xtocodex.in (old https://paiseguru.gopalmohapatra.in redirects there). Out of scope for now: 1:1 friends, friend view, recurring, comments, search, CSV, multi-currency, itemized splits, offline entry, Hindi, guest links, phone OTP, carry to next month.

## Code layout (decided, "smaller arrangement")
```
src/domain/money.ts, group.ts (+ tests)    pure: no DB, no clock (take `today` as a parameter), no randomness
src/server/app.ts      Hono app, AppError → HTTP mapping, static SPA + /s/:token
src/server/auth.ts     better-auth (email + password open sign-up with verification and reset, Google linked by verified email)
src/server/mail.ts     Resend sender + one-button mail template; dev/test keep mail in `outbox`
src/server/db.ts       Drizzle schema + client
src/server/routes/group.ts (groups, members, join, funds), expense.ts (expenses, months, close), payment.ts (balances, payments), me.ts, public.ts
src/shared/schemas.ts  zod, used by server validation and client forms
src/client/            main.tsx, api.ts, routes/ (TanStack file routes)
```
Split a file when it passes ~400 lines.

## Non-negotiable rules
- Money is integer **paise** everywhere (`*Paise` fields, zod-validated, bigint columns). Never `parseFloat` money. `allocate()` uses BigInt internally. Bounds: entry ≤ 10⁹ paise, ≤ 5,000 entries per sheet, ≤ 100 members.
- Balances are **derived**: `net = paid − owed + payments sent − payments received` (`groupBalances` in routes/payment.ts). Refunds count with the opposite sign; `split_mode='sheet'` expenses count only once their month is closed; fund money never counts. Σ net = 0 always.
- `expense_share.owed_paise` is computed once at write (`buildShares`); never recompute history. Month close writes a `sheet_close` expense (shares = obligations) plus `sheet_snapshot`; reopen soft-deletes it. Payments are separate rows and are never touched by close/reopen.
- Every group write takes `lockGroup` (row lock). Month mutations bump `sheet.version`; expense edits check `expense.version`; a stale version is a 409.
- All dates are calendar `date`s in IST (Asia/Kolkata). No server-local-time month math.
- Authz on every route; foreign ids return 404. Former members get read-only access to sheets they took part in.
- Invite and statement tokens: 128-bit random; store only SHA-256 hashes.
- UI copy in plain, easy English. No "equal" labels: show only exceptions.
- Keep the `gstack-shortcut(dec-ef00621d)` marker at the Hono error handler (browser errors are not reported).

## Commands
`pnpm dev` · `pnpm test` · `pnpm test:e2e` · `pnpm db:migrate` · `pnpm db:generate` · `pnpm build` · `pnpm typecheck`

## Local setup notes
- Database: Neon (`DATABASE_URL`, pooled). Migrations use the direct host automatically. Tests use `TEST_DATABASE_URL` (Neon database `neondb_test`) and truncate it; `tests/helpers.ts` refuses any other database.
- Dev ports: API `PORT=3100`, Vite `DEV_PORT=5180` (3000 and 5173 are used by another project on this machine). e2e serves the built app on 3200.
- Sign-up is open everywhere (email + password). Google appears once `GOOGLE_CLIENT_ID`/`SECRET` are set.
- Server code runs on Node's type stripping (no build step): relative imports need the `.ts` extension; no enums or parameter properties.
- Shared server helpers live in `src/server/core.ts` (errors, clock, authz, group lock, month versions, opening months, tokens); `src/server/routes/me.ts` holds profile, account deletion, Activity and Home.
- Commits that get deployed must be authored as `Gopal Mohapatra <xtocodex@gmail.com>` (Vercel Hobby rule).
