import { Route, Routes } from 'react-router'
import Layout from './Layout.jsx'
import NotFoundPage from './NotFoundPage.jsx'
import DashboardPage from '../features/dashboard/DashboardPage.jsx'
import FlatsPage from '../features/flats/FlatsPage.jsx'
import CollectionsPage from '../features/collections/CollectionsPage.jsx'
import ExpensesPage from '../features/expenses/ExpensesPage.jsx'
import DocumentsPage from '../features/documents/DocumentsPage.jsx'
import ReportsPage from '../features/reports/ReportsPage.jsx'
import SettingsPage from '../features/settings/SettingsPage.jsx'
import MorePage from '../features/more/MorePage.jsx'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="flats" element={<FlatsPage />} />
        <Route path="collections" element={<CollectionsPage />} />
        <Route path="expenses" element={<ExpensesPage />} />
        <Route path="documents" element={<DocumentsPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="more" element={<MorePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
