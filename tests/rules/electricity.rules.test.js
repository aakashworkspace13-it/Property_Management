// Security rules for the electricity rate, bills, sub-meter readings and electricity charges.
// Run with: npm run test:rules. Synthetic data only.

import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore'

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
    await setDoc(doc(db, 'connections/CA_TEST_1'), { caNumber: 'CA_TEST_1', type: 'domestic', submeter: true, ...at })
    await setDoc(doc(db, 'flats/B01-G-1'), {
      code: 'B01-G-1', buildingId: 'B01', floor: 'Ground', floorKey: 'G', floorOrder: 0, position: '1', positionKey: '1',
      ownUse: false, connectionId: 'CA_TEST_1', ...at,
    })
    await setDoc(doc(db, 'tenancies/ty1'), {
      tenantId: 't1', flatId: 'B01-G-1', buildingId: 'B01', moveIn: '2026-01-10', moveOut: null, monthlyRent: 1_000_000,
      trackFrom: '2026-01-10', ...at,
    })
  })
})

const db = (user) => env.authenticatedContext(user.uid, { email: user.email, email_verified: true }).firestore()
const created = (user = FAMILY) => ({ createdBy: user.email, createdAt: serverTimestamp() })

const bill = (extra = {}) => ({
  connectionId: 'CA_TEST_1', billDate: '2026-11-05', periodStart: '2026-10-01', periodEnd: '2026-10-31', amount: 245_000,
  dueDate: '2026-11-20', payer: 'family', status: 'unpaid', paidOn: '', notes: '', ...created(), ...extra,
})

const reading = (extra = {}) => ({
  flatId: 'B01-G-1', connectionId: 'CA_TEST_1', billId: 'bill1', previousReading: '100', currentReading: '160', units: '60',
  previousDate: '2026-09-30', readingDate: '2026-10-31', chargeId: 'bill1_elec_B01-G-1', ...created(), ...extra,
})

const charge = (extra = {}) => ({
  tenancyId: 'ty1', flatId: 'B01-G-1', buildingId: 'B01', account: 'electricity', source: 'submeter', amount: 24_000,
  due: '2026-11-20', start: '2026-09-30', end: '2026-10-31', units: '60', rate: '4', billId: 'bill1',
  reason: 'Sub-meter 100 → 160', ...created(), ...extra,
})

function billBatch(database, { withReading = true, withCharge = true, chargeExtra = {} } = {}) {
  const batch = writeBatch(database)
  batch.set(doc(database, 'bills/bill1'), bill())
  if (withReading) batch.set(doc(database, 'readings/r1'), reading())
  if (withCharge) batch.set(doc(database, 'charges/bill1_elec_B01-G-1'), charge(chargeExtra))
  return batch
}

describe('electricity rate', () => {
  it('only admins set it, as a decimal like "4" or "6.50"', async () => {
    const rate = (user, value) => ({ electricityRate: value, updatedBy: user.email, updatedAt: serverTimestamp() })
    await assertSucceeds(setDoc(doc(db(ADMIN), 'settings/app'), rate(ADMIN, '4')))
    await assertSucceeds(setDoc(doc(db(ADMIN), 'settings/app'), rate(ADMIN, '6.50')))
    await assertFails(setDoc(doc(db(ADMIN), 'settings/app'), rate(ADMIN, 'four')))
    await assertFails(setDoc(doc(db(FAMILY), 'settings/app'), rate(FAMILY, '5')))
  })
})

describe('bills, readings and electricity charges', () => {
  it('a bill, its reading and the tenant charge are saved together', async () => {
    await assertSucceeds(billBatch(db(FAMILY)).commit())
  })

  it('a reading or charge needs its bill; charge IDs are fixed per bill and flat', async () => {
    const d = db(FAMILY)
    await assertFails(setDoc(doc(d, 'readings/r1'), reading()))
    await assertFails(setDoc(doc(d, 'charges/bill1_elec_B01-G-1'), charge()))
    const wrongId = writeBatch(d)
    wrongId.set(doc(d, 'bills/bill1'), bill())
    wrongId.set(doc(d, 'charges/other-id'), charge())
    await assertFails(wrongId.commit())
  })

  it('sub-meter charges are electricity only', async () => {
    await assertFails(billBatch(db(FAMILY), { chargeExtra: { account: 'rent' } }).commit())
  })

  it('rejects bad bills and readings', async () => {
    const d = db(FAMILY)
    await assertFails(setDoc(doc(d, 'bills/b2'), bill({ amount: 0 })))
    await assertFails(setDoc(doc(d, 'bills/b2'), bill({ connectionId: 'CA_UNKNOWN' })))
    await assertFails(setDoc(doc(d, 'bills/b2'), bill({ status: 'paid', paidOn: '' })))
    await assertFails(setDoc(doc(d, 'bills/b2'), bill({ periodEnd: '2026-09-01' })))
    const badReading = writeBatch(d)
    badReading.set(doc(d, 'bills/bill1'), bill())
    badReading.set(doc(d, 'readings/r1'), reading({ readingDate: '2026-09-01' }))
    await assertFails(badReading.commit())
  })

  it('members mark bills paid; amounts never change; only admins void; nothing is deleted', async () => {
    await assertSucceeds(billBatch(db(FAMILY)).commit())
    const d = db(FAMILY)
    const stamp = { updatedBy: FAMILY.email, updatedAt: serverTimestamp() }
    await assertSucceeds(updateDoc(doc(d, 'bills/bill1'), { status: 'paid', paidOn: '2026-11-18', ...stamp }))
    await assertFails(updateDoc(doc(d, 'bills/bill1'), { amount: 1, ...stamp }))
    await assertFails(updateDoc(doc(d, 'readings/r1'), { currentReading: '170' }))
    const voidIt = (user) => ({ deleted: true, deletedBy: user.email, deletedAt: serverTimestamp(), deleteReason: 'Wrong bill' })
    await assertFails(updateDoc(doc(d, 'bills/bill1'), voidIt(FAMILY)))
    await assertSucceeds(updateDoc(doc(db(ADMIN), 'bills/bill1'), voidIt(ADMIN)))
    await assertFails(deleteDoc(doc(db(ADMIN), 'bills/bill1')))
  })
})
