import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  addMonths,
  checkCanClose,
  closeSheet,
  istDate,
  monthEnd,
  monthOf,
  monthsFrom,
  placeEntry,
  settlePlan,
  shareText,
  sheetName,
  type Entry,
  type Participant,
  type SheetRef,
} from './hisaab.ts'

const p = (memberId: string, seq: number, extra: Partial<Participant> = {}): Participant => ({
  memberId,
  seq,
  exception: 'none',
  exceptionPaise: 0,
  weight: 100,
  ...extra,
})
const bill = (paidBy: string | null, amountPaise: number, category = 'Healthcare'): Entry => ({
  type: 'bill',
  amountPaise,
  category,
  paidBy,
  to: null,
})
const R = (n: number) => n * 100 // rupees → paise, test readability only

const four = [p('ramesh', 1), p('suresh', 2), p('mahesh', 3), p('dinesh', 4)]

describe('closeSheet: S7 worked examples', () => {
  it('no-pool fixture: Ramesh Fixed ₹8,000', () => {
    const result = closeSheet(
      [p('ramesh', 1, { exception: 'fixed', exceptionPaise: R(8000) }), ...four.slice(1)],
      [bill('ramesh', R(9500)), bill('suresh', R(7000)), bill('mahesh', R(2500)), bill('dinesh', R(1000))],
    )
    if (!result.ok) throw new Error(result.reason)
    expect(result.dividablePaise).toBe(R(20_000))
    expect(result.members.map((m) => m.obligationPaise)).toEqual([R(8000), R(4000), R(4000), R(4000)])
    expect(result.members.map((m) => m.netPaise)).toEqual([R(1500), R(3000), R(-1500), R(-3000)])
    expect(result.transfers).toEqual([
      { from: 'dinesh', to: 'suresh', amountPaise: R(3000) },
      { from: 'mahesh', to: 'ramesh', amountPaise: R(1500) },
    ])
  })

  it('Fixed ₹8,000 of ₹20,000: the other three pay ₹4,000 each', () => {
    const result = closeSheet([p('a', 1, { exception: 'fixed', exceptionPaise: R(8000) }), p('b', 2), p('c', 3), p('d', 4)], [
      bill('a', R(20_000)),
    ])
    if (!result.ok) throw new Error(result.reason)
    expect(result.members.map((m) => m.obligationPaise)).toEqual([R(8000), R(4000), R(4000), R(4000)])
  })

  it('₹8,000 extra of ₹20,000: everyone has ₹3,000 of the remainder, A owes ₹11,000', () => {
    const result = closeSheet([p('a', 1, { exception: 'extra', exceptionPaise: R(8000) }), p('b', 2), p('c', 3), p('d', 4)], [
      bill('b', R(20_000)),
    ])
    if (!result.ok) throw new Error(result.reason)
    expect(result.members.map((m) => m.obligationPaise)).toEqual([R(11_000), R(3000), R(3000), R(3000)])
  })

  it('the remainder paisa goes by member seq, not by list position', () => {
    const result = closeSheet([p('late', 9), p('early', 1), p('mid', 5)], [bill('late', R(100))])
    if (!result.ok) throw new Error(result.reason)
    const byId = Object.fromEntries(result.members.map((m) => [m.memberId, m.obligationPaise]))
    expect(byId).toEqual({ early: 3334, mid: 3333, late: 3333 })
  })

  it('skip pays nothing; outside-the-split bills are in the total but not divided', () => {
    const result = closeSheet([p('a', 1), p('b', 2, { exception: 'skip' })], [bill('a', R(600)), bill(null, R(400), 'Food')])
    if (!result.ok) throw new Error(result.reason)
    expect(result.totalPaise).toBe(R(1000))
    expect(result.dividablePaise).toBe(R(600))
    expect(result.categories).toEqual({ Healthcare: R(600), Food: R(400) })
    expect(result.members.map((m) => m.obligationPaise)).toEqual([R(600), 0])
    expect(result.transfers).toEqual([])
  })

  it('refunds reduce the dividable total; money given moves nets but is not spend', () => {
    const result = closeSheet(
      [p('a', 1), p('b', 2)],
      [
        bill('a', R(1000)),
        { type: 'refund', amountPaise: R(200), category: 'Healthcare', paidBy: null, to: 'a' },
        { type: 'money_given', amountPaise: R(300), category: null, paidBy: 'b', to: 'a' },
      ],
    )
    if (!result.ok) throw new Error(result.reason)
    expect(result.dividablePaise).toBe(R(800))
    expect(result.members.map((m) => m.obligationPaise)).toEqual([R(400), R(400)])
    // a: paid 1000, got refund 200, received 300 → 1000 − 200 − 300 − 400 = +100
    expect(result.members.map((m) => m.netPaise)).toEqual([R(100), R(-100)])
    expect(result.transfers).toEqual([{ from: 'b', to: 'a', amountPaise: R(100) }])
  })

  it('zero-activity sheet closes with no transfers', () => {
    const result = closeSheet(four, [])
    expect(result.ok && result.transfers).toEqual([])
  })

  it('all skipped with nothing to divide is fine', () => {
    const result = closeSheet([p('a', 1, { exception: 'skip' })], [])
    expect(result.ok).toBe(true)
  })
})

describe('closeSheet: blocked reasons', () => {
  it('fixed + extra more than the dividable total', () => {
    const result = closeSheet([p('a', 1, { exception: 'fixed', exceptionPaise: R(600) }), p('b', 2, { exception: 'extra', exceptionPaise: R(500) })], [
      bill('a', R(1000)),
    ])
    expect(result).toEqual({ ok: false, reason: 'exceptions_too_big' })
  })

  it('remainder left and nobody to share it', () => {
    const result = closeSheet([p('a', 1, { exception: 'fixed', exceptionPaise: R(100) }), p('b', 2, { exception: 'skip' })], [
      bill('a', R(1000)),
    ])
    expect(result).toEqual({ ok: false, reason: 'nobody_shares' })
  })

  it('negative dividable total (refunds bigger than bills)', () => {
    const result = closeSheet(four, [{ type: 'refund', amountPaise: R(10), category: 'Food', paidBy: null, to: 'ramesh' }])
    expect(result).toEqual({ ok: false, reason: 'negative_total' })
  })
})

describe('settlePlan', () => {
  it('largest debtor pays largest creditor; ties keep input order', () => {
    expect(
      settlePlan([
        { memberId: 'a', netPaise: 50 },
        { memberId: 'b', netPaise: 50 },
        { memberId: 'c', netPaise: -100 },
      ]),
    ).toEqual([
      { from: 'c', to: 'a', amountPaise: 50 },
      { from: 'c', to: 'b', amountPaise: 50 },
    ])
  })

  it('refuses nets that do not sum to zero', () => {
    expect(() => settlePlan([{ memberId: 'a', netPaise: 1 }])).toThrow()
  })
})

describe('S7 invariants (property test)', () => {
  const sheetArb = fc
    .integer({ min: 1, max: 8 })
    .chain((n) =>
      fc.record({
        participants: fc.tuple(
          ...Array.from({ length: n }, (_, i) =>
            fc.record({
              memberId: fc.constant(`m${i}`),
              seq: fc.constant(n - i), // reverse order so seq ≠ list position
              exception: fc.constantFrom('none', 'none', 'fixed', 'extra', 'skip') as fc.Arbitrary<Participant['exception']>,
              exceptionPaise: fc.integer({ min: 0, max: 50_000_00 }),
              weight: fc.constant(100),
            }),
          ),
        ),
        entries: fc.array(
          fc.record({
            type: fc.constantFrom('bill', 'bill', 'bill', 'refund', 'money_given') as fc.Arbitrary<Entry['type']>,
            amountPaise: fc.integer({ min: 1, max: 100_000_00 }),
            payer: fc.integer({ min: -1, max: n - 1 }),
            to: fc.integer({ min: 0, max: n - 1 }),
          }),
          { maxLength: 40 },
        ),
      }),
    )
    .map(({ participants, entries }) => ({
      participants,
      entries: entries.map((e): Entry => {
        const payer = e.payer < 0 ? null : `m${e.payer}`
        if (e.type === 'bill') return { type: 'bill', amountPaise: e.amountPaise, category: 'Other', paidBy: payer, to: null }
        if (e.type === 'refund') return { type: 'refund', amountPaise: e.amountPaise, category: 'Other', paidBy: null, to: `m${e.to}` }
        return { type: 'money_given', amountPaise: e.amountPaise, category: null, paidBy: payer ?? 'm0', to: `m${e.to}` }
      }),
    }))

  it('obligations sum to the dividable total, nets sum to 0, the plan clears every net', () => {
    let closed = 0
    fc.assert(
      fc.property(sheetArb, ({ participants, entries }) => {
        const result = closeSheet(participants, entries)
        if (!result.ok) return
        closed++
        const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
        expect(sum(result.members.map((m) => m.obligationPaise))).toBe(result.dividablePaise)
        expect(sum(result.members.map((m) => m.netPaise))).toBe(0)
        expect(result.transfers.length).toBeLessThanOrEqual(Math.max(0, participants.length - 1))
        const left = new Map(result.members.map((m) => [m.memberId, m.netPaise]))
        for (const t of result.transfers) {
          expect(t.amountPaise).toBeGreaterThan(0)
          expect(t.from).not.toBe(t.to)
          left.set(t.from, left.get(t.from)! + t.amountPaise)
          left.set(t.to, left.get(t.to)! - t.amountPaise)
        }
        expect([...left.values()].every((v) => v === 0)).toBe(true)
        for (const m of result.members) {
          const part = participants.find((x) => x.memberId === m.memberId)!
          if (part.exception === 'skip') expect(m.obligationPaise).toBe(0)
          if (part.exception === 'fixed') expect(m.obligationPaise).toBe(part.exceptionPaise)
          if (part.exception === 'extra') expect(m.obligationPaise).toBeGreaterThanOrEqual(part.exceptionPaise)
        }
      }),
      { numRuns: 500 },
    )
    expect(closed).toBeGreaterThan(100) // the generator must reach the interesting path
  })
})

describe('dates (IST calendar, D = 1)', () => {
  it('month helpers', () => {
    expect(monthOf('2026-09-17')).toBe('2026-09-01')
    expect(addMonths('2026-12-01', 1)).toBe('2027-01-01')
    expect(addMonths('2026-01-01', -1)).toBe('2025-12-01')
    expect(monthEnd('2028-02-01')).toBe('2028-02-29')
    expect(monthEnd('2026-02-01')).toBe('2026-02-28')
    expect(monthEnd('2026-12-01')).toBe('2026-12-31')
    expect(monthsFrom('2026-11-01', '2027-02-10')).toEqual(['2026-11-01', '2026-12-01', '2027-01-01', '2027-02-01'])
    expect(sheetName('2026-09-01')).toBe('September 2026')
  })

  it('istDate uses Asia/Kolkata, not the server clock zone', () => {
    expect(istDate(new Date('2026-09-30T18:29:59Z'))).toBe('2026-09-30')
    expect(istDate(new Date('2026-09-30T18:30:00Z'))).toBe('2026-10-01')
  })
})

describe('placeEntry (S6)', () => {
  const sheets: SheetRef[] = [
    { id: 'aug', startDate: '2026-08-01', endDate: '2026-08-31', state: 'cleared' },
    { id: 'sep', startDate: '2026-09-01', endDate: '2026-09-30', state: 'open' },
    { id: 'oct', startDate: '2026-10-01', endDate: '2026-10-31', state: 'open' },
  ]
  const at = (date: string, today = '2026-10-03', s = sheets) => placeEntry({ date, today, sheets: s })

  it('goes to its own sheet when that sheet is open', () => {
    expect(at('2026-09-28')).toEqual({ ok: true, sheetId: 'sep', late: false })
    expect(at('2026-10-03')).toEqual({ ok: true, sheetId: 'oct', late: false })
  })

  it('a date in a closed sheet goes to the latest open sheet, marked late', () => {
    expect(at('2026-08-15')).toEqual({ ok: true, sheetId: 'oct', late: true })
  })

  it('no open sheet left: open the month after the latest sheet', () => {
    const allClosed = sheets.map((s) => ({ ...s, state: 'closed' as const }))
    expect(at('2026-10-31', '2026-10-31', allClosed)).toEqual({ ok: true, sheetId: null, late: true })
  })

  it('rejects future dates and dates before the first sheet', () => {
    expect(at('2026-10-04')).toEqual({ ok: false, reason: 'future' })
    expect(at('2026-07-31')).toEqual({ ok: false, reason: 'before_start' })
  })
})

describe('checkCanClose (S6, S7)', () => {
  const sheets: SheetRef[] = [
    { id: 'aug', startDate: '2026-08-01', endDate: '2026-08-31', state: 'open' },
    { id: 'sep', startDate: '2026-09-01', endDate: '2026-09-30', state: 'open' },
  ]
  it('needs the last day reached and every earlier sheet closed', () => {
    expect(checkCanClose('sep', sheets, '2026-09-29')).toBe('too_early')
    expect(checkCanClose('sep', sheets, '2026-09-30')).toBe('earlier_open')
    expect(checkCanClose('aug', sheets, '2026-09-30')).toBeNull()
    expect(checkCanClose('sep', [{ ...sheets[0]!, state: 'closed' }, sheets[1]!], '2026-10-01')).toBeNull()
    expect(checkCanClose('sep', [sheets[0]!, { ...sheets[1]!, state: 'closed' }], '2026-10-01')).toBe('not_open')
  })
})

describe('shareText (S10)', () => {
  it('lists total, categories, each member and the payments, in plain English', () => {
    const result = closeSheet(
      [p('ramesh', 1, { exception: 'fixed', exceptionPaise: R(8000) }), ...four.slice(1)],
      [bill('ramesh', R(9500)), bill('suresh', R(7000), 'Food'), bill('mahesh', R(2500)), bill('dinesh', R(1000))],
    )
    if (!result.ok) throw new Error(result.reason)
    const names = { ramesh: 'Ramesh', suresh: 'Suresh', mahesh: 'Mahesh', dinesh: 'Dinesh' }
    expect(shareText({ hisaabName: 'Family', sheetName: 'September 2026', result, names, link: 'https://x/s/abc' })).toBe(
      [
        'Family – September 2026',
        'Total: ₹20,000',
        'Healthcare ₹13,000 · Food ₹7,000',
        '',
        'Ramesh paid ₹9,500, share ₹8,000',
        'Suresh paid ₹7,000, share ₹4,000',
        'Mahesh paid ₹2,500, share ₹4,000',
        'Dinesh paid ₹1,000, share ₹4,000',
        '',
        'To settle:',
        'Dinesh pays Suresh ₹3,000',
        'Mahesh pays Ramesh ₹1,500',
        '',
        'Full statement: https://x/s/abc',
      ].join('\n'),
    )
  })
})
