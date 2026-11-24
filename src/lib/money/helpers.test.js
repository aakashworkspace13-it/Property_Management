import { describe, expect, it } from 'vitest'
import { divRoundHalfUp, formatINR, rupeesToPaise, sumPaise } from './money.js'
import { addDays, anniversary, daysInclusive, todayInKolkata } from './dates.js'

describe('divRoundHalfUp', () => {
  it('rounds half up, away from zero', () => {
    expect(divRoundHalfUp(5, 2)).toBe(3)
    expect(divRoundHalfUp(-5, 2)).toBe(-3)
    expect(divRoundHalfUp(4, 3)).toBe(1)
    expect(divRoundHalfUp(1_000_000 * 15, 31)).toBe(483_871) // ₹4,838.71
  })
  it('rejects non-integer input', () => {
    expect(() => divRoundHalfUp(1.5, 2)).toThrow()
    expect(() => divRoundHalfUp(1, 0)).toThrow()
  })
})

describe('rupeesToPaise', () => {
  it('parses typed rupee amounts exactly', () => {
    expect(rupeesToPaise('10,000')).toBe(1_000_000)
    expect(rupeesToPaise('₹ 1,23,456.78')).toBe(12_345_678)
    expect(rupeesToPaise('4838.7')).toBe(483_870)
    expect(rupeesToPaise('0.1')).toBe(10)
    expect(rupeesToPaise(19.99)).toBe(1999)
  })
  it('rounds extra decimals half up', () => {
    expect(rupeesToPaise('1.005')).toBe(101)
    expect(rupeesToPaise('1.004')).toBe(100)
    expect(rupeesToPaise('-1.005')).toBe(-101)
  })
  it('rejects text that is not a number', () => {
    expect(() => rupeesToPaise('ten')).toThrow()
    expect(() => rupeesToPaise('1.2.3')).toThrow()
    expect(() => rupeesToPaise('')).toThrow()
  })
})

describe('formatINR', () => {
  it('uses Indian digit grouping', () => {
    expect(formatINR(483_871)).toBe('4,839')
    expect(formatINR(12_345_678)).toBe('1,23,457')
    expect(formatINR(1_000_000_000)).toBe('1,00,00,000')
    expect(formatINR(5)).toBe('0')
    expect(formatINR(483_840)).toBe('4,838')
    expect(formatINR(50)).toBe('1')
    expect(formatINR(-50_000)).toBe('-500')
    expect(formatINR(-150)).toBe('-2')
  })
})

describe('sumPaise', () => {
  it('adds integers and rejects floats', () => {
    expect(sumPaise([1, 2, 3])).toBe(6)
    expect(() => sumPaise([0.1, 0.2])).toThrow()
  })
})

describe('dates', () => {
  it('clamps anniversaries and returns to the anchor day', () => {
    expect(anniversary('2025-01-31', 1)).toBe('2025-02-28')
    expect(anniversary('2025-01-31', 2)).toBe('2025-03-31')
    expect(anniversary('2025-01-31', 3)).toBe('2025-04-30')
    expect(anniversary('2024-01-31', 1)).toBe('2024-02-29')
    expect(anniversary('2025-11-15', 2)).toBe('2026-01-15')
  })
  it('counts days inclusively and adds days across years', () => {
    expect(daysInclusive('2025-01-15', '2025-02-14')).toBe(31)
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01')
  })
  it('rejects impossible dates', () => {
    expect(() => anniversary('2025-02-30', 0)).toThrow()
    expect(() => daysInclusive('2025-1-1', '2025-01-02')).toThrow()
  })
  it('gives the Kolkata business date', () => {
    // 20:00 UTC on 31 Dec is already 1 Jan in India (UTC+5:30).
    expect(todayInKolkata(new Date('2025-12-31T20:00:00Z'))).toBe('2026-01-01')
    expect(todayInKolkata(new Date('2025-12-31T18:00:00Z'))).toBe('2025-12-31')
  })
})
