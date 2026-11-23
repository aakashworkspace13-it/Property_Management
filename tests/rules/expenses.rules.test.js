// Security rules for expense categories, expenses and agreement history. Run with: npm run test:rules.
// Synthetic data only.

import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'

const ADMIN = { uid: 'admin-uid', email: 'admin@example.invalid' }
const FAMILY = { uid: 'family-uid', email: 'family@example.invalid' }

let env

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-family-property',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  })
})

afterAll(async () => {
  await env?.cleanup()
})

beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    const at = { createdBy: ADMIN.email, createdAt: new Date() }
    for (const [user, role] of [[ADMIN, 'admin'], [FAMILY, 'family']]) {
      await setDoc(doc(db, 'members', user.email), { email: user.email, name: role, role, active: true, addedBy: ADMIN.email, addedAt: new Date() })
    }
    await setDoc(doc(db, 'buildings/B01'), { code: 'B01', name: 'Test', ownUse: false, ...at })
    await setDoc(doc(db, 'buildings/B02'), { code: 'B02', name: 'Other', ownUse: false, ...at })
    await setDoc(doc(db, 'flats/B01-G-1'), {
      code: 'B01-G-1', buildingId: 'B01', floor: 'Ground', floorKey: 'G', floorOrder: 0, position: '1', positionKey: '1', ownUse: false, ...at,
    })
    await setDoc(doc(db, 'categories/repairs'), { name: 'Repairs', archived: false, ...at })
    await setDoc(doc(db, 'categories/old'), { name: 'Old', archived: true, ...at })
    await setDoc(doc(db, 'flats/B01-1-1'), {
      code: 'B01-1-1', buildingId: 'B01', floor: '1st', floorKey: '1', floorOrder: 1, position: '1', positionKey: '1', ownUse: false, ...at,
    })
  })
})

const db = (user) => env.authenticatedContext(user.uid, { email: user.email, email_verified: true }).firestore()
const created = (user = FAMILY) => ({ createdBy: user.email, createdAt: serverTimestamp() })
const updated = (user = FAMILY) => ({ updatedBy: user.email, updatedAt: serverTimestamp() })

const expense = (extra = {}) => ({
  date: '2026-11-15', amount: 100_001, categoryId: 'repairs', buildingId: 'B01', flatId: null, payer: 'owner', paymentMode: 'upi',
  description: 'Water tank cleaning', notes: '', shares: { 'B01-G-1': 50_001, 'B01-1-1': 50_000 }, ...created(), ...extra,
})

describe('categories', () => {
  it('only admins add, rename or archive categories; never delete', async () => {
    await assertSucceeds(setDoc(doc(db(ADMIN), 'categories/paint'), { name: 'Paint', archived: false, ...created(ADMIN) }))
    await assertFails(setDoc(doc(db(FAMILY), 'categories/tax'), { name: 'Tax', archived: false, ...created() }))
    await assertSucceeds(updateDoc(doc(db(ADMIN), 'categories/repairs'), { name: 'Repairs & fixes', ...updated(ADMIN) }))
    await assertSucceeds(updateDoc(doc(db(ADMIN), 'categories/repairs'), { archived: true, ...updated(ADMIN) }))
    await assertFails(deleteDoc(doc(db(ADMIN), 'categories/repairs')))
  })
})

describe('expenses', () => {
  it('members add building and flat expenses', async () => {
    await assertSucceeds(setDoc(doc(db(FAMILY), 'expenses/e1'), expense()))
    await assertSucceeds(setDoc(doc(db(FAMILY), 'expenses/e2'), expense({ flatId: 'B01-G-1', shares: { 'B01-G-1': 100_001 } })))
  })

  it('rejects bad expenses', async () => {
    const d = db(FAMILY)
    await assertFails(setDoc(doc(d, 'expenses/e3'), expense({ amount: 0 })))
    await assertFails(setDoc(doc(d, 'expenses/e3'), expense({ payer: 'bank' })))
    await assertFails(setDoc(doc(d, 'expenses/e3'), expense({ paymentMode: 'gold' })))
    await assertFails(setDoc(doc(d, 'expenses/e3'), expense({ description: '' })))
    await assertFails(setDoc(doc(d, 'expenses/e3'), expense({ categoryId: 'old' }))) // archived
    await assertFails(setDoc(doc(d, 'expenses/e3'), expense({ shares: {} })))
    // a flat expense must be for a flat of that building, and only that flat gets a share
    await assertFails(setDoc(doc(d, 'expenses/e3'), expense({ buildingId: 'B02', flatId: 'B01-G-1', shares: { 'B01-G-1': 100_001 } })))
    await assertFails(setDoc(doc(d, 'expenses/e3'), expense({ flatId: 'B01-G-1' })))
  })

  it('amount and split never change; description and category can; admins void', async () => {
    await assertSucceeds(setDoc(doc(db(FAMILY), 'expenses/e1'), expense()))
    const d = db(FAMILY)
    await assertSucceeds(updateDoc(doc(d, 'expenses/e1'), { description: 'Tank cleaned', paymentMode: 'cash', ...updated() }))
    await assertFails(updateDoc(doc(d, 'expenses/e1'), { amount: 1, ...updated() }))
    await assertFails(updateDoc(doc(d, 'expenses/e1'), { shares: { 'B01-G-1': 100_001 }, ...updated() }))
    await assertFails(updateDoc(doc(d, 'expenses/e1'), { deleted: true, deletedBy: FAMILY.email, deletedAt: serverTimestamp(), deleteReason: 'x' }))
    await assertSucceeds(updateDoc(doc(db(ADMIN), 'expenses/e1'), { deleted: true, deletedBy: ADMIN.email, deletedAt: serverTimestamp(), deleteReason: 'Entered twice' }))
    await assertFails(deleteDoc(doc(db(ADMIN), 'expenses/e1')))
  })
})

describe('agreement history', () => {
  it('members renew an agreement, keeping the old dates as history', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const x = ctx.firestore()
      await setDoc(doc(x, 'tenants/t1'), { name: 'T', mobile: '9000000001', members: 1, twoWheelers: 0, fourWheelers: 0, idType: 'pan', idNumber: 'ABCDE1234F', createdBy: ADMIN.email, createdAt: new Date() })
      await setDoc(doc(x, 'tenancies/ty1'), {
        tenantId: 't1', flatId: 'B01-G-1', buildingId: 'B01', moveIn: '2025-12-10', moveOut: null, monthlyRent: 1_000_000,
        trackFrom: '2025-12-10', agreementStart: '2025-12-10', agreementEnd: '2026-12-09', createdBy: ADMIN.email, createdAt: new Date(),
      })
    })
    await assertSucceeds(updateDoc(doc(db(FAMILY), 'tenancies/ty1'), {
      agreementStart: '2026-12-10', agreementEnd: '2027-12-09', agreementHistory: [{ start: '2025-12-10', end: '2026-12-09' }], ...updated(),
    }))
    await assertFails(updateDoc(doc(db(FAMILY), 'tenancies/ty1'), { agreementHistory: 'not a list', ...updated() }))
  })
})
