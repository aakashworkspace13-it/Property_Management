import { useState } from 'react'
import Field from '../../components/Field.jsx'
import { useAuth } from '../auth/auth-context.js'
import { PAYMENT_METHODS } from '../../lib/collections.js'
import { PAYERS, validateExpense } from '../../lib/expenseRecords.js'
import { formatINR, todayInKolkata } from '../../lib/money/index.js'
import { floorLabel, sortFlats } from '../../lib/property.js'
import { addExpense } from '../../services/expenses.js'

/** Adds an expense for a whole building (split across all its flats) or one flat. */
export default function ExpenseForm({ buildings, flats, categories, onDone }) {
  const { user } = useAuth()
  const active = categories.filter((c) => !c.archived).sort((a, b) => a.name.localeCompare(b.name))
  const [values, setValues] = useState({
    date: todayInKolkata(),
    amount: '',
    categoryId: '', // must be chosen
    buildingId: '',
    flatId: '',
    payer: 'owner',
    paymentMode: 'cash',
    description: '',
    notes: '',
  })
  const [showErrors, setShowErrors] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const buildingFlats = sortFlats(flats.filter((f) => f.buildingId === values.buildingId))
  const { value, errors: allErrors } = validateExpense(values, buildingFlats.map((f) => f.code))
  const errors = showErrors ? allErrors : {}
  const bind = (k) => ({ value: values[k], onChange: (e) => setValues((v) => ({ ...v, [k]: e.target.value, ...(k === 'buildingId' ? { flatId: '' } : {}) })) })

  async function save(event) {
    event.preventDefault()
    setShowErrors(true)
    if (Object.keys(allErrors).length) return setError('Please fix the highlighted fields.')
    setBusy(true)
    setError(null)
    try {
      await addExpense(user, value)
      onDone?.(value)
    } catch (e) {
      setError(e.code === 'permission-denied' ? 'The database refused this expense (permission denied).' : e.message)
      setBusy(false)
    }
  }

  return (
    <form className="form panel-form wide-form" onSubmit={save} noValidate>
      <h3>Add expense</h3>
      {active.length === 0 && <p className="error small">No categories yet. An admin can add them in Settings → Expense categories.</p>}
      <div className="form-row three">
        <Field label="Date" required error={errors.date}>
          <input type="date" {...bind('date')} />
        </Field>
        <Field label="Amount" required error={errors.amount}>
          <input inputMode="decimal" {...bind('amount')} />
        </Field>
        <Field label="Category" required error={errors.categoryId}>
          <select {...bind('categoryId')}>
            <option value="">Choose…</option>
            {active.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="form-row">
        <Field label="Building" required error={errors.buildingId}>
          <select {...bind('buildingId')}>
            <option value="">Choose…</option>
            {[...buildings].sort((a, b) => a.code.localeCompare(b.code)).map((b) => (
              <option key={b.code} value={b.code}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="For" error={errors.flatId}>
          <select {...bind('flatId')} disabled={!values.buildingId}>
            <option value="">Whole building (split across all {buildingFlats.length} flats)</option>
            {buildingFlats.map((f) => (
              <option key={f.code} value={f.code}>
                {floorLabel(f.floor)} / {f.position}
                {f.friendlyName ? ` — ${f.friendlyName}` : ''}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="form-row">
        <Field label="Paid by" required error={errors.payer}>
          <select {...bind('payer')}>
            {PAYERS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Payment mode" required error={errors.paymentMode}>
          <select {...bind('paymentMode')}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Description (optional)" error={errors.description}>
        <input maxLength={200} placeholder="e.g. Bathroom tap replaced" {...bind('description')} />
      </Field>

      {value.shares && !values.flatId && Object.keys(value.shares).length > 1 && (
        <p className="notice small calm">
          Split equally across all {Object.keys(value.shares).length} flats (vacant ones too):{' '}
          {Object.entries(value.shares)
            .map(([code, paise]) => `${code} ${formatINR(paise)}`)
            .join(' · ')}
          . This split is stored and will not change if flats are added later.
        </p>
      )}

      <div className="form-actions">
        <button type="submit" className="button primary" disabled={busy || active.length === 0}>
          {busy ? 'Saving…' : `Save expense${value.amount ? ` ${formatINR(value.amount)}` : ''}`}
        </button>
        <button type="button" className="button" onClick={() => onDone?.(null)} disabled={busy}>
          Cancel
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </form>
  )
}
