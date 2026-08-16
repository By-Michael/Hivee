import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import AppLayout from './layouts/AppLayout'
import Login from './pages/Login'
import { Toaster } from './components/ui'

import AdminDashboard from './pages/admin/Dashboard'
import AdminResidents from './pages/admin/Residents'
import AdminFees from './pages/admin/Fees'
import AdminPayments from './pages/admin/Payments'
import AdminFunds from './pages/admin/Funds'
import AdminProjects from './pages/admin/Projects'
import AdminExpenses from './pages/admin/Expenses'
import AdminReports from './pages/admin/Reports'
import AdminAuditLog from './pages/admin/AuditLog'

import ResidentDashboard from './pages/resident/Dashboard'
import ResidentPayments from './pages/resident/Payments'
import ResidentFunds from './pages/resident/Funds'
import ResidentProjects from './pages/resident/Projects'
import ResidentExpenses from './pages/resident/Expenses'
import ResidentReports from './pages/resident/Reports'

import Profile from './pages/shared/Profile'

// Without this, the browser's default scroll restoration carries whatever
// scroll position a previous page was left at (e.g. half-scrolled down a
// long table) onto the next panel navigated to, so it opens already
// scrolled instead of at the top.
function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

function Protected({ role, children }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  // Admins are always also a resident of their own community (see
  // AuthContext#normalizeUser -> residentId), so they're allowed into the
  // resident-side pages too — the top-right account menu lets them switch
  // between the two views. Residents still can't cross into /admin.
  const allowed = user.role === role || (user.role === 'admin' && role === 'resident')
  if (role && !allowed) return <Navigate to={user.role === 'admin' ? '/admin' : '/resident'} replace />
  return children
}

export default function App() {
  const { user, bootstrapped } = useAuth()

  if (!bootstrapped) {
    return (
      <div className="min-h-screen flex items-center justify-center text-ink-400 text-sm">
        Loading…
      </div>
    )
  }

  return (
    <>
      <Toaster />
      <ScrollToTop />
      <Routes>
      <Route path="/login" element={user ? <Navigate to={user.role === 'admin' ? '/admin' : '/resident'} replace /> : <Login />} />

      <Route path="/admin" element={<Protected role="admin"><AppLayout role="admin" /></Protected>}>
        <Route index element={<AdminDashboard />} />
        <Route path="residents" element={<AdminResidents />} />
        <Route path="fees" element={<AdminFees />} />
        <Route path="payments" element={<AdminPayments />} />
        <Route path="funds" element={<AdminFunds />} />
        <Route path="projects" element={<AdminProjects />} />
        <Route path="expenses" element={<AdminExpenses />} />
        <Route path="reports" element={<AdminReports />} />
        <Route path="audit-log" element={<AdminAuditLog />} />
        <Route path="settings" element={<Profile />} />
        <Route path="profile" element={<Profile />} />
      </Route>

      <Route path="/resident" element={<Protected role="resident"><AppLayout role="resident" /></Protected>}>
        <Route index element={<ResidentDashboard />} />
        <Route path="payments" element={<ResidentPayments />} />
        <Route path="funds" element={<ResidentFunds />} />
        <Route path="projects" element={<ResidentProjects />} />
        <Route path="expenses" element={<ResidentExpenses />} />
        <Route path="reports" element={<ResidentReports />} />
        <Route path="profile" element={<Profile />} />
      </Route>

      <Route path="*" element={<Navigate to={user ? (user.role === 'admin' ? '/admin' : '/resident') : '/login'} replace />} />
      </Routes>
    </>
  )
}
