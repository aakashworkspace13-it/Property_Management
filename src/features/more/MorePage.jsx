import { Link } from 'react-router'
import { moreSections } from '../../app/navigation.js'

export default function MorePage() {
  return (
    <section className="page">
      <h1>More</h1>
      <ul className="link-list">
        {moreSections.map((s) => (
          <li key={s.path}>
            <Link to={s.path}>
              <span className="nav-icon" aria-hidden="true">{s.icon}</span>
              {s.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
