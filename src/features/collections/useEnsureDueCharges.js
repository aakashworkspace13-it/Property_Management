import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/auth-context.js'
import { ensureDueCharges } from '../../services/collections.js'

/**
 * Creates rent charges for periods that have started, whenever the data is loaded or changes.
 * Idempotent and safe on several devices (fixed IDs). Returns an error message, if any.
 */
export function useEnsureDueCharges(tenancies, charges, today, ready) {
  const { user } = useAuth()
  const running = useRef(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!ready || running.current) return
    running.current = true
    ensureDueCharges(user, tenancies, charges, today)
      .catch((e) => setError(`Could not create rent charges: ${e.message}`))
      .finally(() => {
        running.current = false
      })
  }, [ready, tenancies, charges, user, today])

  return error
}
