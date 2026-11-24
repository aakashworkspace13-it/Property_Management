import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import Field from '../../components/Field.jsx'
import { useAuth } from '../auth/auth-context.js'
import { addDays, anniversary, formatINR, todayInKolkata } from '../../lib/money/index.js'
import { flatReference } from '../../lib/property.js'
import { agreementStatus, checkUpload, formatMobile, idTypeLabel, maskIdNumber, validateRenewal, validateTenant } from '../../lib/tenants.js'
import { renewAgreement, updateTenancyDetails, updateTenant, watchDocuments } from '../../services/tenants.js'
import { getDriveToken, openDriveDocument, uploadToDrive } from '../../services/drive.js'
import { useMembers } from '../settings/useMembers.js'
import { usePropertyData } from '../flats/usePropertyData.js'
import { useTenancyData } from './useTenancyData.js'
import FilePicker from './FilePicker.jsx'
import TenantFields from './TenantFields.jsx'
import TenantPhoto from './TenantPhoto.jsx'
import { tenantToForm } from './tenant-form.js'
import BackButton from '../../components/BackButton.jsx'
import TapToEdit from '../../components/TapToEdit.jsx'

const AGREEMENT = {
  none: { label: 'No agreement dates', className: 'pill muted-pill' },
  active: { label: 'Agreement active', className: 'pill' },
  expiring: { label: 'Agreement ends within 30 days', className: 'pill warn' },
  expired: { label: 'Agreement expired', className: 'pill off' },
}

function friendly(e) {
  return e?.code === 'permission-denied' ? 'The database refused this (permission denied).' : e?.message ?? String(e)
}

function Detail({ label, children }) {
  return (
    <div className="detail">
      <span className="muted small">{label}</span>
      <span>{children || '—'}</span>
    </div>
  )
}

function Documents({ tenant, tenancyId, actor }) {
  const { members } = useMembers()
  const [docs, setDocs] = useState(null)
  const [files, setFiles] = useState([])
  const [kind, setKind] = useState('id-proof')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => watchDocuments(tenant.id, setDocs, (e) => setError(friendly(e))), [tenant.id])

  async function upload() {
    if (files.some((f) => checkUpload(f))) return setError('Remove the files marked with a problem.')
    setBusy(true)
    setError(null)
    try {
      const token = await getDriveToken() // first, so the Google pop-up opens from the click
      const base = kind === 'agreement' ? 'Agreement' : 'ID proof'
      for (const [i, file] of files.entries()) {
        const label = files.length > 1 ? `${base} ${i + 1}` : base
        await uploadToDrive(actor, token, { tenant, tenancyId, kind, label, file, members: members ?? [] })
      }
      setFiles([])
    } catch (e) {
      setError(friendly(e))
    } finally {
      setBusy(false)
    }
  }

  function open(d) {
    setError(null)
    openDriveDocument(d)
  }

  const sorted = [...(docs ?? [])].sort((a, b) => (b.uploadedAt?.seconds ?? 0) - (a.uploadedAt?.seconds ?? 0))
  return (
    <section className="card section">
      <h2>Documents</h2>
      {docs === null ? (
        <p className="muted">Loading…</p>
      ) : sorted.length === 0 ? (
        <p className="muted">No ID proof or agreement uploaded yet.</p>
      ) : (
        <ul className="member-list">
          {sorted.map((d) => (
            <li key={d.id}>
              <div>
                <strong>{d.label || (d.kind === 'agreement' ? 'Agreement' : 'ID proof')}</strong>
                <div className="muted small">
                  {d.fileName} · {d.contentType === 'application/pdf' ? 'PDF' : 'Photo'} · in {d.uploadedBy}'s Google Drive
                  {d.uploadedAt?.toDate && ` on ${d.uploadedAt.toDate().toLocaleDateString('en-IN')}`}
                </div>
              </div>
              <button type="button" className="button small-button" onClick={() => open(d)}>
                Open
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="inline-form">
        <h3>Add files</h3>
        <p className="muted small">Saved in your Google Drive (Property Manager folder) and shared view-only with the family.</p>
        <label className="field">
          <span className="field-label">Type</span>
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="id-proof">ID proof</option>
            <option value="agreement">Agreement</option>
          </select>
        </label>
        <FilePicker label="Files" files={files} onChange={setFiles} />
        {files.length > 0 && (
          <div className="form-actions">
            <button type="button" className="button primary" onClick={upload} disabled={busy}>
              {busy ? 'Uploading…' : `Upload ${files.length} file${files.length === 1 ? '' : 's'}`}
            </button>
          </div>
        )}
      </div>
      {error && <p className="error">{error}</p>}
    </section>
  )
}

function EditTenant({ tenant, actor, onDone }) {
  const [values, setValues] = useState(tenantToForm(tenant))
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function save(event) {
    event.preventDefault()
    const { value, errors: errs } = validateTenant(values)
    setErrors(errs)
    if (Object.keys(errs).length) return
    setBusy(true)
    try {
      await updateTenant(actor, tenant, value)
      onDone()
    } catch (e) {
      setError(friendly(e))
      setBusy(false)
    }
  }

  return (
    <form className="form card section" onSubmit={save} noValidate>
      <h2>Edit tenant details</h2>
      <TenantFields values={values} setValue={(k, v) => setValues((x) => ({ ...x, [k]: v }))} errors={errors} />
      <div className="form-actions">
        <button type="submit" className="button primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="button" onClick={onDone} disabled={busy}>
          Cancel
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </form>
  )
}

function EditAgreement({ tenancy, actor, onDone }) {
  const [values, setValues] = useState({
    agreementStart: tenancy.agreementStart ?? '',
    agreementEnd: tenancy.agreementEnd ?? '',
    notes: tenancy.notes ?? '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const bind = (k) => ({ value: values[k], onChange: (e) => setValues((x) => ({ ...x, [k]: e.target.value })) })

  async function save(event) {
    event.preventDefault()
    if (values.agreementStart && values.agreementEnd && values.agreementEnd < values.agreementStart) {
      return setError('Agreement end is before its start.')
    }
    setBusy(true)
    try {
      await updateTenancyDetails(actor, tenancy, values)
      onDone()
    } catch (e) {
      setError(friendly(e))
      setBusy(false)
    }
  }

  return (
    <form className="form panel-form" onSubmit={save}>
      <div className="form-row">
        <Field label="Agreement start">
          <input type="date" {...bind('agreementStart')} />
        </Field>
        <Field label="Agreement end">
          <input type="date" {...bind('agreementEnd')} />
        </Field>
      </div>
      <div className="form-actions">
        <button type="submit" className="button primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="button" onClick={onDone} disabled={busy}>
          Cancel
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </form>
  )
}

function RenewAgreement({ tenancy, actor, onDone }) {
  const nextStart = tenancy.agreementEnd ? addDays(tenancy.agreementEnd, 1) : todayInKolkata()
  const [values, setValues] = useState({ start: nextStart, end: addDays(anniversary(nextStart, 12), -1) })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const bind = (k) => ({ value: values[k], onChange: (e) => setValues((v) => ({ ...v, [k]: e.target.value })) })

  async function save(event) {
    event.preventDefault()
    const { value, errors } = validateRenewal(tenancy, values)
    if (Object.keys(errors).length) return setError(Object.values(errors).join(' '))
    setBusy(true)
    try {
      await renewAgreement(actor, tenancy, value)
      onDone()
    } catch (e) {
      setError(friendly(e))
      setBusy(false)
    }
  }

  return (
    <form className="form panel-form" onSubmit={save}>
      <h3>Renew agreement</h3>
      <p className="muted small">
        The current agreement ({tenancy.agreementStart || '?'} to {tenancy.agreementEnd || '?'}) is kept in the history. Rent does not
        change here.
      </p>
      <div className="form-row">
        <Field label="New start">
          <input type="date" {...bind('start')} />
        </Field>
        <Field label="New end">
          <input type="date" {...bind('end')} />
        </Field>
      </div>
      <div className="form-actions">
        <button type="submit" className="button primary" disabled={busy}>
          {busy ? 'Saving…' : 'Renew'}
        </button>
        <button type="button" className="button" onClick={onDone} disabled={busy}>
          Cancel
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </form>
  )
}

export default function TenantPage() {
  const { id } = useParams()
  const location = useLocation()
  const { user } = useAuth()
  const { tenants, tenancies, loading, error } = useTenancyData()
  const { buildings, flats } = usePropertyData()
  const [showId, setShowId] = useState(false)
  const [editing, setEditing] = useState(null) // 'tenant' | tenancyId
  const today = todayInKolkata()

  if (error) return <p className="error">{error}</p>
  if (loading) return <p className="muted">Loading…</p>
  const tenant = tenants.find((t) => t.id === id)
  if (!tenant) return <p className="error">Tenant not found.</p>

  const own = tenancies.filter((t) => t.tenantId === id).sort((a, b) => b.moveIn.localeCompare(a.moveIn))
  const current = own.find((t) => !t.moveOut)
  const failedUploads = location.state?.failedUploads

  return (
    <section className="page narrow">
      <BackButton fallback="/flats" />
      <div className="tenant-title">
        <TenantPhoto tenantId={tenant.id} name={tenant.name} actor={user} />
        <h1>{tenant.name}</h1>
      </div>
      {failedUploads?.length > 0 && (
        <p className="notice error-notice">
          The tenant was saved, but these files did not upload: {failedUploads.join(', ')}. Add them again on this page.
        </p>
      )}

      {editing === 'tenant' ? (
        <EditTenant tenant={tenant} actor={user} onDone={() => setEditing(null)} />
      ) : (
        <section className="card section">
          <TapToEdit as="div" className="page-header" label="Edit details" onEdit={() => setEditing('tenant')}>
            <h2>Details</h2>
          </TapToEdit>
          <div className="detail-grid">
            <Detail label="Mobile">{formatMobile(tenant.mobile)}</Detail>
            <Detail label="Alternate number">{formatMobile(tenant.altMobile)}</Detail>
            <Detail label="Members">{tenant.members}</Detail>
            <Detail label="Vehicles">
              {tenant.twoWheelers} two-wheeler{tenant.twoWheelers === 1 ? '' : 's'}, {tenant.fourWheelers} four-wheeler
              {tenant.fourWheelers === 1 ? '' : 's'}
            </Detail>
            <Detail label={idTypeLabel(tenant.idType)}>
              {showId ? tenant.idNumber : maskIdNumber(tenant.idNumber)}{' '}
              <button type="button" className="link-button" onClick={() => setShowId(!showId)}>
                {showId ? 'Hide' : 'Show'}
              </button>
            </Detail>
            <Detail label="Emergency contact">
              {tenant.emergencyName &&
                `${tenant.emergencyName}${tenant.emergencyRelation ? ` (${tenant.emergencyRelation})` : ''} · ${formatMobile(tenant.emergencyMobile)}`}
            </Detail>
          </div>
        </section>
      )}

      <section className="card section">
        <h2>Tenancies</h2>
        {own.map((t) => {
          const flat = flats?.find((f) => f.code === t.flatId)
          const building = buildings?.find((b) => b.code === t.buildingId)
          const a = AGREEMENT[agreementStatus(t.agreementEnd, today)]
          return (
            <div key={t.id} className="tenancy">
              <div className="page-header">
                <div>
                  <strong>
                    <Link to={`/flats/${t.flatId}`}>{flat ? flatReference(building, flat) : t.flatId}</Link>
                  </strong>
                  <span className={t.moveOut ? 'pill muted-pill' : 'pill'}>{t.moveOut ? 'Moved out' : 'Current'}</span>
                  {!t.moveOut && <span className={a.className}>{a.label}</span>}
                </div>
                <div className="member-actions">
                  <Link className="button small-button" to={`/tenancies/${t.id}`}>
                    Rent ledger
                  </Link>
                  {editing !== t.id && !t.moveOut && (
                    <button type="button" className="button small-button" onClick={() => setEditing(`renew-${t.id}`)}>
                      Renew agreement
                    </button>
                  )}
                  {editing !== t.id && !t.agreementStart && !t.agreementEnd && (
                    <button type="button" className="button small-button primary" onClick={() => setEditing(t.id)}>
                      Add agreement
                    </button>
                  )}
                </div>
              </div>
              <div className="detail-grid">
                <Detail label="Monthly rent">{formatINR(t.monthlyRent)}</Detail>
                <Detail label="Move-in">{t.moveIn}</Detail>
                <Detail label="Move-out">{t.moveOut}</Detail>
                <Detail label="Rent tracked from">{t.trackFrom}</Detail>
                {t.agreementStart || t.agreementEnd ? (
                  <div className="detail">
                    <span className="muted small">Agreement</span>
                    <TapToEdit label="Edit agreement" onEdit={() => setEditing(t.id)}>
                      {`${t.agreementStart || '?'} to ${t.agreementEnd || '?'}`}
                    </TapToEdit>
                  </div>
                ) : (
                  <Detail label="Agreement">Not added yet</Detail>
                )}
              </div>
              {t.agreementHistory?.length > 0 && (
                <p className="muted small">
                  Earlier agreements: {[...t.agreementHistory].reverse().map((h) => `${h.start || '?'} to ${h.end || '?'}`).join(' · ')}
                </p>
              )}
              {editing === t.id && <EditAgreement tenancy={t} actor={user} onDone={() => setEditing(null)} />}
              {editing === `renew-${t.id}` && <RenewAgreement tenancy={t} actor={user} onDone={() => setEditing(null)} />}
            </div>
          )
        })}
      </section>

      <Documents tenant={tenant} tenancyId={current?.id ?? null} actor={user} />
    </section>
  )
}
