// Placeholder for a section that is not built yet. Shows what is planned and in which phase.
export default function PlannedPage({ title, phase, children }) {
  return (
    <section className="page">
      <h1>{title}</h1>
      <div className="card planned">
        <p className="badge">Planned · Phase {phase}</p>
        {children}
      </div>
    </section>
  )
}
