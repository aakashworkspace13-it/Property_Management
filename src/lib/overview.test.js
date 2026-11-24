// Made-up data only.
import { describe, expect, it } from 'vitest'
import { dueRentCharges } from './collections.js'
import { allocatedCharges, durationLabel, flatTimeline, monthLabel, overviewRange, periodOverview, rentTree } from './overview.js'

const t1 = { id: 'ty1', tenantId: 't1', flatId: 'B01-G-1', buildingId: 'B01', moveIn: '2026-01-10', monthlyRent: 1_000_000, trackFrom: '2026-01-10' }
const t2 = { id: 'ty2', tenantId: 't2', flatId: 'B02-1-1', buildingId: 'B02', moveIn: '2026-03-05', monthlyRent: 500_000, trackFrom: '2026-03-05' }
const today = '2026-04-20'
const charges = [...dueRentCharges(t1, [], today), ...dueRentCharges(t2, [], today)] // ty1 Jan–Apr, ty2 Mar–Apr
const elec = { id: 'bill1_elec_B01-G-1', tenancyId: 'ty1', account: 'electricity', source: 'electricity', amount: 80_000, due: '2026-04-10', start: '2026-04-10', end: '2026-04-10' }
const payments = [
  { id: 'p1', tenancyId: 'ty1', account: 'rent', amount: 2_500_000, date: '2026-04-11' }, // Jan, Feb paid, Mar half
  { id: 'p2', tenancyId: 'ty2', account: 'rent', amount: 500_000, date: '2026-04-06' }, // Mar paid
  { id: 'p3', tenancyId: 'ty1', account: 'electricity', amount: 30_000, date: '2026-04-15' },
]
const expenses = [
  { id: 'x1', buildingId: 'B01', amount: 200_000, payer: 'owner', date: '2026-04-02' },
  { id: 'x2', buildingId: 'B02', amount: 100_000, payer: 'tenant', date: '2026-02-02' },
]
const tenancies = [t1, t2]
const data = { rows: allocatedCharges(tenancies, [...charges, elec], payments, today), tenancies, payments, expenses }

describe('overviewRange', () => {
  it('this month is the calendar month; year to date runs from 1 January to today', () => {
    expect(overviewRange('month', today)).toEqual({ start: '2026-04-01', end: '2026-04-30' })
    expect(overviewRange('year', today)).toEqual({ start: '2026-01-01', end: today })
  })
})

describe('periodOverview', () => {
  it('this month, all buildings: rent due, received, balance, overdue; electricity; expenses', () => {
    const o = periodOverview(data, overviewRange('month', today))
    // April rent: ty1 10,000 (due 10 Apr, unpaid → overdue) + ty2 5,000 (due 5 Apr, unpaid → overdue)
    expect(o.rent).toEqual({ due: 1_500_000, received: 3_000_000, balance: 1_500_000, overdue: 1_500_000, overdueTenants: 2 })
    expect(o.electricity).toEqual({ due: 80_000, received: 30_000, balance: 50_000 })
    expect(o.expenses.total).toBe(200_000)
  })

  it('year to date for one building', () => {
    const o = periodOverview(data, overviewRange('year', today), 'B01')
    // Jan–Apr: 40,000 due, 25,000 paid → 15,000 left (Mar half + Apr)
    expect(o.rent).toEqual({ due: 4_000_000, received: 2_500_000, balance: 1_500_000, overdue: 1_500_000, overdueTenants: 1 })
    expect(o.expenses).toMatchObject({ owner: 200_000, tenant: 0, total: 200_000 })
    const b2 = periodOverview(data, overviewRange('year', today), 'B02')
    expect(b2.rent).toMatchObject({ due: 1_000_000, received: 500_000, balance: 500_000 })
    expect(b2.expenses.tenant).toBe(100_000)
  })
})

describe('reversed periods', () => {
  it('a period reversed at move-out does not count as rent due', () => {
    const april = charges.find((c) => c.tenancyId === 'ty2' && c.start === '2026-04-05')
    const reversal = { id: 'rev1', tenancyId: 'ty2', account: 'rent', source: 'adjustment', amount: -april.amount, due: april.due, reverses: april.id }
    const rows = allocatedCharges(tenancies, [...charges, elec, reversal], payments, today)
    const o = periodOverview({ ...data, rows }, overviewRange('month', today), 'B02')
    expect(o.rent).toMatchObject({ due: 0, balance: 0, overdue: 0 })
  })
})

describe('building filter and rent tree', () => {
  it('several buildings add up; an empty list means all', () => {
    const range = overviewRange('year', today)
    const both = periodOverview(data, range, ['B01', 'B02'])
    expect(both).toEqual(periodOverview(data, range, []))
    expect(both.rent.due).toBe(periodOverview(data, range, 'B01').rent.due + periodOverview(data, range, 'B02').rent.due)
    expect(both.expenses.total).toBe(300_000)
  })

  it('rolls rent up flat → floor → building; vacant flats show zero', () => {
    const buildings = [{ code: 'B01', name: 'One' }, { code: 'B02', name: 'Two' }]
    const flats = [
      { code: 'B01-G-1', buildingId: 'B01', floor: 'Ground' },
      { code: 'B01-G-2', buildingId: 'B01', floor: 'Ground' },
      { code: 'B01-1-1', buildingId: 'B01', floor: '1st' },
      { code: 'B02-1-1', buildingId: 'B02', floor: '1st' },
    ]
    const order = (f) => ({ Ground: 0, '1st': 1 })[f]
    const tree = rentTree(data, overviewRange('year', today), buildings, flats, order)
    const b1 = tree[0]
    expect(b1.totals).toEqual({ due: 4_000_000, received: 2_500_000, balance: 1_500_000 })
    expect(b1.floors.map((f) => f.floor)).toEqual(['Ground', '1st'])
    expect(b1.floors[0].totals).toEqual(b1.totals)
    expect(b1.floors[0].flats[1].totals).toEqual({ due: 0, received: 0, balance: 0 })
    expect(tree[1].totals).toEqual({ due: 1_000_000, received: 500_000, balance: 500_000 })
    expect(rentTree(data, overviewRange('year', today), buildings, flats, order, ['B02']).map((b) => b.code)).toEqual(['B02'])
  })
})

describe('flatTimeline', () => {
  const a = { id: 'a', flatId: 'F1', moveIn: '2026-02-01', moveOut: '2026-07-31' }
  const b = { id: 'b', flatId: 'F1', moveIn: '2026-09-01', moveOut: null }

  it('is null for a flat that never had a tenant', () => {
    expect(flatTimeline('F1', [], '2026-11-23')).toBeNull()
  })

  it('lists tenants and empty gaps, oldest first, to the end of this month', () => {
    const tl = flatTimeline('F1', [b, a], '2026-11-23')
    expect(tl.start).toBe('2026-02-01')
    expect(tl.end).toBe('2026-11-30')
    expect(tl.segments).toEqual([
      { kind: 'tenant', start: '2026-02-01', end: '2026-07-31', tenancyId: 'a', ongoing: false },
      { kind: 'empty', start: '2026-08-01', end: '2026-08-31' },
      { kind: 'tenant', start: '2026-09-01', end: '2026-11-23', tenancyId: 'b', ongoing: true },
    ])
  })

  it('shows the flat empty since the last tenant left', () => {
    const tl = flatTimeline('F1', [a], '2026-11-23')
    expect(tl.segments.at(-1)).toEqual({ kind: 'empty', start: '2026-08-01', end: '2026-11-23', ongoing: true })
  })

  it('extends to a recorded future move-out', () => {
    const tl = flatTimeline('F1', [{ ...b, moveOut: '2027-01-15' }], '2026-11-23')
    expect(tl.end).toBe('2027-01-31')
    expect(tl.segments).toHaveLength(1)
  })
})

describe('labels', () => {
  it('durations and month names', () => {
    expect(durationLabel('2026-08-01', '2026-09-30')).toBe('2 months')
    expect(durationLabel('2026-08-01', '2026-08-12')).toBe('12 days')
    expect(monthLabel('2026-02-14')).toBe('Feb 2026')
  })
})
