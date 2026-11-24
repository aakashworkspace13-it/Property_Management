import { useNavigate, useParams } from 'react-router'
import BackButton from '../../components/BackButton.jsx'
import { flatReference } from '../../lib/property.js'
import { usePropertyData } from '../flats/usePropertyData.js'
import AddTenantForm from './AddTenantForm.jsx'

// Add tenant page (also reachable from the flat page); the form itself is AddTenantForm.
export default function AddTenantPage() {
  const { code } = useParams()
  const navigate = useNavigate()
  const { buildings, flats, loading } = usePropertyData()
  if (loading) return <p className="muted">Loading…</p>
  const flat = flats.find((f) => f.code === code)
  if (!flat) return <p className="error">Flat {code} not found.</p>
  const building = buildings.find((b) => b.code === flat.buildingId)
  return (
    <section className="page narrow">
      <BackButton fallback={`/flats/${flat.code}`} />
      <h1>Add tenant</h1>
      <p className="muted small">
        New tenant of <strong>{flatReference(building, flat)}</strong>. Fields marked * are required.
      </p>
      <AddTenantForm flat={flat} onCancel={() => navigate(-1)} />
    </section>
  )
}
