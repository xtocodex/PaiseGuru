import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  addMonths,
  buildShares,
  checkCanClose,
  closeSheet,
  istDate,
  monthEnd,
  monthOf,
  monthsFrom,
  netOf,
  placeEntry,
  remindText,
  settlePlan,
  shareText,
  sheetName,
  type Participant,
  type SheetEntry,
  type SheetRef,
  type SplitInput,
  type SplitMode,
} from './group.ts'

const p = (memberId: string, seq: number, extra: Partial<Participant> = {}): Participant => ({
  memberId,
  seq,
  exception: 'none',
  exceptionPaise: 0,
  weight: 100,
  ...extra,
})
const bill = (paidBy: string, amountPaise: number, category = 'Healthcare'): SheetEntry => ({
  kind: 'expense',
  amountPaise,
  category,
  fundId: null,
  payers: [{ memberId: paidBy, paidPaise: amountPaise }],
})
const R = (n: number) => n * 100 // rupees → paise, test readability only
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const seqOf = (id: string) => Number(id.replace(/\D/g, '')) || 0

const four = [p('ramesh', 1), p('suresh', 2), p('mahesh', 3), p('dinesh', 4)]

// protects=each split mode's owed amounts; fails_when=a mode ignores its inputs or rounds to the wrong person;
// no_claim=server validation of member ids (covered in src/server/expense.test.ts)
describe('buildShares: one expense', () => {
  const split = (mode: SplitMode, amountPaise: number, people: SplitInput[], payer = 'm1') =>
    buildShares({ mode, amountPaise, people, seqOf, payers: [{ memberId: payer, paidPaise: amountPaise }] })
  const owed = (r: ReturnType<typeof split>) => (r.ok ? r.shares.map((s) => s.owedPaise) : r.message)

  it('equal: ₹100 among 3, the payer gets the extra paisa', () => {
    expect(owed(split('equal', R(100), [{ memberId: 'm1' }, { memberId: 'm2' }, { memberId: 'm3' }], 'm2'))).toEqual([3333, 3334, 3333])
  })

  it('shares 2:1:1 of ₹1,000 → ₹500 / ₹250 / ₹250', () => {
    const r = split('shares', R(1000), [{ memberId: 'm1', weight: 200 }, { memberId: 'm2', weight: 100 }, { memberId: 'm3', weight: 100 }])
    expect(owed(r)).toEqual([R(500), R(250), R(250)])
  })

  it('percent must total 100%', () => {
    expect(owed(split('percent', R(1000), [{ memberId: 'm1', weight: 6000 }, { memberId: 'm2', weight: 4000 }]))).toEqual([R(600), R(400)])
    expect(owed(split('percent', R(1000), [{ memberId: 'm1', weight: 6000 }, { memberId: 'm2', weight: 3000 }]))).toBe('Percents add up to 90%, not 100%.')
  })

  it('exact must match the total, and says what is left', () => {
    expect(owed(split('exact', R(1000), [{ memberId: 'm1', exceptionPaise: R(700) }, { memberId: 'm2', exceptionPaise: R(300) }]))).toEqual([R(700), R(300)])
    expect(owed(split('exact', R(1000), [{ memberId: 'm1', exceptionPaise: R(700) }, { memberId: 'm2', exceptionPaise: R(200) }]))).toBe('₹100 left to assign.')
    expect(owed(split('exact', R(1000), [{ memberId: 'm1', exceptionPaise: R(900) }, { memberId: 'm2', exceptionPaise: R(200) }]))).toBe('₹100 more than the total.')
  })

  it('adjust: Fixed and ₹X extra on one expense, the rest equal', () => {
    const r = split('adjust', R(1000), [
      { memberId: 'm1', exception: 'fixed', exceptionPaise: R(400) },
      { memberId: 'm2', exception: 'extra', exceptionPaise: R(200) },
      { memberId: 'm3' },
    ])
    expect(owed(r)).toEqual([R(400), R(400), R(200)])
  })

  it('refuses an empty split, duplicates and zero shares', () => {
    expect(owed(split('equal', R(1), []))).toBe('Pick at least one person to split with.')
    expect(owed(split('equal', R(1), [{ memberId: 'm1' }, { memberId: 'm1' }]))).toBe('A person is in the split twice.')
    expect(owed(split('shares', R(1), [{ memberId: 'm1', weight: 0 }]))).toBe('Every share must be more than 0.')
  })

  it('every mode: owed sums exactly to the amount (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000_00 }),
        fc.integer({ min: 1, max: 12 }),
        fc.constantFrom<SplitMode>('equal', 'shares'),
        (amount, n, mode) => {
          const people = Array.from({ length: n }, (_, i) => ({ memberId: `m${i + 1}`, weight: 50 + i * 37 }))
          const r = split(mode, amount, people)
          if (!r.ok) throw new Error(r.message)
          expect(sum(r.shares.map((s) => s.owedPaise))).toBe(amount)
        },
      ),
    )
  })
})

// protects=the month-close obligations (Fixed/Extra/Skip) and fund handling;
// fails_when=fund money or refunds leak into the members' split; no_claim=how the server stores the result
describe('closeSheet: month close', () => {
  it('Fixed ₹8,000 of ₹20,000: the other three pay ₹4,000 each', () => {
    const result = closeSheet(
      [p('ramesh', 1, { exception: 'fixed', exceptionPaise: R(8000) }), ...four.slice(1)],
      [bill('ramesh', R(9500)), bill('suresh', R(7000)), bill('mahesh', R(2500)), bill('dinesh', R(1000))],
    )
    if (!result.ok) throw new Error(result.reason)
    expect(result.dividablePaise).toBe(R(20_000))
    expect(result.members.map((m) => m.obligationPaise)).toEqual([R(8000), R(4000), R(4000), R(4000)])
    expect(result.members.map((m) => m.paidPaise)).toEqual([R(9500), R(7000), R(2500), R(1000)])
  })

  it('₹8,000 extra of ₹20,000: everyone has ₹3,000 of the remainder, A owes ₹11,000', () => {
    const result = closeSheet([p('a', 1, { exception: 'extra', exceptionPaise: R(8000) }), p('b', 2), p('c', 3), p('d', 4)], [bill('b', R(20_000))])
    if (!result.ok) throw new Error(result.reason)
    expect(result.members.map((m) => m.obligationPaise)).toEqual([R(11_000), R(3000), R(3000), R(3000)])
  })

  it('the remainder paisa goes by member seq, not by list position', () => {
    const result = closeSheet([p('late', 9), p('early', 1), p('mid', 5)], [bill('late', R(100))])
    if (!result.ok) throw new Error(result.reason)
    expect(Object.fromEntries(result.members.map((m) => [m.memberId, m.obligationPaise]))).toEqual({ early: 3334, mid: 3333, late: 3333 })
  })

  it('skip pays nothing; refunds reduce the dividable total and what the receiver paid', () => {
    const result = closeSheet(
      [p('a', 1), p('b', 2), p('c', 3, { exception: 'skip' })],
      [bill('a', R(1000)), { kind: 'refund', amountPaise: R(200), category: 'Healthcare', fundId: null, payers: [{ memberId: 'a', paidPaise: R(200) }] }],
    )
    if (!result.ok) throw new Error(result.reason)
    expect(result.dividablePaise).toBe(R(800))
    expect(result.members.map((m) => [m.paidPaise, m.obligationPaise])).toEqual([[R(800), R(400)], [0, R(400)], [0, 0]])
  })

  it('fund money in and fund-paid bills show in the totals but never change the split', () => {
    const base = [bill('a', R(900)), bill('b', R(300))]
    const withFund: SheetEntry[] = [
      ...base,
      { kind: 'fund_in', amountPaise: R(10_000), category: null, fundId: 'f1', payers: [] },
      { kind: 'expense', amountPaise: R(2000), category: 'Healthcare', fundId: 'f1', payers: [] },
    ]
    const plain = closeSheet([p('a', 1), p('b', 2)], base)
    const result = closeSheet([p('a', 1), p('b', 2)], withFund)
    if (!plain.ok || !result.ok) throw new Error('blocked')
    expect(result.members).toEqual(plain.members)
    expect(result.dividablePaise).toBe(R(1200))
    expect(result.totalPaise).toBe(R(3200))
    expect(result.funds).toEqual({ f1: { inPaise: R(10_000), usedPaise: R(2000) } })
  })

  it('blocked: exceptions too big, nobody left to share, refunds bigger than bills', () => {
    expect(closeSheet([p('a', 1, { exception: 'fixed', exceptionPaise: R(600) }), p('b', 2, { exception: 'extra', exceptionPaise: R(500) })], [bill('a', R(1000))])).toEqual({
      ok: false,
      reason: 'exceptions_too_big',
    })
    expect(closeSheet([p('a', 1, { exception: 'fixed', exceptionPaise: R(100) }), p('b', 2, { exception: 'skip' })], [bill('a', R(1000))])).toEqual({
      ok: false,
      reason: 'nobody_shares',
    })
    expect(closeSheet(four, [{ kind: 'refund', amountPaise: R(10), category: 'Food', fundId: null, payers: [{ memberId: 'ramesh', paidPaise: R(10) }] }])).toEqual({
      ok: false,
      reason: 'negative_total',
    })
  })

  it('an empty month closes cleanly', () => {
    expect(closeSheet(four, []).ok).toBe(true)
    expect(closeSheet([p('a', 1, { exception: 'skip' })], []).ok).toBe(true)
  })
})

// protects=fewest payments that clear every net, in a stable order; fails_when=paying one suggestion reshuffles
// the rest, or a plan leaves a balance; no_claim=which suggestion a person actually pays first
describe('settlePlan: stable and complete', () => {
  it('matches debtors and creditors in member order', () => {
    expect(
      settlePlan([
        { memberId: 'ramesh', netPaise: R(1500) },
        { memberId: 'suresh', netPaise: R(3000) },
        { memberId: 'mahesh', netPaise: R(-1500) },
        { memberId: 'dinesh', netPaise: R(-3000) },
      ]),
    ).toEqual([
      { from: 'mahesh', to: 'ramesh', amountPaise: R(1500) },
      { from: 'dinesh', to: 'suresh', amountPaise: R(3000) },
    ])
  })

  it('refuses nets that do not sum to zero', () => {
    expect(() => settlePlan([{ memberId: 'a', netPaise: 1 }])).toThrow()
  })

  const netsArb = fc.array(fc.integer({ min: -1_000_000, max: 1_000_000 }), { minLength: 1, maxLength: 12 }).map((xs) => {
    const nets = xs.map((n, i) => ({ memberId: `m${i}`, netPaise: n }))
    nets.push({ memberId: `m${xs.length}`, netPaise: -sum(xs) })
    return nets
  })

  it('clears every net in at most (people with a balance − 1) payments (property)', () => {
    fc.assert(
      fc.property(netsArb, (nets) => {
        const plan = settlePlan(nets)
        const left = new Map(nets.map((n) => [n.memberId, n.netPaise]))
        for (const t of plan) {
          expect(t.amountPaise).toBeGreaterThan(0)
          left.set(t.from, left.get(t.from)! + t.amountPaise)
          left.set(t.to, left.get(t.to)! - t.amountPaise)
        }
        expect([...left.values()].every((v) => v === 0)).toBe(true)
        expect(plan.length).toBeLessThanOrEqual(Math.max(0, nets.filter((n) => n.netPaise !== 0).length - 1))
      }),
    )
  })

  it('paying the first suggestion leaves every other suggestion unchanged (property)', () => {
    fc.assert(
      fc.property(netsArb, (nets) => {
        const plan = settlePlan(nets)
        if (!plan.length) return
        const [paid, ...rest] = plan
        const after = nets.map((n) => ({
          memberId: n.memberId,
          netPaise: n.netPaise + (n.memberId === paid!.from ? paid!.amountPaise : 0) - (n.memberId === paid!.to ? paid!.amountPaise : 0),
        }))
        expect(settlePlan(after)).toEqual(rest)
      }),
    )
  })
})

// protects=net = paid − owed + sent − received sums to zero for any valid group;
// fails_when=a payment or share is counted on one side only; no_claim=the SQL that loads the totals
describe('netOf: group invariant (property)', () => {
  it('nets of any set of split expenses and payments sum to 0', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ amount: fc.integer({ min: 1, max: 10_000_00 }), payer: fc.integer({ min: 0, max: 4 }), mask: fc.integer({ min: 1, max: 31 }) }), { maxLength: 30 }),
        fc.array(fc.record({ from: fc.integer({ min: 0, max: 4 }), to: fc.integer({ min: 0, max: 4 }), amount: fc.integer({ min: 1, max: 5_000_00 }) }), { maxLength: 10 }),
        (expenses, payments) => {
          const t = Array.from({ length: 5 }, (_, i) => ({ memberId: `m${i + 1}`, paidPaise: 0, owedPaise: 0, sentPaise: 0, receivedPaise: 0 }))
          for (const e of expenses) {
            const people = t.filter((_, i) => e.mask & (1 << i)).map((x) => ({ memberId: x.memberId }))
            const payer = `m${e.payer + 1}`
            const r = buildShares({ mode: 'equal', amountPaise: e.amount, people, seqOf, payers: [{ memberId: payer, paidPaise: e.amount }] })
            if (!r.ok) throw new Error(r.message)
            t.find((x) => x.memberId === payer)!.paidPaise += e.amount
            for (const s of r.shares) t.find((x) => x.memberId === s.memberId)!.owedPaise += s.owedPaise
          }
          for (const pay of payments) {
            t[pay.from]!.sentPaise += pay.amount
            t[pay.to]!.receivedPaise += pay.amount
          }
          expect(sum(t.map(netOf))).toBe(0)
        },
      ),
    )
  })
})

describe('dates (IST calendar)', () => {
  it('month helpers', () => {
    expect(monthOf('2026-09-17')).toBe('2026-09-01')
    expect(addMonths('2026-12-01', 1)).toBe('2027-01-01')
    expect(addMonths('2026-01-01', -1)).toBe('2025-12-01')
    expect(monthEnd('2028-02-01')).toBe('2028-02-29')
    expect(monthEnd('2026-02-01')).toBe('2026-02-28')
    expect(monthsFrom('2026-11-01', '2027-02-10')).toEqual(['2026-11-01', '2026-12-01', '2027-01-01', '2027-02-01'])
    expect(sheetName('2026-09-01')).toBe('September 2026')
  })

  it('istDate uses Asia/Kolkata, not the server clock zone', () => {
    expect(istDate(new Date('2026-09-30T18:29:59Z'))).toBe('2026-09-30')
    expect(istDate(new Date('2026-09-30T18:30:00Z'))).toBe('2026-10-01')
  })
})

// protects=which month an entry lands in; fails_when=a bill lands in a closed month; no_claim=opening months on demand
describe('placeEntry', () => {
  const sheets: SheetRef[] = [
    { id: 'aug', startDate: '2026-08-01', endDate: '2026-08-31', state: 'closed' },
    { id: 'sep', startDate: '2026-09-01', endDate: '2026-09-30', state: 'open' },
    { id: 'oct', startDate: '2026-10-01', endDate: '2026-10-31', state: 'open' },
  ]
  const at = (date: string, today = '2026-10-03', s = sheets) => placeEntry({ date, today, sheets: s })

  it('own month when open; a closed month sends it to the latest open one, marked late', () => {
    expect(at('2026-09-28')).toEqual({ ok: true, sheetId: 'sep', late: false })
    expect(at('2026-08-15')).toEqual({ ok: true, sheetId: 'oct', late: true })
    const allClosed = sheets.map((s) => ({ ...s, state: 'closed' as const }))
    expect(at('2026-10-31', '2026-10-31', allClosed)).toEqual({ ok: true, sheetId: null, late: true })
  })

  it('rejects future dates and dates before the first month', () => {
    expect(at('2026-10-04')).toEqual({ ok: false, reason: 'future' })
    expect(at('2026-07-31')).toEqual({ ok: false, reason: 'before_start' })
  })
})

describe('checkCanClose', () => {
  const sheets: SheetRef[] = [
    { id: 'aug', startDate: '2026-08-01', endDate: '2026-08-31', state: 'open' },
    { id: 'sep', startDate: '2026-09-01', endDate: '2026-09-30', state: 'open' },
  ]
  it('closes any time, but earlier months first', () => {
    expect(checkCanClose('sep', sheets)).toBe('earlier_open')
    expect(checkCanClose('aug', sheets)).toBeNull()
    expect(checkCanClose('sep', [sheets[0]!, { ...sheets[1]!, state: 'closed' }])).toBe('not_open')
  })
})

describe('shareText and remindText', () => {
  it('month summary lists total, categories, funds, members and the plan', () => {
    const result = closeSheet(
      [p('ramesh', 1, { exception: 'fixed', exceptionPaise: R(8000) }), ...four.slice(1)],
      [bill('ramesh', R(9500)), bill('suresh', R(7000), 'Food'), bill('mahesh', R(2500)), bill('dinesh', R(1000))],
    )
    if (!result.ok) throw new Error(result.reason)
    const names = { ramesh: 'Ramesh', suresh: 'Suresh', mahesh: 'Mahesh', dinesh: 'Dinesh' }
    const plan = [{ from: 'mahesh', to: 'ramesh', amountPaise: R(1500) }]
    expect(shareText({ groupName: 'Flat 402', sheetName: 'September 2026', result, names, fundNames: {}, plan, link: 'https://x/s/abc' })).toBe(
      [
        'Flat 402 – September 2026',
        'Total: ₹20,000',
        'Healthcare ₹13,000 · Food ₹7,000',
        '',
        'Ramesh paid ₹9,500, share ₹8,000',
        'Suresh paid ₹7,000, share ₹4,000',
        'Mahesh paid ₹2,500, share ₹4,000',
        'Dinesh paid ₹1,000, share ₹4,000',
        '',
        'To settle:',
        'Mahesh pays Ramesh ₹1,500',
        '',
        'Full statement: https://x/s/abc',
      ].join('\n'),
    )
  })

  it('reminder names the amount and the UPI ID', () => {
    expect(remindText({ groupName: 'Goa trip', fromName: 'Asha', toName: 'Ravi', amountPaise: R(1250), upiId: 'ravi@okaxis', link: 'https://x' })).toBe(
      'Hi Asha, a reminder from Goa trip: please pay Ravi ₹1,250.\nUPI ID: ravi@okaxis\nhttps://x',
    )
  })
})
