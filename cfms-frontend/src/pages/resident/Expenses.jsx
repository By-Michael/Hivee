import { useState } from 'react'
import { Paperclip, Eye, Download, CheckCircle2, CircleDashed } from 'lucide-react'
import { useData } from '../../context/DataContext'
import { PageHeader, Modal, currency, formatDate } from '../../components/ui'
import { fileUrl } from '../../lib/api'

export default function ResidentExpenses() {
  const { expenses, projects, receipts } = useData()
  const [detail, setDetail] = useState(null)
  const [viewing, setViewing] = useState(false)
  const projectOf = (id) => projects.find((p) => p.id === id)?.name || '—'
  const receiptOf = (id) => receipts.find((r) => r.id === id)

  function open(e) {
    setDetail(e)
    setViewing(false)
  }

  const rc = detail ? receiptOf(detail.receiptId) : null
  const url = rc ? fileUrl(rc.fileUrl) : null
  const isPdf = url?.toLowerCase().endsWith('.pdf')

  return (
    <div>
      <PageHeader title="Expenses" subtitle="Every expense your committee has logged. Tap a row for the receipt." />
      <div className="card overflow-hidden">
        <div className="table-wrap !border-0">
          <table className="data-table">
            <thead><tr><th>Description</th><th>Project</th><th>Vendor</th><th>Amount</th><th>Date</th><th>Receipt</th></tr></thead>
            <tbody>
              {expenses.map((e) => {
                const r = receiptOf(e.receiptId)
                return (
                  <tr key={e.id} className="cursor-pointer" onClick={() => open(e)}>
                    <td className="font-medium text-ink-800">{e.description}</td>
                    <td>{projectOf(e.projectId)}</td>
                    <td>{e.vendor}</td>
                    <td className="font-semibold">{currency(e.amount)}</td>
                    <td>{formatDate(e.date)}</td>
                    <td>
                      {r ? (
                        <span className="badge bg-brand-50 text-brand-700 ring-1 ring-brand-200"><Paperclip className="h-3 w-3" /> Attached</span>
                      ) : (
                        <span className="badge bg-ink-100 text-ink-500">None</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.description || 'Expense'}>
        {detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-ink-400 text-xs uppercase font-semibold">Project</p><p className="text-ink-800">{projectOf(detail.projectId)}</p></div>
              <div><p className="text-ink-400 text-xs uppercase font-semibold">Vendor</p><p className="text-ink-800">{detail.vendor}</p></div>
              <div><p className="text-ink-400 text-xs uppercase font-semibold">Amount</p><p className="text-ink-800 font-semibold">{currency(detail.amount)}</p></div>
              <div><p className="text-ink-400 text-xs uppercase font-semibold">Date</p><p className="text-ink-800">{formatDate(detail.date)}</p></div>
            </div>
            <div className="border-t border-ink-100 pt-4">
              <p className="text-xs uppercase font-semibold text-ink-400 mb-2">Receipt</p>
              {rc ? (
                <div>
                  {viewing && (
                    <div className="mb-3 rounded-xl border border-ink-100 overflow-hidden bg-ink-50">
                      {isPdf ? <iframe src={url} title="Receipt" className="w-full h-72" /> : <img src={url} alt="Receipt" className="w-full max-h-96 object-contain" />}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => setViewing((v) => !v)} className="btn-secondary"><Eye className="h-4 w-4" /> {viewing ? 'Hide' : 'Live view'}</button>
                    <a href={url} download className="btn-secondary"><Download className="h-4 w-4" /> Download</a>
                    <span className={`badge ${rc.verified ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'}`}>
                      {rc.verified ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CircleDashed className="h-3.5 w-3.5" />}
                      {rc.verified ? 'Verified' : 'Pending verification'}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-ink-400">No receipt attached yet.</p>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
