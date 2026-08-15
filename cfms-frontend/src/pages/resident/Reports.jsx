import { useMemo } from 'react'
import { Download, Printer, TrendingUp, Wallet, PiggyBank, Target } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend } from 'recharts'
import { useAuth } from '../../context/AuthContext'
import { useData } from '../../context/DataContext'
import { PageHeader, StatCard, currency, formatDate, ChartPlaceholder } from '../../components/ui'
import { getMeta } from '../../lib/adapters'
import { exportToExcel } from '../../lib/exportUtils'

const COLORS = ['#1554d6', '#2570f5', '#5aa4ff', '#a9caff', '#0c1c44']

export default function ResidentReports() {
  const { user } = useAuth()
  const { funds, fees, payments, expenses, projects, residents, dataFullyLoaded } = useData()
  const me = residents.find((r) => r.id === user?.residentId) || residents[0]

  const myPayments = useMemo(() => payments.filter((p) => p.residentId === me?.id), [payments, me])
  const myVerified = myPayments.filter((p) => p.status === 'paid')
  const myTotalPaid = myVerified.reduce((s, p) => s + p.amount, 0)
  const myPending = myPayments.filter((p) => p.status === 'pending')
  const paidFeeIds = new Set(myVerified.map((p) => p.feeId))
  const unpaidFees = fees.filter((f) => !paidFeeIds.has(f.id))
  const myComplianceRate = fees.length ? Math.round((paidFeeIds.size / fees.length) * 100) : 0

  const fundProgress = useMemo(() => funds.map((f) => {
    const feesInCategory = fees.filter((x) => x.category === f.category)
    const feeIds = new Set(feesInCategory.map((x) => x.id))
    const verified = payments.filter((p) => feeIds.has(p.feeId) && p.status === 'paid')
    const collected = verified.reduce((s, p) => s + p.amount, 0)
    const contributorIds = new Set(verified.map((p) => p.residentId))
    const goal = Number(getMeta('fundGoal', f.id, 0)) || null
    return {
      name: f.name,
      category: f.category,
      balance: f.balance,
      collected,
      goal,
      pct: goal ? Math.min(100, Math.round((collected / goal) * 100)) : null,
      contributors: contributorIds.size,
      nonContributors: Math.max(residents.length - contributorIds.size, 0),
    }
  }), [funds, fees, payments, residents])

  const byFundCategory = funds.map((f) => ({ name: f.category, value: f.balance }))
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0)

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Your contribution history and the community's fund transparency, all in one place."
        action={
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</button>
            <button
              className="btn-primary"
              onClick={() => exportToExcel({
                filename: 'my-cfms-payments',
                sheetName: 'My Payments',
                meta: [
                  { label: 'Resident', value: me?.name || '—' },
                  { label: 'Unit', value: me?.unit || '—' },
                  { label: 'Generated', value: new Date().toLocaleString('en-GB') },
                  { label: 'Total paid', value: currency(myTotalPaid) },
                ],
                columns: [
                  { header: 'Fee', value: (p) => fees.find((f) => f.id === p.feeId)?.name || '—', width: 24 },
                  { header: 'Amount', key: 'amount', width: 14 },
                  { header: 'Date', value: (p) => formatDate(p.date), width: 16 },
                  { header: 'Status', key: 'status', width: 12 },
                  { header: 'Reference', key: 'reference', width: 18 },
                ],
                rows: myPayments,
              })}
            >
              <Download className="h-4 w-4" /> Export my payments
            </button>
          </div>
        }
      />

      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <StatCard icon={Wallet} label="Total paid" value={currency(myTotalPaid)} sub={`${myVerified.length} verified payments`} accent="brand" />
        <StatCard icon={TrendingUp} label="Compliance rate" value={`${myComplianceRate}%`} sub={`${unpaidFees.length} fee(s) outstanding`} accent="green" />
        <StatCard icon={PiggyBank} label="Pending verification" value={myPending.length} sub={currency(myPending.reduce((s, p) => s + p.amount, 0))} accent="amber" />
        <StatCard icon={Target} label="Community spend" value={currency(totalExpenses)} sub={`${projects.length} active project(s)`} accent="rose" loading={!dataFullyLoaded} />
      </div>

      {!dataFullyLoaded ? (
        // Fund progress / community spend below is computed across every
        // resident's payments and every expense, not just this resident's
        // own — wait for that background page-in to finish (see
        // DataContext.dataFullyLoaded) rather than show totals that are
        // still missing most of the community's data.
        <div className="card p-10">
          <ChartPlaceholder height={280} label="Loading community-wide totals…" />
        </div>
      ) : (
      <>
      <div className="grid xl:grid-cols-2 gap-5">
        <div className="card p-5">
          <h3 className="font-semibold text-ink-800 mb-4">Fund progress toward goal</h3>
          <div className="space-y-4">
            {fundProgress.map((f) => (
              <div key={f.name}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-medium text-ink-800">{f.name}</span>
                  <span className="text-ink-400">
                    {f.goal ? `${currency(f.collected)} of ${currency(f.goal)}` : `${currency(f.collected)} collected`}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-ink-100 overflow-hidden">
                  <div className="h-full bg-brand-gradient" style={{ width: `${f.pct ?? (f.collected > 0 ? 100 : 0)}%` }} />
                </div>
                <p className="text-xs text-ink-400 mt-1">{f.contributors} contributed · {f.nonContributors} haven't yet</p>
              </div>
            ))}
            {fundProgress.length === 0 && <p className="text-sm text-ink-400">No funds set up yet.</p>}
          </div>
        </div>

        <div className="card p-5">
          <h3 className="font-semibold text-ink-800 mb-4">Fund balance by category</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={byFundCategory} dataKey="value" nameKey="name" outerRadius={100} label>
                {byFundCategory.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Legend />
              <Tooltip formatter={(v) => currency(v)} contentStyle={{ borderRadius: 12, border: '1px solid #eef1f8' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card p-5 mt-5">
        <h3 className="font-semibold text-ink-800 mb-4">Project budget vs. spend</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={projects.map((p) => ({ name: p.name, Budget: p.budget, Spent: p.spent }))}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef1f8" />
            <XAxis dataKey="name" tick={{ fill: '#8790b3', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#8790b3', fontSize: 12 }} tickFormatter={(v) => `${v / 1000}k`} axisLine={false} tickLine={false} />
            <Tooltip formatter={(v) => currency(v)} contentStyle={{ borderRadius: 12, border: '1px solid #eef1f8' }} />
            <Legend />
            <Bar dataKey="Budget" fill="#c7d9fb" radius={[6, 6, 0, 0]} />
            <Bar dataKey="Spent" fill="#1554d6" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      </>
      )}

      <div className="card overflow-hidden mt-5">
        <div className="px-5 py-4 border-b border-ink-50">
          <h3 className="font-semibold text-ink-800">My payment history</h3>
        </div>
        <div className="table-wrap !border-0">
          <table className="data-table">
            <thead><tr><th>Fee</th><th>Amount</th><th>Date</th><th>Status</th><th>Reference</th></tr></thead>
            <tbody>
              {myPayments.map((p) => (
                <tr key={p.id}>
                  <td className="font-medium text-ink-800">{fees.find((f) => f.id === p.feeId)?.name || '—'}</td>
                  <td className="font-semibold">{currency(p.amount)}</td>
                  <td>{formatDate(p.date)}</td>
                  <td className="capitalize">{p.status}</td>
                  <td className="text-ink-400">{p.reference || '—'}</td>
                </tr>
              ))}
              {myPayments.length === 0 && (
                <tr><td colSpan={5} className="text-center text-ink-400 py-6">No payments yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
