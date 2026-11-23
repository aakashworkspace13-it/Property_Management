// Firestore access for tenants, tenancies and their documents.
// Every write adds an audit entry in the same transaction/batch. Rules: firestore.rules. Files live in Google Drive (services/drive.js).
//
// tenants/{id}        one-time details of a person (see validateTenant in src/lib/tenants.js)
// tenancies/{id}      { tenantId, flatId, buildingId, moveIn, moveOut, monthlyRent (paise), trackFrom,
//                       agreementStart, agreementEnd, notes, … }
// occupancy/{flatId}  { tenancyId, since }: exists only while the flat has an active tenancy
// documents/{id}      link to a file in Google Drive (see services/drive.js)
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
import { db } from './firebase.js'
import { addAuditEntry } from './audit.js'
import { departureCharges, departurePreview } from '../lib/money/index.js'

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

/**
 * Renews the agreement: the current dates move into agreementHistory and the new dates become
 * current. `renewal` comes from validateRenewal().
 */
export async function renewAgreement(actor, tenancy, renewal) {
  const batch = writeBatch(db)
  batch.update(doc(db, 'tenancies', tenancy.id), {
    agreementStart: renewal.agreementStart,
    agreementEnd: renewal.agreementEnd,
    agreementHistory: renewal.agreementHistory,
    updatedBy: email(actor),
    updatedAt: serverTimestamp(),
  })
  addAuditEntry(batch, actor, {
    action: 'renew-agreement',
    entity: 'tenancy',
    entityId: tenancy.id,
    before: { agreementStart: tenancy.agreementStart ?? '', agreementEnd: tenancy.agreementEnd ?? '' },
    after: { agreementStart: renewal.agreementStart, agreementEnd: renewal.agreementEnd },
  })
  await batch.commit()
}

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

/**
 * Records a move-out (leaving day included) and frees the flat for the next tenant.
 * If rent for the leaving period was already charged, an explicit proration adjustment is added
 * (the original charge is never edited), and any later periods are reversed.
 * `charges` = the tenancy's charges. Returns the departure preview that was applied.
 */
export async function recordMoveOut(actor, tenancy, leaveDate, charges = []) {
  const tenancyRef = doc(db, 'tenancies', tenancy.id)
  const lockRef = doc(db, 'occupancy', tenancy.flatId)
  const rentCharges = charges.filter((c) => c.tenancyId === tenancy.id && c.account === 'rent')
  const preview = departurePreview(
    { id: tenancy.id, moveIn: tenancy.moveIn, monthlyRent: tenancy.monthlyRent },
    leaveDate,
    rentCharges,
  )
  const adjustments = departureCharges({ id: tenancy.id }, preview)
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(tenancyRef)
    if (!snap.exists()) throw new Error('Tenancy not found.')
    if (snap.data().moveOut) throw new Error('Move-out is already recorded for this tenancy.')
    if (leaveDate < snap.data().moveIn) throw new Error('The leaving date cannot be before the move-in date.')
    tx.update(tenancyRef, { moveOut: leaveDate, updatedBy: email(actor), updatedAt: serverTimestamp() })
    tx.delete(lockRef)
    for (const c of adjustments) {
      const data = { ...c, flatId: tenancy.flatId, buildingId: tenancy.buildingId, createdBy: email(actor), createdAt: serverTimestamp() }
      delete data.id
      for (const k of Object.keys(data)) if (data[k] === undefined || data[k] === null) delete data[k]
      tx.set(doc(db, 'charges', c.id), data)
      addAuditEntry(tx, actor, {
        action: c.corrects ? 'departure-adjustment' : 'reverse-period',
        entity: 'charge',
        entityId: c.id,
        after: { tenancyId: tenancy.id, amount: c.amount, reason: c.reason },
      })
    }
    addAuditEntry(tx, actor, {
      action: 'move-out',
      entity: 'tenancy',
      entityId: tenancy.id,
      before: { moveOut: null },
      after: { moveOut: leaveDate },
    })
  })
  return preview
}

/** All document records (links to Google Drive files), every tenant. */
export function watchAllDocuments(onChange, onError) {
  return onSnapshot(collection(db, 'documents'), (snap) => onChange(withIds(snap)), onError)
}
