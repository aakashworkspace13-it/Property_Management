import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import Field from '../../components/Field.jsx'
import { useAuth } from '../auth/auth-context.js'
import { methodLabel, tenancyLedger } from '../../lib/collections.js'
import { formatINR, rupeesToPaise, todayInKolkata } from '../../lib/money/index.js'
import { flatReference } from '../../lib/property.js'
import { addOpeningBalance, reallocatePayment, setVoided } from '../../services/collections.js'
import { usePropertyData } from '../flats/usePropertyData.js'
import { useTenancyData } from '../tenants/useTenancyData.js'
import { useCollectionData } from './useCollectionData.js'
import PaymentForm from './PaymentForm.jsx'

const STATUS_LABEL = { paid: 'Paid', partial: 'Part paid', unpaid: 'Unpaid' }

function friendly(e) {
  return e?.code === 'permission-denied' ? 'Not allowed (permission denied).' : e?.message ?? String(e)
}

function describeCharge(c) {
  if (c.source === 'opening') return c.start ? `Opening balance ${c.start} to ${c.end}` : 'Opening balance (dates unknown)'
  if (c.source === 'submeter') return `${c.start} to ${c.end} · ${c.units} units × ₹${c.rate}`
  return `${c.start} to ${c.end}${c.occupiedDays && c.occupiedDays < c.periodDays ? ` (${c.occupiedDays} of ${c.periodDays} days)` : ''}`
}

function OpeningForm({ tenancy, charges, actor, onDone }) {
  const [values, setValues] = useState({ amount: '', due: tenancy.trackFrom, start: '', end: '', reason: '' })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const bind = (k) => ({ value: values[k], onChange: (e) => setValues((v) => ({ ...v, [k]: e.target.value })) })

  async function save(event) {
    event.preventDefault()
    setError(null)
    let amount
    try {
      amount = rupeesToPaise(values.amount)
    } catch {
      return setError('Enter the amount in rupees.')
    }
    setBusy(true)
    try {
      await addOpeningBalance(actor, tenancy, { amount, due: values.due, start: values.start, end: values.end, reason: values.reason }, charges)
      onDone()
    } catch (e) {
      setError(friendly(e))
      setBusy(false)
    }
  }

  return (
    <form className="form panel-form" onSubmit={save}>
      <h3>Add opening balance (rent owed from before the app)</h3>
      <div className="form-row">
        <Field label="Amount owed (₹)" required>
          <input inputMode="decimal" {...bind('amount')} />
        </Field>
        <Field label="Due date" required>
          <input type="date" {...bind('due')} />
        </Field>
      </div>
      <div className="form-row">
        <Field label="Period from (if known)">
          <input type="date" {...bind('start')} />
        </Field>
        <Field label="Period to (if known)">
          <input type="date" {...bind('end')} />
        </Field>
      </div>
      <Field label="Note" required hint="What does this amount cover? e.g. 'Unpaid rent Aug–Oct 2026'">
        <input maxLength={300} {...bind('reason')} />
      </Field>
      <div className="form-actions">
        <button type="submit" className="button primary" disabled={busy}>
          {busy ? 'Saving…' : 'Add opening balance'}
        </button>
        <button type="button" className="button" onClick={onDone} disabled={busy}>
          Cancel
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </form>
  )
}

function SplitForm({ payment, ledger, actor, onDone }) {
  const current = Object.fromEntries(ledger.allocations.filter((a) => a.paymentId === payment.id).map((a) => [a.chargeId, a.amount]))
  const [values, setValues] = useState(Object.fromEntries(ledger.rows.map((r) => [r.id, current[r.id] ? String(current[r.id] / 100) : ''])))
  const [reason, setReason] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function save(automatic) {
    setError(null)
    let allocations = null
    if (!automatic) {
      try {
        allocations = Object.fromEntries(
          Object.entries(values)
            .filter(([, v]) => v.trim() !== '')
            .map(([id, v]) => [id, rupeesToPaise(v)]),
        )
      } catch {
        return setError('Amounts must be in rupees.')
      }
    }
    setBusy(true)
    try {
      await reallocatePayment(actor, payment, allocations, reason, ledger.chargeInputs, ledger.paymentInputs)
      onDone()
    } catch (e) {
      setError(friendly(e))
      setBusy(false)
    }
  }

  return (
    <div className="form panel-form">
      <h3>Change how {formatINR(payment.amount)} of {payment.date} is split</h3>
      {ledger.rows.map((r) => (
        <Field key={r.id} label={`${describeCharge(r)} — ${formatINR(r.amount - r.adjusted)}`}>
          <input inputMode="decimal" value={values[r.id]} onChange={(e) => setValues((v) => ({ ...v, [r.id]: e.target.value }))} />
        </Field>
      ))}
      <Field label="Reason" required>
        <input maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Tenant said this was for November" />
      </Field>
      <div className="form-actions">
        <button type="button" className="button primary" disabled={busy} onClick={() => save(false)}>
          Save split
        </button>
        <button type="button" className="button" disabled={busy} onClick={() => save(true)}>
          Back to automatic (oldest first)
        </button>
        <button type="button" className="button" disabled={busy} onClick={onDone}>
          Cancel
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  )
}

function VoidForm({ record, kind, actor, onDone }) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState(null)
  const voiding = !record.deleted
  async function save() {
    try {
      await setVoided(actor, kind, record, voiding, reason)
      onDone()
    } catch (e) {
      setError(friendly(e))
    }
  }
  return (
    <div className="form panel-form">
      <Field label={voiding ? 'Why void this? (it stays in history)' : 'Why restore this?'} required>
        <input maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <div className="form-actions">
        <button type="button" className="button primary" onClick={save}>
          {voiding ? 'Void' : 'Restore'}
        </button>
        <button type="button" className="button" onClick={onDone}>
          Cancel
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  )
}

export default function LedgerPage() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const account = params.get('account') === 'electricity' ? 'electricity' : 'rent'
  const { user, isAdmin } = useAuth()
  const { buildings, flats } = usePropertyData()
  const { tenants, tenancies, loading: tLoading } = useTenancyData()
  const { charges, payments, loading: cLoading, error } = useCollectionData()
  const [panel, setPanel] = useState(null) // 'pay' | 'opening' | { split: id } | { void: id, kind }
  const today = todayInKolkata()

  if (error) return <p className="error">{error}</p>
  if (tLoading || cLoading) return <p className="muted">Loading…</p>
  const tenancy = tenancies.find((t) => t.id === id)
  if (!tenancy) return <p className="error">Tenancy not found.</p>
  const tenant = tenants.find((t) => t.id === tenancy.tenantId)
  const flat = flats?.find((f) => f.code === tenancy.flatId)
  const building = buildings?.find((b) => b.code === tenancy.buildingId)

  const mine = (x) => x.tenancyId === id && x.account === account
  const myCharges = charges.filter(mine)
  const myPayments = payments.filter(mine)
  let ledger
  try {
    ledger = tenancyLedger(tenancy, charges, payments, today, account)
  } catch (e) {
    return <p className="error">This ledger cannot be calculated: {e.message}. Ask an admin to clear the manual split.</p>
  }
  ledger.chargeInputs = myCharges
  ledger.paymentInputs = myPayments.filter((p) => !p.deleted)
  const chargeById = new Map(myCharges.map((c) => [c.id, c]))
  const adjustments = myCharges.filter((c) => c.amount < 0)
  const voidedCharges = myCharges.filter((c) => c.deleted)
  const sortedPayments = [...myPayments].sort((a, b) => b.date.localeCompare(a.date))
  const done = () => setPanel(null)

  return (
    <section className="page narrow">
      <p className="muted small">
        <Link to="/collections">← Collections</Link>
      </p>
      <div className="page-header">
        <h1>{account === 'electricity' ? 'Electricity ledger' : 'Rent ledger'}</h1>
        <div className="segmented" role="tablist">
          {['rent', 'electricity'].map((a) => (
            <button
              key={a}
              type="button"
              role="tab"
              aria-selected={account === a}
              className={account === a ? 'active' : ''}
              onClick={() => {
                setPanel(null)
                setParams(a === 'rent' ? {} : { account: a })
              }}
            >
              {a === 'rent' ? 'Rent' : 'Electricity'}
            </button>
          ))}
        </div>
      </div>
      <p>
        <Link to={`/tenants/${tenancy.tenantId}`}>{tenant?.name ?? 'Tenant'}</Link> ·{' '}
        <Link to={`/flats/${tenancy.flatId}`}>{flat ? flatReference(building, flat) : tenancy.flatId}</Link>
        <br />
        <span className="muted small">
          {formatINR(tenancy.monthlyRent)} per month · moved in {tenancy.moveIn}
          {tenancy.moveOut && ` · moved out ${tenancy.moveOut}`} · tracked from {tenancy.trackFrom}
        </span>
      </p>

      <div className="stats">
        <div className="card stat">
          <span className="muted small">Outstanding</span>
          <strong>{formatINR(ledger.totals.outstanding)}</strong>
        </div>
        <div className="card stat">
          <span className="muted small">Credit</span>
          <strong>{formatINR(ledger.totals.credit + ledger.totals.adjustmentCredit)}</strong>
        </div>
        <div className="card stat">
          <span className="muted small">Total charged</span>
          <strong>{formatINR(ledger.totals.charged + ledger.totals.adjustments)}</strong>
        </div>
        <div className="card stat">
          <span className="muted small">Total received</span>
          <strong>{formatINR(ledger.totals.received)}</strong>
        </div>
      </div>

      <div className="form-actions">
        <button type="button" className="button primary" onClick={() => setPanel('pay')}>
          Record payment
        </button>
        <button type="button" className="button" onClick={() => setPanel('opening')}>
          Add opening balance
        </button>
      </div>
      {panel === 'pay' && (
        <PaymentForm
          tenancy={tenancy}
          account={account}
          charges={myCharges}
          payments={myPayments}
          displayedCharge={account === 'rent' ? ledger.current : null}
          onDone={done}
        />
      )}
      {panel === 'opening' && <OpeningForm tenancy={tenancy} charges={charges} actor={user} onDone={done} />}

      <section className="card section">
        <h2>{account === 'electricity' ? 'Electricity charges' : 'Rent periods'}</h2>
        {ledger.rows.length === 0 ? (
          <p className="muted">
            {account === 'electricity'
              ? 'No electricity charged yet. Charges appear when a shared-meter bill is recorded on the Electricity page.'
              : `No rent charged yet. Periods appear from ${tenancy.trackFrom} once they start.`}
          </p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Due</th>
                  <th>{account === 'electricity' ? 'Amount' : 'Rent'}</th>
                  <th>Received</th>
                  <th>Left</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {[...ledger.rows].reverse().map((r) => (
                  <tr key={r.id}>
                    <td>{describeCharge(r)}</td>
                    <td>{r.due}</td>
                    <td>
                      {formatINR(r.amount - r.adjusted)}
                      {r.adjusted > 0 && <div className="muted small">was {formatINR(r.amount)}, adjusted</div>}
                    </td>
                    <td>{formatINR(r.received)}</td>
                    <td>{formatINR(r.remaining)}</td>
                    <td>
                      {STATUS_LABEL[r.status]}
                      {r.overdue && <span className="error small"> · overdue</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {adjustments.length > 0 && (
          <>
            <h3>Adjustments</h3>
            <ul className="plain-list">
              {adjustments.map((c) => (
                <li key={c.id}>
                  {formatINR(c.amount)} · {c.reason}
                  {c.corrects && chargeById.get(c.corrects) && ` (period ${chargeById.get(c.corrects).start})`}
                  {c.correctedAmount !== undefined && ` → last period rent ${formatINR(c.correctedAmount)}`}
                  {c.deleted && <span className="pill off">Voided</span>}
                </li>
              ))}
            </ul>
          </>
        )}
        {voidedCharges.length > 0 && <p className="muted small">{voidedCharges.length} voided charge(s) are not counted.</p>}
      </section>

      <section className="card section">
        <h2>Payments</h2>
        {sortedPayments.length === 0 && <p className="muted">No payments yet.</p>}
        <ul className="member-list">
          {sortedPayments.map((p) => {
            const row = ledger.payments.find((x) => x.id === p.id)
            const parts = ledger.allocations.filter((a) => a.paymentId === p.id)
            return (
              <li key={p.id} className={p.deleted ? 'inactive' : ''}>
                <div className="member-main">
                  <strong>{formatINR(p.amount)}</strong> · {p.date} · {methodLabel(p.method)}
                  {p.reference && <span className="muted small"> · ref {p.reference}</span>}
                  {p.deleted && <span className="pill off">Voided</span>}
                  {p.manualAllocations && <span className="pill muted-pill">Manual split</span>}
                  <div className="muted small">
                    {p.deleted
                      ? `Voided: ${p.deleteReason}`
                      : parts.map((a) => `${formatINR(a.amount)} → ${describeCharge(chargeById.get(a.chargeId) ?? {})}`).join(' · ')}
                    {!p.deleted && row?.credit > 0 && ` · ${formatINR(row.credit)} credit`}
                    {` · by ${p.createdBy}`}
                  </div>
                </div>
                <div className="member-actions">
                  {!p.deleted && (
                    <button type="button" className="button small-button" onClick={() => setPanel({ split: p.id })}>
                      Change split
                    </button>
                  )}
                  {isAdmin && (
                    <button type="button" className="button small-button" onClick={() => setPanel({ void: p.id, kind: 'payments' })}>
                      {p.deleted ? 'Restore' : 'Void'}
                    </button>
                  )}
                </div>
                {panel?.split === p.id && <SplitForm payment={p} ledger={ledger} actor={user} onDone={done} />}
                {panel?.void === p.id && <VoidForm record={p} kind="payments" actor={user} onDone={done} />}
              </li>
            )
          })}
        </ul>
      </section>
    </section>
  )
}
