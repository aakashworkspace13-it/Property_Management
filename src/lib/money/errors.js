// Raised when an action would break one of the money rules in docs/REQUIREMENTS.md.
// The message is written for family users, so it can be shown in the UI as-is.
export class MoneyRuleError extends Error {
  constructor(message) {
    super(message)
    this.name = 'MoneyRuleError'
  }
}
