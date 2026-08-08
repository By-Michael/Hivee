import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Download, FileSpreadsheet, FileText, Users, Wallet, Receipt, FolderKanban, Filter, X, Loader2, ChevronLeft, ChevronRight,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend,
  AreaChart, Area, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from 'recharts'
import { useData } from '../../context/DataContext'
import { PageHeader, currency, formatDate, Badge } from '../../components/ui'
import { exportToExcel, exportToPdf, exportRichPdf, captureChartImage } from '../../lib/exportUtils'

// Distinct, purposeful palettes so each chart signals something different at a glance.
const FEE_COLORS = ['#2570f5', '#22b8cf', '#7c5cf5', '#4fd1c5', '#3a5fd9', '#a78bfa']
const FUND_COLORS = ['#1554d6', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6']
const EXPENSE_COLORS = { SECURITY: '#1554d6', WATER: '#0ea5e9', CLEANING: '#10b981', MAINTENANCE: '#f59e0b', IMPROVEMENT: '#8b5cf6', ADMIN: '#64748b', OTHER: '#f43f5e' }
const STATUS_COLORS = { active: '#10b981', inactive: '#94a3b8', paid: '#10b981', pending: '#f59e0b', overdue: '#f43f5e', rejected: '#f43f5e', planned: '#94a3b8', 'in-progress': '#1554d6', completed: '#10b981', cancelled: '#f43f5e' }

const EXPENSE_CATEGORIES = ['SECURITY', 'WATER', 'CLEANING', 'MAINTENANCE', 'IMPROVEMENT', 'ADMIN', 'OTHER']

function monthKey(d) {
  const dt = new Date(d)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
}
function monthLabel(key) {
  const [y, m] = key.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
}
function inRange(dateStr, from, to) {
  if (!dateStr) return false
  const t = new Date(dateStr).getTime()
  if (from && t < new Date(from).getTime()) return false
  if (to && t > new Date(to).getTime() + 86399999) return false
  return true
}

export default function Reports() {
  const { payments, expenses, fees, funds, projects, residents } = useData()

  // ---- resident filters ----
  const [residentSearch, setResidentSearch] = useState('')
  const [residentStatus, setResidentStatus] = useState('all')
  const [residentPage, setResidentPage] = useState(1)
  const RESIDENTS_PAGE_SIZE = 8

  // ---- payment filters ----
  const [paySearch, setPaySearch] = useState('')
  const [payFrom, setPayFrom] = useState('')
  const [payTo, setPayTo] = useState('')
  const [payFee, setPayFee] = useState('all')
  const [payStatus, setPayStatus] = useState('all')
  const [payPage, setPayPage] = useState(1)
  const PAYMENTS_PAGE_SIZE = 8

  // ---- expense filters ----
  const [expFrom, setExpFrom] = useState('')
  const [expTo, setExpTo] = useState('')
  const [expCategory, setExpCategory] = useState('all')
  const [expProject, setExpProject] = useState('all')

  // ---- project filters ----
  const [projStatus, setProjStatus] = useState('all')

  // ---- chart DOM refs, used to screenshot charts into rich PDF exports ----
  const byFeeChartRef = useRef(null)
  const expenseCatChartRef = useRef(null)
  const trendChartRef = useRef(null)
  const residentStatusChartRef = useRef(null)
  const projectBudgetChartRef = useRef(null)
  const radarChartRef = useRef(null)

  const [exportingSummary, setExportingSummary] = useState(false)
  const [exportingEverything, setExportingEverything] = useState(false)

  const filteredResidents = useMemo(() => residents.filter((r) => {
    if (residentStatus !== 'all' && r.status !== residentStatus) return false
    if (residentSearch && !(`${r.name} ${r.unit} ${r.email}`.toLowerCase().includes(residentSearch.toLowerCase()))) return false
    return true
  }), [residents, residentStatus, residentSearch])

  const filteredPayments = useMemo(() => payments.filter((p) => {
    if (payFee !== 'all' && p.feeId !== payFee) return false
    if (payStatus !== 'all' && p.status !== payStatus) return false
    if ((payFrom || payTo) && !inRange(p.date, payFrom, payTo)) return false
    if (paySearch) {
      const r = residents.find((x) => x.id === p.residentId)
      const haystack = `${r?.name || ''} ${r?.unit || ''} ${p.reference || ''} ${p.method || ''}`.toLowerCase()
      if (!haystack.includes(paySearch.toLowerCase())) return false
    }
    return true
  }), [payments, payFee, payStatus, payFrom, payTo, paySearch, residents])

  const residentPageCount = Math.max(1, Math.ceil(filteredResidents.length / RESIDENTS_PAGE_SIZE))
  const pagedResidents = filteredResidents.slice((residentPage - 1) * RESIDENTS_PAGE_SIZE, residentPage * RESIDENTS_PAGE_SIZE)

  const payPageCount = Math.max(1, Math.ceil(filteredPayments.length / PAYMENTS_PAGE_SIZE))
  const pagedPayments = filteredPayments.slice((payPage - 1) * PAYMENTS_PAGE_SIZE, payPage * PAYMENTS_PAGE_SIZE)

  // Reset to page 1 whenever the underlying filter criteria change.
  useEffect(() => { setResidentPage(1) }, [residentSearch, residentStatus])
  useEffect(() => { setPayPage(1) }, [paySearch, payFee, payStatus, payFrom, payTo])

  const filteredExpenses = useMemo(() => expenses.filter((e) => {
    if (expCategory !== 'all' && e.category !== expCategory) return false
    if (expProject !== 'all' && e.projectId !== expProject) return false
    if ((expFrom || expTo) && !inRange(e.date, expFrom, expTo)) return false
    return true
  }), [expenses, expCategory, expProject, expFrom, expTo])

  const filteredProjects = useMemo(() => projects.filter((p) => projStatus === 'all' || p.status === projStatus), [projects, projStatus])

  // ---- chart data ----
  const byFee = fees.map((f, i) => ({
    name: f.name,
    total: payments.filter((p) => p.feeId === f.id && p.status === 'paid').reduce((s, p) => s + p.amount, 0),
    fill: FEE_COLORS[i % FEE_COLORS.length],
  }))

  const byFundCategory = funds.map((f) => ({ name: f.category, value: f.balance }))

  const byExpenseCategory = useMemo(() => {
    const totals = {}
    for (const e of expenses) totals[e.category] = (totals[e.category] || 0) + e.amount
    return Object.entries(totals).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value, fill: EXPENSE_COLORS[name] || '#64748b' }))
  }, [expenses])

  const monthlyTrend = useMemo(() => {
    const map = {}
    for (const p of payments.filter((p) => p.status === 'paid')) {
      const k = monthKey(p.date)
      map[k] = map[k] || { income: 0, expense: 0 }
      map[k].income += p.amount
    }
    for (const e of expenses) {
      const k = monthKey(e.date)
      map[k] = map[k] || { income: 0, expense: 0 }
      map[k].expense += e.amount
    }
    return Object.entries(map).sort(([a], [b]) => (a > b ? 1 : -1)).slice(-9)
      .map(([k, v]) => ({ month: monthLabel(k), Income: v.income, Expenses: v.expense }))
  }, [payments, expenses])

  const residentStatusBreakdown = useMemo(() => {
    const active = residents.filter((r) => r.status === 'active').length
    const inactive = residents.length - active
    return [{ name: 'Active', value: active, fill: STATUS_COLORS.active }, { name: 'Inactive', value: inactive, fill: STATUS_COLORS.inactive }]
  }, [residents])

  const projectRadar = useMemo(() => projects.slice(0, 8).map((p) => ({
    name: p.name.length > 12 ? `${p.name.slice(0, 12)}…` : p.name,
    utilisation: p.budget > 0 ? Math.min(200, Math.round((p.spent / p.budget) * 100)) : 0,
  })), [projects])

  const totalCollected = payments.filter((p) => p.status === 'paid').reduce((s, p) => s + p.amount, 0)
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0)
  const collectionRate = Math.round((payments.filter((p) => p.status === 'paid').length / Math.max(payments.length, 1)) * 100)

  // ---- export handlers ----
  const exportResidentsExcel = () => exportToExcel({
    filename: 'cfms-residents-report',
    sheetName: 'Residents',
    meta: [
      { label: 'Report', value: 'Residence Members' },
      { label: 'Generated', value: new Date().toLocaleString('en-GB') },
      { label: 'Filter · Status', value: residentStatus },
      { label: 'Total members', value: filteredResidents.length },
    ],
    columns: [
      { header: 'Name', key: 'name', width: 26 },
      { header: 'Unit', key: 'unit', width: 12 },
      { header: 'Email', key: 'email', width: 26 },
      { header: 'Phone', key: 'phone', width: 16 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Joined', value: (r) => formatDate(r.joined), width: 16 },
    ],
    rows: filteredResidents,
  })

  const exportPaymentsExcel = () => exportToExcel({
    filename: 'cfms-collections-report',
    sheetName: 'Collections',
    meta: [
      { label: 'Report', value: 'Collections / Payments' },
      { label: 'Generated', value: new Date().toLocaleString('en-GB') },
      { label: 'Range', value: `${payFrom || 'all time'} → ${payTo || 'now'}` },
      { label: 'Total amount', value: currency(filteredPayments.filter((p) => p.status === 'paid').reduce((s, p) => s + p.amount, 0)) },
    ],
    columns: [
      { header: 'Resident', value: (p) => residents.find((r) => r.id === p.residentId)?.name || '—', width: 24 },
      { header: 'Unit', value: (p) => residents.find((r) => r.id === p.residentId)?.unit || '—', width: 10 },
      { header: 'Fee', value: (p) => fees.find((f) => f.id === p.feeId)?.name || '—', width: 20 },
      { header: 'Amount', key: 'amount', width: 14 },
      { header: 'Method', key: 'method', width: 16 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Reference', key: 'reference', width: 18 },
      { header: 'Date', value: (p) => formatDate(p.date), width: 16 },
    ],
    rows: filteredPayments,
  })

  const expenseColumns = [
    { header: 'Description', key: 'description', width: 28 },
    { header: 'Category', key: 'category', width: 14 },
    { header: 'Project', value: (e) => projects.find((p) => p.id === e.projectId)?.name || '—', width: 22 },
    { header: 'Vendor', key: 'vendor', width: 20 },
    { header: 'Amount', key: 'amount', width: 14 },
    { header: 'Date', value: (e) => formatDate(e.date), width: 16 },
  ]
  const expenseMeta = [
    { label: 'Report', value: 'Expenses' },
    { label: 'Generated', value: new Date().toLocaleString('en-GB') },
    { label: 'Range', value: `${expFrom || 'all time'} → ${expTo || 'now'}` },
    { label: 'Total spent', value: currency(filteredExpenses.reduce((s, e) => s + e.amount, 0)) },
  ]
  const exportExpensesExcel = () => exportToExcel({ filename: 'cfms-expenses-report', sheetName: 'Expenses', meta: expenseMeta, columns: expenseColumns, rows: filteredExpenses })
  const exportExpensesPdf = () => exportToPdf({
    filename: 'cfms-expenses-report', title: 'Expenses Report', subtitle: 'Community fund expenditure', meta: expenseMeta, columns: expenseColumns, rows: filteredExpenses,
  })

  const projectColumns = [
    { header: 'Project', key: 'name', width: 26 },
    { header: 'Fund', value: (p) => funds.find((f) => f.id === p.fundId)?.name || '—', width: 20 },
    { header: 'Budget', key: 'budget', width: 14 },
    { header: 'Spent', key: 'spent', width: 14 },
    { header: 'Remaining', value: (p) => p.budget - p.spent, width: 14 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Start', value: (p) => formatDate(p.startDate), width: 14 },
    { header: 'End', value: (p) => formatDate(p.endDate), width: 14 },
  ]
  const projectMeta = [
    { label: 'Report', value: 'Projects' },
    { label: 'Generated', value: new Date().toLocaleString('en-GB') },
    { label: 'Total budget', value: currency(filteredProjects.reduce((s, p) => s + p.budget, 0)) },
    { label: 'Total spent', value: currency(filteredProjects.reduce((s, p) => s + p.spent, 0)) },
  ]
  const exportProjectsExcel = () => exportToExcel({ filename: 'cfms-projects-report', sheetName: 'Projects', meta: projectMeta, columns: projectColumns, rows: filteredProjects })
  const exportProjectsPdf = () => exportToPdf({
    filename: 'cfms-projects-report', title: 'Projects Report', subtitle: 'Budget vs. spend by project', meta: projectMeta, columns: projectColumns, rows: filteredProjects,
  })

  async function captureAllCharts() {
    const targets = [
      { title: 'Collections by fee category', ref: byFeeChartRef },
      { title: 'Expenses by category', ref: expenseCatChartRef },
      { title: 'Income vs. expenses trend', ref: trendChartRef },
      { title: 'Resident status', ref: residentStatusChartRef },
      { title: 'Project budget vs. spend', ref: projectBudgetChartRef },
      { title: 'Budget utilisation (%)', ref: radarChartRef },
    ]
    const results = []
    for (const t of targets) {
      const shot = await captureChartImage(t.ref.current)
      if (shot) results.push({ title: t.title, ...shot })
    }
    return results
  }

  const summaryKpis = [
    { label: 'Total collected', value: currency(totalCollected) },
    { label: 'Total expenses', value: currency(totalExpenses) },
    { label: 'Net balance', value: currency(totalCollected - totalExpenses) },
    { label: 'Collection rate', value: `${collectionRate}%` },
  ]

  const exportFullSummaryPdf = async () => {
    setExportingSummary(true)
    try {
      const charts = await captureAllCharts()
      exportRichPdf({
        filename: 'cfms-financial-summary',
        title: 'Financial Summary Report',
        subtitle: 'Community-wide overview for committee review',
        kpis: summaryKpis,
        charts,
        sections: [
          {
            title: 'Collections by fee category',
            subtitle: 'Total verified collections per fee type',
            columns: [
              { header: 'Fee category', key: 'name', width: 24 },
              { header: 'Total collected', value: (r) => currency(r.total), width: 20 },
            ],
            rows: byFee,
          },
        ],
      })
    } finally {
      setExportingSummary(false)
    }
  }

  const exportEverythingPdf = async () => {
    setExportingEverything(true)
    try {
      const charts = await captureAllCharts()
      exportRichPdf({
        filename: 'cfms-full-report',
        title: 'Complete CFMS Report',
        subtitle: 'Summary, residents, payments, expenses & projects — full dataset',
        kpis: summaryKpis,
        charts,
        sections: [
          {
            title: 'Residence members',
            subtitle: `${residents.length} registered residents`,
            columns: [
              { header: 'Name', key: 'name', width: 26 },
              { header: 'Unit', key: 'unit', width: 12 },
              { header: 'Email', key: 'email', width: 26 },
              { header: 'Status', key: 'status', width: 12 },
              { header: 'Joined', value: (r) => formatDate(r.joined), width: 16 },
            ],
            rows: residents,
          },
          {
            title: 'Collections / payments',
            subtitle: `${payments.length} payment records`,
            columns: [
              { header: 'Resident', value: (p) => residents.find((r) => r.id === p.residentId)?.name || '—', width: 24 },
              { header: 'Fee', value: (p) => fees.find((f) => f.id === p.feeId)?.name || '—', width: 20 },
              { header: 'Amount', value: (p) => currency(p.amount), width: 14 },
              { header: 'Status', key: 'status', width: 12 },
              { header: 'Date', value: (p) => formatDate(p.date), width: 16 },
            ],
            rows: payments,
          },
          {
            title: 'Expenses',
            subtitle: `${expenses.length} expense records · ${currency(totalExpenses)} total`,
            columns: expenseColumns,
            rows: expenses,
          },
          {
            title: 'Projects',
            subtitle: `${projects.length} projects`,
            columns: projectColumns,
            rows: projects,
          },
        ],
      })
    } finally {
      setExportingEverything(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Financial summaries for committee review and resident transparency."
        action={
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary" onClick={exportFullSummaryPdf} disabled={exportingSummary}>
              {exportingSummary ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              {exportingSummary ? 'Building…' : 'Summary PDF'}
            </button>
            <button className="btn-primary" onClick={exportEverythingPdf} disabled={exportingEverything}>
              {exportingEverything ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {exportingEverything ? 'Building…' : 'Export everything'}
            </button>
          </div>
        }
      />

      {/* ---------------- KPI cards ---------------- */}
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase text-ink-400">Total collected</p>
          <p className="mt-2 text-2xl font-bold font-display text-brand-700">{currency(totalCollected)}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase text-ink-400">Total expenses</p>
          <p className="mt-2 text-2xl font-bold font-display text-ink-900">{currency(totalExpenses)}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase text-ink-400">Net balance</p>
          <p className={`mt-2 text-2xl font-bold font-display ${totalCollected - totalExpenses >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>{currency(totalCollected - totalExpenses)}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase text-ink-400">Collection rate</p>
          <p className="mt-2 text-2xl font-bold font-display text-emerald-600">{collectionRate}%</p>
        </div>
      </div>

      {/* ---------------- Charts ---------------- */}
      <div className="grid xl:grid-cols-2 gap-5 mb-5">
        <div className="card p-5" ref={byFeeChartRef}>
          <h3 className="font-semibold text-ink-800 mb-4">Collections by fee category</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={byFee} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
              <defs>
                {byFee.map((f, i) => (
                  <linearGradient key={i} id={`feeBarGrad-${i}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={f.fill} stopOpacity={1} />
                    <stop offset="100%" stopColor={f.fill} stopOpacity={0.55} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef1f8" />
              <XAxis dataKey="name" tick={{ fill: '#8790b3', fontSize: 11 }} axisLine={false} tickLine={false} interval={0} angle={-12} textAnchor="end" height={50} />
              <YAxis tick={{ fill: '#8790b3', fontSize: 12 }} tickFormatter={(v) => `${v / 1000}k`} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v) => currency(v)} cursor={{ fill: '#f5f7fd' }} contentStyle={{ borderRadius: 12, border: '1px solid #eef1f8' }} />
              <Bar dataKey="total" radius={[10, 10, 4, 4]} maxBarSize={54}>
                {byFee.map((f, i) => <Cell key={i} fill={`url(#feeBarGrad-${i})`} stroke={f.fill} strokeWidth={1} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5" ref={expenseCatChartRef}>
          <h3 className="font-semibold text-ink-800 mb-4">Expenses by category</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={byExpenseCategory}
                dataKey="value"
                nameKey="name"
                innerRadius={62}
                outerRadius={95}
                paddingAngle={3}
                cornerRadius={8}
                stroke="none"
                startAngle={90}
                endAngle={-270}
                isAnimationActive
                animationDuration={700}
                animationEasing="ease-out"
              >
                {byExpenseCategory.map((e, i) => (
                  <Cell
                    key={i}
                    fill={e.fill}
                    style={{ filter: 'drop-shadow(0 2px 6px rgba(16,30,66,0.18))', transition: 'opacity 0.2s' }}
                  />
                ))}
              </Pie>
              <Legend
                verticalAlign="bottom"
                iconType="circle"
                iconSize={8}
                formatter={(value) => <span style={{ color: '#8790b3', fontSize: 12 }}>{value}</span>}
              />
              <Tooltip
                formatter={(v) => currency(v)}
                contentStyle={{ borderRadius: 12, border: '1px solid #eef1f8', boxShadow: '0 8px 24px -8px rgba(16,30,66,0.2)' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid xl:grid-cols-3 gap-5 mb-5">
        <div className="card p-5 xl:col-span-2" ref={trendChartRef}>
          <h3 className="font-semibold text-ink-800 mb-4">Income vs. expenses trend</h3>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={monthlyTrend}>
              <defs>
                <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef1f8" />
              <XAxis dataKey="month" tick={{ fill: '#8790b3', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#8790b3', fontSize: 12 }} tickFormatter={(v) => `${v / 1000}k`} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v) => currency(v)} contentStyle={{ borderRadius: 12, border: '1px solid #eef1f8' }} />
              <Legend />
              <Area type="monotone" dataKey="Income" stroke="#10b981" fill="url(#incomeGrad)" strokeWidth={2} />
              <Area type="monotone" dataKey="Expenses" stroke="#f43f5e" fill="url(#expenseGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5" ref={residentStatusChartRef}>
          <h3 className="font-semibold text-ink-800 mb-4">Resident status</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={residentStatusBreakdown}
                dataKey="value"
                nameKey="name"
                innerRadius={58}
                outerRadius={90}
                paddingAngle={4}
                cornerRadius={8}
                stroke="none"
                startAngle={90}
                endAngle={-270}
                isAnimationActive
                animationDuration={700}
                animationEasing="ease-out"
              >
                {residentStatusBreakdown.map((s, i) => (
                  <Cell
                    key={i}
                    fill={s.fill}
                    style={{ filter: 'drop-shadow(0 2px 6px rgba(16,30,66,0.18))', transition: 'opacity 0.2s' }}
                  />
                ))}
              </Pie>
              <Legend
                verticalAlign="bottom"
                iconType="circle"
                iconSize={8}
                formatter={(value) => <span style={{ color: '#8790b3', fontSize: 12 }}>{value}</span>}
              />
              <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #eef1f8', boxShadow: '0 8px 24px -8px rgba(16,30,66,0.2)' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid xl:grid-cols-2 gap-5 mb-5">
        <div className="card p-5" ref={projectBudgetChartRef}>
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

        <div className="card p-5" ref={radarChartRef}>
          <h3 className="font-semibold text-ink-800 mb-4">Budget utilisation (%)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <RadarChart data={projectRadar}>
              <PolarGrid stroke="#eef1f8" />
              <PolarAngleAxis dataKey="name" tick={{ fill: '#4f5779', fontSize: 11 }} />
              <PolarRadiusAxis tick={{ fill: '#8790b3', fontSize: 10 }} />
              <Radar dataKey="utilisation" stroke="#1554d6" fill="#2570f5" fillOpacity={0.4} />
              <Tooltip formatter={(v) => `${v}%`} contentStyle={{ borderRadius: 12, border: '1px solid #eef1f8' }} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ---------------- Residents report ---------------- */}
      <SectionCard
        icon={Users}
        title="Residence members"
        subtitle={`${filteredResidents.length} of ${residents.length} members match the current filters`}
        exportActions={[{ label: 'Export Excel', icon: FileSpreadsheet, onClick: exportResidentsExcel }]}
      >
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <FilterInput placeholder="Search name, unit, email…" value={residentSearch} onChange={setResidentSearch} />
          <FilterSelect value={residentStatus} onChange={setResidentStatus} options={[['all', 'All statuses'], ['active', 'Active'], ['inactive', 'Inactive']]} />
          {(residentSearch || residentStatus !== 'all') && (
            <ClearButton onClick={() => { setResidentSearch(''); setResidentStatus('all') }} />
          )}
        </div>
        <TableScroll>
          <table className="report-table">
            <thead><tr><th>Name</th><th>Unit</th><th>Email</th><th>Status</th><th>Joined</th></tr></thead>
            <tbody>
              {pagedResidents.map((r) => (
                <tr key={r.id}>
                  <td className="font-medium text-ink-800">{r.name}</td>
                  <td>{r.unit}</td>
                  <td className="text-ink-500">{r.email}</td>
                  <td><Badge status={r.status} /></td>
                  <td className="text-ink-500">{formatDate(r.joined)}</td>
                </tr>
              ))}
              {pagedResidents.length === 0 && (
                <tr><td colSpan={5} className="text-center text-ink-400 py-6">No members match these filters.</td></tr>
              )}
            </tbody>
          </table>
        </TableScroll>
        <Pagination page={residentPage} pageCount={residentPageCount} onChange={setResidentPage} total={filteredResidents.length} pageSize={RESIDENTS_PAGE_SIZE} label="members" />
      </SectionCard>

      {/* ---------------- Payments report ---------------- */}
      <SectionCard
        icon={Wallet}
        title="Collections / payments"
        subtitle={`${filteredPayments.length} of ${payments.length} payments match the current filters`}
        exportActions={[{ label: 'Export Excel', icon: FileSpreadsheet, onClick: exportPaymentsExcel }]}
      >
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <FilterInput placeholder="Search resident, unit, reference…" value={paySearch} onChange={setPaySearch} />
          <FilterSelect value={payFee} onChange={setPayFee} options={[['all', 'All fees'], ...fees.map((f) => [f.id, f.name])]} />
          <FilterSelect value={payStatus} onChange={setPayStatus} options={[['all', 'All statuses'], ['paid', 'Paid'], ['pending', 'Pending'], ['rejected', 'Rejected']]} />
          <FilterDate value={payFrom} onChange={setPayFrom} label="From" />
          <FilterDate value={payTo} onChange={setPayTo} label="To" />
          {(paySearch || payFee !== 'all' || payStatus !== 'all' || payFrom || payTo) && (
            <ClearButton onClick={() => { setPaySearch(''); setPayFee('all'); setPayStatus('all'); setPayFrom(''); setPayTo('') }} />
          )}
        </div>
        <TableScroll>
          <table className="report-table">
            <thead><tr><th>Resident</th><th>Fee</th><th>Amount</th><th>Method</th><th>Status</th><th>Date</th></tr></thead>
            <tbody>
              {pagedPayments.map((p) => (
                <tr key={p.id}>
                  <td className="font-medium text-ink-800">{residents.find((r) => r.id === p.residentId)?.name || '—'}</td>
                  <td>{fees.find((f) => f.id === p.feeId)?.name || '—'}</td>
                  <td className="font-semibold">{currency(p.amount)}</td>
                  <td className="text-ink-500">{p.method}</td>
                  <td><Badge status={p.status} /></td>
                  <td className="text-ink-500">{formatDate(p.date)}</td>
                </tr>
              ))}
              {pagedPayments.length === 0 && (
                <tr><td colSpan={6} className="text-center text-ink-400 py-6">No payments match these filters.</td></tr>
              )}
            </tbody>
          </table>
        </TableScroll>
        <Pagination page={payPage} pageCount={payPageCount} onChange={setPayPage} total={filteredPayments.length} pageSize={PAYMENTS_PAGE_SIZE} label="payments" />
      </SectionCard>

      {/* ---------------- Expenses report ---------------- */}
      <SectionCard
        icon={Receipt}
        title="Expenses"
        subtitle={`${filteredExpenses.length} of ${expenses.length} expenses · ${currency(filteredExpenses.reduce((s, e) => s + e.amount, 0))} total`}
        exportActions={[
          { label: 'Excel', icon: FileSpreadsheet, onClick: exportExpensesExcel },
          { label: 'PDF', icon: FileText, onClick: exportExpensesPdf },
        ]}
      >
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <FilterSelect value={expCategory} onChange={setExpCategory} options={[['all', 'All categories'], ...EXPENSE_CATEGORIES.map((c) => [c, c.charAt(0) + c.slice(1).toLowerCase()])]} />
          <FilterSelect value={expProject} onChange={setExpProject} options={[['all', 'All projects'], ...projects.map((p) => [p.id, p.name])]} />
          <FilterDate value={expFrom} onChange={setExpFrom} label="From" />
          <FilterDate value={expTo} onChange={setExpTo} label="To" />
          {(expCategory !== 'all' || expProject !== 'all' || expFrom || expTo) && (
            <ClearButton onClick={() => { setExpCategory('all'); setExpProject('all'); setExpFrom(''); setExpTo('') }} />
          )}
        </div>
        <TableScroll>
          <table className="report-table">
            <thead><tr><th>Description</th><th>Category</th><th>Project</th><th>Vendor</th><th>Amount</th><th>Date</th></tr></thead>
            <tbody>
              {filteredExpenses.slice(0, 12).map((e) => (
                <tr key={e.id}>
                  <td className="font-medium text-ink-800">{e.description || '—'}</td>
                  <td><span className="badge" style={{ background: `${EXPENSE_COLORS[e.category] || '#64748b'}1a`, color: EXPENSE_COLORS[e.category] || '#64748b' }}>{e.category}</span></td>
                  <td>{projects.find((p) => p.id === e.projectId)?.name || '—'}</td>
                  <td className="text-ink-500">{e.vendor || '—'}</td>
                  <td className="font-semibold">{currency(e.amount)}</td>
                  <td className="text-ink-500">{formatDate(e.date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
        {filteredExpenses.length > 12 && <p className="text-xs text-ink-400 mt-3">Showing 12 of {filteredExpenses.length} — export for the full list.</p>}
      </SectionCard>

      {/* ---------------- Projects report ---------------- */}
      <SectionCard
        icon={FolderKanban}
        title="Projects"
        subtitle={`${filteredProjects.length} of ${projects.length} projects match the current filters`}
        exportActions={[
          { label: 'Excel', icon: FileSpreadsheet, onClick: exportProjectsExcel },
          { label: 'PDF', icon: FileText, onClick: exportProjectsPdf },
        ]}
        last
      >
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <FilterSelect value={projStatus} onChange={setProjStatus} options={[['all', 'All statuses'], ['planned', 'Planned'], ['in-progress', 'In progress'], ['completed', 'Completed'], ['cancelled', 'Cancelled']]} />
          {projStatus !== 'all' && <ClearButton onClick={() => setProjStatus('all')} />}
        </div>
        <TableScroll>
          <table className="report-table">
            <thead><tr><th>Project</th><th>Fund</th><th>Budget</th><th>Spent</th><th>Remaining</th><th>Status</th></tr></thead>
            <tbody>
              {filteredProjects.map((p) => (
                <tr key={p.id}>
                  <td className="font-medium text-ink-800">{p.name}</td>
                  <td className="text-ink-500">{funds.find((f) => f.id === p.fundId)?.name || '—'}</td>
                  <td>{currency(p.budget)}</td>
                  <td>{currency(p.spent)}</td>
                  <td className={p.budget - p.spent < 0 ? 'text-rose-500 font-semibold' : ''}>{currency(p.budget - p.spent)}</td>
                  <td><Badge status={p.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </SectionCard>

      <style>{`
        .report-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .report-table th { text-align: left; padding: 8px 12px; color: #8790b3; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: .03em; border-bottom: 1px solid #eef1f8; white-space: nowrap; }
        .report-table td { padding: 10px 12px; border-bottom: 1px solid #f5f6fb; white-space: nowrap; }
        .report-table tbody tr:hover { background: #f8f9fd; }
      `}</style>
    </div>
  )
}

function SectionCard({ icon: Icon, title, subtitle, exportActions, children, last }) {
  return (
    <div className={`card p-5 ${last ? '' : 'mb-5'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
            <Icon className="h-4.5 w-4.5 text-brand-600" />
          </div>
          <div>
            <h3 className="font-semibold text-ink-800">{title}</h3>
            <p className="text-xs text-ink-400">{subtitle}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {exportActions.map((a) => (
            <button key={a.label} className="btn-secondary text-xs" onClick={a.onClick}>
              <a.icon className="h-3.5 w-3.5" /> {a.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  )
}

function Pagination({ page, pageCount, onChange, total, pageSize, label }) {
  if (total === 0) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  return (
    <div className="flex items-center justify-between gap-3 mt-3 flex-wrap">
      <p className="text-xs text-ink-400">
        Showing {from}–{to} of {total} {label}
      </p>
      <div className="flex items-center gap-1.5">
        <button
          className="btn-secondary !px-2.5 !py-1.5 text-xs"
          onClick={() => onChange((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Prev
        </button>
        <span className="text-xs text-ink-500 px-1.5">{page} / {pageCount}</span>
        <button
          className="btn-secondary !px-2.5 !py-1.5 text-xs"
          onClick={() => onChange((p) => Math.min(pageCount, p + 1))}
          disabled={page >= pageCount}
        >
          Next <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

function TableScroll({ children }) {
  return <div className="overflow-x-auto rounded-xl border border-ink-100">{children}</div>
}

function FilterInput({ value, onChange, placeholder }) {
  return (
    <div className="flex items-center gap-2 bg-ink-50 rounded-xl px-3 py-2">
      <Filter className="h-3.5 w-3.5 text-ink-400" />
      <input
        className="bg-transparent text-sm outline-none placeholder:text-ink-400 w-48"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

function FilterSelect({ value, onChange, options }) {
  return (
    <select className="bg-ink-50 rounded-xl px-3 py-2 text-sm text-ink-700 outline-none" value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
    </select>
  )
}

function FilterDate({ value, onChange, label }) {
  return (
    <label className="flex items-center gap-2 bg-ink-50 rounded-xl px-3 py-2 text-sm text-ink-500">
      {label}
      <input type="date" className="bg-transparent outline-none text-ink-700" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

function ClearButton({ onClick }) {
  return (
    <button className="flex items-center gap-1 text-xs text-ink-400 hover:text-ink-700 transition" onClick={onClick}>
      <X className="h-3.5 w-3.5" /> Clear filters
    </button>
  )
}
