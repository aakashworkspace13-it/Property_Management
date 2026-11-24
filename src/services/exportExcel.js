// Excel export for reports and the admin backup. Money is written in rupees as numbers
// (so Excel can add them up), with two decimals.

import writeExcelFile from 'write-excel-file/browser'

const MONEY_FORMAT = '#,##,##0' // whole rupees, Indian grouping (owner choice 2026-11-23)

function cell(value, type) {
  if (value === null || value === undefined || value === '') return null
  if (type === 'money') return { value: value / 100, type: Number, format: MONEY_FORMAT }
  if (type === 'number') return { value: Number(value), type: Number }
  return { value: String(value), type: String }
}

/** One sheet from a report table: title row, header row, data rows, totals row. */
function tableToSheet(table) {
  const header = table.columns.map((c) => ({ value: c.label, fontWeight: 'bold' }))
  const rows = table.rows.map((r) => table.columns.map((c) => cell(r[c.key], c.type)))
  const totals = table.totals
    ? [table.columns.map((c) => {
        const v = cell(table.totals[c.key], c.type)
        return v ? { ...v, fontWeight: 'bold' } : null
      })]
    : []
  return [[{ value: table.title, fontWeight: 'bold' }], header, ...rows, ...totals]
}

function sheetName(text, used) {
  let name = String(text).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31).trim() || 'Sheet'
  let n = 2
  while (used.has(name)) name = `${name.slice(0, 28)} ${n++}`
  used.add(name)
  return name
}

/** Downloads a report ({ title, tables }) as an .xlsx file, one sheet per table. */
export async function downloadReportExcel(report, fileName) {
  const used = new Set()
  const sheets = report.tables.map((t) => ({
    data: tableToSheet(t),
    sheet: sheetName(t.title, used),
    columns: t.columns.map((c) => ({ width: c.type === 'money' ? 16 : c.key === 'description' ? 36 : 22 })),
  }))
  await writeExcelFile(sheets).toFile(fileName)
}

/** Downloads raw records (backup): { sheetName: [ {..}, … ] } → one sheet per collection. */
export async function downloadRecordsExcel(collections, fileName) {
  const used = new Set()
  const sheets = Object.entries(collections).map(([name, records]) => {
    const keys = [...new Set(records.flatMap((r) => Object.keys(r)))].sort((a, b) => (a === 'id' ? -1 : b === 'id' ? 1 : a.localeCompare(b)))
    const asText = (v) => {
      if (v === null || v === undefined) return null
      if (typeof v === 'number' || typeof v === 'boolean') return { value: v }
      if (typeof v?.toDate === 'function') return { value: v.toDate().toISOString(), type: String }
      if (typeof v === 'object') return { value: JSON.stringify(v), type: String }
      return { value: String(v), type: String }
    }
    return {
      data: [keys.map((k) => ({ value: k, fontWeight: 'bold' })), ...records.map((r) => keys.map((k) => asText(r[k])))],
      sheet: sheetName(name, used),
    }
  })
  await writeExcelFile(sheets).toFile(fileName)
}
