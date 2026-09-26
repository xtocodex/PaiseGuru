// Hisaab rules (spec S5–S7, phase 1: no pool, no carry, cycle day 1). Pure: no DB, no clock, no randomness.
import { allocate, formatRupees } from './money.ts'

export const CATEGORIES = [
  'Food', 'Groceries', 'Housing', 'Household help', 'Utilities', 'Transport', 'Travel', 'Shopping', 'Entertainment',
  'Healthcare', 'Education', 'Personal care', 'Insurance', 'Gifts', 'Bills', 'Family support', 'Shared', 'Other',
] as const
export type Category = (typeof CATEGORIES)[number]

export type ISODate = string // 'YYYY-MM-DD', a calendar day in IST
export type SheetState = 'open' | 'closed' | 'cleared' | 'carried'
export type Exception = 'none' | 'fixed' | 'extra' | 'skip'

export interface Participant {
  memberId: string
  seq: number // allocation tie-break order (member row creation order)
  exception: Exception
  exceptionPaise: number
  weight: number // hundredths of a share
}

/** bill: paidBy null = outside the split. refund: `to` received it. money_given: paidBy → to. */
export interface Entry {
  type: 'bill' | 'refund' | 'money_given'
  amountPaise: number
  category: string | null
  paidBy: string | null
  to: string | null
}

export interface Transfer {
  from: string
  to: string
  amountPaise: number
}

export interface MemberResult {
  memberId: string
  paidPaise: number // bills they paid
  obligationPaise: number
  netPaise: number // + is owed money, − owes money
}

/** Everything a close computes. Stored as the sheet snapshot (D5), so its shape is part of the data. */
export interface CloseResult {
  ok: true
  totalPaise: number // all bills − refunds, including outside-the-split bills
  dividablePaise: number
  categories: Record<string, number>
  members: MemberResult[]
  transfers: Transfer[]
}

export type CloseBlocked = 'negative_total' | 'exceptions_too_big' | 'nobody_shares'

export const CLOSE_BLOCKED_TEXT: Record<CloseBlocked, string> = {
  negative_total: 'Refunds are more than the bills this month.',
  exceptions_too_big: 'Fixed and extra amounts add up to more than the total.',
  nobody_shares: 'Nobody is left to share the rest. Remove a "Fixed" or "Skip".',
}

/** S7: dividable total → obligations → nets → settle plan. Participants may come in any order. */
export function closeSheet(participants: readonly Participant[], entries: readonly Entry[]): CloseResult | { ok: false; reason: CloseBlocked } {
  const ids = new Set(participants.map((p) => p.memberId))
  for (const e of entries) {
    for (const id of [e.paidBy, e.to]) if (id !== null && !ids.has(id)) throw new Error(`entry member ${id} is not a participant`)
  }

  const dividable = dividableTotal(entries)
  const obligations = computeObligations(dividable, participants)
  if (!obligations.ok) return obligations

  const members = participants.map((p) => {
    let paid = 0
    let net = 0
    for (const e of entries) {
      if (e.type === 'bill' && e.paidBy === p.memberId) (paid += e.amountPaise), (net += e.amountPaise)
      if (e.type === 'refund' && e.to === p.memberId) net -= e.amountPaise
      if (e.type === 'money_given' && e.paidBy === p.memberId) net += e.amountPaise
      if (e.type === 'money_given' && e.to === p.memberId) net -= e.amountPaise
    }
    const obligation = obligations.byMember.get(p.memberId)!
    return { memberId: p.memberId, paidPaise: paid, obligationPaise: obligation, netPaise: net - obligation }
  })

  const categories: Record<string, number> = {}
  let total = 0
  for (const e of entries) {
    const sign = e.type === 'bill' ? 1 : e.type === 'refund' ? -1 : 0
    if (!sign) continue
    const key = e.category ?? 'Other'
    categories[key] = (categories[key] ?? 0) + sign * e.amountPaise
    total += sign * e.amountPaise
  }

  return { ok: true, totalPaise: total, dividablePaise: dividable, categories, members, transfers: settlePlan(members) }
}

/** Bills paid by members − refunds. Outside-the-split bills are excluded. */
export function dividableTotal(entries: readonly Entry[]): number {
  let sum = 0
  for (const e of entries) {
    if (e.type === 'bill' && e.paidBy !== null) sum += e.amountPaise
    if (e.type === 'refund') sum -= e.amountPaise
  }
  return sum
}

function computeObligations(
  dividable: number,
  participants: readonly Participant[],
): { ok: true; byMember: Map<string, number> } | { ok: false; reason: CloseBlocked } {
  if (dividable < 0) return { ok: false, reason: 'negative_total' }
  const reserved = participants.reduce((s, p) => s + (p.exception === 'fixed' || p.exception === 'extra' ? p.exceptionPaise : 0), 0)
  if (reserved > dividable) return { ok: false, reason: 'exceptions_too_big' }
  const remainder = dividable - reserved
  const sharers = participants.filter((p) => p.exception === 'none' || p.exception === 'extra').sort((a, b) => a.seq - b.seq)
  if (remainder > 0 && sharers.length === 0) return { ok: false, reason: 'nobody_shares' }

  const shares = allocate(remainder, sharers.map((p) => p.weight))
  const byMember = new Map(participants.map((p) => [p.memberId, p.exception === 'fixed' ? p.exceptionPaise : 0]))
  sharers.forEach((p, i) => byMember.set(p.memberId, (p.exception === 'extra' ? p.exceptionPaise : 0) + shares[i]!))
  return { ok: true, byMember }
}

/** Greedy: largest debtor pays largest creditor until every net is zero. Ties keep input order. */
export function settlePlan(nets: readonly { memberId: string; netPaise: number }[]): Transfer[] {
  if (nets.reduce((s, n) => s + n.netPaise, 0) !== 0) throw new Error('nets must sum to zero')
  const left = nets.map((n) => ({ ...n }))
  const transfers: Transfer[] = []
  for (;;) {
    let creditor = left[0]
    let debtor = left[0]
    for (const n of left) {
      if (n.netPaise > creditor!.netPaise) creditor = n
      if (n.netPaise < debtor!.netPaise) debtor = n
    }
    if (!creditor || creditor.netPaise === 0) return transfers
    const amount = Math.min(creditor.netPaise, -debtor!.netPaise)
    transfers.push({ from: debtor!.memberId, to: creditor.memberId, amountPaise: amount })
    creditor.netPaise -= amount
    debtor!.netPaise += amount
  }
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
  endDate: ISODate | null // null: one-time Hisaab (phase 2)
  state: SheetState
}

/**
 * S6 placement. `sheetId: null` means no sheet is open: the caller opens the month after the latest sheet.
 * The caller must have opened every sheet up to today's month first.
 */
export function placeEntry(input: { date: ISODate; today: ISODate; sheets: readonly SheetRef[] }):
  | { ok: true; sheetId: string | null; late: boolean }
  | { ok: false; reason: 'future' | 'before_start' } {
  const { date, today, sheets } = input
  if (date > today) return { ok: false, reason: 'future' }
  const own = sheets.find((s) => s.startDate <= date && (s.endDate === null || date <= s.endDate))
  if (!own) return { ok: false, reason: 'before_start' }
  if (own.state === 'open') return { ok: true, sheetId: own.id, late: false }
  const latestOpen = sheets.filter((s) => s.state === 'open').sort((a, b) => b.startDate.localeCompare(a.startDate))[0]
  return { ok: true, sheetId: latestOpen?.id ?? null, late: true }
}

export type CloseOrderError = 'not_open' | 'too_early' | 'earlier_open'

export const CLOSE_ORDER_TEXT: Record<CloseOrderError, string> = {
  not_open: 'This month is already closed.',
  too_early: 'You can close this month on its last day or later.',
  earlier_open: 'Close the earlier month first.',
}

export function checkCanClose(sheetId: string, sheets: readonly SheetRef[], today: ISODate): CloseOrderError | null {
  const sheet = sheets.find((s) => s.id === sheetId)!
  if (sheet.state !== 'open') return 'not_open'
  if (sheet.endDate !== null && today < sheet.endDate) return 'too_early'
  if (sheets.some((s) => s.startDate < sheet.startDate && s.state === 'open')) return 'earlier_open'
  return null
}

/** S10 WhatsApp message after a close. Short; the full list is at the link. */
export function shareText(input: { hisaabName: string; sheetName: string; result: CloseResult; names: Record<string, string>; link: string }) {
  const { result, names } = input
  const categories = Object.entries(result.categories)
    .filter(([, v]) => v !== 0)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${formatRupees(v)}`)
    .join(' · ')
  const lines = [`${input.hisaabName} – ${input.sheetName}`, `Total: ${formatRupees(result.totalPaise)}`]
  if (categories) lines.push(categories)
  lines.push('', ...result.members.map((m) => `${names[m.memberId]} paid ${formatRupees(m.paidPaise)}, share ${formatRupees(m.obligationPaise)}`))
  lines.push('')
  if (result.transfers.length) {
    lines.push('To settle:', ...result.transfers.map((t) => `${names[t.from]} pays ${names[t.to]} ${formatRupees(t.amountPaise)}`), '')
  } else {
    lines.push('Nothing to settle.', '')
  }
  lines.push(`Full statement: ${input.link}`)
  return lines.join('\n')
}
