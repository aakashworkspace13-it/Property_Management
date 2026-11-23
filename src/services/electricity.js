// Firestore access for the electricity rate, Tata Power bills, sub-meter readings and the
// tenants' electricity charges. Every write adds an audit entry in the same batch.
//
// settings/app       { electricityRate: '4.00' }        one family-wide rate per unit (admins)
// bills/{id}         one Tata Power bill of a connection (amount in paise, dates, payer, status)
// readings/{id}      one sub-meter reading taken with a bill (previous/current/units)
// charges/{billId}_elec_{flat}  the tenant's electricity charge (account 'electricity')

import { collection, doc, onSnapshot, serverTimestamp, writeBatch } from 'firebase/firestore'
import { db } from './firebase.js'
import { addAuditEntry } from './audit.js'
import { isValidRate } from '../lib/electricity.js'

const email = (actor) => actor.email.toLowerCase()

function withIds(snap) {
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export function watchSettings(onChange, onError) {
  return onSnapshot(doc(db, 'settings', 'app'), (snap) => onChange(snap.exists() ? snap.data() : {}), onError)
}

export const watchBills = (onChange, onError) => onSnapshot(collection(db, 'bills'), (s) => onChange(withIds(s)), onError)
export const watchReadings = (onChange, onError) => onSnapshot(collection(db, 'readings'), (s) => onChange(withIds(s)), onError)

/** Admin only: sets the family-wide electricity rate per unit (e.g. "4" or "6.50"). */
export async function setElectricityRate(actor, rate, previous) {
  const value = String(rate ?? '').trim()
  if (!isValidRate(value)) throw new Error('Enter a rate like 4 or 6.50 (rupees per unit).')
  const batch = writeBatch(db)
  batch.set(doc(db, 'settings', 'app'), { electricityRate: value, updatedBy: email(actor), updatedAt: serverTimestamp() })
  addAuditEntry(batch, actor, {
    action: 'update',
    entity: 'settings',
    entityId: 'electricityRate',
    before: { electricityRate: previous ?? '' },
    after: { electricityRate: value },
  })
  await batch.commit()
}

/** A new bill ID. Create it when the bill form opens and reuse it for retries. */
export function newBillId() {
  return doc(collection(db, 'bills')).id
}

function clean(record) {
  const out = { ...record }
  delete out.id
  for (const k of Object.keys(out)) if (out[k] === undefined || out[k] === null) delete out[k]
  return out
}

/** Saves a planned bill (from planBill) with its readings and tenant charges, all together. */
export async function saveBill(actor, billId, plan) {
  const stamp = { createdBy: email(actor), createdAt: serverTimestamp() }
  const batch = writeBatch(db)
  batch.set(doc(db, 'bills', billId), { ...clean(plan.bill), ...stamp })
  addAuditEntry(batch, actor, {
    action: 'create',
    entity: 'bill',
    entityId: billId,
    after: {
      connectionId: plan.bill.connectionId,
      period: `${plan.bill.periodStart} to ${plan.bill.periodEnd}`,
      amount: plan.bill.amount,
      payer: plan.bill.payer,
      status: plan.bill.status,
    },
  })
  for (const r of plan.readings) {
    const ref = doc(collection(db, 'readings'))
    batch.set(ref, { ...clean(r), ...stamp })
    addAuditEntry(batch, actor, {
      action: 'reading',
      entity: 'reading',
      entityId: ref.id,
      after: { flatId: r.flatId, previous: r.previousReading, current: r.currentReading, units: r.units, reset: r.resetReason ?? '' },
    })
  }
  for (const c of plan.charges) {
    batch.set(doc(db, 'charges', c.id), { ...clean(c), ...stamp })
    addAuditEntry(batch, actor, {
      action: 'generate',
      entity: 'charge',
      entityId: c.id,
      after: { tenancyId: c.tenancyId, account: 'electricity', units: c.units, rate: c.rate, amount: c.amount },
    })
  }
  await batch.commit()
}

/** Marks a bill paid (with the date) or unpaid. */
export async function setBillPaid(actor, bill, paidOn) {
  const paid = Boolean(paidOn)
  const batch = writeBatch(db)
  batch.update(doc(db, 'bills', bill.id), {
    status: paid ? 'paid' : 'unpaid',
    paidOn: paid ? paidOn : '',
    updatedBy: email(actor),
    updatedAt: serverTimestamp(),
  })
  addAuditEntry(batch, actor, {
    action: paid ? 'mark-paid' : 'mark-unpaid',
    entity: 'bill',
    entityId: bill.id,
    before: { status: bill.status, paidOn: bill.paidOn ?? '' },
    after: { status: paid ? 'paid' : 'unpaid', paidOn: paid ? paidOn : '' },
  })
  await batch.commit()
}

