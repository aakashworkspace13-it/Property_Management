// Rent periods, charge generation and departure proration.
// Rules: docs/REQUIREMENTS.md sections 6.1 and 6.2.

import { MoneyRuleError } from './errors.js'
import { addDays, anniversary, assertDate, compareDates, daysInclusive, minDate } from './dates.js'
import { assertPaise, divRoundHalfUp } from './money.js'

const MAX_PERIODS = 2400 // 200 years; guards against runaway loops on bad input

/** Deterministic ID for a rent period, so the same tenancy + period can never be created twice. */
export function rentChargeId(tenancyId, periodStart) {
  return `${tenancyId}_rent_${periodStart}`
}

/** Rent for part of a period: monthly × occupied ÷ period days, rounded half-up to the paisa. */
export function proratedRent(monthlyRent, occupiedDays, periodDays) {
  assertPaise(monthlyRent, 'Monthly rent')
  return divRoundHalfUp(monthlyRent * occupiedDays, periodDays)
}

/**
 * Anniversary rent periods from move-in, for every period starting on or before `through`
 * (and on or before `moveOut`, if given). The final period is cut at the move-out date.
 *
 * Each period: { index, start, end, fullEnd, periodDays, occupiedDays }
 *   end      – last occupied day (fullEnd, or the move-out date if earlier)
 *   fullEnd  – the day before the next anniversary
 */
export function rentPeriods(moveIn, through, moveOut = null) {
  assertDate(moveIn)
  assertDate(through)
  if (moveOut) assertDate(moveOut)
  const periods = []
  for (let n = 0; n < MAX_PERIODS; n++) {
    const start = anniversary(moveIn, n)
    if (compareDates(start, through) > 0) break
    if (moveOut && compareDates(start, moveOut) > 0) break
    const fullEnd = addDays(anniversary(moveIn, n + 1), -1)
    const end = moveOut ? minDate(fullEnd, moveOut) : fullEnd
    periods.push({
      index: n,
      start,
      end,
      fullEnd,
      periodDays: daysInclusive(start, fullEnd),
      occupiedDays: daysInclusive(start, end),
    })
  }
  return periods
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return compareDates(aStart, bEnd) <= 0 && compareDates(bStart, aEnd) <= 0
}

/**
 * True if a period-based (non-adjustment) charge in the same tenancy and account already covers
 * any day of [start, end]. Deleted charges count too, so a deleted period is never silently
 * regenerated.
 */
export function periodIsCovered(charges, { tenancyId, account, start, end }) {
  return charges.some(
    (c) =>
      c.tenancyId === tenancyId &&
      c.account === account &&
      c.source !== 'adjustment' &&
      c.start &&
      c.end &&
      overlaps(c.start, c.end, start, end),
  )
}

/**
 * New rent charges that are due through `through` and not yet issued.
 *
 * tenancy: { id, moveIn, moveOut?, monthlyRent, generateFrom? }
 * existingCharges: every charge of the tenancy, including deleted ones.
 *
 * Periods starting before `generateFrom` are skipped (they are covered by openings or history).
 * Issued charges keep their own `monthlyRent`, so later rent changes never alter them.
 */
export function generateRentCharges(tenancy, through, existingCharges = []) {
  assertPaise(tenancy.monthlyRent, 'Monthly rent')
  if (tenancy.monthlyRent <= 0) throw new MoneyRuleError('Monthly rent must be more than zero.')
  const generateFrom = tenancy.generateFrom ?? tenancy.moveIn
  const existingIds = new Set(existingCharges.map((c) => c.id))
  const created = []
  for (const p of rentPeriods(tenancy.moveIn, through, tenancy.moveOut)) {
    if (compareDates(p.start, generateFrom) < 0) continue
    const id = rentChargeId(tenancy.id, p.start)
    if (existingIds.has(id)) continue
    const span = { tenancyId: tenancy.id, account: 'rent', start: p.start, end: p.end }
    if (periodIsCovered(existingCharges, span) || periodIsCovered(created, span)) continue
    created.push({
      id,
      tenancyId: tenancy.id,
      account: 'rent',
      source: 'rent',
      amount: proratedRent(tenancy.monthlyRent, p.occupiedDays, p.periodDays),
      monthlyRent: tenancy.monthlyRent,
      due: p.start,
      start: p.start,
      end: p.end,
      periodDays: p.periodDays,
      occupiedDays: p.occupiedDays,
    })
  }
  return created
}

/** The first period that automatic generation will create, for the setup preview. */
export function firstGeneratedPeriod(tenancy) {
  const generateFrom = tenancy.generateFrom ?? tenancy.moveIn
  for (let n = 0; n < MAX_PERIODS; n++) {
    const start = anniversary(tenancy.moveIn, n)
    if (compareDates(start, generateFrom) >= 0) {
      const fullEnd = addDays(anniversary(tenancy.moveIn, n + 1), -1)
      return { start, end: fullEnd, periodDays: daysInclusive(start, fullEnd) }
    }
  }
  return null
}

/**
 * Preview of a departure, shown to the user before saving.
 *
 * charges: every charge of the tenancy (deleted ones are ignored here).
 * Returns the period containing the leaving day, the prorated final charge (leaving day
 * included, rounded half-up), the adjustment against the already-issued charge for that period,
 * and later periods that must be reversed.
 */
export function departurePreview(tenancy, leaveDate, charges = []) {
  assertDate(leaveDate)
  if (tenancy.moveOut) throw new MoneyRuleError('Departure is already recorded for this tenancy.')
  if (compareDates(leaveDate, tenancy.moveIn) < 0) {
    throw new MoneyRuleError('The leaving date cannot be before the move-in date.')
  }
  const live = charges.filter((c) => !c.deleted && c.tenancyId === tenancy.id && c.account === 'rent')
  const periods = rentPeriods(tenancy.moveIn, leaveDate, leaveDate)
  const period = periods[periods.length - 1]
  const issued = live.find((c) => ['rent', 'historical'].includes(c.source) && c.start === period.start)
  const monthlyRent = issued?.monthlyRent ?? tenancy.monthlyRent
  const finalCharge = proratedRent(monthlyRent, period.occupiedDays, period.periodDays)
  const later = live.filter(
    (c) => ['rent', 'historical'].includes(c.source) && compareDates(c.start, leaveDate) > 0,
  )
  const coveredByOpening =
    !issued &&
    live.some(
      (c) => c.source === 'opening' && c.start && c.end && overlaps(c.start, c.end, period.start, period.end),
    )
  return {
    leaveDate,
    periodStart: period.start,
    periodEnd: period.fullEnd,
    monthlyRent,
    occupiedDays: period.occupiedDays,
    periodDays: period.periodDays,
    finalCharge,
    issuedChargeId: issued?.id ?? null,
    issuedAmount: issued?.amount ?? null,
    adjustment: issued ? finalCharge - issued.amount : 0,
    futureReversals: later.map((c) => ({ chargeId: c.id, amount: -c.amount, due: c.due, start: c.start, end: c.end })),
    // An opening balance covers this period, so the app cannot know the original charge.
    // The family must review it and record any correction explicitly.
    needsManualReview: coveredByOpening,
  }
}

/**
 * Charges to save when a departure is confirmed: the explicit correction for the leaving period
 * and a reversal for every later period. Original charges are never edited.
 * After saving these and setting tenancy.moveOut, run generateRentCharges(…, leaveDate) to create
 * the prorated final period if it had not been issued yet.
 */
export function departureCharges(tenancy, preview) {
  const result = []
  if (preview.adjustment !== 0) {
    result.push({
      id: `${tenancy.id}_departure_${preview.leaveDate}`,
      tenancyId: tenancy.id,
      account: 'rent',
      source: 'adjustment',
      reason: 'Departure proration',
      amount: preview.adjustment,
      due: preview.leaveDate,
      start: preview.leaveDate,
      end: preview.leaveDate,
      corrects: preview.issuedChargeId,
      occupiedEnd: preview.leaveDate,
      correctedAmount: preview.finalCharge,
    })
  }
  for (const r of preview.futureReversals) {
    result.push({
      id: `${r.chargeId}_reversal`,
      tenancyId: tenancy.id,
      account: 'rent',
      source: 'adjustment',
      reason: 'Reverse period after departure',
      amount: r.amount,
      // Same dates as the reversed charge, so both cancel out in any as-of-date view.
      due: r.due,
      start: r.start,
      end: r.end,
      reverses: r.chargeId,
    })
  }
  return result
}
