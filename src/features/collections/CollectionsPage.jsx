import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { collectionRow, monthRange, periodSummary, sortCollectionRows } from '../../lib/collections.js'
import { formatINR, todayInKolkata } from '../../lib/money/index.js'
import { flatReference } from '../../lib/property.js'
import { useEnsureDueCharges } from './useEnsureDueCharges.js'
import { usePropertyData } from '../flats/usePropertyData.js'
import { useTenancyData } from '../tenants/useTenancyData.js'
import { useCollectionData } from './useCollectionData.js'
import PaymentForm from './PaymentForm.jsx'

const STATUS = {
  overdue: { label: 'Overdue', className: 'pill off' },
  unpaid: { label: 'Due', className: 'pill warn' },
  partial: { label: 'Part paid', className: 'pill warn' },
  paid: { label: 'Paid', className: 'pill' },
  'not-due': { label: 'Not due yet', className: 'pill muted-pill' },
}

const FILTERS = [
  { value: 'todo', label: 'To collect' },
  { value: 'paid', label: 'Paid' },
  { value: 'all', label: 'All' },
]

function shortPeriod(c) {
  return c ? `${c.start} to ${c.end}` : ''
}

export default function CollectionsPage() {
  const { buildings, flats, loading: pLoading } = usePropertyData()
  const { tenants, tenancies, loading: tLoading } = useTenancyData()
  const { charges, payments, loading: cLoading, error } = useCollectionData()
  const [filter, setFilter] = useState('todo')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(null) // { tenancyId, quick }
  const [message, setMessage] = useState(null)
  const today = todayInKolkata()
  const loading = pLoading || tLoading || cLoading
  // Create rent charges for periods that have started (idempotent; safe on several devices).
  const genError = useEnsureDueCharges(tenancies, charges, today, !loading)

  const rows = useMemo(() => {
    if (loading) return []
    const list = tenancies
      .map((t) => {
        const row = collectionRow(t, charges, payments, today)
        const living = !t.moveOut || t.moveOut >= today
        if (!living && row.outstanding === 0 && row.credit === 0) return null // past tenant, settled
        const flat = flats.find((f) => f.code === t.flatId)
        return {
          ...row,
          tenancy: t,
          living,
          flatId: t.flatId,
          tenant: tenants.find((x) => x.id === t.tenantId),
          reference: flat ? flatReference(buildings.find((b) => b.code === flat.buildingId), flat) : t.flatId,
        }
      })
      .filter(Boolean)
    return sortCollectionRows(list)
  }, [loading, tenancies, charges, payments, flats, buildings, tenants, today])

  const month = monthRange(today)
  const summary = loading ? null : periodSummary(charges, payments, month.start, month.end)
  const totals = rows.reduce(
    (t, r) => ({ outstanding: t.outstanding + r.outstanding, credit: t.credit + r.credit }),
    { outstanding: 0, credit: 0 },
  )

  const q = query.trim().toLowerCase()
  const visible = rows.filter((r) => {
    const electricityDue = r.electricityOutstanding > 0
    if (filter === 'todo' && !['overdue', 'unpaid', 'partial'].includes(r.status) && !electricityDue) return false
    if (filter === 'paid' && (r.status !== 'paid' || electricityDue)) return false
    if (!q) return true
    return [r.reference, r.flatId, r.tenant?.name].some((v) => String(v ?? '').toLowerCase().includes(q))
  })

  return (
    <section className="page">
      <div className="page-header">
        <h1>Collections</h1>
        <Link className="button" to="/collections/monthly">
          Monthly sheet
        </Link>
      </div>
      {error && <p className="error">{error}</p>}
      {genError && <p className="error small">{genError}</p>}
      {loading && !error && <p className="muted">Loading…</p>}

      {summary && (
        <div className="stats">
          <div className="card stat">
            <span className="muted small">Rent due this month</span>
            <strong>{formatINR(summary.due)}</strong>
          </div>
          <div className="card stat">
            <span className="muted small">Received this month</span>
            <strong>{formatINR(summary.received)}</strong>
          </div>
          <div className="card stat">
            <span className="muted small">Outstanding (all)</span>
            <strong>{formatINR(totals.outstanding)}</strong>
          </div>
          {totals.credit > 0 && (
            <div className="card stat">
              <span className="muted small">Credit held</span>
              <strong>{formatINR(totals.credit)}</strong>
            </div>
          )}
        </div>
      )}

      {message && <p className="success">{message}</p>}

      {!loading && (
        <div className="toolbar">
          <div className="segmented" role="tablist">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                role="tab"
                aria-selected={filter === f.value}
                className={filter === f.value ? 'active' : ''}
                onClick={() => setFilter(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <input type="search" className="search" placeholder="Search flat or tenant" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      )}

      {!loading && rows.length === 0 && <p className="muted">No tenants yet. Add tenants from Buildings and flats.</p>}
      {!loading && rows.length > 0 && visible.length === 0 && <p className="muted">Nothing here.</p>}

      {visible.map((r) => {
        const s = STATUS[r.status]
        const isOpen = open?.tenancyId === r.tenancy.id
        const account = open?.account ?? 'rent'
        const mine = (x) => x.tenancyId === r.tenancy.id && x.account === account
        return (
          <article key={r.tenancy.id} className="card collection-row">
            <div className="collection-head">
              <div>
                <strong>{r.tenant?.name ?? 'Tenant'}</strong>
                <span className={s.className}>{s.label}</span>
                {!r.living && <span className="pill muted-pill">Moved out</span>}
                <div className="muted small">{r.reference}</div>
              </div>
              <Link className="button small-button" to={`/tenancies/${r.tenancy.id}`}>
                Ledger
              </Link>
            </div>
            <div className="collection-figures">
              {r.current && (
                <span>
                  This period ({shortPeriod(r.current)}): <strong>{formatINR(r.currentRemaining)}</strong> left of{' '}
                  {formatINR(r.current.amount - r.current.adjusted)}
                </span>
              )}
              {r.older > 0 && <span className="error">Older dues: {formatINR(r.older)}</span>}
              {r.credit > 0 && <span>Credit: {formatINR(r.credit)}</span>}
              {!r.current && r.outstanding === 0 && <span className="muted">Rent tracking starts {r.tenancy.trackFrom}.</span>}
            </div>
            {(r.electricityOutstanding > 0 || r.electricityCredit > 0) && (
              <div className="collection-figures electricity-line">
                <span>
                  Electricity: <strong>{formatINR(r.electricityOutstanding)}</strong> due
                  {r.electricityOverdue && <span className="error"> · overdue</span>}
                </span>
                {r.electricityCredit > 0 && <span>Electricity credit: {formatINR(r.electricityCredit)}</span>}
              </div>
            )}
            {!isOpen && (r.outstanding > 0 || r.electricityOutstanding > 0 || r.living) && (
              <div className="form-actions">
                {r.currentRemaining > 0 && (
                  <button type="button" className="button primary" onClick={() => setOpen({ tenancyId: r.tenancy.id, quick: true })}>
                    Full rent received · {formatINR(r.quickAmount)}
                  </button>
                )}
                <button type="button" className="button" onClick={() => setOpen({ tenancyId: r.tenancy.id, quick: false })}>
                  {r.currentRemaining > 0 ? 'Other amount' : 'Record rent payment'}
                </button>
                {r.electricityOutstanding > 0 && (
                  <button
                    type="button"
                    className="button"
                    onClick={() => setOpen({ tenancyId: r.tenancy.id, quick: false, account: 'electricity' })}
                  >
                    Electricity received · {formatINR(r.electricityOutstanding)}
                  </button>
                )}
              </div>
            )}
            {isOpen && (
              <PaymentForm
                tenancy={r.tenancy}
                account={account}
                charges={charges.filter(mine)}
                payments={payments.filter(mine)}
                displayedCharge={account === 'rent' ? r.current : null}
                defaultAmount={account === 'electricity' ? r.electricityOutstanding : open.quick ? r.quickAmount : null}
                quick={open.quick}
                onDone={(result) => {
                  setOpen(null)
                  if (result) setMessage(`Saved ${formatINR(result.amount)} from ${r.tenant?.name ?? 'tenant'}.`)
                }}
              />
            )}
          </article>
        )
      })}
    </section>
  )
}
