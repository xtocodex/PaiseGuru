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
