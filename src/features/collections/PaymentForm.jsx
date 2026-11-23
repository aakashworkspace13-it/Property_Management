import { useState } from 'react'
import Field from '../../components/Field.jsx'
import { useAuth } from '../auth/auth-context.js'
import { PAYMENT_METHODS } from '../../lib/collections.js'
import { formatINR, previewPayment, rupeesToPaise, todayInKolkata } from '../../lib/money/index.js'
import { newPaymentId, recordPayment } from '../../services/collections.js'

function periodLabel(charge) {
  if (!charge) return ''
  if (charge.source === 'opening') return `Opening balance (due ${charge.due})`
  if (charge.source === 'submeter') return `Electricity ${charge.start} to ${charge.end} (${charge.units} units)`
  return charge.start && charge.end ? `${charge.start} to ${charge.end}` : `Due ${charge.due}`
}

/**
 * Records a rent payment for one tenancy with a preview of where the money goes.
 * quick = true: "full rent received" — amount fixed to the displayed period's remaining amount.
 * charges / payments: this tenancy's rent charges and payments (for the preview).
 */
export default function PaymentForm({ tenancy, account = 'rent', charges, payments, displayedCharge, defaultAmount, quick = false, onDone }) {
  const { user } = useAuth()
  const [paymentId] = useState(() => newPaymentId()) // fixed for every retry of this payment
  const [values, setValues] = useState({
    amount: defaultAmount ? String(defaultAmount / 100) : '',
    date: todayInKolkata(),
    method: 'cash',
    reference: '',
    notes: '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const bind = (k) => ({ value: values[k], onChange: (e) => setValues((v) => ({ ...v, [k]: e.target.value })) })

  let amount = null
  let amountError = null
  try {
    amount = rupeesToPaise(values.amount)
    if (amount <= 0) amountError = 'Enter an amount more than zero.'
  } catch {
    amountError = values.amount ? 'Enter the amount in rupees, e.g. 12000.' : null
  }

  let preview = null
  let previewError = null
  if (amount > 0) {
    const draft = { id: paymentId, tenancyId: tenancy.id, account, amount, date: values.date }
    // Leave out this payment if it is already saved (the live list updates before the form closes).
    const others = payments.filter((p) => p.id !== paymentId)
    try {
      preview = previewPayment(charges, others, draft, displayedCharge?.id ?? null)
    } catch (e) {
      previewError = e.message
    }
  }
  const byId = new Map(charges.map((c) => [c.id, c]))

  async function save(event) {
    event.preventDefault()
    if (!amount || amountError) return setError(amountError ?? 'Enter the amount.')
    if (!values.date) return setError('Enter the payment date.')
    setBusy(true)
    setError(null)
    try {
      await recordPayment(user, { id: paymentId, tenancy, account, amount, date: values.date, method: values.method, reference: values.reference, notes: values.notes })
      onDone?.({ amount })
    } catch (e) {
      setError(
        e.code === 'permission-denied'
          ? 'The database refused this payment (permission denied).'
          : `Not saved: ${e.message}. Press Save again — it will not create a duplicate.`,
      )
      setBusy(false)
    }
  }

  return (
    <form className="form panel-form" onSubmit={save} noValidate>
      <h3>
        {account === 'electricity'
          ? 'Electricity payment received'
          : quick
            ? 'Confirm full rent received'
            : 'Record a rent payment'}
      </h3>
      <div className="form-row">
        <Field label="Amount (₹)" required error={amountError}>
          <input inputMode="decimal" {...bind('amount')} readOnly={quick} />
        </Field>
        <Field label="Date received" required>
          <input type="date" {...bind('date')} />
        </Field>
      </div>
      <div className="form-row">
        <Field label="Method">
          <select {...bind('method')}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Reference (optional)" hint="UPI ref, cheque no., etc.">
          <input maxLength={100} {...bind('reference')} />
        </Field>
      </div>
      {!quick && (
        <Field label="Notes (optional)">
          <input maxLength={500} {...bind('notes')} />
        </Field>
      )}

      {preview && (
        <div className={preview.paysOlderFirst ? 'notice small' : 'notice small calm'}>
          <strong>Where this {formatINR(amount)} goes:</strong>
          <ul>
            {preview.allocations.map((a) => (
              <li key={a.chargeId}>
                {formatINR(a.amount)} → {periodLabel(byId.get(a.chargeId))}
              </li>
            ))}
            {preview.credit > 0 && <li>{formatINR(preview.credit)} → kept as credit for future {account === 'electricity' ? 'electricity' : 'rent'}</li>}
          </ul>
          {preview.paysOlderFirst && (
            <p>
              <strong>Note:</strong> older unpaid rent is paid first, so part or all of this goes to an earlier period, not the one
              you were looking at. You can change the split later in the ledger.
            </p>
          )}
        </div>
      )}

      {previewError && <p className="error small">Cannot preview this payment: {previewError}</p>}

      <div className="form-actions">
        <button type="submit" className="button primary" disabled={busy || !amount || Boolean(amountError)}>
          {busy ? 'Saving…' : `Save ${amount ? formatINR(amount) : 'payment'}`}
        </button>
        <button type="button" className="button" onClick={() => onDone?.(null)} disabled={busy}>
          Cancel
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </form>
  )
}
