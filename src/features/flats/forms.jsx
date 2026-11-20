import { useState } from 'react'
import { flatCode } from '../../lib/property.js'

const FLOOR_SUGGESTIONS = ['Ground', '1st', '2nd', '3rd', '4th', '5th', 'Basement']
const POSITION_SUGGESTIONS = ['Front', 'Back', 'Left', 'Right', 'Single', '1', '2']

function friendly(e) {
  return e?.code === 'permission-denied' ? 'Only admins can change buildings and flats.' : e?.message ?? String(e)
}

/** Shared submit handling: busy flag, error message, close on success. */
function useSubmit(onDone) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  async function submit(event, action) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await action()
      onDone?.()
    } catch (e) {
      setError(friendly(e))
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, submit }
}

function Actions({ busy, onCancel, label }) {
  return (
    <div className="form-actions">
      <button type="submit" className="button primary" disabled={busy}>
        {busy ? 'Saving…' : label}
      </button>
      <button type="button" className="button" onClick={onCancel} disabled={busy}>
        Cancel
      </button>
    </div>
  )
}

export function BuildingForm({ initial, onSave, onCancel }) {
  const editing = Boolean(initial)
  const [values, setValues] = useState({
    code: initial?.code ?? '',
    name: initial?.name ?? '',
    address: initial?.address ?? '',
    ownUse: initial?.ownUse ?? false,
    notes: initial?.notes ?? '',
  })
  const { busy, error, submit } = useSubmit(onCancel)
  const set = (k) => (e) => setValues({ ...values, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  return (
    <form className="form panel-form" onSubmit={(e) => submit(e, () => onSave(values))}>
      <h3>{editing ? `Edit ${initial.name}` : 'Add a building'}</h3>
      {!editing && (
        <label>
          Building code
          <input required maxLength={10} placeholder="e.g. B08" value={values.code} onChange={set('code')} />
          <span className="muted small">Permanent short code used in flat codes. Cannot be changed later.</span>
        </label>
      )}
      <label>
        Name
        <input required maxLength={80} value={values.name} onChange={set('name')} />
      </label>
      <label>
        Address (optional)
        <input maxLength={300} value={values.address} onChange={set('address')} />
      </label>
      <label className="check">
        <input type="checkbox" checked={values.ownUse} onChange={set('ownUse')} />
        Own use (not rented to tenants)
      </label>
      <label>
        Notes (optional)
        <textarea maxLength={1000} rows={2} value={values.notes} onChange={set('notes')} />
      </label>
      <Actions busy={busy} onCancel={onCancel} label={editing ? 'Save' : 'Add building'} />
      {error && <p className="error">{error}</p>}
    </form>
  )
}

function ConnectionSelect({ connections, value, onChange }) {
  return (
    <select value={value ?? ''} onChange={onChange}>
      <option value="">No electricity connection</option>
      {[...connections]
        .sort((a, b) => a.caNumber.localeCompare(b.caNumber))
        .map((c) => (
          <option key={c.caNumber} value={c.caNumber}>
            {c.caNumber} · {c.type === 'commercial' ? 'Commercial' : 'Domestic'}
            {c.submeter ? ' · sub-meter' : ''}
          </option>
        ))}
    </select>
  )
}

/** Add a flat (building given) or edit one (flat given; floor/position are fixed). */
export function FlatForm({ building, flat, flats, connections, onSave, onCancel }) {
  const editing = Boolean(flat)
  const [values, setValues] = useState({
    floor: flat?.floor ?? '',
    position: flat?.position ?? '',
    friendlyName: flat?.friendlyName ?? '',
    ownUse: flat?.ownUse ?? building.ownUse ?? false,
    connectionId: flat?.connectionId ?? '',
    notes: flat?.notes ?? '',
  })
  const { busy, error, submit } = useSubmit(onCancel)
  const set = (k) => (e) => setValues({ ...values, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  let preview = null
  if (!editing && values.floor.trim() && values.position.trim()) {
    try {
      const code = flatCode(building.code, values.floor, values.position)
      preview = { code, taken: flats.some((f) => f.code === code) }
    } catch {
      preview = null
    }
  }

  return (
    <form className="form panel-form" onSubmit={(e) => submit(e, () => onSave(values))}>
      <h3>{editing ? `Edit flat ${flat.code}` : `Add a flat to ${building.name}`}</h3>
      {!editing && (
        <div className="form-row">
          <label>
            Floor
            <input required list="floor-suggestions" maxLength={40} value={values.floor} onChange={set('floor')} />
          </label>
          <label>
            Position
            <input required list="position-suggestions" maxLength={40} value={values.position} onChange={set('position')} />
          </label>
          <datalist id="floor-suggestions">
            {FLOOR_SUGGESTIONS.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
          <datalist id="position-suggestions">
            {POSITION_SUGGESTIONS.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </div>
      )}
      {preview && (
        <p className={preview.taken ? 'error small' : 'muted small'}>
          Flat code: <strong>{preview.code}</strong>
          {preview.taken && ' — already exists (same floor and position in this building).'}
        </p>
      )}
      <label>
        Friendly name (optional)
        <input maxLength={80} placeholder="e.g. Clinic, Shop, Hall" value={values.friendlyName} onChange={set('friendlyName')} />
      </label>
      <label>
        Electricity connection (CA number)
        <ConnectionSelect connections={connections} value={values.connectionId} onChange={set('connectionId')} />
      </label>
      <label className="check">
        <input type="checkbox" checked={values.ownUse} onChange={set('ownUse')} />
        Own use (not rented to tenants)
      </label>
      <label>
        Notes (optional)
        <textarea maxLength={1000} rows={2} value={values.notes} onChange={set('notes')} />
      </label>
      <Actions busy={busy || Boolean(preview?.taken)} onCancel={onCancel} label={editing ? 'Save' : 'Add flat'} />
      {error && <p className="error">{error}</p>}
    </form>
  )
}
