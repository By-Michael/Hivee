import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, Receipt, Wallet, FolderKanban, FileText,
  BarChart3, LogOut, Menu, X, Bell, Search, Landmark, ChevronDown,
  PanelLeftClose, UserCog, AlertCircle, CheckCircle2, Clock,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useData } from '../context/DataContext'
import { currency, formatDate } from '../components/ui'

const adminNav = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/residents', label: 'Residents', icon: Users },
  { to: '/admin/fees', label: 'Fees', icon: Receipt },
  { to: '/admin/payments', label: 'Payments', icon: Wallet },
  { to: '/admin/funds', label: 'Funds', icon: Landmark },
  { to: '/admin/projects', label: 'Projects', icon: FolderKanban },
  { to: '/admin/expenses', label: 'Expenses', icon: FileText },
  { to: '/admin/reports', label: 'Reports', icon: BarChart3 },
]

const residentNav = [
  { to: '/resident', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/resident/payments', label: 'My Payments', icon: Wallet },
  { to: '/resident/funds', label: 'Community Funds', icon: Landmark },
  { to: '/resident/projects', label: 'Projects', icon: FolderKanban },
  { to: '/resident/expenses', label: 'Expenses', icon: FileText },
]

export default function AppLayout({ role }) {
  const nav = role === 'admin' ? adminNav : residentNav
  const base = role === 'admin' ? '/admin' : '/resident'
  const [open, setOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('cfms_sidebar_collapsed') === '1')
  const [navCollapsed, setNavCollapsed] = useState(collapsed)
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const { user, logout } = useAuth()
  const data = useData()
  const { residents, payments, projects, fees, expenses, funds } = data
  const navigate = useNavigate()
  const menuRef = useRef(null)
  const notifRef = useRef(null)
  const searchRef = useRef(null)

  useEffect(() => {
    localStorage.setItem('cfms_sidebar_collapsed', collapsed ? '1' : '0')
    if (collapsed) {
      const t = setTimeout(() => setNavCollapsed(true), 300)
      return () => clearTimeout(t)
    }
    setNavCollapsed(false)
  }, [collapsed])

  // Close dropdowns on outside click.
  useEffect(() => {
    function onDown(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false)
      if (searchRef.current && !searchRef.current.contains(e.target)) setSearchOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  function handleLogout() {
    logout()
    navigate('/login')
  }

  // ---- Notifications: derived from real data, not decorative ----
  const notifications = useMemo(() => {
    const items = []
    if (role === 'admin') {
      const pending = payments.filter((p) => p.status === 'pending')
      pending.slice(0, 5).forEach((p) => {
        const r = residents.find((x) => x.id === p.residentId)
        items.push({
          id: `pay-${p.id}`,
          icon: Clock,
          tone: 'amber',
          title: `Payment awaiting verification`,
          detail: `${r?.name || 'A resident'} · ${currency(p.amount)}`,
          date: p.date,
          to: `${base}/payments`,
        })
      })
      const noReceipt = expenses.filter((e) => !e.receiptId)
      noReceipt.slice(0, 5).forEach((e) => {
        items.push({
          id: `exp-${e.id}`,
          icon: AlertCircle,
          tone: 'rose',
          title: `Expense missing a receipt`,
          detail: `${e.description} · ${currency(e.amount)}`,
          date: e.date,
          to: `${base}/expenses`,
        })
      })
    } else {
      const me = residents.find((r) => r.id === user?.residentId) || residents[0]
      const myPayments = payments.filter((p) => p.residentId === me?.id)
      const paidFeeIds = new Set(myPayments.filter((p) => p.status !== 'rejected').map((p) => p.feeId))
      fees.filter((f) => !paidFeeIds.has(f.id)).slice(0, 5).forEach((f) => {
        items.push({
          id: `fee-${f.id}`,
          icon: AlertCircle,
          tone: 'amber',
          title: `${f.name} is unpaid`,
          detail: `${currency(f.amount)} · ${f.frequency}`,
          date: null,
          to: `${base}/payments`,
        })
      })
      myPayments.filter((p) => p.status === 'paid').slice(0, 3).forEach((p) => {
        items.push({
          id: `mp-${p.id}`,
          icon: CheckCircle2,
          tone: 'emerald',
          title: `Payment verified`,
          detail: `${currency(p.amount)} on ${formatDate(p.date)}`,
          date: p.date,
          to: `${base}/payments`,
        })
      })
    }
    return items
  }, [role, payments, residents, expenses, fees, user, base])

  // ---- Global search across residents / payments / projects / expenses / funds ----
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const results = []
    if (role === 'admin') {
      residents.forEach((r) => {
        if ([r.name, r.unit, r.phone, r.email].join(' ').toLowerCase().includes(q)) {
          results.push({ id: `r-${r.id}`, group: 'Residents', label: r.name, sub: r.unit, to: `${base}/residents` })
        }
      })
    }
    payments.forEach((p) => {
      const r = residents.find((x) => x.id === p.residentId)
      if ([r?.name, p.reference].join(' ').toLowerCase().includes(q)) {
        results.push({ id: `p-${p.id}`, group: 'Payments', label: `${r?.name || 'Payment'} · ${currency(p.amount)}`, sub: p.reference, to: `${base}/payments` })
      }
    })
    projects.forEach((pr) => {
      if (pr.name.toLowerCase().includes(q)) {
        results.push({ id: `pr-${pr.id}`, group: 'Projects', label: pr.name, sub: currency(pr.budget), to: `${base}/projects` })
      }
    })
    expenses.forEach((e) => {
      if ([e.description, e.vendor].join(' ').toLowerCase().includes(q)) {
        results.push({ id: `e-${e.id}`, group: 'Expenses', label: e.description, sub: e.vendor, to: `${base}/expenses` })
      }
    })
    funds.forEach((f) => {
      if (f.name.toLowerCase().includes(q)) {
        results.push({ id: `f-${f.id}`, group: 'Funds', label: f.name, sub: f.category, to: `${base}/funds` })
      }
    })
    return results.slice(0, 8)
  }, [query, role, residents, payments, projects, expenses, funds, base])

  function goToResult(r) {
    setSearchOpen(false)
    setQuery('')
    navigate(r.to)
  }

  return (
    <div className="min-h-screen flex">
      {/* Sidebar - desktop */}
      <aside className={`hidden lg:flex lg:flex-col shrink-0 border-r border-ink-100 bg-white/80 backdrop-blur-xl py-6 h-screen sticky top-0 transition-[width,padding] duration-300 ease-in-out ${collapsed ? 'w-20 px-2' : 'w-72 px-4'}`}>
        <div className={`flex items-center ${navCollapsed ? 'justify-center' : ''}`}>
          <Brand collapsed={collapsed} navCollapsed={navCollapsed} />
        </div>
        <div className={`mt-4 pb-4 border-b border-ink-50 flex justify-start`}>
          <button
            onClick={() => setCollapsed((v) => !v)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={`p-2 rounded-lg text-ink-400 hover:bg-ink-100 hover:text-ink-600 shrink-0 transition-transform duration-300 ease-in-out ${collapsed ? 'rotate-180' : ''}`}
          >
            <PanelLeftClose className="h-4.5 w-4.5" />
          </button>
        </div>
        <nav className="mt-2 flex-1 space-y-1 overflow-y-auto">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) => `sidebar-link ${navCollapsed ? 'collapsed' : ''} ${isActive ? 'active' : ''}`}
            >
              <item.icon className="h-4.5 w-4.5 shrink-0" strokeWidth={2} />
              <span className={`overflow-hidden whitespace-nowrap transition-all duration-300 ease-in-out ${collapsed ? 'max-w-0 opacity-0' : 'max-w-[160px] opacity-100'}`}>
                {item.label}
              </span>
            </NavLink>
          ))}
        </nav>
        <div className="shrink-0 space-y-2 pt-2 border-t border-ink-50">
          <button onClick={handleLogout} title={collapsed ? 'Sign out' : undefined} className={`sidebar-link ${navCollapsed ? 'collapsed' : ''} w-full text-rose-500 hover:bg-rose-50 hover:text-rose-600`}>
            <LogOut className="h-4.5 w-4.5 shrink-0" />
            <span className={`overflow-hidden whitespace-nowrap transition-all duration-300 ease-in-out ${collapsed ? 'max-w-0 opacity-0' : 'max-w-[160px] opacity-100'}`}>
              Sign out
            </span>
          </button>
        </div>
      </aside>

      {/* Sidebar - mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink-900/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 bg-white px-4 py-6 flex flex-col animate-fade-up">
            <div className="flex items-center justify-between">
              <Brand />
              <button onClick={() => setOpen(false)} className="p-1.5 text-ink-400"><X className="h-5 w-5" /></button>
            </div>
            <nav className="mt-8 flex-1 space-y-1 overflow-y-auto">
              {nav.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} onClick={() => setOpen(false)}
                  className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                  <item.icon className="h-4.5 w-4.5" />
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <button onClick={handleLogout} className="sidebar-link text-rose-500 hover:bg-rose-50 shrink-0">
              <LogOut className="h-4.5 w-4.5" /> Sign out
            </button>
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-ink-100 bg-white/80 backdrop-blur-xl px-4 py-3 sm:px-8">
          <button onClick={() => setOpen(true)} className="lg:hidden p-2 rounded-lg hover:bg-ink-100 text-ink-600">
            <Menu className="h-5 w-5" />
          </button>
          <div className="hidden sm:flex items-center gap-2 flex-1 max-w-md relative" ref={searchRef}>
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
              <input
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSearchOpen(true) }}
                onFocus={() => setSearchOpen(true)}
                placeholder="Search residents, payments, projects…"
                className="input pl-9 bg-ink-50/70 border-transparent focus:bg-white"
              />
            </div>
            {searchOpen && query.trim() && (
              <div className="absolute left-0 right-0 top-full mt-2 card p-1.5 max-h-80 overflow-y-auto z-40">
                {searchResults.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-ink-400 text-center">No matches for "{query}"</p>
                ) : (
                  searchResults.map((r) => (
                    <button key={r.id} onClick={() => goToResult(r)} className="w-full text-left flex items-center justify-between gap-3 rounded-lg px-3 py-2 hover:bg-brand-50 transition">
                      <div>
                        <p className="text-sm font-medium text-ink-800">{r.label}</p>
                        <p className="text-xs text-ink-400">{r.sub}</p>
                      </div>
                      <span className="badge bg-ink-100 text-ink-500 shrink-0">{r.group}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <div className="flex-1 sm:hidden" />

          <div className="flex items-center gap-1 ml-auto">
          <div className="relative" ref={notifRef}>
            <button onClick={() => setNotifOpen((v) => !v)} className="relative p-2 rounded-lg hover:bg-ink-100 text-ink-500">
              <Bell className="h-5 w-5" />
              {notifications.length > 0 && (
                <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-brand-500 ring-2 ring-white" />
              )}
            </button>
            {notifOpen && (
              <div className="absolute right-0 mt-2 w-80 card p-1.5 z-40 max-h-96 overflow-y-auto select-none">
                <div className="px-3 py-2 border-b border-ink-50 flex items-center justify-between">
                  <p className="text-sm font-semibold text-ink-800">Notifications</p>
                  <span className="text-xs text-ink-400">{notifications.length}</span>
                </div>
                {notifications.length === 0 ? (
                  <p className="px-3 py-6 text-sm text-ink-400 text-center">You're all caught up.</p>
                ) : (
                  notifications.map((n) => {
                    const toneMap = { amber: 'text-amber-600 bg-amber-50', rose: 'text-rose-600 bg-rose-50', emerald: 'text-emerald-600 bg-emerald-50' }
                    return (
                      <button
                        key={n.id}
                        onClick={() => { setNotifOpen(false); navigate(n.to) }}
                        className="w-full text-left flex items-start gap-2.5 rounded-lg px-3 py-2.5 hover:bg-ink-50 transition"
                      >
                        <div className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ${toneMap[n.tone]}`}>
                          <n.icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-ink-800 truncate">{n.title}</p>
                          <p className="text-xs text-ink-400 truncate">{n.detail}</p>
                        </div>
                      </button>
                    )
                  })
                )}
              </div>
            )}
          </div>

          <div className="relative" ref={menuRef}>
            <button onClick={() => setMenuOpen((v) => !v)} className="flex items-center gap-2.5 pl-2 pr-1 py-1 rounded-xl hover:bg-ink-100 transition select-none">
              <Avatar user={user} />
              <div className="hidden sm:block text-left">
                <p className="text-sm font-semibold text-ink-800 leading-tight">{user?.name}</p>
                <p className="text-xs text-ink-400 capitalize leading-tight">{user?.role}</p>
              </div>
              <ChevronDown className="h-4 w-4 text-ink-400 hidden sm:block" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-52 card p-1.5 z-40 select-none">
                <div className="px-3 py-2 border-b border-ink-50">
                  <p className="text-sm font-medium text-ink-800 truncate">{user?.name}</p>
                  <p className="text-xs text-ink-400 truncate">{user?.community}</p>
                </div>
                <button
                  onClick={() => { setMenuOpen(false); navigate(`${base}/profile`) }}
                  className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-600 hover:bg-brand-50 hover:text-brand-700 mt-1"
                >
                  <UserCog className="h-4 w-4" /> Profile settings
                </button>
                <button onClick={handleLogout} className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-rose-500 hover:bg-rose-50 mt-1">
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </div>
            )}
          </div>
          </div>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-8 sm:py-8 max-w-[1400px] w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function Avatar({ user }) {
  const pic = user?.id ? localStorage.getItem(`cfms_avatar_${user.id}`) : null
  if (pic) {
    return <img src={pic} alt="" className="h-9 w-9 rounded-full object-cover shrink-0 ring-1 ring-ink-100" />
  }
  return (
    <div
      className="h-9 w-9 rounded-full flex items-center justify-center text-white text-sm font-bold font-display shrink-0"
      style={{ background: user?.avatarColor || '#2570f5' }}
    >
      {user?.name?.split(' ').map((n) => n[0]).slice(0, 2).join('')}
    </div>
  )
}

function Brand({ collapsed, navCollapsed }) {
  return (
    <div className={`flex items-center transition-all duration-300 ease-in-out ${navCollapsed ? 'justify-center w-full gap-0' : 'px-1 gap-2.5'}`}>
      <div className="h-10 w-10 rounded-2xl bg-brand-gradient flex items-center justify-center shadow-glow shrink-0">
        <Landmark className="h-5 w-5 text-white" strokeWidth={2.3} />
      </div>
      <div className={`overflow-hidden whitespace-nowrap transition-all duration-300 ease-in-out ${collapsed ? 'max-w-0 opacity-0' : 'max-w-[180px] opacity-100'}`}>
        <p className="font-display font-bold text-ink-900 leading-tight">CFMS</p>
        <p className="text-[11px] text-ink-400 leading-tight">Community Fund Manager</p>
      </div>
    </div>
  )
}
