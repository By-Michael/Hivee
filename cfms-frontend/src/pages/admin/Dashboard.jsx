import { useMemo, useState } from 'react'
import { Wallet, Landmark, FolderKanban, Users, ArrowUpRight, Clock, Receipt, ShieldCheck, Check, X } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid, BarChart, Bar } from 'recharts'
import { useData } from '../../context/DataContext'
import { useAuth } from '../../context/AuthContext'
import { StatCard, Badge, PageHeader, Modal, currency, formatDate, notify } from '../../components/ui'

const CHANGE_TYPE_LABELS = { COMMUNITY_PAYMENT_DETAILS: 'community payment account details', PROJECT_BUDGET: 'a project budget' }
const DIFF_FIELD_LABELS = { paymentBankName: 'Bank name', paymentAccountName: 'Account holder', paymentAccountNumber: 'Account number', budget: 'Budget' }

function describeDiff(diff) {
  return Object.entries(diff || {}).map(([field, { from, to }]) => (
    { field: DIFF_FIELD_LABELS[field] || field, from: from || '(empty)', to: to || '(empty)' }
  ))
}

// Time-remaining pill for the 24h auto-reject window — recomputed on each
// render rather than a ticking timer, since being off by a few seconds
// doesn't matter here and it avoids a re-render loop on the dashboard.
function timeLeftLabel(expiresAt) {
  const ms = new Date(expiresAt).getTime() - Date.now()
  if (ms <= 0) return 'expiring…'
  const hours = Math.floor(ms / 3600000)
  const mins = Math.floor((ms % 3600000) / 60000)
  if (hours > 0) return `${hours}h ${mins}m left`
  return `${mins}m left`
}

// Dashboard-slot widget: when the current committee member has a sensitive
// change awaiting their approval, it temporarily replaces the "Community
// snapshot" card in this exact grid position. Reverts to the normal
// snapshot card automatically once resolved (approved/rejected/expired) —
// no separate "dismiss" state to manage, it just reflects pendingChanges.
function PendingChangeSlot({ pendingChange, onDecide }) {
  const [confirmDecision, setConfirmDecision] = useState(null) // 'APPROVED' | 'REJECTED' | null
  const [submitting, setSubmitting] = useState(false)
  const rows = describeDiff(pendingChange.diff)

  async function submit() {
    setSubmitting(true)
    try {
      await onDecide(pendingChange.id, confirmDecision)
      setConfirmDecision(null)
    } catch (err) {
      notify(err?.response?.data?.message || err.message || 'Could not submit your response.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="card p-5 animate-fade-up border-2 border-amber-200 bg-amber-50/40">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck className="h-4.5 w-4.5 text-amber-600 shrink-0" />
        <h3 className="font-semibold text-ink-800">Committee approval needed</h3>
      </div>
      <p className="text-xs text-amber-700 font-medium mb-3">{timeLeftLabel(pendingChange.expiresAt)} to respond, or this auto-rejects.</p>

      <p className="text-sm text-ink-600 mb-3">
        <strong className="text-ink-800">{pendingChange.proposedBy?.fullName}</strong> proposed a change to{' '}
        <strong className="text-ink-800">{CHANGE_TYPE_LABELS[pendingChange.changeType] || pendingChange.changeType}</strong>:
      </p>

      <div className="rounded-xl border border-amber-100 bg-white divide-y divide-amber-50 mb-4">
        {rows.map((r) => (
          <div key={r.field} className="px-3.5 py-2.5 text-xs">
            <p className="font-semibold text-ink-700 mb-0.5">{r.field}</p>
            <p className="text-ink-400">
              <span className="line-through">{r.from}</span> <ArrowUpRight className="inline h-3 w-3 -rotate-45" /> <span className="text-ink-700 font-medium">{r.to}</span>
            </p>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <button onClick={() => setConfirmDecision('APPROVED')} className="btn-primary flex-1 !py-2 text-sm">
          <Check className="h-4 w-4" /> Confirm
        </button>
        <button onClick={() => setConfirmDecision('REJECTED')} className="btn-secondary flex-1 !py-2 text-sm">
          <X className="h-4 w-4" /> Reject
        </button>
      </div>

      <Modal open={!!confirmDecision} onClose={() => setConfirmDecision(null)} title={confirmDecision === 'REJECTED' ? 'Reject this change?' : 'Confirm this change?'}>
        <div className="space-y-4">
          <p className="text-sm text-ink-500">
            {confirmDecision === 'APPROVED' ? (
              <>Are you sure you want to <strong className="text-ink-800">confirm</strong> this change? If every other committee member also confirms, it takes effect immediately.</>
            ) : (
              <>Are you sure you want to <strong className="text-ink-800">reject</strong> this change? This cancels the request immediately for everyone.</>
            )}
          </p>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setConfirmDecision(null)} className="btn-secondary flex-1">Go back</button>
            <button type="button" disabled={submitting} onClick={submit} className="btn-primary flex-1">
              {submitting ? 'Submitting…' : confirmDecision === 'REJECTED' ? 'Yes, reject' : 'Yes, confirm'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

const COLORS = ['#1554d6', '#2570f5', '#5aa4ff', '#a9caff']

// Builds a real 6-month time series (this month + the 5 before it) from the
// community's actual payment and expense records — no sample data.
function buildMonthlySeries(payments, expenses) {
  const now = new Date()
  const months = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, month: d.toLocaleDateString('en-US', { month: 'short' }), collected: 0, expenses: 0 })
  }
  const bucketFor = (dateStr) => {
    if (!dateStr) return undefined
    const d = new Date(dateStr)
    return months.find((m) => m.key === `${d.getFullYear()}-${d.getMonth()}`)
  }
  payments.filter((p) => p.status === 'paid').forEach((p) => {
    const b = bucketFor(p.date)
    if (b) b.collected += p.amount
  })
  expenses.forEach((e) => {
    const b = bucketFor(e.date)
    if (b) b.expenses += e.amount
  })
  return months
}

export default function AdminDashboard() {
  const { residents, payments, funds, projects, fees, expenses, pendingChanges, respondToPendingChange } = useData()
  const { user } = useAuth()
  // Only ever show one at a time in the slot — the oldest awaiting this
  // admin's approval — so the widget doesn't need to become a list/carousel.
  const slotPendingChange = (pendingChanges?.asApprover || [])[0] || null

  const totalBalance = funds.reduce((s, f) => s + f.balance, 0)
  const paidThisPeriod = payments.filter((p) => p.status === 'paid').reduce((s, p) => s + p.amount, 0)
  const pendingOnlyCount = payments.filter((p) => p.status === 'pending').length
  const overdueOnlyCount = payments.filter((p) => p.status === 'overdue').length
  const pendingCount = pendingOnlyCount + overdueOnlyCount
  const activeProjects = projects.filter((p) => p.status === 'in-progress').length

  const monthly = useMemo(() => buildMonthlySeries(payments, expenses), [payments, expenses])
  const collectedTrend = useMemo(() => {
    const last = monthly[monthly.length - 1]
    const prev = monthly[monthly.length - 2]
    if (!prev || prev.collected <= 0) return null
    const pct = Math.round(((last.collected - prev.collected) / prev.collected) * 100)
    return { direction: pct >= 0 ? 'up' : 'down', value: `${Math.abs(pct)}%`, label: 'vs last month' }
  }, [monthly])

  const fundSplit = funds.map((f) => ({ name: f.name.replace(' Fund', ''), value: f.balance }))
  // Recharts' Pie can't render negative slice values — if a fund is in
  // deficit (spent > verified collected, which is common for young/active
  // funds), a signed value would silently collapse the whole donut to
  // nothing even though the legend below still lists every fund. We chart
  // the magnitude of each balance (so the donut always reflects relative
  // size) while the legend/tooltip continue to show the true signed amount.
  const fundChartData = fundSplit.map((f) => ({ ...f, magnitude: Math.abs(f.value) }))
  const hasAnyDeficit = fundSplit.some((f) => f.value < 0)
  const fundChartTotal = fundChartData.reduce((s, f) => s + f.magnitude, 0)
  const recentPayments = [...payments].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 6)

  const residentOf = (id) => residents.find((r) => r.id === id)?.name || '—'
  const feeOf = (id) => fees.find((f) => f.id === id)?.name || '—'

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${user?.name?.split(' ')[0]}`}
        subtitle={`Here's what's happening across ${user?.community} today.`}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <StatCard
          icon={Landmark}
          label="Total fund balance"
          value={currency(totalBalance)}
          sub={`Across ${funds.length} fund${funds.length === 1 ? '' : 's'}`}
          accent="brand"
          to="/admin/funds"
        />
        <StatCard
          icon={Wallet}
          label="Collected this month"
          value={currency(paidThisPeriod)}
          sub={`${payments.filter(p=>p.status==='paid').length} payments recorded`}
          accent="green"
          trend={collectedTrend}
          to="/admin/payments"
        />
        <StatCard
          icon={Clock}
          label="Pending / overdue"
          value={pendingCount}
          sub={`${pendingOnlyCount} awaiting payment, ${overdueOnlyCount} past due`}
          accent="amber"
          to="/admin/payments"
        />
        <StatCard
          icon={FolderKanban}
          label="Active projects"
          value={activeProjects}
          sub={`${projects.length} total projects`}
          accent="rose"
          to="/admin/projects"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mb-6">
        <div className="card p-5 xl:col-span-2 animate-fade-up">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-semibold text-ink-800">Collections vs. Expenses</h3>
            <span className="badge bg-brand-50 text-brand-700 ring-1 ring-brand-200">Last 6 months</span>
          </div>
          <p className="text-xs text-ink-400 mb-4">Monthly totals across all fee categories</p>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={monthly} margin={{ left: -14, right: 8 }}>
              <defs>
                <linearGradient id="collected" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2570f5" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#2570f5" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="expenses" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef1f8" />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: '#8790b3', fontSize: 12 }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fill: '#8790b3', fontSize: 12 }} tickFormatter={(v) => `${v / 1000}k`} />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: '1px solid #eef1f8', boxShadow: '0 8px 24px -8px rgba(16,30,66,0.15)' }}
                formatter={(v) => currency(v)}
              />
              <Area type="monotone" dataKey="collected" stroke="#1554d6" strokeWidth={2.5} fill="url(#collected)" name="Collected" />
              <Area type="monotone" dataKey="expenses" stroke="#f59e0b" strokeWidth={2.5} fill="url(#expenses)" name="Expenses" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5 animate-fade-up">
          <h3 className="font-semibold text-ink-800 mb-1">Fund Distribution</h3>
          <p className="text-xs text-ink-400 mb-2">
            {hasAnyDeficit ? 'Relative size by fund — some funds are running a deficit' : 'Balance share by fund'}
          </p>
          {fundChartTotal > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={190}>
                <PieChart>
                  <Pie
                    data={fundChartData}
                    dataKey="magnitude"
                    nameKey="name"
                    innerRadius={56}
                    outerRadius={78}
                    paddingAngle={3}
                    cornerRadius={7}
                    stroke="none"
                    startAngle={90}
                    endAngle={-270}
                    isAnimationActive
                    animationDuration={700}
                    animationEasing="ease-out"
                  >
                    {fundChartData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} style={{ filter: 'drop-shadow(0 2px 6px rgba(16,30,66,0.18))' }} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(_, __, item) => currency(item?.payload?.value ?? 0)} contentStyle={{ borderRadius: 12, border: '1px solid #eef1f8' }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-1 max-h-64 overflow-y-auto pr-1">
                {fundSplit.map((f, i) => (
                  <div key={f.name} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 text-ink-500">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                      {f.name}
                    </span>
                    <span className={`font-semibold ${f.value < 0 ? 'text-rose-600' : 'text-ink-700'}`}>{currency(f.value)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-[190px] flex flex-col items-center justify-center text-center text-ink-400 gap-1.5">
              <Landmark className="h-6 w-6 text-ink-200" />
              <p className="text-xs">No fund balances yet</p>
              <p className="text-[11px] text-ink-300">Balances appear once payments are verified</p>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="card p-5 xl:col-span-2 animate-fade-up">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-ink-800">Recent payments</h3>
            <a href="/admin/payments" className="text-xs font-semibold text-brand-600 flex items-center gap-1 hover:gap-1.5 transition-all">
              View all <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Resident</th><th>Fee</th><th>Amount</th><th>Date</th><th>Status</th></tr></thead>
              <tbody>
                {recentPayments.map((p) => (
                  <tr key={p.id}>
                    <td className="font-medium text-ink-800">{residentOf(p.residentId)}</td>
                    <td>{feeOf(p.feeId)}</td>
                    <td className="font-semibold">{currency(p.amount)}</td>
                    <td>{formatDate(p.date)}</td>
                    <td><Badge status={p.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {slotPendingChange ? (
          <PendingChangeSlot pendingChange={slotPendingChange} onDecide={respondToPendingChange} />
        ) : (
          <div className="card p-5 animate-fade-up">
            <h3 className="font-semibold text-ink-800 mb-4">Community snapshot</h3>
            <div className="space-y-4">
              <SnapshotRow icon={Users} label="Total residents" value={residents.length} />
              <SnapshotRow icon={Users} label="Active residents" value={residents.filter((r) => r.status === 'active').length} />
              <SnapshotRow icon={Receipt} label="Fee categories" value={fees.length} />
              <SnapshotRow icon={FolderKanban} label="Projects in progress" value={activeProjects} />
            </div>
            <div className="mt-5 h-[1px] bg-ink-100" />
            <div className="mt-5">
              <p className="text-xs font-semibold text-ink-400 uppercase mb-3">Project budget usage</p>
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={projects.slice(0, 4).map((p) => ({ name: p.name.split(' ')[0], pct: Math.round((p.spent / p.budget) * 100) }))}>
                  <XAxis dataKey="name" tick={{ fill: '#8790b3', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip formatter={(v) => `${v}%`} contentStyle={{ borderRadius: 12, border: '1px solid #eef1f8' }} />
                  <Bar dataKey="pct" fill="#2570f5" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function SnapshotRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5 text-ink-500 text-sm">
        <div className="h-8 w-8 rounded-lg bg-brand-50 flex items-center justify-center">
          <Icon className="h-4 w-4 text-brand-600" />
        </div>
        {label}
      </div>
      <span className="font-bold text-ink-800">{value}</span>
    </div>
  )
}

