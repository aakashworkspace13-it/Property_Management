// Firestore security rules tests. Run with: npm run test:rules
// (starts the Firestore emulator, runs these tests, then stops it).
// Uses only synthetic example.invalid accounts.

import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore'

const OWNER = { uid: 'owner-uid', email: 'owner@example.invalid' }
const FAMILY = { uid: 'family-uid', email: 'family@example.invalid' }
const ADMIN2 = { uid: 'admin2-uid', email: 'admin2@example.invalid' }
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
})

function dbFor(user, { verified = true } = {}) {
  if (!user) return env.unauthenticatedContext().firestore()
  return env.authenticatedContext(user.uid, { email: user.email, email_verified: verified }).firestore()
}

function memberData(user, role, addedBy = user.email) {
  return { email: user.email, name: user.email.split('@')[0], role, active: true, addedBy, addedAt: serverTimestamp() }
}

function auditData(user, extra = {}) {
  return {
    actorUid: user.uid,
    actorEmail: user.email,
    action: 'create',
    entity: 'member',
    entityId: 'x',
    changedFields: [],
    before: null,
    after: null,
    at: serverTimestamp(),
    ...extra,
  }
}

function ownerSetupBatch(db, user) {
  const batch = writeBatch(db)
  batch.set(doc(db, 'config/setup'), { ownerUid: user.uid, createdAt: serverTimestamp() })
  batch.set(doc(db, 'members', user.email), memberData(user, 'admin'))
  batch.set(doc(collection(db, 'auditLogs')), auditData(user, { action: 'owner-setup' }))
  return batch
}

/** Seeds an owner (admin) and, optionally, more members, bypassing rules. */
async function seed(members = []) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'config/setup'), { ownerUid: OWNER.uid, createdAt: new Date() })
    await setDoc(doc(db, 'members', OWNER.email), { ...memberData(OWNER, 'admin'), addedAt: new Date() })
    for (const [user, role, active = true] of members) {
      await setDoc(doc(db, 'members', user.email), { ...memberData(user, role, OWNER.email), active, addedAt: new Date() })
    }
  })
}

describe('owner setup', () => {
  it('lets the first signed-in person become owner, in one batch', async () => {
    await assertSucceeds(ownerSetupBatch(dbFor(OWNER), OWNER).commit())
  })

  it('can only happen once', async () => {
    await assertSucceeds(ownerSetupBatch(dbFor(OWNER), OWNER).commit())
    await assertFails(ownerSetupBatch(dbFor(STRANGER), STRANGER).commit())
  })

  it('rejects setup without the admin record, or an admin record without setup', async () => {
    const db = dbFor(STRANGER)
    await assertFails(setDoc(doc(db, 'config/setup'), { ownerUid: STRANGER.uid, createdAt: serverTimestamp() }))
    await assertFails(setDoc(doc(db, 'members', STRANGER.email), memberData(STRANGER, 'admin')))
  })

  it('rejects setup naming someone else as owner', async () => {
    const db = dbFor(STRANGER)
    const batch = writeBatch(db)
    batch.set(doc(db, 'config/setup'), { ownerUid: OWNER.uid, createdAt: serverTimestamp() })
    batch.set(doc(db, 'members', STRANGER.email), memberData(STRANGER, 'admin'))
    await assertFails(batch.commit())
  })

  it('rejects unverified emails and signed-out users', async () => {
    await assertFails(ownerSetupBatch(dbFor(OWNER, { verified: false }), OWNER).commit())
    await assertFails(getDoc(doc(dbFor(null), 'config/setup')))
  })

  it('setup record cannot be changed or deleted', async () => {
    await seed()
    const db = dbFor(OWNER)
    await assertFails(updateDoc(doc(db, 'config/setup'), { ownerUid: 'other' }))
    await assertFails(deleteDoc(doc(db, 'config/setup')))
  })
})

describe('members', () => {
  it('outsiders cannot list members but can check their own record', async () => {
    await seed()
    const db = dbFor(STRANGER)
    await assertFails(getDocs(collection(db, 'members')))
    await assertSucceeds(getDoc(doc(db, 'members', STRANGER.email)))
    await assertFails(getDoc(doc(db, 'members', OWNER.email)))
  })

  it('family members can read the list but not add people', async () => {
    await seed([[FAMILY, 'family']])
    const db = dbFor(FAMILY)
    await assertSucceeds(getDocs(collection(db, 'members')))
    await assertFails(setDoc(doc(db, 'members', STRANGER.email), memberData(STRANGER, 'family', FAMILY.email)))
  })

  it('admins can add members with valid data only', async () => {
    await seed()
    const db = dbFor(OWNER)
    await assertSucceeds(setDoc(doc(db, 'members', FAMILY.email), memberData(FAMILY, 'family', OWNER.email)))
    await assertFails(setDoc(doc(db, 'members', ADMIN2.email), { ...memberData(ADMIN2, 'superuser', OWNER.email) }))
    await assertFails(setDoc(doc(db, 'members', 'Mixed@Example.invalid'), { ...memberData(ADMIN2, 'family', OWNER.email), email: 'Mixed@Example.invalid' }))
    await assertFails(setDoc(doc(db, 'members', ADMIN2.email), { ...memberData(ADMIN2, 'family', OWNER.email), extra: 1 }))
  })

  it('admins can deactivate others but never themselves', async () => {
    await seed([[FAMILY, 'family']])
    const db = dbFor(OWNER)
    const stamp = { updatedBy: OWNER.email, updatedAt: serverTimestamp() }
    await assertSucceeds(updateDoc(doc(db, 'members', FAMILY.email), { active: false, ...stamp }))
    await assertFails(updateDoc(doc(db, 'members', OWNER.email), { active: false, ...stamp }))
    await assertFails(updateDoc(doc(db, 'members', OWNER.email), { role: 'family', ...stamp }))
  })

  it('a deactivated member loses access', async () => {
    await seed([[FAMILY, 'family', false]])
    await assertFails(getDocs(collection(dbFor(FAMILY), 'members')))
  })

  it('members are never deleted', async () => {
    await seed([[FAMILY, 'family']])
    await assertFails(deleteDoc(doc(dbFor(OWNER), 'members', FAMILY.email)))
  })
})

describe('audit log', () => {
  it('members can add entries in their own name only', async () => {
    await seed([[FAMILY, 'family']])
    const db = dbFor(FAMILY)
    await assertSucceeds(setDoc(doc(db, 'auditLogs', 'a1'), auditData(FAMILY)))
    await assertFails(setDoc(doc(db, 'auditLogs', 'a2'), auditData(FAMILY, { actorUid: OWNER.uid })))
    await assertFails(setDoc(doc(db, 'auditLogs', 'a3'), auditData(FAMILY, { actorEmail: OWNER.email })))
  })

  it('entries can never be edited or deleted', async () => {
    await seed()
    const db = dbFor(OWNER)
    await assertSucceeds(setDoc(doc(db, 'auditLogs', 'a1'), auditData(OWNER)))
    await assertFails(updateDoc(doc(db, 'auditLogs', 'a1'), { action: 'changed' }))
    await assertFails(deleteDoc(doc(db, 'auditLogs', 'a1')))
  })

  it('outsiders can neither read nor write', async () => {
    await seed()
    const db = dbFor(STRANGER)
    await assertFails(setDoc(doc(db, 'auditLogs', 'a1'), auditData(STRANGER)))
    await assertFails(getDocs(collection(db, 'auditLogs')))
  })
})

describe('everything else', () => {
  it('is denied, even to admins', async () => {
    await seed()
    await assertFails(setDoc(doc(dbFor(OWNER), 'secrets/s1'), { name: 'x' }))
    await assertFails(getDoc(doc(dbFor(OWNER), 'secrets/s1')))
  })
})
