// Report calculations. Rules: docs/REQUIREMENTS.md sections 6.4, 6.5 and 10.
//
// Bases:
// - Expected rent is spread over the days each charge covers, so a period crossing
//   31 December is split between years exactly to the paisa. Openings are excluded.
// - Receipts are counted by payment date; expenses by expense date.

import { compareDates, daysInclusive, maxDate, minDate, toDayNumber } from './dates.js'
import { sumPaise } from './money.js'

function inRange(date, start, end) {
  return compareDates(date, start) >= 0 && compareDates(date, end) <= 0
}

/**
 * Expected rent within [start, end] from issued rent charges.
 * Departure corrections are folded into the period they correct (its amount becomes the
 * corrected amount and it ends on the leaving day); reversed periods and their reversals
 * are dropped. Paise that do not divide evenly go to the earliest days.
 */
export function expectedRentInRange(charges, start, end) {
  const live = charges.filter((c) => !c.deleted && c.account === 'rent' && c.source !== 'opening')
  const corrections = new Map(live.filter((c) => c.corrects).map((c) => [c.corrects, c]))
  const reversed = new Set(live.filter((c) => c.reverses).map((c) => c.reverses))
  let total = 0
  for (const original of live) {
    if (original.corrects || original.reverses || reversed.has(original.id)) continue
    if (!original.start || !original.end) continue
    let { amount, end: chargeEnd } = original
    const correction = corrections.get(original.id)
    if (correction) {
      amount = correction.correctedAmount
      chargeEnd = correction.occupiedEnd
    }
    const days = daysInclusive(original.start, chargeEnd)
    const lo = maxDate(start, original.start)
    const hi = minDate(end, chargeEnd)
    if (compareDates(hi, lo) < 0) continue
    const each = Math.floor(amount / days)
    const extra = amount - each * days
    const firstDay = toDayNumber(lo) - toDayNumber(original.start) // 0-based index of lo
    const lastDay = toDayNumber(hi) - toDayNumber(original.start)
    const extraDays = Math.max(0, Math.min(lastDay + 1, extra) - firstDay)
    total += each * (lastDay - firstDay + 1) + extraDays
  }
  return total
}

/** Sum of payments in [start, end] by payment date for one account. */
export function receiptsInRange(payments, account, start, end) {
  return sumPaise(
    payments.filter((p) => !p.deleted && p.account === account && inRange(p.date, start, end)).map((p) => p.amount),
  )
}

/**
 * Expense totals in [start, end] by expense date.
 * With `flatId`, each expense counts only that flat's stored share (direct costs plus its share
 * of building expenses). Without it, each expense counts once in full — never once plus shares.
 */
export function expenseTotals(expenses, start, end, flatId = null) {
  let owner = 0
  let tenant = 0
  for (const x of expenses) {
    if (x.deleted || !inRange(x.date, start, end)) continue
    const amount = flatId ? (x.shares?.[flatId] ?? 0) : x.amount
    if (x.payer === 'owner') owner += amount
    else if (x.payer === 'tenant') tenant += amount
  }
  return { owner, tenant, total: owner + tenant }
}

/**
 * The owner's two headline figures.
 * Primary profit = rent received − owner-paid expenses − tenant-paid expenses (owner's formula).
 * Owner cash surplus = rent received + owner electricity collections − owner-paid expenses.
 */
export function profitSummary({ rentReceived, electricityCollections = 0, ownerPaidExpenses, tenantPaidExpenses }) {
  return {
    primaryProfit: rentReceived - ownerPaidExpenses - tenantPaidExpenses,
    ownerCashSurplus: rentReceived + electricityCollections - ownerPaidExpenses,
  }
}

/** Opening balances due on or before `end`, kept separate from expected rent. */
export function openingBalances(charges, end) {
  const result = { rent: 0, electricity: 0 }
  for (const c of charges) {
    if (c.deleted || c.source !== 'opening' || compareDates(c.due, end) > 0) continue
    result[c.account] += c.amount
  }
  return result
}
