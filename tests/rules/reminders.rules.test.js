// Security rules for own reminders and phone push registrations. Run with: npm run test:rules.
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'

const FAMILY = { uid: 'family-uid', email: 'family@example.invalid' }
const OTHER = { uid: 'other-uid', email: 'other@example.invalid' }
const STRANGER = { uid: 'stranger-uid', email: 'stranger@example.invalid' }

let env

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-family-property', firestore: { rules: readFileSync('firestore.rules', 'utf8') } })
})

afterAll(async () => {
  await env?.cleanup()
})

beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    for (const user of [FAMILY, OTHER]) {
      await setDoc(doc(ctx.firestore(), 'members', user.email), {
        email: user.email, name: 'x', role: 'family', active: true, addedBy: FAMILY.email, addedAt: new Date(),
      })
    }
  })
})

const db = (user) => env.authenticatedContext(user.uid, { email: user.email, email_verified: true }).firestore()
const reminder = (extra = {}) => ({ title: 'Water tank cleaning', date: '2026-11-25', done: false, createdBy: FAMILY.email, createdAt: serverTimestamp(), ...extra })

describe('own reminders', () => {
  it('members add title + date only', async () => {
    await assertSucceeds(setDoc(doc(db(FAMILY), 'reminders/r1'), reminder()))
    await assertFails(setDoc(doc(db(FAMILY), 'reminders/r2'), reminder({ notes: 'extra field' })))
    await assertFails(setDoc(doc(db(FAMILY), 'reminders/r3'), reminder({ title: '' })))
    await assertFails(setDoc(doc(db(STRANGER), 'reminders/r4'), reminder({ createdBy: STRANGER.email })))
  })

  it('any member marks done; the text never changes; nothing is deleted', async () => {
    await assertSucceeds(setDoc(doc(db(FAMILY), 'reminders/r1'), reminder()))
    const done = (user) => ({ done: true, doneBy: user.email, doneAt: serverTimestamp() })
    await assertSucceeds(updateDoc(doc(db(OTHER), 'reminders/r1'), done(OTHER)))
    await assertFails(updateDoc(doc(db(OTHER), 'reminders/r1'), { title: 'Changed' }))
    await assertFails(deleteDoc(doc(db(FAMILY), 'reminders/r1')))
  })
})

describe('push registrations', () => {
  it('members register their own device; nobody reads them from the app', async () => {
    const reg = (user) => ({ email: user.email, createdAt: serverTimestamp() })
    await assertSucceeds(setDoc(doc(db(FAMILY), 'pushTokens/tok1'), reg(FAMILY)))
    await assertFails(setDoc(doc(db(FAMILY), 'pushTokens/tok2'), reg(OTHER)))
    await assertFails(getDoc(doc(db(FAMILY), 'pushTokens/tok1')))
    await assertFails(deleteDoc(doc(db(OTHER), 'pushTokens/tok1')))
    await assertSucceeds(deleteDoc(doc(db(FAMILY), 'pushTokens/tok1')))
  })
})
