import { describe, expect, it } from 'vitest'
import { allocateAccount, chargeStatus, previewPayment, quickCollectAmount } from './allocation.js'
import { departureCharges, departurePreview, generateRentCharges } from './rent.js'

const tenancy = { id: 't1', moveIn: '2025-01-15', monthlyRent: 1_000_000 }
const pay = (id, amount, date, extra = {}) => ({ id, tenancyId: 't1', account: 'rent', amount, date, ...extra })

describe('allocateAccount', () => {
  it('pays the oldest period first and keeps the rest as credit', () => {
    const charges = generateRentCharges(tenancy, '2025-03-15')
    const r = allocateAccount(charges, [pay('p1', 2_500_000, '2025-03-20')])
    expect(r.charges.map((c) => c.remaining)).toEqual([0, 0, 500_000])
    const r2 = allocateAccount(charges, [pay('p1', 2_500_000, '2025-03-20'), pay('p2', 1_000_000, '2025-03-21')])
    expect(r2.totals).toMatchObject({ outstanding: 0, credit: 500_000, net: -500_000 })
  })

  it('keeps a partial payment against its original period', () => {
    const charges = generateRentCharges(tenancy, '2025-01-15')
    const r = allocateAccount(charges, [pay('p1', 400_000, '2025-01-15')])
    expect(r.charges[0]).toMatchObject({ received: 400_000, remaining: 600_000 })
    expect(chargeStatus(r.charges[0], '2025-01-20')).toEqual({ status: 'partial', overdue: true })
    expect(chargeStatus(r.charges[0], '2025-01-15')).toEqual({ status: 'partial', overdue: false })
  })

  it('applies a manual allocation exactly as given', () => {
    const charges = generateRentCharges(tenancy, '2025-03-15')
    const last = charges[2].id
    const r = allocateAccount(charges, [pay('p1', 500_000, '2025-03-20', { manualAllocations: { [last]: 500_000 } })])
    expect(r.allocations).toEqual([{ paymentId: 'p1', chargeId: last, amount: 500_000 }])
    expect(r.charges.map((c) => c.remaining)).toEqual([1_000_000, 1_000_000, 500_000])
  })

  it('rejects a manual allocation that no longer fits', () => {
    const charges = generateRentCharges(tenancy, '2025-01-15')
    const bad = pay('p1', 500_000, '2025-01-15', { manualAllocations: { [charges[0].id]: 600_000 } })
    expect(() => allocateAccount(charges, [bad])).toThrow(/no longer fits/)
  })

  it('never mixes rent with electricity or two tenancies', () => {
    const charges = generateRentCharges(tenancy, '2025-01-15')
    expect(() => allocateAccount(charges, [{ ...pay('p1', 1, '2025-01-15'), account: 'electricity' }])).toThrow()
    expect(() => allocateAccount(charges, [{ ...pay('p1', 1, '2025-01-15'), tenancyId: 't2' }])).toThrow()
  })

  it('rejects the same payment twice (retry safety) and ignores deleted payments', () => {
    const charges = generateRentCharges(tenancy, '2025-01-15')
    const p = pay('p1', 1_000_000, '2025-01-15')
    expect(() => allocateAccount(charges, [p, p])).toThrow(/twice/)
    expect(allocateAccount(charges, [{ ...p, deleted: true }]).totals.outstanding).toBe(1_000_000)
  })

  // Handoff concern #1: a departure correction pooled against the oldest debt made older
  // unpaid periods look paid. It must reduce only the period it corrects.
  it('applies a departure correction to its own period, not to older debt', () => {
    const issued = generateRentCharges(tenancy, '2025-02-15') // Jan + Feb periods, both unpaid
    const preview = departurePreview(tenancy, '2025-02-20', issued)
    const all = [...issued, ...departureCharges(tenancy, preview)]
    const r = allocateAccount(all, [])
    const [jan, feb] = r.charges
    expect(jan).toMatchObject({ adjusted: 0, remaining: 1_000_000 }) // still fully unpaid
    expect(feb.remaining).toBe(preview.finalCharge) // 6 of 28 days
    expect(r.totals.outstanding).toBe(1_000_000 + preview.finalCharge)
    expect(r.totals.net).toBe(r.totals.outstanding)
  })

  it('pushes a correction larger than its period to the oldest debt, then to adjustment credit', () => {
    const charges = [
      { id: 'a', tenancyId: 't1', account: 'rent', amount: 1000, due: '2025-01-01' },
      { id: 'b', tenancyId: 't1', account: 'rent', amount: 1000, due: '2025-02-01' },
      { id: 'x', tenancyId: 't1', account: 'rent', amount: -2500, due: '2025-02-10', corrects: 'b' },
    ]
    const r = allocateAccount(charges, [])
    expect(r.charges.map((c) => c.remaining)).toEqual([0, 0])
    expect(r.totals.adjustmentCredit).toBe(500)
    expect(r.totals.net).toBe(-500)
  })
})

describe('quick collection', () => {
  it('defaults to the displayed period remaining amount', () => {
    const charges = generateRentCharges(tenancy, '2025-02-15')
    const payments = [pay('p1', 300_000, '2025-02-16')]
    expect(quickCollectAmount(charges, payments, charges[1].id)).toBe(1_000_000)
    expect(quickCollectAmount(charges, payments, charges[0].id)).toBe(700_000)
  })

  it('warns when older debt takes the money first', () => {
    const charges = generateRentCharges(tenancy, '2025-02-15')
    const p = previewPayment(charges, [], pay('new', 1_000_000, '2025-02-15'), charges[1].id)
    expect(p.paysOlderFirst).toBe(true)
    expect(p.allocations).toEqual([{ paymentId: 'new', chargeId: charges[0].id, amount: 1_000_000 }])
  })
})
