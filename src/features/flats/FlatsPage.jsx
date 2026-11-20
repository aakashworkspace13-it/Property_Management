import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../auth/auth-context.js'
import { todayInKolkata } from '../../lib/money/index.js'
import { floorOrder, occupancy, sortFlats } from '../../lib/property.js'
import { createBuilding, createFlat, updateBuilding, updateFlat } from '../../services/property.js'
import { usePropertyData } from './usePropertyData.js'
import { BuildingForm, FlatForm } from './forms.jsx'

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

function FlatRow({ flat, connection, status, isAdmin, onEdit }) {
  const s = STATUS[status]
  return (
    <li className="flat-row">
      <div className="flat-main">
        <div>
          <strong>{flat.position}</strong>
          {flat.friendlyName && <span className="muted"> — {flat.friendlyName}</span>}
          <span className={s.className}>{s.label}</span>
        </div>
        <div className="muted small">
          {flat.code}
          {connection && (
            <>
              {' · '}{caLabel(connection.caNumber)} · {connection.type === 'commercial' ? 'Commercial' : 'Domestic'}
              {connection.submeter && ' · sub-meter'}
            </>
          )}
          {!connection && flat.connectionId && ` · ${caLabel(flat.connectionId)}`}
        </div>
      </div>
      {isAdmin && (
        <button type="button" className="button small-button" onClick={onEdit}>
          Edit
        </button>
      )}
    </li>
  )
}

function BuildingCard({ building, flats, connections, isAdmin, today, query, editing, setEditing, actor }) {
  const byCa = new Map(connections.map((c) => [c.caNumber, c]))
  const visible = flats.filter((f) =>
    matches(query, building.name, building.code, f.code, f.floor, f.position, f.friendlyName, f.connectionId),
  )
  if (query && visible.length === 0 && !matches(query, building.name, building.code)) return null

  const floors = new Map()
  for (const f of visible) {
    if (!floors.has(f.floor)) floors.set(f.floor, [])
    floors.get(f.floor).push(f)
  }
  const floorList = [...floors.entries()].sort((a, b) => floorOrder(a[0]) - floorOrder(b[0]))
  const statuses = flats.map((f) => occupancy(f, [], today))
  const counts = {
    total: flats.length,
    vacant: statuses.filter((s) => s === 'vacant').length,
    ownUse: statuses.filter((s) => s === 'own-use').length,
  }

  return (
    <section className="card building-card">
      <header className="building-header">
        <div>
          <h2>
            {building.name} <span className="muted small">{building.code}</span>
            {building.ownUse && <span className="pill muted-pill">Own use</span>}
          </h2>
          <div className="muted small">
            {counts.total} flat{counts.total === 1 ? '' : 's'}
            {counts.vacant > 0 && ` · ${counts.vacant} vacant`}
            {counts.ownUse > 0 && ` · ${counts.ownUse} own use`}
            {building.address && ` · ${building.address}`}
          </div>
        </div>
        {isAdmin && (
          <div className="member-actions">
            <button type="button" className="button small-button" onClick={() => setEditing({ type: 'building', id: building.code })}>
              Edit
            </button>
            <button type="button" className="button small-button" onClick={() => setEditing({ type: 'newFlat', id: building.code })}>
              Add flat
            </button>
          </div>
        )}
      </header>

      {editing?.type === 'building' && editing.id === building.code && (
        <BuildingForm initial={building} onSave={(v) => updateBuilding(actor, building, v)} onCancel={() => setEditing(null)} />
      )}
      {editing?.type === 'newFlat' && editing.id === building.code && (
        <FlatForm
          building={building}
          flats={flats}
          connections={connections}
          onSave={(v) => createFlat(actor, { ...v, buildingId: building.code })}
          onCancel={() => setEditing(null)}
        />
      )}

      {floorList.length === 0 && <p className="muted small">No flats yet.</p>}
      {floorList.map(([floor, list]) => (
        <div key={floor} className="floor-group">
          <h3 className="floor-title">{floor} floor</h3>
          <ul className="flat-list">
            {list.map((f) =>
              editing?.type === 'flat' && editing.id === f.code ? (
                <li key={f.code}>
                  <FlatForm
                    building={building}
                    flat={f}
                    flats={flats}
                    connections={connections}
                    onSave={(v) => updateFlat(actor, f, v)}
                    onCancel={() => setEditing(null)}
                  />
                </li>
              ) : (
                <FlatRow
                  key={f.code}
                  flat={f}
                  connection={byCa.get(f.connectionId)}
                  status={occupancy(f, [], today)}
                  isAdmin={isAdmin}
                  onEdit={() => setEditing({ type: 'flat', id: f.code })}
                />
              ),
            )}
          </ul>
        </div>
      ))}
    </section>
  )
}

export default function FlatsPage() {
  const { user, isAdmin } = useAuth()
  const { buildings, flats, connections, error, loading } = usePropertyData()
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(null) // { type: 'building'|'newBuilding'|'newFlat'|'flat', id }
  const today = todayInKolkata()

  const grouped = useMemo(() => {
    if (loading) return []
    const sorted = sortFlats(flats)
    return [...buildings]
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((b) => ({ building: b, flats: sorted.filter((f) => f.buildingId === b.code) }))
  }, [buildings, flats, loading])

  const q = query.trim().toLowerCase()
  const totals = loading
    ? null
    : {
        buildings: buildings.length,
        flats: flats.length,
        vacant: flats.filter((f) => occupancy(f, [], today) === 'vacant').length,
        ownUse: flats.filter((f) => f.ownUse).length,
      }

  return (
    <section className="page">
      <div className="page-header">
        <h1>Buildings and flats</h1>
        {isAdmin && (
          <button type="button" className="button primary" onClick={() => setEditing({ type: 'newBuilding' })}>
            Add building
          </button>
        )}
      </div>

      {error && <p className="error">{error}</p>}
      {loading && !error && <p className="muted">Loading…</p>}

      {totals && (
        <p className="muted">
          {totals.buildings} buildings · {totals.flats} flats · {totals.vacant} vacant · {totals.ownUse} own use
        </p>
      )}

      {editing?.type === 'newBuilding' && (
        <BuildingForm onSave={(v) => createBuilding(user, v)} onCancel={() => setEditing(null)} />
      )}

      {!loading && buildings.length > 0 && (
        <input
          className="search"
          type="search"
          placeholder="Search building, flat, floor, name or CA number"
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

      {grouped.map(({ building, flats: list }) => (
        <BuildingCard
          key={building.code}
          building={building}
          flats={list}
          connections={connections}
          isAdmin={isAdmin}
          today={today}
          query={q}
          editing={editing}
          setEditing={setEditing}
          actor={user}
        />
      ))}

      {!loading && (
        <p className="muted small">
          Occupancy comes from tenancy dates. Tenants are added in Phase 4, so every rentable flat shows as vacant for now.
        </p>
      )}
    </section>
  )
}
