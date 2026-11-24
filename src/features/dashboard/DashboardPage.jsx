import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../auth/auth-context.js'
import { formatINR, todayInKolkata } from '../../lib/money/index.js'
import { floorOrder, occupancy } from '../../lib/property.js'
import { computeReminders } from '../../lib/reminders.js'
import { allocatedCharges, monthLabel, overviewRange, periodOverview, rentTree } from '../../lib/overview.js'
import RoomsGrid from './RoomsGrid.jsx'
import RentTree from './RentTree.jsx'
import BuildingPicker from './BuildingPicker.jsx'
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

function shortDate(date) {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

export default function DashboardPage() {
  const { user, member } = useAuth()
  const today = todayInKolkata()
  const { buildings, flats, connections, loading: pLoading } = usePropertyData()
  const { tenants, tenancies, loading: tLoading } = useTenancyData()
  const { charges, payments, loading: cLoading } = useCollectionData()
  const { bills, loading: eLoading } = useElectricityData()
  const { expenses, loading: xLoading } = useExpenseData()
  const [period, setPeriod] = useState('month') // 'month' | 'year'
  const [chosen, setChosen] = useState([]) // building codes; empty = all buildings
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
  const reminders = computeReminders(data, today)
  const range = overviewRange(period, today)
  const base = { rows: allocatedCharges(tenancies, charges, payments, today), tenancies, payments, expenses }
  const sortedBuildings = [...buildings].sort((a, b) => a.code.localeCompare(b.code))
  const scope = chosen.filter((c) => buildings.some((b) => b.code === c))
  const shownBuildings = scope.length ? sortedBuildings.filter((b) => scope.includes(b.code)) : sortedBuildings
  const shownFlats = flats.filter((f) => shownBuildings.some((b) => b.code === f.buildingId))
  const total = periodOverview(base, range, scope)
  const tree = rentTree(base, range, shownBuildings, shownFlats, (f) => -floorOrder(f))
  const rangeText = period === 'month' ? monthLabel(today) : `${shortDate(range.start)} – ${shortDate(today)}`
  const st = shownFlats.map((f) => occupancy(f, tenancies, today))
  const counts = { occupied: st.filter((x) => x === 'occupied').length, vacant: st.filter((x) => x === 'vacant').length, ownUse: st.filter((x) => x === 'own-use').length }

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

      <div className="period-bar">
        <BuildingPicker buildings={sortedBuildings} value={scope} onChange={setChosen} />
        <div className="segmented" role="tablist">
          <button type="button" role="tab" aria-selected={period === 'month'} className={period === 'month' ? 'active' : ''} onClick={() => setPeriod('month')}>
            This month
          </button>
          <button type="button" role="tab" aria-selected={period === 'year'} className={period === 'year' ? 'active' : ''} onClick={() => setPeriod('year')}>
            Year to date
          </button>
        </div>
        <span className="muted small">{rangeText}</span>
      </div>

      <div className="stats">
        <Link to="/collections" className="card stat stat-link">
          <span className="muted small">Total rent due</span>
          <strong>{formatINR(total.rent.due)}</strong>
        </Link>
        <Link to="/collections" className="card stat stat-link">
          <span className="muted small">Rent received</span>
          <strong className="ok-text">{formatINR(total.rent.received)}</strong>
        </Link>
        <Link to="/collections" className="card stat stat-link">
          <span className="muted small">Remaining balance</span>
          <strong className={total.rent.balance > 0 ? 'warn-text' : ''}>{formatINR(total.rent.balance)}</strong>
        </Link>
        <Link to="/collections" className="card stat stat-link">
          <span className="muted small">Overdue rent</span>
          <strong className={total.rent.overdue > 0 ? 'error-text' : ''}>{formatINR(total.rent.overdue)}</strong>
          <span className="muted small">
            {total.rent.overdueTenants} tenant{total.rent.overdueTenants === 1 ? '' : 's'}
          </span>
        </Link>
        <Link to="/electricity" className="card stat stat-link">
          <span className="muted small">Electricity</span>
          <strong>{formatINR(total.electricity.received)}</strong>
          <span className="muted small">received of {formatINR(total.electricity.due)} due</span>
        </Link>
        <Link to="/expenses" className="card stat stat-link">
          <span className="muted small">Expenses</span>
          <strong>{formatINR(total.expenses.total)}</strong>
          <span className="muted small">
            family {formatINR(total.expenses.owner)} · tenant {formatINR(total.expenses.tenant)}
          </span>
        </Link>
      </div>

      <h2 className="section-title">
        Occupancy{' '}
        <span className="muted small">
          <span className="ok-text">{counts.occupied} occupied</span> · <span className="warn-text">{counts.vacant} vacant</span>
          {counts.ownUse > 0 && ` · ${counts.ownUse} own use`}
        </span>
      </h2>
      <RoomsGrid buildings={shownBuildings} flats={shownFlats} tenancies={tenancies} today={today} />

      <h2 className="section-title">
        Rent by building <span className="muted small">{rangeText} · tap to open</span>
      </h2>
      <RentTree tree={tree} tenancies={tenancies} tenants={tenants} today={today} />

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
