import { useState } from 'react'
import { Link } from 'react-router'
import { collection, doc, getDoc, getDocs } from 'firebase/firestore'
import { db } from '../../services/firebase.js'
import { useAuth } from '../auth/auth-context.js'
import { todayInKolkata } from '../../lib/money/index.js'

const COLLECTIONS = [
  'buildings', 'flats', 'connections', 'tenants', 'tenancies', 'charges', 'payments', 'bills', 'readings',
  'expenses', 'categories', 'reminders', 'documents', 'members', 'auditLogs',
]

// Admin tools: download a backup of every record (Excel) and open the change history.
export default function BackupSection() {
  const { isAdmin } = useAuth()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)
  if (!isAdmin) return null

  async function download() {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const entries = await Promise.all(
        COLLECTIONS.map(async (name) => [name, (await getDocs(collection(db, name))).docs.map((d) => ({ id: d.id, ...d.data() }))]),
      )
      // App settings is a single record (the rules allow reading it, not listing the collection).
      const settings = await getDoc(doc(db, 'settings', 'app'))
      entries.push(['settings', settings.exists() ? [{ id: 'app', ...settings.data() }] : []])
      const { downloadRecordsExcel } = await import('../../services/exportExcel.js')
      await downloadRecordsExcel(Object.fromEntries(entries), `property-manager-backup-${todayInKolkata()}.xlsx`)
      setMessage(`Backup downloaded (${entries.reduce((s, [, r]) => s + r.length, 0)} records). Keep the file somewhere safe and private.`)
    } catch (e) {
      setError(e.code === 'permission-denied' ? 'Only admins can download a backup.' : e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card section">
      <h2>Backup and history</h2>
      <div className="form-actions">
        <button type="button" className="button" onClick={download} disabled={busy}>
          {busy ? 'Preparing…' : 'Download backup'}
        </button>
        <Link className="button" to="/settings/history">
          Change history
        </Link>
      </div>
      {message && <p className="success">{message}</p>}
      {error && <p className="error">{error}</p>}
    </section>
  )
}
