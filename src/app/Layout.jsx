import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import ErrorBoundary from '../components/ErrorBoundary.jsx'
import { sections } from './navigation.js'
import UserBox from './UserBox.jsx'

function navClass({ isActive }) {
  return isActive ? 'nav-link active' : 'nav-link'
}

// Fields that open the phone keyboard (not buttons, tick boxes, file pickers or dropdowns).
function opensKeyboard(el) {
  if (el?.tagName === 'TEXTAREA') return true
  if (el?.tagName !== 'INPUT') return false
  return !['button', 'checkbox', 'radio', 'file', 'submit', 'reset', 'range', 'color', 'date', 'month'].includes(el.type)
}

export default function Layout() {
  const location = useLocation()
  // Hide the phone bottom menu while the keyboard is open, so it does not cover the form.
  const [typing, setTyping] = useState(false)
  useEffect(() => {
    const onIn = (e) => setTyping(opensKeyboard(e.target))
    const onOut = () => setTimeout(() => setTyping(opensKeyboard(document.activeElement)), 50)
    document.addEventListener('focusin', onIn)
    document.addEventListener('focusout', onOut)
    return () => {
      document.removeEventListener('focusin', onIn)
      document.removeEventListener('focusout', onOut)
    }
  }, [])
  return (
    <div className={`shell${typing ? ' typing' : ''}`}>
      <aside className="sidebar" aria-label="Main navigation">
        <div className="brand">
          <img src="/favicon.svg" alt="" width="32" height="32" />
          <span>Property Manager</span>
        </div>
        <nav>
          {sections.map((s) => (
            <NavLink key={s.path} to={s.path} end={s.path === '/'} className={navClass}>
              <span className="nav-icon" aria-hidden="true">{s.icon}</span>
              {s.label}
            </NavLink>
          ))}
        </nav>
        <UserBox />
      </aside>

      <main className="content">
        <ErrorBoundary resetKey={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>

      <nav className="bottom-bar" aria-label="Main navigation">
        {sections
          .filter((s) => s.mobile)
          .map((s) => (
            <NavLink key={s.path} to={s.path} end={s.path === '/'} className={navClass}>
              <span className="nav-icon" aria-hidden="true">{s.icon}</span>
              {s.short}
            </NavLink>
          ))}
        <NavLink to="/more" className={navClass}>
          <span className="nav-icon" aria-hidden="true">⋯</span>
          More
        </NavLink>
      </nav>
    </div>
  )
}
