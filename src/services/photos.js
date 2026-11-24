// Tenant passport photos: a small JPEG (about 20 KB) in tenantPhotos/{tenantId}, kept apart from
// the tenant record so lists stay light. Any family member can add or replace a photo.

import { doc, onSnapshot, serverTimestamp, writeBatch } from 'firebase/firestore'
import { db } from './firebase.js'
import { addAuditEntry } from './audit.js'
import { isValidPhotoData, MAX_PHOTO_CHARS, PHOTO_HEIGHT, PHOTO_WIDTH, passportCrop } from '../lib/photo.js'

/** Shrinks a camera photo or image file to passport size (centre crop) as a JPEG data URL. */
export async function makePassportPhoto(file) {
  let bitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch (e) {
    throw new Error('This photo could not be read. Try a JPG or PNG photo.', { cause: e })
  }
  const { sx, sy, sw, sh } = passportCrop(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = PHOTO_WIDTH
  canvas.height = PHOTO_HEIGHT
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, PHOTO_WIDTH, PHOTO_HEIGHT)
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, PHOTO_WIDTH, PHOTO_HEIGHT)
  bitmap.close?.()
  for (const quality of [0.85, 0.7, 0.55, 0.4]) {
    const data = canvas.toDataURL('image/jpeg', quality)
    if (data.length <= MAX_PHOTO_CHARS) return data
  }
  throw new Error('This photo is too detailed to store. Try another photo.')
}

export function watchTenantPhoto(tenantId, onChange, onError) {
  return onSnapshot(
    doc(db, 'tenantPhotos', tenantId),
    (snap) => onChange(snap.exists() ? snap.data().photo : null),
    onError,
  )
}

export async function saveTenantPhoto(actor, tenantId, photo) {
  if (!isValidPhotoData(photo)) throw new Error('The photo is not in the expected format.')
  const batch = writeBatch(db)
  batch.set(doc(db, 'tenantPhotos', tenantId), { photo, updatedBy: actor.email.toLowerCase(), updatedAt: serverTimestamp() })
  addAuditEntry(batch, actor, { action: 'photo', entity: 'tenant', entityId: tenantId, after: { photo: 'added or replaced' } })
  await batch.commit()
}
