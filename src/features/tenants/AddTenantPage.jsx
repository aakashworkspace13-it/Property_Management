import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import Field from '../../components/Field.jsx'
import { useAuth } from '../auth/auth-context.js'
import { formatINR, rupeesToPaise, todayInKolkata } from '../../lib/money/index.js'
import { flatReference } from '../../lib/property.js'
import { checkUpload, defaultTrackFrom, trackingPreview, validateTenancy, validateTenant } from '../../lib/tenants.js'
import { addTenantWithTenancy, uploadDocument } from '../../services/tenants.js'
import { usePropertyData } from '../flats/usePropertyData.js'
import { useTenancyData } from './useTenancyData.js'
import FilePicker from './FilePicker.jsx'
import TenantFields from './TenantFields.jsx'
import { EMPTY_TENANT } from './tenant-form.js'

// One-time entry of a new tenant moving into a vacant flat.
export default function AddTenantPage() {
  const { code } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { buildings, flats, loading: propertyLoading } = usePropertyData()
  const { tenancies, loading: tenancyLoading } = useTenancyData()
  const today = todayInKolkata()

  const [tenant, setTenant] = useState(EMPTY_TENANT)
  const [tenancy, setTenancy] = useState({ moveIn: today, monthlyRent: '', trackFrom: '', agreementStart: '', agreementEnd: '', notes: '' })
  const [trackFromEdited, setTrackFromEdited] = useState(false)
  const [idFiles, setIdFiles] = useState([])
  const [agreementFiles, setAgreementFiles] = useState([])
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState(null) // progress text while saving
  const [saveError, setSaveError] = useState(null)

  const flat = flats?.find((f) => f.code === code)
  const building = buildings?.find((b) => b.code === flat?.buildingId)
  const flatTenancies = useMemo(() => (tenancies ?? []).filter((t) => t.flatId === code), [tenancies, code])
  const trackFrom = trackFromEdited ? tenancy.trackFrom : defaultTrackFrom(tenancy.moveIn, today)
  const preview = trackingPreview(tenancy.moveIn, trackFrom)
  const rentPreview = (() => {
    try {
      return tenancy.monthlyRent ? rupeesToPaise(tenancy.monthlyRent) : null
    } catch {
      return null
    }
  })()
  const dueDay = Number(tenancy.moveIn?.slice(8)) || null
  const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th'}`

  if (propertyLoading || tenancyLoading) return <p className="muted">Loading…</p>
  if (!flat) return <p className="error">Flat {code} not found.</p>
  if (flat.ownUse) return <p className="error">This flat is marked own use and cannot be rented.</p>

  const setTenantValue = (k, v) => setTenant((t) => ({ ...t, [k]: v }))
  const bindTenancy = (k) => ({ value: tenancy[k], onChange: (e) => setTenancy((t) => ({ ...t, [k]: e.target.value })) })

  async function handleSubmit(event) {
    event.preventDefault()
    setSaveError(null)
    const t = validateTenant(tenant)
    const ty = validateTenancy({ ...tenancy, trackFrom, flatId: flat.code }, flatTenancies)
    const fileProblems = {}
    if ([...idFiles, ...agreementFiles].some((f) => checkUpload(f))) fileProblems.files = 'Remove the files marked with a problem.'
    const all = { ...t.errors, ...ty.errors, ...fileProblems }
    setErrors(all)
    if (Object.keys(all).length) {
      setSaveError('Please fix the highlighted fields.')
      return
    }

    let ids
    try {
      setStatus('Saving tenant…')
      ids = await addTenantWithTenancy(user, t.value, ty.value, flat)
    } catch (e) {
      setStatus(null)
      setSaveError(e.code === 'permission-denied' ? 'The database refused this (permission denied).' : e.message)
      return
    }

    // Tenant is saved; now the files. A failed upload can be retried from the tenant page.
    const uploads = [
      ...idFiles.map((file, i) => ({ kind: 'id-proof', label: idFiles.length > 1 ? `ID proof ${i + 1}` : 'ID proof', file })),
      ...agreementFiles.map((file, i) => ({ kind: 'agreement', label: agreementFiles.length > 1 ? `Agreement ${i + 1}` : 'Agreement', file })),
    ]
    const failed = []
    for (const [i, u] of uploads.entries()) {
      setStatus(`Uploading file ${i + 1} of ${uploads.length}…`)
      try {
        await uploadDocument(user, { tenantId: ids.tenantId, tenancyId: ids.tenancyId, ...u })
      } catch {
        failed.push(u.file.name)
      }
    }
    navigate(`/tenants/${ids.tenantId}`, { state: failed.length ? { failedUploads: failed } : null })
  }

  return (
    <section className="page narrow">
      <p className="muted small">
        <Link to={`/flats/${flat.code}`}>← {flatReference(building, flat)}</Link>
      </p>
      <h1>Add tenant</h1>
      <p className="muted">
        One-time details for the new tenant of <strong>{flatReference(building, flat)}</strong> ({flat.code}). Fields marked * are
        required.
      </p>

      <form className="form" onSubmit={handleSubmit} noValidate>
        <TenantFields values={tenant} setValue={setTenantValue} errors={errors} />

        <fieldset className="fieldset">
          <legend>ID proof files</legend>
          <FilePicker
            label="Photo or PDF of the ID (front and back)"
            hint="JPG, PNG or PDF, up to 15 MB each. You can also add files later."
            files={idFiles}
            onChange={setIdFiles}
          />
        </fieldset>

        <fieldset className="fieldset">
          <legend>Tenancy</legend>
          <div className="form-row">
            <Field label="Move-in date" required error={errors.moveIn}>
              <input type="date" {...bindTenancy('moveIn')} />
            </Field>
            <Field label="Monthly rent (₹)" required error={errors.monthlyRent}>
              <input inputMode="decimal" placeholder="e.g. 12000" {...bindTenancy('monthlyRent')} />
            </Field>
          </div>
          <Field
            label="Track rent from"
            error={errors.trackFrom}
            hint="For a tenant who already lives here, start from the current rent period. Older dues can be added as an opening balance later."
          >
            <input
              type="date"
              value={trackFrom}
              onChange={(e) => {
                setTrackFromEdited(true)
                setTenancy((t) => ({ ...t, trackFrom: e.target.value }))
              }}
            />
          </Field>
          {preview && (
            <p className="notice small">
              Rent is due on the <strong>{dueDay && ordinal(dueDay)}</strong> of each month (move-in anniversary
              {dueDay > 28 && '; shorter months use their last day'}). First tracked period: <strong>{preview.start}</strong> to{' '}
              <strong>{preview.end}</strong>
              {rentPreview > 0 && <> · {formatINR(rentPreview)} per month</>}
              . No security deposit is recorded (version 1).
            </p>
          )}
          {errors.flatId && <p className="error small">{errors.flatId}</p>}
        </fieldset>

        <fieldset className="fieldset">
          <legend>Rental agreement</legend>
          <div className="form-row">
            <Field label="Agreement start" error={errors.agreementStart}>
              <input type="date" {...bindTenancy('agreementStart')} />
            </Field>
            <Field label="Agreement end" error={errors.agreementEnd}>
              <input type="date" {...bindTenancy('agreementEnd')} />
            </Field>
          </div>
          <FilePicker label="Agreement (photo or PDF)" files={agreementFiles} onChange={setAgreementFiles} />
          {errors.files && <p className="error small">{errors.files}</p>}
        </fieldset>

        <div className="form-actions">
          <button type="submit" className="button primary" disabled={Boolean(status)}>
            {status ?? 'Save tenant'}
          </button>
          <Link className="button" to={`/flats/${flat.code}`}>
            Cancel
          </Link>
        </div>
        {saveError && <p className="error">{saveError}</p>}
      </form>
    </section>
  )
}
