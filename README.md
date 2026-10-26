# PaiseGuru

Split bills with friends, flatmates, trips and family, settled in the fewest UPI payments. Every group settles one of two ways:

- **As you go**: each expense is split when it is added (equally, by amounts, shares, percent, or with a fixed or extra amount for someone; one or more payers). Settle up any time.
- **Once a month**: bills pile up all month and are divided at month end, with Fixed, Extra or Skip per person.

Both use one rule: a member's balance is what they paid − what they owe + payments sent − payments received, always worked out from the stored rows. Payments are recorded by a tap (Sent, then Got it from the receiver). A **fund** holds money for the group (a parent's pension, a trip kitty) and pays bills without changing anyone's balance.

PaiseGuru is a product of **xtocodex**, founded by [Gopal Mohapatra](https://gopalmohapatra.in).

The v2 plan is issue [#2](https://github.com/xtocodex/PaiseGuru/issues/2); research behind it is in [docs/research/2026-10-split-apps.md](docs/research/2026-10-split-apps.md). The phase-1 design is in [docs/designs/paiseguru-mvp.md](docs/designs/paiseguru-mvp.md). The old Next.js app is kept at tag `v1-legacy` for reference only.

## Setup

Needs Node 24+ and pnpm.

```sh
pnpm install
cp .env.example .env    # fill in the values
pnpm db:migrate
pnpm dev                # app on http://localhost:$DEV_PORT, API on :$PORT
```

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | API server (auto-restart) + Vite dev server |
| `pnpm test` | unit and integration tests (uses `TEST_DATABASE_URL`) |
| `pnpm test:e2e` | Playwright end-to-end tests |
| `pnpm db:generate` | make a migration after changing the schema |
| `pnpm db:migrate` | apply migrations |
| `pnpm build` / `pnpm start` | production build / run |
| `pnpm deploy:vercel` | manual emergency deploy to Vercel production (normally a merge to `main` deploys; run `pnpm db:migrate` against production first when there are new migrations) |
| `pnpm user:password <email> <new-password>` | set a new password for an account (there is no forgot-password email yet); point `DATABASE_URL` at the right database |

## Shipping

1. Branch from `main`, commit, push, open a pull request.
2. CI (`.github/workflows/ci.yml`) runs typecheck, unit + integration tests and e2e. `main` is protected: it changes only through a PR whose `test` check passed.
3. Merge. The `deploy` job then applies new migrations to the production database, builds, and deploys to Vercel production, then checks `/health`.

Secrets live in the GitHub `Production` environment: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `PROD_DATABASE_URL`. The old Next.js app is in tag `v1-legacy` and branch `legacy-v1`.

## Production

- Hosting: Vercel project `paiseguru` (team xtocodexs-projects). The React app is served from Vercel's CDN; the Hono server runs as one Node function in Singapore (`sin1`). `scripts/build-vercel.ts` writes the ready-made deployment.
- Database: Neon database `paiseguru_prod` (pooled URL in the Vercel `DATABASE_URL` setting).
- Settings on Vercel: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (https://paiseguru.xtocodex.in), `TRUSTED_ORIGINS` (https://paiseguru.vercel.app), `NODE_ENV=production`.
- Sign-in: anyone can sign up with email + password. Google appears once `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set (redirect URI `https://paiseguru.xtocodex.in/api/auth/callback/google`). Emails are not verified, so Google never joins an existing password account.
- The v2 launch (2026-10-23) started from an empty database; the phase-1 data is kept in Neon branch `backup-pre-v2-2026-10-23`.
- Vercel Hobby blocks deploys whose git commit author is not a team member. CI deploys from a folder without git data, so merges deploy fine; a manual `pnpm deploy:vercel` from a local checkout needs commits authored as `xtocodex@gmail.com`.
