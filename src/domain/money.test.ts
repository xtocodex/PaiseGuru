import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { allocate, formatRupees, parseRupees, MAX_ENTRY_PAISE } from './money.ts'

describe('allocate (S2)', () => {
  it('₹100 / 3: the payer (first in order) gets the extra paisa', () => {
    expect(allocate(10_000, [100, 100, 100])).toEqual([3334, 3333, 3333])
  })

  it('two leftover paise go to the first two in order when remainders tie', () => {
    expect(allocate(10_001, [100, 100, 100])).toEqual([3334, 3334, 3333])
  })

  it('leftover goes by largest fractional remainder before order', () => {
    // 100 paise over weights 1 : 1.5 → exact 40 : 60, no leftover
    expect(allocate(100, [100, 150])).toEqual([40, 60])
    // 101 over 1 : 2 → 33.67 / 67.33: remainders 2 and 1 (of 3), the first gets it
    expect(allocate(101, [100, 200])).toEqual([34, 67])
    // 101 over 2 : 1 → 67.33 / 33.67: the second has the larger remainder
    expect(allocate(101, [200, 100])).toEqual([67, 34])
  })

  it('one participant takes everything; zero total gives zeros', () => {
    expect(allocate(12_345, [100])).toEqual([12_345])
    expect(allocate(0, [100, 100])).toEqual([0, 0])
    expect(allocate(0, [])).toEqual([])
  })

  it('rejects bad input', () => {
    expect(() => allocate(100, [])).toThrow()
    expect(() => allocate(100, [0, 100])).toThrow()
    expect(() => allocate(100, [-100, 100])).toThrow()
    expect(() => allocate(100, [1.5])).toThrow()
    expect(() => allocate(-1, [100])).toThrow()
    expect(() => allocate(1.5, [100])).toThrow()
  })

  it('shares always sum to the total and differ from the exact value by < 1 paisa', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 5 * 10 ** 12 }),
        fc.array(fc.integer({ min: 1, max: 10_000 }), { minLength: 1, maxLength: 100 }),
        (total, weights) => {
          const shares = allocate(total, weights)
          const sumW = weights.reduce((a, b) => a + b, 0)
          expect(shares.reduce((a, b) => a + b, 0)).toBe(total)
          shares.forEach((s, i) => {
            const exact = (BigInt(total) * BigInt(weights[i]!) * 1000n) / BigInt(sumW)
            expect(Math.abs(Number(BigInt(s) * 1000n - exact))).toBeLessThan(1000)
          })
        },
      ),
    )
  })
})

describe('formatRupees', () => {
  it('uses Indian digit grouping and hides .00', () => {
    expect(formatRupees(0)).toBe('₹0')
    expect(formatRupees(10_000)).toBe('₹100')
    expect(formatRupees(3334)).toBe('₹33.34')
    expect(formatRupees(2_000_000)).toBe('₹20,000')
    expect(formatRupees(1_000_000_005)).toBe('₹1,00,00,000.05')
    expect(formatRupees(-30_000)).toBe('-₹300')
  })
})

describe('parseRupees', () => {
  it('reads plain rupee text into paise without floats', () => {
    expect(parseRupees('250')).toBe(25_000)
    expect(parseRupees('250.5')).toBe(25_050)
    expect(parseRupees('0.07')).toBe(7)
    expect(parseRupees(' ₹1,00,000.00 ')).toBe(10_000_000)
    expect(parseRupees('Rs.250.00')).toBe(25_000)
    expect(parseRupees('10000000')).toBe(MAX_ENTRY_PAISE)
  })

  it('rejects anything that is not a clean amount', () => {
    for (const bad of ['', 'abc', '12.345', '-5', '1e3', '12..3', '.5', '10000000.01', '0x10']) {
      expect(parseRupees(bad), bad).toBeNull()
    }
  })

  it('round-trips with formatRupees', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: MAX_ENTRY_PAISE }), (p) => {
        expect(parseRupees(formatRupees(p))).toBe(p)
      }),
    )
  })
})
