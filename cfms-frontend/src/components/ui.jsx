import { useEffect, useState } from 'react'
import { X, AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

// ---------------------------------------------------------------------------
// In-app toast notifications — replaces native window.alert()/confirm()
// popups (which look like a browser chrome dialog, break the site's own
// look, and block the whole tab) with a small dismissible banner that stays
// inside the app. Call `notify('message', 'error' | 'success' | 'info')`
// from anywhere; <Toaster/> (mounted once in App.jsx) renders whatever is
// currently queued.
// ---------------------------------------------------------------------------
let toastId = 0
export function notify(message, type = 'error') {
  if (!message) return
  window.dispatchEvent(new CustomEvent('cfms:toast', { detail: { id: ++toastId, message, type } }))
}

const TOAST_STYLES = {
  error: { icon: AlertTriangle, cls: 'bg-rose-50 border-rose-200 text-rose-700' },
  success: { icon: CheckCircle2, cls: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
  info: { icon: Info, cls: 'bg-brand-50 border-brand-200 text-brand-700' },
}

export function Toaster() {
  const [toasts, setToasts] = useState([])

  useEffect(() => {
    function onToast(e) {
      const t = e.detail
      setToasts((prev) => [...prev, t])
      setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), 5000)
    }
    window.addEventListener('cfms:toast', onToast)
    return () => window.removeEventListener('cfms:toast', onToast)
  }, [])

  function dismiss(id) {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  if (toasts.length === 0) return null

  return (
    <div className="fixed z-[100] top-4 right-4 flex flex-col gap-2 w-full max-w-sm pointer-events-none">
      {toasts.map((t) => {
        const style = TOAST_STYLES[t.type] || TOAST_STYLES.error
        const Icon = style.icon
        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-2.5 rounded-xl border px-4 py-3 shadow-lg animate-fade-up ${style.cls}`}
          >
            <Icon className="h-4 w-4 mt-0.5 shrink-0" />
            <p className="text-sm font-medium flex-1">{t.message}</p>
            <button onClick={() => dismiss(t.id)} className="shrink-0 opacity-60 hover:opacity-100">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}

export function StatCard({ icon: Icon, label, value, sub, trend, accent = 'brand', to, onClick }) {
  const accents = {
    brand: 'from-brand-500 to-brand-600',
    green: 'from-emerald-500 to-emerald-600',
    amber: 'from-amber-500 to-amber-600',
    rose: 'from-rose-500 to-rose-600',
  }
  const navigate = useNavigate()
  const isInteractive = Boolean(to || onClick)
  const handleActivate = () => {
    if (onClick) onClick()
    else if (to) navigate(to)
  }
  return (
    <div
      className={`card p-5 hover:shadow-glow transition-shadow duration-300 group${isInteractive ? ' cursor-pointer hover:-translate-y-0.5 hover:ring-1 hover:ring-brand-200 transition-all' : ''}`}
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      onClick={isInteractive ? handleActivate : undefined}
      onKeyDown={isInteractive ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleActivate() } } : undefined}
    >
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
    pending: 'bg-amber-500', 'in-progress': 'bg-brand-500', planned: 'bg-ink-400', inactive: 'bg-rose-500',
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

export function ConfirmDialog({ open, title = 'Are you sure?', message, confirmLabel = 'Delete', cancelLabel = 'Cancel', danger = true, loading = false, error = '', onConfirm, onCancel }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink-900/40 backdrop-blur-sm" onClick={loading ? undefined : onCancel} />
      <div className="relative w-full max-w-sm card p-6 animate-fade-up">
        <h3 className="text-lg font-bold text-ink-900">{title}</h3>
        {message && <p className="mt-2 text-sm text-ink-500">{message}</p>}
        {error && (
          <p className="mt-3 text-sm text-rose-600 bg-rose-50 ring-1 ring-rose-100 rounded-lg px-3 py-2">{error}</p>
        )}
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-ink-600 hover:bg-ink-100 transition disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-50 ${danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-brand-600 hover:bg-brand-700'}`}
          >
            {loading ? 'Please wait…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// Shown in place of a page's content while its first data load is still in
// flight, so the user sees "this is loading" instead of a flash of empty
// tables/zeroed stats that then suddenly pop to real numbers a moment
// later. Only meant for the very first load — see AppLayout, which stops
// showing this once the first fetch (success or failure) has completed.
export function PageSkeleton() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading your data…">
      <div className="h-7 w-56 rounded-lg bg-ink-100 mb-2" />
      <div className="h-4 w-80 rounded-lg bg-ink-100 mb-6" />
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card p-5 h-24 bg-ink-50" />
        ))}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="card p-5 xl:col-span-2 h-64 bg-ink-50" />
        <div className="card p-5 h-64 bg-ink-50" />
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
