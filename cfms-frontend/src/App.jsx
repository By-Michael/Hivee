import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import AppLayout from './layouts/AppLayout'
import Login from './pages/Login'

import AdminDashboard from './pages/admin/Dashboard'
import AdminResidents from './pages/admin/Residents'
import AdminFees from './pages/admin/Fees'
import AdminPayments from './pages/admin/Payments'
import AdminFunds from './pages/admin/Funds'
import AdminProjects from './pages/admin/Projects'
import AdminExpenses from './pages/admin/Expenses'
import AdminReports from './pages/admin/Reports'

import ResidentDashboard from './pages/resident/Dashboard'
import ResidentPayments from './pages/resident/Payments'
import ResidentFunds from './pages/resident/Funds'
import ResidentProjects from './pages/resident/Projects'
import ResidentExpenses from './pages/resident/Expenses'

import Profile from './pages/shared/Profile'

function Protected({ role, children }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (role && user.role !== role) return <Navigate to={user.role === 'admin' ? '/admin' : '/resident'} replace />
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
        <Route path="profile" element={<Profile />} />
      </Route>

      <Route path="/resident" element={<Protected role="resident"><AppLayout role="resident" /></Protected>}>
        <Route index element={<ResidentDashboard />} />
        <Route path="payments" element={<ResidentPayments />} />
        <Route path="funds" element={<ResidentFunds />} />
        <Route path="projects" element={<ResidentProjects />} />
        <Route path="expenses" element={<ResidentExpenses />} />
        <Route path="profile" element={<Profile />} />
      </Route>

      <Route path="*" element={<Navigate to={user ? (user.role === 'admin' ? '/admin' : '/resident') : '/login'} replace />} />
    </Routes>
  )
}
