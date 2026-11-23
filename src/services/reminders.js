// Own reminders (title + date only). Every write adds an audit entry.
import { collection, doc, onSnapshot, serverTimestamp, writeBatch } from 'firebase/firestore'
import { db } from './firebase.js'
import { addAuditEntry } from './audit.js'

const email = (actor) => actor.email.toLowerCase()

export function watchOwnReminders(onChange, onError) {
  return onSnapshot(collection(db, 'reminders'), (s) => onChange(s.docs.map((d) => ({ id: d.id, ...d.data() }))), onError)
}

export async function addReminder(actor, { title, date }) {
  const text = String(title ?? '').trim()
  if (!text) throw new Error('Enter what to remember.')
  if (text.length > 80) throw new Error('Keep it under 80 characters.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) throw new Error('Choose a date.')
  const ref = doc(collection(db, 'reminders'))
  const batch = writeBatch(db)
  batch.set(ref, { title: text, date, done: false, createdBy: email(actor), createdAt: serverTimestamp() })
  addAuditEntry(batch, actor, { action: 'create', entity: 'reminder', entityId: ref.id, after: { title: text, date } })
  await batch.commit()
}

export async function setReminderDone(actor, reminder, done) {
  const batch = writeBatch(db)
  batch.update(doc(db, 'reminders', reminder.id), { done, doneBy: email(actor), doneAt: serverTimestamp() })
  addAuditEntry(batch, actor, { action: done ? 'done' : 'reopen', entity: 'reminder', entityId: reminder.id, before: { done: !done }, after: { done } })
  await batch.commit()
}
