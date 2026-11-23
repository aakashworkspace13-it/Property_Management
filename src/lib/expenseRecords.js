// Expenses: validation, categories and totals. Pure functions on top of the money engine.
// Rules: docs/REQUIREMENTS.md section 6.4.

import { PAYMENT_METHODS } from './collections.js'
import { compareDates, expenseShares, rupeesToPaise } from './money/index.js'

export const STANDARD_CATEGORIES = ['Repairs', 'Paint', 'Bathroom fittings', 'Submersible/borewell', 'Maintenance', 'Tax', 'Other']

export const PAYERS = [
  { value: 'owner', label: 'Family (owner-paid)' },
  { value: 'tenant', label: 'Tenant-paid' },
]

const ISO = /^\d{4}-\d{2}-\d{2}$/

/**
 * Checks a new expense and works out its stored split.
 * input: { date, amount (rupees text), categoryId, buildingId, flatId ('' = whole building), payer,
 *          paymentMode, description, notes }
 * buildingFlatCodes: codes of ALL flats in the building right now (vacant and own-use included).
 * Returns { value, errors }; value.shares = { flatCode: paise } summing exactly to the amount.
 */
export function validateExpense(input, buildingFlatCodes = []) {
  const errors = {}
  const value = {
    date: input.date,
    amount: null,
    categoryId: input.categoryId,
    buildingId: input.buildingId,
    flatId: input.flatId || null,
    payer: input.payer,
    paymentMode: input.paymentMode,
    description: String(input.description ?? '').trim(),
    notes: String(input.notes ?? '').trim(),
    shares: null,
  }
  if (!ISO.test(value.date ?? '')) errors.date = 'Enter the date.'
  try {
    value.amount = rupeesToPaise(input.amount)
    if (value.amount <= 0) errors.amount = 'Amount must be more than zero.'
  } catch {
    errors.amount = 'Enter the amount in rupees.'
  }
  if (!value.categoryId) errors.categoryId = 'Choose a category.'
  if (!value.buildingId) errors.buildingId = 'Choose the building.'
  if (!['owner', 'tenant'].includes(value.payer)) errors.payer = 'Choose who paid.'
  if (!PAYMENT_METHODS.some((m) => m.value === value.paymentMode)) errors.paymentMode = 'Choose the payment mode.'
  if (!value.description) errors.description = 'Describe the expense (e.g. "Bathroom tap replaced").'
  else if (value.description.length > 200) errors.description = 'Keep the description under 200 characters.'
  if (value.notes.length > 500) errors.notes = 'Notes are too long.'
  if (value.flatId && !buildingFlatCodes.includes(value.flatId)) errors.flatId = 'That flat is not in this building.'
  if (!errors.amount && !errors.buildingId && !errors.flatId) {
    try {
      value.shares = expenseShares({ amount: value.amount, flatId: value.flatId }, buildingFlatCodes)
    } catch (e) {
      errors.flatId = e.message
    }
  }
  return { value, errors }
}

/**
 * Totals of expenses in [start, end] (by expense date), optionally for one building, flat or category.
 * With a flat filter, only that flat's stored share counts. Voided expenses are ignored.
 */
export function expenseSummary(expenses, start, end, { buildingId = '', flatId = '', categoryId = '' } = {}) {
  let owner = 0
  let tenant = 0
  let count = 0
  for (const x of expenses) {
    if (x.deleted) continue
    if (compareDates(x.date, start) < 0 || compareDates(x.date, end) > 0) continue
    if (buildingId && x.buildingId !== buildingId) continue
    if (categoryId && x.categoryId !== categoryId) continue
    const amount = flatId ? (x.shares?.[flatId] ?? 0) : x.amount
    if (!amount) continue
    count++
    if (x.payer === 'owner') owner += amount
    else tenant += amount
  }
  return { owner, tenant, total: owner + tenant, count }
}

/** Category name check for add/rename: unique (case-insensitive) among existing ones. */
export function validateCategoryName(name, categories, exceptId = null) {
  const clean = String(name ?? '').trim().replace(/\s+/g, ' ')
  if (!clean) return { error: 'Enter a name.' }
  if (clean.length > 40) return { error: 'Keep the name under 40 characters.' }
  if (categories.some((c) => c.id !== exceptId && c.name.toLowerCase() === clean.toLowerCase())) {
    return { error: 'A category with this name already exists.' }
  }
  return { name: clean }
}
