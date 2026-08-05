import { Download, Printer } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend } from 'recharts'
import { useData } from '../../context/DataContext'
import { PageHeader, currency } from '../../components/ui'

const COLORS = ['#1554d6', '#2570f5', '#5aa4ff', '#a9caff', '#0c1c44']

export default function Reports() {
  const { payments, expenses, fees, funds, projects, residents } = useData()

  const byFee = fees.map((f) => ({
    name: f.name,
    total: payments.filter((p) => p.feeId === f.id && p.status === 'paid').reduce((s, p) => s + p.amount, 0),
  }))

  const byFundCategory = funds.map((f) => ({ name: f.category, value: f.balance }))

  const totalCollected = payments.filter((p) => p.status === 'paid').reduce((s, p) => s + p.amount, 0)
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0)
  const collectionRate = Math.round((payments.filter((p) => p.status === 'paid').length / Math.max(payments.length, 1)) * 100)

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Financial summaries for committee review and resident transparency."
        action={
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</button>
            <button className="btn-secondary" onClick={() => exportCsv(expenses.map((e) => [e.description, e.vendor, e.amount, e.date]), ['Description', 'Vendor', 'Amount', 'Date'], 'cfms-expenses-report.csv')}><Download className="h-4 w-4" /> Export expenses</button>
            <button className="btn-primary" onClick={() => exportCsv(payments.map((p) => [residents.find((r) => r.id === p.residentId)?.name || '', fees.find((f) => f.id === p.feeId)?.name || '', p.amount, p.date, p.status, p.reference]), ['Resident', 'Fee', 'Amount', 'Date', 'Status', 'Reference'], 'cfms-payments-report.csv')}><Download className="h-4 w-4" /> Export payments</button>
          </div>
        }
      />

      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase text-ink-400">Total collected</p>
          <p className="mt-2 text-2xl font-bold font-display text-brand-700">{currency(totalCollected)}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase text-ink-400">Total expenses</p>
          <p className="mt-2 text-2xl font-bold font-display text-ink-900">{currency(totalExpenses)}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase text-ink-400">Collection rate</p>
          <p className="mt-2 text-2xl font-bold font-display text-emerald-600">{collectionRate}%</p>
        </div>
      </div>

      <div className="grid xl:grid-cols-2 gap-5">
        <div className="card p-5">
          <h3 className="font-semibold text-ink-800 mb-4">Collections by fee category</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={byFee} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eef1f8" />
              <XAxis type="number" tick={{ fill: '#8790b3', fontSize: 12 }} tickFormatter={(v) => `${v / 1000}k`} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#4f5779', fontSize: 12 }} width={140} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v) => currency(v)} contentStyle={{ borderRadius: 12, border: '1px solid #eef1f8' }} />
              <Bar dataKey="total" fill="#2570f5" radius={[0, 8, 8, 0]} />
            </BarChart>
          </ResponsiveContainer>
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
    </div>
  )
}

function exportCsv(rows, header, filename) {
  const allRows = [header, ...rows]
  const csv = allRows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
