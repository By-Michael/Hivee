import { Calendar } from 'lucide-react'
import { useData } from '../../context/DataContext'
import { PageHeader, Badge, currency, formatDate } from '../../components/ui'

export default function ResidentProjects() {
  const { projects, funds } = useData()
  const fundOf = (id) => funds.find((f) => f.id === id)?.name || '—'

  return (
    <div>
      <PageHeader title="Community Projects" subtitle="See exactly where fund money is being invested." />
      <div className="grid sm:grid-cols-2 gap-4">
        {projects.map((p) => {
          const pct = p.budget ? Math.min(100, Math.round((p.spent / p.budget) * 100)) : 0
          return (
            <div key={p.id} className="card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-ink-800">{p.name}</p>
                  <p className="text-xs text-ink-400 mt-0.5">{fundOf(p.fundId)}</p>
                </div>
                <Badge status={p.status} />
              </div>
              <div className="mt-4">
                <div className="flex justify-between text-xs text-ink-500 mb-1.5">
                  <span>{currency(p.spent)} spent</span>
                  <span>{currency(p.budget)} budget</span>
                </div>
                <div className="h-2 rounded-full bg-ink-100 overflow-hidden">
                  <div className={`h-full rounded-full ${pct >= 95 ? 'bg-rose-500' : 'bg-brand-gradient'}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
              <div className="mt-4 flex items-center gap-1.5 text-xs text-ink-400">
                <Calendar className="h-3.5 w-3.5" /> {formatDate(p.startDate)} — {formatDate(p.endDate)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
