import { useEffect, useState } from 'react'
import { watchBuildings, watchConnections, watchFlats } from '../../services/property.js'

/** Live buildings, flats and connections. Each is null until first loaded. */
export function usePropertyData() {
  const [buildings, setBuildings] = useState(null)
  const [flats, setFlats] = useState(null)
  const [connections, setConnections] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    const onError = (e) => setError(e.code === 'permission-denied' ? 'You do not have access to this data.' : e.message)
    const stops = [
      watchBuildings(setBuildings, onError),
      watchFlats(setFlats, onError),
      watchConnections(setConnections, onError),
    ]
    return () => stops.forEach((stop) => stop())
  }, [])

  return { buildings, flats, connections, error, loading: !buildings || !flats || !connections }
}
