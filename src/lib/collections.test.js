// Made-up data only.
import { describe, expect, it } from 'vitest'
import { collectionRow, dueRentCharges, monthRange, periodSummary, sortCollectionRows, tenancyLedger } from './collections.js'
import { departureCharges, departurePreview, openingCharge } from './money/index.js'

const tenancy = {
  id: 'ty1', tenantId: 't1', flatId: 'B01-G-1', buildingId: 'B01',
  moveIn: '2025-01-15', moveOut: null, monthlyRent: 1_000_000, trackFrom: '2025-01-15',
}
const pay = (id, amount, date, extra = {}) => ({ id, tenancyId: 'ty1', account: 'rent', amount, date, ...extra })

describe('dueRentCharges', () => {
  it('creates every started period from "track rent from", with flat and building', () => {
    const cs = dueRentCharges(tenancy, [], '2025-03-20')
    expect(cs.map((c) => c.start)).toEqual(['2025-01-15', '2025-02-15', '2025-03-15'])
    expect(cs[0]).toMatchObject({ id: 'ty1_rent_2025-01-15', flatId: 'B01-G-1', buildingId: 'B01', amount: 1_000_000 })
  })
  it('starts at the tracking date for existing tenants and creates nothing twice', () => {
    const t = { ...tenancy, trackFrom: '2025-03-15' }
    const first = dueRentCharges(t, [], '2025-04-20')
    expect(first.map((c) => c.start)).toEqual(['2025-03-15', '2025-04-15'])
    expect(dueRentCharges(t, first, '2025-04-20')).toEqual([])
  })
  it('stops at move-out and prorates the last period', () => {
    const cs = dueRentCharges({ ...tenancy, moveOut: '2025-01-29' }, [], '2025-06-01')
    expect(cs).toHaveLength(1)
    expect(cs[0].amount).toBe(483_871)
  })
  it('creates nothing before tracking starts', () => {
    expect(dueRentCharges({ ...tenancy, trackFrom: '2025-05-15' }, [], '2025-04-01')).toEqual([])
  })
})

describe('collectionRow', () => {
  const charges = dueRentCharges(tenancy, [], '2025-03-20') // Jan, Feb, Mar

  it('shows the current period and older dues; overdue when older periods are unpaid', () => {
    const row = collectionRow(tenancy, charges, [], '2025-03-20')
    expect(row).toMatchObject({ status: 'overdue', currentRemaining: 1_000_000, older: 2_000_000, outstanding: 3_000_000 })
    expect(row.current.start).toBe('2025-03-15')
  })

  it('a payment goes to the oldest period first', () => {
    const row = collectionRow(tenancy, charges, [pay('p1', 1_000_000, '2025-03-20')], '2025-03-20')
    expect(row.older).toBe(1_000_000)
    expect(row.currentRemaining).toBe(1_000_000)
  })

  it('paid, partial and unpaid on the due day', () => {
    const one = dueRentCharges(tenancy, [], '2025-01-15')
    expect(collectionRow(tenancy, one, [], '2025-01-15').status).toBe('unpaid')
    expect(collectionRow(tenancy, one, [pay('p1', 400_000, '2025-01-15')], '2025-01-15').status).toBe('partial')
    expect(collectionRow(tenancy, one, [pay('p1', 1_000_000, '2025-01-15')], '2025-01-15').status).toBe('paid')
    expect(collectionRow(tenancy, one, [], '2025-01-16').status).toBe('overdue')
  })

  it('reports credit after over-payment and ignores voided payments', () => {
    const one = dueRentCharges(tenancy, [], '2025-01-15')
    const row = collectionRow(tenancy, one, [pay('p1', 1_200_000, '2025-01-15')], '2025-01-15')
    expect(row).toMatchObject({ status: 'paid', credit: 200_000, net: -200_000 })
    expect(collectionRow(tenancy, one, [pay('p1', 1_000_000, '2025-01-15', { deleted: true })], '2025-01-15').status).toBe('unpaid')
  })

  it('counts an opening balance as older debt', () => {
    const t = { ...tenancy, trackFrom: '2025-03-15' }
    const opening = openingCharge({ tenancyId: 'ty1', account: 'rent', amount: 500_000, due: '2025-03-01', reason: 'Dues before March' })
    const cs = [opening, ...dueRentCharges(t, [opening], '2025-03-20')]
    expect(collectionRow(t, cs, [], '2025-03-20')).toMatchObject({ older: 500_000, currentRemaining: 1_000_000 })
  })

  it('a move-out correction reduces only its own period', () => {
    const cs = dueRentCharges(tenancy, [], '2025-02-20')
    const preview = departurePreview({ id: 'ty1', moveIn: tenancy.moveIn, monthlyRent: tenancy.monthlyRent }, '2025-02-20', cs)
    const all = [...cs, ...departureCharges({ id: 'ty1' }, preview).map((c) => ({ ...c, flatId: 'B01-G-1' }))]
    const ledger = tenancyLedger({ ...tenancy, moveOut: '2025-02-20' }, all, [], '2025-02-20')
    expect(ledger.rows.map((r) => r.remaining)).toEqual([1_000_000, preview.finalCharge])
  })
})

describe('sorting and summaries', () => {
  it('sorts overdue first and paid last', () => {
    const rows = [
      { status: 'paid', flatId: 'A' },
      { status: 'overdue', flatId: 'B' },
      { status: 'unpaid', flatId: 'C' },
    ]
    expect(sortCollectionRows(rows).map((r) => r.status)).toEqual(['overdue', 'unpaid', 'paid'])
  })

  it('summarises a month: rent due by due date, received by payment date', () => {
    const cs = dueRentCharges(tenancy, [], '2025-03-20')
    const { start, end } = monthRange('2025-02-10')
    expect([start, end]).toEqual(['2025-02-01', '2025-02-28'])
    expect(periodSummary(cs, [pay('p1', 700_000, '2025-02-03'), pay('p2', 1, '2025-03-01')], start, end)).toEqual({
      due: 1_000_000,
      received: 700_000,
    })
  })
})

describe('periodSummary after a move-out', () => {
  it('does not count periods reversed at move-out, and counts a prorated last period at its corrected amount', () => {
    const t = { ...tenancy, moveIn: '2025-01-01', trackFrom: '2025-01-01' }
    const cs = dueRentCharges(t, [], '2025-04-10') // Jan, Feb, Mar, Apr issued before the move-out was recorded
    const preview = departurePreview({ id: t.id, moveIn: t.moveIn, monthlyRent: t.monthlyRent }, '2025-02-14', cs)
    const all = [...cs, ...departureCharges({ id: t.id }, preview)]
    expect(periodSummary(all, [], '2025-04-01', '2025-04-30').due).toBe(0) // April reversed
    expect(periodSummary(all, [], '2025-03-01', '2025-03-31').due).toBe(0) // March reversed
    expect(periodSummary(all, [], '2025-02-01', '2025-02-28').due).toBe(preview.finalCharge) // 14 of 28 days
    expect(periodSummary(all, [], '2025-01-01', '2025-01-31').due).toBe(1_000_000)
  })
})
