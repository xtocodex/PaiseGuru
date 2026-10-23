// Group money rules (v2, issue #2): one split function for expenses and the month close, derived nets,
// a stable settle plan, month placement. Pure: no DB, no clock, no randomness.
import { allocate, formatRupees } from './money.ts'

export const CATEGORIES = [
  'Food', 'Groceries', 'Housing', 'Household help', 'Utilities', 'Transport', 'Travel', 'Shopping', 'Entertainment',
  'Healthcare', 'Education', 'Personal care', 'Insurance', 'Gifts', 'Bills', 'Family support', 'Shared', 'Other',
] as const
export type Category = (typeof CATEGORIES)[number]

export type ISODate = string // 'YYYY-MM-DD', a calendar day in IST
export type SettleMode = 'as_you_go' | 'monthly'
export type SheetState = 'open' | 'closed'
export type Exception = 'none' | 'fixed' | 'extra' | 'skip'
export type SplitMode = 'equal' | 'exact' | 'shares' | 'percent' | 'adjust'

export const PERCENT_TOTAL = 10_000 // percent splits are basis points

export interface Participant {
  memberId: string
  seq: number // tie-break order (member row creation order)
  exception: Exception
  exceptionPaise: number
  weight: number // hundredths of a share, or basis points in percent mode
}

export interface Transfer {
  from: string
  to: string
  amountPaise: number
}

export type SplitBlocked = 'negative_total' | 'exceptions_too_big' | 'nobody_shares'

export const SPLIT_BLOCKED_TEXT: Record<SplitBlocked, string> = {
  negative_total: 'Refunds are more than the bills this month.',
  exceptions_too_big: 'Fixed and extra amounts add up to more than the total.',
  nobody_shares: 'Nobody is left to share the rest. Remove a "Fixed" or "Skip".',
}

/**
 * Divide `amountPaise`: Fixed people pay exactly their amount, Extra people pay their amount plus a share
 * of the rest, everyone else shares the rest by weight, Skip pays nothing. Leftover paise go by largest
 * remainder; ties go to `first` (payers, biggest first), then member seq.
 */
export function splitAmount(
  amountPaise: number,
  participants: readonly Participant[],
  first: readonly string[] = [],
): { ok: true; owed: Map<string, number> } | { ok: false; reason: SplitBlocked } {
  if (amountPaise < 0) return { ok: false, reason: 'negative_total' }
  const reserved = participants.reduce((s, p) => s + (p.exception === 'fixed' || p.exception === 'extra' ? p.exceptionPaise : 0), 0)
  if (reserved > amountPaise) return { ok: false, reason: 'exceptions_too_big' }
  const remainder = amountPaise - reserved
  const rank = (id: string) => {
    const i = first.indexOf(id)
    return i === -1 ? first.length : i
  }
  const sharers = participants
    .filter((p) => p.exception === 'none' || p.exception === 'extra')
    .sort((a, b) => rank(a.memberId) - rank(b.memberId) || a.seq - b.seq)
  if (remainder > 0 && sharers.length === 0) return { ok: false, reason: 'nobody_shares' }

  const shares = allocate(remainder, sharers.map((p) => p.weight))
  const owed = new Map(participants.map((p) => [p.memberId, p.exception === 'fixed' ? p.exceptionPaise : 0]))
  sharers.forEach((p, i) => owed.set(p.memberId, (p.exception === 'extra' ? p.exceptionPaise : 0) + shares[i]!))
  return { ok: true, owed }
}

export interface SplitInput {
  memberId: string
  exception?: 'none' | 'fixed' | 'extra'
  exceptionPaise?: number
  weight?: number
}

export interface ShareRow {
  memberId: string
  exception: 'none' | 'fixed' | 'extra'
  exceptionPaise: number
  weight: number
  owedPaise: number
}

/**
 * One expense's split. `people` are the participants (unticked people are simply absent), `seqOf` gives
 * member order, `payers` are who paid, biggest first for the leftover paisa.
 */
export function buildShares(input: {
  mode: SplitMode
  amountPaise: number
  people: readonly SplitInput[]
  seqOf: (memberId: string) => number
  payers: readonly { memberId: string; paidPaise: number }[]
}): { ok: true; shares: ShareRow[] } | { ok: false; message: string } {
  const { mode, amountPaise, people } = input
  if (!people.length) return { ok: false, message: 'Pick at least one person to split with.' }
  if (new Set(people.map((p) => p.memberId)).size !== people.length) return { ok: false, message: 'A person is in the split twice.' }

  const rows = people.map((p): Omit<ShareRow, 'owedPaise'> => {
    switch (mode) {
      case 'equal':
        return { memberId: p.memberId, exception: 'none', exceptionPaise: 0, weight: 100 }
      case 'shares':
      case 'percent':
        return { memberId: p.memberId, exception: 'none', exceptionPaise: 0, weight: p.weight ?? 0 }
      case 'exact':
        return { memberId: p.memberId, exception: 'fixed', exceptionPaise: p.exceptionPaise ?? 0, weight: 100 }
      case 'adjust': {
        const exception = p.exception ?? 'none'
        return { memberId: p.memberId, exception, exceptionPaise: exception === 'none' ? 0 : (p.exceptionPaise ?? 0), weight: 100 }
      }
    }
  })

  if (mode === 'shares' || mode === 'percent') {
    if (rows.some((r) => !Number.isSafeInteger(r.weight) || r.weight <= 0)) return { ok: false, message: 'Every share must be more than 0.' }
  }
  if (mode === 'percent') {
    const sum = rows.reduce((s, r) => s + r.weight, 0)
    if (sum !== PERCENT_TOTAL) return { ok: false, message: `Percents add up to ${sum / 100}%, not 100%.` }
  }
  if (mode === 'exact') {
    const sum = rows.reduce((s, r) => s + r.exceptionPaise, 0)
    if (sum < amountPaise) return { ok: false, message: `${formatRupees(amountPaise - sum)} left to assign.` }
    if (sum > amountPaise) return { ok: false, message: `${formatRupees(sum - amountPaise)} more than the total.` }
  }

  const first = [...input.payers].sort((a, b) => b.paidPaise - a.paidPaise).map((p) => p.memberId)
  const split = splitAmount(
    amountPaise,
    rows.map((r) => ({ ...r, seq: input.seqOf(r.memberId) })),
    first,
  )
  if (!split.ok) return { ok: false, message: SPLIT_BLOCKED_TEXT[split.reason] }
  return { ok: true, shares: rows.map((r) => ({ ...r, owedPaise: split.owed.get(r.memberId)! })) }
}

// ── Month close (monthly groups) ──

/** A month's entry. Fund-paid expenses have `fundId` and no payers; `fund_in` is money received by a fund. */
export interface SheetEntry {
  kind: 'expense' | 'refund' | 'fund_in'
  amountPaise: number
  category: string | null
  fundId: string | null
  payers: readonly { memberId: string; paidPaise: number }[] // refund: who received it
}

export interface MemberResult {
  memberId: string
  paidPaise: number // bills they paid − refunds they received
  obligationPaise: number
}

/** Everything a close computes. Stored as the sheet snapshot, so its shape is part of the data. */
export interface CloseResult {
  ok: true
  totalPaise: number // every bill − refunds, including fund-paid bills
  dividablePaise: number
  categories: Record<string, number>
  funds: Record<string, { inPaise: number; usedPaise: number }>
  members: MemberResult[]
}

/** Dividable total (member-paid bills − refunds) → obligations by the month's exceptions. */
export function closeSheet(participants: readonly Participant[], entries: readonly SheetEntry[]): CloseResult | { ok: false; reason: SplitBlocked } {
  const ids = new Set(participants.map((p) => p.memberId))
  for (const e of entries) for (const p of e.payers) if (!ids.has(p.memberId)) throw new Error(`entry member ${p.memberId} is not a participant`)

  const paid = new Map(participants.map((p) => [p.memberId, 0]))
  const categories: Record<string, number> = {}
  const funds: CloseResult['funds'] = {}
  let total = 0
  let dividable = 0
  for (const e of entries) {
    if (e.kind === 'fund_in') {
      const f = (funds[e.fundId!] ??= { inPaise: 0, usedPaise: 0 })
      f.inPaise += e.amountPaise
      continue
    }
    const sign = e.kind === 'expense' ? 1 : -1
    const key = e.category ?? 'Other'
    categories[key] = (categories[key] ?? 0) + sign * e.amountPaise
    total += sign * e.amountPaise
    if (e.fundId) {
      const f = (funds[e.fundId] ??= { inPaise: 0, usedPaise: 0 })
      f.usedPaise += e.amountPaise
      continue
    }
    for (const p of e.payers) {
      paid.set(p.memberId, paid.get(p.memberId)! + sign * p.paidPaise)
      dividable += sign * p.paidPaise
    }
  }

  const split = splitAmount(dividable, participants)
  if (!split.ok) return split
  return {
    ok: true,
    totalPaise: total,
    dividablePaise: dividable,
    categories,
    funds,
    members: participants.map((p) => ({ memberId: p.memberId, paidPaise: paid.get(p.memberId)!, obligationPaise: split.owed.get(p.memberId)! })),
  }
}

// ── Balances ──

/** A member's group totals. net = paid − owed + payments sent − payments received; + is owed money. */
export interface MemberTotals {
  memberId: string
  paidPaise: number
  owedPaise: number
  sentPaise: number
  receivedPaise: number
}

export const netOf = (t: MemberTotals) => t.paidPaise - t.owedPaise + t.sentPaise - t.receivedPaise

/**
 * Who pays whom, at most (people with a balance − 1) payments. Debtors and creditors are matched in input
 * (member seq) order, so paying the first suggestion leaves every other suggestion as it was.
 */
export function settlePlan(nets: readonly { memberId: string; netPaise: number }[]): Transfer[] {
  if (nets.reduce((s, n) => s + n.netPaise, 0) !== 0) throw new Error('nets must sum to zero')
  const debtors = nets.filter((n) => n.netPaise < 0).map((n) => ({ id: n.memberId, left: -n.netPaise }))
  const creditors = nets.filter((n) => n.netPaise > 0).map((n) => ({ id: n.memberId, left: n.netPaise }))
  const transfers: Transfer[] = []
  let i = 0
  let j = 0
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i]!
    const c = creditors[j]!
    const amount = Math.min(d.left, c.left)
    transfers.push({ from: d.id, to: c.id, amountPaise: amount })
    d.left -= amount
    c.left -= amount
    if (d.left === 0) i++
    if (c.left === 0) j++
  }
  return transfers
}

// ── Dates. Calendar strings only; Date is used in UTC purely as a day counter, never for "now". ──

const utc = (d: ISODate) => new Date(`${d}T00:00:00Z`)
const iso = (d: Date) => d.toISOString().slice(0, 10)

const istFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' })
/** The IST calendar day of an instant. The server passes `new Date()`; the domain never reads the clock. */
export const istDate = (instant: Date): ISODate => istFormat.format(instant)

export const monthOf = (d: ISODate): ISODate => `${d.slice(0, 7)}-01`

export function addMonths(month: ISODate, n: number): ISODate {
  const d = utc(month)
  d.setUTCMonth(d.getUTCMonth() + n)
  return iso(d)
}

export function monthEnd(month: ISODate): ISODate {
  const d = utc(addMonths(month, 1))
  d.setUTCDate(0)
  return iso(d)
}

/** Every month start from `firstMonth` up to the month containing `until`. */
export function monthsFrom(firstMonth: ISODate, until: ISODate): ISODate[] {
  const out: ISODate[] = []
  for (let m = firstMonth; m <= until; m = addMonths(m, 1)) out.push(m)
  return out
}

const monthName = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })
export const sheetName = (month: ISODate) => monthName.format(utc(month))

const dayName = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })
/** "28 Sep", used for "Late: dated 28 Sep". */
export const shortDate = (d: ISODate) => dayName.format(utc(d))

export interface SheetRef {
  id: string
  startDate: ISODate
  endDate: ISODate
  state: SheetState
}

/**
 * Month placement. `sheetId: null` means no month is open: the caller opens the month after the latest one.
 * The caller must have opened every month up to today's first.
 */
export function placeEntry(input: { date: ISODate; today: ISODate; sheets: readonly SheetRef[] }):
  | { ok: true; sheetId: string | null; late: boolean }
  | { ok: false; reason: 'future' | 'before_start' } {
  const { date, today, sheets } = input
  if (date > today) return { ok: false, reason: 'future' }
  const own = sheets.find((s) => s.startDate <= date && date <= s.endDate)
  if (!own) return { ok: false, reason: 'before_start' }
  if (own.state === 'open') return { ok: true, sheetId: own.id, late: false }
  const latestOpen = sheets.filter((s) => s.state === 'open').sort((a, b) => b.startDate.localeCompare(a.startDate))[0]
  return { ok: true, sheetId: latestOpen?.id ?? null, late: true }
}

export type CloseOrderError = 'not_open' | 'earlier_open'

export const CLOSE_ORDER_TEXT: Record<CloseOrderError, string> = {
  not_open: 'This month is already closed.',
  earlier_open: 'Close the earlier month first.',
}

/** A month can close at any time; older months close first. */
export function checkCanClose(sheetId: string, sheets: readonly SheetRef[]): CloseOrderError | null {
  const sheet = sheets.find((s) => s.id === sheetId)!
  if (sheet.state !== 'open') return 'not_open'
  if (sheets.some((s) => s.startDate < sheet.startDate && s.state === 'open')) return 'earlier_open'
  return null
}

/** WhatsApp message after a close. Short; the full list is at the link. */
export function shareText(input: {
  groupName: string
  sheetName: string
  result: CloseResult
  names: Record<string, string>
  fundNames: Record<string, string>
  plan: readonly Transfer[]
  link: string
}) {
  const { result, names } = input
  const categories = Object.entries(result.categories)
    .filter(([, v]) => v !== 0)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${formatRupees(v)}`)
    .join(' · ')
  const lines = [`${input.groupName} – ${input.sheetName}`, `Total: ${formatRupees(result.totalPaise)}`]
  if (categories) lines.push(categories)
  for (const [id, f] of Object.entries(result.funds)) {
    lines.push(`${input.fundNames[id] ?? 'Fund'}: received ${formatRupees(f.inPaise)}, used ${formatRupees(f.usedPaise)}`)
  }
  lines.push('', ...result.members.map((m) => `${names[m.memberId]} paid ${formatRupees(m.paidPaise)}, share ${formatRupees(m.obligationPaise)}`))
  lines.push('')
  if (input.plan.length) {
    lines.push('To settle:', ...input.plan.map((t) => `${names[t.from]} pays ${names[t.to]} ${formatRupees(t.amountPaise)}`), '')
  } else {
    lines.push('Nothing to settle.', '')
  }
  lines.push(`Full statement: ${input.link}`)
  return lines.join('\n')
}

/** WhatsApp reminder for one suggested payment. */
export function remindText(input: { groupName: string; fromName: string; toName: string; amountPaise: number; upiId: string | null; link: string }) {
  const lines = [`Hi ${input.fromName}, a reminder from ${input.groupName}: please pay ${input.toName} ${formatRupees(input.amountPaise)}.`]
  if (input.upiId) lines.push(`UPI ID: ${input.upiId}`)
  lines.push(input.link)
  return lines.join('\n')
}
