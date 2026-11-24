// Tenants and tenancies: validation and small rules. Pure functions (no Firebase).
// Rules: docs/REQUIREMENTS.md section 5.
//
// A tenant is a person (contacts, household, vehicles, ID proof). A tenancy is that tenant
// living in one flat from move-in to move-out, with its own monthly rent and agreement.
// A flat can have only one active tenancy at a time.

import { addDays, compareDates, firstGeneratedPeriod, rentPeriods, rupeesToPaise } from './money/index.js'

export const ID_TYPES = [
  { value: 'aadhaar', label: 'Aadhaar' },
  { value: 'pan', label: 'PAN card' },
  { value: 'voter', label: 'Voter ID' },
  { value: 'driving', label: 'Driving licence' },
  { value: 'passport', label: 'Passport' },
  { value: 'other', label: 'Other' },
]

export function idTypeLabel(value) {
  return ID_TYPES.find((t) => t.value === value)?.label ?? 'ID'
}

const ISO = /^\d{4}-\d{2}-\d{2}$/

function text(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ')
}

/** Indian mobile number → 10 digits (drops +91 / leading 0). Returns '' if not a valid mobile. */
export function normalizeMobile(value) {
  let digits = String(value ?? '').replace(/\D/g, '')
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2)
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1)
  return /^[6-9]\d{9}$/.test(digits) ? digits : ''
}

/** "98765 43210" for display. */
export function formatMobile(digits) {
  return digits && digits.length === 10 ? `${digits.slice(0, 5)} ${digits.slice(5)}` : String(digits ?? '')
}

/** Shows only the last 4 characters of an ID number: "•••• 1234". */
export function maskIdNumber(value) {
  const clean = String(value ?? '').replace(/\s/g, '')
  return clean.length <= 4 ? '••••' : `•••• ${clean.slice(-4)}`
}

function count(value, { min = 0, max = 50 } = {}) {
  const n = Number(value)
  return Number.isInteger(n) && n >= min && n <= max ? n : null
}

/**
 * Checks the one-time tenant details. Returns { value, errors } where `errors` maps field → message.
 * input: { name, mobile, altMobile, emergencyName, emergencyRelation, emergencyMobile,
 *          members, twoWheelers, fourWheelers, idType, idNumber, notes }
 */
export function validateTenant(input) {
  const errors = {}
  const value = {
    name: text(input.name),
    mobile: normalizeMobile(input.mobile),
    altMobile: input.altMobile ? normalizeMobile(input.altMobile) : '',
    emergencyName: text(input.emergencyName),
    emergencyRelation: text(input.emergencyRelation),
    emergencyMobile: input.emergencyMobile ? normalizeMobile(input.emergencyMobile) : '',
    members: count(input.members, { min: 1, max: 30 }),
    twoWheelers: count(input.twoWheelers ?? 0, { max: 20 }),
    fourWheelers: count(input.fourWheelers ?? 0, { max: 20 }),
    idType: input.idType,
    idNumber: String(input.idNumber ?? '').trim().toUpperCase().replace(/\s+/g, ' '),
    notes: String(input.notes ?? '').trim(),
  }
  if (!value.name) errors.name = 'Enter the tenant’s name.'
  else if (value.name.length > 80) errors.name = 'Name is too long (80 characters max).'
  if (!value.mobile) errors.mobile = 'Enter a valid 10-digit mobile number.'
  if (input.altMobile && !value.altMobile) errors.altMobile = 'Alternate number is not a valid mobile number.'
  if (input.emergencyMobile && !value.emergencyMobile) errors.emergencyMobile = 'Emergency number is not a valid mobile number.'
  if ((value.emergencyName || value.emergencyRelation) && !value.emergencyMobile) {
    errors.emergencyMobile = 'Add the emergency contact’s phone number.'
  }
  if (value.members === null) errors.members = 'Number of members must be between 1 and 30.'
  if (value.twoWheelers === null) errors.twoWheelers = 'Enter 0–20.'
  if (value.fourWheelers === null) errors.fourWheelers = 'Enter 0–20.'
  if (!ID_TYPES.some((t) => t.value === value.idType)) errors.idType = 'Choose the ID proof type.'
  if (!value.idNumber) errors.idNumber = 'Enter the ID number.'
  else if (value.idType === 'aadhaar' && !/^\d{4} ?\d{4} ?\d{4}$/.test(value.idNumber)) {
    errors.idNumber = 'Aadhaar number must be exactly 12 digits.'
  } else if (value.idType === 'pan' && !/^[A-Z]{5}\d{4}[A-Z]$/.test(value.idNumber)) {
    errors.idNumber = 'PAN must look like ABCDE1234F.'
  } else if (value.idNumber.length > 30) errors.idNumber = 'ID number is too long.'
  if (value.idType === 'aadhaar' && !errors.idNumber) value.idNumber = value.idNumber.replace(/\s/g, '')
  if (value.notes.length > 1000) errors.notes = 'Notes are too long (1000 characters max).'
  return { value, errors }
}

/**
 * The default "track rent from" date: the start of the rent period that contains `today`
 * (or the move-in date if the tenant moves in today or later).
 */
export function defaultTrackFrom(moveIn, today) {
  if (!ISO.test(moveIn ?? '')) return ''
  if (compareDates(moveIn, today) >= 0) return moveIn
  const periods = rentPeriods(moveIn, today)
  return periods[periods.length - 1].start
}

/**
 * Checks a new tenancy. Returns { value, errors }.
 * input: { flatId, moveIn, monthlyRent (rupees text), trackFrom, agreementStart, agreementEnd, notes }
 * flatTenancies: existing tenancies of the same flat (to stop overlaps).
 */
export function validateTenancy(input, flatTenancies = []) {
  const errors = {}
  const value = {
    flatId: input.flatId,
    moveIn: input.moveIn,
    trackFrom: input.trackFrom || input.moveIn,
    agreementStart: input.agreementStart || '',
    agreementEnd: input.agreementEnd || '',
    notes: String(input.notes ?? '').trim(),
    monthlyRent: null,
  }
  if (!value.flatId) errors.flatId = 'Choose the flat.'
  if (!ISO.test(value.moveIn ?? '')) errors.moveIn = 'Enter the move-in date.'
  try {
    value.monthlyRent = rupeesToPaise(input.monthlyRent)
    if (value.monthlyRent <= 0) errors.monthlyRent = 'Monthly rent must be more than zero.'
    else if (value.monthlyRent > 100_000_000) errors.monthlyRent = 'Monthly rent looks too high.'
  } catch {
    errors.monthlyRent = 'Enter the monthly rent in rupees, e.g. 12000.'
  }
  if (!errors.moveIn) {
    if (!ISO.test(value.trackFrom)) errors.trackFrom = 'Enter the date to start tracking rent from.'
    else if (compareDates(value.trackFrom, value.moveIn) < 0) errors.trackFrom = 'Rent tracking cannot start before move-in.'
    const active = flatTenancies.find((t) => !t.moveOut && !t.deleted)
    if (active) errors.flatId = 'This flat already has a tenant. Record their move-out first.'
    const later = flatTenancies.find((t) => t.moveOut && !t.deleted && compareDates(value.moveIn, t.moveOut) <= 0)
    if (!active && later) errors.moveIn = `Move-in must be after the previous tenant left (${later.moveOut}).`
  }
  if (value.agreementStart && !ISO.test(value.agreementStart)) errors.agreementStart = 'Invalid date.'
  if (value.agreementEnd && !ISO.test(value.agreementEnd)) errors.agreementEnd = 'Invalid date.'
  if (value.agreementStart && value.agreementEnd && compareDates(value.agreementEnd, value.agreementStart) < 0) {
    errors.agreementEnd = 'Agreement end is before its start.'
  }
  if (value.notes.length > 1000) errors.notes = 'Notes are too long (1000 characters max).'
  return { value, errors }
}

/** First rent period that will be tracked, for the form preview. */
export function trackingPreview(moveIn, trackFrom) {
  if (!ISO.test(moveIn ?? '') || !ISO.test(trackFrom ?? '')) return null
  return firstGeneratedPeriod({ moveIn, generateFrom: trackFrom })
}

/** 'none' | 'active' | 'expiring' (≤ 30 days left) | 'expired' for an agreement end date. */
export function agreementStatus(agreementEnd, today) {
  if (!agreementEnd) return 'none'
  if (compareDates(agreementEnd, today) < 0) return 'expired'
  if (compareDates(agreementEnd, addDays(today, 30)) <= 0) return 'expiring'
  return 'active'
}

/** Allowed upload types and size for ID proofs and agreements. */
export const UPLOAD_TYPES = ['image/jpeg', 'image/png', 'application/pdf']
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024

export function checkUpload(file) {
  if (!file) return 'Choose a file.'
  if (!UPLOAD_TYPES.includes(file.type)) return 'Only JPG, PNG photos or PDF files can be uploaded.'
  if (file.size > MAX_UPLOAD_BYTES) return 'The file is larger than 15 MB.'
  if (file.size === 0) return 'The file is empty.'
  return null
}

/**
 * Renewing an agreement (yearly): the current dates move into history and the new dates become
 * current. Returns { value: { agreementStart, agreementEnd, agreementHistory }, errors }.
 */
export function validateRenewal(tenancy, { start, end }) {
  const errors = {}
  if (!ISO.test(start ?? '')) errors.start = 'Enter the new start date.'
  if (!ISO.test(end ?? '')) errors.end = 'Enter the new end date.'
  if (!errors.start && !errors.end && compareDates(end, start) < 0) errors.end = 'The new agreement ends before it starts.'
  if (!errors.start && tenancy.agreementStart && compareDates(start, tenancy.agreementStart) <= 0) {
    errors.start = 'The new agreement must start after the current one started.'
  }
  const history = [...(tenancy.agreementHistory ?? [])]
  if (tenancy.agreementStart || tenancy.agreementEnd) {
    history.push({ start: tenancy.agreementStart ?? '', end: tenancy.agreementEnd ?? '' })
  }
  if (history.length > 50) errors.start = 'Too many earlier agreements recorded.'
  return { value: { agreementStart: start, agreementEnd: end, agreementHistory: history }, errors }
}
