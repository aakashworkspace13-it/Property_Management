import { useEffect, useState } from 'react'
import { watchCategories, watchExpenses } from '../../services/expenses.js'

/** Live expense categories and expenses. Each is null until first loaded. */
export function useExpenseData() {
  const [categories, setCategories] = useState(null)
  const [expenses, setExpenses] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    const onError = (e) => setError(e.code === 'permission-denied' ? 'You do not have access to expenses.' : e.message)
    const stops = [watchCategories(setCategories, onError), watchExpenses(setExpenses, onError)]
    return () => stops.forEach((stop) => stop())
  }, [])

  return { categories, expenses, error, loading: !categories || !expenses }
}
