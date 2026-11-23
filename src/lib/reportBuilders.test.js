// Made-up data only.
import { describe, expect, it } from 'vitest'
import { buildReport, REPORTS, yearRange } from './reportBuilders.js'
import { dueRentCharges } from './collections.js'

const today = '2026-11-20'
const buildings = [{ code: 'B01', name: 'Test Building' }, { code: 'B06', name: 'Test Home' }]
const flats = [
  { code: 'B01-G-1', buildingId: 'B01', floor: 'Ground', position: '1', ownUse: false, connectionId: 'CA_S' },
  { code: 'B01-1-1', buildingId: 'B01', floor: '1st', position: '1', ownUse: false, connectionId: 'CA_S' },
  { code: 'B06-1-1', buildingId: 'B06', floor: '1st', position: '1', ownUse: true, connectionId: 'CA_H' },
]
const tenants = [{ id: 't1', name: 'TEST One', mobile: '9000000001', members: 3, twoWheelers: 1, fourWheelers: 0, idType: 'aadhaar', idNumber: '000000001234' }]
const t1 = { id: 'ty1', tenantId: 't1', flatId: 'B01-G-1', buildingId: 'B01', moveIn: '2026-09-10', moveOut: null, monthlyRent: 1_000_000, trackFrom: '2026-09-10', agreementEnd: '2027-09-09' }
const charges = [
  ...dueRentCharges(t1, [], today), // Sep, Oct, Nov
  { id: 'bill1_elec_B01-G-1', tenancyId: 'ty1', account: 'electricity', source: 'submeter', amount: 24_000, due: '2026-11-10', start: '2026-09-30', end: '2026-10-31' },
]
const payments = [
  { id: 'p1', tenancyId: 'ty1', account: 'rent', amount: 2_000_000, date: '2026-10-15', method: 'upi' },
  { id: 'p2', tenancyId: 'ty1', account: 'electricity', amount: 10_000, date: '2026-11-12', method: 'cash' },
]
const bills = [
  { id: 'b1', connectionId: 'CA_S', billDate: '2026-11-05', periodStart: '2026-10-01', periodEnd: '2026-10-31', dueDate: '2026-11-20', amount: 245_000, payer: 'family', status: 'paid', paidOn: '2026-11-18' },
  { id: 'b2', connectionId: 'CA_H', billDate: '2026-11-06', periodStart: '2026-10-01', periodEnd: '2026-10-31', dueDate: '2026-11-21', amount: 99_000, payer: 'family', status: 'unpaid' },
]
const categories = [{ id: 'c1', name: 'Repairs' }, { id: 'c2', name: 'Paint' }]
const expenses = [
  { date: '2026-11-02', amount: 10_001, payer: 'owner', paymentMode: 'upi', buildingId: 'B01', flatId: null, categoryId: 'c1', description: 'Tank', shares: { 'B01-G-1': 5001, 'B01-1-1': 5000 } },
  { date: '2026-03-01', amount: 4000, payer: 'tenant', paymentMode: 'cash', buildingId: 'B01', flatId: 'B01-1-1', categoryId: 'c2', description: 'Paint', shares: { 'B01-1-1': 4000 } },
  { date: '2025-12-01', amount: 999, payer: 'owner', paymentMode: 'cash', buildingId: 'B01', flatId: null, categoryId: 'c1', description: 'Old', shares: { 'B01-G-1': 999 } },
]
const data = { buildings, flats, tenants, tenancies: [t1], charges, payments, bills, expenses, categories }
const build = (key, filters = {}) => buildReport(key, data, { year: 2026, filters, today })

describe('reports', () => {
  it('lists the six chosen reports and uses the calendar year up to today', () => {
    expect(REPORTS.map((r) => r.key)).toEqual(['rent', 'outstanding', 'expenses', 'electricity', 'occupancy', 'tenants'])
    expect(yearRange(2026, today)).toEqual({ start: '2026-01-01', end: '2026-12-31', asOf: today })
    expect(yearRange(2025, today).asOf).toBe('2025-12-31')
  })

  it('rent collection: rent for the year, received and outstanding', () => {
    const [table] = build('rent').tables
    expect(table.rows[0]).toMatchObject({ tenant: 'TEST One', rentForYear: 3_000_000 }) // Sep, Oct, Nov periods
    expect(table.rows[0].received).toBe(2_000_000)
    expect(table.rows[0].outstanding).toBe(1_000_000)
    expect(table.totals.received).toBe(2_000_000)
  })

  it('outstanding dues: rent and electricity, oldest first', () => {
    const [table] = build('outstanding').tables
    expect(table.rows).toHaveLength(1)
    expect(table.rows[0]).toMatchObject({ rent: 1_000_000, electricity: 14_000, total: 1_014_000, oldest: '2026-11-10' })
  })

  it('expenses: by category and in full; a flat filter uses only that flat share', () => {
    const [byCat, all] = build('expenses').tables
    expect(byCat.totals).toMatchObject({ family: 10_001, tenant: 4000, total: 14_001 })
    expect(all.rows.map((r) => r.date)).toEqual(['2026-03-01', '2026-11-02']) // 2025 excluded
    const [flatCat] = build('expenses', { flatId: 'B01-G-1' }).tables
    expect(flatCat.totals.total).toBe(5001)
  })

  it('electricity: tenant charges and Tata bills', () => {
    const [tenantTable, billTable] = build('electricity').tables
    expect(tenantTable.rows[0]).toMatchObject({ charged: 24_000, received: 10_000, outstanding: 14_000 })
    expect(billTable.rows.map((r) => r.status)).toEqual(['Unpaid', 'Paid 2026-11-18'])
    expect(build('electricity', { buildingId: 'B01' }).tables[1].rows).toHaveLength(1)
  })

  it('occupancy and tenant list (ID masked)', () => {
    const [occ, vacant] = build('occupancy').tables
    expect(occ.totals).toMatchObject({ flats: 3, occupied: 1, vacant: 1, ownUse: 1 })
    expect(vacant.rows.map((r) => r.code)).toEqual(['B01-1-1'])
    const [list] = build('tenants').tables
    expect(list.rows[0]).toMatchObject({ tenant: 'TEST One', id: 'Aadhaar •••• 1234', members: 3 })
    expect(list.rows[0].id).not.toContain('00000000')
  })
})
