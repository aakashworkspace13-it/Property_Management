// Passport-size tenant photo: centre-cropped to 7:9 (35 × 45 mm) and stored as a small JPEG.

export const PHOTO_WIDTH = 210
export const PHOTO_HEIGHT = 270
export const MAX_PHOTO_CHARS = 100_000 // data URL length limit (also enforced by the database rules)

/** The largest 7:9 area in the middle of a width × height picture: { sx, sy, sw, sh }. */
export function passportCrop(width, height) {
  if (!(width > 0 && height > 0)) throw new Error('The picture has no size.')
  const ratio = PHOTO_WIDTH / PHOTO_HEIGHT
  if (width / height > ratio) {
    const sw = Math.round(height * ratio)
    return { sx: Math.round((width - sw) / 2), sy: 0, sw, sh: height }
  }
  const sh = Math.round(width / ratio)
  return { sx: 0, sy: Math.round((height - sh) / 2), sw: width, sh }
}

/** A problem with the chosen file, or null. */
export function checkPhotoFile(file) {
  if (!file) return 'Choose a photo.'
  if (file.type && !file.type.startsWith('image/')) return 'Choose a photo (JPG or PNG).'
  if (file.size > 20 * 1024 * 1024) return 'This photo is too large (over 20 MB).'
  return null
}

/** True for what the database accepts: a JPEG data URL within the size limit. */
export function isValidPhotoData(data) {
  return typeof data === 'string' && data.length <= MAX_PHOTO_CHARS && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(data)
}
