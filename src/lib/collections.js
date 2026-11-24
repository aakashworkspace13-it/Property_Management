// Rent collection: which charges are due, ledgers and the Collections list.
// Pure functions built on the money engine (src/lib/money). Rules: docs/REQUIREMENTS.md section 6.

import {
  allocateAccount,
  chargeStatus,
  compareDates,
  generateRentCharges,
  minDate,
  receiptsInRange,
} from './money/index.js'

export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank', label: 'Bank transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'other', label: 'Other' },
]

export function methodLabel(value) {
  return PAYMENT_METHODS.find((m) => m.value === value)?.label ?? value
}

/** The tenancy in the shape the money engine expects. */
export function moneyTenancy(t) {
  return { id: t.id, moveIn: t.moveIn, moveOut: t.moveOut ?? null, monthlyRent: t.monthlyRent, generateFrom: t.trackFrom ?? t.moveIn }
}

/**
 * Rent charges that should exist by `today` but do not yet (periods that have started,
 * from "track rent from", up to the move-out date). `charges` = all charges of the tenancy,
 * including deleted ones. Each new charge also carries flatId and buildingId.
 */
export function dueRentCharges(tenancy, charges, today) {
  const through = tenancy.moveOut ? minDate(today, tenancy.moveOut) : today
  if (compareDates(through, tenancy.trackFrom ?? tenancy.moveIn) < 0) return []
  return generateRentCharges(moneyTenancy(tenancy), through, charges).map((c) => ({
    ...c,
    flatId: tenancy.flatId,
    buildingId: tenancy.buildingId,
  }))
}

/**
 * Ledger of one tenancy and account ('rent' or 'electricity').
 * Returns allocateAccount's result plus:
 *   rows:    charges (positive) with status { status, overdue }
 *   current: the latest rent period that has started (for the quick action), or null
 *   older:   remaining on periods before `current`
 */
export function tenancyLedger(tenancy, charges, payments, today, account = 'rent') {
  const mine = (x) => x.tenancyId === tenancy.id && x.account === account
  const result = allocateAccount(charges.filter(mine), payments.filter(mine))
  const rows = result.charges.map((c) => ({ ...c, ...chargeStatus(c, today) }))
  const started = rows.filter((c) => c.source === 'rent' && compareDates(c.start, today) <= 0)
  const current = started.length ? started[started.length - 1] : null
  const older = rows
    .filter((c) => c !== current && compareDates(c.due, current?.due ?? today) <= 0)
    .reduce((sum, c) => sum + c.remaining, 0)
  return { ...result, rows, current, older }
}

/**
 * One line of the Collections list.
 * status: 'paid' | 'partial' | 'unpaid' | 'overdue' | 'not-due' (no period has started yet)
 */
export function collectionRow(tenancy, charges, payments, today) {
  const ledger = tenancyLedger(tenancy, charges, payments, today)
  const { current } = ledger
  let status = 'not-due'
  if (current) {
    if (current.remaining === 0) status = ledger.older > 0 ? 'overdue' : 'paid'
    else if (current.overdue || ledger.older > 0) status = 'overdue'
    else status = current.received > 0 ? 'partial' : 'unpaid'
  } else if (ledger.totals.outstanding > 0) status = 'overdue'
  const electricity = tenancyLedger(tenancy, charges, payments, today, 'electricity')
  return {
    tenancyId: tenancy.id,
    status,
    electricityOutstanding: electricity.totals.outstanding,
    electricityOverdue: electricity.rows.some((c) => c.overdue),
    electricityCredit: electricity.totals.credit + electricity.totals.adjustmentCredit,
    current,
    currentRemaining: current?.remaining ?? 0,
    quickAmount: current?.remaining ?? 0, // the displayed period's remaining amount
    older: ledger.older,
    outstanding: ledger.totals.outstanding,
    credit: ledger.totals.credit + ledger.totals.adjustmentCredit,
    net: ledger.totals.net,
  }
}

const ORDER = { overdue: 0, unpaid: 1, partial: 2, 'not-due': 3, paid: 4 }

/** Overdue first, then unpaid, partial, not yet due, paid; ties by flat code. */
export function sortCollectionRows(rows) {
  return [...rows].sort((a, b) => ORDER[a.status] - ORDER[b.status] || String(a.flatId).localeCompare(String(b.flatId)))
}

/**
 * Rent due and received in [start, end]: rent periods by due date (no openings), receipts by
 * payment date. A period reversed at move-out does not count; a period corrected at move-out
 * counts at its corrected (prorated) amount.
 */
export function periodSummary(charges, payments, start, end) {
  const live = charges.filter((c) => !c.deleted && c.account === 'rent')
  const reversed = new Set(live.filter((c) => c.reverses).map((c) => c.reverses))
  const corrected = new Map(live.filter((c) => c.corrects).map((c) => [c.corrects, c.correctedAmount]))
  const due = live
    .filter((c) => c.source === 'rent' && !reversed.has(c.id))
    .filter((c) => compareDates(c.due, start) >= 0 && compareDates(c.due, end) <= 0)
    .reduce((s, c) => s + (corrected.get(c.id) ?? c.amount), 0)
  return { due, received: receiptsInRange(payments, 'rent', start, end) }
}

/** First and last day of the calendar month containing `date`. */
export function monthRange(date) {
  const [y, m] = date.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const mm = String(m).padStart(2, '0')
  return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(last).padStart(2, '0')}` }
}
