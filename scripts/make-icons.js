// Generates the PNG app icons (house on green) for phones and the install prompt.
// No image libraries needed: draws pixels and writes PNG with Node's zlib.
// Usage: node scripts/make-icons.js   → public/icons/icon-192.png, icon-512.png, maskable-512.png,
//                                       apple-touch-icon.png (180)

import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const GREEN = [0x1f, 0x6f, 0x5c]
const WHITE = [0xff, 0xff, 0xff]

// House outline in a 64x64 design grid (same shape as favicon.svg).
const HOUSE = [
  [32, 13], [12, 30], [18, 30], [18, 50], [29, 50], [29, 38], [35, 38], [35, 50], [46, 50], [46, 30], [52, 30],
]

function inside(x, y, poly) {
  let hit = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

function crc32(buf) {
  let c
  const table = []
  for (let n = 0; n < 256; n++) {
    c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  let crc = 0xffffffff
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

/** size: pixels; inset: fraction of padding around the house (maskable icons need a safe zone). */
function icon(size, { inset = 0, rounded = true } = {}) {
  const raw = Buffer.alloc(size * (size * 4 + 1))
  const radius = rounded ? size * 0.22 : 0
  const scale = (size * (1 - 2 * inset)) / 64
  const offset = size * inset
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0 // filter: none
    for (let x = 0; x < size; x++) {
      // rounded-square background (transparent outside the corners)
      const cx = Math.min(x, size - 1 - x)
      const cy = Math.min(y, size - 1 - y)
      const outside = radius && cx < radius && cy < radius && (radius - cx) ** 2 + (radius - cy) ** 2 > radius ** 2
      const gx = (x + 0.5 - offset) / scale
      const gy = (y + 0.5 - offset) / scale
      const color = inside(gx, gy, HOUSE) ? WHITE : GREEN
      const i = y * (size * 4 + 1) + 1 + x * 4
      raw[i] = color[0]
      raw[i + 1] = color[1]
      raw[i + 2] = color[2]
      raw[i + 3] = outside ? 0 : 255
    }
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8 // bit depth
  header[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync('public/icons', { recursive: true })
writeFileSync('public/icons/icon-192.png', icon(192))
writeFileSync('public/icons/icon-512.png', icon(512))
writeFileSync('public/icons/maskable-512.png', icon(512, { inset: 0.12, rounded: false }))
writeFileSync('public/icons/apple-touch-icon.png', icon(180, { rounded: false }))
console.log('Icons written to public/icons/')
