import { useEffect, useState } from 'react'
import Field from '../../components/Field.jsx'
import { useAuth } from '../auth/auth-context.js'
import { setElectricityRate, watchSettings } from '../../services/electricity.js'

// One family-wide electricity rate per unit for shared meters. Admins change it; old charges keep
// the rate they were made with.
export default function ElectricityRateSection() {
  const { user, isAdmin } = useAuth()
  const [current, setCurrent] = useState(null)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)

  useEffect(
    () =>
      watchSettings(
        (s) => {
          setCurrent(s.electricityRate ?? '')
          setValue((v) => v || s.electricityRate || '')
        },
        (e) => setError(e.message),
      ),
    [],
  )

  async function save(event) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await setElectricityRate(user, value, current)
      setMessage('Saved. New readings use this rate; existing charges are unchanged.')
    } catch (e) {
      setError(e.code === 'permission-denied' ? 'Only admins can change the rate.' : e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card section">
      <h2>Electricity rate</h2>
      <p className="muted">
        Rupees per unit charged to tenants on shared meters (sub-meters). Current rate:{' '}
        <strong>{current === null ? '…' : current ? `${current} per unit` : 'not set'}</strong>.
      </p>
      {isAdmin ? (
        <form className="form inline-form" onSubmit={save}>
          <Field label="Rate per unit" hint="e.g. 4 or 6.50">
            <input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
          </Field>
          <div className="form-actions">
            <button type="submit" className="button primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save rate'}
            </button>
          </div>
        </form>
      ) : (
        <p className="muted small">Only admins can change the rate.</p>
      )}
      {message && <p className="success">{message}</p>}
      {error && <p className="error">{error}</p>}
    </section>
  )
}
