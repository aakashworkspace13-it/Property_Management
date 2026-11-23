// Security rules for charges and payments. Run with: npm run test:rules. Synthetic data only.

import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'

const ADMIN = { uid: 'admin-uid', email: 'admin@example.invalid' }
const FAMILY = { uid: 'family-uid', email: 'family@example.invalid' }
const STRANGER = { uid: 'stranger-uid', email: 'stranger@example.invalid' }

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
    for (const [user, role] of [[ADMIN, 'admin'], [FAMILY, 'family']]) {
      await setDoc(doc(db, 'members', user.email), {
        email: user.email, name: role, role, active: true, addedBy: ADMIN.email, addedAt: new Date(),
      })
    }
    await setDoc(doc(db, 'tenancies/ty1'), {
      tenantId: 't1', flatId: 'B01-G-1', buildingId: 'B01', moveIn: '2025-01-15', moveOut: null,
      monthlyRent: 1_000_000, trackFrom: '2025-01-15', createdBy: ADMIN.email, createdAt: new Date(),
    })
  })
})

const db = (user) => env.authenticatedContext(user.uid, { email: user.email, email_verified: true }).firestore()
const created = (user = FAMILY) => ({ createdBy: user.email, createdAt: serverTimestamp() })

const rentCharge = (extra = {}) => ({
  tenancyId: 'ty1', flatId: 'B01-G-1', buildingId: 'B01', account: 'rent', source: 'rent', amount: 1_000_000,
  monthlyRent: 1_000_000, due: '2025-01-15', start: '2025-01-15', end: '2025-02-14', periodDays: 31, occupiedDays: 31,
  ...created(), ...extra,
})

const payment = (extra = {}) => ({
  tenancyId: 'ty1', flatId: 'B01-G-1', buildingId: 'B01', account: 'rent', amount: 1_000_000, date: '2025-01-15',
  method: 'upi', reference: '', notes: '', ...created(), ...extra,
})

async function seedPayment() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'payments/p1'), { ...payment(), createdAt: new Date() })
  })
}

describe('charges', () => {
  it('members create rent charges with the deterministic period ID', async () => {
    await assertSucceeds(setDoc(doc(db(FAMILY), 'charges/ty1_rent_2025-01-15'), rentCharge()))
    await assertFails(setDoc(doc(db(FAMILY), 'charges/random-id'), rentCharge()))
  })

  it('a period can never be created twice or changed', async () => {
    const ref = doc(db(FAMILY), 'charges/ty1_rent_2025-01-15')
    await assertSucceeds(setDoc(ref, rentCharge()))
    await assertFails(setDoc(ref, rentCharge({ amount: 1 })))
    await assertFails(updateDoc(ref, { amount: 1 }))
    await assertFails(deleteDoc(ref))
  })

  it('must match the tenancy and use valid amounts', async () => {
    await assertFails(setDoc(doc(db(FAMILY), 'charges/ty1_rent_2025-01-15'), rentCharge({ flatId: 'B09-G-1' })))
    await assertFails(setDoc(doc(db(FAMILY), 'charges/ty1_rent_2025-01-15'), rentCharge({ amount: 100.5 })))
    await assertFails(setDoc(doc(db(FAMILY), 'charges/ty1_rent_2025-01-15'), rentCharge({ amount: -5 })))
  })

  it('negative amounts only as explicit adjustments; openings need a reason field', async () => {
    const adj = { tenancyId: 'ty1', flatId: 'B01-G-1', buildingId: 'B01', account: 'rent', source: 'adjustment', amount: -516_129,
      due: '2025-01-29', start: '2025-01-29', end: '2025-01-29', corrects: 'ty1_rent_2025-01-15', reason: 'Departure proration', ...created() }
    await assertSucceeds(setDoc(doc(db(FAMILY), 'charges/ty1_departure_2025-01-29'), adj))
    const opening = { tenancyId: 'ty1', flatId: 'B01-G-1', buildingId: 'B01', account: 'rent', source: 'opening', amount: 500_000,
      due: '2025-01-01', reason: 'Dues before the app', ...created() }
    await assertSucceeds(setDoc(doc(db(FAMILY), 'charges/ty1_opening_rent'), opening))
  })

  it('outsiders cannot read or write', async () => {
    await assertFails(setDoc(doc(db(STRANGER), 'charges/ty1_rent_2025-01-15'), rentCharge(created(STRANGER))))
    await assertFails(getDoc(doc(db(STRANGER), 'charges/ty1_rent_2025-01-15')))
  })
})

describe('payments', () => {
  it('members record payments; a retry with the same ID cannot create a second one', async () => {
    const ref = doc(db(FAMILY), 'payments/p1')
    await assertSucceeds(setDoc(ref, payment()))
    await assertFails(setDoc(ref, payment()))
  })

  it('rejects invalid payments', async () => {
    await assertFails(setDoc(doc(db(FAMILY), 'payments/p2'), payment({ amount: 0 })))
    await assertFails(setDoc(doc(db(FAMILY), 'payments/p2'), payment({ amount: 99.99 })))
    await assertFails(setDoc(doc(db(FAMILY), 'payments/p2'), payment({ method: 'barter' })))
    await assertFails(setDoc(doc(db(FAMILY), 'payments/p2'), payment({ date: '15/01/2025' })))
    await assertFails(setDoc(doc(db(FAMILY), 'payments/p2'), payment({ deleted: true })))
  })

  it('amounts can never be edited; only admins void or restore, with a reason', async () => {
    await seedPayment()
    const voidIt = (user, reason = 'Entered twice') => ({ deleted: true, deletedBy: user.email, deletedAt: serverTimestamp(), deleteReason: reason })
    await assertFails(updateDoc(doc(db(ADMIN), 'payments/p1'), { amount: 1 }))
    await assertFails(updateDoc(doc(db(FAMILY), 'payments/p1'), voidIt(FAMILY)))
    await assertFails(updateDoc(doc(db(ADMIN), 'payments/p1'), voidIt(ADMIN, '')))
    await assertSucceeds(updateDoc(doc(db(ADMIN), 'payments/p1'), voidIt(ADMIN)))
    await assertSucceeds(updateDoc(doc(db(ADMIN), 'payments/p1'), { ...voidIt(ADMIN, 'Was correct'), deleted: false }))
    await assertFails(deleteDoc(doc(db(ADMIN), 'payments/p1')))
  })

  it('members can reallocate a payment with a reason', async () => {
    await seedPayment()
    const realloc = (extra = {}) => ({
      manualAllocations: { 'ty1_rent_2025-02-15': 1_000_000 }, allocationReason: 'Tenant asked', allocationBy: FAMILY.email,
      allocationAt: serverTimestamp(), ...extra,
    })
    await assertSucceeds(updateDoc(doc(db(FAMILY), 'payments/p1'), realloc()))
    await assertFails(updateDoc(doc(db(FAMILY), 'payments/p1'), realloc({ allocationReason: '' })))
    await assertFails(updateDoc(doc(db(FAMILY), 'payments/p1'), { ...realloc(), amount: 5 }))
  })
})
