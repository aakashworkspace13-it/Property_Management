import { useState } from 'react'
import Field from '../../components/Field.jsx'
import { useAuth } from '../auth/auth-context.js'
import { billPayer, connectionKind, lastReading, planBill } from '../../lib/electricity.js'
import { formatINR, todayInKolkata } from '../../lib/money/index.js'
import { flatReference } from '../../lib/property.js'
import { newBillId, saveBill } from '../../services/electricity.js'

/**
 * Records one Tata Power bill of a connection. For a shared meter it also takes each sub-meter's
 * reading and shows each tenant's charge (units x rate) before saving.
 * tenancyOn(flatCode) → the tenancy living there on the bill's period end, or null.
 */
export default function BillForm({ connection, flats, buildings, tenants, readings, rate, tenancyOn, onDone }) {
  const { user } = useAuth()
  const [billId] = useState(() => newBillId())
  const shared = connectionKind(connection) === 'shared'
  const today = todayInKolkata()

  const [bill, setBill] = useState(() => ({
    billDate: today,
    periodStart: '',
    periodEnd: '',
    amount: '',
    dueDate: '',
    payer: billPayer(connection, flats),
    status: 'unpaid',
    paidOn: today,
    notes: '',
  }))
  const [entries, setEntries] = useState(() =>
    Object.fromEntries(
      flats.map((f) => {
        const last = lastReading(readings, f.code)
        return [f.code, { previous: last?.currentReading ?? '', current: '', reset: false, resetUnits: '', resetReason: '' }]
      }),
    ),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [showErrors, setShowErrors] = useState(false)

  const previousDates = Object.fromEntries(
    flats.map((f) => [f.code, lastReading(readings, f.code)?.readingDate]).filter(([, d]) => d),
  )
  const plan = planBill({
    billId,
    connection,
    flats,
    rate,
    bill,
    entries: Object.fromEntries(
      Object.entries(entries).map(([code, e]) => [code, e.reset ? e : { previous: e.previous, current: e.current }]),
    ),
    previousDates,
    tenancyOn: (code) => (bill.periodEnd ? tenancyOn(code, bill.periodEnd) : null),
  })
  const errors = showErrors ? plan.errors : {}
  const bindBill = (k) => ({ value: bill[k], onChange: (e) => setBill((b) => ({ ...b, [k]: e.target.value })) })
  const setEntry = (code, k, v) => setEntries((all) => ({ ...all, [code]: { ...all[code], [k]: v } }))

  async function save(event) {
    event.preventDefault()
    setShowErrors(true)
    if (Object.keys(plan.errors).length) return setError('Please fix the highlighted fields.')
    setBusy(true)
    setError(null)
    try {
      await saveBill(user, billId, plan)
      onDone?.(true)
    } catch (e) {
      setError(e.code === 'permission-denied' ? 'The database refused this bill (permission denied).' : e.message)
      setBusy(false)
    }
  }

  return (
    <form className="form panel-form wide-form" onSubmit={save} noValidate>
      <h3>Record Tata Power bill · {connection.caNumber}</h3>
      <div className="form-row three">
        <Field label="Bill date" required error={errors.billDate}>
          <input type="date" {...bindBill('billDate')} />
        </Field>
        <Field label="Period from" required error={errors.periodStart}>
          <input type="date" {...bindBill('periodStart')} />
        </Field>
        <Field label="Period to" required error={errors.periodEnd} hint="Sub-meter readings are taken on this date.">
          <input type="date" {...bindBill('periodEnd')} />
        </Field>
      </div>
      <div className="form-row three">
        <Field label="Bill amount" required error={errors.amount}>
          <input inputMode="decimal" {...bindBill('amount')} />
        </Field>
        <Field label="Due date" required error={errors.dueDate}>
          <input type="date" {...bindBill('dueDate')} />
        </Field>
        <Field label="Who pays Tata Power" error={errors.payer}>
          <select {...bindBill('payer')}>
            <option value="family">Family</option>
            <option value="tenant">Tenant (directly)</option>
          </select>
        </Field>
      </div>
      <div className="form-row">
        <Field label="Status">
          <select {...bindBill('status')}>
            <option value="unpaid">Not paid yet</option>
            <option value="paid">Already paid</option>
          </select>
        </Field>
        {bill.status === 'paid' && (
          <Field label="Paid on" required error={errors.paidOn}>
            <input type="date" {...bindBill('paidOn')} />
          </Field>
        )}
      </div>

      {shared && (
        <fieldset className="fieldset">
          <legend>Sub-meter readings on {bill.periodEnd || 'the period end date'}</legend>
          {errors.rate && <p className="error small">{errors.rate}</p>}
          <p className="muted small">
            Rate: {rate ? `${rate} per unit` : 'not set'} · Each tenant&apos;s charge is due on the bill&apos;s due date.
          </p>
          {flats.map((f) => {
            const e = entries[f.code]
            const building = buildings.find((b) => b.code === f.buildingId)
            const reading = plan.readings.find((r) => r.flatId === f.code)
            const charge = plan.charges.find((c) => c.flatId === f.code)
            const tenancy = bill.periodEnd ? tenancyOn(f.code, bill.periodEnd) : null
            const tenant = tenancy && tenants.find((t) => t.id === tenancy.tenantId)
            const firstTime = !lastReading(readings, f.code)
            return (
              <div key={f.code} className="reading-row">
                <strong>{flatReference(building, f)}</strong>
                <span className="muted small">
                  {' '}
                  · {f.ownUse ? 'Own use (not charged)' : tenant ? tenant.name : 'Vacant (not charged)'}
                </span>
                <div className="form-row three">
                  <Field label={firstTime ? 'Starting reading' : 'Previous reading'} hint={firstTime ? 'First time: enter the last reading.' : null}>
                    <input inputMode="decimal" value={e.previous} onChange={(ev) => setEntry(f.code, 'previous', ev.target.value)} />
                  </Field>
                  <Field label="Current reading" required>
                    <input inputMode="decimal" value={e.current} onChange={(ev) => setEntry(f.code, 'current', ev.target.value)} />
                  </Field>
                  <div className="field">
                    <span className="field-label">Charge</span>
                    <span>
                      {reading ? `${reading.units} units` : '—'}
                      {charge && <strong> · {formatINR(charge.amount)}</strong>}
                      {reading && !charge && <span className="muted"> · no charge</span>}
                    </span>
                  </div>
                </div>
                <label className="check small">
                  <input type="checkbox" checked={e.reset} onChange={(ev) => setEntry(f.code, 'reset', ev.target.checked)} /> Meter was
                  reset or replaced
                </label>
                {e.reset && (
                  <div className="form-row">
                    <Field label="Units actually used">
                      <input inputMode="decimal" value={e.resetUnits} onChange={(ev) => setEntry(f.code, 'resetUnits', ev.target.value)} />
                    </Field>
                    <Field label="Reason">
                      <input maxLength={300} value={e.resetReason} onChange={(ev) => setEntry(f.code, 'resetReason', ev.target.value)} />
                    </Field>
                  </div>
                )}
                {errors[`reading_${f.code}`] && <p className="error small">{errors[`reading_${f.code}`]}</p>}
              </div>
            )
          })}
          {plan.charges.length > 0 && (
            <p className="notice small calm">
              Tenants will be charged {formatINR(plan.charges.reduce((s, c) => s + c.amount, 0))} in total for this bill
              {plan.bill.amount ? ` (bill ${formatINR(plan.bill.amount)})` : ''}.
            </p>
          )}
        </fieldset>
      )}
      {!shared && bill.payer === 'tenant' && (
        <p className="notice small calm">The tenant pays this bill to Tata Power directly. It is tracked here only, never counted as family income.</p>
      )}

      <div className="form-actions">
        <button type="submit" className="button primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save bill'}
        </button>
        <button type="button" className="button" onClick={() => onDone?.(false)} disabled={busy}>
          Cancel
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </form>
  )
}
