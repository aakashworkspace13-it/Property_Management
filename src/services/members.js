// Family members (the allowlist) and the one-time owner setup.
//
// members/{email}: { email, name, role: 'admin' | 'family', active, addedBy, addedAt, updatedBy?, updatedAt? }
//   The document ID is the lower-case Google email, so an admin can add someone before they
//   ever sign in. Members are deactivated, never deleted.
// config/setup:    { ownerUid, createdAt }
//   Created exactly once, together with the first admin's member record.

import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore'
import { db } from './firebase.js'
import { addAuditEntry } from './audit.js'

export const ROLES = ['admin', 'family']

export function memberId(email) {
  return String(email ?? '').trim().toLowerCase()
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(memberId(email))
}

const setupRef = () => doc(db, 'config', 'setup')
const memberRef = (email) => doc(db, 'members', memberId(email))

/** Calls back with true/false whenever the owner setup exists or not. */
export function watchSetup(onChange, onError) {
  return onSnapshot(setupRef(), (snap) => onChange(snap.exists()), onError)
}

/** Calls back with the member record for `email`, or null. */
export function watchMember(email, onChange, onError) {
  return onSnapshot(memberRef(email), (snap) => onChange(snap.exists() ? snap.data() : null), onError)
}

/** Calls back with all members, sorted by name. */
export function watchMembers(onChange, onError) {
  return onSnapshot(
    query(collection(db, 'members'), orderBy('name')),
    (snap) => onChange(snap.docs.map((d) => d.data())),
    onError,
  )
}

/**
 * Makes the signed-in user the owner (first admin). Works only once per database:
 * the security rules reject it if setup already exists.
 */
export async function claimOwnership(user, name) {
  const email = memberId(user.email)
  const batch = writeBatch(db)
  batch.set(setupRef(), { ownerUid: user.uid, createdAt: serverTimestamp() })
  const member = { email, name: name.trim(), role: 'admin', active: true, addedBy: email, addedAt: serverTimestamp() }
  batch.set(memberRef(email), member)
  addAuditEntry(batch, user, {
    action: 'owner-setup',
    entity: 'member',
    entityId: email,
    after: { name: member.name, role: 'admin', active: true },
  })
  await batch.commit()
}

/** Admin only: adds a family member by Google email. */
export async function addMember(actor, { email, name, role }) {
  const id = memberId(email)
  if (!isValidEmail(id)) throw new Error('Enter a valid email address.')
  if (!name?.trim()) throw new Error('Enter a name.')
  if (!ROLES.includes(role)) throw new Error('Choose a role.')
  const existing = await getDoc(memberRef(id))
  if (existing.exists()) throw new Error('This person is already in the list.')
  const batch = writeBatch(db)
  const data = { email: id, name: name.trim(), role, active: true, addedBy: memberId(actor.email), addedAt: serverTimestamp() }
  batch.set(memberRef(id), data)
  addAuditEntry(batch, actor, { action: 'create', entity: 'member', entityId: id, after: { name: data.name, role, active: true } })
  await batch.commit()
}

/** Admin only: changes name, role or active. The rules stop admins demoting or deactivating themselves. */
export async function updateMember(actor, current, changes) {
  const next = { ...current, ...changes, updatedBy: memberId(actor.email), updatedAt: serverTimestamp() }
  const batch = writeBatch(db)
  batch.set(memberRef(current.email), next)
  const tracked = ['name', 'role', 'active']
  addAuditEntry(batch, actor, {
    action: changes.active === false ? 'deactivate' : changes.active === true ? 'reactivate' : 'update',
    entity: 'member',
    entityId: current.email,
    before: Object.fromEntries(tracked.map((k) => [k, current[k]])),
    after: Object.fromEntries(tracked.map((k) => [k, next[k]])),
  })
  await batch.commit()
}
