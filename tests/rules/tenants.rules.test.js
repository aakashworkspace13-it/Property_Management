// Security rules for tenants, tenancies, the one-tenant-per-flat lock and Drive document links.
// Run with: npm run test:rules. Synthetic data only.

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
    await assertFails(setDoc(doc(db, 'tenants/t1'), tenant({ idNumber: '12345678901' }))) // Aadhaar must be 12 digits
    await assertFails(setDoc(doc(db, 'tenants/t1'), tenant({ idNumber: '1234567890123' })))
    await assertSucceeds(setDoc(doc(db, 'tenants/t9'), tenant({ idType: 'pan', idNumber: 'ABCDE1234F' })))
    await assertFails(setDoc(doc(db, 'tenants/t1'), tenant({ deposit: 5000 })))
    await assertSucceeds(setDoc(doc(db, 'tenants/t1'), tenant()))
    await assertFails(deleteDoc(doc(db, 'tenants/t1')))
  })
})

describe('tenant photos', () => {
  const photo = (user = FAMILY, extra = {}) => ({ photo: 'data:image/jpeg;base64,AAAA', ...updated(user), ...extra })

  it('members add and replace a small JPEG photo of an existing tenant; outsiders cannot', async () => {
    const db = ctxFor(FAMILY).firestore()
    await assertFails(setDoc(doc(db, 'tenantPhotos/t1'), photo())) // no such tenant yet
    await assertSucceeds(setDoc(doc(db, 'tenants/t1'), tenant()))
    await assertSucceeds(setDoc(doc(db, 'tenantPhotos/t1'), photo()))
    await assertSucceeds(setDoc(doc(ctxFor(ADMIN).firestore(), 'tenantPhotos/t1'), photo(ADMIN, { photo: 'data:image/jpeg;base64,BBBB' })))
    await assertFails(getDoc(doc(ctxFor(STRANGER).firestore(), 'tenantPhotos/t1')))
    await assertFails(setDoc(doc(ctxFor(STRANGER).firestore(), 'tenantPhotos/t1'), photo(STRANGER)))
    await assertFails(deleteDoc(doc(db, 'tenantPhotos/t1')))
  })

  it('rejects other formats, large photos, extra fields and wrong stamps', async () => {
    const db = ctxFor(FAMILY).firestore()
    await assertSucceeds(setDoc(doc(db, 'tenants/t1'), tenant()))
    await assertFails(setDoc(doc(db, 'tenantPhotos/t1'), photo(FAMILY, { photo: 'data:image/png;base64,AAAA' })))
    await assertFails(setDoc(doc(db, 'tenantPhotos/t1'), photo(FAMILY, { photo: 'https://example.invalid/p.jpg' })))
    await assertFails(setDoc(doc(db, 'tenantPhotos/t1'), photo(FAMILY, { photo: `data:image/jpeg;base64,${'A'.repeat(100_000)}` })))
    await assertFails(setDoc(doc(db, 'tenantPhotos/t1'), photo(FAMILY, { note: 'x' })))
    await assertFails(setDoc(doc(db, 'tenantPhotos/t1'), photo(ADMIN)))
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

describe('documents (Google Drive links)', () => {
  async function seedTenant() {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'tenants/t1'), { ...tenant(), createdAt: new Date() })
    })
  }

  const record = (extra = {}) => ({
    tenantId: 't1', kind: 'id-proof', label: 'ID proof', fileName: 'id.pdf', contentType: 'application/pdf', size: 8,
    driveFileId: 'drive-file-1', driveLink: 'https://drive.google.com/file/d/drive-file-1/view', sharedWith: ['admin@example.invalid'],
    uploadedBy: FAMILY.email, uploadedAt: serverTimestamp(), ...extra,
  })

  it('members record Drive links for an existing tenant', async () => {
    await seedTenant()
    await assertSucceeds(setDoc(doc(ctxFor(FAMILY).firestore(), 'documents/d1'), record()))
  })

  it('rejects non-Drive links, other file types, unknown tenants and outsiders', async () => {
    await seedTenant()
    const db = ctxFor(FAMILY).firestore()
    await assertFails(setDoc(doc(db, 'documents/d2'), record({ driveLink: 'https://example.com/x' })))
    await assertFails(setDoc(doc(db, 'documents/d3'), record({ contentType: 'image/gif' })))
    await assertFails(setDoc(doc(db, 'documents/d4'), record({ tenantId: 'nobody' })))
    await assertFails(setDoc(doc(db, 'documents/d5'), record({ uploadedBy: ADMIN.email })))
    await assertFails(setDoc(doc(ctxFor(STRANGER).firestore(), 'documents/d6'), record({ uploadedBy: STRANGER.email })))
  })

  it('only the uploader updates sharing; nothing else changes; never deleted', async () => {
    await seedTenant()
    const db = ctxFor(FAMILY).firestore()
    await assertSucceeds(setDoc(doc(db, 'documents/d1'), record()))
    const stamp = (user) => ({ updatedBy: user.email, updatedAt: serverTimestamp() })
    await assertSucceeds(updateDoc(doc(db, 'documents/d1'), { sharedWith: [], ...stamp(FAMILY) }))
    await assertFails(updateDoc(doc(ctxFor(ADMIN).firestore(), 'documents/d1'), { sharedWith: [], ...stamp(ADMIN) }))
    await assertFails(updateDoc(doc(db, 'documents/d1'), { label: 'Back', ...stamp(FAMILY) }))
    await assertFails(deleteDoc(doc(db, 'documents/d1')))
  })
})
