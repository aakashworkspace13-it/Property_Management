import { useState } from 'react'
import { checkPhotoFile } from '../../lib/photo.js'
import { makePassportPhoto, saveTenantPhoto } from '../../services/photos.js'
import { useTenantPhoto } from './useTenantPhoto.js'

/** The passport photo, or a grey placeholder with the tenant's initials. */
export function PhotoFrame({ photo, name, size = 'large' }) {
  const initials = String(name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
  return photo ? (
    <img className={`passport-photo ${size}`} src={photo} alt={`Photo of ${name}`} />
  ) : (
    <div className={`passport-photo ${size} placeholder`} aria-label="No photo">
      {initials || '?'}
    </div>
  )
}

/** Two buttons: camera (front camera on phones) and gallery. Calls onPick(file). */
function PhotoButtons({ hasPhoto, busy, onPick }) {
  const pick = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) onPick(file)
  }
  return (
    <div className="inline-actions">
      <label className={`button small-button${busy ? ' disabled' : ''}`}>
        {hasPhoto ? 'Retake photo' : 'Take photo'}
        <input type="file" accept="image/*" capture="user" onChange={pick} hidden disabled={busy} />
      </label>
      <label className={`button small-button${busy ? ' disabled' : ''}`}>
        Choose photo
        <input type="file" accept="image/*" onChange={pick} hidden disabled={busy} />
      </label>
    </div>
  )
}

/** Tenant page: shows the saved photo and lets any member add or replace it (saved at once). */
export default function TenantPhoto({ tenantId, name, actor }) {
  const photo = useTenantPhoto(tenantId)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function change(file) {
    const problem = checkPhotoFile(file)
    if (problem) return setError(problem)
    setBusy(true)
    setError(null)
    try {
      await saveTenantPhoto(actor, tenantId, await makePassportPhoto(file))
    } catch (e) {
      setError(e.code === 'permission-denied' ? 'The database refused this photo (permission denied).' : e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="tenant-photo">
      <PhotoFrame photo={photo} name={name} />
      <div>
        <PhotoButtons hasPhoto={Boolean(photo)} busy={busy} onPick={change} />
        {busy && <p className="muted small">Saving photo…</p>}
        {error && <p className="error small">{error}</p>}
      </div>
    </div>
  )
}

/** Add tenant form: picks a photo before the tenant exists; `value` is the shrunk data URL. */
export function PhotoPicker({ name, value, onChange }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function pick(file) {
    const problem = checkPhotoFile(file)
    if (problem) return setError(problem)
    setBusy(true)
    setError(null)
    try {
      onChange(await makePassportPhoto(file))
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="tenant-photo">
      <PhotoFrame photo={value} name={name} />
      <div>
        <PhotoButtons hasPhoto={Boolean(value)} busy={busy} onPick={pick} />
        {value && (
          <button type="button" className="link-button small" onClick={() => onChange(null)}>
            Remove
          </button>
        )}
        {error && <p className="error small">{error}</p>}
      </div>
    </div>
  )
}
