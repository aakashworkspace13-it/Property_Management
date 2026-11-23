// Firestore access for expense categories and expenses. Every write adds an audit entry.
//
// categories/{id}  { name, archived }                         admins only
// expenses/{id}    { date, amount (paise), categoryId, buildingId, flatId|null, payer, paymentMode,
//                    description, notes, shares { flatCode: paise } }   any family member

import { collection, doc, onSnapshot, serverTimestamp, writeBatch } from 'firebase/firestore'
import { db } from './firebase.js'
import { addAuditEntry } from './audit.js'
import { STANDARD_CATEGORIES } from '../lib/expenseRecords.js'

const email = (actor) => actor.email.toLowerCase()

function withIds(snap) {
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export const watchCategories = (onChange, onError) => onSnapshot(collection(db, 'categories'), (s) => onChange(withIds(s)), onError)
export const watchExpenses = (onChange, onError) => onSnapshot(collection(db, 'expenses'), (s) => onChange(withIds(s)), onError)

/** Admin only: adds a category (name already validated). */
export async function addCategory(actor, name) {
  const ref = doc(collection(db, 'categories'))
  const batch = writeBatch(db)
  batch.set(ref, { name, archived: false, createdBy: email(actor), createdAt: serverTimestamp() })
  addAuditEntry(batch, actor, { action: 'create', entity: 'category', entityId: ref.id, after: { name } })
  await batch.commit()
}

/** Admin only: adds the standard categories that do not exist yet. */
export async function addStandardCategories(actor, existing) {
  const names = new Set(existing.map((c) => c.name.toLowerCase()))
  const batch = writeBatch(db)
  let added = 0
  for (const name of STANDARD_CATEGORIES) {
    if (names.has(name.toLowerCase())) continue
    const ref = doc(collection(db, 'categories'))
    batch.set(ref, { name, archived: false, createdBy: email(actor), createdAt: serverTimestamp() })
    addAuditEntry(batch, actor, { action: 'create', entity: 'category', entityId: ref.id, after: { name } })
    added++
  }
  if (added) await batch.commit()
  return added
}

/** Admin only: renames or archives/unarchives a category. */
export async function updateCategory(actor, category, changes) {
  const next = { name: changes.name ?? category.name, archived: changes.archived ?? category.archived }
  const batch = writeBatch(db)
  batch.update(doc(db, 'categories', category.id), { ...next, updatedBy: email(actor), updatedAt: serverTimestamp() })
  addAuditEntry(batch, actor, {
    action: 'update',
    entity: 'category',
    entityId: category.id,
    before: { name: category.name, archived: category.archived },
    after: next,
  })
  await batch.commit()
}

/** Adds an expense (validated by validateExpense, including its stored split). */
export async function addExpense(actor, value) {
  const ref = doc(collection(db, 'expenses'))
  const data = {
    date: value.date,
    amount: value.amount,
    categoryId: value.categoryId,
    buildingId: value.buildingId,
    flatId: value.flatId ?? null,
    payer: value.payer,
    paymentMode: value.paymentMode,
    description: value.description,
    notes: value.notes,
    shares: value.shares,
    createdBy: email(actor),
    createdAt: serverTimestamp(),
  }
  const batch = writeBatch(db)
  batch.set(ref, data)
  addAuditEntry(batch, actor, {
    action: 'create',
    entity: 'expense',
    entityId: ref.id,
    after: {
      date: data.date,
      amount: data.amount,
      buildingId: data.buildingId,
      flatId: data.flatId,
      payer: data.payer,
      paymentMode: data.paymentMode,
      description: data.description,
      flats: Object.keys(data.shares).length,
    },
  })
  await batch.commit()
  return ref.id
}

/** Changes the description, category, payment mode or notes of an expense (amounts never change). */
export async function updateExpenseDetails(actor, expense, { categoryId, paymentMode, description, notes }) {
  const next = {
    categoryId: categoryId ?? expense.categoryId,
    paymentMode: paymentMode ?? expense.paymentMode,
    description: (description ?? expense.description).trim(),
    notes: (notes ?? expense.notes ?? '').trim(),
  }
  if (!next.description) throw new Error('Describe the expense.')
  const batch = writeBatch(db)
  batch.update(doc(db, 'expenses', expense.id), { ...next, updatedBy: email(actor), updatedAt: serverTimestamp() })
  addAuditEntry(batch, actor, {
    action: 'update',
    entity: 'expense',
    entityId: expense.id,
    before: { categoryId: expense.categoryId, paymentMode: expense.paymentMode, description: expense.description, notes: expense.notes ?? '' },
    after: next,
  })
  await batch.commit()
}
