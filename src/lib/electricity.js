// Electricity: connection kinds, bill planning with sub-meter readings, bill status.
// Pure functions built on the money engine. Rules: docs/REQUIREMENTS.md section 7 and the owner's
// choices (2026-11-20):
//   - Own meter (one flat, no sub-meter): follows the property sheet's 'Tenant applicable' column
//     (flat.ownUse = not tenant applicable). Tenant applicable → the tenant pays Tata Power directly,
//     even while the flat is vacant (the payer can be changed on a single bill); the app only tracks
//     the bill and it is never the family's income. Not tenant applicable → own use, family pays.
//   - Shared meter (sub-meter = yes): the family pays Tata Power. Readings are taken with each bill;
//     each tenant's charge = units used x one family-wide rate per unit, due on the bill's due date.
//   - Own-use flats (Home, Office): the family pays; nobody is charged.

import { addDays, compareDates, rupeesToPaise, submeterCharge } from './money/index.js'

/** 'shared' (sub-meter, family pays) or 'own' (single flat). */
export function connectionKind(connection) {
  return connection.submeter ? 'shared' : 'own'
}

/**
 * Who pays Tata Power for a connection's bills, from 'Tenant applicable' (owner rule 2026-11-20):
 * shared meters → 'family' (tenants repay their sub-meter share); own meter of a tenant-applicable
 * flat → 'tenant' (occupied or not); own-use flat → 'family'.
 */
export function billPayer(connection, connectionFlats) {
  if (connectionKind(connection) === 'shared') return 'family'
  return connectionFlats.some((f) => !f.ownUse) ? 'tenant' : 'family'
}

/** Group for the Electricity page: 'shared', 'tenant' (tenant pays directly) or 'own-use'. */
export function connectionGroup(connection, connectionFlats) {
  if (connectionKind(connection) === 'shared') return connectionFlats.every((f) => f.ownUse) ? 'own-use' : 'shared'
  return billPayer(connection, connectionFlats) === 'tenant' ? 'tenant' : 'own-use'
}

/** Deterministic ID of a tenant's electricity charge for one bill and flat (never created twice). */
export function electricityChargeId(billId, flatCode) {
  return `${billId}_elec_${flatCode}`
}

/** The latest (non-voided) reading of a flat, or null. */
export function lastReading(readings, flatCode) {
  return (
    readings
      .filter((r) => r.flatId === flatCode && !r.deleted)
      .sort((a, b) => compareDates(b.readingDate, a.readingDate) || String(b.id).localeCompare(String(a.id)))[0] ?? null
  )
}

/** Valid rate text: a positive decimal like "4" or "6.50". */
export function isValidRate(rate) {
  return /^\d{1,4}(\.\d{1,2})?$/.test(String(rate ?? '').trim()) && Number(rate) > 0
}

const ISO = /^\d{4}-\d{2}-\d{2}$/

/**
 * Checks a bill and (for shared meters) its sub-meter readings, and works out each tenant's charge.
 *
 * input: {
 *   billId, connection, flats (of this connection), rate (decimal string),
 *   bill: { billDate, periodStart, periodEnd, amount (rupees text), dueDate, payer, status, paidOn, notes },
 *   entries: { [flatCode]: { previous, current, resetUnits?, resetReason? } }   (shared meters)
 *   previousDates: { [flatCode]: 'YYYY-MM-DD' }   date of the previous reading (else bill periodStart)
 *   tenancyOn: (flatCode) => tenancy | null      tenant living there on the reading date
 * }
 * Returns { errors, bill, readings: [...], charges: [...] } — nothing is saved here.
 */
export function planBill({ billId, connection, flats, rate, bill, entries = {}, previousDates = {}, tenancyOn }) {
  const errors = {}
  const value = {
    connectionId: connection.caNumber,
    billDate: bill.billDate,
    periodStart: bill.periodStart,
    periodEnd: bill.periodEnd,
    dueDate: bill.dueDate,
    payer: bill.payer,
    status: bill.status === 'paid' ? 'paid' : 'unpaid',
    paidOn: bill.status === 'paid' ? bill.paidOn || '' : '',
    notes: String(bill.notes ?? '').trim(),
    amount: null,
  }
  for (const k of ['billDate', 'periodStart', 'periodEnd', 'dueDate']) {
    if (!ISO.test(value[k] ?? '')) errors[k] = 'Enter the date.'
  }
  if (!errors.periodStart && !errors.periodEnd && compareDates(value.periodEnd, value.periodStart) < 0) {
    errors.periodEnd = 'The bill period ends before it starts.'
  }
  if (value.status === 'paid' && !ISO.test(value.paidOn)) errors.paidOn = 'Enter the date it was paid.'
  if (!['family', 'tenant'].includes(value.payer)) errors.payer = 'Choose who pays this bill.'
  try {
    value.amount = rupeesToPaise(bill.amount)
    if (value.amount <= 0) errors.amount = 'Bill amount must be more than zero.'
  } catch {
    errors.amount = 'Enter the bill amount in rupees.'
  }

  const readings = []
  const charges = []
  if (connectionKind(connection) === 'shared' && !errors.periodEnd) {
    if (!isValidRate(rate)) errors.rate = 'Set the electricity rate per unit in Settings first.'
    for (const flat of flats) {
      const e = entries[flat.code] ?? {}
      const field = `reading_${flat.code}`
      if (String(e.current ?? '').trim() === '' || String(e.previous ?? '').trim() === '') {
        errors[field] = 'Enter the previous and current reading.'
        continue
      }
      const previousDate = previousDates[flat.code] ?? addDays(value.periodStart, -1)
      let result
      try {
        result = submeterCharge({
          previous: e.previous,
          current: e.current,
          rate: isValidRate(rate) ? rate : '0',
          previousDate,
          readingDate: value.periodEnd,
          resetUnits: e.resetUnits,
          resetReason: e.resetReason,
        })
      } catch (err) {
        errors[field] = err.message
        continue
      }
      const tenancy = tenancyOn(flat.code)
      const chargeable = tenancy && !flat.ownUse
      const reading = {
        flatId: flat.code,
        connectionId: connection.caNumber,
        billId,
        previousReading: String(e.previous).trim(),
        currentReading: String(e.current).trim(),
        units: result.units,
        previousDate,
        readingDate: value.periodEnd,
        ...(e.resetReason ? { resetReason: String(e.resetReason).trim() } : {}),
        chargeId: chargeable ? electricityChargeId(billId, flat.code) : null,
      }
      readings.push(reading)
      if (chargeable && result.amount > 0) {
        charges.push({
          id: reading.chargeId,
          tenancyId: tenancy.id,
          flatId: flat.code,
          buildingId: flat.buildingId,
          account: 'electricity',
          source: 'submeter',
          amount: result.amount,
          due: value.dueDate,
          start: previousDate,
          end: value.periodEnd,
          units: result.units,
          rate: String(rate).trim(),
          billId,
          reason: `Sub-meter ${reading.previousReading} → ${reading.currentReading}`,
        })
      } else if (chargeable) {
        reading.chargeId = null // nothing used, nothing charged
      }
    }
  }
  return { errors, bill: value, readings, charges }
}

/**
 * Status of a connection from its bills on `today`:
 * 'no-bill' (none recorded) | 'unpaid' | 'overdue' (unpaid after due date) | 'paid' (latest bill paid).
 */
export function connectionStatus(bills, today) {
  const live = bills.filter((b) => !b.deleted).sort((a, b) => compareDates(b.billDate, a.billDate))
  if (live.length === 0) return { status: 'no-bill', latest: null, unpaid: [] }
  const unpaid = live.filter((b) => b.status !== 'paid')
  const overdue = unpaid.some((b) => compareDates(b.dueDate, today) < 0)
  return { status: overdue ? 'overdue' : unpaid.length ? 'unpaid' : 'paid', latest: live[0], unpaid }
}
