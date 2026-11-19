// Money helpers. All stored money is an integer number of paise (₹1 = 100 paise).
// Never store or compare rupee amounts as floating point.

import { MoneyRuleError } from './errors.js'

/** Throws unless `value` is a safe integer (a valid paise amount). */
export function assertPaise(value, label = 'Amount') {
  if (!Number.isSafeInteger(value)) {
    throw new MoneyRuleError(`${label} must be a whole number of paise.`)
  }
  return value
}

/**
 * Integer division rounded half-up (half away from zero), like Python's ROUND_HALF_UP.
 * Used for proration: divRoundHalfUp(monthlyRent * occupiedDays, periodDays).
 */
export function divRoundHalfUp(numerator, denominator) {
  assertPaise(numerator, 'Numerator')
  if (!Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new MoneyRuleError('Denominator must be a positive whole number.')
  }
  const sign = numerator < 0 ? -1 : 1
  const abs = Math.abs(numerator)
  let quotient = Math.floor(abs / denominator)
  const remainder = abs - quotient * denominator
  if (remainder * 2 >= denominator) quotient += 1
  return sign * quotient
}

/**
 * Converts a rupee amount typed by a user ("10,000", "4838.71", "₹ 1,23,456.5") to paise.
 * More than two decimal places are rounded half-up. Parsing is exact (no floating point).
 */
export function rupeesToPaise(input) {
  const text = String(input).replace(/[₹,\s]/g, '')
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text)
  if (!match) throw new MoneyRuleError(`"${input}" is not a valid rupee amount.`)
  const [, minus, whole, fraction = ''] = match
  const digits = (fraction + '000').slice(0, 3) // two paise digits + one rounding digit
  let paise = BigInt(whole) * 100n + BigInt(digits.slice(0, 2))
  const extra = fraction.slice(2)
  if (extra.length && Number(extra[0]) >= 5) paise += 1n
  const result = Number(minus ? -paise : paise)
  return assertPaise(result)
}

/** Formats paise as Indian rupees with Indian digit grouping, e.g. 12345678 → "₹1,23,456.78". */
export function formatINR(paise) {
  assertPaise(paise)
  const negative = paise < 0
  const abs = Math.abs(paise)
  const rupees = String(Math.floor(abs / 100))
  const fraction = String(abs % 100).padStart(2, '0')
  let grouped = rupees
  if (rupees.length > 3) {
    const last3 = rupees.slice(-3)
    const rest = rupees.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')
    grouped = `${rest},${last3}`
  }
  return `${negative ? '-' : ''}₹${grouped}.${fraction}`
}

/** Sum of paise amounts (exact for safe integers). */
export function sumPaise(values) {
  let total = 0
  for (const v of values) total += assertPaise(v)
  return assertPaise(total, 'Total')
}
