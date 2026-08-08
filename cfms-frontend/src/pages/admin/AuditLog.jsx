import { useEffect, useMemo, useState } from 'react'
import { ShieldCheck, Search, RefreshCw, Lock, FileSpreadsheet, FileText } from 'lucide-react'
import { useData } from '../../context/DataContext'
import { PageHeader, EmptyState } from '../../components/ui'
import { exportToExcel, exportToPdf } from '../../lib/exportUtils'

const ACTION_TONE = {
  CREATE: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  UPDATE: 'bg-brand-50 text-brand-700 ring-1 ring-brand-200',
  DELETE: 'bg-rose-50 text-rose-600 ring-1 ring-rose-200',
  VERIFY: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  REJECT: 'bg-rose-50 text-rose-600 ring-1 ring-rose-200',
}

function formatDateTime(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function AuditLog() {
  const { fetchAuditLogs } = useData()
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const data = await fetchAuditLogs()
      setLogs(data)
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Could not load the audit log.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    if (!q) return logs
    return logs.filter((l) => [l.actorName, l.action, l.entityType, l.description].join(' ').toLowerCase().includes(q))
  }, [logs, query])

  const logColumns = [
    { header: 'When', value: (l) => formatDateTime(l.createdAt), width: 20 },
    { header: 'Committee member', key: 'actorName', width: 24 },
    { header: 'Role', value: (l) => l.actorRole?.replace('_', ' ').toLowerCase() || '—', width: 16 },
    { header: 'Action', key: 'action', width: 12 },
    { header: 'Entity', key: 'entityType', width: 16 },
    { header: 'Details', key: 'description', width: 40 },
  ]

  const exportExcel = () => exportToExcel({
    filename: 'cfms-audit-log',
    sheetName: 'Audit log',
    meta: [
      { label: 'Report', value: 'System Audit Log' },
      { label: 'Generated', value: new Date().toLocaleString('en-GB') },
      { label: 'Search filter', value: query || 'none' },
      { label: 'Total entries', value: filtered.length },
    ],
    columns: logColumns,
    rows: filtered,
  })

  const exportPdf = () => exportToPdf({
    filename: 'cfms-audit-log',
    title: 'System Audit Log',
    subtitle: 'Every committee member\'s actions — read-only record',
    orientation: 'landscape',
    meta: [
      { label: 'Generated', value: new Date().toLocaleString('en-GB') },
      { label: 'Search filter', value: query || 'none' },
      { label: 'Total entries', value: filtered.length },
    ],
    columns: logColumns,
    rows: filtered,
  })

  return (
    <div>
      <PageHeader
        title="System audit"
        subtitle="Every committee member's actions — visible to the whole committee, cannot be edited or removed."
        action={
          <div className="flex flex-wrap gap-2">
            <button onClick={load} className="btn-secondary"><RefreshCw className="h-4 w-4" /> Refresh</button>
            <button onClick={exportExcel} className="btn-secondary" disabled={filtered.length === 0}><FileSpreadsheet className="h-4 w-4" /> Excel</button>
            <button onClick={exportPdf} className="btn-secondary" disabled={filtered.length === 0}><FileText className="h-4 w-4" /> PDF</button>
          </div>
        }
      />

      <div className="card p-4 mb-5 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by member, action, entity…" className="input pl-10" />
        </div>
        <div className="flex items-center gap-1.5 text-xs text-ink-400">
          <Lock className="h-3.5 w-3.5" /> Read-only — no edit or delete
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-xs text-rose-700 mb-4">{error}</div>
      )}

      <div className="card overflow-hidden">
        {loading ? (
          <p className="text-sm text-ink-400 py-12 text-center">Loading audit trail…</p>
        ) : filtered.length === 0 ? (
          <EmptyState icon={ShieldCheck} title="No activity yet" subtitle="Actions taken by committee members will show up here as they happen." />
        ) : (
          <div className="table-wrap !border-0">
            <table className="data-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Committee member</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l) => (
                  <tr key={l.id}>
                    <td className="whitespace-nowrap text-xs text-ink-500">{formatDateTime(l.createdAt)}</td>
                    <td>
                      <div className="font-medium text-ink-800">{l.actorName}</div>
                      <div className="text-xs text-ink-400 capitalize">{l.actorRole?.replace('_', ' ').toLowerCase()}</div>
                    </td>
                    <td>
                      <span className={`badge ${ACTION_TONE[l.action] || 'bg-ink-100 text-ink-600 ring-1 ring-ink-200'}`}>{l.action}</span>
                    </td>
                    <td className="text-sm text-ink-600">{l.entityType}</td>
                    <td className="text-sm text-ink-600">{l.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
