# PaiseGuru

A split-first money app for Indian families and friend groups. Its main feature is **Hisaab**: bills pile up all month, then get divided at month-end with per-member exceptions and settled in the fewest UPI payments.

PaiseGuru is a product of **xtocodex**, founded by [Gopal Mohapatra](https://gopalmohapatra.in).

The design and every money rule are in [docs/designs/paiseguru-mvp.md](docs/designs/paiseguru-mvp.md). The old Next.js app is kept at tag `v1-legacy` for reference only.

## Setup

Needs Node 24+ and pnpm.

```sh
pnpm install
cp .env.example .env    # fill in the values
pnpm db:migrate
pnpm dev                # app on http://localhost:5173, API on :3000
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
| `pnpm deploy:vercel` | build and deploy to Vercel production (run `pnpm db:migrate` against production first when there are new migrations) |
| `pnpm user:create <id> "<Full Name>"` | create a sign-in account (prints a password once); point `DATABASE_URL` at the right database |
| `pnpm user:password <id> <new-password>` | set a new password for an account |

## Production

- Hosting: Vercel project `paiseguru` (team xtocodexs-projects). The React app is served from Vercel's CDN; the Hono server runs as one Node function in Singapore (`sin1`). `scripts/build-vercel.ts` writes the ready-made deployment.
- Database: Neon database `paiseguru_prod` (pooled URL in the Vercel `DATABASE_URL` setting).
- Settings on Vercel: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (https://paiseguru.gopalmohapatra.in), `TRUSTED_ORIGINS` (https://paiseguru.vercel.app), `NODE_ENV=production`.
- Deploys must come from commits authored by the Vercel account email (this repo uses `xtocodex@gmail.com`).
