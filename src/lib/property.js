// Buildings, flats and electricity connections: naming, codes, CSV import planning, occupancy.
// Pure functions only (no Firebase). Rules: docs/REQUIREMENTS.md section 4.
//
// Codes
//   Building: short permanent code, e.g. "B01".
//   Flat:     `${buildingCode}-${floorKey}-${positionKey}`, e.g. "B01-G-1", "B02-1-L", "B03-G-1C".
//   Because the flat code is built from building + floor + position, two flats can never share
//   the same floor and position in one building. The code never changes once created.

const FLOOR_WORDS = {
  ground: 0, g: 0, gf: 0,
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
  sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
}

const POSITION_KEYS = { front: 'F', back: 'B', left: 'L', right: 'R', single: 'S' }

function slug(text) {
  return String(text ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function clean(text) {
  return String(text ?? '').trim().replace(/\s+/g, ' ')
}

/** Number of a floor label (Ground = 0, "1st"/"First"/"1" = 1, Basement = -1), or null if custom. */
export function floorNumber(label) {
  const text = clean(label).toLowerCase().replace(/\bfloor\b/, '').trim()
  if (text in FLOOR_WORDS) return FLOOR_WORDS[text]
  if (/^(basement|b|lower ground|lg)$/.test(text)) return -1
  const m = /^(\d+)(st|nd|rd|th)?$/.exec(text)
  return m ? Number(m[1]) : null
}

/** Short key used in flat codes: "G", "1", "2", "BS" (basement) or a slug for custom floors. */
export function floorKey(label) {
  const n = floorNumber(label)
  if (n === 0) return 'G'
  if (n === -1) return 'BS'
  if (n !== null) return String(n)
  return slug(label)
}

/** Sort order for floors: basement, ground, 1st, 2nd … then custom labels. */
export function floorOrder(label) {
  const n = floorNumber(label)
  return n === null ? 100 : n
}

/** Readable floor label: "Ground", "1st", "2nd", "3rd", "4th" …, or the custom text. */
export function floorLabel(label) {
  const n = floorNumber(label)
  if (n === null) return clean(label)
  if (n === -1) return 'Basement'
  if (n === 0) return 'Ground'
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th'
  return `${n}${suffix}`
}

/** Short key for a position: Front→F, Back→B, Left→L, Right→R, Single→S, else a slug ("1", "1C"). */
export function positionKey(label) {
  const text = clean(label).toLowerCase()
  return POSITION_KEYS[text] ?? slug(label)
}

/** Readable position: "Front", "Left", "1", "1C"… */
export function positionLabel(label) {
  const text = clean(label)
  const lower = text.toLowerCase()
  if (lower in POSITION_KEYS) return lower[0].toUpperCase() + lower.slice(1)
  return text
}

export function isValidBuildingCode(code) {
  return /^[A-Z0-9]{1,10}$/.test(code ?? '')
}

/** Flat code from its building code, floor and position. Throws if a part is empty. */
export function flatCode(buildingCode, floor, position) {
  const f = floorKey(floor)
  const p = positionKey(position)
  if (!isValidBuildingCode(buildingCode) || !f || !p) {
    throw new Error('A flat needs a building, a floor and a position.')
  }
  return `${buildingCode}-${f}-${p}`
}

/** "40 Gaj / Ground / 1 — Hall" style reference for screens. */
export function flatReference(building, flat) {
  const base = `${building?.name ?? flat.buildingId} / ${floorLabel(flat.floor)} / ${positionLabel(flat.position)}`
  return flat.friendlyName ? `${base} — ${flat.friendlyName}` : base
}

/** Masks a phone number for lists: "98xxxxxx69". */
export function maskPhone(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '')
  if (digits.length < 5) return digits ? '•'.repeat(digits.length) : ''
  return digits.slice(0, 2) + '•'.repeat(digits.length - 4) + digits.slice(-2)
}

/**
 * Occupancy of a flat on `date` (YYYY-MM-DD), derived from tenancy dates (never a stored flag).
 * tenancies: [{ flatId, moveIn, moveOut? }]
 * Returns 'own-use' | 'occupied' | 'vacant'.
 */
export function occupancy(flat, tenancies, date) {
  if (flat.ownUse) return 'own-use'
  const live = tenancies.some(
    (t) => t.flatId === flat.code && !t.deleted && t.moveIn <= date && (!t.moveOut || t.moveOut >= date),
  )
  return live ? 'occupied' : 'vacant'
}

// ---------- CSV ----------

/** Parses CSV text (RFC 4180: quoted fields, "" escapes, CRLF/LF). Returns an array of rows. */
export function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  const raw = String(text ?? '')
  const input = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw // drop a byte-order mark (Excel "CSV UTF-8")
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += ch
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

// Column names accepted in the import file (matched case-insensitively, ignoring punctuation).
const COLUMNS = {
  code: ['id', 'idbuildingfloorflat', 'flatid', 'code'],
  building: ['building', 'buildingname'],
  floor: ['floor'],
  position: ['flat', 'position', 'unit'],
  caNumber: ['canumber', 'ca', 'cano'],
  connectionType: ['typeofconnection', 'connectiontype', 'type'],
  submeter: ['submeter'],
  holderName: ['meterownername', 'holdername', 'metername'],
  holderPhone: ['phonenumber', 'phone', 'mobile'],
  holderEmail: ['emailidattached', 'email', 'emailid'],
  tenantApplicable: ['tenantappliable', 'tenantapplicable', 'rentable'],
  comment: ['comment', 'comments', 'note', 'notes'],
}

function headerKey(text) {
  return String(text ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function yes(value) {
  return /^(yes|y|true|1)$/i.test(clean(value))
}

function blankish(value) {
  return /^(|na|n\/a|no|none|-)$/i.test(clean(value))
}

/**
 * Turns the owner's spreadsheet (saved as CSV) into an import plan.
 *
 * existing: { buildingCodes: Set, flatCodes: Set, caNumbers: Set } already in the app.
 * Returns {
 *   buildings:   [{ code, name, ownUse, flatCount, exists }],
 *   flats:       [{ code, buildingId, floor, position, friendlyName, ownUse, connectionId, notes, exists, row }],
 *   connections: [{ caNumber, type, submeter, holderName, holderPhone, holderEmail, flatCodes, exists }],
 *   problems:    [{ row, message }]       (rows with problems are left out of the plan)
 *   warnings:    [{ row, message }]       (imported, but worth a look)
 * }
 */
export function planImport(csvText, existing = {}) {
  const have = {
    buildingCodes: existing.buildingCodes ?? new Set(),
    flatCodes: existing.flatCodes ?? new Set(),
    caNumbers: existing.caNumbers ?? new Set(),
  }
  const rows = parseCsv(csvText)
  const problems = []
  const warnings = []
  if (rows.length < 2) {
    return { buildings: [], flats: [], connections: [], problems: [{ row: 0, message: 'The file has no data rows.' }], warnings }
  }

  const header = rows[0].map(headerKey)
  const col = {}
  for (const [field, names] of Object.entries(COLUMNS)) {
    const index = header.findIndex((h) => names.includes(h))
    if (index !== -1) col[field] = index
  }
  for (const required of ['building', 'floor', 'position']) {
    if (!(required in col)) problems.push({ row: 1, message: `Missing column: ${required}.` })
  }
  if (problems.length) return { buildings: [], flats: [], connections: [], problems, warnings }

  const get = (r, field) => (field in col ? clean(r[col[field]]) : '')
  const buildings = new Map()
  const flats = new Map()
  const connections = new Map()
  let nextBuilding = 1

  rows.slice(1).forEach((r, i) => {
    const rowNo = i + 2 // spreadsheet row number (header is row 1)
    const buildingName = get(r, 'building')
    const floor = get(r, 'floor')
    const position = get(r, 'position')
    if (!buildingName || !floor || !position) {
      problems.push({ row: rowNo, message: 'Building, floor and flat are all required.' })
      return
    }

    // Building code: from the ID column ("B01-G-1" → "B01"), else B01, B02… in order of appearance.
    const idText = get(r, 'code').toUpperCase()
    let buildingCode = idText.includes('-') ? idText.split('-')[0] : ''
    const known = [...buildings.values()].find((b) => b.sourceName === buildingName)
    if (!buildingCode) buildingCode = known?.code ?? `B${String(nextBuilding).padStart(2, '0')}`
    if (!isValidBuildingCode(buildingCode)) {
      problems.push({ row: rowNo, message: `"${buildingCode}" is not a valid building code.` })
      return
    }
    if (known && known.code !== buildingCode) {
      problems.push({ row: rowNo, message: `Building "${buildingName}" appears with two codes (${known.code}, ${buildingCode}).` })
      return
    }
    const sameCode = buildings.get(buildingCode)
    if (sameCode && sameCode.sourceName !== buildingName) {
      problems.push({ row: rowNo, message: `Code ${buildingCode} is used for "${sameCode.sourceName}" and "${buildingName}".` })
      return
    }

    // If the ID names a more specific position on the same building and floor (e.g. "B03-G-1C"
    // while the Flat column says "1"), use the ID's position so the two flats stay distinct.
    let flatPosition = position
    const idParts = idText.split('-')
    if (
      idParts.length === 3 &&
      idParts[0] === buildingCode &&
      idParts[1] === floorKey(floor) &&
      idParts[2] !== positionKey(position) &&
      idParts[2].startsWith(positionKey(position))
    ) {
      flatPosition = idParts[2]
      warnings.push({ row: rowNo, message: `Using flat position "${idParts[2]}" from the ID (Flat column says "${position}").` })
    }

    let code
    try {
      code = flatCode(buildingCode, floor, flatPosition)
    } catch (e) {
      problems.push({ row: rowNo, message: e.message })
      return
    }
    if (idText && idText !== code) {
      warnings.push({ row: rowNo, message: `ID ${idText} does not match floor/flat; using ${code}.` })
    }
    if (flats.has(code)) {
      problems.push({ row: rowNo, message: `Duplicate flat ${code} (same building, floor and flat as row ${flats.get(code).row}).` })
      return
    }

    if (!sameCode) {
      buildings.set(buildingCode, {
        code: buildingCode,
        name: buildingName,
        sourceName: buildingName,
        rentableFlats: 0,
        flatCount: 0,
        exists: have.buildingCodes.has(buildingCode),
      })
      nextBuilding++
    }
    const building = buildings.get(buildingCode)

    // "Sub meter": Yes → shared meter with a sub-meter; NA/No/blank → none; other words → a label.
    const submeterText = get(r, 'submeter')
    const submeter = yes(submeterText)
    const label = !submeter && !blankish(submeterText) ? submeterText : ''
    const comment = get(r, 'comment')
    const ownUse = 'tenantApplicable' in col ? !yes(get(r, 'tenantApplicable')) : false

    const caNumber = get(r, 'caNumber').toUpperCase().replace(/\s+/g, '')
    if (caNumber) {
      const type = /commercial/i.test(get(r, 'connectionType')) ? 'commercial' : 'domestic'
      const phone = get(r, 'holderPhone').replace(/\D/g, '')
      const details = {
        holderName: get(r, 'holderName'),
        holderPhone: phone,
        holderEmail: get(r, 'holderEmail').toLowerCase(),
      }
      const c = connections.get(caNumber)
      if (!c) {
        connections.set(caNumber, { caNumber, type, submeter, ...details, flatCodes: [code], exists: have.caNumbers.has(caNumber) })
      } else {
        c.flatCodes.push(code)
        c.submeter ||= submeter
        if (c.type !== type) warnings.push({ row: rowNo, message: `CA ${caNumber} is listed as both domestic and commercial; keeping ${c.type}.` })
        for (const [k, v] of Object.entries(details)) {
          if (v && !c[k]) c[k] = v
          else if (v && c[k] !== v) warnings.push({ row: rowNo, message: `CA ${caNumber} has a different ${k === 'holderPhone' ? 'phone number' : k === 'holderEmail' ? 'email' : 'holder name'} here; keeping the first one.` })
        }
      }
    }

    flats.set(code, {
      code,
      buildingId: buildingCode,
      floor: floorLabel(floor),
      position: positionLabel(flatPosition),
      friendlyName: comment || label,
      ownUse,
      connectionId: caNumber || null,
      notes: comment && label ? label : '',
      exists: have.flatCodes.has(code),
      row: rowNo,
    })
    building.flatCount++
    if (!ownUse) building.rentableFlats++
  })

  return {
    buildings: [...buildings.values()].map((b) => ({
      code: b.code,
      name: b.name,
      flatCount: b.flatCount,
      exists: b.exists,
      ownUse: b.rentableFlats === 0,
    })),
    flats: [...flats.values()],
    connections: [...connections.values()],
    problems,
    warnings,
  }
}

/** Sorts flats for display: by building code, then floor, then position. */
export function sortFlats(flats) {
  return [...flats].sort(
    (a, b) =>
      a.buildingId.localeCompare(b.buildingId) ||
      floorOrder(a.floor) - floorOrder(b.floor) ||
      String(a.position).localeCompare(String(b.position), undefined, { numeric: true }),
  )
}

/** Short connection type label: "Com" for commercial, "Dom" for domestic. */
export function connectionTypeLabel(type) {
  return type === 'commercial' ? 'Com' : 'Dom'
}
