// Payment allocation for ONE tenancy and ONE account ('rent' or 'electricity').
// Rules: docs/REQUIREMENTS.md section 6.3.
//
// - Negative adjustments that name a target (`corrects` / `reverses`) reduce that charge first.
//   (Fixes handoff concern #1: a departure correction must not make older periods look paid.)
//   Any leftover, and untargeted negative adjustments, reduce the oldest remaining debt.
// - Payments are applied in date order. A payment with `manualAllocations` uses exactly those
//   amounts; otherwise it pays the oldest unpaid charge first.
// - Money left over after all charges stays visible as credit on that payment.
// - Never mixes accounts or tenancies: callers pass charges/payments of one tenancy + account.

import { MoneyRuleError } from './errors.js'
import { compareDates } from './dates.js'
import { assertPaise, sumPaise } from './money.js'

function byDueThenId(a, b) {
  return compareDates(a.due, b.due) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

function byDateThenId(a, b) {
  return compareDates(a.date, b.date) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

function checkScope(items, label) {
  const tenancies = new Set(items.map((x) => x.tenancyId))
  const accounts = new Set(items.map((x) => x.account))
  if (tenancies.size > 1) throw new MoneyRuleError(`${label} from different tenancies cannot be allocated together.`)
  if (accounts.size > 1) throw new MoneyRuleError(`${label} from rent and electricity cannot be allocated together.`)
}

/**
 * charges:  [{ id, tenancyId, account, amount, due, corrects?, reverses?, deleted? }]
 * payments: [{ id, tenancyId, account, amount, date, manualAllocations?: { [chargeId]: paise }, deleted? }]
 *
 * Returns {
 *   allocations: [{ paymentId, chargeId, amount }],
 *   charges:  [{ ...charge, adjusted, received, remaining }]   (positive charges, oldest first)
 *   payments: [{ ...payment, allocated, credit }]
 *   totals:   { charged, adjustments, received, outstanding, credit, adjustmentCredit, net }
 * }
 */
export function allocateAccount(charges, payments) {
  const liveCharges = charges.filter((c) => !c.deleted)
  const livePayments = payments.filter((p) => !p.deleted)
  checkScope([...liveCharges, ...livePayments], 'Charges and payments')

  const paymentIds = new Set()
  for (const p of livePayments) {
    assertPaise(p.amount, 'Payment')
    if (p.amount <= 0) throw new MoneyRuleError('A payment must be more than zero.')
    if (paymentIds.has(p.id)) throw new MoneyRuleError('The same payment was recorded twice.')
    paymentIds.add(p.id)
  }
  for (const c of liveCharges) assertPaise(c.amount, 'Charge')

  const positives = liveCharges.filter((c) => c.amount > 0).sort(byDueThenId)
  const negatives = liveCharges.filter((c) => c.amount < 0).sort(byDueThenId)
  const remaining = new Map(positives.map((c) => [c.id, c.amount]))
  const adjusted = new Map(positives.map((c) => [c.id, 0]))

  // 1. Negative adjustments: targeted first, then oldest debt.
  let pool = 0
  for (const n of negatives) {
    let left = -n.amount
    const target = n.corrects ?? n.reverses
    if (target && remaining.has(target)) {
      const used = Math.min(left, remaining.get(target))
      remaining.set(target, remaining.get(target) - used)
      adjusted.set(target, adjusted.get(target) + used)
      left -= used
    }
    pool += left
  }
  for (const c of positives) {
    if (pool === 0) break
    const used = Math.min(pool, remaining.get(c.id))
    remaining.set(c.id, remaining.get(c.id) - used)
    adjusted.set(c.id, adjusted.get(c.id) + used)
    pool -= used
  }

  // 2. Payments in date order.
  const allocations = []
  const paymentRows = []
  for (const p of [...livePayments].sort(byDateThenId)) {
    let left = p.amount
    const manual = p.manualAllocations && Object.keys(p.manualAllocations).length ? p.manualAllocations : null
    if (manual) {
      for (const [chargeId, value] of Object.entries(manual)) {
        if (!remaining.has(chargeId) || !Number.isSafeInteger(value) || value < 0 || value > remaining.get(chargeId) || value > left) {
          throw new MoneyRuleError('A manual allocation no longer fits the ledger. Clear or revise it first.')
        }
        if (value === 0) continue
        remaining.set(chargeId, remaining.get(chargeId) - value)
        left -= value
        allocations.push({ paymentId: p.id, chargeId, amount: value })
      }
    } else {
      for (const c of positives) {
        if (left === 0) break
        const value = Math.min(left, remaining.get(c.id))
        if (value === 0) continue
        remaining.set(c.id, remaining.get(c.id) - value)
        left -= value
        allocations.push({ paymentId: p.id, chargeId: c.id, amount: value })
      }
    }
    paymentRows.push({ ...p, allocated: p.amount - left, credit: left })
  }

  const chargeRows = positives.map((c) => ({
    ...c,
    adjusted: adjusted.get(c.id),
    received: sumPaise(allocations.filter((a) => a.chargeId === c.id).map((a) => a.amount)),
    remaining: remaining.get(c.id),
  }))
  const charged = sumPaise(positives.map((c) => c.amount))
  const adjustments = sumPaise(negatives.map((c) => c.amount))
  const received = sumPaise(livePayments.map((p) => p.amount))
  const outstanding = sumPaise(chargeRows.map((c) => c.remaining))
  const credit = sumPaise(paymentRows.map((p) => p.credit))
  return {
    allocations,
    charges: chargeRows,
    payments: paymentRows,
    totals: {
      charged,
      adjustments,
      received,
      outstanding, // gross unpaid debt
      credit, // unallocated payments
      adjustmentCredit: pool, // negative adjustments larger than all debt
      net: charged + adjustments - received, // positive = owed, negative = credit
    },
  }
}

/**
 * Status of one charge row from allocateAccount, as of `today` (Kolkata business date).
 * Returns { status: 'paid' | 'partial' | 'unpaid', overdue: boolean }.
 */
export function chargeStatus(row, today) {
  const status = row.remaining === 0 ? 'paid' : row.received > 0 ? 'partial' : 'unpaid'
  return { status, overdue: row.remaining > 0 && compareDates(row.due, today) < 0 }
}

/**
 * What a new payment would do, for the confirmation screen.
 * `displayedChargeId` is the period the user was looking at; `paysOlderFirst` warns when
 * the money goes (partly) to an older period instead.
 */
export function previewPayment(charges, payments, newPayment, displayedChargeId = null) {
  const result = allocateAccount(charges, [...payments, newPayment])
  const mine = result.allocations.filter((a) => a.paymentId === newPayment.id)
  const row = result.payments.find((p) => p.id === newPayment.id)
  return {
    allocations: mine,
    credit: row.credit,
    paysOlderFirst: displayedChargeId !== null && mine.some((a) => a.chargeId !== displayedChargeId),
    after: result,
  }
}

/**
 * Default amount for the "full rent received" quick action: the remaining amount of the
 * displayed period (never the whole tenancy balance).
 */
export function quickCollectAmount(charges, payments, displayedChargeId) {
  const row = allocateAccount(charges, payments).charges.find((c) => c.id === displayedChargeId)
  if (!row) throw new MoneyRuleError('That period was not found in this ledger.')
  return row.remaining
}
