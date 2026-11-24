import { Link } from 'react-router'
import { floorLabel, floorOrder, occupancy } from '../../lib/property.js'

/**
 * Occupancy at a glance, like a hotel room board: each building's floors (top floor first) with
 * one small square per flat — green occupied, orange vacant, grey own use.
 */
export default function RoomsGrid({ buildings, flats, tenancies, today }) {
  return (
    <div className="rooms-grid">
      {buildings.map((b) => {
        const own = flats.filter((f) => f.buildingId === b.code)
        const floors = new Map()
        for (const f of own) {
          if (!floors.has(f.floor)) floors.set(f.floor, [])
          floors.get(f.floor).push(f)
        }
        const floorList = [...floors.entries()].sort((x, y) => floorOrder(y[0]) - floorOrder(x[0]))
        const st = own.map((f) => occupancy(f, tenancies, today))
        const occupied = st.filter((x) => x === 'occupied').length
        const vacant = st.filter((x) => x === 'vacant').length
        return (
          <Link key={b.code} to={`/flats?building=${b.code}`} className="card room-board stat-link">
            <div className="room-board-head">
              <strong>{b.name}</strong>
              <span className="small">
                <span className="ok-text">{occupied}</span> / <span className="warn-text">{vacant}</span>
              </span>
            </div>
            {floorList.length === 0 && <span className="muted small">No flats</span>}
            {floorList.map(([floor, list]) => (
              <div key={floor} className="room-floor">
                <span className="room-floor-label">{floorLabel(floor)}</span>
                <span className="room-cells">
                  {list.map((f) => {
                    const s = occupancy(f, tenancies, today)
                    return (
                      <span key={f.code} className={`room ${s}`} title={`${f.code}: ${s === 'own-use' ? 'own use' : s}`}>
                        {f.position}
                      </span>
                    )
                  })}
                </span>
              </div>
            ))}
          </Link>
        )
      })}
    </div>
  )
}
