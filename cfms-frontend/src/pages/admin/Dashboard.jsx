import { useMemo } from 'react'
import { Wallet, Landmark, FolderKanban, Users, ArrowUpRight, Clock, Receipt } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid, BarChart, Bar } from 'recharts'
import { useData } from '../../context/DataContext'
import { useAuth } from '../../context/AuthContext'
import { StatCard, Badge, PageHeader, currency, formatDate } from '../../components/ui'

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
  const { residents, payments, funds, projects, fees, expenses } = useData()
  const { user } = useAuth()

  const totalBalance = funds.reduce((s, f) => s + f.balance, 0)
  const paidThisPeriod = payments.filter((p) => p.status === 'paid').reduce((s, p) => s + p.amount, 0)
  const pendingCount = payments.filter((p) => p.status === 'pending' || p.status === 'overdue').length
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
        <StatCard icon={Landmark} label="Total fund balance" value={currency(totalBalance)} sub={`Across ${funds.length} fund${funds.length === 1 ? '' : 's'}`} accent="brand" />
        <StatCard icon={Wallet} label="Collected this period" value={currency(paidThisPeriod)} sub={`${payments.filter(p=>p.status==='paid').length} payments recorded`} accent="green" trend={collectedTrend} />
        <StatCard icon={Clock} label="Pending / overdue" value={pendingCount} sub="Needs follow-up" accent="amber" />
        <StatCard icon={FolderKanban} label="Active projects" value={activeProjects} sub={`${projects.length} total projects`} accent="rose" />
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
          <p className="text-xs text-ink-400 mb-2">Balance share by fund</p>
          <ResponsiveContainer width="100%" height={190}>
            <PieChart>
              <Pie
                data={fundSplit}
                dataKey="value"
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
                {fundSplit.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} style={{ filter: 'drop-shadow(0 2px 6px rgba(16,30,66,0.18))' }} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => currency(v)} contentStyle={{ borderRadius: 12, border: '1px solid #eef1f8' }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-2 mt-1">
            {fundSplit.map((f, i) => (
              <div key={f.name} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 text-ink-500">
                  <span className="h-2 w-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                  {f.name}
                </span>
                <span className="font-semibold text-ink-700">{currency(f.value)}</span>
              </div>
            ))}
          </div>
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

