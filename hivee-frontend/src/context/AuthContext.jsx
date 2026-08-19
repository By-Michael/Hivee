import { createContext, useContext, useEffect, useState } from 'react'
import api, { endpoints } from '../lib/api'
import { notify } from '../components/ui'

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
  const role = (u.role || 'RESIDENT').toLowerCase()
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
    // Real database fields now — profile picture and cross-device
    // preferences (theme, sidebar state, notification mutes, default
    // export format) instead of per-browser localStorage.
    avatarUrl: u.avatarUrl || null,
    preferences: u.preferences || {},
  }
}

// Credentials for the accounts created by `npm run seed` in hivee-backend —
// used only to prefill the login form's "Try the demo" buttons. Clicking
// one still authenticates against the real API, same as typing them in by
// hand; nothing here is a stand-in for real data.
const DEMO_LOGINS = [
  { role: 'admin', email: 'admin@greenwood.example', phone: '', password: 'Password123!' },
  { role: 'resident', email: 'bob@greenwood.example', phone: '', password: 'Password123!' },
]

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('hivee_user')
    return raw ? JSON.parse(raw) : null
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [bootstrapped, setBootstrapped] = useState(false)

  useEffect(() => {
    if (user) localStorage.setItem('hivee_user', JSON.stringify(user))
    else localStorage.removeItem('hivee_user')
  }, [user])

  // Fired by the api client when a 401 survives a refresh attempt (refresh
  // cookie missing/expired/revoked) — the session is genuinely over, so
  // reflect that in state instead of leaving stale user data around while
  // every subsequent request silently 401s. Only shown when there *was* a
  // logged-in user, so it never fires spuriously on the login page itself.
  useEffect(() => {
    function handleExpired() {
      setUser((prev) => {
        if (prev) notify('Your session expired. Please sign in again.', 'info')
        return null
      })
    }
    window.addEventListener('hivee:session-expired', handleExpired)
    return () => window.removeEventListener('hivee:session-expired', handleExpired)
  }, [])

  // On first load, if we already have an access token, re-validate it
  // against /auth/me instead of trusting the cached profile forever.
  useEffect(() => {
    const token = localStorage.getItem('hivee_token')
    if (!token) {
      setBootstrapped(true)
      return
    }
    api
      .get(endpoints.me())
      .then(({ data }) => setUser(normalizeUser(data.data)))
      .catch(() => {
        localStorage.removeItem('hivee_token')
        localStorage.removeItem('hivee_user')
        setUser(null)
      })
      .finally(() => setBootstrapped(true))
  }, [])

  async function login(identifier, password) {
    setLoading(true)
    setError('')
    try {
      const { data } = await api.post(endpoints.login(), { identifier, password })
      localStorage.setItem('hivee_token', data.data.accessToken)
      // The login response already includes resident/community relations
      // (see authController.login), so no follow-up /auth/me round trip
      // is needed before the data-loading batch can start.
      const safe = normalizeUser(data.data.user)
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

  function logout() {
    // Clear local state immediately so the UI updates instantly — don't
    // wait on the network round trip. The server call is best-effort
    // (revokes the refresh cookie) and its result is ignored either way,
    // so there's nothing gained by blocking the sign-out on it.
    localStorage.removeItem('hivee_token')
    localStorage.removeItem('hivee_user')
    setUser(null)
    api.post(endpoints.logout()).catch(() => {})
  }

  // Merges a partial patch (e.g. { avatarUrl } or { preferences }) into the
  // cached user after a successful API call, so the UI reflects the change
  // immediately without a full /auth/me round trip. The database row is
  // always the source of truth — this just keeps the in-memory/localStorage
  // copy of it in sync.
  function patchUser(patch) {
    setUser((prev) => (prev ? { ...prev, ...patch } : prev))
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, error, bootstrapped, demoLogins: DEMO_LOGINS, patchUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
