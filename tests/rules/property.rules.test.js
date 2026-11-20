// Security rules for buildings, flats and electricity connections. Run with: npm run test:rules
// Synthetic data only.

import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore'

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
  })
})

function dbFor(user) {
  return env.authenticatedContext(user.uid, { email: user.email, email_verified: true }).firestore()
}

const created = (user = ADMIN) => ({ createdBy: user.email, createdAt: serverTimestamp() })
const updated = (user = ADMIN) => ({ updatedBy: user.email, updatedAt: serverTimestamp() })

const building = (code = 'B01', extra = {}) => ({ code, name: 'Test building', ownUse: false, ...created(), ...extra })
const connection = (ca = 'CA_TEST_1', extra = {}) => ({ caNumber: ca, type: 'domestic', submeter: true, ...created(), ...extra })
const flat = (code = 'B01-G-1', extra = {}) => {
  const [buildingId, floorKey, positionKey] = code.split('-')
  return {
    code, buildingId, floor: 'Ground', floorKey, floorOrder: 0, position: positionKey, positionKey,
    friendlyName: '', ownUse: false, connectionId: null, notes: '', ...created(), ...extra,
  }
}

async function seedBuilding() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'buildings/B01'), { ...building(), createdAt: new Date() })
    await setDoc(doc(ctx.firestore(), 'connections/CA_TEST_1'), { ...connection(), createdAt: new Date() })
    await setDoc(doc(ctx.firestore(), 'flats/B01-G-1'), { ...flat(), createdAt: new Date() })
  })
}

describe('buildings', () => {
  it('admins can create; family members and outsiders cannot', async () => {
    await assertSucceeds(setDoc(doc(dbFor(ADMIN), 'buildings/B01'), building()))
    await assertFails(setDoc(doc(dbFor(FAMILY), 'buildings/B02'), building('B02', created(FAMILY))))
    await assertFails(setDoc(doc(dbFor(STRANGER), 'buildings/B03'), building('B03', created(STRANGER))))
  })

  it('members can read; outsiders cannot', async () => {
    await seedBuilding()
    await assertSucceeds(getDoc(doc(dbFor(FAMILY), 'buildings/B01')))
    await assertFails(getDoc(doc(dbFor(STRANGER), 'buildings/B01')))
  })

  it('rejects bad data and a code that does not match the document', async () => {
    const db = dbFor(ADMIN)
    await assertFails(setDoc(doc(db, 'buildings/B01'), building('B02')))
    await assertFails(setDoc(doc(db, 'buildings/b-1'), building('b-1')))
    await assertFails(setDoc(doc(db, 'buildings/B01'), building('B01', { name: '' })))
    await assertFails(setDoc(doc(db, 'buildings/B01'), building('B01', { rent: 1 })))
  })

  it('admins can rename but never delete', async () => {
    await seedBuilding()
    const db = dbFor(ADMIN)
    await assertSucceeds(updateDoc(doc(db, 'buildings/B01'), { name: 'Renamed', ...updated() }))
    await assertFails(updateDoc(doc(db, 'buildings/B01'), { name: 'No stamp' }))
    await assertFails(deleteDoc(doc(db, 'buildings/B01')))
  })
})

describe('flats', () => {
  it('admins can create a flat whose code matches building, floor and position', async () => {
    await seedBuilding()
    const db = dbFor(ADMIN)
    await assertSucceeds(setDoc(doc(db, 'flats/B01-1-L'), flat('B01-1-L', { floor: '1st', floorOrder: 1, position: 'Left', connectionId: 'CA_TEST_1' })))
    await assertFails(setDoc(doc(db, 'flats/B01-1-X'), flat('B01-1-L')))
  })

  it('needs an existing building and connection', async () => {
    const db = dbFor(ADMIN)
    await assertFails(setDoc(doc(db, 'flats/B09-G-1'), flat('B09-G-1')))
    await seedBuilding()
    await assertFails(setDoc(doc(db, 'flats/B01-2-1'), flat('B01-2-1', { connectionId: 'CA_MISSING' })))
  })

  it('a building, connection and flats can be created together in one import batch', async () => {
    const db = dbFor(ADMIN)
    const batch = writeBatch(db)
    batch.set(doc(db, 'buildings/B05'), building('B05'))
    batch.set(doc(db, 'connections/CA_NEW'), connection('CA_NEW'))
    batch.set(doc(db, 'flats/B05-G-F'), flat('B05-G-F', { connectionId: 'CA_NEW' }))
    await assertSucceeds(batch.commit())
  })

  it('family members can read but not create or edit flats', async () => {
    await seedBuilding()
    const db = dbFor(FAMILY)
    await assertSucceeds(getDoc(doc(db, 'flats/B01-G-1')))
    await assertFails(setDoc(doc(db, 'flats/B01-2-1'), flat('B01-2-1', created(FAMILY))))
    await assertFails(updateDoc(doc(db, 'flats/B01-G-1'), { friendlyName: 'x', ...updated(FAMILY) }))
  })

  it('identity fields never change; friendly name and notes can', async () => {
    await seedBuilding()
    const db = dbFor(ADMIN)
    await assertSucceeds(updateDoc(doc(db, 'flats/B01-G-1'), { friendlyName: 'Shop', ...updated() }))
    await assertFails(updateDoc(doc(db, 'flats/B01-G-1'), { position: 'Right', ...updated() }))
    await assertFails(updateDoc(doc(db, 'flats/B01-G-1'), { buildingId: 'B02', ...updated() }))
    await assertFails(deleteDoc(doc(db, 'flats/B01-G-1')))
  })
})

describe('connections', () => {
  it('admins manage connections with valid types only', async () => {
    const db = dbFor(ADMIN)
    await assertSucceeds(setDoc(doc(db, 'connections/CA_TEST_9'), connection('CA_TEST_9', { holderPhone: '9000000000' })))
    await assertFails(setDoc(doc(db, 'connections/CA_TEST_8'), connection('CA_TEST_8', { type: 'industrial' })))
    await assertFails(setDoc(doc(db, 'connections/ca test'), connection('ca test')))
    await assertFails(setDoc(doc(dbFor(FAMILY), 'connections/CA_TEST_7'), connection('CA_TEST_7', created(FAMILY))))
  })

  it('outsiders cannot read connections (holder details are private)', async () => {
    await seedBuilding()
    await assertSucceeds(getDoc(doc(dbFor(FAMILY), 'connections/CA_TEST_1')))
    await assertFails(getDoc(doc(dbFor(STRANGER), 'connections/CA_TEST_1')))
  })
})
