// Expenses, monthly sheet and agreement renewal. Made-up data only.
import { describe, expect, it } from 'vitest'
import { expenseSummary, validateCategoryName, validateExpense } from './expenseRecords.js'
import { monthlySheet, sheetTotals } from './monthlySheet.js'
import { validateRenewal } from './tenants.js'
import { dueRentCharges } from './collections.js'

describe('validateExpense', () => {
  const base = {
    date: '2026-11-15', amount: '1,000.01', categoryId: 'repairs', buildingId: 'B01', flatId: '', payer: 'owner',
    paymentMode: 'upi', description: 'Water tank cleaning',
  }

  it('splits a building expense across all flats (incl. vacant) to the exact paisa', () => {
    const { value, errors } = validateExpense(base, ['B01-G-1', 'B01-1-1', 'B01-2-1'])
    expect(errors).toEqual({})
    expect(value.amount).toBe(100_001)
    expect(value.shares).toEqual({ 'B01-1-1': 33_334, 'B01-2-1': 33_334, 'B01-G-1': 33_333 })
  })

  it('a flat expense belongs wholly to that flat', () => {
    const { value } = validateExpense({ ...base, flatId: 'B01-G-1' }, ['B01-G-1', 'B01-1-1'])
    expect(value.shares).toEqual({ 'B01-G-1': 100_001 })
  })

  it('reports missing and invalid fields', () => {
    const { errors } = validateExpense({ ...base, amount: 'x', categoryId: '', payer: 'bank', paymentMode: 'gold', description: '' }, ['B01-G-1'])
    expect(Object.keys(errors).sort()).toEqual(['amount', 'categoryId', 'description', 'payer', 'paymentMode'])
    expect(validateExpense({ ...base, flatId: 'B09-G-1' }, ['B01-G-1']).errors.flatId).toBeTruthy()
    expect(validateExpense(base, []).errors.flatId).toMatch(/flats/)
  })
})

describe('expenseSummary', () => {
  const expenses = [
    { date: '2026-11-02', amount: 10_000, payer: 'owner', buildingId: 'B01', categoryId: 'repairs', shares: { 'B01-G-1': 5000, 'B01-1-1': 5000 } },
    { date: '2026-11-10', amount: 4000, payer: 'tenant', buildingId: 'B01', categoryId: 'paint', shares: { 'B01-G-1': 4000 } },
    { date: '2026-10-30', amount: 999, payer: 'owner', buildingId: 'B01', categoryId: 'repairs', shares: { 'B01-G-1': 999 } },
    { date: '2026-11-11', amount: 7000, payer: 'owner', buildingId: 'B02', categoryId: 'tax', shares: { 'B02-G-1': 7000 }, deleted: true },
  ]
  it('totals by payer within dates, once per expense', () => {
    expect(expenseSummary(expenses, '2026-11-01', '2026-11-30')).toEqual({ owner: 10_000, tenant: 4000, total: 14_000, count: 2 })
  })
  it('filters by building, flat (share only) and category', () => {
    expect(expenseSummary(expenses, '2026-11-01', '2026-11-30', { flatId: 'B01-G-1' }).total).toBe(9000)
    expect(expenseSummary(expenses, '2026-11-01', '2026-11-30', { categoryId: 'paint' }).tenant).toBe(4000)
    expect(expenseSummary(expenses, '2026-11-01', '2026-11-30', { buildingId: 'B02' }).count).toBe(0)
  })
  it('validates category names', () => {
    const cats = [{ id: 'a', name: 'Repairs' }]
    expect(validateCategoryName(' repairs ', cats).error).toMatch(/exists/)
    expect(validateCategoryName('Repairs', cats, 'a')).toEqual({ name: 'Repairs' })
    expect(validateCategoryName('Lift service', cats)).toEqual({ name: 'Lift service' })
  })
})

describe('validateRenewal', () => {
  const tenancy = { agreementStart: '2025-12-10', agreementEnd: '2026-12-09', agreementHistory: [] }
  it('moves the current agreement into history', () => {
    const { value, errors } = validateRenewal(tenancy, { start: '2026-12-10', end: '2027-12-09' })
    expect(errors).toEqual({})
    expect(value).toEqual({ agreementStart: '2026-12-10', agreementEnd: '2027-12-09', agreementHistory: [{ start: '2025-12-10', end: '2026-12-09' }] })
  })
  it('rejects bad renewals', () => {
    expect(validateRenewal(tenancy, { start: '2025-01-01', end: '2026-01-01' }).errors.start).toBeTruthy()
    expect(validateRenewal(tenancy, { start: '2026-12-10', end: '2026-01-01' }).errors.end).toBeTruthy()
  })
})

describe('monthlySheet', () => {
  const flats = [
    { code: 'B01-G-1', buildingId: 'B01', floorOrder: 0, position: '1', connectionId: 'CA_S' },
    { code: 'B01-2-1', buildingId: 'B01', floorOrder: 2, position: '1', connectionId: 'CA_O' },
  ]
  const connections = [{ caNumber: 'CA_S', submeter: true }, { caNumber: 'CA_O', submeter: false }]
  const t1 = { id: 'ty1', tenantId: 't1', flatId: 'B01-G-1', buildingId: 'B01', moveIn: '2026-06-10', moveOut: null, monthlyRent: 1_000_000, trackFrom: '2026-10-10' }
  const t2 = { id: 'ty2', tenantId: 't2', flatId: 'B01-2-1', buildingId: 'B01', moveIn: '2026-06-10', moveOut: null, monthlyRent: 800_000, trackFrom: '2026-11-10' }
  const tenants = [{ id: 't1', name: 'TEST One' }, { id: 't2', name: 'TEST Two' }]
  const charges = [
    ...dueRentCharges(t1, [], '2026-11-20'),
    ...dueRentCharges(t2, [], '2026-11-20'),
    { id: 'bill1_elec_B01-G-1', tenancyId: 'ty1', account: 'electricity', source: 'submeter', amount: 24_000, due: '2026-11-25', start: '2026-09-30', end: '2026-10-31' },
  ]
  const payments = [
    { id: 'p1', tenancyId: 'ty1', account: 'rent', amount: 1_000_000, date: '2026-10-12', method: 'cash' },
    { id: 'p2', tenancyId: 'ty1', account: 'rent', amount: 400_000, date: '2026-11-12', method: 'upi' },
    { id: 'p3', tenancyId: 'ty1', account: 'electricity', amount: 24_000, date: '2026-11-21', method: 'cash' },
  ]
  const bills = [{ id: 'b2', connectionId: 'CA_O', billDate: '2026-11-05', dueDate: '2026-11-25', amount: 150_000, status: 'paid', paidOn: '2026-11-18' }]
  const data = { tenancies: [t1, t2], tenants, flats, connections, charges, payments, bills }
  const month = { start: '2026-11-01', end: '2026-11-30' }

  it('shows rent paid / part / amount / date / mode for the month', () => {
    const [r1, r2] = monthlySheet(data, month, '2026-11-22')
    expect(r1.rent).toMatchObject({ due: 1_000_000, paid: 400_000, remaining: 600_000, status: 'part-overdue', dates: ['2026-11-12'], methods: ['upi'] })
    expect(r2.rent).toMatchObject({ due: 800_000, paid: 0, status: 'overdue' })
  })

  it('shows shared-meter electricity, and the Tata bill status for own meters', () => {
    const [r1, r2] = monthlySheet(data, month, '2026-11-22')
    expect(r1.electricity).toMatchObject({ kind: 'shared', due: 24_000, paid: 24_000, status: 'paid', dates: ['2026-11-21'] })
    expect(r2.electricity).toMatchObject({ kind: 'own', status: 'paid', dates: ['2026-11-18'] })
  })

  it('totals rent and shared electricity', () => {
    expect(sheetTotals(monthlySheet(data, month, '2026-11-22'))).toEqual({
      rentDue: 1_800_000, rentPaid: 400_000, electricityDue: 24_000, electricityPaid: 24_000,
    })
  })

  it('leaves out tenancies not living there that month', () => {
    const gone = { ...t2, moveOut: '2026-10-20' }
    expect(monthlySheet({ ...data, tenancies: [t1, gone] }, month, '2026-11-22')).toHaveLength(1)
  })
})
