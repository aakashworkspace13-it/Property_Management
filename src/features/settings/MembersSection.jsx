import { useEffect, useState } from 'react'
import { useAuth } from '../auth/auth-context.js'
import { addMember, memberId, ROLES, updateMember, watchMembers } from '../../services/members.js'

const ROLE_LABEL = { admin: 'Admin', family: 'Family member' }

function friendlyError(e) {
  return e?.code === 'permission-denied' ? 'You do not have permission to do that.' : e?.message ?? String(e)
}

export default function MembersSection() {
  const { user, isAdmin } = useAuth()
  const [members, setMembers] = useState(null)
  const [error, setError] = useState(null)
  const [form, setForm] = useState({ email: '', name: '', role: 'family' })
  const [busy, setBusy] = useState(false)
  const me = memberId(user?.email)

  useEffect(() => watchMembers(setMembers, (e) => setError(friendlyError(e))), [])

  async function run(action) {
    setBusy(true)
    setError(null)
    try {
      await action()
      return true
    } catch (e) {
      setError(friendlyError(e))
      return false
    } finally {
      setBusy(false)
    }
  }

  async function handleAdd(event) {
    event.preventDefault()
    if (await run(() => addMember(user, form))) setForm({ email: '', name: '', role: 'family' })
  }

  return (
    <section className="card section">
      <h2>Family members</h2>
      <p className="muted">
        People on this list can sign in with their Google account. Admins can add people, change roles and turn access
        off. Only admins can delete records.
      </p>

      {members === null ? (
        <p className="muted">Loading…</p>
      ) : (
        <ul className="member-list">
          {members.map((m) => {
            const self = m.email === me
            return (
              <li key={m.email} className={m.active ? '' : 'inactive'}>
                <div className="member-main">
                  <strong>{m.name}</strong>
                  {self && <span className="pill">You</span>}
                  {!m.active && <span className="pill off">Access off</span>}
                  <div className="muted small">{m.email}</div>
                </div>
                {isAdmin && !self ? (
                  <div className="member-actions">
                    <select
                      aria-label={`Role for ${m.name}`}
                      value={m.role}
                      disabled={busy}
                      onChange={(e) => run(() => updateMember(user, m, { role: e.target.value }))}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="button"
                      disabled={busy}
                      onClick={() => run(() => updateMember(user, m, { active: !m.active }))}
                    >
                      {m.active ? 'Turn off access' : 'Turn on access'}
                    </button>
                  </div>
                ) : (
                  <span className="muted small">{ROLE_LABEL[m.role]}</span>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {isAdmin && (
        <form className="form inline-form" onSubmit={handleAdd}>
          <h3>Add a family member</h3>
          <label>
            Google email
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              autoComplete="off"
            />
          </label>
          <label>
            Name
            <input required maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label>
            Role
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="button primary" disabled={busy}>
            Add member
          </button>
        </form>
      )}

      {error && <p className="error">{error}</p>}
    </section>
  )
}
