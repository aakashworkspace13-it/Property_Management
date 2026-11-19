import { describe, expect, it } from 'vitest'
import { expenseShares, splitExpense } from './expenses.js'
import { expectedRentInRange, expenseTotals, openingBalances, profitSummary, receiptsInRange } from './reports.js'
import { submeterCharge } from './submeter.js'
import { openingCharge } from './openings.js'
import { departureCharges, departurePreview, generateRentCharges } from './rent.js'

const tenancy = { id: 't1', moveIn: '2025-01-15', monthlyRent: 1_000_000 }

describe('splitExpense', () => {
  it('splits across all flats, including vacant ones, to the exact paisa', () => {
    const shares = splitExpense(10_001, ['f2', 'f1'])
    expect(shares).toEqual({ f1: 5001, f2: 5000 })
    expect(Object.values(splitExpense(100, ['a', 'b', 'c'])).reduce((a, b) => a + b)).toBe(100)
  })
  it('gives a flat-specific expense wholly to its flat', () => {
    expect(expenseShares({ amount: 500, flatId: 'f9' }, ['f1', 'f2'])).toEqual({ f9: 500 })
  })
  it('rejects empty or duplicate flat lists', () => {
    expect(() => splitExpense(100, [])).toThrow()
    expect(() => splitExpense(100, ['a', 'a'])).toThrow()
  })
})

describe('reports', () => {
  it('splits expected rent across calendar years exactly', () => {
    const charges = generateRentCharges(tenancy, '2025-12-15')
    const y1 = expectedRentInRange(charges, '2025-01-01', '2025-12-31')
    const y2 = expectedRentInRange(charges, '2026-01-01', '2026-12-31')
    expect(y1 + y2).toBe(charges.reduce((s, c) => s + c.amount, 0))
    expect(y2).toBeGreaterThan(0)
  })

  it('folds a departure crossing the year end into the right year', () => {
    const issued = generateRentCharges(tenancy, '2025-12-15')
    const preview = departurePreview(tenancy, '2025-12-20', issued)
    const all = [...issued, ...departureCharges(tenancy, preview)]
    expect(expectedRentInRange(all, '2026-01-01', '2026-12-31')).toBe(0)
    const total = expectedRentInRange(all, '2025-01-01', '2025-12-31')
    expect(total).toBe(11 * 1_000_000 + preview.finalCharge)
  })

  it('counts receipts by payment date', () => {
    const payments = [
      { id: 'a', account: 'rent', amount: 123_456, date: '2025-12-21' },
      { id: 'b', account: 'rent', amount: 654_321, date: '2026-01-05' },
      { id: 'c', account: 'electricity', amount: 1, date: '2025-12-22' },
    ]
    expect(receiptsInRange(payments, 'rent', '2025-01-01', '2025-12-31')).toBe(123_456)
  })

  it('counts each expense once in total, or one flat share with a flat filter', () => {
    const x = { amount: 10_001, payer: 'owner', date: '2025-02-01', shares: splitExpense(10_001, ['f1', 'f2']) }
    expect(expenseTotals([x], '2025-01-01', '2025-12-31')).toEqual({ owner: 10_001, tenant: 0, total: 10_001 })
    expect(expenseTotals([x], '2025-01-01', '2025-12-31', 'f2').owner).toBe(5000)
  })

  it('keeps openings out of expected rent', () => {
    const opening = openingCharge({
      tenancyId: 't1', account: 'rent', amount: 1_000_000, due: '2025-01-15',
      start: '2025-01-15', end: '2025-02-14', reason: 'Old dues',
    })
    const generated = generateRentCharges(tenancy, '2025-02-15', [opening])
    expect(generated.map((c) => c.start)).toEqual(['2025-02-15'])
    const all = [opening, ...generated]
    expect(expectedRentInRange(all, '2025-01-01', '2025-02-14')).toBe(0)
    expect(openingBalances(all, '2025-12-31')).toEqual({ rent: 1_000_000, electricity: 0 })
  })

  it('profit uses the owner formula', () => {
    expect(profitSummary({ rentReceived: 1_000_000, electricityCollections: 20_000, ownerPaidExpenses: 100_000, tenantPaidExpenses: 50_000 }))
      .toEqual({ primaryProfit: 850_000, ownerCashSurplus: 920_000 })
  })
})

describe('openingCharge', () => {
  it('rejects overlap with an issued period', () => {
    const issued = generateRentCharges(tenancy, '2025-01-15')
    expect(() =>
      openingCharge({ tenancyId: 't1', account: 'rent', amount: 1, due: '2025-01-20', start: '2025-01-20', end: '2025-01-25' }, issued),
    ).toThrow(/already covered/)
  })
  it('requires a note for unknown dates and allows only one per account', () => {
    const base = { tenancyId: 't1', account: 'electricity', amount: 5000, due: '2025-01-01' }
    expect(() => openingCharge(base)).toThrow(/note/)
    const o = openingCharge({ ...base, reason: 'Dues before 2025' })
    expect(o).toMatchObject({ id: 't1_opening_electricity', start: null })
    expect(() => openingCharge({ ...base, reason: 'again' }, [o])).toThrow(/already has/)
  })
  it('requires both dates or neither', () => {
    expect(() => openingCharge({ tenancyId: 't1', account: 'rent', amount: 1, due: '2025-01-01', start: '2025-01-01' })).toThrow()
  })
})

describe('submeterCharge', () => {
  const base = { previous: '100', current: '160', rate: '8.50', previousDate: '2025-01-01', readingDate: '2025-02-01' }

  it('calculates units × rate exactly', () => {
    expect(submeterCharge(base)).toEqual({ units: '60', calculated: 51_000, amount: 51_000 })
    // 0.1 + 0.2 style fractions stay exact: 12.3 units × ₹7.35 = ₹90.405 → ₹90.41
    expect(submeterCharge({ ...base, previous: '100.1', current: '112.4', rate: '7.35' }).amount).toBe(9041)
  })

  it('keeps the calculation when overriding, and needs a reason', () => {
    expect(submeterCharge({ ...base, override: 50_000, reason: 'Agreed correction' })).toMatchObject({ calculated: 51_000, amount: 50_000 })
    expect(() => submeterCharge({ ...base, override: 50_000 })).toThrow(/reason/)
    expect(() => submeterCharge({ ...base, adjustment: -1000 })).toThrow(/reason/)
  })

  it('blocks negative consumption unless a reset is recorded', () => {
    const lower = { ...base, current: '20' }
    expect(() => submeterCharge(lower)).toThrow(/reset/)
    expect(() => submeterCharge({ ...lower, resetUnits: '25' })).toThrow(/reset/)
    expect(submeterCharge({ ...lower, resetUnits: '25', resetReason: 'Meter replaced' }).units).toBe('25')
  })

  it('checks dates and values', () => {
    expect(() => submeterCharge({ ...base, readingDate: '2025-01-01' })).toThrow(/after/)
    expect(() => submeterCharge({ ...base, rate: '-1' })).toThrow()
    expect(() => submeterCharge({ ...base, override: -1, reason: 'x' })).toThrow(/negative/)
  })
})
