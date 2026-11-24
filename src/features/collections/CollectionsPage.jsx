import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { collectionRow, monthRange, periodSummary, sortCollectionRows } from '../../lib/collections.js'
import { formatINR, todayInKolkata } from '../../lib/money/index.js'
import { flatReference } from '../../lib/property.js'
import { useEnsureDueCharges } from './useEnsureDueCharges.js'
import { usePropertyData } from '../flats/usePropertyData.js'
import { useTenancyData } from '../tenants/useTenancyData.js'
import { useCollectionData } from './useCollectionData.js'
import PaymentForm from './PaymentForm.jsx'
import { useAuth } from '../auth/auth-context.js'
import { newPaymentId, recordPayment, undoPayment } from '../../services/collections.js'

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

const UNDO_SECONDS = 10

export default function CollectionsPage() {
  const { user } = useAuth()
  const { buildings, flats, loading: pLoading } = usePropertyData()
  const { tenants, tenancies, loading: tLoading } = useTenancyData()
  const { charges, payments, loading: cLoading, error } = useCollectionData()
  const [filter, setFilter] = useState('todo')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(null) // { tenancyId, account? } — the full payment form
  const [message, setMessage] = useState(null)
  const [saving, setSaving] = useState(null) // tenancyId while a one-tap payment saves
  const [undo, setUndo] = useState(null) // { paymentId, text } for a few seconds after a one-tap save
  const [quickError, setQuickError] = useState(null)

  useEffect(() => {
    if (!undo) return undefined
    const timer = setTimeout(() => setUndo(null), UNDO_SECONDS * 1000)
    return () => clearTimeout(timer)
  }, [undo])

  /** One tap: saves the full amount now, dated today, by cash or UPI. */
  async function quickPay(row, account, method, amount) {
    setSaving(row.tenancy.id)
    setQuickError(null)
    setMessage(null)
    const id = newPaymentId()
    try {
      await recordPayment(user, { id, tenancy: row.tenancy, account, amount, date: today, method })
      const what = account === 'electricity' ? 'electricity' : 'rent'
      setUndo({ paymentId: id, text: `Saved ${formatINR(amount)} ${what} from ${row.tenant?.name ?? 'tenant'} (${method === 'upi' ? 'UPI' : 'cash'}, today).` })
    } catch (e) {
      setQuickError(e.code === 'permission-denied' ? 'The database refused this payment (permission denied).' : `Not saved: ${e.message}`)
    } finally {
      setSaving(null)
    }
  }

  async function undoLast() {
    const { paymentId } = undo
    setUndo(null)
    try {
      await undoPayment(user, paymentId)
      setMessage('Payment cancelled.')
    } catch (e) {
      setQuickError(e.code === 'permission-denied' ? 'Too late to undo; an admin can void it from the rent ledger.' : e.message)
    }
  }
  const today = todayInKolkata()
  const loading = pLoading || tLoading || cLoading
  // Create rent charges for periods that have started (idempotent; safe on several devices).
  const genError = useEnsureDueCharges(tenancies, charges, today, !loading)

  const rows = (() => {
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
  })()

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

      {undo && (
        <div className="undo-bar" role="status">
          <span>{undo.text}</span>
          <button type="button" className="button small-button" onClick={undoLast}>
            Undo
          </button>
        </div>
      )}
      {message && <p className="success">{message}</p>}
      {quickError && <p className="error">{quickError}</p>}

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
              <div className="quick-pay">
                {r.currentRemaining > 0 && (
                  <div className="quick-line">
                    <span className="quick-label">
                      Full rent received <strong>{formatINR(r.quickAmount)}</strong>
                    </span>
                    <button type="button" className="button primary" disabled={saving === r.tenancy.id} onClick={() => quickPay(r, 'rent', 'cash', r.quickAmount)}>
                      Cash
                    </button>
                    <button type="button" className="button primary" disabled={saving === r.tenancy.id} onClick={() => quickPay(r, 'rent', 'upi', r.quickAmount)}>
                      UPI
                    </button>
                  </div>
                )}
                {r.electricityOutstanding > 0 && (
                  <div className="quick-line">
                    <span className="quick-label">
                      Electricity received <strong>{formatINR(r.electricityOutstanding)}</strong>
                    </span>
                    <button type="button" className="button" disabled={saving === r.tenancy.id} onClick={() => quickPay(r, 'electricity', 'cash', r.electricityOutstanding)}>
                      Cash
                    </button>
                    <button type="button" className="button" disabled={saving === r.tenancy.id} onClick={() => quickPay(r, 'electricity', 'upi', r.electricityOutstanding)}>
                      UPI
                    </button>
                  </div>
                )}
                <button type="button" className="link-button" onClick={() => setOpen({ tenancyId: r.tenancy.id, quick: false })}>
                  {r.currentRemaining > 0 ? 'Different amount or date' : 'Record rent payment'}
                </button>
                {saving === r.tenancy.id && <span className="muted small"> Saving…</span>}
              </div>
            )}
            {isOpen && (
              <PaymentForm
                tenancy={r.tenancy}
                account={account}
                charges={charges.filter(mine)}
                payments={payments.filter(mine)}
                displayedCharge={account === 'rent' ? r.current : null}
                defaultAmount={account === 'electricity' ? r.electricityOutstanding : null}
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
