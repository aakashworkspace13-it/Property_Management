import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router'
import Layout from './Layout.jsx'
import NotFoundPage from './NotFoundPage.jsx'

// Each screen is loaded only when it is first opened, so the app starts faster on phones.
const DashboardPage = lazy(() => import('../features/dashboard/DashboardPage.jsx'))
const FlatsPage = lazy(() => import('../features/flats/FlatsPage.jsx'))
const FlatDetailPage = lazy(() => import('../features/flats/FlatDetailPage.jsx'))
const AddTenantPage = lazy(() => import('../features/tenants/AddTenantPage.jsx'))
const TenantPage = lazy(() => import('../features/tenants/TenantPage.jsx'))
const CollectionsPage = lazy(() => import('../features/collections/CollectionsPage.jsx'))
const LedgerPage = lazy(() => import('../features/collections/LedgerPage.jsx'))
const MonthlySheetPage = lazy(() => import('../features/collections/MonthlySheetPage.jsx'))
const ExpensesPage = lazy(() => import('../features/expenses/ExpensesPage.jsx'))
const ElectricityPage = lazy(() => import('../features/electricity/ElectricityPage.jsx'))
const DocumentsPage = lazy(() => import('../features/documents/DocumentsPage.jsx'))
const ReportsPage = lazy(() => import('../features/reports/ReportsPage.jsx'))
const SettingsPage = lazy(() => import('../features/settings/SettingsPage.jsx'))
const HistoryPage = lazy(() => import('../features/settings/HistoryPage.jsx'))
const MorePage = lazy(() => import('../features/more/MorePage.jsx'))

function page(Component) {
  return (
    <Suspense fallback={<p className="muted">Loading…</p>}>
      <Component />
    </Suspense>
  )
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={page(DashboardPage)} />
        <Route path="flats" element={page(FlatsPage)} />
        <Route path="flats/:code" element={page(FlatDetailPage)} />
        <Route path="flats/:code/add-tenant" element={page(AddTenantPage)} />
        <Route path="tenants/:id" element={page(TenantPage)} />
        <Route path="collections" element={page(CollectionsPage)} />
        <Route path="collections/monthly" element={page(MonthlySheetPage)} />
        <Route path="tenancies/:id" element={page(LedgerPage)} />
        <Route path="expenses" element={page(ExpensesPage)} />
        <Route path="electricity" element={page(ElectricityPage)} />
        <Route path="documents" element={page(DocumentsPage)} />
        <Route path="reports" element={page(ReportsPage)} />
        <Route path="settings" element={page(SettingsPage)} />
        <Route path="settings/history" element={page(HistoryPage)} />
        <Route path="more" element={page(MorePage)} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
