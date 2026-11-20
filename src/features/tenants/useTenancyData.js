import { useEffect, useState } from 'react'
import { watchTenancies, watchTenants } from '../../services/tenants.js'

/** Live tenants and tenancies. Each is null until first loaded. */
export function useTenancyData() {
  const [tenants, setTenants] = useState(null)
  const [tenancies, setTenancies] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    const onError = (e) => setError(e.code === 'permission-denied' ? 'You do not have access to tenant data.' : e.message)
    const stops = [watchTenants(setTenants, onError), watchTenancies(setTenancies, onError)]
    return () => stops.forEach((stop) => stop())
  }, [])

  return { tenants, tenancies, error, loading: !tenants || !tenancies }
}

/**
 * The tenancy living in a flat on `today`: no move-out yet, or a move-out date still ahead
 * (the tenant lives there up to and including the leaving day).
 */
export function activeTenancy(tenancies, flatCode, today) {
  return tenancies?.find((t) => t.flatId === flatCode && (!t.moveOut || t.moveOut >= today)) ?? null
}
