// Security rules for tenants, tenancies, the one-tenant-per-flat lock, documents and Storage files.
// Run with: npm run test:rules. Synthetic data only.

import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore'
import { getBytes, ref, uploadBytes } from 'firebase/storage'

const ADMIN = { uid: 'admin-uid', email: 'admin@example.invalid' }
const FAMILY = { uid: 'family-uid', email: 'family@example.invalid' }
const STRANGER = { uid: 'stranger-uid', email: 'stranger@example.invalid' }

let env

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-family-property',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
    storage: { rules: readFileSync('storage.rules', 'utf8') },
  })
})

afterAll(async () => {
  await env?.cleanup()
})

beforeEach(async () => {
  await env.clearFirestore()
  await env.clearStorage()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    for (const [user, role] of [[ADMIN, 'admin'], [FAMILY, 'family']]) {
      await setDoc(doc(db, 'members', user.email), {
        email: user.email, name: role, role, active: true, addedBy: ADMIN.email, addedAt: new Date(),
      })
    }
    const stampNow = { createdBy: ADMIN.email, createdAt: new Date() }
    await setDoc(doc(db, 'buildings/B01'), { code: 'B01', name: 'Test', ownUse: false, ...stampNow })
    const flatBase = { buildingId: 'B01', floor: 'Ground', floorKey: 'G', floorOrder: 0, ...stampNow }
    await setDoc(doc(db, 'flats/B01-G-1'), { ...flatBase, code: 'B01-G-1', position: '1', positionKey: '1', ownUse: false })
    await setDoc(doc(db, 'flats/B01-G-2'), { ...flatBase, code: 'B01-G-2', position: '2', positionKey: '2', ownUse: true })
  })
})

function ctxFor(user) {
  return env.authenticatedContext(user.uid, { email: user.email, email_verified: true })
}

const created = (user = FAMILY) => ({ createdBy: user.email, createdAt: serverTimestamp() })
const updated = (user = FAMILY) => ({ updatedBy: user.email, updatedAt: serverTimestamp() })

const tenant = (extra = {}) => ({
  name: 'TEST Tenant', mobile: '9000000001', altMobile: '', members: 2, twoWheelers: 1, fourWheelers: 0,
  idType: 'aadhaar', idNumber: '000000000001', notes: '', ...created(), ...extra,
})

const tenancy = (extra = {}) => ({
  tenantId: 't1', flatId: 'B01-G-1', buildingId: 'B01', moveIn: '2025-01-15', moveOut: null,
  monthlyRent: 1_000_000, trackFrom: '2025-01-15', agreementStart: '', agreementEnd: '', notes: '', ...created(), ...extra,
})

/** The batch the app writes when a tenant moves in. */
function moveInBatch(db, { tenancyId = 'ty1', flatId = 'B01-G-1', tenantId = 't1', withTenant = true, extra = {} } = {}) {
  const batch = writeBatch(db)
  if (withTenant) batch.set(doc(db, 'tenants', tenantId), tenant())
  batch.set(doc(db, 'tenancies', tenancyId), tenancy({ tenantId, flatId, ...extra }))
  batch.set(doc(db, 'occupancy', flatId), { tenancyId, since: '2025-01-15' })
  return batch
}

/** The batch the app writes when a tenant moves out. */
function moveOutBatch(db, { tenancyId = 'ty1', flatId = 'B01-G-1', moveOut = '2025-03-01', release = true } = {}) {
  const batch = writeBatch(db)
  batch.update(doc(db, 'tenancies', tenancyId), { moveOut, ...updated() })
  if (release) batch.delete(doc(db, 'occupancy', flatId))
  return batch
}

describe('tenants', () => {
  it('family members can add and edit tenants; outsiders cannot', async () => {
    const db = ctxFor(FAMILY).firestore()
    await assertSucceeds(setDoc(doc(db, 'tenants/t1'), tenant()))
    await assertSucceeds(updateDoc(doc(db, 'tenants/t1'), { members: 3, ...updated() }))
    await assertFails(setDoc(doc(ctxFor(STRANGER).firestore(), 'tenants/t2'), tenant(created(STRANGER))))
    await assertFails(getDoc(doc(ctxFor(STRANGER).firestore(), 'tenants/t1')))
  })

  it('rejects invalid tenant data and deletion', async () => {
    const db = ctxFor(FAMILY).firestore()
    await assertFails(setDoc(doc(db, 'tenants/t1'), tenant({ mobile: '12345' })))
    await assertFails(setDoc(doc(db, 'tenants/t1'), tenant({ members: 0 })))
    await assertFails(setDoc(doc(db, 'tenants/t1'), tenant({ idType: 'library-card' })))
    await assertFails(setDoc(doc(db, 'tenants/t1'), tenant({ deposit: 5000 })))
    await assertSucceeds(setDoc(doc(db, 'tenants/t1'), tenant()))
    await assertFails(deleteDoc(doc(db, 'tenants/t1')))
  })
})

describe('tenancies: one active tenant per flat', () => {
  it('a move-in creates tenant, tenancy and lock together', async () => {
    await assertSucceeds(moveInBatch(ctxFor(FAMILY).firestore()).commit())
  })

  it('a tenancy without its lock is rejected', async () => {
    const db = ctxFor(FAMILY).firestore()
    await assertSucceeds(setDoc(doc(db, 'tenants/t1'), tenant()))
    await assertFails(setDoc(doc(db, 'tenancies/ty1'), tenancy()))
  })

  it('a second tenant cannot move into an occupied flat', async () => {
    const db = ctxFor(FAMILY).firestore()
    await assertSucceeds(moveInBatch(db).commit())
    await assertFails(moveInBatch(db, { tenancyId: 'ty2', tenantId: 't2' }).commit())
  })

  it('own-use flats cannot be rented', async () => {
    const db = ctxFor(FAMILY).firestore()
    await assertFails(moveInBatch(db, { flatId: 'B01-G-2', extra: { flatId: 'B01-G-2' } }).commit())
  })

  it('rent, dates and flat cannot change after move-in; agreement dates can', async () => {
    const db = ctxFor(FAMILY).firestore()
    await assertSucceeds(moveInBatch(db).commit())
    await assertFails(updateDoc(doc(db, 'tenancies/ty1'), { monthlyRent: 900_000, ...updated() }))
    await assertFails(updateDoc(doc(db, 'tenancies/ty1'), { flatId: 'B01-G-2', ...updated() }))
    await assertSucceeds(updateDoc(doc(db, 'tenancies/ty1'), { agreementEnd: '2026-01-14', ...updated() }))
  })

  it('move-out releases the flat for the next tenant', async () => {
    const db = ctxFor(FAMILY).firestore()
    await assertSucceeds(moveInBatch(db).commit())
    await assertFails(moveOutBatch(db, { release: false }).commit()) // must release the lock too
    await assertFails(deleteDoc(doc(db, 'occupancy/B01-G-1'))) // lock cannot be removed on its own
    await assertSucceeds(moveOutBatch(db).commit())
    await assertSucceeds(moveInBatch(db, { tenancyId: 'ty2', tenantId: 't2' }).commit())
  })

  it('move-out is recorded once and must not be before move-in', async () => {
    const db = ctxFor(FAMILY).firestore()
    await assertSucceeds(moveInBatch(db).commit())
    await assertFails(moveOutBatch(db, { moveOut: '2024-12-31' }).commit())
    await assertSucceeds(moveOutBatch(db).commit())
    await assertFails(updateDoc(doc(db, 'tenancies/ty1'), { moveOut: '2025-04-01', ...updated() }))
  })
})

describe('documents and files', () => {
  const pdf = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52]) // "%PDF-1.4"

  async function seedTenant() {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'tenants/t1'), { ...tenant(), createdAt: new Date() })
    })
  }

  const record = (extra = {}) => ({
    tenantId: 't1', kind: 'id-proof', label: 'Front', fileName: 'id.pdf', contentType: 'application/pdf', size: 8,
    storagePath: 'tenants/t1/d1', uploadedBy: FAMILY.email, uploadedAt: serverTimestamp(), ...extra,
  })

  it('members can upload JPG/PNG/PDF files to an existing tenant and read them back', async () => {
    await seedTenant()
    const storage = ctxFor(FAMILY).storage()
    await assertSucceeds(uploadBytes(ref(storage, 'tenants/t1/d1'), pdf, { contentType: 'application/pdf' }))
    await assertSucceeds(getBytes(ref(storage, 'tenants/t1/d1')))
  })

  it('rejects other file types, unknown tenants, overwrites and outsiders', async () => {
    await seedTenant()
    const storage = ctxFor(FAMILY).storage()
    await assertFails(uploadBytes(ref(storage, 'tenants/t1/d2'), pdf, { contentType: 'text/html' }))
    await assertFails(uploadBytes(ref(storage, 'tenants/nobody/d3'), pdf, { contentType: 'application/pdf' }))
    await assertSucceeds(uploadBytes(ref(storage, 'tenants/t1/d4'), pdf, { contentType: 'application/pdf' }))
    await assertFails(uploadBytes(ref(storage, 'tenants/t1/d4'), pdf, { contentType: 'application/pdf' }))
    const outsider = ctxFor(STRANGER).storage()
    await assertFails(getBytes(ref(outsider, 'tenants/t1/d4')))
    await assertFails(uploadBytes(ref(outsider, 'tenants/t1/d5'), pdf, { contentType: 'application/pdf' }))
  })

  it('document records must point at their own file path and cannot be changed', async () => {
    await seedTenant()
    const db = ctxFor(FAMILY).firestore()
    await assertSucceeds(setDoc(doc(db, 'documents/d1'), record()))
    await assertFails(setDoc(doc(db, 'documents/d2'), record({ storagePath: 'tenants/t1/other' })))
    await assertFails(setDoc(doc(db, 'documents/d3'), record({ storagePath: 'tenants/t1/d3', contentType: 'image/gif' })))
    await assertFails(updateDoc(doc(db, 'documents/d1'), { label: 'Back' }))
    await assertFails(deleteDoc(doc(db, 'documents/d1')))
  })
})
