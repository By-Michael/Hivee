import { FileCheck2, CheckCircle2, CircleDashed } from 'lucide-react'
import { useData } from '../../context/DataContext'
import { PageHeader, formatDate } from '../../components/ui'

export default function ResidentReceipts() {
  const { receipts, expenses } = useData()
  const expenseOf = (id) => expenses.find((e) => e.id === id)

  return (
    <div>
      <PageHeader title="Receipts" subtitle="Verifiable proof behind every logged expense." />
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {receipts.map((r) => {
          const exp = expenseOf(r.expenseId)
          return (
            <div key={r.id} className="card p-5">
              <div className="h-10 w-10 rounded-xl bg-brand-50 flex items-center justify-center">
                <FileCheck2 className="h-5 w-5 text-brand-600" />
              </div>
              <p className="mt-3 font-medium text-ink-800 text-sm truncate">{r.fileName}</p>
              <p className="text-xs text-ink-400 mt-0.5">{exp?.description || 'Unlinked expense'}</p>
              <p className="text-xs text-ink-400">Uploaded {formatDate(r.uploadedAt)}</p>
              <div className={`mt-4 flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold ${r.verified ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'}`}>
                {r.verified ? <CheckCircle2 className="h-4 w-4" /> : <CircleDashed className="h-4 w-4" />}
                {r.verified ? 'Verified' : 'Pending verification'}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
