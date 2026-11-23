// Google Drive storage for ID proofs and agreements (owner choice 2026-11-23).
//
// - Uses Google's narrowest Drive permission ("drive.file"): the app can only see files and
//   folders it created itself, never anything else in anyone's Drive.
// - Each file is stored in the uploader's own Drive under "Property Manager / <tenant>" and shared
//   view-only with every active family member. Firestore keeps only the link (documents/{id}).
// - A Drive access token comes from a Google sign-in pop-up and lasts about an hour. The pop-up
//   must start from a click, so callers ask for the token FIRST in their click handler.

import { GoogleAuthProvider, reauthenticateWithPopup } from 'firebase/auth'
import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { auth, db, usingEmulators } from './firebase.js'
import { addAuditEntry } from './audit.js'
import { checkUpload } from '../lib/tenants.js'
import { activeMemberEmails, DRIVE_ROOT_FOLDER, driveFileName, sharingChanges, tenantFolderName } from '../lib/driveDocs.js'

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink'
const FOLDER = 'application/vnd.google-apps.folder'

let cached = null // { email, token, expiresAt }

/** Gets a Google Drive token, asking with a Google pop-up when needed. Call it directly from a click. */
export async function getDriveToken() {
  if (usingEmulators) throw new Error('Google Drive works only with the real Firebase project, not the local test copy.')
  const user = auth.currentUser
  if (!user) throw new Error('Sign in first.')
  if (cached && cached.email === user.email && cached.expiresAt > Date.now()) return cached.token
  const provider = new GoogleAuthProvider()
  provider.addScope(DRIVE_SCOPE)
  provider.setCustomParameters({ login_hint: user.email })
  let result
  try {
    result = await reauthenticateWithPopup(user, provider)
  } catch (e) {
    if (e.code === 'auth/popup-blocked') throw new Error('The browser blocked the Google pop-up. Allow pop-ups for this site and try again.', { cause: e })
    if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') throw new Error('Google Drive was not connected (the pop-up was closed).', { cause: e })
    if (e.code === 'auth/user-mismatch') throw new Error(`Choose the same Google account you signed in with (${user.email}).`, { cause: e })
    throw e
  }
  const token = GoogleAuthProvider.credentialFromResult(result)?.accessToken
  if (!token) throw new Error('Google did not give access to Drive. Try again and allow "See, edit, create and delete only the specific Google Drive files you use with this app".')
  cached = { email: user.email, token, expiresAt: Date.now() + 50 * 60 * 1000 }
  return token
}

async function driveFetch(token, url, options = {}) {
  const res = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token}`, ...(options.headers ?? {}) } })
  if (res.ok) return res.status === 204 ? null : res.json()
  let detail = ''
  try {
    const body = await res.json()
    detail = body.error?.message ?? ''
    const reason = body.error?.errors?.[0]?.reason ?? body.error?.details?.[0]?.reason ?? ''
    if (/accessNotConfigured|SERVICE_DISABLED/i.test(reason + detail)) {
      throw new Error('The Google Drive API is not turned on for this Firebase project yet (one-time setup in Google Cloud console).')
    }
  } catch (e) {
    if (e.message.startsWith('The Google Drive API')) throw e
  }
  if (res.status === 401) cached = null
  throw new Error(`Google Drive error ${res.status}${detail ? `: ${detail}` : ''}`)
}

function quote(text) {
  return String(text).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

async function findOrCreateFolder(token, name, parentId = null) {
  const q = [`name = '${quote(name)}'`, `mimeType = '${FOLDER}'`, 'trashed = false', parentId ? `'${parentId}' in parents` : "'root' in parents"].join(' and ')
  const found = await driveFetch(token, `${API}/files?q=${encodeURIComponent(q)}&fields=files(id)&spaces=drive`)
  if (found.files?.length) return found.files[0].id
  const created = await driveFetch(token, `${API}/files?fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER, ...(parentId ? { parents: [parentId] } : {}) }),
  })
  return created.id
}

async function uploadFile(token, file, name, parentId) {
  const boundary = `pm${Math.random().toString(36).slice(2)}`
  const metadata = JSON.stringify({ name, parents: [parentId], mimeType: file.type })
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
    `--${boundary}\r\nContent-Type: ${file.type}\r\n\r\n`,
    file,
    `\r\n--${boundary}--`,
  ])
  return driveFetch(token, UPLOAD, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body })
}

/** Shares a file view-only with each email; returns the emails that succeeded. */
async function shareWith(token, fileId, emails) {
  const done = []
  for (const email of emails) {
    try {
      await driveFetch(token, `${API}/files/${fileId}/permissions?sendNotificationEmail=false&fields=id`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'reader', type: 'user', emailAddress: email }),
      })
      done.push(email)
    } catch {
      // e.g. not a Google account; tried again on the next "Update sharing".
    }
  }
  return done
}

async function unshareWith(token, fileId, emails) {
  if (!emails.length) return []
  const list = await driveFetch(token, `${API}/files/${fileId}/permissions?fields=permissions(id,emailAddress,role)`)
  const removed = []
  for (const email of emails) {
    const p = list.permissions?.find((x) => x.emailAddress?.toLowerCase() === email && x.role !== 'owner')
    if (p) await driveFetch(token, `${API}/files/${fileId}/permissions/${p.id}`, { method: 'DELETE' })
    removed.push(email)
  }
  return removed
}

/**
 * Uploads one ID proof / agreement to the uploader's Drive and records it.
 * token: from getDriveToken() (asked for at the start of the click).
 * members: all family members (for sharing). kind: 'id-proof' | 'agreement'.
 */
export async function uploadToDrive(actor, token, { tenant, tenancyId = null, kind, label, file, members }) {
  const problem = checkUpload(file)
  if (problem) throw new Error(problem)
  const root = await findOrCreateFolder(token, DRIVE_ROOT_FOLDER)
  const folder = await findOrCreateFolder(token, tenantFolderName(tenant), root)
  const uploaded = await uploadFile(token, file, driveFileName(label, file.name), folder)
  const me = actor.email.toLowerCase()
  const sharedWith = await shareWith(token, uploaded.id, activeMemberEmails(members).filter((e) => e !== me))

  const ref = doc(collection(db, 'documents'))
  const data = {
    tenantId: tenant.id,
    ...(tenancyId ? { tenancyId } : {}),
    kind,
    label: label.slice(0, 60),
    fileName: file.name.slice(0, 200),
    contentType: file.type,
    size: file.size,
    driveFileId: uploaded.id,
    driveLink: uploaded.webViewLink,
    sharedWith,
    uploadedBy: me,
    uploadedAt: serverTimestamp(),
  }
  const batch = writeBatch(db)
  batch.set(ref, data)
  addAuditEntry(batch, actor, {
    action: 'upload',
    entity: 'document',
    entityId: ref.id,
    after: { tenantId: tenant.id, kind, label: data.label, fileName: data.fileName, storedIn: 'Google Drive' },
  })
  await batch.commit()
  return ref.id
}

/**
 * Brings the sharing of the given documents (uploaded by `actor`) in line with the active family
 * members: adds new members, removes members whose access was turned off.
 */
export async function updateSharing(actor, token, documents, members) {
  const emails = activeMemberEmails(members)
  let changed = 0
  for (const d of documents) {
    const { add, remove } = sharingChanges(d, emails)
    if (!add.length && !remove.length) continue
    const added = await shareWith(token, d.driveFileId, add)
    const removed = await unshareWith(token, d.driveFileId, remove)
    const next = [...new Set([...(d.sharedWith ?? []).filter((e) => !removed.includes(e)), ...added])].sort()
    const batch = writeBatch(db)
    batch.update(doc(db, 'documents', d.id), { sharedWith: next, updatedBy: actor.email.toLowerCase(), updatedAt: serverTimestamp() })
    addAuditEntry(batch, actor, { action: 'sharing', entity: 'document', entityId: d.id, before: { sharedWith: d.sharedWith ?? [] }, after: { sharedWith: next } })
    await batch.commit()
    changed++
  }
  return changed
}

/** Opens a document in the Google Drive viewer (the person must be signed in to Google). */
export function openDriveDocument(document) {
  window.open(document.driveLink, '_blank', 'noopener')
}
