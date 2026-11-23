// Monthly sheet: one row per tenant for a calendar month, showing rent and electricity
// paid / amount / date / mode — the owner's monthly checklist (requested 2026-11-20).
// Pure function; the same records as Collections, laid out by month.

import { tenancyLedger } from './collections.js'
import { compareDates } from './money/index.js'

function inMonth(date, month) {
  return date && compareDates(date, month.start) >= 0 && compareDates(date, month.end) <= 0
}

/** Payment details (total, dates, modes) for the given charge rows of a ledger. */
function paymentDetails(ledger, chargeIds, paymentsById) {
  const parts = ledger.allocations.filter((a) => chargeIds.includes(a.chargeId))
  const paid = parts.reduce((s, a) => s + a.amount, 0)
  const used = [...new Set(parts.map((a) => a.paymentId))].map((id) => paymentsById.get(id)).filter(Boolean)
  return {
    paid,
    dates: [...new Set(used.map((p) => p.date))].sort(),
    methods: [...new Set(used.map((p) => p.method))],
  }
}

function status(due, remaining, overdue) {
  if (due === 0) return 'none'
  if (remaining === 0) return 'paid'
  if (remaining < due) return overdue ? 'part-overdue' : 'part'
  return overdue ? 'overdue' : 'unpaid'
}

/**
 * Rows of the monthly sheet for `month` = { start, end }.
 * data: { tenancies, tenants, flats, connections, charges, payments, bills }
 * Each row: { tenancy, tenant, flat,
 *   rent: { due, paid, remaining, status, dates, methods, period },
 *   electricity: { kind: 'shared' | 'own' | 'none', due, paid, remaining, status, dates, methods, bill } }
 */
export function monthlySheet(data, month, today) {
  const { tenancies, tenants, flats, connections, charges, payments, bills } = data
  const paymentsById = new Map(payments.map((p) => [p.id, p]))
  return tenancies
    .filter((t) => compareDates(t.moveIn, month.end) <= 0 && (!t.moveOut || compareDates(t.moveOut, month.start) >= 0))
    .map((t) => {
      const flat = flats.find((f) => f.code === t.flatId)
      const tenant = tenants.find((x) => x.id === t.tenantId)

      const rentLedger = tenancyLedger(t, charges, payments, today, 'rent')
      const rentRows = rentLedger.rows.filter((c) => c.source === 'rent' && inMonth(c.due, month))
      const rentDue = rentRows.reduce((s, c) => s + c.amount - c.adjusted, 0)
      const rentLeft = rentRows.reduce((s, c) => s + c.remaining, 0)
      const rent = {
        due: rentDue,
        remaining: rentLeft,
        status: status(rentDue, rentLeft, rentRows.some((c) => c.overdue)),
        period: rentRows.length ? `${rentRows[0].start} to ${rentRows[rentRows.length - 1].end}` : '',
        ...paymentDetails(rentLedger, rentRows.map((c) => c.id), paymentsById),
      }

      const connection = connections.find((c) => c.caNumber === flat?.connectionId)
      let electricity = { kind: 'none', due: 0, paid: 0, remaining: 0, status: 'none', dates: [], methods: [], bill: null }
      if (connection?.submeter) {
        const ledger = tenancyLedger(t, charges, payments, today, 'electricity')
        const rows = ledger.rows.filter((c) => inMonth(c.due, month))
        const due = rows.reduce((s, c) => s + c.amount - c.adjusted, 0)
        const left = rows.reduce((s, c) => s + c.remaining, 0)
        electricity = {
          kind: 'shared',
          due,
          remaining: left,
          status: status(due, left, rows.some((c) => c.overdue)),
          bill: null,
          ...paymentDetails(ledger, rows.map((c) => c.id), paymentsById),
        }
      } else if (connection) {
        // Own meter: the tenant pays Tata Power directly; show that month's bill status.
        const bill = bills
          .filter((b) => !b.deleted && b.connectionId === connection.caNumber && inMonth(b.billDate, month))
          .sort((a, b) => compareDates(b.billDate, a.billDate))[0]
        electricity = {
          kind: 'own',
          due: bill?.amount ?? 0,
          paid: bill?.status === 'paid' ? bill.amount : 0,
          remaining: bill && bill.status !== 'paid' ? bill.amount : 0,
          status: !bill ? 'no-bill' : bill.status === 'paid' ? 'paid' : compareDates(bill.dueDate, today) < 0 ? 'overdue' : 'unpaid',
          dates: bill?.paidOn ? [bill.paidOn] : [],
          methods: [],
          bill: bill ?? null,
        }
      }
      return { tenancy: t, tenant, flat, rent, electricity }
    })
    // Building, then floor (Ground, 1st, 2nd…), then position.
    .sort(
      (a, b) =>
        String(a.tenancy.buildingId).localeCompare(String(b.tenancy.buildingId)) ||
        (a.flat?.floorOrder ?? 0) - (b.flat?.floorOrder ?? 0) ||
        String(a.flat?.position ?? '').localeCompare(String(b.flat?.position ?? ''), undefined, { numeric: true }),
    )
}

/** Totals for the sheet footer. */
export function sheetTotals(rows) {
  return rows.reduce(
    (t, r) => ({
      rentDue: t.rentDue + r.rent.due,
      rentPaid: t.rentPaid + r.rent.paid,
      electricityDue: t.electricityDue + (r.electricity.kind === 'shared' ? r.electricity.due : 0),
      electricityPaid: t.electricityPaid + (r.electricity.kind === 'shared' ? r.electricity.paid : 0),
    }),
    { rentDue: 0, rentPaid: 0, electricityDue: 0, electricityPaid: 0 },
  )
}
