import { useState } from 'react'
import { useAuth } from '../auth/auth-context.js'
import { maskPhone, planImport } from '../../lib/property.js'
import { existingCodes, runImport } from '../../services/property.js'

// Admin-only import of buildings, flats and electricity connections from the family's
// spreadsheet saved as CSV. Nothing is written until the admin reviews the preview and confirms.
export default function ImportSection() {
  const { user, isAdmin } = useAuth()
  const [plan, setPlan] = useState(null)
  const [names, setNames] = useState({})
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  if (!isAdmin) return null

  async function handleFile(event) {
    const file = event.target.files?.[0]
    event.target.value = '' // allow choosing the same file again
    if (!file) return
    setError(null)
    setResult(null)
    setPlan(null)
    if (!/\.csv$/i.test(file.name)) {
      setError('Choose a .csv file. In Excel: File → Save As → "CSV UTF-8 (Comma delimited)".')
      return
    }
    setBusy(true)
    try {
      const [text, existing] = await Promise.all([file.text(), existingCodes()])
      const p = planImport(text, existing)
      setPlan(p)
      setFileName(file.name)
      setNames(Object.fromEntries(p.buildings.map((b) => [b.code, b.name])))
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleImport() {
    setBusy(true)
    setError(null)
    try {
      setResult(await runImport(user, plan, names))
      setPlan(null)
    } catch (e) {
      setError(e.code === 'permission-denied' ? 'The database refused the import (permission denied).' : e.message)
    } finally {
      setBusy(false)
    }
  }

  const newCount = plan && {
    buildings: plan.buildings.filter((b) => !b.exists).length,
    flats: plan.flats.filter((f) => !f.exists).length,
    connections: plan.connections.filter((c) => !c.exists).length,
  }
  const nothingNew = newCount && newCount.buildings + newCount.flats + newCount.connections === 0
  const missingName = plan?.buildings.some((b) => !b.exists && !names[b.code]?.trim())

  return (
    <section className="card section">
      <h2>Import buildings and flats</h2>
      <p className="muted">
        Upload the property spreadsheet saved as CSV (Excel: File → Save As → <em>CSV UTF-8</em>). You will see a preview first;
        nothing is saved until you confirm. Flats already in the app are skipped, never changed.
      </p>
      <label className="button file-button">
        {busy && !plan ? 'Reading…' : 'Choose CSV file'}
        <input type="file" accept=".csv,text/csv" onChange={handleFile} disabled={busy} hidden />
      </label>

      {result && (
        <p className="success">
          Imported {result.buildings} buildings, {result.connections} electricity connections and {result.flats} flats. See them
          under Buildings and flats.
        </p>
      )}
      {error && <p className="error">{error}</p>}

      {plan && (
        <div className="import-preview">
          <h3>Preview of {fileName}</h3>

          {plan.problems.length > 0 && (
            <div className="notice error-notice">
              <strong>
                {plan.problems.length} row{plan.problems.length === 1 ? '' : 's'} will be skipped:
              </strong>
              <ul>
                {plan.problems.map((p, i) => (
                  <li key={i}>
                    Row {p.row}: {p.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {plan.warnings.length > 0 && (
            <div className="notice">
              <strong>Please check:</strong>
              <ul>
                {plan.warnings.map((w, i) => (
                  <li key={i}>
                    Row {w.row}: {w.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <h4>Buildings</h4>
          <p className="muted small">Edit the names before importing if needed. Codes are permanent.</p>
          <table className="table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Flats</th>
                <th>Use</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {plan.buildings.map((b) => (
                <tr key={b.code}>
                  <td>{b.code}</td>
                  <td>
                    {b.exists ? (
                      b.name
                    ) : (
                      <input
                        aria-label={`Name for ${b.code}`}
                        value={names[b.code] ?? ''}
                        maxLength={80}
                        onChange={(e) => setNames({ ...names, [b.code]: e.target.value })}
                      />
                    )}
                  </td>
                  <td>{b.flatCount}</td>
                  <td>{b.ownUse ? 'Own use' : 'Rented'}</td>
                  <td>{b.exists ? 'Already in app' : 'New'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h4>Flats ({plan.flats.length})</h4>
          <table className="table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Floor</th>
                <th>Position</th>
                <th>Name</th>
                <th>Use</th>
                <th>CA number</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {plan.flats.map((f) => (
                <tr key={f.code}>
                  <td>{f.code}</td>
                  <td>{f.floor}</td>
                  <td>{f.position}</td>
                  <td>{f.friendlyName}</td>
                  <td>{f.ownUse ? 'Own use' : 'Rented'}</td>
                  <td>{f.connectionId ?? '—'}</td>
                  <td>{f.exists ? 'Already in app' : 'New'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h4>Electricity connections ({plan.connections.length})</h4>
          <table className="table">
            <thead>
              <tr>
                <th>CA number</th>
                <th>Type</th>
                <th>Sub-meter</th>
                <th>Flats</th>
                <th>Holder</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {plan.connections.map((c) => (
                <tr key={c.caNumber}>
                  <td>{c.caNumber}</td>
                  <td>{c.type === 'commercial' ? 'Commercial' : 'Domestic'}</td>
                  <td>{c.submeter ? 'Yes' : 'No'}</td>
                  <td>{c.flatCodes.join(', ')}</td>
                  <td>
                    {c.holderName}
                    {c.holderPhone && <span className="muted small"> · {maskPhone(c.holderPhone)}</span>}
                  </td>
                  <td>{c.exists ? 'Already in app' : 'New'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="form-actions">
            <button
              type="button"
              className="button primary"
              onClick={handleImport}
              disabled={busy || nothingNew || missingName}
            >
              {busy
                ? 'Importing…'
                : nothingNew
                  ? 'Nothing new to import'
                  : `Import ${newCount.buildings} buildings, ${newCount.connections} connections, ${newCount.flats} flats`}
            </button>
            <button type="button" className="button" onClick={() => setPlan(null)} disabled={busy}>
              Cancel
            </button>
          </div>
          {missingName && <p className="error small">Every new building needs a name.</p>}
        </div>
      )}
    </section>
  )
}
