import { X } from 'lucide-react'

export function StatCard({ icon: Icon, label, value, sub, trend, accent = 'brand' }) {
  const accents = {
    brand: 'from-brand-500 to-brand-600',
    green: 'from-emerald-500 to-emerald-600',
    amber: 'from-amber-500 to-amber-600',
    rose: 'from-rose-500 to-rose-600',
  }
  return (
    <div className="card p-5 hover:shadow-glow transition-shadow duration-300 group">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">{label}</p>
          <p className="mt-2 text-2xl font-bold font-display text-ink-900">{value}</p>
          {sub && <p className="mt-1 text-xs text-ink-400">{sub}</p>}
        </div>
        <div className={`h-11 w-11 shrink-0 rounded-2xl bg-gradient-to-br ${accents[accent]} flex items-center justify-center shadow-glow group-hover:scale-105 transition-transform`}>
          <Icon className="h-5 w-5 text-white" strokeWidth={2.2} />
        </div>
      </div>
      {trend && (
        <div className="mt-3 flex items-center gap-1 text-xs font-medium">
          <span className={trend.direction === 'up' ? 'text-emerald-600' : 'text-rose-500'}>
            {trend.direction === 'up' ? '▲' : '▼'} {trend.value}
          </span>
          <span className="text-ink-400">{trend.label}</span>
        </div>
      )}
    </div>
  )
}

export function Badge({ status }) {
  const map = {
    paid: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    active: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    completed: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    verified: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    pending: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
    'in-progress': 'bg-brand-50 text-brand-700 ring-1 ring-brand-200',
    planned: 'bg-ink-100 text-ink-600 ring-1 ring-ink-200',
    inactive: 'bg-ink-100 text-ink-500 ring-1 ring-ink-200',
    overdue: 'bg-rose-50 text-rose-600 ring-1 ring-rose-200',
    rejected: 'bg-rose-50 text-rose-600 ring-1 ring-rose-200',
    cancelled: 'bg-rose-50 text-rose-600 ring-1 ring-rose-200',
    unverified: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  }
  const dot = {
    paid: 'bg-emerald-500', active: 'bg-emerald-500', completed: 'bg-emerald-500', verified: 'bg-emerald-500',
    pending: 'bg-amber-500', 'in-progress': 'bg-brand-500', planned: 'bg-ink-400', inactive: 'bg-ink-400',
    overdue: 'bg-rose-500', rejected: 'bg-rose-500', cancelled: 'bg-rose-500', unverified: 'bg-amber-500',
  }
  return (
    <span className={`badge ${map[status] || map.planned}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot[status] || dot.planned}`} />
      {status?.replace('-', ' ')}
    </span>
  )
}

export function PageHeader({ title, subtitle, action }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6 animate-fade-up">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function Modal({ open, onClose, title, children, wide, dismissible = true }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink-900/40 backdrop-blur-sm" onClick={dismissible ? onClose : undefined} />
      <div className={`relative w-full ${wide ? 'max-w-2xl' : 'max-w-md'} card p-6 animate-fade-up max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-ink-900">{title}</h3>
          {dismissible && (
            <button onClick={onClose} className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700 transition">
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  )
}

export function EmptyState({ icon: Icon, title, subtitle, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="h-14 w-14 rounded-2xl bg-brand-50 flex items-center justify-center mb-4">
        <Icon className="h-7 w-7 text-brand-500" />
      </div>
      <h3 className="text-base font-semibold text-ink-800">{title}</h3>
      {subtitle && <p className="mt-1 text-sm text-ink-400 max-w-sm">{subtitle}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function currency(n) {
  return new Intl.NumberFormat('en-ET', { style: 'currency', currency: 'ETB', maximumFractionDigits: 0 }).format(n || 0)
}

export function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}
