// Audit log. Every data change adds one entry in the SAME batch as the change, so a change
// can never be saved without its audit entry. Firestore rules allow creating entries only.
//
// Entry: { actorUid, actorEmail, action, entity, entityId, changedFields, before, after, at }
// `before` / `after` hold only the changed fields. Keep personal data out of them where possible.

import { collection, doc, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase.js'

/** Fields whose values differ between `before` and `after` (shallow). */
export function diffFields(before = {}, after = {}) {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])
  return [...keys].filter((k) => JSON.stringify(before?.[k]) !== JSON.stringify(after?.[k])).sort()
}

function pick(obj, keys) {
  if (!obj) return null
  return Object.fromEntries(keys.filter((k) => k in obj).map((k) => [k, obj[k]]))
}

/**
 * Adds an audit entry to `batch`.
 * actor: the signed-in Firebase user. action: 'create' | 'update' | 'deactivate' | ...
 */
export function addAuditEntry(batch, actor, { action, entity, entityId, before = null, after = null }) {
  const changedFields = diffFields(before ?? {}, after ?? {})
  batch.set(doc(collection(db, 'auditLogs')), {
    actorUid: actor.uid,
    actorEmail: actor.email.toLowerCase(),
    action,
    entity,
    entityId,
    changedFields,
    before: pick(before, changedFields),
    after: pick(after, changedFields),
    at: serverTimestamp(),
  })
}
