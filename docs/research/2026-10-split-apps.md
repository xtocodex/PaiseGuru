# Research: how split apps track money (2026-10-23)

Input for the PaiseGuru v2 spec (Splitwise-style splitting plus the existing monthly Hisaab). Four parallel research passes: Splitwise, competitors, open-source money models, India/UPI. Claims marked "unverified" had no primary source.

## 1. Split methods in the market

| Method | Who has it | Notes |
|---|---|---|
| Equal, untick to exclude | everyone | Splitwise sentence UI: "Paid by [you] and split [equally]", each part tappable |
| Exact amounts | Splitwise, Spliit, SplitPro, Paytm, Tricount | must sum to total |
| Percent | Splitwise, Spliit, Splitser, Paytm | Kittysplit dropped percent for weights: users found percent hard |
| Shares / weights | Splitwise, Tricount, Settle Up, Kittysplit, Paytm | Kittysplit: a household is one participant with a headcount (2.5 allowed) as default weight |
| Adjustment (+/- on one person, rest equal) | Splitwise, SplitMyExpenses | same idea as PaiseGuru "₹X extra" |
| Itemized (+ proportional tax/tip) | Splitwise (Pro on mobile), Settle Up, Splitkaro | Splitkaro imports Swiggy/Zomato/Blinkit/Zepto orders; Splitwise "Itemize" (2026-10-16) lets guests claim items by QR, no account |
| Multiple payers | Splitwise, Settle Up, Splid | none of the 4 OSS apps (Spliit, SplitPro, IHateMoney, Cospend) |
| Default split per group | Splitwise (Pro), Splitser | |

Rounding: Splitwise gives the extra cent to a random person (2013 support reply; users complain). Spliit: floor + largest remainder, ties rotated by a hash of the expense id. SplitPro: leftover to non-payers in a seeded shuffle. PaiseGuru `allocate()`: floor + largest remainder, payer first then member order (deterministic, explainable).

## 2. Balance models (open-source code read)

- All four OSS apps derive balances at read time from expenses + shares + payments. SplitPro replaced its stored `Balance`/`GroupBalance` tables with a SQL view (migration `20251108122842_add_balance_view`).
- SplitPro `ExpenseParticipant.amount` is a signed net per person (rows sum to 0): a double-entry journal per expense.
- Spliit `ExpensePaidFor{expenseId, participantId, shares}`; settlements are expenses with `isReimbursement=true`. Spliit recomputes shares at read time, so a rounding-code change alters history. Storing `owed_paise` at write time avoids that.
- Spliit's schema cascades member delete to their expenses. IHateMoney/Cospend deactivate members who have bills instead of deleting.
- Splitwise: per-group ledgers plus a "non-group expenses" group; the friend view nets across groups. "Settle all" with a friend auto-creates balancing entries in every group, which do not update when the payment is edited (a known confusion).
- Multi-currency: best practice is convert at entry and freeze (keep original amount, currency, rate). Splitwise Pro conversion rewrites settled expenses; IHateMoney re-converts on currency change.

## 3. Debt simplification

- Minimum transfers is NP-hard; any instance settles in at most k−1 transfers (k = people with non-zero net). Exact subset methods are practical only for about k ≤ 15–20 (estimate).
- Greedy largest-debtor-to-largest-creditor (≤ k−1): IHateMoney, Cospend, SplitPro (only when `simplifyDebts` is on), PaiseGuru today.
- Spliit pairs in participant-id order so paying one suggestion does not reshuffle the rest.
- Splitwise rules: nets unchanged; nobody owes more in total; group simplification may route you to someone you did not owe. It was on by default in 2013, then turned off by default "as it can cause confusion" and over "differing levels of trust". Turning it off after payments can require money to be re-sent.

## 4. Settle-up and payments in India

- NPCI ended P2P collect requests on 1 Oct 2025 (circular UPI-OC-No-220-FY-2025-26). Intent links and QR remain.
- No official source confirms GPay/PhonePe/Paytm honour a pre-filled P2P `upi://pay` amount; anecdotal GPay "For security reasons…" blocks exist. iOS needs per-app schemes (`tez`, `phonepe`, `paytmmp`, `credpay`, `bhim`). Test on real phones.
- A web app cannot get payment confirmation without a payment aggregator. Marking paid stays manual.
- Splitwise has no UPI settle-up (Paytm wallet integration only, status unverified). Paytm Split Bills (Jul 2026) and GPay split exist but are payment-app-locked; GPay pays only the creator.
- UPI Circle (full delegation ≤ ₹15,000/month, BHIM live 2025-11-25) fits parents and teens.
- OkCredit and Khatabook win on one-tap WhatsApp/SMS reminders with a pay link, and Hinglish/regional languages.

## 5. Market gaps

- Splitwise free tier: "up to 4 expenses each day" (official, undated); reports of 3/day with 10 s cooldown (2023) and 2/day (2026-08 review). Pro ₹149/month. Trustpilot 2.0/5.
- No app found has a pooled fund or kitty (Tricount, Settle Up, Splid, Spliit, Splitser, Kittysplit checked). Cino does it with an EU virtual card.
- Guests without sign-up: Spliit and Kittysplit (link + "who am I"), Splid (9-character code), Tricount (view-only), Settle Up (browser view).
- Offline entry: Tricount, Settle Up, Splid, Splitser.

## 6. Sign-in costs (India, per OTP)

WhatsApp authentication template about ₹0.12 (rate card 2026-07-01); MSG91 SMS ₹0.16–0.25 + 18% GST, DLT registration needed; Twilio about ₹7; Google free. DPDP Rules notified Nov 2025; most duties apply from about 13 May 2027 (notice, erasure, breach reporting, 1-year logs).

## Key sources

- https://kb.splitwise.com/balances-and-expenses/what-are-different-ways-i-can-split-an-expense
- https://kb.splitwise.com/balances-and-expenses/what-is-simplify-debts
- https://blog.splitwise.com/2012/09/14/debts-made-simple/
- https://kb.splitwise.com/pro/what-is-splitwise-pro
- https://raw.githubusercontent.com/spliit-app/spliit/main/prisma/schema.prisma
- https://raw.githubusercontent.com/spliit-app/spliit/main/src/lib/balances.ts
- https://raw.githubusercontent.com/oss-apps/split-pro/main/prisma/schema.prisma
- https://blog.kittysplit.com/families-and-couples-with-shared-expenses/
- https://www.medianama.com/2025/08/223-npci-p2p-collect-payments-oct-1-what-it-means/
- https://developers.google.com/pay/india/api/android/in-app-payments
- https://paytm.com/blog/bill-payments/paytm-split-bills/
- https://apps.apple.com/in/app/splitkaro/id1573115695
- https://www.authgear.com/post/whatsapp-api-pricing
