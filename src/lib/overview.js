// Dashboard figures (This month / Year to date, whole portfolio and per building) and the
// tenancy timeline of a flat. Pure functions; money in integer paise, dates YYYY-MM-DD (Asia/Kolkata).

import { addDays, compareDates, daysInclusive, receiptsInRange } from './money/index.js'
import { monthRange, tenancyLedger } from './collections.js'
import { expenseSummary } from './expenseRecords.js'

/** "This month": the whole calendar month. "Year to date": 1 January to today (calendar year). */
export function overviewRange(period, today) {
  if (period === 'year') return { start: `${today.slice(0, 4)}-01-01`, end: today }
  return monthRange(today)
}

/**
 * Every charge of every tenancy after oldest-first allocation, tagged with its building:
 * [{ account, source, buildingId, flatId, tenancyId, due, amount, remaining, overdue }].
 * Worked out once, then filtered by period and building.
 */
export function allocatedCharges(tenancies, charges, payments, today) {
  const rows = []
  for (const t of tenancies) {
    if (t.deleted) continue
    for (const account of ['rent', 'electricity']) {
      for (const c of tenancyLedger(t, charges, payments, today, account).rows) {
        rows.push({
          account,
          source: c.source,
          buildingId: t.buildingId,
          flatId: t.flatId,
          tenancyId: t.id,
          due: c.due,
          amount: c.amount - (c.adjusted ?? 0), // after any adjustment or reversal
          remaining: c.remaining,
          overdue: c.overdue,
        })
      }
    }
  }
  return rows
}

const inRange = (date, { start, end }) => Boolean(date) && compareDates(date, start) >= 0 && compareDates(date, end) <= 0

/** Building filter: '' or [] means all buildings; otherwise one code or a list of codes. */
function buildingFilter(scope) {
  const list = Array.isArray(scope) ? scope : scope ? [scope] : []
  if (!list.length) return () => true
  const set = new Set(list)
  return (code) => set.has(code)
}

/**
 * Figures for one period, for all buildings or the chosen ones (`scope`: a code or a list):
 *   rent: { due, received, balance, overdue, overdueTenants }
 *   electricity: { due, received, balance }
 *   expenses: { owner, tenant, total, count }
 * Rent due counts rent periods due in the range (not opening balances); balance is what is still
 * unpaid on them; overdue is the part of that balance already past its due date.
 */
export function periodOverview({ rows, tenancies, payments, expenses }, range, scope = '') {
  const inScope = buildingFilter(scope)
  const rent = rows.filter((r) => r.account === 'rent' && r.source === 'rent' && inScope(r.buildingId) && inRange(r.due, range))
  const elec = rows.filter((r) => r.account === 'electricity' && inScope(r.buildingId) && inRange(r.due, range))
  const sum = (list, key) => list.reduce((s, r) => s + r[key], 0)

  const buildingOf = new Map(tenancies.map((t) => [t.id, t.buildingId]))
  const pays = payments.filter((p) => inScope(p.buildingId ?? buildingOf.get(p.tenancyId)))
  const overdueRows = rent.filter((r) => r.overdue)

  const list = Array.isArray(scope) ? scope : scope ? [scope] : []
  const exp = list.length
    ? list.map((b) => expenseSummary(expenses, range.start, range.end, { buildingId: b })).reduce(
        (a, x) => ({ owner: a.owner + x.owner, tenant: a.tenant + x.tenant, total: a.total + x.total, count: a.count + x.count }),
        { owner: 0, tenant: 0, total: 0, count: 0 },
      )
    : expenseSummary(expenses, range.start, range.end)

  return {
    rent: {
      due: sum(rent, 'amount'),
      received: receiptsInRange(pays, 'rent', range.start, range.end),
      balance: sum(rent, 'remaining'),
      overdue: sum(overdueRows, 'remaining'),
      overdueTenants: new Set(overdueRows.map((r) => r.tenancyId)).size,
    },
    electricity: {
      due: sum(elec, 'amount'),
      received: receiptsInRange(pays, 'electricity', range.start, range.end),
      balance: sum(elec, 'remaining'),
    },
    expenses: exp,
  }
}

/**
 * Rent for the period rolled up Building → Floor → Flat (owner request 2026-11-23).
 * Every level has { due, received, balance } (rent periods due in the range, rent received in the
 * range, still unpaid on those periods), and each parent is the sum of its children.
 * buildings/flats: property records; `floorSort(label)` orders floors (top floor first is up to the caller).
 * Returns [{ code, name, totals, floors: [{ floor, totals, flats: [{ code, flat, tenancyId, totals }] }] }].
 */
export function rentTree({ rows, tenancies, payments }, range, buildings, flats, floorSort, scope = '') {
  const inScope = buildingFilter(scope)
  const zero = () => ({ due: 0, received: 0, balance: 0 })
  const add = (a, b) => ({ due: a.due + b.due, received: a.received + b.received, balance: a.balance + b.balance })

  const perFlat = new Map()
  const of = (flatId) => perFlat.get(flatId) ?? perFlat.set(flatId, zero()).get(flatId)
  for (const r of rows) {
    if (r.account !== 'rent' || r.source !== 'rent' || !inRange(r.due, range)) continue
    const t = of(r.flatId)
    t.due += r.amount
    t.balance += r.remaining
  }
  const flatOf = new Map(tenancies.map((t) => [t.id, t.flatId]))
  for (const p of payments) {
    if (p.deleted || p.account !== 'rent' || !inRange(p.date, range)) continue
    of(p.flatId ?? flatOf.get(p.tenancyId)).received += p.amount
  }

  return buildings
    .filter((b) => inScope(b.code))
    .map((b) => {
      const byFloor = new Map()
      for (const f of flats.filter((x) => x.buildingId === b.code)) {
        if (!byFloor.has(f.floor)) byFloor.set(f.floor, [])
        byFloor.get(f.floor).push({ code: f.code, flat: f, totals: perFlat.get(f.code) ?? zero() })
      }
      const floors = [...byFloor.entries()]
        .sort((x, y) => floorSort(x[0]) - floorSort(y[0]))
        .map(([floor, list]) => ({ floor, flats: list, totals: list.reduce((a, x) => add(a, x.totals), zero()) }))
      return { code: b.code, name: b.name, floors, totals: floors.reduce((a, x) => add(a, x.totals), zero()) }
    })
}

// ---------- Flat timeline ----------

function monthStart(date) {
  return `${date.slice(0, 7)}-01`
}

function monthEnd(date) {
  return monthRange(date).end
}

/** Months between two dates for labels: "2 months", "1 month", or "12 days" when under a month. */
export function durationLabel(start, end) {
  const days = daysInclusive(start, end)
  if (days < 28) return `${days} day${days === 1 ? '' : 's'}`
  const months = Math.max(1, Math.round(days / 30.44))
  return `${months} month${months === 1 ? '' : 's'}`
}

/**
 * Tenancy history of one flat for a horizontal timeline, oldest first.
 * The track runs from the first day of the earliest move-in's month to the end of the current
 * month (or of a later recorded move-out). Gaps between tenancies are "empty" segments; the time
 * after the last move-out up to today is empty too.
 * Returns { start, end, segments: [{ kind: 'tenant'|'empty', start, end, tenancyId?, ongoing? }] }
 * or null when the flat has never had a tenant.
 */
export function flatTimeline(flatCode, tenancies, today) {
  const list = tenancies
    .filter((t) => t.flatId === flatCode && !t.deleted && t.moveIn)
    .sort((a, b) => compareDates(a.moveIn, b.moveIn))
  if (!list.length) return null

  const lastOut = list.reduce((d, t) => (t.moveOut && compareDates(t.moveOut, d) > 0 ? t.moveOut : d), today)
  const start = monthStart(list[0].moveIn)
  const end = monthEnd(lastOut)
  const segments = []
  let cursor = list[0].moveIn
  for (const t of list) {
    if (compareDates(t.moveIn, cursor) > 0) {
      segments.push({ kind: 'empty', start: cursor, end: addDays(t.moveIn, -1) })
    }
    const ongoing = !t.moveOut || compareDates(t.moveOut, today) >= 0
    const tEnd = t.moveOut ?? today
    segments.push({ kind: 'tenant', start: t.moveIn, end: tEnd, tenancyId: t.id, ongoing })
    if (compareDates(addDays(tEnd, 1), cursor) > 0) cursor = addDays(tEnd, 1)
  }
  // Empty from the day after the last move-out up to today.
  if (compareDates(cursor, today) <= 0) segments.push({ kind: 'empty', start: cursor, end: today, ongoing: true })
  return { start, end, segments }
}

/** "Feb 2026" for a date. */
export function monthLabel(date) {
  const [y, mo] = date.split('-').map(Number)
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' })
}
