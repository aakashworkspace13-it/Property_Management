import { NavLink, Outlet, useLocation } from 'react-router'
import ErrorBoundary from '../components/ErrorBoundary.jsx'
import { sections } from './navigation.js'
import UserBox from './UserBox.jsx'

function navClass({ isActive }) {
  return isActive ? 'nav-link active' : 'nav-link'
}

export default function Layout() {
  const location = useLocation()
  return (
    <div className="shell">
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
