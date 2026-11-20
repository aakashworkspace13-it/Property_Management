import MembersSection from './MembersSection.jsx'
import ImportSection from './ImportSection.jsx'

export default function SettingsPage() {
  return (
    <section className="page">
      <h1>Settings</h1>
      <MembersSection />
      <ImportSection />
      <div className="card planned section">
        <p className="badge">Planned · later phases</p>
        <p>Expense categories (Phase 7) and app settings.</p>
      </div>
    </section>
  )
}
