# TODOS

## v2 follow-ups (issue #2, after launch)

### Check UPI pay on real phones
**What:** On the live site, tap Pay (Android) and the GPay / PhonePe / Paytm buttons (iPhone) on a suggested payment. Record whether the amount is filled, blocked or warned. QR and "Copy UPI ID + amount" are the fallbacks that already ship.
**Priority:** P1

### DPDP review of /privacy
**What:** `/privacy` is live (plain statement, not lawyer-reviewed). Review it against the DPDP Rules before about May 2027 (notice, erasure, breach reporting).
**Priority:** P2

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

- Google sign-in live (2026-10-23): OAuth client "PaiseGuru web" in Google Cloud project `xtocodex-org`, app published (In production), keys on Vercel; `/privacy` page added for the consent screen.

- v2 (2026-10-23, issue #2): groups that settle as you go or monthly, per-expense splits (equal, amounts, shares, percent, fixed/extra) with several payers, stable settle plan, Sent → Got it payments with QR and per-app iPhone buttons, funds, open sign-up. Clean database; phase-1 data in Neon branch `backup-pre-v2-2026-10-23`.

- App redesign v2 live (2026-09-27): installable PWA (manifest, icons, service worker, offline shell), design system from docs/designs/v2, all screens rebuilt, Activity tab, change password, appearance.

- Live on Vercel at https://paiseguru.gopalmohapatra.in (DNS A record at BigRock, 2026-09-27).
- Branded emails (2026-10-26): one template (wordmark, heading, steps, button, support footer) for all mails; new welcome (names groups an invite already joined), password changed (reset or Me), Google sign-in added. Replies go to support@xtocodex.in.
- Email invites (2026-10-26): any member adds a person with an email; they get a mail with the group's invite link and join as that name once they verify the email (link, or Google). 20 invite mails per person per day.
- Account mail (2026-10-26): Resend on paiseguru.xtocodex.in; sign-up email verification (accounts before it marked verified, migration 0001), forgot password by email, Google links into the account with the same verified email.
- Moved to https://paiseguru.xtocodex.in (2026-10-26). The old paiseguru.gopalmohapatra.in host stays on Vercel and redirects there, so links sent before the move keep working.

- Build phase 1, T1–T6 (2026-09-27, branch `rebuild`): scaffold; money and Hisaab domain with S2/S7 fixtures and invariant property test; Drizzle schema and better-auth wiring; Hono API with authz, sheet versions, close snapshot, reopen, payments, statement page; client pages; Playwright e2e (4 flows) and CI workflow.
