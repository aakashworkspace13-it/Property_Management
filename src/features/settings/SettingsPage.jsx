import MembersSection from './MembersSection.jsx'
import ImportSection from './ImportSection.jsx'
import ElectricityRateSection from './ElectricityRateSection.jsx'
import CategoriesSection from './CategoriesSection.jsx'
import PushSection from './PushSection.jsx'
import BackupSection from './BackupSection.jsx'

export default function SettingsPage() {
  return (
    <section className="page">
      <h1>Settings</h1>
      <PushSection />
      <MembersSection />
      <ElectricityRateSection />
      <CategoriesSection />
      <ImportSection />
      <BackupSection />
      <div className="card planned section">
        <p className="badge">Planned · later phases</p>
        <p>More app settings in later phases.</p>
      </div>
    </section>
  )
}
