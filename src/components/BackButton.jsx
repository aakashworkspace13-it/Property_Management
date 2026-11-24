import { useLocation, useNavigate } from 'react-router'

/**
 * "‹ Back" at the top of inner pages. Goes back to the previous screen of the app, or to
 * `fallback` when the page was opened directly (link, refresh). `mobileOnly` shows it only on
 * phones (for pages reached from the "More" menu, which the desktop sidebar lists anyway).
 */
export default function BackButton({ fallback = '/', label = 'Back', mobileOnly = false }) {
  const navigate = useNavigate()
  const location = useLocation()
  const hasHistory = location.key !== 'default'
  return (
    <button
      type="button"
      className={`back-button${mobileOnly ? ' mobile-only' : ''}`}
      onClick={() => (hasHistory ? navigate(-1) : navigate(fallback))}
    >
      ‹ {label}
    </button>
  )
}
