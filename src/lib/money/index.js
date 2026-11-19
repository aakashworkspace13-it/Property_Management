// Money engine: pure functions for every money rule in docs/REQUIREMENTS.md section 6.
// No Firebase, no UI. Every rule here is covered by tests in this folder.

export { MoneyRuleError } from './errors.js'
export { assertPaise, divRoundHalfUp, formatINR, rupeesToPaise, sumPaise } from './money.js'
export {
  addDays,
  anniversary,
  assertDate,
  compareDates,
  daysInclusive,
  todayInKolkata,
} from './dates.js'
export {
  departureCharges,
  departurePreview,
  firstGeneratedPeriod,
  generateRentCharges,
  periodIsCovered,
  proratedRent,
  rentChargeId,
  rentPeriods,
} from './rent.js'
export { allocateAccount, chargeStatus, previewPayment, quickCollectAmount } from './allocation.js'
export { openingCharge } from './openings.js'
export { expenseShares, splitExpense } from './expenses.js'
export { expectedRentInRange, expenseTotals, openingBalances, profitSummary, receiptsInRange } from './reports.js'
export { submeterCharge } from './submeter.js'
