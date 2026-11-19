import { Link } from 'react-router'

export default function NotFoundPage() {
  return (
    <section className="page">
      <h1>Page not found</h1>
      <p>
        <Link to="/">Go to the dashboard</Link>
      </p>
    </section>
  )
}
