import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../auth/auth-context.js'
import { formatINR, todayInKolkata } from '../../lib/money/index.js'
import { computeReminders, dashboardFigures } from '../../lib/reminders.js'
import { addReminder, setReminderDone, watchOwnReminders } from '../../services/reminders.js'
import { useCollectionData } from '../collections/useCollectionData.js'
import { useEnsureDueCharges } from '../collections/useEnsureDueCharges.js'
import { useElectricityData } from '../electricity/useElectricityData.js'
import { useExpenseData } from '../expenses/useExpenseData.js'
import { usePropertyData } from '../flats/usePropertyData.js'
import { useTenancyData } from '../tenants/useTenancyData.js'

const LEVEL = {
  overdue: { label: 'Overdue', className: 'pill off' },
  soon: { label: 'Soon', className: 'pill warn' },
  upcoming: { label: 'Upcoming', className: 'pill muted-pill' },
}

function AddReminder({ actor }) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(todayInKolkata())
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  async function save(event) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await addReminder(actor, { title, date })
      setTitle('')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <form className="inline-actions add-reminder" onSubmit={save}>
      <input placeholder="Add a reminder" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Reminder" />
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
      <button type="submit" className="button small-button primary" disabled={busy || !title.trim()}>
        Add
      </button>
      {error && <span className="error small">{error}</span>}
    </form>
  )
}

export default function DashboardPage() {
  const { user, member } = useAuth()
  const today = todayInKolkata()
  const { flats, connections, loading: pLoading } = usePropertyData()
  const { tenants, tenancies, loading: tLoading } = useTenancyData()
  const { charges, payments, loading: cLoading } = useCollectionData()
  const { bills, loading: eLoading } = useElectricityData()
  const { expenses, loading: xLoading } = useExpenseData()
  const [ownReminders, setOwnReminders] = useState(null)
  const [error, setError] = useState(null)

  useEffect(
    () =>
      watchOwnReminders(setOwnReminders, (e) => {
        // Show the rest of the Dashboard even if own reminders cannot be loaded.
        setOwnReminders([])
        setError(e.code === 'permission-denied' ? 'Own reminders are not available yet (database rules not deployed).' : e.message)
      }),
    [],
  )
  const ready = !(pLoading || tLoading || cLoading)
  const genError = useEnsureDueCharges(tenancies, charges, today, ready)

  if (!ready || eLoading || xLoading || !ownReminders) return <p className="muted">Loading…</p>

  const data = { tenancies, tenants, flats, connections, charges, payments, bills, expenses, ownReminders }
  const figures = dashboardFigures(data, today)
  const reminders = computeReminders(data, today)

  async function markDone(reminderId) {
    const r = ownReminders.find((x) => x.id === reminderId)
    try {
      await setReminderDone(user, r, true)
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <section className="page">
      <h1>Hello{member?.name ? `, ${member.name.split(' ')[0]}` : ''}</h1>
      {(error || genError) && <p className="error small">{error || genError}</p>}

      <div className="stats">
        <Link to="/collections" className="card stat stat-link">
          <span className="muted small">Rent this month</span>
          <strong>{formatINR(figures.rentReceived)}</strong>
          <span className="muted small">received of {formatINR(figures.rentDue)} due</span>
        </Link>
        <Link to="/collections" className="card stat stat-link">
          <span className="muted small">Outstanding (rent + electricity)</span>
          <strong>{formatINR(figures.outstanding)}</strong>
        </Link>
        <Link to="/flats" className="card stat stat-link">
          <span className="muted small">Flats</span>
          <strong>
            {figures.occupied} occupied · {figures.vacant} vacant
          </strong>
          <span className="muted small">{figures.ownUse} own use</span>
        </Link>
        <Link to="/expenses" className="card stat stat-link">
          <span className="muted small">Expenses this month</span>
          <strong>{formatINR(figures.expenses.total)}</strong>
          <span className="muted small">
            family {formatINR(figures.expenses.owner)} · tenant {formatINR(figures.expenses.tenant)}
          </span>
        </Link>
      </div>

      <section className="card section">
        <h2>Reminders</h2>
        <AddReminder actor={user} />
        {reminders.length === 0 ? (
          <p className="muted">Nothing needs attention.</p>
        ) : (
          <ul className="member-list">
            {reminders.map((r) => {
              const l = LEVEL[r.level]
              return (
                <li key={r.id}>
                  <div className="member-main">
                    <span className={l.className}>{l.label}</span> <strong>{r.title}</strong>
                    <div className="muted small">{r.detail}</div>
                  </div>
                  <div className="member-actions">
                    {r.link && (
                      <Link className="button small-button" to={r.link}>
                        Open
                      </Link>
                    )}
                    {r.kind === 'own' && (
                      <button type="button" className="button small-button" onClick={() => markDone(r.reminderId)}>
                        Done
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </section>
  )
}
