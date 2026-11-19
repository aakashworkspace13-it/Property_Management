// Logic side of the acceptance scenarios in docs/REQUIREMENTS.md section 11.
// Test names start with the scenario number so the tracker can be checked against them.
// Scenario 10 (electricity states) is Phase 6; scenario 12 (permissions) is Phase 2.

import { describe, expect, it } from 'vitest'
import {
  allocateAccount,
  departureCharges,
  departurePreview,
  expectedRentInRange,
  expenseTotals,
  generateRentCharges,
  openingBalances,
  openingCharge,
  previewPayment,
  profitSummary,
  quickCollectAmount,
  receiptsInRange,
  rentPeriods,
  splitExpense,
  submeterCharge,
} from './index.js'

const tenancy = { id: 't1', moveIn: '2025-01-15', monthlyRent: 1_000_000 } // ₹10,000
const pay = (id, amount, date, extra = {}) => ({ id, tenancyId: 't1', account: 'rent', amount, date, ...extra })

describe('Acceptance scenarios (logic)', () => {
  it('1. full rent quick action saves exactly the remaining amount, once', () => {
    const charges = generateRentCharges(tenancy, '2025-01-15')
    const amount = quickCollectAmount(charges, [], charges[0].id)
    expect(amount).toBe(1_000_000)
    const payment = pay('p1', amount, '2025-01-15')
    const preview = previewPayment(charges, [], payment, charges[0].id)
    expect(preview.allocations).toEqual([{ paymentId: 'p1', chargeId: charges[0].id, amount }])
    expect(allocateAccount(charges, [payment]).totals.net).toBe(0)
    expect(() => allocateAccount(charges, [payment, payment])).toThrow() // a retry cannot double-count
  })

  it('2. partial payment keeps the remainder on its original period; accounts stay separate', () => {
    const charges = generateRentCharges(tenancy, '2025-01-15')
    const r = allocateAccount(charges, [pay('p1', 400_000, '2025-01-15')])
    expect(r.charges[0].remaining).toBe(600_000)
    const electricity = allocateAccount([], [{ ...pay('e1', 50_000, '2025-01-15'), account: 'electricity' }])
    expect(electricity.totals.net).toBe(-50_000)
    expect(r.totals.net).toBe(600_000)
  })

  it('3. missed periods are paid oldest first and extra stays as visible credit', () => {
    const charges = generateRentCharges(tenancy, '2025-03-15')
    const r = allocateAccount(charges, [pay('p1', 2_500_000, '2025-03-20')])
    expect(r.charges.map((c) => c.remaining)).toEqual([0, 0, 500_000])
    const r2 = allocateAccount(charges, [pay('p1', 2_500_000, '2025-03-20'), pay('p2', 1_000_000, '2025-03-21')])
    expect(r2.totals.credit).toBe(500_000)
  })

  it('4. a 31st anniversary passes through February and back with no gaps (incl. leap year)', () => {
    const ps = rentPeriods('2025-01-31', '2025-04-30')
    expect(ps.map((p) => [p.start, p.end])).toEqual([
      ['2025-01-31', '2025-02-27'],
      ['2025-02-28', '2025-03-30'],
      ['2025-03-31', '2025-04-29'],
      ['2025-04-30', '2025-05-30'],
    ])
    expect(rentPeriods('2024-01-31', '2024-02-29')[1].start).toBe('2024-02-29')
  })

  it('5. mid-period departure: leaving day included, half-up, explicit correction, earlier debt untouched', () => {
    const issued = generateRentCharges(tenancy, '2025-01-15')
    const preview = departurePreview(tenancy, '2025-01-29', issued)
    expect(preview).toMatchObject({ occupiedDays: 15, periodDays: 31, finalCharge: 483_871 })
    const all = [...issued, ...departureCharges(tenancy, preview)]
    expect(all.reduce((s, c) => s + c.amount, 0)).toBe(483_871)
    expect(issued[0].amount).toBe(1_000_000) // original preserved

    // with an earlier unpaid period and across the year end
    const longer = generateRentCharges(tenancy, '2025-12-15')
    const p2 = departurePreview(tenancy, '2025-12-20', longer)
    const r = allocateAccount([...longer, ...departureCharges(tenancy, p2)], [])
    expect(r.charges.at(-2).remaining).toBe(1_000_000) // November period still fully unpaid
    expect(r.charges.at(-1).remaining).toBe(p2.finalCharge)
    expect(expectedRentInRange([...longer, ...departureCharges(tenancy, p2)], '2026-01-01', '2026-12-31')).toBe(0)
  })

  it('6. a replacement tenant inherits no debt; the old ledger keeps its balance', () => {
    const old = generateRentCharges(tenancy, '2025-01-15')
    const preview = departurePreview(tenancy, '2025-02-14', old)
    const oldLedger = allocateAccount([...old, ...departureCharges(tenancy, preview)], [])
    const next = { id: 't2', moveIn: '2025-02-15', monthlyRent: 1_200_000 }
    const nextLedger = allocateAccount([], [])
    expect(oldLedger.totals.net).toBe(1_000_000)
    expect(nextLedger.totals.net).toBe(0)
    expect(generateRentCharges(next, '2025-02-15', old)[0]).toMatchObject({ tenancyId: 't2', amount: 1_200_000 })
  })

  it('7. submeter: exact calculation, reset needs a reason, override keeps the original', () => {
    const base = { previous: '100', current: '160', rate: '8.50', previousDate: '2025-01-01', readingDate: '2025-02-01' }
    expect(submeterCharge({ ...base, override: 50_000, reason: 'Agreed correction' })).toEqual({ units: '60', calculated: 51_000, amount: 50_000 })
    expect(() => submeterCharge({ ...base, current: '20', readingDate: '2025-03-01' })).toThrow()
    expect(submeterCharge({ ...base, current: '20', readingDate: '2025-03-01', resetUnits: '25', resetReason: 'Meter replaced' }).units).toBe('25')
  })

  it('8. building expense includes vacant flats, sums exactly and keeps its posted split', () => {
    const shares = splitExpense(10_001, ['occupied-flat', 'vacant-flat'])
    expect(Object.values(shares).reduce((a, b) => a + b)).toBe(10_001)
    expect(shares).toHaveProperty('vacant-flat')
    const expense = { amount: 10_001, payer: 'owner', date: '2025-02-01', shares }
    // A flat added later is not in the stored split, and the building total counts once.
    expect(expenseTotals([expense], '2025-01-01', '2025-12-31', 'new-flat').total).toBe(0)
    expect(expenseTotals([expense], '2025-01-01', '2025-12-31').total).toBe(10_001)
  })

  it('9. both payer types reduce primary profit; cash surplus deducts only owner-paid', () => {
    const payments = [pay('p1', 1_000_000, '2025-01-15')]
    const expenses = [
      { amount: 100_000, payer: 'owner', date: '2025-01-20', shares: {} },
      { amount: 50_000, payer: 'tenant', date: '2025-01-20', shares: {} },
    ]
    const e = expenseTotals(expenses, '2025-01-01', '2025-12-31')
    const result = profitSummary({
      rentReceived: receiptsInRange(payments, 'rent', '2025-01-01', '2025-12-31'),
      electricityCollections: 0,
      ownerPaidExpenses: e.owner,
      tenantPaidExpenses: e.tenant,
    })
    expect(e.total).toBe(150_000)
    expect(result).toEqual({ primaryProfit: 850_000, ownerCashSurplus: 900_000 })
  })

  it('11. openings, history and generated charges never double-count', () => {
    const opening = openingCharge({
      tenancyId: 't1', account: 'rent', amount: 1_000_000, due: '2025-01-15',
      start: '2025-01-15', end: '2025-02-14', reason: 'Old dues',
    })
    const first = generateRentCharges(tenancy, '2025-02-15', [opening])
    const again = generateRentCharges(tenancy, '2025-02-15', [opening, ...first])
    const all = [opening, ...first, ...again]
    expect(all).toHaveLength(2)
    expect(expectedRentInRange(all, '2025-01-01', '2025-12-31')).toBe(1_000_000) // only the generated period
    expect(openingBalances(all, '2025-12-31').rent).toBe(1_000_000)
  })
})
