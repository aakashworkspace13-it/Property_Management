import MembersSection from './MembersSection.jsx'

export default function SettingsPage() {
  return (
    <section className="page">
      <h1>Settings</h1>
      <MembersSection />
      <div className="card planned section">
        <p className="badge">Planned · later phases</p>
        <p>Expense categories (Phase 7) and app settings.</p>
      </div>
    </section>
  )
}
