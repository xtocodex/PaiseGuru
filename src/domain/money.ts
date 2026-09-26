// Money is integer paise everywhere (S1). This module is the only place that turns paise into text and back.

export const MAX_ENTRY_PAISE = 1_000_000_000 // ₹1,00,00,000
export const MAX_ENTRIES_PER_SHEET = 5_000
export const MAX_MEMBERS = 100
export const ONE_SHARE = 100 // weights are hundredths of a share

/**
 * Split `totalPaise` by integer `weights` (S2). Index order is the tie-break order
 * (payer first, then member seq), so callers pass participants already sorted.
 * share = floor(total × w / Σw); leftover paise go one each by largest (total × w) mod Σw.
 */
export function allocate(totalPaise: number, weights: readonly number[]): number[] {
  if (!Number.isSafeInteger(totalPaise) || totalPaise < 0) throw new RangeError(`bad total ${totalPaise}`)
  if (weights.some((w) => !Number.isSafeInteger(w) || w <= 0)) throw new RangeError('weights must be positive integers')
  if (weights.length === 0) {
    if (totalPaise === 0) return []
    throw new RangeError('nobody to split between')
  }
  const total = BigInt(totalPaise)
  const sumW = weights.reduce((s, w) => s + BigInt(w), 0n)
  const parts = weights.map((w, i) => {
    const product = total * BigInt(w)
    return { i, share: product / sumW, rem: product % sumW }
  })
  let leftover = total - parts.reduce((s, p) => s + p.share, 0n)
  const byRemainder = [...parts].sort((a, b) => (a.rem === b.rem ? a.i - b.i : a.rem > b.rem ? -1 : 1))
  for (const p of byRemainder) {
    if (leftover === 0n) break
    p.share += 1n
    leftover -= 1n
  }
  return parts.map((p) => Number(p.share))
}

const rupeeGroups = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })

/** ₹20,000 · ₹33.34 · -₹300 (Indian grouping, .00 hidden). Exact: no float division. */
export function formatRupees(paise: number): string {
  const abs = Math.abs(paise)
  const rupees = Math.trunc(abs / 100)
  const rest = abs % 100
  const text = `₹${rupeeGroups.format(rupees)}${rest ? `.${String(rest).padStart(2, '0')}` : ''}`
  return paise < 0 ? `-${text}` : text
}

const RUPEE_TEXT = /^\s*(?:₹|rs\.?|inr)?\s*(\d[\d,]*)(?:\.(\d{1,2}))?\s*$/i

/** "1,250.50" → 125050. Returns null for anything that is not a clean amount within the entry bound. */
export function parseRupees(text: string): number | null {
  const m = RUPEE_TEXT.exec(text)
  if (!m) return null
  const whole = m[1]!.replaceAll(',', '')
  if (whole.length > 10) return null
  const paise = Number(whole) * 100 + Number((m[2] ?? '').padEnd(2, '0'))
  return paise <= MAX_ENTRY_PAISE ? paise : null
}
