// Firestore access for buildings, flats and electricity connections.
// Every write adds an audit entry in the same transaction/batch. Rules: firestore.rules.
//
// buildings/{code}      { code, name, address?, ownUse, notes?, createdAt/By, updatedAt/By? }
// connections/{ca}      { caNumber, type, submeter, holderName?, holderPhone?, holderEmail?, provider?, notes?, … }
// flats/{flatCode}      { code, buildingId, floor, floorKey, floorOrder, position, positionKey,
//                         friendlyName?, ownUse, connectionId?, notes?, … }

import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore'
import { db } from './firebase.js'
import { addAuditEntry } from './audit.js'
import { flatCode, floorKey, floorLabel, floorOrder, isValidBuildingCode, positionKey, positionLabel } from '../lib/property.js'

const MAX_BATCH_OPS = 450 // Firestore allows 500 writes per batch

function watchAll(name, onChange, onError) {
  return onSnapshot(collection(db, name), (snap) => onChange(snap.docs.map((d) => d.data())), onError)
}

export const watchBuildings = (onChange, onError) => watchAll('buildings', onChange, onError)
export const watchFlats = (onChange, onError) => watchAll('flats', onChange, onError)
export const watchConnections = (onChange, onError) => watchAll('connections', onChange, onError)

/** IDs already in the database, for import planning. */
export async function existingCodes() {
  const [b, f, c] = await Promise.all(['buildings', 'flats', 'connections'].map((n) => getDocs(collection(db, n))))
  return {
    buildingCodes: new Set(b.docs.map((d) => d.id)),
    flatCodes: new Set(f.docs.map((d) => d.id)),
    caNumbers: new Set(c.docs.map((d) => d.id)),
  }
}

function stamp(actor) {
  return { createdBy: actor.email.toLowerCase(), createdAt: serverTimestamp() }
}

function updateStamp(actor) {
  return { updatedBy: actor.email.toLowerCase(), updatedAt: serverTimestamp() }
}

function text(value) {
  return String(value ?? '').trim()
}

// ---------- buildings ----------

export async function createBuilding(actor, { code, name, address = '', ownUse = false, notes = '' }) {
  const id = text(code).toUpperCase()
  if (!isValidBuildingCode(id)) throw new Error('Building code: letters and numbers only, e.g. B08.')
  if (!text(name)) throw new Error('Enter a building name.')
  const ref = doc(db, 'buildings', id)
  await runTransaction(db, async (tx) => {
    if ((await tx.get(ref)).exists()) throw new Error(`Building ${id} already exists.`)
    const data = { code: id, name: text(name), address: text(address), ownUse: Boolean(ownUse), notes: text(notes), ...stamp(actor) }
    tx.set(ref, data)
    addAuditEntry(tx, actor, { action: 'create', entity: 'building', entityId: id, after: { name: data.name, ownUse: data.ownUse } })
  })
}

export async function updateBuilding(actor, current, changes) {
  const next = { ...current, ...changes, name: text(changes.name ?? current.name), ...updateStamp(actor) }
  if (!next.name) throw new Error('Enter a building name.')
  const batch = writeBatch(db)
  batch.set(doc(db, 'buildings', current.code), next)
  const tracked = ['name', 'address', 'ownUse', 'notes']
  addAuditEntry(batch, actor, {
    action: 'update',
    entity: 'building',
    entityId: current.code,
    before: Object.fromEntries(tracked.map((k) => [k, current[k] ?? ''])),
    after: Object.fromEntries(tracked.map((k) => [k, next[k] ?? ''])),
  })
  await batch.commit()
}

// ---------- flats ----------

function flatData(actor, { buildingId, floor, position, friendlyName = '', ownUse = false, connectionId = null, notes = '' }) {
  const code = flatCode(buildingId, floor, position)
  return {
    code,
    buildingId,
    floor: floorLabel(floor),
    floorKey: floorKey(floor),
    floorOrder: floorOrder(floor),
    position: positionLabel(position),
    positionKey: positionKey(position),
    friendlyName: text(friendlyName),
    ownUse: Boolean(ownUse),
    connectionId: connectionId || null,
    notes: text(notes),
    ...stamp(actor),
  }
}

function flatAuditView(f) {
  return { floor: f.floor, position: f.position, friendlyName: f.friendlyName ?? '', ownUse: f.ownUse, connectionId: f.connectionId ?? null }
}

export async function createFlat(actor, input) {
  const data = flatData(actor, input)
  const ref = doc(db, 'flats', data.code)
  await runTransaction(db, async (tx) => {
    if ((await tx.get(ref)).exists()) {
      throw new Error(`Flat ${data.code} already exists: this building already has a flat on that floor and position.`)
    }
    tx.set(ref, data)
    addAuditEntry(tx, actor, { action: 'create', entity: 'flat', entityId: data.code, after: flatAuditView(data) })
  })
  return data.code
}

/** Only friendly name, own use, connection and notes can change; the flat's identity cannot. */
export async function updateFlat(actor, current, { friendlyName, ownUse, connectionId, notes }) {
  const next = {
    ...current,
    friendlyName: text(friendlyName ?? current.friendlyName),
    ownUse: Boolean(ownUse ?? current.ownUse),
    connectionId: (connectionId === undefined ? current.connectionId : connectionId) || null,
    notes: text(notes ?? current.notes),
    ...updateStamp(actor),
  }
  const batch = writeBatch(db)
  batch.set(doc(db, 'flats', current.code), next)
  addAuditEntry(batch, actor, {
    action: 'update',
    entity: 'flat',
    entityId: current.code,
    before: { ...flatAuditView(current), notes: current.notes ?? '' },
    after: { ...flatAuditView(next), notes: next.notes },
  })
  await batch.commit()
}

// ---------- import ----------

/**
 * Writes the new items of an import plan (from planImport). Existing items are skipped.
 * buildingNames: { [code]: name } chosen in the preview.
 * Returns counts of what was created.
 */
export async function runImport(actor, plan, buildingNames = {}) {
  const ops = [] // [{ ref, data, audit }] in dependency order: buildings, connections, flats
  for (const b of plan.buildings.filter((x) => !x.exists)) {
    const name = text(buildingNames[b.code] ?? b.name)
    if (!name) throw new Error(`Enter a name for building ${b.code}.`)
    const data = { code: b.code, name, address: '', ownUse: b.ownUse, notes: '', ...stamp(actor) }
    ops.push({ ref: doc(db, 'buildings', b.code), data, audit: { entity: 'building', entityId: b.code, after: { name, ownUse: b.ownUse } } })
  }
  for (const c of plan.connections.filter((x) => !x.exists)) {
    const data = {
      caNumber: c.caNumber,
      type: c.type,
      submeter: c.submeter,
      holderName: c.holderName,
      holderPhone: c.holderPhone,
      holderEmail: c.holderEmail,
      provider: '',
      notes: '',
      ...stamp(actor),
    }
    // Holder contact details are kept out of the audit log.
    ops.push({ ref: doc(db, 'connections', c.caNumber), data, audit: { entity: 'connection', entityId: c.caNumber, after: { type: c.type, submeter: c.submeter } } })
  }
  for (const f of plan.flats.filter((x) => !x.exists)) {
    const data = flatData(actor, f)
    ops.push({ ref: doc(db, 'flats', data.code), data, audit: { entity: 'flat', entityId: data.code, after: flatAuditView(data) } })
  }

  // Each op is 2 writes (record + audit entry). Chunks keep dependency order.
  const perBatch = Math.floor(MAX_BATCH_OPS / 2)
  for (let i = 0; i < ops.length; i += perBatch) {
    const batch = writeBatch(db)
    for (const op of ops.slice(i, i + perBatch)) {
      batch.set(op.ref, op.data)
      addAuditEntry(batch, actor, { action: 'import', ...op.audit })
    }
    await batch.commit()
  }

  return {
    buildings: plan.buildings.filter((x) => !x.exists).length,
    connections: plan.connections.filter((x) => !x.exists).length,
    flats: plan.flats.filter((x) => !x.exists).length,
  }
}
