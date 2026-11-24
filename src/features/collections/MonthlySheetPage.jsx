import { useState } from 'react'
import { Link } from 'react-router'
import { methodLabel, monthRange } from '../../lib/collections.js'
import { formatINR, todayInKolkata } from '../../lib/money/index.js'
import { monthlySheet, sheetTotals } from '../../lib/monthlySheet.js'
import { flatReference } from '../../lib/property.js'
import { useElectricityData } from '../electricity/useElectricityData.js'
import { usePropertyData } from '../flats/usePropertyData.js'
import { useTenancyData } from '../tenants/useTenancyData.js'
import { useCollectionData } from './useCollectionData.js'
import { useEnsureDueCharges } from './useEnsureDueCharges.js'
import BackButton from '../../components/BackButton.jsx'

const RENT_STATUS = {
  paid: { label: 'Paid', className: 'pill' },
  part: { label: 'Part paid', className: 'pill warn' },
  'part-overdue': { label: 'Part paid · overdue', className: 'pill off' },
  unpaid: { label: 'Not paid', className: 'pill warn' },
  overdue: { label: 'Not paid · overdue', className: 'pill off' },
  none: { label: 'Not due this month', className: 'pill muted-pill' },
}

const ELEC_STATUS = {
  ...RENT_STATUS,
  none: { label: '—', className: 'muted' },
  'no-bill': { label: 'No bill entered', className: 'pill muted-pill' },
}

function Status({ map, value }) {
  const s = map[value] ?? { label: value, className: 'pill' }
  return <span className={s.className}>{s.label}</span>
}

// Month-by-month view of rent and electricity per tenant (owner's checklist).
export default function MonthlySheetPage() {
  const today = todayInKolkata()
  const [month, setMonth] = useState(today.slice(0, 7))
  const { buildings, flats, connections, loading: pLoading } = usePropertyData()
  const { tenants, tenancies, loading: tLoading } = useTenancyData()
  const { charges, payments, loading: cLoading, error } = useCollectionData()
  const { bills, loading: eLoading } = useElectricityData()
  const genError = useEnsureDueCharges(tenancies, charges, today, !(pLoading || tLoading || cLoading))

  if (error) return <p className="error">{error}</p>
  if (pLoading || tLoading || cLoading || eLoading) return <p className="muted">Loading…</p>

  const range = monthRange(`${month}-01`)
  const rows = monthlySheet({ tenancies, tenants, flats, connections, charges, payments, bills }, range, today)
  const totals = sheetTotals(rows)
  const monthName = new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })

  return (
    <section className="page">
      <BackButton fallback="/collections" />
      <div className="page-header">
        <h1>Monthly sheet · {monthName}</h1>
        <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label="Month" />
      </div>
      {genError && <p className="error small">{genError}</p>}
      <p className="muted small">
        Rent periods and electricity charges that fall due in this month. Rent charges appear once a period has started. Tap a
        tenant to open their ledger and record a payment.
      </p>

      <div className="stats">
        <div className="card stat">
          <span className="muted small">Rent due / received</span>
          <strong>
            {formatINR(totals.rentPaid)} <span className="muted small">of {formatINR(totals.rentDue)}</span>
          </strong>
        </div>
        <div className="card stat">
          <span className="muted small">Electricity (shared meters) due / received</span>
          <strong>
            {formatINR(totals.electricityPaid)} <span className="muted small">of {formatINR(totals.electricityDue)}</span>
          </strong>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="muted">No tenants lived in a flat during this month.</p>
      ) : (
        <div className="table-wrap card">
          <table className="table sheet stack">
            <thead>
              <tr>
                <th rowSpan={2}>Flat / tenant</th>
                <th colSpan={4}>Rent</th>
                <th colSpan={3}>Electricity</th>
              </tr>
              <tr>
                <th>Paid?</th>
                <th>Amount paid</th>
                <th>Date</th>
                <th>Mode</th>
                <th>Paid?</th>
                <th>Amount</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const building = buildings.find((b) => b.code === r.tenancy.buildingId)
                const e = r.electricity
                return (
                  <tr key={r.tenancy.id}>
                    <td data-label="Tenant">
                      <Link to={`/tenancies/${r.tenancy.id}`}>{r.tenant?.name ?? 'Tenant'}</Link>
                      <div className="muted small">{r.flat ? flatReference(building, r.flat) : r.tenancy.flatId}</div>
                    </td>
                    <td data-label="Rent paid?">
                      <Status map={RENT_STATUS} value={r.rent.status} />
                    </td>
                    <td data-label="Rent amount">
                      {r.rent.due > 0 ? (
                        <>
                          {formatINR(r.rent.paid)}
                          <div className="muted small">of {formatINR(r.rent.due)}</div>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td data-label="Rent date">{r.rent.dates.join(', ') || '—'}</td>
                    <td data-label="Mode">{r.rent.methods.map(methodLabel).join(', ') || '—'}</td>
                    <td data-label="Electricity paid?">
                      <Status map={ELEC_STATUS} value={e.status} />
                      {e.kind === 'own' && <div className="muted small">tenant pays Tata</div>}
                    </td>
                    <td data-label="Electricity amount">
                      {e.due > 0 ? (
                        <>
                          {formatINR(e.paid)}
                          <div className="muted small">of {formatINR(e.due)}</div>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td data-label="Electricity date">{e.dates.join(', ') || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
