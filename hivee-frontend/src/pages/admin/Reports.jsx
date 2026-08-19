import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Download, FileSpreadsheet, FileText, Users, Wallet, Receipt, FolderKanban, Loader2, ChevronLeft, ChevronRight,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend,
  AreaChart, Area, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from 'recharts'
import { useData } from '../../context/DataContext'
import {
  PageHeader, currency, formatDate, Badge, ChartPlaceholder, notify,
  FilterPopover, FilterGrid, FilterField, FilterTextInput, FilterSelectInput, FilterDateInput, FilterNumberInput,
} from '../../components/ui'
import { exportToExcel, exportToPdf, exportRichPdf, captureChartImage } from '../../lib/exportUtils'
import api, { endpoints } from '../../lib/api'
import { PAYMENT_METHOD_TO_API, PAYMENT_STATUS_TO_API, PAYMENT_STATUS_TO_UI, PROJECT_STATUS_TO_API, PROJECT_STATUS_TO_UI } from '../../lib/adapters'

const PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'MOBILE_MONEY', 'CARD', 'OTHER']
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
function methodLabel(m) { return m === 'OTHER' ? 'Other' : m.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()) }

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
  const { payments, expenses, fees, funds, projects, residents, dataFullyLoaded } = useData()

  // KPI cards + charts are driven by a dedicated DB-aggregate endpoint
  // (SUM/COUNT/GROUP BY) instead of reducing the full payments/expenses
  // arrays in the browser — that reduce-over-everything was what made
  // this whole page wait 10+ seconds before showing anything, since it
  // was gated on `dataFullyLoaded` (every payment/expense row paged in).
  // The raw ledger tables further down still need the full row-level
  // data (and stay gated on dataFullyLoaded), but the summary numbers
  // and charts no longer have to wait for that.
  const [summary, setSummary] = useState(null)
  const [summaryLoading, setSummaryLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setSummaryLoading(true)
      try {
        const { data } = await api.get(endpoints.reports.dashboardSummary())
        if (!cancelled) setSummary(data.data)
      } catch (err) {
        console.error('[Reports] Failed to load summary stats:', err?.response?.data || err.message)
      } finally {
        if (!cancelled) setSummaryLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  // Belt-and-braces guard: the export buttons are disabled (and, for the
  // per-table sections, not even rendered) until dataFullyLoaded — but if
  // an export is somehow still triggered early (a stale click, a keyboard
  // shortcut, whatever), this stops it from silently shipping a report
  // built off the partial first-paint page instead of the full dataset.
  function runExport(fn) {
    return (...args) => {
      if (!dataFullyLoaded) {
        notify("Still loading the full dataset — please wait a moment and try again so the export isn't missing rows.")
        return
      }
      return fn(...args)
    }
  }

  // ---- resident filters ----
  const [residentSearch, setResidentSearch] = useState('')
  const [residentStatus, setResidentStatus] = useState('all')
  const [residentJoinedFrom, setResidentJoinedFrom] = useState('')
  const [residentJoinedTo, setResidentJoinedTo] = useState('')
  const [residentPage, setResidentPage] = useState(1)
  const RESIDENTS_PAGE_SIZE = 8
  const residentActiveCount = [
    !!residentSearch, residentStatus !== 'all', !!(residentJoinedFrom || residentJoinedTo),
  ].filter(Boolean).length
  const clearResidentFilters = () => { setResidentSearch(''); setResidentStatus('all'); setResidentJoinedFrom(''); setResidentJoinedTo('') }

  // ---- payment filters ----
  const [paySearch, setPaySearch] = useState('')
  const [payFrom, setPayFrom] = useState('')
  const [payTo, setPayTo] = useState('')
  const [payFee, setPayFee] = useState('all')
  const [payStatus, setPayStatus] = useState('all')
  const [payMethod, setPayMethod] = useState('all')
  const [payPage, setPayPage] = useState(1)
  // "Who hasn't paid" — same idea as the non-payers toggle on the
  // Payments page, surfaced here too so the committee can filter/export
  // a broader picture: not just who *did* pay, but who's missing a
  // payment for a given fee/period. Requires a specific fee (there's no
  // meaningful "hasn't paid anything" query) plus an optional year/month
  // window; defaults to active residents only.
  const [payNonPayersOnly, setPayNonPayersOnly] = useState(false)
  const [payYear, setPayYear] = useState('all')
  const [payMonth, setPayMonth] = useState('all')
  const [payIncludeInactive, setPayIncludeInactive] = useState(false)
  const PAYMENTS_PAGE_SIZE = 8
  const payActiveCount = [
    !!paySearch, payFee !== 'all', payStatus !== 'all', payMethod !== 'all', !!(payFrom || payTo),
    payNonPayersOnly, payYear !== 'all', payMonth !== 'all', payIncludeInactive,
  ].filter(Boolean).length
  const clearPayFilters = () => {
    setPaySearch(''); setPayFee('all'); setPayStatus('all'); setPayMethod('all'); setPayFrom(''); setPayTo('')
    setPayNonPayersOnly(false); setPayYear('all'); setPayMonth('all'); setPayIncludeInactive(false)
  }
  const payYearOptions = useMemo(() => {
    const years = new Set()
    const now = new Date().getFullYear()
    for (let y = now; y >= now - 6; y--) years.add(y)
    for (const p of payments) { if (p.date) years.add(new Date(p.date).getFullYear()) }
    return Array.from(years).sort((a, b) => b - a)
  }, [payments])

  // ---- payments table: server-side filtered + paginated (see backend
  // listPayments) instead of downloading the full payments table and
  // filtering with Array.filter() in the browser. Independent of
  // DataContext/dataFullyLoaded entirely — this table can show and page
  // through results as soon as its own (small, filtered) request comes
  // back, regardless of whether the full background load has finished.
  const [payItems, setPayItems] = useState([])
  const [payMeta, setPayMeta] = useState({ total: 0, totalPages: 1 })
  const [payLoading, setPayLoading] = useState(true)

  // ---- non-payers table: separate server-side filtered + paginated
  // request against the dedicated /residents/non-payers endpoint (see
  // backend listNonPayers) — kept as its own state rather than reusing
  // payItems, since the row shape (a resident with no matching payment)
  // is completely different from a payment row.
  const [payNPItems, setPayNPItems] = useState([])
  const [payNPMeta, setPayNPMeta] = useState({ total: 0, totalPages: 1 })
  const [payNPLoading, setPayNPLoading] = useState(false)

  useEffect(() => {
    if (!payNonPayersOnly) return
    if (payFee === 'all') { setPayNPItems([]); setPayNPMeta({ total: 0, totalPages: 1 }); return }
    let cancelled = false
    const timer = setTimeout(async () => {
      setPayNPLoading(true)
      try {
        const { data } = await api.get(endpoints.residentsNonPayers(), {
          params: {
            page: payPage,
            limit: PAYMENTS_PAGE_SIZE,
            feeId: payFee,
            year: payYear !== 'all' ? payYear : undefined,
            month: payMonth !== 'all' ? payMonth : undefined,
            search: paySearch || undefined,
            includeInactive: payIncludeInactive ? 'true' : undefined,
          },
        })
        if (cancelled) return
        setPayNPItems((data.data || []).map((r) => ({
          id: r.id,
          name: r.user?.fullName || '—',
          unit: r.unitNumber || '',
          phone: r.phone || '',
          email: r.user?.email || '',
          status: r.status,
        })))
        setPayNPMeta(data.meta || { total: 0, totalPages: 1 })
      } catch (err) {
        console.error('[Reports] Failed to load non-payers:', err?.response?.data || err.message)
      } finally {
        if (!cancelled) setPayNPLoading(false)
      }
    }, 300)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [payNonPayersOnly, payPage, payFee, payYear, payMonth, paySearch, payIncludeInactive])

  useEffect(() => {
    if (payNonPayersOnly) return
    let cancelled = false
    const timer = setTimeout(async () => {
      setPayLoading(true)
      try {
        const { data } = await api.get(endpoints.payments(), {
          params: {
            page: payPage,
            limit: PAYMENTS_PAGE_SIZE,
            status: payStatus !== 'all' ? PAYMENT_STATUS_TO_API[payStatus] : undefined,
            method: payMethod !== 'all' ? PAYMENT_METHOD_TO_API[payMethod] : undefined,
            feeId: payFee !== 'all' ? payFee : undefined,
            from: payFrom || undefined,
            to: payTo || undefined,
            search: paySearch || undefined,
          },
        })
        if (cancelled) return
        setPayItems((data.data || []).map((p) => ({
          id: p.id,
          residentName: p.resident?.user?.fullName || '—',
          unitNumber: p.resident?.unitNumber || '',
          feeName: p.fee?.name || '—',
          amount: Number(p.amount),
          method: methodLabel(p.paymentMethod),
          status: PAYMENT_STATUS_TO_UI[p.status] || 'pending',
          date: p.paidAt,
        })))
        setPayMeta(data.meta || { total: 0, totalPages: 1 })
      } catch (err) {
        console.error('[Reports] Failed to load payments:', err?.response?.data || err.message)
      } finally {
        if (!cancelled) setPayLoading(false)
      }
    }, 300) // debounce so typing in the search box doesn't fire a request per keystroke
    return () => { cancelled = true; clearTimeout(timer) }
  }, [payNonPayersOnly, payPage, payStatus, payMethod, payFee, payFrom, payTo, paySearch])

  // ---- expenses table: server-side filtered + paginated (see backend
  // listExpenses), same pattern as payments above — independent of
  // dataFullyLoaded, shows/pages as soon as its own small request returns.
  const [expItems, setExpItems] = useState([])
  const [expMeta, setExpMeta] = useState({ total: 0, totalPages: 1 })
  const [expLoading, setExpLoading] = useState(true)

  // ---- projects table: server-side filtered + paginated (see backend
  // listProjects), same pattern as payments/expenses above.
  const [projItems, setProjItems] = useState([])
  const [projMeta, setProjMeta] = useState({ total: 0, totalPages: 1 })
  const [projLoading, setProjLoading] = useState(true)

  // ---- expense filters ----
  const [expSearch, setExpSearch] = useState('')
  const [expFrom, setExpFrom] = useState('')
  const [expTo, setExpTo] = useState('')
  const [expCategory, setExpCategory] = useState('all')
  const [expProject, setExpProject] = useState('all')
  const [expMinAmount, setExpMinAmount] = useState('')
  const [expMaxAmount, setExpMaxAmount] = useState('')
  const [expPage, setExpPage] = useState(1)
  const EXPENSES_PAGE_SIZE = 8
  const expActiveCount = [
    !!expSearch, expCategory !== 'all', expProject !== 'all', !!(expFrom || expTo), !!(expMinAmount || expMaxAmount),
  ].filter(Boolean).length
  const clearExpFilters = () => { setExpSearch(''); setExpCategory('all'); setExpProject('all'); setExpFrom(''); setExpTo(''); setExpMinAmount(''); setExpMaxAmount('') }

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(async () => {
      setExpLoading(true)
      try {
        const { data } = await api.get(endpoints.expenses(), {
          params: {
            page: expPage,
            limit: EXPENSES_PAGE_SIZE,
            category: expCategory !== 'all' ? expCategory : undefined,
            projectId: expProject !== 'all' ? expProject : undefined,
            from: expFrom || undefined,
            to: expTo || undefined,
            minAmount: expMinAmount || undefined,
            maxAmount: expMaxAmount || undefined,
            search: expSearch || undefined,
          },
        })
        if (cancelled) return
        setExpItems((data.data || []).map((e) => ({
          id: e.id,
          description: e.description,
          vendor: e.vendor,
          category: e.category,
          projectId: e.projectId,
          projectName: e.project?.name || '—',
          amount: Number(e.amount),
          date: e.spentAt,
        })))
        setExpMeta(data.meta || { total: 0, totalPages: 1 })
      } catch (err) {
        console.error('[Reports] Failed to load expenses:', err?.response?.data || err.message)
      } finally {
        if (!cancelled) setExpLoading(false)
      }
    }, 300)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [expPage, expCategory, expProject, expFrom, expTo, expMinAmount, expMaxAmount, expSearch])

  // ---- project filters ----
  const [projSearch, setProjSearch] = useState('')
  const [projStatus, setProjStatus] = useState('all')
  const [projFund, setProjFund] = useState('all')
  const [projStartFrom, setProjStartFrom] = useState('')
  const [projStartTo, setProjStartTo] = useState('')
  const [projPage, setProjPage] = useState(1)
  const PROJECTS_PAGE_SIZE = 8
  const projActiveCount = [
    !!projSearch, projStatus !== 'all', projFund !== 'all', !!(projStartFrom || projStartTo),
  ].filter(Boolean).length
  const clearProjFilters = () => { setProjSearch(''); setProjStatus('all'); setProjFund('all'); setProjStartFrom(''); setProjStartTo('') }

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(async () => {
      setProjLoading(true)
      try {
        const { data } = await api.get(endpoints.projects(), {
          params: {
            page: projPage,
            limit: PROJECTS_PAGE_SIZE,
            status: projStatus !== 'all' ? PROJECT_STATUS_TO_API[projStatus] : undefined,
            fundId: projFund !== 'all' ? projFund : undefined,
            from: projStartFrom || undefined,
            to: projStartTo || undefined,
            search: projSearch || undefined,
          },
        })
        if (cancelled) return
        setProjItems((data.data || []).map((p) => ({
          id: p.id,
          name: p.name,
          fundId: p.fundId,
          fundName: p.fund?.name || '—',
          budget: Number(p.budget),
          spent: Number(p.spent || 0),
          status: PROJECT_STATUS_TO_UI[p.status] || 'planned',
          startDate: p.startDate,
        })))
        setProjMeta(data.meta || { total: 0, totalPages: 1 })
      } catch (err) {
        console.error('[Reports] Failed to load projects:', err?.response?.data || err.message)
      } finally {
        if (!cancelled) setProjLoading(false)
      }
    }, 300)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [projPage, projStatus, projFund, projStartFrom, projStartTo, projSearch])

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
    if ((residentJoinedFrom || residentJoinedTo) && !inRange(r.joined, residentJoinedFrom, residentJoinedTo)) return false
    return true
  }), [residents, residentStatus, residentSearch, residentJoinedFrom, residentJoinedTo])

  const filteredPayments = useMemo(() => payments.filter((p) => {
    if (payFee !== 'all' && p.feeId !== payFee) return false
    if (payStatus !== 'all' && p.status !== payStatus) return false
    if (payMethod !== 'all' && p.method !== payMethod) return false
    if ((payFrom || payTo) && !inRange(p.date, payFrom, payTo)) return false
    if (paySearch) {
      const r = residents.find((x) => x.id === p.residentId)
      const haystack = `${r?.name || ''} ${r?.unit || ''} ${p.reference || ''} ${p.method || ''}`.toLowerCase()
      if (!haystack.includes(paySearch.toLowerCase())) return false
    }
    return true
  }), [payments, payFee, payStatus, payMethod, payFrom, payTo, paySearch, residents])

  const residentPageCount = Math.max(1, Math.ceil(filteredResidents.length / RESIDENTS_PAGE_SIZE))
  const pagedResidents = filteredResidents.slice((residentPage - 1) * RESIDENTS_PAGE_SIZE, residentPage * RESIDENTS_PAGE_SIZE)

  // (payPageCount/pagedPayments removed — the on-screen table now uses
  // the server-paginated payItems/payMeta state defined below; filteredPayments
  // above is still used, unpaginated, by the Excel/PDF export functions.)

  // Reset to page 1 whenever the underlying filter criteria change.
  useEffect(() => { setResidentPage(1) }, [residentSearch, residentStatus, residentJoinedFrom, residentJoinedTo])
  useEffect(() => { setPayPage(1) }, [paySearch, payFee, payStatus, payMethod, payFrom, payTo, payNonPayersOnly, payYear, payMonth, payIncludeInactive])

  const filteredExpenses = useMemo(() => expenses.filter((e) => {
    if (expCategory !== 'all' && e.category !== expCategory) return false
    if (expProject !== 'all' && e.projectId !== expProject) return false
    if ((expFrom || expTo) && !inRange(e.date, expFrom, expTo)) return false
    if (expMinAmount && e.amount < Number(expMinAmount)) return false
    if (expMaxAmount && e.amount > Number(expMaxAmount)) return false
    if (expSearch) {
      const haystack = `${e.description || ''} ${e.vendor || ''}`.toLowerCase()
      if (!haystack.includes(expSearch.toLowerCase())) return false
    }
    return true
  }), [expenses, expCategory, expProject, expFrom, expTo, expMinAmount, expMaxAmount, expSearch])

  const filteredProjects = useMemo(() => projects.filter((p) => {
    if (projStatus !== 'all' && p.status !== projStatus) return false
    if (projFund !== 'all' && p.fundId !== projFund) return false
    if ((projStartFrom || projStartTo) && !inRange(p.startDate, projStartFrom, projStartTo)) return false
    if (projSearch && !p.name.toLowerCase().includes(projSearch.toLowerCase())) return false
    return true
  }), [projects, projStatus, projFund, projStartFrom, projStartTo, projSearch])

  // (expPageCount/pagedExpenses and projPageCount/pagedProjects removed —
  // the on-screen tables now use the server-paginated expItems/expMeta and
  // projItems/projMeta state defined above; filteredExpenses/filteredProjects
  // above are still used, unpaginated, by the Excel/PDF export functions.)

  useEffect(() => { setExpPage(1) }, [expCategory, expProject, expFrom, expTo, expMinAmount, expMaxAmount, expSearch])
  useEffect(() => { setProjPage(1) }, [projStatus, projFund, projStartFrom, projStartTo, projSearch])

  // ---- chart data (from the fast summary endpoint, not client reduces) ----
  const byFee = useMemo(() => (summary?.byFee || []).map((f, i) => ({
    name: f.name,
    total: f.total,
    fill: FEE_COLORS[i % FEE_COLORS.length],
  })), [summary])

  const byFundCategory = funds.map((f) => ({ name: f.category, value: f.balance }))

  const byExpenseCategory = useMemo(() => (
    (summary?.byExpenseCategory || []).filter((e) => e.total > 0)
      .map((e) => ({ name: e.category, value: e.total, fill: EXPENSE_COLORS[e.category] || '#64748b' }))
  ), [summary])

  const monthlyTrend = useMemo(() => (
    (summary?.monthlyTrend || []).slice(-9).map((m) => ({ month: monthLabel(m.month), Income: m.collected, Expenses: m.spent }))
  ), [summary])

  const residentStatusBreakdown = useMemo(() => {
    const active = summary?.activeResidentCount ?? 0
    const inactive = (summary?.residentCount ?? 0) - active
    return [{ name: 'Active', value: active, fill: STATUS_COLORS.active }, { name: 'Inactive', value: inactive, fill: STATUS_COLORS.inactive }]
  }, [summary])

  const projectRadar = useMemo(() => projects.slice(0, 8).map((p) => ({
    name: p.name.length > 12 ? `${p.name.slice(0, 12)}…` : p.name,
    utilisation: p.budget > 0 ? Math.min(200, Math.round((p.spent / p.budget) * 100)) : 0,
  })), [projects])

  const totalCollected = summary?.totalCollected ?? 0
  const totalExpenses = summary?.totalExpenses ?? 0
  const collectionRate = summary?.collectionRate ?? 0

  // ---- export handlers ----
  const residentColumns = [
    { header: 'Name', key: 'name', width: 26 },
    { header: 'Unit', key: 'unit', width: 12 },
    { header: 'Email', key: 'email', width: 26 },
    { header: 'Phone', key: 'phone', width: 16 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Joined', value: (r) => formatDate(r.joined), width: 16 },
  ]
  const residentMeta = [
    { label: 'Report', value: 'Residence Members' },
    { label: 'Generated', value: new Date().toLocaleString('en-GB') },
    { label: 'Filter · Status', value: residentStatus },
    { label: 'Filter · Search', value: residentSearch || 'none' },
    { label: 'Filter · Joined', value: `${residentJoinedFrom || 'all time'} → ${residentJoinedTo || 'now'}` },
    { label: 'Total members', value: filteredResidents.length },
  ]
  const exportResidentsExcel = () => exportToExcel({
    filename: 'hivee-residents-report',
    sheetName: 'Residents',
    meta: residentMeta,
    columns: residentColumns,
    rows: filteredResidents,
  })
  const exportResidentsPdf = () => exportToPdf({
    filename: 'hivee-residents-report', title: 'Residence Members Report', subtitle: 'Community membership roster', meta: residentMeta, columns: residentColumns, rows: filteredResidents,
  })

  const paymentColumns = [
    { header: 'Resident', value: (p) => residents.find((r) => r.id === p.residentId)?.name || '—', width: 24 },
    { header: 'Unit', value: (p) => residents.find((r) => r.id === p.residentId)?.unit || '—', width: 10 },
    { header: 'Fee', value: (p) => fees.find((f) => f.id === p.feeId)?.name || '—', width: 20 },
    { header: 'Amount', key: 'amount', width: 14 },
    { header: 'Method', key: 'method', width: 16 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Reference', key: 'reference', width: 18 },
    { header: 'Date', value: (p) => formatDate(p.date), width: 16 },
  ]
  const paymentMeta = [
    { label: 'Report', value: 'Collections / Payments' },
    { label: 'Generated', value: new Date().toLocaleString('en-GB') },
    { label: 'Range', value: `${payFrom || 'all time'} → ${payTo || 'now'}` },
    { label: 'Filter · Fee', value: payFee === 'all' ? 'all fees' : fees.find((f) => f.id === payFee)?.name || payFee },
    { label: 'Filter · Status', value: payStatus },
    { label: 'Filter · Method', value: payMethod === 'all' ? 'all methods' : methodLabel(payMethod) },
    { label: 'Filter · Search', value: paySearch || 'none' },
    { label: 'Total amount', value: currency(filteredPayments.filter((p) => p.status === 'paid').reduce((s, p) => s + p.amount, 0)) },
  ]
  const exportPaymentsExcel = () => exportToExcel({
    filename: 'hivee-collections-report',
    sheetName: 'Collections',
    meta: paymentMeta,
    columns: paymentColumns,
    rows: filteredPayments,
  })
  const exportPaymentsPdf = () => exportToPdf({
    filename: 'hivee-collections-report', title: 'Collections Report', subtitle: 'Verified & pending resident payments', meta: paymentMeta, columns: paymentColumns, rows: filteredPayments,
  })

  // ---- non-payers export: pulls every matching page from the same
  // /residents/non-payers endpoint the on-screen table uses (not just
  // the current page), so the export is the complete list, not a
  // snapshot of whatever happened to be on screen.
  async function fetchAllNonPayers() {
    const limit = 1000
    let page = 1
    let all = []
    for (let i = 0; i < 50; i++) {
      const { data } = await api.get(endpoints.residentsNonPayers(), {
        params: {
          page, limit, feeId: payFee, year: payYear !== 'all' ? payYear : undefined,
          month: payMonth !== 'all' ? payMonth : undefined, search: paySearch || undefined,
          includeInactive: payIncludeInactive ? 'true' : undefined,
        },
      })
      all = all.concat((data.data || []).map((r) => ({
        id: r.id, name: r.user?.fullName || '—', unit: r.unitNumber || '', phone: r.phone || '',
        email: r.user?.email || '', status: r.status,
      })))
      if (!data.meta || page >= data.meta.totalPages) break
      page += 1
    }
    return all
  }
  const nonPayersColumns = [
    { header: 'Resident', key: 'name', width: 24 },
    { header: 'Unit', key: 'unit', width: 12 },
    { header: 'Phone', key: 'phone', width: 16 },
    { header: 'Email', key: 'email', width: 26 },
    { header: 'Status', key: 'status', width: 12 },
  ]
  const nonPayersPeriodLabel = () => {
    if (payYear === 'all') return 'ever'
    if (payMonth === 'all') return payYear
    return `${MONTH_NAMES[Number(payMonth)]} ${payYear}`
  }
  const nonPayersMeta = () => [
    { label: 'Report', value: 'Non-payers' },
    { label: 'Generated', value: new Date().toLocaleString('en-GB') },
    { label: 'Fee', value: fees.find((f) => f.id === payFee)?.name || payFee },
    { label: 'Period', value: nonPayersPeriodLabel() },
    { label: 'Includes inactive residents', value: payIncludeInactive ? 'yes' : 'no' },
    { label: 'Filter · Search', value: paySearch || 'none' },
  ]
  const exportNonPayersExcel = async () => {
    const rows = await fetchAllNonPayers()
    exportToExcel({ filename: 'hivee-non-payers-report', sheetName: 'Non-payers', meta: nonPayersMeta(), columns: nonPayersColumns, rows })
  }
  const exportNonPayersPdf = async () => {
    const rows = await fetchAllNonPayers()
    exportToPdf({
      filename: 'hivee-non-payers-report', title: 'Non-payers Report',
      subtitle: `Residents with no payment recorded for "${fees.find((f) => f.id === payFee)?.name || payFee}" (${nonPayersPeriodLabel()})`,
      meta: nonPayersMeta(), columns: nonPayersColumns, rows,
    })
  }

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
    { label: 'Filter · Category', value: expCategory === 'all' ? 'all categories' : expCategory },
    { label: 'Filter · Project', value: expProject === 'all' ? 'all projects' : projects.find((p) => p.id === expProject)?.name || expProject },
    { label: 'Filter · Amount', value: `${expMinAmount ? currency(Number(expMinAmount)) : 'any'} – ${expMaxAmount ? currency(Number(expMaxAmount)) : 'any'}` },
    { label: 'Filter · Search', value: expSearch || 'none' },
    { label: 'Total spent', value: currency(filteredExpenses.reduce((s, e) => s + e.amount, 0)) },
  ]
  const exportExpensesExcel = () => exportToExcel({ filename: 'hivee-expenses-report', sheetName: 'Expenses', meta: expenseMeta, columns: expenseColumns, rows: filteredExpenses })
  const exportExpensesPdf = () => exportToPdf({
    filename: 'hivee-expenses-report', title: 'Expenses Report', subtitle: 'Community fund expenditure', meta: expenseMeta, columns: expenseColumns, rows: filteredExpenses,
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
    { label: 'Filter · Status', value: projStatus },
    { label: 'Filter · Fund', value: projFund === 'all' ? 'all funds' : funds.find((f) => f.id === projFund)?.name || projFund },
    { label: 'Filter · Start date', value: `${projStartFrom || 'all time'} → ${projStartTo || 'now'}` },
    { label: 'Filter · Search', value: projSearch || 'none' },
    { label: 'Total budget', value: currency(filteredProjects.reduce((s, p) => s + p.budget, 0)) },
    { label: 'Total spent', value: currency(filteredProjects.reduce((s, p) => s + p.spent, 0)) },
  ]
  const exportProjectsExcel = () => exportToExcel({ filename: 'hivee-projects-report', sheetName: 'Projects', meta: projectMeta, columns: projectColumns, rows: filteredProjects })
  const exportProjectsPdf = () => exportToPdf({
    filename: 'hivee-projects-report', title: 'Projects Report', subtitle: 'Budget vs. spend by project', meta: projectMeta, columns: projectColumns, rows: filteredProjects,
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
        filename: 'hivee-financial-summary',
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
        filename: 'hivee-full-report',
        title: 'Complete Hivee Report',
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
            <button className="btn-secondary" onClick={runExport(exportFullSummaryPdf)} disabled={exportingSummary || !dataFullyLoaded} title={!dataFullyLoaded ? 'Waiting for all data to finish loading…' : undefined}>
              {exportingSummary ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              {exportingSummary ? 'Building…' : 'Summary PDF'}
            </button>
            <button className="btn-primary" onClick={runExport(exportEverythingPdf)} disabled={exportingEverything || !dataFullyLoaded} title={!dataFullyLoaded ? 'Waiting for all data to finish loading…' : undefined}>
              {exportingEverything ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {exportingEverything ? 'Building…' : 'Export everything'}
            </button>
          </div>
        }
      />

      {summaryLoading ? (
        // KPI cards and charts come from the DB-aggregate summary
        // endpoint (see reportsSummary on the backend) — this only waits
        // on that one fast request, not on the full payments/expenses
        // tables paging into the browser.
        <div className="card p-10">
          <ChartPlaceholder height={320} label="Loading report summary…" />
        </div>
      ) : (
      <>
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

      {/* ---------------- Payments report ----------------
          Server-side filtered + paginated (see the payLoading effect
          above) — independent of dataFullyLoaded, so this table shows
          and pages through results as soon as its own small request
          comes back, without waiting for the rest of the dataset.
          Also doubles as "who hasn't paid": toggling Non-payers only
          switches the whole section (filters, table, export) over to
          the /residents/non-payers endpoint instead of /payments, so
          the committee can pull and export either side of the picture —
          who paid, or who's missing a payment — from the same panel. */}
      <SectionCard
        icon={Wallet}
        title="Collections / payments"
        subtitle={
          payNonPayersOnly
            ? (payFee === 'all'
              ? 'Pick a fee below to see who hasn\'t paid it'
              : `${payNPMeta.total} resident${payNPMeta.total === 1 ? '' : 's'} haven't paid "${fees.find((f) => f.id === payFee)?.name || ''}" (${nonPayersPeriodLabel()})`)
            : `${payMeta.total} payment${payMeta.total === 1 ? '' : 's'} match the current filters`
        }
        exportActions={
          payNonPayersOnly
            ? [
              { label: 'Excel', icon: FileSpreadsheet, onClick: runExport(exportNonPayersExcel) },
              { label: 'PDF', icon: FileText, onClick: runExport(exportNonPayersPdf) },
            ]
            : [
              { label: 'Excel', icon: FileSpreadsheet, onClick: runExport(exportPaymentsExcel) },
              { label: 'PDF', icon: FileText, onClick: runExport(exportPaymentsPdf) },
            ]
        }
      >
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <button
            type="button"
            onClick={() => setPayNonPayersOnly((v) => !v)}
            className={`btn-secondary text-xs ${payNonPayersOnly ? '!bg-brand-600 !text-white !border-brand-600' : ''}`}
            title="Switch between payments made and residents who haven't paid"
          >
            {payNonPayersOnly ? 'Showing: non-payers' : 'Show non-payers instead'}
          </button>
          <FilterPopover active={payActiveCount} onClear={clearPayFilters}>
            <FilterGrid>
              <FilterField label="Search" full>
                <FilterTextInput
                  placeholder={payNonPayersOnly ? 'Search resident, unit, phone…' : 'Search resident, unit, reference…'}
                  value={paySearch}
                  onChange={setPaySearch}
                />
              </FilterField>
              <FilterField label={payNonPayersOnly ? 'Fee (required)' : 'Fee'}>
                <FilterSelectInput value={payFee} onChange={setPayFee} options={[['all', 'All fees'], ...fees.map((f) => [f.id, f.name])]} />
              </FilterField>
              {payNonPayersOnly ? (
                <>
                  <FilterField label="Year">
                    <FilterSelectInput value={payYear} onChange={setPayYear} options={[['all', 'Any year'], ...payYearOptions.map((y) => [String(y), String(y)])]} />
                  </FilterField>
                  <FilterField label="Month">
                    <FilterSelectInput value={payMonth} onChange={setPayMonth} options={[['all', 'Any month'], ...MONTH_NAMES.map((m, i) => [String(i), m])]} />
                  </FilterField>
                  <FilterField label="Inactive residents">
                    <FilterSelectInput
                      value={payIncludeInactive ? 'yes' : 'no'}
                      onChange={(v) => setPayIncludeInactive(v === 'yes')}
                      options={[['no', 'Active only'], ['yes', 'Include inactive']]}
                    />
                  </FilterField>
                </>
              ) : (
                <>
                  <FilterField label="Status">
                    <FilterSelectInput value={payStatus} onChange={setPayStatus} options={[['all', 'All statuses'], ['paid', 'Paid'], ['pending', 'Pending'], ['rejected', 'Rejected']]} />
                  </FilterField>
                  <FilterField label="Method">
                    <FilterSelectInput value={payMethod} onChange={setPayMethod} options={[['all', 'All methods'], ...PAYMENT_METHODS.map((m) => [m, methodLabel(m)])]} />
                  </FilterField>
                  <FilterField label="From">
                    <FilterDateInput value={payFrom} onChange={setPayFrom} />
                  </FilterField>
                  <FilterField label="To">
                    <FilterDateInput value={payTo} onChange={setPayTo} />
                  </FilterField>
                </>
              )}
            </FilterGrid>
          </FilterPopover>
        </div>
        {payNonPayersOnly ? (
          payFee === 'all' ? (
            <div className="text-center text-ink-400 py-10 text-sm">Pick a fee from the filters above to see who hasn't paid it.</div>
          ) : payNPLoading && payNPItems.length === 0 ? (
            <ChartPlaceholder height={180} label="Loading non-payers…" />
          ) : (
          <>
          <TableScroll>
            <table className="report-table">
              <thead><tr><th>Resident</th><th>Unit</th><th>Phone</th><th>Email</th><th>Status</th></tr></thead>
              <tbody>
                {payNPItems.map((r) => (
                  <tr key={r.id} style={{ opacity: payNPLoading ? 0.5 : 1 }}>
                    <td className="font-medium text-ink-800">{r.name}</td>
                    <td>{r.unit}</td>
                    <td className="text-ink-500">{r.phone}</td>
                    <td className="text-ink-500">{r.email}</td>
                    <td><Badge status={r.status?.toLowerCase() === 'active' ? 'active' : 'inactive'} /></td>
                  </tr>
                ))}
                {payNPItems.length === 0 && (
                  <tr><td colSpan={5} className="text-center text-ink-400 py-6">Everyone's paid — no non-payers match these filters.</td></tr>
                )}
              </tbody>
            </table>
          </TableScroll>
          <Pagination page={payPage} pageCount={payNPMeta.totalPages} onChange={setPayPage} total={payNPMeta.total} pageSize={PAYMENTS_PAGE_SIZE} label="residents" />
          </>
          )
        ) : payLoading && payItems.length === 0 ? (
          <ChartPlaceholder height={180} label="Loading payments…" />
        ) : (
        <>
        <TableScroll>
          <table className="report-table">
            <thead><tr><th>Resident</th><th>Fee</th><th>Amount</th><th>Method</th><th>Status</th><th>Date</th></tr></thead>
            <tbody>
              {payItems.map((p) => (
                <tr key={p.id} style={{ opacity: payLoading ? 0.5 : 1 }}>
                  <td className="font-medium text-ink-800">{p.residentName}{p.unitNumber ? ` (${p.unitNumber})` : ''}</td>
                  <td>{p.feeName}</td>
                  <td className="font-semibold">{currency(p.amount)}</td>
                  <td className="text-ink-500">{p.method}</td>
                  <td><Badge status={p.status} /></td>
                  <td className="text-ink-500">{formatDate(p.date)}</td>
                </tr>
              ))}
              {payItems.length === 0 && (
                <tr><td colSpan={6} className="text-center text-ink-400 py-6">No payments match these filters.</td></tr>
              )}
            </tbody>
          </table>
        </TableScroll>
        <Pagination page={payPage} pageCount={payMeta.totalPages} onChange={setPayPage} total={payMeta.total} pageSize={PAYMENTS_PAGE_SIZE} label="payments" />
        </>
        )}
      </SectionCard>

      {!dataFullyLoaded ? (
        // Residents is the only remaining table that still filters/shows
        // raw rows client-side, so it's the only one still gated on the
        // full dataset being paged in. Payments/expenses/projects are all
        // server-side filtered + paginated now (see their effects above)
        // and render independently of dataFullyLoaded.
        <div className="card p-10">
          <ChartPlaceholder height={220} label="Loading the full dataset for the members table…" />
        </div>
      ) : (
      <>
      {/* ---------------- Residents report ---------------- */}
      <SectionCard
        icon={Users}
        title="Residence members"
        subtitle={`${filteredResidents.length} of ${residents.length} members match the current filters`}
        exportActions={[
          { label: 'Excel', icon: FileSpreadsheet, onClick: runExport(exportResidentsExcel) },
          { label: 'PDF', icon: FileText, onClick: runExport(exportResidentsPdf) },
        ]}
      >
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <FilterPopover active={residentActiveCount} onClear={clearResidentFilters}>
            <FilterGrid>
              <FilterField label="Search" full>
                <FilterTextInput placeholder="Search name, unit, email…" value={residentSearch} onChange={setResidentSearch} />
              </FilterField>
              <FilterField label="Status">
                <FilterSelectInput value={residentStatus} onChange={setResidentStatus} options={[['all', 'All statuses'], ['active', 'Active'], ['inactive', 'Inactive']]} />
              </FilterField>
              <FilterField label="Joined from">
                <FilterDateInput value={residentJoinedFrom} onChange={setResidentJoinedFrom} />
              </FilterField>
              <FilterField label="Joined to">
                <FilterDateInput value={residentJoinedTo} onChange={setResidentJoinedTo} />
              </FilterField>
            </FilterGrid>
          </FilterPopover>
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
      </>
      )}

      {/* ---------------- Expenses report ----------------
          Server-side filtered + paginated (see the expLoading effect
          above) — independent of dataFullyLoaded, same as payments. */}
      <SectionCard
        icon={Receipt}
        title="Expenses"
        subtitle={`${expMeta.total} expense${expMeta.total === 1 ? '' : 's'} match the current filters`}
        exportActions={[
          { label: 'Excel', icon: FileSpreadsheet, onClick: runExport(exportExpensesExcel) },
          { label: 'PDF', icon: FileText, onClick: runExport(exportExpensesPdf) },
        ]}
      >
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <FilterPopover active={expActiveCount} onClear={clearExpFilters}>
            <FilterGrid>
              <FilterField label="Search" full>
                <FilterTextInput placeholder="Search description, vendor…" value={expSearch} onChange={setExpSearch} />
              </FilterField>
              <FilterField label="Category">
                <FilterSelectInput value={expCategory} onChange={setExpCategory} options={[['all', 'All categories'], ...EXPENSE_CATEGORIES.map((c) => [c, c.charAt(0) + c.slice(1).toLowerCase()])]} />
              </FilterField>
              <FilterField label="Project">
                <FilterSelectInput value={expProject} onChange={setExpProject} options={[['all', 'All projects'], ...projects.map((p) => [p.id, p.name])]} />
              </FilterField>
              <FilterField label="From">
                <FilterDateInput value={expFrom} onChange={setExpFrom} />
              </FilterField>
              <FilterField label="To">
                <FilterDateInput value={expTo} onChange={setExpTo} />
              </FilterField>
              <FilterField label="Min amount">
                <FilterNumberInput placeholder="0" value={expMinAmount} onChange={setExpMinAmount} />
              </FilterField>
              <FilterField label="Max amount">
                <FilterNumberInput placeholder="Any" value={expMaxAmount} onChange={setExpMaxAmount} />
              </FilterField>
            </FilterGrid>
          </FilterPopover>
        </div>
        {expLoading && expItems.length === 0 ? (
          <ChartPlaceholder height={180} label="Loading expenses…" />
        ) : (
        <>
        <TableScroll>
          <table className="report-table">
            <thead><tr><th>Description</th><th>Category</th><th>Project</th><th>Vendor</th><th>Amount</th><th>Date</th></tr></thead>
            <tbody>
              {expItems.map((e) => (
                <tr key={e.id} style={{ opacity: expLoading ? 0.5 : 1 }}>
                  <td className="font-medium text-ink-800">{e.description || '—'}</td>
                  <td><span className="badge" style={{ background: `${EXPENSE_COLORS[e.category] || '#64748b'}1a`, color: EXPENSE_COLORS[e.category] || '#64748b' }}>{e.category}</span></td>
                  <td>{e.projectName}</td>
                  <td className="text-ink-500">{e.vendor || '—'}</td>
                  <td className="font-semibold">{currency(e.amount)}</td>
                  <td className="text-ink-500">{formatDate(e.date)}</td>
                </tr>
              ))}
              {expItems.length === 0 && (
                <tr><td colSpan={6} className="text-center text-ink-400 py-6">No expenses match these filters.</td></tr>
              )}
            </tbody>
          </table>
        </TableScroll>
        <Pagination page={expPage} pageCount={expMeta.totalPages} onChange={setExpPage} total={expMeta.total} pageSize={EXPENSES_PAGE_SIZE} label="expenses" />
        </>
        )}
      </SectionCard>

      {/* ---------------- Projects report ----------------
          Server-side filtered + paginated (see the projLoading effect
          above) — independent of dataFullyLoaded, same as payments. */}
      <SectionCard
        icon={FolderKanban}
        title="Projects"
        subtitle={`${projMeta.total} project${projMeta.total === 1 ? '' : 's'} match the current filters`}
        exportActions={[
          { label: 'Excel', icon: FileSpreadsheet, onClick: runExport(exportProjectsExcel) },
          { label: 'PDF', icon: FileText, onClick: runExport(exportProjectsPdf) },
        ]}
        last
      >
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <FilterPopover active={projActiveCount} onClear={clearProjFilters}>
            <FilterGrid>
              <FilterField label="Search" full>
                <FilterTextInput placeholder="Search project name…" value={projSearch} onChange={setProjSearch} />
              </FilterField>
              <FilterField label="Status">
                <FilterSelectInput value={projStatus} onChange={setProjStatus} options={[['all', 'All statuses'], ['planned', 'Planned'], ['in-progress', 'In progress'], ['completed', 'Completed'], ['cancelled', 'Cancelled']]} />
              </FilterField>
              <FilterField label="Fund">
                <FilterSelectInput value={projFund} onChange={setProjFund} options={[['all', 'All funds'], ...funds.map((f) => [f.id, f.name])]} />
              </FilterField>
              <FilterField label="Start from">
                <FilterDateInput value={projStartFrom} onChange={setProjStartFrom} />
              </FilterField>
              <FilterField label="Start to">
                <FilterDateInput value={projStartTo} onChange={setProjStartTo} />
              </FilterField>
            </FilterGrid>
          </FilterPopover>
        </div>
        {projLoading && projItems.length === 0 ? (
          <ChartPlaceholder height={180} label="Loading projects…" />
        ) : (
        <>
        <TableScroll>
          <table className="report-table">
            <thead><tr><th>Project</th><th>Fund</th><th>Budget</th><th>Spent</th><th>Remaining</th><th>Status</th></tr></thead>
            <tbody>
              {projItems.map((p) => (
                <tr key={p.id} style={{ opacity: projLoading ? 0.5 : 1 }}>
                  <td className="font-medium text-ink-800">{p.name}</td>
                  <td className="text-ink-500">{p.fundName}</td>
                  <td>{currency(p.budget)}</td>
                  <td>{currency(p.spent)}</td>
                  <td className={p.budget - p.spent < 0 ? 'text-rose-500 font-semibold' : ''}>{currency(p.budget - p.spent)}</td>
                  <td><Badge status={p.status} /></td>
                </tr>
              ))}
              {projItems.length === 0 && (
                <tr><td colSpan={6} className="text-center text-ink-400 py-6">No projects match these filters.</td></tr>
              )}
            </tbody>
          </table>
        </TableScroll>
        <Pagination page={projPage} pageCount={projMeta.totalPages} onChange={setProjPage} total={projMeta.total} pageSize={PROJECTS_PAGE_SIZE} label="projects" />
        </>
        )}
      </SectionCard>
      </>
      )}

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


