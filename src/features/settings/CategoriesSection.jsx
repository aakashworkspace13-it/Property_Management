import { useState } from 'react'
import { useAuth } from '../auth/auth-context.js'
import { STANDARD_CATEGORIES, validateCategoryName } from '../../lib/expenseRecords.js'
import { addCategory, addStandardCategories, updateCategory } from '../../services/expenses.js'
import { useExpenseData } from '../expenses/useExpenseData.js'

// Expense categories: admins add, rename and archive them. Archived categories stay on old
// expenses but cannot be chosen for new ones.
export default function CategoriesSection() {
  const { user, isAdmin } = useAuth()
  const { categories } = useExpenseData()
  const [name, setName] = useState('')
  const [renaming, setRenaming] = useState(null) // { id, name }
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function run(action) {
    setBusy(true)
    setError(null)
    try {
      await action()
      return true
    } catch (e) {
      setError(e.code === 'permission-denied' ? 'Only admins can change categories.' : e.message)
      return false
    } finally {
      setBusy(false)
    }
  }

  async function add(event) {
    event.preventDefault()
    const check = validateCategoryName(name, categories ?? [])
    if (check.error) return setError(check.error)
    if (await run(() => addCategory(user, check.name))) setName('')
  }

  async function rename(category) {
    const check = validateCategoryName(renaming.name, categories, category.id)
    if (check.error) return setError(check.error)
    if (await run(() => updateCategory(user, category, { name: check.name }))) setRenaming(null)
  }

  const sorted = [...(categories ?? [])].sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name))
  const missingStandard = STANDARD_CATEGORIES.filter((n) => !(categories ?? []).some((c) => c.name.toLowerCase() === n.toLowerCase()))

  return (
    <section className="card section">
      <h2>Expense categories</h2>
      {categories === null ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          {sorted.length === 0 && <p className="muted">No categories yet.</p>}
          <ul className="member-list">
            {sorted.map((c) => (
              <li key={c.id} className={c.archived ? 'inactive' : ''}>
                {renaming?.id === c.id ? (
                  <span className="inline-actions">
                    <input value={renaming.name} maxLength={40} onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} />
                    <button type="button" className="button small-button primary" disabled={busy} onClick={() => rename(c)}>
                      Save
                    </button>
                    <button type="button" className="button small-button" onClick={() => setRenaming(null)}>
                      Cancel
                    </button>
                  </span>
                ) : (
                  <span className="member-main">
                    {c.name}
                    {c.archived && <span className="pill muted-pill">Archived</span>}
                  </span>
                )}
                {isAdmin && renaming?.id !== c.id && (
                  <div className="member-actions">
                    <button type="button" className="button small-button" onClick={() => setRenaming({ id: c.id, name: c.name })}>
                      Rename
                    </button>
                    <button type="button" className="button small-button" disabled={busy} onClick={() => run(() => updateCategory(user, c, { archived: !c.archived }))}>
                      {c.archived ? 'Unarchive' : 'Archive'}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {isAdmin && (
            <>
              {missingStandard.length > 0 && (
                <div className="form-actions">
                  <button type="button" className="button" disabled={busy} onClick={() => run(() => addStandardCategories(user, categories))}>
                    Add standard categories ({missingStandard.join(', ')})
                  </button>
                </div>
              )}
              <form className="form inline-form" onSubmit={add}>
                <label className="field">
                  <span className="field-label">New category</span>
                  <input maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Lift service" />
                </label>
                <div className="form-actions">
                  <button type="submit" className="button primary" disabled={busy}>
                    Add category
                  </button>
                </div>
              </form>
            </>
          )}
        </>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  )
}
