// Shared-meter (submeter) electricity charges. Rules: docs/REQUIREMENTS.md section 7.
// Readings and rates are decimals typed by users ("160", "8.50"); arithmetic is exact (BigInt),
// so the preview shown on screen and the saved amount always agree (handoff concern #6).

import { MoneyRuleError } from './errors.js'
import { compareDates } from './dates.js'
import { assertPaise } from './money.js'

function parseDecimal(text, label) {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(String(text ?? '').trim())
  if (!m) throw new MoneyRuleError(`${label} must be a number that is zero or more.`)
  const fraction = m[2] ?? ''
  return { value: BigInt(m[1] + fraction), scale: fraction.length }
}

function align(a, b) {
  const scale = Math.max(a.scale, b.scale)
  return [a.value * 10n ** BigInt(scale - a.scale), b.value * 10n ** BigInt(scale - b.scale), scale]
}

function formatDecimal({ value, scale }) {
  const negative = value < 0n
  let digits = (negative ? -value : value).toString().padStart(scale + 1, '0')
  let text = scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}` : digits
  if (scale) text = text.replace(/0+$/, '').replace(/\.$/, '')
  return (negative ? '-' : '') + text
}

/** Rounds value / 10^scale half-up to an integer (value is non-negative). */
function roundToInteger({ value, scale }) {
  const divisor = 10n ** BigInt(scale)
  const quotient = value / divisor
  const remainder = value % divisor
  return Number(remainder * 2n >= divisor ? quotient + 1n : quotient)
}

/**
 * Calculates a submeter charge.
 *
 * input: {
 *   previous, current, rate        – decimal strings (units, units, rupees per unit)
 *   previousDate, readingDate      – the current reading date must be after the previous one
 *   resetUnits?, resetReason?      – required together when current < previous (meter reset)
 *   adjustment?                    – paise added to the calculation (may be negative)
 *   override?                      – paise replacing the calculation
 *   reason?                        – required with an adjustment or override
 * }
 * Returns { units, calculated, amount }: units as a decimal string, amounts in paise.
 * `calculated` is always kept so an override never hides the original calculation.
 */
export function submeterCharge(input) {
  const previous = parseDecimal(input.previous, 'Previous reading')
  const current = parseDecimal(input.current, 'Current reading')
  const rate = parseDecimal(input.rate, 'Rate')
  if (compareDates(input.readingDate, input.previousDate) <= 0) {
    throw new MoneyRuleError('The current reading date must be after the previous reading date.')
  }

  const [cur, prev, scale] = align(current, previous)
  let units = { value: cur - prev, scale }
  if (units.value < 0n) {
    if (!input.resetReason?.trim() || input.resetUnits === undefined || input.resetUnits === null || input.resetUnits === '') {
      throw new MoneyRuleError(
        'The current reading is lower than the previous one. Record a meter reset with a reason and the actual units used.',
      )
    }
    units = parseDecimal(input.resetUnits, 'Units used')
  }

  // units × rate × 100 paise, rounded half-up once at the end.
  const product = { value: units.value * rate.value * 100n, scale: units.scale + rate.scale }
  const adjustment = input.adjustment ?? 0
  assertPaise(adjustment, 'Adjustment')
  const calculated = roundToInteger(product) + adjustment
  const hasOverride = input.override !== undefined && input.override !== null
  if ((hasOverride || adjustment !== 0) && !input.reason?.trim()) {
    throw new MoneyRuleError('An adjustment or override needs a reason.')
  }
  const amount = hasOverride ? assertPaise(input.override, 'Override') : calculated
  if (amount < 0) throw new MoneyRuleError('The final bill cannot be negative.')
  return { units: formatDecimal(units), calculated, amount }
}
