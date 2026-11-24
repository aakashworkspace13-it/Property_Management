import { useEffect, useState } from 'react'
import { watchTenantPhoto } from '../../services/photos.js'

/** The tenant's passport photo (data URL), null when there is none, undefined while loading. */
export function useTenantPhoto(tenantId) {
  const [state, setState] = useState({ id: null, photo: undefined })
  useEffect(() => {
    if (!tenantId) return undefined
    return watchTenantPhoto(
      tenantId,
      (photo) => setState({ id: tenantId, photo }),
      () => setState({ id: tenantId, photo: null }),
    )
  }, [tenantId])
  return state.id === tenantId ? state.photo : undefined
}
