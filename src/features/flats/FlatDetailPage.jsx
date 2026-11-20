import { useState } from 'react'
import { Link, useParams } from 'react-router'
import Field from '../../components/Field.jsx'
import { useAuth } from '../auth/auth-context.js'
import { departurePreview, formatINR, todayInKolkata } from '../../lib/money/index.js'
import { flatReference, maskPhone, occupancy } from '../../lib/property.js'
import { agreementStatus } from '../../lib/tenants.js'
import { recordMoveOut } from '../../services/tenants.js'
import { activeTenancy, useTenancyData } from '../tenants/useTenancyData.js'
import { usePropertyData } from './usePropertyData.js'

function MoveOut({ tenancy, tenantName, actor, onDone }) {
  const [date, setDate] = useState(todayInKolkata())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  let preview = null
  let previewError = null
  try {
    // Charges are created in Phase 5; until then the preview shows the prorated final rent.
    preview = departurePreview({ id: tenancy.id, moveIn: tenancy.moveIn, monthlyRent: tenancy.monthlyRent }, date, [])
  } catch (e) {
    previewError = e.message
  }

  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      await recordMoveOut(actor, tenancy, date)
      onDone()
    } catch (e) {
      setError(e.code === 'permission-denied' ? 'The database refused this (permission denied).' : e.message)
      setBusy(false)
    }
  }

  return (
    <div className="panel-form form">
      <h3>Record move-out of {tenantName}</h3>
      <Field label="Leaving date (the last day they live here)">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      {previewError && <p className="error small">{previewError}</p>}
      {preview && (
        <div className="notice small">
          <strong>Last rent period:</strong> {preview.periodStart} to {preview.periodEnd} ({preview.periodDays} days)
          <br />
          Lived {preview.occupiedDays} of {preview.periodDays} days, leaving day included.
          <br />
          Rent for this last period: {formatINR(preview.monthlyRent)} × {preview.occupiedDays} ÷ {preview.periodDays} ={' '}
          <strong>{formatINR(preview.finalCharge)}</strong>
          <br />
          <span className="muted">The tenancy and its history stay in the app; the flat becomes vacant.</span>
        </div>
      )}
      <div className="form-actions">
        <button type="button" className="button primary" onClick={confirm} disabled={busy || !preview}>
          {busy ? 'Saving…' : 'Confirm move-out'}
        </button>
        <button type="button" className="button" onClick={onDone} disabled={busy}>
          Cancel
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  )
}

export default function FlatDetailPage() {
  const { code } = useParams()
  const { user } = useAuth()
  const { buildings, flats, connections, loading } = usePropertyData()
  const { tenants, tenancies, loading: tLoading, error } = useTenancyData()
  const [movingOut, setMovingOut] = useState(false)
  const today = todayInKolkata()

  if (error) return <p className="error">{error}</p>
  if (loading || tLoading) return <p className="muted">Loading…</p>
  const flat = flats.find((f) => f.code === code)
  if (!flat) return <p className="error">Flat {code} not found.</p>
  const building = buildings.find((b) => b.code === flat.buildingId)
  const connection = connections.find((c) => c.caNumber === flat.connectionId)
  const current = activeTenancy(tenancies, code, today)
  const currentTenant = current && tenants.find((t) => t.id === current.tenantId)
  const history = tenancies.filter((t) => t.flatId === code && t.moveOut && t.id !== current?.id).sort((a, b) => b.moveIn.localeCompare(a.moveIn))
  const status = occupancy(flat, tenancies, today)

  return (
    <section className="page narrow">
      <p className="muted small">
        <Link to="/flats">← Buildings and flats</Link>
      </p>
      <h1>{flatReference(building, flat)}</h1>
      <p className="muted">
        {flat.code}
        {connection &&
          ` · ${connection.caNumber} · ${connection.type === 'commercial' ? 'Commercial' : 'Domestic'}${connection.submeter ? ' · sub-meter' : ''}`}
        {connection?.holderName && ` · meter in the name of ${connection.holderName}`}
        {connection?.holderPhone && ` (${maskPhone(connection.holderPhone)})`}
      </p>

      <section className="card section">
        <h2>Current tenant</h2>
        {status === 'own-use' && <p className="muted">Own use: this flat is not rented.</p>}
        {status === 'vacant' && (
          <>
            <p>
              <span className="pill warn">Vacant</span>
            </p>
            <Link className="button primary" to={`/flats/${flat.code}/add-tenant`}>
              Add tenant
            </Link>
          </>
        )}
        {current && (
          <>
            <div className="page-header">
              <div>
                <strong>
                  <Link to={`/tenants/${current.tenantId}`}>{currentTenant?.name ?? 'Tenant'}</Link>
                </strong>
                <div className="muted small">
                  {formatINR(current.monthlyRent)} per month · moved in {current.moveIn}
                  {current.agreementEnd && ` · agreement until ${current.agreementEnd}`}
                  {agreementStatus(current.agreementEnd, today) === 'expiring' && ' (ends within 30 days)'}
                  {agreementStatus(current.agreementEnd, today) === 'expired' && ' (expired)'}
                </div>
                {current.moveOut && (
                  <p className="pill warn">Leaving on {current.moveOut} (move-out recorded)</p>
                )}
              </div>
              {!movingOut && !current.moveOut && (
                <button type="button" className="button small-button" onClick={() => setMovingOut(true)}>
                  Record move-out
                </button>
              )}
            </div>
            {movingOut && (
              <MoveOut tenancy={current} tenantName={currentTenant?.name ?? 'tenant'} actor={user} onDone={() => setMovingOut(false)} />
            )}
          </>
        )}
      </section>

      <section className="card section">
        <h2>Past tenants</h2>
        {history.length === 0 ? (
          <p className="muted">No past tenants recorded.</p>
        ) : (
          <ul className="member-list">
            {history.map((t) => (
              <li key={t.id}>
                <div>
                  <Link to={`/tenants/${t.tenantId}`}>{tenants.find((x) => x.id === t.tenantId)?.name ?? 'Tenant'}</Link>
                  <div className="muted small">
                    {t.moveIn} to {t.moveOut} · {formatINR(t.monthlyRent)} per month
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  )
}
