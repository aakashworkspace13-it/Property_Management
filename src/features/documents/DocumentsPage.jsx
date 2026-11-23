import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../auth/auth-context.js'
import { documentsNeedingSharing } from '../../lib/driveDocs.js'
import { getDriveToken, openDriveDocument, updateSharing } from '../../services/drive.js'
import { watchAllDocuments } from '../../services/tenants.js'
import { useMembers } from '../settings/useMembers.js'
import { useTenancyData } from '../tenants/useTenancyData.js'

// All ID proofs and agreements (stored in Google Drive), grouped by tenant.
export default function DocumentsPage() {
  const { user } = useAuth()
  const { tenants, loading } = useTenancyData()
  const { members } = useMembers()
  const [docs, setDocs] = useState(null)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => watchAllDocuments(setDocs, (e) => setError(e.message)), [])

  if (error && !docs) return <p className="error">{error}</p>
  if (loading || !docs || !members) return <p className="muted">Loading…</p>

  const pending = documentsNeedingSharing(docs, members, user.email)
  const q = query.trim().toLowerCase()
  const groups = tenants
    .map((t) => ({ tenant: t, files: docs.filter((d) => d.tenantId === t.id && !d.deleted) }))
    .filter((g) => g.files.length && (!q || g.tenant.name.toLowerCase().includes(q)))
    .sort((a, b) => a.tenant.name.localeCompare(b.tenant.name))

  async function share() {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const token = await getDriveToken() // first, so the Google pop-up opens from the click
      const n = await updateSharing(user, token, pending, members)
      setMessage(`Sharing updated for ${n} file${n === 1 ? '' : 's'}.`)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="page">
      <h1>Documents</h1>
      <p className="muted small">
        ID proofs and agreements are kept in the Google Drive of the person who uploaded them and shared view-only with the family.
        Add files from a tenant&apos;s page. Reminders are on the <Link to="/">Dashboard</Link>.
      </p>

      {pending.length > 0 && (
        <div className="notice">
          {pending.length} of your file{pending.length === 1 ? '' : 's'} need their sharing updated (family members changed).{' '}
          <button type="button" className="button small-button" onClick={share} disabled={busy}>
            {busy ? 'Updating…' : 'Update sharing'}
          </button>
        </div>
      )}
      {message && <p className="success">{message}</p>}
      {error && <p className="error">{error}</p>}

      <input type="search" className="search" placeholder="Search tenant" value={query} onChange={(e) => setQuery(e.target.value)} />
      {groups.length === 0 && <p className="muted">No documents yet.</p>}
      {groups.map(({ tenant, files }) => (
        <section key={tenant.id} className="card section">
          <h2>
            <Link to={`/tenants/${tenant.id}`}>{tenant.name}</Link>
          </h2>
          <ul className="member-list">
            {files
              .sort((a, b) => (b.uploadedAt?.seconds ?? 0) - (a.uploadedAt?.seconds ?? 0))
              .map((d) => (
                <li key={d.id}>
                  <div className="member-main">
                    <strong>{d.label}</strong>
                    <div className="muted small">
                      {d.fileName} · {d.contentType === 'application/pdf' ? 'PDF' : 'Photo'} · in {d.uploadedBy}&apos;s Google Drive
                    </div>
                  </div>
                  <button type="button" className="button small-button" onClick={() => openDriveDocument(d)}>
                    Open
                  </button>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </section>
  )
}
