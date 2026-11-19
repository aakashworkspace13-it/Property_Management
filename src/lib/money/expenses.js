// Expense splitting. Rules: docs/REQUIREMENTS.md section 6.4.

import { MoneyRuleError } from './errors.js'
import { assertPaise } from './money.js'

/**
 * Splits a building-wide expense equally across ALL flats present at posting, including vacant
 * ones. Leftover paise go one each to the first flats in ID order, so shares always add up to
 * exactly the expense. Store the result with the expense; never recompute it when flats change.
 *
 * Returns { [flatId]: paise }.
 */
export function splitExpense(amount, flatIds) {
  assertPaise(amount, 'Expense')
  if (amount <= 0) throw new MoneyRuleError('An expense must be more than zero.')
  const ids = [...new Set(flatIds)].sort()
  if (ids.length === 0) throw new MoneyRuleError('Add the building’s flats before posting a building expense.')
  if (ids.length !== flatIds.length) throw new MoneyRuleError('A flat is listed twice.')
  const each = Math.floor(amount / ids.length)
  const extra = amount - each * ids.length
  return Object.fromEntries(ids.map((id, i) => [id, each + (i < extra ? 1 : 0)]))
}

/**
 * Shares for an expense: a flat-specific expense belongs wholly to its flat; a building expense
 * is split across `buildingFlatIds` (all flats in the building at posting time).
 */
export function expenseShares({ amount, flatId = null }, buildingFlatIds) {
  if (flatId) {
    assertPaise(amount, 'Expense')
    if (amount <= 0) throw new MoneyRuleError('An expense must be more than zero.')
    return { [flatId]: amount }
  }
  return splitExpense(amount, buildingFlatIds)
}
