import { useState } from 'react'
import { formatINR, todayInKolkata } from '../../lib/money/index.js'
import { buildReport, REPORTS } from '../../lib/reportBuilders.js'
import { floorLabel, sortFlats } from '../../lib/property.js'
import { downloadReportExcel } from '../../services/exportExcel.js'
import { useCollectionData } from '../collections/useCollectionData.js'
import { useEnsureDueCharges } from '../collections/useEnsureDueCharges.js'
import { useElectricityData } from '../electricity/useElectricityData.js'
import { useExpenseData } from '../expenses/useExpenseData.js'
import { usePropertyData } from '../flats/usePropertyData.js'
import { useTenancyData } from '../tenants/useTenancyData.js'

function show(value, type) {
  if (value === null || value === undefined || value === '') return ''
  if (type === 'money') return formatINR(value)
  return String(value)
}

function ReportTable({ table }) {
  return (
    <section className="report-table">
      <h2>{table.title}</h2>
      {table.rows.length === 0 ? (
        <p className="muted">Nothing to show.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                {table.columns.map((c) => (
                  <th key={c.key} className={c.type === 'money' || c.type === 'number' ? 'num' : ''}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i}>
                  {table.columns.map((c) => (
                    <td key={c.key} className={c.type === 'money' || c.type === 'number' ? 'num' : ''}>
                      {show(r[c.key], c.type)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {table.totals && (
              <tfoot>
                <tr>
                  {table.columns.map((c) => (
                    <td key={c.key} className={c.type === 'money' || c.type === 'number' ? 'num' : ''}>
                      <strong>{show(table.totals[c.key], c.type)}</strong>
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </section>
  )
}

export default function ReportsPage() {
  const today = todayInKolkata()
  const thisYear = Number(today.slice(0, 4))
  const { buildings, flats, loading: pLoading } = usePropertyData()
  const { tenants, tenancies, loading: tLoading } = useTenancyData()
  const { charges, payments, loading: cLoading, error } = useCollectionData()
  const { bills, loading: eLoading } = useElectricityData()
  const { expenses, categories, loading: xLoading } = useExpenseData()
  const [key, setKey] = useState('rent')
  const [year, setYear] = useState(thisYear)
  const [filters, setFilters] = useState({ buildingId: '', flatId: '', tenantId: '' })
  const [exportError, setExportError] = useState(null)
  const ready = !(pLoading || tLoading || cLoading)
  useEnsureDueCharges(tenancies, charges, today, ready)

  if (error) return <p className="error">{error}</p>
  if (!ready || eLoading || xLoading) return <p className="muted">Loading…</p>

  const data = { buildings, flats, tenants, tenancies, charges, payments, bills, expenses, categories }
  const report = buildReport(key, data, { year, filters, today })
  const years = [...new Set([thisYear, ...tenancies.map((t) => Number(t.moveIn.slice(0, 4)))])].filter((y) => y <= thisYear).sort((a, b) => b - a)
  const flatOptions = sortFlats(flats.filter((f) => !filters.buildingId || f.buildingId === filters.buildingId))
  const tenantOptions = [...tenants].sort((a, b) => a.name.localeCompare(b.name))
  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value, ...(k === 'buildingId' ? { flatId: '' } : {}) }))
  const filterText = [
    filters.buildingId && buildings.find((b) => b.code === filters.buildingId)?.name,
    filters.flatId,
    filters.tenantId && tenants.find((t) => t.id === filters.tenantId)?.name,
  ]
    .filter(Boolean)
    .join(' · ')

  async function excel() {
    setExportError(null)
    try {
      await downloadReportExcel(report, `${report.title.replace(/[^\w ]+/g, '').replace(/\s+/g, '-')}.xlsx`)
    } catch (e) {
      setExportError(`Excel download failed: ${e.message}`)
    }
  }

  return (
    <section className="page report-page">
      <div className="page-header no-print">
        <h1>Reports</h1>
        <div className="form-actions">
          <button type="button" className="button" onClick={excel}>
            Excel
          </button>
          <button type="button" className="button" onClick={() => window.print()}>
            PDF
          </button>
        </div>
      </div>
      {exportError && <p className="error no-print">{exportError}</p>}

      <div className="segmented report-tabs no-print" role="tablist">
        {REPORTS.map((r) => (
          <button key={r.key} type="button" role="tab" aria-selected={key === r.key} className={key === r.key ? 'active' : ''} onClick={() => setKey(r.key)}>
            {r.label}
          </button>
        ))}
      </div>

      <div className="toolbar no-print">
        <label className="field">
          <span className="field-label small">Year</span>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label small">Building</span>
          <select value={filters.buildingId} onChange={set('buildingId')}>
            <option value="">All</option>
            {[...buildings].sort((a, b) => a.code.localeCompare(b.code)).map((b) => (
              <option key={b.code} value={b.code}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label small">Flat</span>
          <select value={filters.flatId} onChange={set('flatId')}>
            <option value="">All</option>
            {flatOptions.map((f) => (
              <option key={f.code} value={f.code}>
                {f.code} · {floorLabel(f.floor)} / {f.position}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label small">Tenant</span>
          <select value={filters.tenantId} onChange={set('tenantId')}>
            <option value="">All</option>
            {tenantOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="report-print">
        <h1 className="print-only">Property Manager · {report.title}</h1>
        <p className="muted small">
          {report.title} · figures up to {report.asOf}
          {filterText && ` · ${filterText}`}
        </p>
        {report.tables.map((t) => (
          <ReportTable key={t.title} table={t} />
        ))}
      </div>
    </section>
  )
}
