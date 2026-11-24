import { useEffect, useState } from 'react'
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore'
import { db } from '../../services/firebase.js'
import { useAuth } from '../auth/auth-context.js'
import BackButton from '../../components/BackButton.jsx'

const ENTITIES = ['member', 'building', 'flat', 'connection', 'tenant', 'tenancy', 'charge', 'payment', 'document', 'bill', 'reading', 'expense', 'category', 'reminder', 'settings']

function value(v) {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

// Change history (audit log): who changed what and when. Admins only (also enforced by the rules).
export default function HistoryPage() {
  const { isAdmin } = useAuth()
  const [entries, setEntries] = useState(null)
  const [error, setError] = useState(null)
  const [filters, setFilters] = useState({ from: '', to: '', entity: '' })

  useEffect(() => {
    if (!isAdmin) return
    getDocs(query(collection(db, 'auditLogs'), orderBy('at', 'desc'), limit(500)))
      .then((snap) => setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() }))))
      .catch((e) => setError(e.code === 'permission-denied' ? 'Only admins can see the change history.' : e.message))
  }, [isAdmin])

  if (!isAdmin) return <p className="error">Only admins can see the change history.</p>
  if (error) return <p className="error">{error}</p>
  if (!entries) return <p className="muted">Loading…</p>

  const dateOf = (e) => (e.at?.toDate ? e.at.toDate().toLocaleString('en-CA', { timeZone: 'Asia/Kolkata', hour12: false }).replace(',', '') : '')
  const shown = entries.filter((e) => {
    const d = dateOf(e).slice(0, 10)
    return (!filters.entity || e.entity === filters.entity) && (!filters.from || d >= filters.from) && (!filters.to || d <= filters.to)
  })
  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }))

  return (
    <section className="page">
      <BackButton fallback="/settings" />
      <h1>Change history</h1>
      <div className="toolbar">
        <label className="field">
          <span className="field-label small">From</span>
          <input type="date" value={filters.from} onChange={set('from')} />
        </label>
        <label className="field">
          <span className="field-label small">To</span>
          <input type="date" value={filters.to} onChange={set('to')} />
        </label>
        <label className="field">
          <span className="field-label small">Record type</span>
          <select value={filters.entity} onChange={set('entity')}>
            <option value="">All</option>
            {ENTITIES.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="muted small">Latest {entries.length} changes; {shown.length} shown. Phone and ID numbers are never stored here.</p>
      <div className="table-wrap card">
        <table className="table stack">
          <thead>
            <tr>
              <th>When (IST)</th>
              <th>Who</th>
              <th>Action</th>
              <th>Record</th>
              <th>Changed</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((e) => (
              <tr key={e.id}>
                <td className="nowrap" data-label="When">{dateOf(e)}</td>
                <td data-label="Who">{e.actorEmail}</td>
                <td data-label="Action">{e.action}</td>
                <td data-label="Record">
                  {e.entity} <span className="muted small">{e.entityId}</span>
                </td>
                <td className="small" data-label="Changed">
                  {(e.changedFields ?? []).map((k) => (
                    <div key={k}>
                      {k}: {e.before ? `${value(e.before[k])} → ` : ''}
                      {value(e.after?.[k])}
                    </div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
