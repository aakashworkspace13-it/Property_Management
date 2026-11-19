// Opening balances for tenants who were already renting before the app.
// Rules: docs/REQUIREMENTS.md section 6.5. Openings are kept separate from generated rent and
// must never be double-counted.

import { MoneyRuleError } from './errors.js'
import { assertDate, compareDates } from './dates.js'
import { assertPaise } from './money.js'
import { periodIsCovered, rentChargeId } from './rent.js'

/**
 * Validates an opening balance and returns the charge to store.
 *
 * opening: { tenancyId, account: 'rent'|'electricity', amount, due, start?, end?, reason? }
 * existingCharges: every charge of the tenancy, including deleted ones.
 *
 * Known period (start + end): rejected if any period charge already covers those dates; a rent
 * opening uses the same ID as the generated period, so generation can never duplicate it.
 * Unknown period: needs a reason explaining the cutover (tenancy.generateFrom); one per account.
 */
export function openingCharge(opening, existingCharges = []) {
  const { tenancyId, account, amount, due, start, end, reason } = opening
  if (!['rent', 'electricity'].includes(account)) throw new MoneyRuleError('Choose rent or electricity.')
  assertPaise(amount, 'Opening balance')
  if (amount <= 0) throw new MoneyRuleError('An opening balance must be more than zero.')
  assertDate(due)
  if (Boolean(start) !== Boolean(end)) {
    throw new MoneyRuleError('Give both period dates, or leave both empty if they are unknown.')
  }
  const base = { tenancyId, account, source: 'opening', amount, due, reason: reason ?? '' }

  if (start) {
    assertDate(start)
    assertDate(end)
    if (compareDates(end, start) < 0) throw new MoneyRuleError('The opening period ends before it starts.')
    if (periodIsCovered(existingCharges, { tenancyId, account, start, end })) {
      throw new MoneyRuleError('These dates are already covered by another charge.')
    }
    const id = account === 'rent' ? rentChargeId(tenancyId, start) : `${tenancyId}_opening_electricity_${start}`
    if (existingCharges.some((c) => c.id === id)) throw new MoneyRuleError('An opening for this period already exists.')
    return { ...base, id, start, end }
  }

  if (!reason?.trim()) {
    throw new MoneyRuleError('An opening with unknown dates needs a note explaining what it covers.')
  }
  const id = `${tenancyId}_opening_${account}`
  if (existingCharges.some((c) => c.id === id)) {
    throw new MoneyRuleError('This tenancy already has an opening with unknown dates for this account.')
  }
  return { ...base, id, start: null, end: null }
}
