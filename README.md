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
