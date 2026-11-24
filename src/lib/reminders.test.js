// Made-up data only.
import { describe, expect, it } from 'vitest'
import { computeReminders, dashboardFigures, nextRentDue, reminderSummary } from './reminders.js'
import { dueRentCharges } from './collections.js'

const t1 = { id: 'ty1', tenantId: 't1', flatId: 'B01-G-1', buildingId: 'B01', moveIn: '2026-06-10', moveOut: null, monthlyRent: 1_000_000, trackFrom: '2026-10-10', agreementEnd: '2026-11-25' }
const t2 = { id: 'ty2', tenantId: 't2', flatId: 'B01-2-1', buildingId: 'B01', moveIn: '2026-06-22', moveOut: null, monthlyRent: 800_000, trackFrom: '2026-10-22', agreementEnd: '2027-06-21' }
const tenants = [{ id: 't1', name: 'TEST One' }, { id: 't2', name: 'TEST Two' }]
const flats = [
  { code: 'B01-G-1', buildingId: 'B01', ownUse: false, connectionId: 'CA_S' },
  { code: 'B01-2-1', buildingId: 'B01', ownUse: false, connectionId: 'CA_O' },
  { code: 'B01-1-1', buildingId: 'B01', ownUse: false, connectionId: 'CA_S' },
  { code: 'B06-1-1', buildingId: 'B06', ownUse: true, connectionId: null },
]
const connections = [{ caNumber: 'CA_S', submeter: true }, { caNumber: 'CA_O', submeter: false }]
const today = '2026-11-20'

function data(extra = {}) {
  const charges = [...dueRentCharges(t1, [], today), ...dueRentCharges(t2, [], today)]
  return { tenancies: [t1, t2], tenants, flats, connections, charges, payments: [], bills: [], ownReminders: [], expenses: [], ...extra }
}

describe('nextRentDue', () => {
  it('is the next move-in anniversary after today', () => {
    expect(nextRentDue(t1, today)).toBe('2026-12-10')
    expect(nextRentDue(t2, today)).toBe('2026-11-22')
    expect(nextRentDue({ ...t1, moveOut: '2026-12-01' }, today)).toBeNull()
  })
})

describe('computeReminders', () => {
  it('lists rent overdue, rent due within 3 days and agreements ending', () => {
    const r = computeReminders(data(), today)
    const ids = r.map((x) => x.id)
    expect(ids).toContain('rent-overdue-ty1') // Oct and Nov periods unpaid
    expect(ids).toContain('rent-soon-ty2-2026-11-22') // next period in 2 days
    expect(r.find((x) => x.id === 'agr-ty1')).toMatchObject({ level: 'soon', title: 'Agreement ends within 7 days' })
    expect(r.find((x) => x.id === 'rent-overdue-ty1').title).toBe('Rent overdue: 20,000')
    expect(r[0].level).toBe('overdue')
  })

  it('shows electricity due, unpaid Tata bills and own reminders; hides done ones', () => {
    const elec = { id: 'bill1_elec_B01-G-1', tenancyId: 'ty1', account: 'electricity', source: 'submeter', amount: 24_000, due: '2026-11-22', start: '2026-09-30', end: '2026-10-31' }
    const bills = [
      { id: 'b1', connectionId: 'CA_S', amount: 245_000, dueDate: '2026-11-18', status: 'unpaid', payer: 'family' },
      { id: 'b2', connectionId: 'CA_O', amount: 150_000, dueDate: '2026-12-05', status: 'paid', payer: 'tenant' },
    ]
    const ownReminders = [
      { id: 'o1', title: 'Water tank cleaning', date: '2026-11-21', done: false },
      { id: 'o2', title: 'Old task', date: '2026-11-01', done: true },
    ]
    const d = data({ bills, ownReminders })
    d.charges.push(elec)
    const r = computeReminders(d, today)
    expect(r.find((x) => x.kind === 'electricity')).toMatchObject({ level: 'soon', title: 'Electricity due: 240' })
    expect(r.find((x) => x.id === 'bill-b1')).toMatchObject({ level: 'overdue' })
    expect(r.some((x) => x.id === 'bill-b2')).toBe(false)
    expect(r.find((x) => x.id === 'own-o1')).toMatchObject({ level: 'soon', title: 'Water tank cleaning' })
    expect(r.some((x) => x.id === 'own-o2')).toBe(false)
  })

  it('summarises urgent reminders for the daily push', () => {
    const r = computeReminders(data(), today)
    expect(reminderSummary(r)).toBe('3 rents · 1 agreement')
    expect(reminderSummary([])).toBe('')
  })
})

describe('dashboardFigures', () => {
  it('reports rent this month, outstanding, occupancy and expenses', () => {
    const expenses = [{ date: '2026-11-05', amount: 5000, payer: 'owner', buildingId: 'B01', shares: {} }]
    const f = dashboardFigures(data({ expenses, payments: [{ id: 'p1', tenancyId: 'ty1', account: 'rent', amount: 1_000_000, date: '2026-11-11', method: 'upi' }] }), today)
    expect(f).toMatchObject({ occupied: 2, vacant: 1, ownUse: 1 })
    expect(f.rentDue).toBe(1_000_000) // ty1 November period (ty2's starts 22 Nov)
    expect(f.rentReceived).toBe(1_000_000)
    expect(f.outstanding).toBe(1_000_000 + 800_000) // ty1 one period left after payment, ty2 October period
    expect(f.expenses).toMatchObject({ owner: 5000, total: 5000 })
  })
})
