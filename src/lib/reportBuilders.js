// Reports for a calendar year (owner choices 2026-11-21): rent collection, outstanding dues,
// expenses, electricity, occupancy and tenant list; filters building / flat / tenant.
// Each builder returns { title, asOf, tables: [{ title, columns, rows, totals }] } so the screen,
// the Excel file and the PDF show exactly the same figures.
// Column types: 'text' | 'money' (paise) | 'number' | 'date'.

import { tenancyLedger } from './collections.js'
import { compareDates, expectedRentInRange, minDate, receiptsInRange } from './money/index.js'
import { maskIdNumber, idTypeLabel } from './tenants.js'
import { flatReference, floorOrder, occupancy } from './property.js'
import { methodLabel } from './collections.js'

export const REPORTS = [
  { key: 'rent', label: 'Rent collection' },
  { key: 'outstanding', label: 'Outstanding dues' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'electricity', label: 'Electricity' },
  { key: 'occupancy', label: 'Occupancy' },
  { key: 'tenants', label: 'Tenant list' },
]

/** First/last day of a calendar year, and the "as of" date (year end, or today if earlier). */
export function yearRange(year, today) {
  const start = `${year}-01-01`
  const end = `${year}-12-31`
  return { start, end, asOf: minDate(end, today) }
}

function col(key, label, type = 'text') {
  return { key, label, type }
}

function sum(rows, key) {
  return rows.reduce((s, r) => s + (r[key] ?? 0), 0)
}

function overlapsYear(t, range) {
  return compareDates(t.moveIn, range.end) <= 0 && (!t.moveOut || compareDates(t.moveOut, range.start) >= 0)
}

/** Applies the building / flat / tenant filters to tenancies. */
function filterTenancies(data, filters) {
  return data.tenancies.filter(
    (t) =>
      (!filters.buildingId || t.buildingId === filters.buildingId) &&
      (!filters.flatId || t.flatId === filters.flatId) &&
      (!filters.tenantId || t.tenantId === filters.tenantId),
  )
}

/** Sort key for a flat code: building, floor (Ground, 1st…), position — same order as the Flats page. */
function flatOrder(data) {
  const index = new Map(
    [...data.flats]
      .sort(
        (a, b) =>
          a.buildingId.localeCompare(b.buildingId) ||
          floorOrder(a.floor) - floorOrder(b.floor) ||
          String(a.position).localeCompare(String(b.position), undefined, { numeric: true }),
      )
      .map((f, i) => [f.code, i]),
  )
  return (code) => index.get(code) ?? 1e9
}

function context(data) {
  const tenantName = (t) => data.tenants.find((x) => x.id === t.tenantId)?.name ?? 'Tenant'
  const flatRef = (code) => {
    const flat = data.flats.find((f) => f.code === code)
    return flat ? flatReference(data.buildings.find((b) => b.code === flat.buildingId), flat) : code
  }
  return { tenantName, flatRef }
}

function rentReport(data, filters, range) {
  const { tenantName, flatRef } = context(data)
  const order = flatOrder(data)
  const rows = filterTenancies(data, filters)
    .filter((t) => overlapsYear(t, range))
    .map((t) => {
      const mine = (x) => x.tenancyId === t.id
      const ledger = tenancyLedger(t, data.charges, data.payments, range.asOf, 'rent')
      return {
        order: order(t.flatId),
        tenant: tenantName(t),
        flat: flatRef(t.flatId),
        monthlyRent: t.monthlyRent,
        rentForYear: expectedRentInRange(data.charges.filter(mine), range.start, range.end),
        received: receiptsInRange(data.payments.filter(mine), 'rent', range.start, range.end),
        outstanding: ledger.totals.outstanding,
      }
    })
    .sort((a, b) => a.order - b.order)
  const columns = [
    col('tenant', 'Tenant'),
    col('flat', 'Flat'),
    col('monthlyRent', 'Monthly rent', 'money'),
    col('rentForYear', 'Rent for the year', 'money'),
    col('received', 'Received in the year', 'money'),
    col('outstanding', `Outstanding on ${range.asOf}`, 'money'),
  ]
  return {
    tables: [
      {
        title: 'Rent collection',
        columns,
        rows,
        totals: { tenant: 'Total', rentForYear: sum(rows, 'rentForYear'), received: sum(rows, 'received'), outstanding: sum(rows, 'outstanding') },
      },
    ],
  }
}

function outstandingReport(data, filters, range) {
  const { tenantName, flatRef } = context(data)
  const rows = filterTenancies(data, filters)
    .map((t) => {
      const rent = tenancyLedger(t, data.charges, data.payments, range.asOf, 'rent')
      const elec = tenancyLedger(t, data.charges, data.payments, range.asOf, 'electricity')
      const unpaid = [...rent.rows, ...elec.rows].filter((r) => r.remaining > 0 && compareDates(r.due, range.asOf) <= 0)
      const oldest = unpaid.map((r) => r.due).sort()[0] ?? ''
      return {
        tenant: tenantName(t),
        flat: flatRef(t.flatId),
        status: t.moveOut && compareDates(t.moveOut, range.asOf) < 0 ? 'Moved out' : 'Current',
        rent: unpaid.filter((r) => r.account === 'rent').reduce((s, r) => s + r.remaining, 0),
        electricity: unpaid.filter((r) => r.account === 'electricity').reduce((s, r) => s + r.remaining, 0),
        oldest,
      }
    })
    .map((r) => ({ ...r, total: r.rent + r.electricity }))
    .filter((r) => r.total > 0)
    .sort((a, b) => a.oldest.localeCompare(b.oldest))
  return {
    tables: [
      {
        title: `Outstanding dues on ${range.asOf} (oldest first)`,
        columns: [
          col('tenant', 'Tenant'),
          col('flat', 'Flat'),
          col('status', 'Status'),
          col('oldest', 'Unpaid since', 'date'),
          col('rent', 'Rent', 'money'),
          col('electricity', 'Electricity', 'money'),
          col('total', 'Total', 'money'),
        ],
        rows,
        totals: { tenant: 'Total', rent: sum(rows, 'rent'), electricity: sum(rows, 'electricity'), total: sum(rows, 'total') },
      },
    ],
  }
}

function expenseReport(data, filters, range) {
  // Tenant filter → that tenant's flats. Flat filter (or tenant) → only that flat's stored share.
  let flatCodes = null
  if (filters.flatId) flatCodes = [filters.flatId]
  else if (filters.tenantId) flatCodes = [...new Set(data.tenancies.filter((t) => t.tenantId === filters.tenantId).map((t) => t.flatId))]
  const category = (id) => data.categories.find((c) => c.id === id)?.name ?? '—'
  const building = (code) => data.buildings.find((b) => b.code === code)?.name ?? code
  const rows = data.expenses
    .filter((x) => !x.deleted && compareDates(x.date, range.start) >= 0 && compareDates(x.date, range.end) <= 0)
    .filter((x) => !filters.buildingId || x.buildingId === filters.buildingId)
    .map((x) => {
      const amount = flatCodes ? flatCodes.reduce((s, code) => s + (x.shares?.[code] ?? 0), 0) : x.amount
      return {
        date: x.date,
        building: building(x.buildingId),
        flat: x.flatId ?? 'Whole building',
        category: category(x.categoryId),
        description: x.description,
        payer: x.payer === 'owner' ? 'Family' : 'Tenant',
        mode: methodLabel(x.paymentMode),
        family: x.payer === 'owner' ? amount : 0,
        tenant: x.payer === 'tenant' ? amount : 0,
      }
    })
    .filter((r) => r.family + r.tenant > 0)
    .sort((a, b) => a.date.localeCompare(b.date))

  const byCategory = new Map()
  for (const r of rows) {
    const c = byCategory.get(r.category) ?? { category: r.category, family: 0, tenant: 0 }
    c.family += r.family
    c.tenant += r.tenant
    byCategory.set(r.category, c)
  }
  const summary = [...byCategory.values()].map((c) => ({ ...c, total: c.family + c.tenant })).sort((a, b) => b.total - a.total)
  return {
    tables: [
      {
        title: 'Expenses by category',
        columns: [col('category', 'Category'), col('family', 'Family-paid', 'money'), col('tenant', 'Tenant-paid', 'money'), col('total', 'Total', 'money')],
        rows: summary,
        totals: { category: 'Total', family: sum(summary, 'family'), tenant: sum(summary, 'tenant'), total: sum(summary, 'total') },
      },
      {
        title: flatCodes ? 'Expenses (this flat’s share)' : 'All expenses',
        columns: [
          col('date', 'Date', 'date'),
          col('building', 'Building'),
          col('flat', 'Flat'),
          col('category', 'Category'),
          col('description', 'Description'),
          col('mode', 'Mode'),
          col('family', 'Family-paid', 'money'),
          col('tenant', 'Tenant-paid', 'money'),
        ],
        rows,
        totals: { date: 'Total', family: sum(rows, 'family'), tenant: sum(rows, 'tenant') },
      },
    ],
  }
}

function electricityReport(data, filters, range) {
  const { tenantName, flatRef } = context(data)
  const order = flatOrder(data)
  const tenantRows = filterTenancies(data, filters)
    .map((t) => {
      const mine = (x) => x.tenancyId === t.id && x.account === 'electricity' && !x.deleted
      const ledger = tenancyLedger(t, data.charges, data.payments, range.asOf, 'electricity')
      return {
        order: order(t.flatId),
        tenant: tenantName(t),
        flat: flatRef(t.flatId),
        charged: data.charges.filter((c) => mine(c) && compareDates(c.due, range.start) >= 0 && compareDates(c.due, range.end) <= 0).reduce((s, c) => s + c.amount, 0),
        received: receiptsInRange(data.payments.filter((p) => p.tenancyId === t.id), 'electricity', range.start, range.end),
        outstanding: ledger.totals.outstanding,
      }
    })
    .filter((r) => r.charged || r.received || r.outstanding)
    .sort((a, b) => a.order - b.order)

  const flatSet = new Set(
    data.flats
      .filter((f) => (!filters.buildingId || f.buildingId === filters.buildingId) && (!filters.flatId || f.code === filters.flatId))
      .filter((f) => !filters.tenantId || data.tenancies.some((t) => t.tenantId === filters.tenantId && t.flatId === f.code))
      .map((f) => f.code),
  )
  const billRows = data.bills
    .filter((b) => !b.deleted && compareDates(b.billDate, range.start) >= 0 && compareDates(b.billDate, range.end) <= 0)
    .map((b) => ({ b, flats: data.flats.filter((f) => f.connectionId === b.connectionId).map((f) => f.code) }))
    .filter(({ flats }) => flats.some((code) => flatSet.has(code)))
    .map(({ b, flats }) => ({
      ca: b.connectionId,
      flats: flats.join(', '),
      period: `${b.periodStart} to ${b.periodEnd}`,
      due: b.dueDate,
      payer: b.payer === 'tenant' ? 'Tenant' : 'Family',
      status: b.status === 'paid' ? `Paid ${b.paidOn}` : 'Unpaid',
      amount: b.amount,
    }))
    .sort((a, b) => a.ca.localeCompare(b.ca) || a.due.localeCompare(b.due))
  return {
    tables: [
      {
        title: 'Tenant electricity (shared meters)',
        columns: [
          col('tenant', 'Tenant'),
          col('flat', 'Flat'),
          col('charged', 'Charged in the year', 'money'),
          col('received', 'Received in the year', 'money'),
          col('outstanding', `Outstanding on ${range.asOf}`, 'money'),
        ],
        rows: tenantRows,
        totals: { tenant: 'Total', charged: sum(tenantRows, 'charged'), received: sum(tenantRows, 'received'), outstanding: sum(tenantRows, 'outstanding') },
      },
      {
        title: 'Tata Power bills',
        columns: [
          col('ca', 'CA number'),
          col('flats', 'Flats'),
          col('period', 'Period'),
          col('due', 'Due date', 'date'),
          col('payer', 'Paid by'),
          col('status', 'Status'),
          col('amount', 'Amount', 'money'),
        ],
        rows: billRows,
        totals: { ca: 'Total', amount: sum(billRows, 'amount') },
      },
    ],
  }
}

function occupancyReport(data, filters, range) {
  const flats = data.flats
    .filter((f) => (!filters.buildingId || f.buildingId === filters.buildingId) && (!filters.flatId || f.code === filters.flatId))
    .filter((f) => !filters.tenantId || data.tenancies.some((t) => t.tenantId === filters.tenantId && t.flatId === f.code))
  const status = (f) => occupancy(f, data.tenancies, range.asOf)
  const byBuilding = [...new Set(flats.map((f) => f.buildingId))].sort().map((code) => {
    const mine = flats.filter((f) => f.buildingId === code)
    return {
      building: data.buildings.find((b) => b.code === code)?.name ?? code,
      flats: mine.length,
      occupied: mine.filter((f) => status(f) === 'occupied').length,
      vacant: mine.filter((f) => status(f) === 'vacant').length,
      ownUse: mine.filter((f) => status(f) === 'own-use').length,
    }
  })
  const vacant = flats
    .filter((f) => status(f) === 'vacant')
    .sort((a, b) => a.buildingId.localeCompare(b.buildingId) || floorOrder(a.floor) - floorOrder(b.floor))
    .map((f) => ({ flat: context(data).flatRef(f.code), code: f.code }))
  return {
    tables: [
      {
        title: `Occupancy on ${range.asOf}`,
        columns: [col('building', 'Building'), col('flats', 'Flats', 'number'), col('occupied', 'Occupied', 'number'), col('vacant', 'Vacant', 'number'), col('ownUse', 'Own use', 'number')],
        rows: byBuilding,
        totals: { building: 'Total', flats: sum(byBuilding, 'flats'), occupied: sum(byBuilding, 'occupied'), vacant: sum(byBuilding, 'vacant'), ownUse: sum(byBuilding, 'ownUse') },
      },
      { title: 'Vacant flats', columns: [col('flat', 'Flat'), col('code', 'Code')], rows: vacant, totals: null },
    ],
  }
}

function tenantListReport(data, filters, range) {
  const { flatRef } = context(data)
  const order = flatOrder(data)
  const rows = filterTenancies(data, filters)
    .filter((t) => compareDates(t.moveIn, range.asOf) <= 0 && (!t.moveOut || compareDates(t.moveOut, range.asOf) >= 0))
    .map((t) => {
      const tenant = data.tenants.find((x) => x.id === t.tenantId) ?? {}
      return {
        order: order(t.flatId),
        tenant: tenant.name ?? 'Tenant',
        flat: flatRef(t.flatId),
        mobile: tenant.mobile ?? '',
        members: tenant.members ?? 0,
        vehicles: `${tenant.twoWheelers ?? 0} two-wheeler, ${tenant.fourWheelers ?? 0} four-wheeler`,
        monthlyRent: t.monthlyRent,
        moveIn: t.moveIn,
        agreementEnd: t.agreementEnd ?? '',
        id: tenant.idNumber ? `${idTypeLabel(tenant.idType)} ${maskIdNumber(tenant.idNumber)}` : '',
      }
    })
    .sort((a, b) => a.order - b.order)
  return {
    tables: [
      {
        title: `Tenants on ${range.asOf}`,
        columns: [
          col('tenant', 'Tenant'),
          col('flat', 'Flat'),
          col('mobile', 'Mobile'),
          col('members', 'Members', 'number'),
          col('vehicles', 'Vehicles'),
          col('monthlyRent', 'Monthly rent', 'money'),
          col('moveIn', 'Move-in', 'date'),
          col('agreementEnd', 'Agreement ends', 'date'),
          col('id', 'ID proof'),
        ],
        rows,
        totals: { tenant: `${rows.length} tenants`, monthlyRent: sum(rows, 'monthlyRent') },
      },
    ],
  }
}

const BUILDERS = {
  rent: rentReport,
  outstanding: outstandingReport,
  expenses: expenseReport,
  electricity: electricityReport,
  occupancy: occupancyReport,
  tenants: tenantListReport,
}

/**
 * Builds a report. data: { buildings, flats, tenants, tenancies, charges, payments, bills, expenses, categories }
 * filters: { buildingId, flatId, tenantId } (empty = all). year: number. today: business date.
 */
export function buildReport(key, data, { year, filters = {}, today }) {
  const range = yearRange(year, today)
  const label = REPORTS.find((r) => r.key === key)?.label ?? key
  return { key, title: `${label} · ${year}`, asOf: range.asOf, ...BUILDERS[key](data, filters, range) }
}
