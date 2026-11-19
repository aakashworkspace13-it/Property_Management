import { describe, expect, it } from 'vitest'
import {
  departureCharges,
  departurePreview,
  firstGeneratedPeriod,
  generateRentCharges,
  rentChargeId,
  rentPeriods,
} from './rent.js'
import { openingCharge } from './openings.js'

const tenancy = { id: 't1', moveIn: '2025-01-15', monthlyRent: 1_000_000 }

describe('rentPeriods', () => {
  it('follows the move-in anniversary, not calendar months', () => {
    const [first] = rentPeriods('2025-01-15', '2025-01-15')
    expect(first).toMatchObject({ start: '2025-01-15', end: '2025-02-14', periodDays: 31, occupiedDays: 31 })
  })

  it('handles a 31st anchor through February without gaps or overlaps', () => {
    const ps = rentPeriods('2025-01-31', '2025-04-30').map((p) => [p.start, p.end])
    expect(ps).toEqual([
      ['2025-01-31', '2025-02-27'],
      ['2025-02-28', '2025-03-30'],
      ['2025-03-31', '2025-04-29'],
      ['2025-04-30', '2025-05-30'],
    ])
  })

  it('uses 29 February in a leap year', () => {
    expect(rentPeriods('2024-01-31', '2024-02-29')[1].start).toBe('2024-02-29')
  })

  it('cuts the last period at move-out, including the leaving day', () => {
    const ps = rentPeriods('2025-01-15', '2025-03-01', '2025-01-29')
    expect(ps).toHaveLength(1)
    expect(ps[0]).toMatchObject({ end: '2025-01-29', occupiedDays: 15, periodDays: 31 })
  })
})

describe('generateRentCharges', () => {
  it('does not prorate a first period that starts mid-month', () => {
    const [c] = generateRentCharges(tenancy, '2025-01-15')
    expect(c).toMatchObject({ id: rentChargeId('t1', '2025-01-15'), amount: 1_000_000, due: '2025-01-15' })
  })

  it('is idempotent: running twice creates nothing new', () => {
    const first = generateRentCharges(tenancy, '2025-03-15')
    expect(first).toHaveLength(3)
    expect(generateRentCharges(tenancy, '2025-03-15', first)).toEqual([])
  })

  it('never regenerates a deleted period', () => {
    const [c] = generateRentCharges(tenancy, '2025-01-15')
    expect(generateRentCharges(tenancy, '2025-01-15', [{ ...c, deleted: true }])).toEqual([])
  })

  it('skips periods before generateFrom', () => {
    const cs = generateRentCharges({ ...tenancy, generateFrom: '2025-03-01' }, '2025-04-15')
    expect(cs.map((c) => c.start)).toEqual(['2025-03-15', '2025-04-15'])
    expect(firstGeneratedPeriod({ ...tenancy, generateFrom: '2025-03-01' })).toMatchObject({ start: '2025-03-15' })
  })

  it('keeps the rent that was in force when each charge was issued', () => {
    const jan = generateRentCharges(tenancy, '2025-01-15')
    const feb = generateRentCharges({ ...tenancy, monthlyRent: 1_200_000 }, '2025-02-15', jan)
    expect(jan[0].amount).toBe(1_000_000)
    expect(feb).toHaveLength(1)
    expect(feb[0].amount).toBe(1_200_000)
  })
})

describe('departure', () => {
  it('prorates the leaving period, leaving day included, half-up', () => {
    const charges = generateRentCharges(tenancy, '2025-01-15')
    const p = departurePreview(tenancy, '2025-01-29', charges)
    expect(p).toMatchObject({ occupiedDays: 15, periodDays: 31, finalCharge: 483_871, adjustment: -516_129 })
    const extra = departureCharges(tenancy, p)
    expect(extra).toHaveLength(1)
    expect(extra[0]).toMatchObject({ corrects: charges[0].id, amount: -516_129, correctedAmount: 483_871 })
    // the original charge is untouched
    expect(charges[0].amount).toBe(1_000_000)
  })

  it('reverses periods issued after the leaving day', () => {
    const charges = generateRentCharges(tenancy, '2025-03-15')
    const p = departurePreview(tenancy, '2025-02-14', charges)
    expect(p.adjustment).toBe(0)
    expect(p.futureReversals.map((r) => r.chargeId)).toEqual([rentChargeId('t1', '2025-02-15'), rentChargeId('t1', '2025-03-15')])
    const extra = departureCharges(tenancy, p)
    expect(extra.every((c) => c.amount === -1_000_000 && c.reverses)).toBe(true)
  })

  it('creates the prorated period directly if it was never issued', () => {
    const p = departurePreview(tenancy, '2025-01-29', [])
    expect(p.issuedChargeId).toBeNull()
    expect(departureCharges(tenancy, p)).toEqual([])
    const [c] = generateRentCharges({ ...tenancy, moveOut: '2025-01-29' }, '2025-01-29')
    expect(c.amount).toBe(483_871)
  })

  it('flags a leaving period covered by an opening for manual review', () => {
    const opening = openingCharge({
      tenancyId: 't1', account: 'rent', amount: 1_000_000, due: '2025-01-15',
      start: '2025-01-15', end: '2025-02-14', reason: 'Old dues',
    })
    expect(departurePreview(tenancy, '2025-01-29', [opening]).needsManualReview).toBe(true)
  })

  it('rejects impossible departures', () => {
    expect(() => departurePreview(tenancy, '2025-01-01')).toThrow()
    expect(() => departurePreview({ ...tenancy, moveOut: '2025-02-01' }, '2025-02-10')).toThrow()
  })
})
