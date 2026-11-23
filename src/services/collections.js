// Firestore access for rent charges and payments. Every write adds an audit entry in the same batch.
// Rules: firestore.rules (charges are created once and never edited; payments are append-only;
// admins can void/restore; any member can reallocate a payment with a reason).

import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore'
import { db } from './firebase.js'
import { addAuditEntry } from './audit.js'
import { dueRentCharges } from '../lib/collections.js'
import { allocateAccount, openingCharge } from '../lib/money/index.js'

const email = (actor) => actor.email.toLowerCase()
const MAX_BATCH = 200 // records per batch (each also writes an audit entry)

function withIds(snap) {
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export const watchCharges = (onChange, onError) => onSnapshot(collection(db, 'charges'), (s) => onChange(withIds(s)), onError)
export const watchPayments = (onChange, onError) => onSnapshot(collection(db, 'payments'), (s) => onChange(withIds(s)), onError)

function chargeRecord(actor, c) {
  const data = { ...c, createdBy: email(actor), createdAt: serverTimestamp() }
  delete data.id
  for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k]
  return data
}

/**
 * Creates rent charges for every period that has started (for all given tenancies).
 * Safe to call repeatedly and from several devices: IDs are fixed per period, and the rules
 * refuse a second copy. Returns the number of charges created.
 */
export async function ensureDueCharges(actor, tenancies, charges, today) {
  const missing = tenancies.flatMap((t) => dueRentCharges(t, charges.filter((c) => c.tenancyId === t.id), today))
  for (let i = 0; i < missing.length; i += MAX_BATCH) {
    const batch = writeBatch(db)
    for (const c of missing.slice(i, i + MAX_BATCH)) {
      batch.set(doc(db, 'charges', c.id), chargeRecord(actor, c))
      addAuditEntry(batch, actor, {
        action: 'generate',
        entity: 'charge',
        entityId: c.id,
        after: { tenancyId: c.tenancyId, period: `${c.start} to ${c.end}`, amount: c.amount },
      })
    }
    try {
      await batch.commit()
    } catch (e) {
      // Another device created the same period first; the next refresh picks it up.
      if (e.code !== 'permission-denied') throw e
      return 0
    }
  }
  return missing.length
}

/** A new payment ID. Create it when the payment form opens and reuse it for every retry. */
export function newPaymentId() {
  return doc(collection(db, 'payments')).id
}

/**
 * Records a payment. `id` must come from newPaymentId() and stay the same across retries:
 * if the first attempt actually saved but the answer was lost, the retry finds it and does
 * not create a second payment.
 */
export async function recordPayment(actor, { id, tenancy, account = 'rent', amount, date, method, reference = '', notes = '' }) {
  const ref = doc(db, 'payments', id)
  const data = {
    tenancyId: tenancy.id,
    flatId: tenancy.flatId,
    buildingId: tenancy.buildingId,
    account,
    amount,
    date,
    method,
    reference: reference.trim().slice(0, 100),
    notes: notes.trim().slice(0, 500),
    createdBy: email(actor),
    createdAt: serverTimestamp(),
  }
  const batch = writeBatch(db)
  batch.set(ref, data)
  addAuditEntry(batch, actor, {
    action: 'payment',
    entity: 'payment',
    entityId: id,
    after: { tenancyId: tenancy.id, account, amount, date, method },
  })
  try {
    await batch.commit()
    return { saved: true, alreadySaved: false }
  } catch (e) {
    if (e.code === 'permission-denied') {
      const existing = await getDoc(ref)
      if (existing.exists() && existing.data().amount === amount && existing.data().tenancyId === tenancy.id) {
        return { saved: true, alreadySaved: true }
      }
    }
    throw e
  }
}

/** Admin only: voids (or restores) a payment, charge, expense or bill with a reason. Nothing is deleted. */
export async function setVoided(actor, collectionName, record, voided, reason) {
  if (!reason?.trim()) throw new Error('Give a reason.')
  const batch = writeBatch(db)
  batch.update(doc(db, collectionName, record.id), {
    deleted: voided,
    deletedBy: email(actor),
    deletedAt: serverTimestamp(),
    deleteReason: reason.trim().slice(0, 300),
  })
  addAuditEntry(batch, actor, {
    action: voided ? 'void' : 'restore',
    entity: collectionName.replace(/s$/, ''), // payments → payment, expenses → expense, …
    entityId: record.id,
    before: { deleted: Boolean(record.deleted) },
    after: { deleted: voided, reason: reason.trim() },
  })
  await batch.commit()
}

/**
 * Splits a payment across periods by hand (allocations: { chargeId: paise }), or clears a manual
 * split (allocations = null). Checked against the whole ledger first.
 */
export async function reallocatePayment(actor, payment, allocations, reason, ledgerCharges, ledgerPayments) {
  if (!reason?.trim()) throw new Error('Give a reason for changing the split.')
  if (allocations) {
    const total = Object.values(allocations).reduce((s, v) => s + v, 0)
    if (total > payment.amount) throw new Error('The split adds up to more than the payment.')
    const trial = ledgerPayments.map((p) => (p.id === payment.id ? { ...p, manualAllocations: allocations } : p))
    allocateAccount(ledgerCharges, trial) // throws if it no longer fits
  }
  const batch = writeBatch(db)
  batch.update(doc(db, 'payments', payment.id), {
    manualAllocations: allocations,
    allocationReason: reason.trim().slice(0, 300),
    allocationBy: email(actor),
    allocationAt: serverTimestamp(),
  })
  addAuditEntry(batch, actor, {
    action: 'reallocate',
    entity: 'payment',
    entityId: payment.id,
    before: { manualAllocations: payment.manualAllocations ?? null },
    after: { manualAllocations: allocations, reason: reason.trim() },
  })
  await batch.commit()
}

/** Adds an opening balance (dues from before the app) to a tenancy. */
export async function addOpeningBalance(actor, tenancy, { account = 'rent', amount, due, start = '', end = '', reason }, existingCharges) {
  const charge = openingCharge(
    { tenancyId: tenancy.id, account, amount, due, start: start || undefined, end: end || undefined, reason },
    existingCharges.filter((c) => c.tenancyId === tenancy.id),
  )
  const data = chargeRecord(actor, { ...charge, flatId: tenancy.flatId, buildingId: tenancy.buildingId })
  if (!data.start) {
    delete data.start
    delete data.end
  }
  const batch = writeBatch(db)
  batch.set(doc(db, 'charges', charge.id), data)
  addAuditEntry(batch, actor, {
    action: 'opening',
    entity: 'charge',
    entityId: charge.id,
    after: { tenancyId: tenancy.id, account, amount, due, reason },
  })
  await batch.commit()
}
