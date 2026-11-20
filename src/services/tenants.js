// Firestore/Storage access for tenants, tenancies and their documents.
// Every write adds an audit entry in the same transaction/batch. Rules: firestore.rules, storage.rules.
//
// tenants/{id}        one-time details of a person (see validateTenant in src/lib/tenants.js)
// tenancies/{id}      { tenantId, flatId, buildingId, moveIn, moveOut, monthlyRent (paise), trackFrom,
//                       agreementStart, agreementEnd, notes, … }
// occupancy/{flatId}  { tenancyId, since }: exists only while the flat has an active tenancy
// documents/{id}      metadata of a file stored at tenants/{tenantId}/{id} in Firebase Storage
//
// Privacy: phone numbers and ID numbers never go into the audit log (only that they changed).

import {
  collection,
  doc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore'
import { getBlob, ref, uploadBytes } from 'firebase/storage'
import { db, storage } from './firebase.js'
import { addAuditEntry } from './audit.js'
import { checkUpload } from '../lib/tenants.js'

const SENSITIVE = ['mobile', 'altMobile', 'emergencyMobile', 'idNumber']

function withIds(snap) {
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

function withoutId(record) {
  const copy = { ...record }
  delete copy.id
  return copy
}

/** Copy for the audit log: sensitive values replaced by a marker. */
function redact(record) {
  const copy = { ...record }
  for (const k of SENSITIVE) if (k in copy) copy[k] = copy[k] ? '(hidden)' : ''
  return copy
}

const email = (actor) => actor.email.toLowerCase()

export function watchTenants(onChange, onError) {
  return onSnapshot(collection(db, 'tenants'), (snap) => onChange(withIds(snap)), onError)
}

export function watchTenancies(onChange, onError) {
  return onSnapshot(collection(db, 'tenancies'), (snap) => onChange(withIds(snap)), onError)
}

export function watchDocuments(tenantId, onChange, onError) {
  return onSnapshot(query(collection(db, 'documents'), where('tenantId', '==', tenantId)), (snap) => onChange(withIds(snap)), onError)
}

const TENANT_AUDIT = ['name', 'members', 'twoWheelers', 'fourWheelers', 'idType', 'idNumber', 'mobile', 'altMobile',
  'emergencyName', 'emergencyRelation', 'emergencyMobile', 'notes']
const TENANCY_AUDIT = ['flatId', 'moveIn', 'moveOut', 'monthlyRent', 'trackFrom', 'agreementStart', 'agreementEnd', 'notes']

function pick(record, keys) {
  return Object.fromEntries(keys.filter((k) => k in record).map((k) => [k, record[k]]))
}

/**
 * Moves a new tenant into a vacant flat: creates the tenant, the tenancy and the flat's
 * occupancy lock together. Fails if the flat is already occupied.
 * tenant: validated tenant values; tenancy: validated tenancy values; flat: the flat record.
 * Returns { tenantId, tenancyId }.
 */
export async function addTenantWithTenancy(actor, tenant, tenancy, flat) {
  const tenantRef = doc(collection(db, 'tenants'))
  const tenancyRef = doc(collection(db, 'tenancies'))
  const lockRef = doc(db, 'occupancy', flat.code)
  const stamp = { createdBy: email(actor), createdAt: serverTimestamp() }

  await runTransaction(db, async (tx) => {
    if ((await tx.get(lockRef)).exists()) {
      throw new Error('This flat already has a tenant. Record their move-out first.')
    }
    const tenantData = { ...tenant, ...stamp }
    const tenancyData = {
      tenantId: tenantRef.id,
      flatId: flat.code,
      buildingId: flat.buildingId,
      moveIn: tenancy.moveIn,
      moveOut: null,
      monthlyRent: tenancy.monthlyRent,
      trackFrom: tenancy.trackFrom,
      agreementStart: tenancy.agreementStart,
      agreementEnd: tenancy.agreementEnd,
      notes: tenancy.notes,
      ...stamp,
    }
    tx.set(tenantRef, tenantData)
    tx.set(tenancyRef, tenancyData)
    tx.set(lockRef, { tenancyId: tenancyRef.id, since: tenancy.moveIn })
    addAuditEntry(tx, actor, { action: 'create', entity: 'tenant', entityId: tenantRef.id, after: redact(pick(tenantData, TENANT_AUDIT)) })
    addAuditEntry(tx, actor, { action: 'move-in', entity: 'tenancy', entityId: tenancyRef.id, after: pick(tenancyData, TENANCY_AUDIT) })
  })
  return { tenantId: tenantRef.id, tenancyId: tenancyRef.id }
}

/** Updates a tenant's one-time details (validated values). */
export async function updateTenant(actor, current, values) {
  const next = { ...withoutId(current), ...values, updatedBy: email(actor), updatedAt: serverTimestamp() }
  const batch = writeBatch(db)
  batch.set(doc(db, 'tenants', current.id), next)
  addAuditEntry(batch, actor, {
    action: 'update',
    entity: 'tenant',
    entityId: current.id,
    before: redact(pick(current, TENANT_AUDIT)),
    after: redact(pick(next, TENANT_AUDIT)),
  })
  await batch.commit()
}

/** Updates agreement dates and notes of a tenancy (rent, flat and move-in never change). */
export async function updateTenancyDetails(actor, current, { agreementStart, agreementEnd, notes }) {
  const next = {
    ...withoutId(current),
    agreementStart: agreementStart ?? current.agreementStart ?? '',
    agreementEnd: agreementEnd ?? current.agreementEnd ?? '',
    notes: (notes ?? current.notes ?? '').trim(),
    updatedBy: email(actor),
    updatedAt: serverTimestamp(),
  }
  const batch = writeBatch(db)
  batch.set(doc(db, 'tenancies', current.id), next)
  addAuditEntry(batch, actor, {
    action: 'update',
    entity: 'tenancy',
    entityId: current.id,
    before: pick(current, TENANCY_AUDIT),
    after: pick(next, TENANCY_AUDIT),
  })
  await batch.commit()
}

/** Records a move-out (leaving day included) and frees the flat for the next tenant. */
export async function recordMoveOut(actor, tenancy, leaveDate) {
  const tenancyRef = doc(db, 'tenancies', tenancy.id)
  const lockRef = doc(db, 'occupancy', tenancy.flatId)
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(tenancyRef)
    if (!snap.exists()) throw new Error('Tenancy not found.')
    if (snap.data().moveOut) throw new Error('Move-out is already recorded for this tenancy.')
    if (leaveDate < snap.data().moveIn) throw new Error('The leaving date cannot be before the move-in date.')
    tx.update(tenancyRef, { moveOut: leaveDate, updatedBy: email(actor), updatedAt: serverTimestamp() })
    tx.delete(lockRef)
    addAuditEntry(tx, actor, {
      action: 'move-out',
      entity: 'tenancy',
      entityId: tenancy.id,
      before: { moveOut: null },
      after: { moveOut: leaveDate },
    })
  })
}

/**
 * Uploads an ID proof or agreement file and records it.
 * kind: 'id-proof' | 'agreement'; label: e.g. 'Front', 'Back', 'Agreement'.
 */
export async function uploadDocument(actor, { tenantId, tenancyId = null, kind, label = '', file }) {
  const problem = checkUpload(file)
  if (problem) throw new Error(problem)
  const recordRef = doc(collection(db, 'documents'))
  const storagePath = `tenants/${tenantId}/${recordRef.id}`
  await uploadBytes(ref(storage, storagePath), file, { contentType: file.type })
  const data = {
    tenantId,
    ...(tenancyId ? { tenancyId } : {}),
    kind,
    label: label.slice(0, 60),
    fileName: file.name.slice(0, 200),
    contentType: file.type,
    size: file.size,
    storagePath,
    uploadedBy: email(actor),
    uploadedAt: serverTimestamp(),
  }
  const batch = writeBatch(db)
  batch.set(recordRef, data)
  addAuditEntry(batch, actor, {
    action: 'upload',
    entity: 'document',
    entityId: recordRef.id,
    after: { tenantId, kind, label: data.label, fileName: data.fileName },
  })
  await batch.commit()
  return recordRef.id
}

/**
 * Opens a stored file in a new tab using the signed-in user's access (no public link is made).
 * The tab is opened first (synchronously) so phone browsers do not block it as a pop-up.
 */
export async function openDocument(record) {
  const tab = window.open('', '_blank')
  try {
    const blob = await getBlob(ref(storage, record.storagePath))
    const url = URL.createObjectURL(new Blob([blob], { type: record.contentType }))
    if (tab) tab.location.href = url
    else window.location.href = url
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch (e) {
    tab?.close()
    throw e
  }
}
