# TODOS

## v2 follow-ups (issue #2, after launch)

### Google sign-in credentials (founder)
**What:** Google Cloud console → OAuth client (Web). Redirect URI `https://paiseguru.gopalmohapatra.in/api/auth/callback/google` (dev: `http://localhost:5180/api/auth/callback/google`). Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` on Vercel and redeploy. The sign-in page shows "Continue with Google" once both are set.
**Priority:** P1

### Check UPI pay on real phones
**What:** On the live site, tap Pay (Android) and the GPay / PhonePe / Paytm buttons (iPhone) on a suggested payment. Record whether the amount is filled, blocked or warned. QR and "Copy UPI ID + amount" are the fallbacks that already ship.
**Priority:** P1

### Forgot password by email
**What:** Pick a mail service (Resend free tier suggested), then turn on better-auth password reset and email verification. Until then the admin resets with `pnpm user:password <email> <new-password>`.
**Priority:** P1 before inviting strangers at scale

### Privacy page and DPDP notice
**What:** Plain-English page: what PaiseGuru stores, who sees it, how to delete an account. DPDP Rules duties apply from about May 2027.
**Priority:** P1

### Revisit error reporting
**What:** Browser errors are invisible (decision ef00621d, marker at the Hono error handler). Add reporting with PII scrubbing when the first bug report cannot be explained from logs.
**Priority:** P2

### Phase 2 candidates (from the research)
1:1 friend expenses and a friend view across groups; recurring expenses; comments and edit history; search and CSV export; itemized splits and food-delivery import; Hindi and Hinglish UI; offline entry; WhatsApp OTP sign-in; paging past 300 expenses or payments per group (marked `shortcut:` in routes).
**Priority:** P2

### Uptime ping
**What:** A free uptime monitor on `/health` (checks the database too).
**Priority:** P2

## Completed

- v2 (2026-10-23, issue #2): groups that settle as you go or monthly, per-expense splits (equal, amounts, shares, percent, fixed/extra) with several payers, stable settle plan, Sent → Got it payments with QR and per-app iPhone buttons, funds, open sign-up. Clean database; phase-1 data in Neon branch `backup-pre-v2-2026-10-23`.

- App redesign v2 live (2026-09-27): installable PWA (manifest, icons, service worker, offline shell), design system from docs/designs/v2, all screens rebuilt, Activity tab, change password, appearance.

- Live on Vercel at https://paiseguru.gopalmohapatra.in (DNS A record at BigRock, 2026-09-27).

- Build phase 1, T1–T6 (2026-09-27, branch `rebuild`): scaffold; money and Hisaab domain with S2/S7 fixtures and invariant property test; Drizzle schema and better-auth wiring; Hono API with authz, sheet versions, close snapshot, reopen, payments, statement page; client pages; Playwright e2e (4 flows) and CI workflow.
