// Dashboard reminders and figures. Pure functions (no Firebase), also used by the daily push
// summary. Owner choices (2026-11-21): rent overdue / due within 3 days, agreements ending
// (30 and 7 days, expired), electricity due and unpaid Tata Power bills, own reminders (title + date).

import { collectionRow, monthRange, periodSummary, tenancyLedger } from './collections.js'
import { addDays, anniversary, compareDates, formatINR } from './money/index.js'
import { expenseSummary } from './expenseRecords.js'
import { occupancy } from './property.js'

const SOON_DAYS = 3

function living(t, date) {
  return compareDates(t.moveIn, date) <= 0 && (!t.moveOut || compareDates(t.moveOut, date) >= 0)
}

/** The next rent due date strictly after `today` (move-in anniversary), or null. */
export function nextRentDue(tenancy, today) {
  for (let n = 0; n < 2400; n++) {
    const due = anniversary(tenancy.moveIn, n)
    if (compareDates(due, today) > 0) {
      if (tenancy.moveOut && compareDates(due, tenancy.moveOut) > 0) return null
      if (compareDates(due, tenancy.trackFrom ?? tenancy.moveIn) < 0) continue
      return due
    }
  }
  return null
}

/**
 * All reminders for `today`, most urgent first.
 * Each: { id, kind, level: 'overdue' | 'soon' | 'upcoming', date, title, detail, link }
 */
export function computeReminders(data, today) {
  const { tenancies, tenants, flats, connections, charges, payments, bills, ownReminders = [] } = data
  const name = (t) => tenants.find((x) => x.id === t.tenantId)?.name ?? 'Tenant'
  const soonEnd = addDays(today, SOON_DAYS)
  const out = []

  for (const t of tenancies) {
    const label = `${name(t)} · ${t.flatId}`

    // Rent: overdue (any unpaid period past due) and due today / within 3 days.
    const rent = tenancyLedger(t, charges, payments, today, 'rent')
    const overdue = rent.rows.filter((r) => r.overdue)
    if (overdue.length) {
      out.push({
        id: `rent-overdue-${t.id}`,
        kind: 'rent',
        level: 'overdue',
        date: overdue[0].due,
        title: `Rent overdue: ${formatINR(overdue.reduce((s, r) => s + r.remaining, 0))}`,
        detail: `${label} · since ${overdue[0].due}`,
        link: `/tenancies/${t.id}`,
      })
    }
    const dueToday = rent.rows.filter((r) => r.remaining > 0 && !r.overdue && compareDates(r.due, today) === 0)
    if (dueToday.length) {
      out.push({
        id: `rent-today-${t.id}`,
        kind: 'rent',
        level: 'soon',
        date: today,
        title: `Rent due today: ${formatINR(dueToday.reduce((s, r) => s + r.remaining, 0))}`,
        detail: label,
        link: `/tenancies/${t.id}`,
      })
    }
    if (living(t, today)) {
      const next = nextRentDue(t, today)
      if (next && compareDates(next, soonEnd) <= 0) {
        out.push({
          id: `rent-soon-${t.id}-${next}`,
          kind: 'rent',
          level: 'soon',
          date: next,
          title: `Rent due ${next}: ${formatINR(t.monthlyRent)}`,
          detail: label,
          link: `/tenancies/${t.id}`,
        })
      }

      // Agreement ending.
      if (t.agreementEnd) {
        const end = t.agreementEnd
        if (compareDates(end, today) < 0) {
          out.push({ id: `agr-${t.id}`, kind: 'agreement', level: 'overdue', date: end, title: 'Agreement expired', detail: `${label} · ended ${end}`, link: `/tenants/${t.tenantId}` })
        } else if (compareDates(end, addDays(today, 7)) <= 0) {
          out.push({ id: `agr-${t.id}`, kind: 'agreement', level: 'soon', date: end, title: 'Agreement ends within 7 days', detail: `${label} · ends ${end}`, link: `/tenants/${t.tenantId}` })
        } else if (compareDates(end, addDays(today, 30)) <= 0) {
          out.push({ id: `agr-${t.id}`, kind: 'agreement', level: 'upcoming', date: end, title: 'Agreement ends within 30 days', detail: `${label} · ends ${end}`, link: `/tenants/${t.tenantId}` })
        }
      }
    }

    // Tenant electricity (shared meters).
    const elec = tenancyLedger(t, charges, payments, today, 'electricity')
    const elecDue = elec.rows.filter((r) => r.remaining > 0 && compareDates(r.due, soonEnd) <= 0)
    if (elecDue.length) {
      const isOverdue = elecDue.some((r) => r.overdue)
      out.push({
        id: `elec-${t.id}`,
        kind: 'electricity',
        level: isOverdue ? 'overdue' : 'soon',
        date: elecDue[0].due,
        title: `Electricity ${isOverdue ? 'overdue' : 'due'}: ${formatINR(elecDue.reduce((s, r) => s + r.remaining, 0))}`,
        detail: `${label} · due ${elecDue[0].due}`,
        link: `/tenancies/${t.id}?account=electricity`,
      })
    }
  }

  // Unpaid Tata Power bills.
  for (const b of bills) {
    if (b.deleted || b.status === 'paid') continue
    const isOverdue = compareDates(b.dueDate, today) < 0
    const flatCodes = flats.filter((f) => f.connectionId === b.connectionId).map((f) => f.code)
    const known = connections.some((c) => c.caNumber === b.connectionId)
    out.push({
      id: `bill-${b.id}`,
      kind: 'bill',
      level: isOverdue ? 'overdue' : compareDates(b.dueDate, addDays(today, 7)) <= 0 ? 'soon' : 'upcoming',
      date: b.dueDate,
      title: `Tata Power bill unpaid: ${formatINR(b.amount)}${b.payer === 'tenant' ? ' (tenant pays)' : ''}`,
      detail: `${b.connectionId}${flatCodes.length ? ` · ${flatCodes.join(', ')}` : ''} · due ${b.dueDate}${known ? '' : ' · unknown CA'}`,
      link: '/electricity',
    })
  }

  // Own reminders.
  for (const r of ownReminders) {
    if (r.done) continue
    const level = compareDates(r.date, today) < 0 ? 'overdue' : compareDates(r.date, soonEnd) <= 0 ? 'soon' : 'upcoming'
    out.push({ id: `own-${r.id}`, kind: 'own', level, date: r.date, title: r.title, detail: r.date, link: null, reminderId: r.id })
  }

  const rank = { overdue: 0, soon: 1, upcoming: 2 }
  return out.sort((a, b) => rank[a.level] - rank[b.level] || compareDates(a.date, b.date))
}

/** One-line summary for the daily push, e.g. "2 rent overdue · 1 agreement ending · 1 bill unpaid". */
export function reminderSummary(reminders) {
  const urgent = reminders.filter((r) => r.level !== 'upcoming')
  if (urgent.length === 0) return ''
  const count = (kind) => urgent.filter((r) => r.kind === kind).length
  const parts = [
    [count('rent'), 'rent'],
    [count('agreement'), 'agreement'],
    [count('electricity'), 'electricity'],
    [count('bill'), 'Tata bill'],
    [count('own'), 'reminder'],
  ]
  return parts
    .filter(([n]) => n > 0)
    .map(([n, label]) => `${n} ${label}${n === 1 ? '' : 's'}`)
    .join(' · ')
}

/** Dashboard figures for the month containing `today`. */
export function dashboardFigures(data, today) {
  const { tenancies, flats, charges, payments, expenses } = data
  const month = monthRange(today)
  const rent = periodSummary(charges, payments, month.start, month.end)
  let outstanding = 0
  for (const t of tenancies) {
    const row = collectionRow(t, charges, payments, today)
    outstanding += row.outstanding + row.electricityOutstanding
  }
  const statuses = flats.map((f) => occupancy(f, tenancies, today))
  return {
    rentDue: rent.due,
    rentReceived: rent.received,
    outstanding,
    occupied: statuses.filter((s) => s === 'occupied').length,
    vacant: statuses.filter((s) => s === 'vacant').length,
    ownUse: statuses.filter((s) => s === 'own-use').length,
    expenses: expenseSummary(expenses, month.start, month.end),
  }
}
