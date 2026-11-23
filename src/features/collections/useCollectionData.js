import { useEffect, useState } from 'react'
import { watchCharges, watchPayments } from '../../services/collections.js'

/** Live charges and payments (all tenancies). Each is null until first loaded. */
export function useCollectionData() {
  const [charges, setCharges] = useState(null)
  const [payments, setPayments] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    const onError = (e) => setError(e.code === 'permission-denied' ? 'You do not have access to rent records.' : e.message)
    const stops = [watchCharges(setCharges, onError), watchPayments(setPayments, onError)]
    return () => stops.forEach((stop) => stop())
  }, [])

  return { charges, payments, error, loading: !charges || !payments }
}
