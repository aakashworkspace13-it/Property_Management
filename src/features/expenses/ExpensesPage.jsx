import { useState } from 'react'
import Field from '../../components/Field.jsx'
import { useAuth } from '../auth/auth-context.js'
import { methodLabel, monthRange, PAYMENT_METHODS } from '../../lib/collections.js'
import { expenseSummary } from '../../lib/expenseRecords.js'
import { compareDates, formatINR, todayInKolkata } from '../../lib/money/index.js'
import { setVoided } from '../../services/collections.js'
import { updateExpenseDetails } from '../../services/expenses.js'
import { usePropertyData } from '../flats/usePropertyData.js'
import { useExpenseData } from './useExpenseData.js'
import ExpenseForm from './ExpenseForm.jsx'

function friendly(e) {
  return e?.code === 'permission-denied' ? 'Not allowed (permission denied).' : e?.message ?? String(e)
}

function EditExpense({ expense, categories, actor, onDone }) {
  const [values, setValues] = useState({
    categoryId: expense.categoryId,
    paymentMode: expense.paymentMode,
    description: expense.description,
    notes: expense.notes ?? '',
  })
  const [error, setError] = useState(null)
  const bind = (k) => ({ value: values[k], onChange: (e) => setValues((v) => ({ ...v, [k]: e.target.value })) })
  async function save() {
    try {
      await updateExpenseDetails(actor, expense, values)
      onDone()
    } catch (e) {
      setError(friendly(e))
    }
  }
  return (
    <div className="form panel-form">
      <p className="muted small">Amount, date, building and split cannot change. If they are wrong, an admin voids this expense and it is entered again.</p>
      <div className="form-row">
        <Field label="Category">
          <select {...bind('categoryId')}>
            {categories
              .filter((c) => !c.archived || c.id === expense.categoryId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Payment mode">
          <select {...bind('paymentMode')}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Description">
        <input maxLength={200} {...bind('description')} />
      </Field>
      <Field label="Notes">
        <input maxLength={500} {...bind('notes')} />
      </Field>
      <div className="form-actions">
        <button type="button" className="button primary" onClick={save}>
          Save
        </button>
        <button type="button" className="button" onClick={onDone}>
          Cancel
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  )
}

function VoidExpense({ expense, actor, onDone }) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState(null)
  async function save() {
    try {
      await setVoided(actor, 'expenses', expense, !expense.deleted, reason)
      onDone()
    } catch (e) {
      setError(friendly(e))
    }
  }
  return (
    <div className="form panel-form">
      <Field label={expense.deleted ? 'Why restore this expense?' : 'Why void this expense? (it stays in history)'} required>
        <input maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <div className="form-actions">
        <button type="button" className="button primary" onClick={save}>
          {expense.deleted ? 'Restore' : 'Void'}
        </button>
        <button type="button" className="button" onClick={onDone}>
          Cancel
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  )
}

export default function ExpensesPage() {
  const { user, isAdmin } = useAuth()
  const { buildings, flats, loading: pLoading } = usePropertyData()
  const { categories, expenses, loading: eLoading, error } = useExpenseData()
  const today = todayInKolkata()
  const [adding, setAdding] = useState(false)
  const [message, setMessage] = useState(null)
  const [panel, setPanel] = useState(null) // { id, mode: 'edit' | 'void' | 'split' }
  const [filters, setFilters] = useState({ month: today.slice(0, 7), buildingId: '', categoryId: '', showVoided: false })

  if (error) return <p className="error">{error}</p>
  if (pLoading || eLoading) return <p className="muted">Loading…</p>

  const range = filters.month ? monthRange(`${filters.month}-01`) : { start: '1900-01-01', end: '2999-12-31' }
  const year = { start: `${today.slice(0, 4)}-01-01`, end: `${today.slice(0, 4)}-12-31` }
  const scope = { buildingId: filters.buildingId, categoryId: filters.categoryId }
  const periodTotals = expenseSummary(expenses, range.start, range.end, scope)
  const yearTotals = expenseSummary(expenses, year.start, year.end, scope)
  const categoryName = (id) => categories.find((c) => c.id === id)?.name ?? '—'
  const buildingName = (code) => buildings.find((b) => b.code === code)?.name ?? code

  const list = expenses
    .filter((x) => filters.showVoided || !x.deleted)
    .filter((x) => compareDates(x.date, range.start) >= 0 && compareDates(x.date, range.end) <= 0)
    .filter((x) => !filters.buildingId || x.buildingId === filters.buildingId)
    .filter((x) => !filters.categoryId || x.categoryId === filters.categoryId)
    .sort((a, b) => compareDates(b.date, a.date))
  const setFilter = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  return (
    <section className="page">
      <div className="page-header">
        <h1>Expenses</h1>
        {!adding && (
          <button type="button" className="button primary" onClick={() => setAdding(true)}>
            Add expense
          </button>
        )}
      </div>
      {message && <p className="success">{message}</p>}
      {adding && (
        <ExpenseForm
          buildings={buildings}
          flats={flats}
          categories={categories}
          onDone={(saved) => {
            setAdding(false)
            if (saved) setMessage(`Saved ${formatINR(saved.amount)} — ${saved.description}.`)
          }}
        />
      )}

      <div className="stats">
        <div className="card stat">
          <span className="muted small">{filters.month ? 'This month' : 'All time'}: family-paid</span>
          <strong>{formatINR(periodTotals.owner)}</strong>
        </div>
        <div className="card stat">
          <span className="muted small">{filters.month ? 'This month' : 'All time'}: tenant-paid</span>
          <strong>{formatINR(periodTotals.tenant)}</strong>
        </div>
        <div className="card stat">
          <span className="muted small">{today.slice(0, 4)} total</span>
          <strong>{formatINR(yearTotals.total)}</strong>
          <span className="muted small">
            family {formatINR(yearTotals.owner)} · tenant {formatINR(yearTotals.tenant)}
          </span>
        </div>
      </div>

      <div className="toolbar">
        <label className="field">
          <span className="field-label small">Month</span>
          <input type="month" value={filters.month} onChange={setFilter('month')} />
        </label>
        <label className="field">
          <span className="field-label small">Building</span>
          <select value={filters.buildingId} onChange={setFilter('buildingId')}>
            <option value="">All buildings</option>
            {[...buildings].sort((a, b) => a.code.localeCompare(b.code)).map((b) => (
              <option key={b.code} value={b.code}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label small">Category</span>
          <select value={filters.categoryId} onChange={setFilter('categoryId')}>
            <option value="">All categories</option>
            {[...categories].sort((a, b) => a.name.localeCompare(b.name)).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.archived ? ' (archived)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="check small">
          <input type="checkbox" checked={filters.showVoided} onChange={setFilter('showVoided')} /> Show voided
        </label>
        {filters.month && (
          <button type="button" className="link-button small" onClick={() => setFilters((f) => ({ ...f, month: '' }))}>
            Show all months
          </button>
        )}
      </div>

      {list.length === 0 && <p className="muted">No expenses for this selection.</p>}
      <ul className="member-list">
        {list.map((x) => (
          <li key={x.id} className={x.deleted ? 'inactive' : ''}>
            <div className="member-main">
              <strong>{formatINR(x.amount)}</strong> · {x.description}
              <span className={x.payer === 'owner' ? 'pill' : 'pill muted-pill'}>{x.payer === 'owner' ? 'Family-paid' : 'Tenant-paid'}</span>
              {x.deleted && <span className="pill off">Voided</span>}
              <div className="muted small">
                {x.date} · {categoryName(x.categoryId)} · {buildingName(x.buildingId)}
                {x.flatId ? ` · flat ${x.flatId}` : ` · whole building (${Object.keys(x.shares ?? {}).length} flats)`} · {methodLabel(x.paymentMode)}
                {x.deleted && ` · voided: ${x.deleteReason}`}
                {x.notes && ` · ${x.notes}`}
              </div>
            </div>
            <div className="member-actions">
              {!x.flatId && (
                <button type="button" className="button small-button" onClick={() => setPanel(panel?.id === x.id && panel.mode === 'split' ? null : { id: x.id, mode: 'split' })}>
                  Split
                </button>
              )}
              {!x.deleted && (
                <button type="button" className="button small-button" onClick={() => setPanel({ id: x.id, mode: 'edit' })}>
                  Edit
                </button>
              )}
              {isAdmin && (
                <button type="button" className="button small-button" onClick={() => setPanel({ id: x.id, mode: 'void' })}>
                  {x.deleted ? 'Restore' : 'Void'}
                </button>
              )}
            </div>
            {panel?.id === x.id && panel.mode === 'split' && (
              <p className="muted small full-row">
                Stored split:{' '}
                {Object.entries(x.shares ?? {})
                  .sort()
                  .map(([code, paise]) => `${code} ${formatINR(paise)}`)
                  .join(' · ')}
              </p>
            )}
            {panel?.id === x.id && panel.mode === 'edit' && (
              <EditExpense expense={x} categories={categories} actor={user} onDone={() => setPanel(null)} />
            )}
            {panel?.id === x.id && panel.mode === 'void' && <VoidExpense expense={x} actor={user} onDone={() => setPanel(null)} />}
          </li>
        ))}
      </ul>
    </section>
  )
}
