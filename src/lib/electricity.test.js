// Made-up data only.
import { describe, expect, it } from 'vitest'
import { billPayer, connectionGroup, connectionKind, connectionStatus, electricityChargeId, isValidRate, lastReading, planBill } from './electricity.js'

const shared = { caNumber: 'CA_TEST_1', type: 'domestic', submeter: true }
const own = { caNumber: 'CA_TEST_2', type: 'domestic', submeter: false }
const flatA = { code: 'B01-G-1', buildingId: 'B01', ownUse: false }
const flatB = { code: 'B01-1-1', buildingId: 'B01', ownUse: false }
const home = { code: 'B06-2-1', buildingId: 'B06', ownUse: true }
const tenancyA = { id: 'tyA', flatId: 'B01-G-1' }

const bill = {
  billDate: '2026-11-05', periodStart: '2026-10-01', periodEnd: '2026-10-31', amount: '2,450',
  dueDate: '2026-11-20', payer: 'family', status: 'unpaid', notes: '',
}

describe('connections and payers', () => {
  it('follows Tenant applicable: shared → family; own meter → tenant (even vacant); own use → family', () => {
    expect(connectionKind(shared)).toBe('shared')
    expect(billPayer(shared, [flatA, flatB])).toBe('family')
    expect(billPayer(own, [flatA])).toBe('tenant') // tenant applicable, occupied or vacant
    expect(billPayer(own, [home])).toBe('family') // own use
    expect([connectionGroup(shared, [flatA, flatB]), connectionGroup(own, [flatA]), connectionGroup(own, [home])])
      .toEqual(['shared', 'tenant', 'own-use'])
    expect(connectionGroup(shared, [home, { ...home, code: 'B06-3-1' }])).toBe('own-use')
  })

  it('validates the rate', () => {
    expect(['4', '6.50', '0.5'].map(isValidRate)).toEqual([true, true, true])
    expect(['', '0', 'abc', '4.555', '-1'].map(isValidRate)).toEqual([false, false, false, false, false])
  })

  it('finds the latest reading of a flat, ignoring voided ones', () => {
    const readings = [
      { id: 'r1', flatId: 'B01-G-1', readingDate: '2026-09-30', currentReading: '100' },
      { id: 'r2', flatId: 'B01-G-1', readingDate: '2026-10-31', currentReading: '160' },
      { id: 'r3', flatId: 'B01-G-1', readingDate: '2026-11-30', currentReading: '999', deleted: true },
    ]
    expect(lastReading(readings, 'B01-G-1').id).toBe('r2')
    expect(lastReading(readings, 'B01-1-1')).toBeNull()
  })
})

describe('planBill', () => {
  const base = { billId: 'bill1', connection: shared, flats: [flatA, flatB], rate: '4', bill }

  it('charges the occupied flat units x rate, due on the bill due date; vacant flats are read but not charged', () => {
    const plan = planBill({
      ...base,
      entries: { 'B01-G-1': { previous: '100', current: '160' }, 'B01-1-1': { previous: '50', current: '70' } },
      tenancyOn: (code) => (code === 'B01-G-1' ? tenancyA : null),
    })
    expect(plan.errors).toEqual({})
    expect(plan.bill.amount).toBe(245_000)
    expect(plan.readings.map((r) => [r.flatId, r.units, r.chargeId])).toEqual([
      ['B01-G-1', '60', electricityChargeId('bill1', 'B01-G-1')],
      ['B01-1-1', '20', null],
    ])
    expect(plan.charges).toHaveLength(1)
    expect(plan.charges[0]).toMatchObject({
      id: 'bill1_elec_B01-G-1', tenancyId: 'tyA', account: 'electricity', source: 'submeter',
      amount: 24_000, due: '2026-11-20', units: '60', rate: '4', start: '2026-09-30', end: '2026-10-31',
    })
  })

  it('uses the previous reading date when known', () => {
    const plan = planBill({
      ...base,
      flats: [flatA],
      entries: { 'B01-G-1': { previous: '100', current: '110' } },
      previousDates: { 'B01-G-1': '2026-09-28' },
      tenancyOn: () => tenancyA,
    })
    expect(plan.charges[0].start).toBe('2026-09-28')
  })

  it('blocks a lower reading unless a reset is recorded', () => {
    const tenancyOn = () => tenancyA
    const bad = planBill({ ...base, flats: [flatA], entries: { 'B01-G-1': { previous: '160', current: '20' } }, tenancyOn })
    expect(bad.errors['reading_B01-G-1']).toMatch(/reset/)
    const ok = planBill({
      ...base,
      flats: [flatA],
      entries: { 'B01-G-1': { previous: '160', current: '20', resetUnits: '25', resetReason: 'Meter replaced' } },
      tenancyOn,
    })
    expect(ok.errors).toEqual({})
    expect(ok.charges[0]).toMatchObject({ units: '25', amount: 10_000 })
    expect(ok.readings[0].resetReason).toBe('Meter replaced')
  })

  it('needs readings for every sub-meter, a rate, and valid bill fields', () => {
    const plan = planBill({ ...base, rate: '', bill: { ...bill, amount: 'x', periodEnd: '2026-09-01', status: 'paid' }, tenancyOn: () => null })
    expect(Object.keys(plan.errors).sort()).toEqual(['amount', 'paidOn', 'periodEnd'])
    const noReadings = planBill({ ...base, rate: '', tenancyOn: () => null })
    expect(Object.keys(noReadings.errors).sort()).toEqual(['rate', 'reading_B01-1-1', 'reading_B01-G-1'])
  })

  it('own meters need no readings and create no tenant charge', () => {
    const plan = planBill({ billId: 'bill2', connection: own, flats: [flatA], rate: '', bill: { ...bill, payer: 'tenant' }, tenancyOn: () => tenancyA })
    expect(plan.errors).toEqual({})
    expect(plan.readings).toEqual([])
    expect(plan.charges).toEqual([])
  })
})

describe('connectionStatus', () => {
  it('distinguishes no bill, unpaid, overdue and paid', () => {
    expect(connectionStatus([], '2026-11-20').status).toBe('no-bill')
    const b = (id, billDate, dueDate, status, extra = {}) => ({ id, billDate, dueDate, status, ...extra })
    expect(connectionStatus([b('1', '2026-11-05', '2026-11-25', 'unpaid')], '2026-11-20').status).toBe('unpaid')
    expect(connectionStatus([b('1', '2026-11-05', '2026-11-15', 'unpaid')], '2026-11-20').status).toBe('overdue')
    expect(connectionStatus([b('1', '2026-11-05', '2026-11-15', 'paid')], '2026-11-20').status).toBe('paid')
    expect(connectionStatus([b('1', '2026-11-05', '2026-11-15', 'unpaid', { deleted: true })], '2026-11-20').status).toBe('no-bill')
  })
})
