// Business-date helpers. Business dates are plain ISO strings ("2025-01-31") in Asia/Kolkata.
// Arithmetic uses whole UTC days so time zones and daylight saving can never shift a date.

import { MoneyRuleError } from './errors.js'

const DAY_MS = 86_400_000
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/

function parts(date) {
  const m = ISO.exec(date ?? '')
  if (!m) throw new MoneyRuleError(`"${date}" is not a valid date (expected YYYY-MM-DD).`)
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) {
    throw new MoneyRuleError(`"${date}" is not a real calendar date.`)
  }
  return [y, mo, d]
}

function pad(n, width = 2) {
  return String(n).padStart(width, '0')
}

/** Throws unless `date` is a real YYYY-MM-DD calendar date; returns it unchanged. */
export function assertDate(date) {
  parts(date)
  return date
}

export function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Whole days since 1970-01-01. */
export function toDayNumber(date) {
  const [y, m, d] = parts(date)
  return Date.UTC(y, m - 1, d) / DAY_MS
}

export function fromDayNumber(dayNumber) {
  const dt = new Date(dayNumber * DAY_MS)
  return `${pad(dt.getUTCFullYear(), 4)}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}

export function addDays(date, days) {
  return fromDayNumber(toDayNumber(date) + days)
}

/** Number of days from `start` to `end`, counting both ends. */
export function daysInclusive(start, end) {
  return toDayNumber(end) - toDayNumber(start) + 1
}

export function minDate(a, b) {
  return toDayNumber(a) <= toDayNumber(b) ? a : b
}

export function maxDate(a, b) {
  return toDayNumber(a) >= toDayNumber(b) ? a : b
}

/** -1, 0 or 1. Validates both dates. */
export function compareDates(a, b) {
  return Math.sign(toDayNumber(a) - toDayNumber(b))
}

/**
 * The n-th monthly anniversary of `start`. A 29th/30th/31st anchor is clamped to the last
 * day of shorter months, but later months return to the original anchor day.
 * anniversary("2025-01-31", 1) → "2025-02-28"; anniversary("2025-01-31", 2) → "2025-03-31".
 */
export function anniversary(start, n) {
  const [y, m, d] = parts(start)
  const monthIndex = y * 12 + (m - 1) + n
  const year = Math.floor(monthIndex / 12)
  const month = (monthIndex % 12) + 1
  return `${pad(year, 4)}-${pad(month)}-${pad(Math.min(d, daysInMonth(year, month)))}`
}

/** Today's business date in Asia/Kolkata. Pass `now` for testing. */
export function todayInKolkata(now = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const get = (type) => p.find((x) => x.type === type).value
  return `${get('year')}-${get('month')}-${get('day')}`
}
