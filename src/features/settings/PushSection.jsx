import { useEffect, useState } from 'react'
import { useAuth } from '../auth/auth-context.js'
import { disablePush, enablePush, pushStatus } from '../../services/push.js'

const TEXT = {
  'not-configured': 'Not available yet: the web-push key still needs to be added. The daily reminder email works already.',
  unsupported: 'This browser cannot show notifications. On iPhone, add the app to the Home Screen first.',
  blocked: 'Notifications are blocked for this site in the browser settings.',
  on: 'On for this device. A summary of reminders arrives every morning around 9 AM.',
  off: 'Off for this device.',
}

// Daily 9 AM reminder summary on this phone or computer (sent by the Google Apps Script in apps-script/).
export default function PushSection() {
  const { user } = useAuth()
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    pushStatus().then(setStatus)
  }, [])

  async function toggle() {
    setBusy(true)
    setError(null)
    try {
      if (status === 'on') await disablePush()
      else await enablePush(user)
      setStatus(await pushStatus())
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card section">
      <h2>Phone notifications</h2>
      <p className="muted">{status ? TEXT[status] : 'Checking…'}</p>
      {(status === 'on' || status === 'off') && (
        <button type="button" className="button" onClick={toggle} disabled={busy}>
          {status === 'on' ? 'Turn off on this device' : 'Turn on for this device'}
        </button>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  )
}
