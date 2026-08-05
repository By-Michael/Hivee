import { createContext, useContext, useEffect, useState } from 'react'
import api, { endpoints } from '../lib/api'

const AuthContext = createContext(null)

const AVATAR_COLORS = ['#1554d6', '#2570f5', '#5aa4ff', '#a9caff', '#0c1c44']
function avatarColorFor(id) {
  if (!id) return AVATAR_COLORS[0]
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

// Normalizes the backend's User (+ optional resident/community includes)
// into the flat shape every page in this app already expects.
function normalizeUser(u) {
  if (!u) return null
  const role = (u.role || 'RESIDENT').toLowerCase().replace('super_admin', 'admin')
  return {
    id: u.id,
    name: u.fullName,
    email: u.email,
    role,
    rawRole: u.role,
    community: u.community?.name || '',
    communityId: u.communityId,
    residentId: u.resident?.id,
    unitNumber: u.resident?.unitNumber,
    avatarColor: avatarColorFor(u.id),
  }
}

// Credentials for the accounts created by `npm run seed` in cfms-backend —
// used only to prefill the login form's "Try the demo" buttons. Clicking
// one still authenticates against the real API, same as typing them in by
// hand; nothing here is a stand-in for real data.
const DEMO_LOGINS = [
  { role: 'admin', email: 'admin@greenwood.example', password: 'Password123!' },
  { role: 'resident', email: 'bob@greenwood.example', password: 'Password123!' },
]

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('cfms_user')
    return raw ? JSON.parse(raw) : null
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [bootstrapped, setBootstrapped] = useState(false)

  useEffect(() => {
    if (user) localStorage.setItem('cfms_user', JSON.stringify(user))
    else localStorage.removeItem('cfms_user')
  }, [user])

  // On first load, if we already have an access token, re-validate it
  // against /auth/me instead of trusting the cached profile forever.
  useEffect(() => {
    const token = localStorage.getItem('cfms_token')
    if (!token) {
      setBootstrapped(true)
      return
    }
    api
      .get(endpoints.me())
      .then(({ data }) => setUser(normalizeUser(data.data)))
      .catch(() => {
        localStorage.removeItem('cfms_token')
        localStorage.removeItem('cfms_user')
        setUser(null)
      })
      .finally(() => setBootstrapped(true))
  }, [])

  async function login(email, password) {
    setLoading(true)
    setError('')
    try {
      const { data } = await api.post(endpoints.login(), { email, password })
      localStorage.setItem('cfms_token', data.data.accessToken)
      // login() doesn't include resident/community relations — fetch the
      // full profile once so community name / residentId are available.
      const me = await api.get(endpoints.me())
      const safe = normalizeUser(me.data.data)
      setUser(safe)
      return safe
    } catch (e) {
      const msg = e?.response?.data?.message || e.message || 'Login failed.'
      setError(msg)
      throw new Error(msg)
    } finally {
      setLoading(false)
    }
  }

  async function logout() {
    try {
      await api.post(endpoints.logout())
    } catch {
      // best-effort — clear local state regardless
    }
    localStorage.removeItem('cfms_token')
    localStorage.removeItem('cfms_user')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, error, bootstrapped, demoLogins: DEMO_LOGINS }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
