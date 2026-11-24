import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import TapToEdit from '../../components/TapToEdit.jsx'
import { useAuth } from '../auth/auth-context.js'
import { formatINR, todayInKolkata } from '../../lib/money/index.js'
import { collectionRow } from '../../lib/collections.js'
import { connectionTypeLabel, floorLabel, floorOrder, flatReference, occupancy, sortFlats } from '../../lib/property.js'
import { createBuilding, createFlat, updateBuilding, updateFlat } from '../../services/property.js'
import { useCollectionData } from '../collections/useCollectionData.js'
import { activeTenancy, useTenancyData } from '../tenants/useTenancyData.js'
import { usePropertyData } from './usePropertyData.js'
import { BuildingForm, FlatForm } from './forms.jsx'
import FlatTimeline from './FlatTimeline.jsx'

const STATUS = {
  vacant: { label: 'Vacant', className: 'pill warn' },
  occupied: { label: 'Occupied', className: 'pill' },
  'own-use': { label: 'Own use', className: 'pill muted-pill' },
}

/** "CA 123456", or the number alone when it already starts with "CA". */
function caLabel(ca) {
  return /^CA/i.test(ca) ? ca : `CA ${ca}`
}

function matches(query, ...values) {
  if (!query) return true
  return values.some((v) => String(v ?? '').toLowerCase().includes(query))
}

/** One flat box inside a floor of the building drawing. */
function FlatBox({ flat, status, tenantName, balance, selected, dim, onSelect }) {
  const due = (balance?.outstanding ?? 0) + (balance?.electricityOutstanding ?? 0)
  return (
    <button
      type="button"
      className={`flat-box ${status}${selected ? ' selected' : ''}${dim ? ' dim' : ''}`}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <span className="flat-box-position">{flat.position}</span>
      <span className="flat-box-name">{status === 'occupied' ? tenantName ?? 'Tenant' : STATUS[status].label}</span>
      {due > 0 && <span className="flat-box-due">{formatINR(due)} due</span>}
    </button>
  )
}

/** Details of the tapped flat, shown right under its building. */
function FlatPanel({ building, flat, connection, tenancies, tenants, balances, today, isAdmin, editing, setEditing, flats, connections, actor }) {
  const status = occupancy(flat, tenancies, today)

  if (editing?.type === 'flat' && editing.id === flat.code) {
    return (
      <div className="flat-panel">
        <FlatForm building={building} flat={flat} flats={flats} connections={connections} onSave={(v) => updateFlat(actor, flat, v)} onCancel={() => setEditing(null)} />
      </div>
    )
  }

  return (
    <div className="flat-panel">
      <div className="flat-panel-head">
        <div>
          {isAdmin ? (
            <TapToEdit as="h3" label="Edit flat" onEdit={() => setEditing({ type: 'flat', id: flat.code })}>
              {flatReference(building, flat)} <span className={STATUS[status].className}>{STATUS[status].label}</span>
            </TapToEdit>
          ) : (
            <h3>
              {flatReference(building, flat)} <span className={STATUS[status].className}>{STATUS[status].label}</span>
            </h3>
          )}
          <div className="muted small">
            {flat.code}
            {connection && ` · ${caLabel(connection.caNumber)} · ${connectionTypeLabel(connection.type)}${connection.submeter ? ' · sub-meter' : ''}`}
            {!connection && flat.connectionId && ` · ${caLabel(flat.connectionId)}`}
          </div>
        </div>
        <div className="inline-actions">
          <Link className="button small-button" to={`/flats/${flat.code}`}>
            Flat page
          </Link>
        </div>
      </div>

      <h4 className="timeline-title">Tenant timeline</h4>
      <FlatTimeline key={flat.code} flat={flat} tenancies={tenancies} tenants={tenants} balances={balances} today={today} />
    </div>
  )
}

/** The one place to add a flat: choose the building, then fill in the flat. */
function AddFlatAnywhere({ buildings, connections, actor, onDone }) {
  const [code, setCode] = useState('')
  const chosen = buildings.find((g) => g.building.code === code)
  return (
    <div className="card section">
      <label className="field">
        <span className="field-label">Building</span>
        <select value={code} onChange={(e) => setCode(e.target.value)}>
          <option value="">Choose a building…</option>
          {buildings.map(({ building }) => (
            <option key={building.code} value={building.code}>
              {building.name}
            </option>
          ))}
        </select>
      </label>
      {chosen ? (
        <FlatForm
          key={code}
          building={chosen.building}
          flats={chosen.flats}
          connections={connections}
          onSave={(v) => createFlat(actor, { ...v, buildingId: chosen.building.code })}
          onCancel={onDone}
        />
      ) : (
        <button type="button" className="button" onClick={onDone}>
          Cancel
        </button>
      )}
    </div>
  )
}

function BuildingCard(props) {
  const navigate = useNavigate()
  const { building, flats, connections, tenancies, tenants, tenantNames, balances, isAdmin, today, query, editing, setEditing, actor, selected, setSelected } = props
  const byCa = new Map(connections.map((c) => [c.caNumber, c]))
  const flatMatches = (f) =>
    matches(query, building.name, building.code, f.code, f.floor, f.position, f.friendlyName, f.connectionId, tenantNames.get(f.code))
  if (query && !flats.some(flatMatches) && !matches(query, building.name, building.code)) return null

  const floors = new Map()
  for (const f of flats) {
    if (!floors.has(f.floor)) floors.set(f.floor, [])
    floors.get(f.floor).push(f)
  }
  // Top floor at the top, like the real building.
  const floorList = [...floors.entries()].sort((a, b) => floorOrder(b[0]) - floorOrder(a[0]))
  const statuses = flats.map((f) => occupancy(f, tenancies, today))
  const counts = {
    total: flats.length,
    occupied: statuses.filter((s) => s === 'occupied').length,
    vacant: statuses.filter((s) => s === 'vacant').length,
    ownUse: statuses.filter((s) => s === 'own-use').length,
  }
  const selectedFlat = flats.find((f) => f.code === selected)

  return (
    <section className="card building-card" id={`b-${building.code}`}>
      <header className="building-header">
        <div>
          {isAdmin ? (
            <TapToEdit as="h2" label="Edit building" onEdit={() => setEditing({ type: 'building', id: building.code })}>
              {building.name} <span className="muted small">{building.code}</span>
              {building.ownUse && <span className="pill muted-pill">Own use</span>}
            </TapToEdit>
          ) : (
            <h2>
              {building.name} <span className="muted small">{building.code}</span>
              {building.ownUse && <span className="pill muted-pill">Own use</span>}
            </h2>
          )}
          <div className="muted small">
            {floorList.length} floor{floorList.length === 1 ? '' : 's'} · {counts.total} flat{counts.total === 1 ? '' : 's'}
            {counts.occupied > 0 && ` · ${counts.occupied} occupied`}
            {counts.vacant > 0 && ` · ${counts.vacant} vacant`}
            {counts.ownUse > 0 && ` · ${counts.ownUse} own use`}
            {building.address && ` · ${building.address}`}
          </div>
        </div>
      </header>

      {editing?.type === 'building' && editing.id === building.code && (
        <BuildingForm initial={building} onSave={(v) => updateBuilding(actor, building, v)} onCancel={() => setEditing(null)} />
      )}

      {floorList.length === 0 ? (
        <p className="muted small">No flats yet.</p>
      ) : (
        <div className="building-drawing">
          <div className="roof" aria-hidden="true" />
          {floorList.map(([floor, list]) => (
            <div key={floor} className="floor-row">
              <div className="floor-label">{floorLabel(floor)}</div>
              <div className="floor-flats">
                {list.map((f) => (
                  <FlatBox
                    key={f.code}
                    flat={f}
                    status={occupancy(f, tenancies, today)}
                    tenantName={tenantNames.get(f.code)}
                    balance={balances.get(activeTenancy(tenancies, f.code, today)?.id)}
                    selected={selected === f.code}
                    dim={Boolean(query) && !flatMatches(f)}
                    onSelect={() =>
                      occupancy(f, tenancies, today) === 'vacant' ? navigate(`/flats/${f.code}`) : setSelected(selected === f.code ? null : f.code)
                    }
                  />
                ))}
              </div>
            </div>
          ))}
          <div className="ground-line" aria-hidden="true" />
        </div>
      )}

      {selectedFlat && (
        <FlatPanel
          building={building}
          flat={selectedFlat}
          connection={byCa.get(selectedFlat.connectionId)}
          tenancies={tenancies}
          tenants={tenants}
          balances={balances}
          today={today}
          isAdmin={isAdmin}
          editing={editing}
          setEditing={setEditing}
          flats={flats}
          connections={connections}
          actor={actor}
        />
      )}
    </section>
  )
}

export default function FlatsPage() {
  const { user, isAdmin } = useAuth()
  const { buildings, flats, connections, error, loading: propertyLoading } = usePropertyData()
  const { tenants, tenancies, loading: tenancyLoading } = useTenancyData()
  const { charges, payments, loading: collectionLoading } = useCollectionData()
  const loading = propertyLoading || tenancyLoading || collectionLoading
  const [params] = useSearchParams()
  const focusBuilding = params.get('building')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(null) // { type: 'building'|'newBuilding'|'newFlat'|'flat', id }
  const [selected, setSelected] = useState(null) // flat code
  const today = todayInKolkata()

  const grouped = useMemo(() => {
    if (loading) return []
    const sorted = sortFlats(flats)
    return [...buildings]
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((b) => ({ building: b, flats: sorted.filter((f) => f.buildingId === b.code) }))
  }, [buildings, flats, loading])

  const tenantNames = useMemo(() => {
    const names = new Map()
    for (const t of tenancies ?? []) {
      if (t.moveOut && t.moveOut < today) continue
      const tenant = tenants?.find((x) => x.id === t.tenantId)
      if (tenant) names.set(t.flatId, tenant.name)
    }
    return names
  }, [tenants, tenancies, today])

  // Rent and electricity still owed, per tenancy.
  const balances = useMemo(() => {
    const map = new Map()
    if (loading) return map
    for (const t of tenancies) map.set(t.id, collectionRow(t, charges, payments, today))
    return map
  }, [tenancies, charges, payments, today, loading])

  useEffect(() => {
    if (!loading && focusBuilding) document.getElementById(`b-${focusBuilding}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [loading, focusBuilding])

  const q = query.trim().toLowerCase()
  const totals = loading
    ? null
    : {
        buildings: buildings.length,
        flats: flats.length,
        occupied: flats.filter((f) => occupancy(f, tenancies, today) === 'occupied').length,
        vacant: flats.filter((f) => occupancy(f, tenancies, today) === 'vacant').length,
        ownUse: flats.filter((f) => f.ownUse).length,
      }

  return (
    <section className="page">
      <div className="page-header">
        <h1>Buildings and flats</h1>
        {isAdmin && (
          <div className="inline-actions">
            <button type="button" className="button primary" onClick={() => setEditing({ type: 'newFlat' })}>
              + Add flat
            </button>
            <button type="button" className="button" onClick={() => setEditing({ type: 'newBuilding' })}>
              + Add building
            </button>
          </div>
        )}
      </div>

      {error && <p className="error">{error}</p>}
      {loading && !error && <p className="muted">Loading…</p>}

      {totals && (
        <p className="muted">
          {totals.buildings} buildings · {totals.flats} flats · {totals.occupied} occupied · {totals.vacant} vacant · {totals.ownUse} own use
        </p>
      )}

      {totals && (
        <div className="legend small" aria-label="Colours">
          <span className="legend-item occupied">Occupied</span>
          <span className="legend-item vacant">Vacant</span>
          <span className="legend-item own-use">Own use</span>
          <span className="muted">Tap a flat: occupied shows its tenant and timeline, vacant opens Add tenant.</span>
        </div>
      )}

      {editing?.type === 'newBuilding' && <BuildingForm onSave={(v) => createBuilding(user, v)} onCancel={() => setEditing(null)} />}
      {editing?.type === 'newFlat' && (
        <AddFlatAnywhere buildings={grouped} connections={connections} actor={user} onDone={() => setEditing(null)} />
      )}

      {!loading && buildings.length > 0 && (
        <input
          className="search"
          type="search"
          placeholder="Search building, flat, tenant, name or CA number"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search flats"
        />
      )}

      {!loading && buildings.length === 0 && (
        <div className="card section">
          <p>No buildings yet.</p>
          {isAdmin ? (
            <p className="muted">
              Import them from a spreadsheet in <Link to="/settings">Settings → Import buildings and flats</Link>, or use{' '}
              <strong>Add building</strong>.
            </p>
          ) : (
            <p className="muted">An admin needs to add the buildings first.</p>
          )}
        </div>
      )}

      {!loading &&
        grouped.map(({ building, flats: list }) => (
          <BuildingCard
            key={building.code}
            building={building}
            flats={list}
            connections={connections}
            tenancies={tenancies}
            tenants={tenants}
            tenantNames={tenantNames}
            balances={balances}
            isAdmin={isAdmin}
            today={today}
            query={q}
            editing={editing}
            setEditing={setEditing}
            actor={user}
            selected={selected}
            setSelected={setSelected}
          />
        ))}
    </section>
  )
}
