import { useEffect, useState } from 'react'
import { watchBills, watchReadings, watchSettings } from '../../services/electricity.js'

/** Live electricity rate setting, bills and readings. Each is null until first loaded. */
export function useElectricityData() {
  const [settings, setSettings] = useState(null)
  const [bills, setBills] = useState(null)
  const [readings, setReadings] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    const onError = (e) => setError(e.code === 'permission-denied' ? 'You do not have access to electricity records.' : e.message)
    const stops = [watchSettings(setSettings, onError), watchBills(setBills, onError), watchReadings(setReadings, onError)]
    return () => stops.forEach((stop) => stop())
  }, [])

  return { settings, bills, readings, error, loading: !settings || !bills || !readings }
}
