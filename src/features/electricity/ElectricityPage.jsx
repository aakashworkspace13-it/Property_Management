import { useState } from 'react'
import { Link } from 'react-router'
import Field from '../../components/Field.jsx'
import { useAuth } from '../auth/auth-context.js'
import { connectionGroup, connectionKind, connectionStatus } from '../../lib/electricity.js'
import { formatINR, todayInKolkata } from '../../lib/money/index.js'
import { flatReference, maskPhone, sortFlats, connectionTypeLabel } from '../../lib/property.js'
import { setBillPaid } from '../../services/electricity.js'
import { usePropertyData } from '../flats/usePropertyData.js'
import { useTenancyData } from '../tenants/useTenancyData.js'
import { useElectricityData } from './useElectricityData.js'
import BillForm from './BillForm.jsx'
import BackButton from '../../components/BackButton.jsx'

const STATUS = {
  'no-bill': { label: 'No bill recorded', className: 'pill muted-pill' },
  unpaid: { label: 'Unpaid', className: 'pill warn' },
  overdue: { label: 'Unpaid · overdue', className: 'pill off' },
  paid: { label: 'Paid', className: 'pill' },
}

const GROUPS = [
  { key: 'shared', title: 'Shared meters (family pays Tata Power, tenants pay by sub-meter)' },
  { key: 'tenant', title: 'Own meters, tenant applicable (tenant pays Tata Power directly)' },
  { key: 'own-use', title: 'Own use (family pays Tata Power)' },
]

function MarkPaid({ bill, actor, onDone }) {
  const [date, setDate] = useState(todayInKolkata())
  const [error, setError] = useState(null)
  async function save() {
    try {
      await setBillPaid(actor, bill, date)
      onDone()
    } catch (e) {
      setError(e.message)
    }
  }
  return (
    <span className="inline-actions">
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Paid on" />
      <button type="button" className="button small-button primary" onClick={save}>
        Mark paid
      </button>
      <button type="button" className="button small-button" onClick={onDone}>
        Cancel
      </button>
      {error && <span className="error small">{error}</span>}
    </span>
  )
}

function ConnectionCard({ connection, flats, buildings, tenants, tenancies, bills, readings, rate, today, actor, open, setOpen }) {
  const kind = connectionKind(connection)
  const mine = bills.filter((b) => b.connectionId === connection.caNumber)
  const { status, unpaid } = connectionStatus(mine, today)
  const s = STATUS[status]
  const tenancyOn = (code, date) =>
    tenancies.find((t) => t.flatId === code && t.moveIn <= date && (!t.moveOut || t.moveOut >= date)) ?? null
  const history = [...mine].filter((b) => !b.deleted).sort((a, b) => b.billDate.localeCompare(a.billDate))

  return (
    <article className="card collection-row">
      <div className="collection-head">
        <div>
          <strong>{connection.caNumber}</strong>
          <span className={s.className}>{s.label}</span>
          <span className="muted small">
            {' '}
            · {connectionTypeLabel(connection.type)}
            {kind === 'shared' && ' · sub-meters'}
            {connection.holderName && ` · ${connection.holderName}`}
            {connection.holderPhone && ` (${maskPhone(connection.holderPhone)})`}
          </span>
          <div className="muted small">
            {flats.map((f) => {
              const t = tenancyOn(f.code, today)
              const name = t && tenants.find((x) => x.id === t.tenantId)?.name
              return (
                <span key={f.code} className="flat-chip">
                  <Link to={`/flats/${f.code}`}>{flatReference(buildings.find((b) => b.code === f.buildingId), f)}</Link>
                  {f.ownUse ? ' (own use)' : name ? ` (${name})` : ' (vacant)'}
                </span>
              )
            })}
          </div>
        </div>
        <div className="member-actions">
          <button type="button" className="button small-button primary" onClick={() => setOpen({ id: connection.caNumber, mode: 'bill' })}>
            Record bill
          </button>
          {history.length > 0 && (
            <button
              type="button"
              className="button small-button"
              onClick={() => setOpen(open?.mode === 'history' && open.id === connection.caNumber ? null : { id: connection.caNumber, mode: 'history' })}
            >
              Bills ({history.length})
            </button>
          )}
        </div>
      </div>

      {unpaid.length > 0 && (
        <p className="small">
          Unpaid: {unpaid.map((b) => `${formatINR(b.amount)} due ${b.dueDate}`).join(' · ')}
          {unpaid[0].payer === 'tenant' && <span className="muted"> (tenant pays directly)</span>}
        </p>
      )}

      {open?.id === connection.caNumber && open.mode === 'bill' && (
        <BillForm
          connection={connection}
          flats={flats}
          buildings={buildings}
          tenants={tenants}
          readings={readings}
          rate={rate}
          tenancyOn={tenancyOn}
          onDone={() => setOpen(null)}
        />
      )}

      {open?.id === connection.caNumber && open.mode === 'history' && (
        <div className="table-wrap">
          <table className="table stack">
            <thead>
              <tr>
                <th>Bill date</th>
                <th>Period</th>
                <th>Amount</th>
                <th>Due</th>
                <th>Payer</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {history.map((b) => (
                <tr key={b.id}>
                  <td data-label="Bill date">{b.billDate}</td>
                  <td data-label="Period">
                    {b.periodStart} to {b.periodEnd}
                  </td>
                  <td data-label="Amount">{formatINR(b.amount)}</td>
                  <td data-label="Due">{b.dueDate}</td>
                  <td data-label="Payer">{b.payer === 'tenant' ? 'Tenant' : 'Family'}</td>
                  <td data-label="Status">
                    {b.status === 'paid' ? (
                      `Paid ${b.paidOn}`
                    ) : open.paying === b.id ? (
                      <MarkPaid bill={b} actor={actor} onDone={() => setOpen({ ...open, paying: null })} />
                    ) : (
                      <button type="button" className="link-button" onClick={() => setOpen({ ...open, paying: b.id })}>
                        Unpaid · mark paid
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  )
}

export default function ElectricityPage() {
  const { user } = useAuth()
  const { buildings, flats, connections, loading: pLoading } = usePropertyData()
  const { tenants, tenancies, loading: tLoading } = useTenancyData()
  const { settings, bills, readings, loading: eLoading, error } = useElectricityData()
  const [open, setOpen] = useState(null)
  const [query, setQuery] = useState('')
  const today = todayInKolkata()

  if (error) return <p className="error">{error}</p>
  if (pLoading || tLoading || eLoading) return <p className="muted">Loading…</p>

  const rate = settings.electricityRate ?? ''
  const q = query.trim().toLowerCase()
  const groups = { shared: [], tenant: [], 'own-use': [] }
  for (const c of [...connections].sort((a, b) => a.caNumber.localeCompare(b.caNumber))) {
    const cFlats = sortFlats(flats.filter((f) => f.connectionId === c.caNumber))
    const text = [c.caNumber, c.holderName, ...cFlats.map((f) => `${f.code} ${f.friendlyName ?? ''}`)].join(' ').toLowerCase()
    if (q && !text.includes(q)) continue
    groups[connectionGroup(c, cFlats)].push({ connection: c, flats: cFlats })
  }
  const unpaidFamily = bills.filter((b) => !b.deleted && b.status !== 'paid' && b.payer === 'family')

  return (
    <section className="page">
      <BackButton fallback="/more" mobileOnly />
      <h1>Electricity</h1>
      <div className="stats">
        <div className="card stat">
          <span className="muted small">Rate per unit (shared meters)</span>
          <strong>{rate ? `${rate}` : 'Not set'}</strong>
          <Link to="/settings" className="small">
            Change in Settings
          </Link>
        </div>
        <div className="card stat">
          <span className="muted small">Family bills unpaid</span>
          <strong>{formatINR(unpaidFamily.reduce((s, b) => s + b.amount, 0))}</strong>
          <span className="muted small">{unpaidFamily.length} bill(s)</span>
        </div>
      </div>
      {!rate && <p className="notice small">Set the rate per unit in Settings before recording shared-meter bills.</p>}
      <Field label="Search">
        <input type="search" placeholder="CA number, flat or holder" value={query} onChange={(e) => setQuery(e.target.value)} />
      </Field>
      {connections.length === 0 && <p className="muted">No electricity connections yet. Import them in Settings.</p>}
      {GROUPS.map((g) =>
        groups[g.key].length ? (
          <section key={g.key} className="section">
            <h2 className="group-title">{g.title}</h2>
            {groups[g.key].map(({ connection, flats: cFlats }) => (
              <ConnectionCard
                key={connection.caNumber}
                connection={connection}
                flats={cFlats}
                buildings={buildings}
                tenants={tenants}
                tenancies={tenancies}
                bills={bills}
                readings={readings}
                rate={rate}
                today={today}
                actor={user}
                open={open}
                setOpen={setOpen}
              />
            ))}
          </section>
        ) : null,
      )}
    </section>
  )
}
