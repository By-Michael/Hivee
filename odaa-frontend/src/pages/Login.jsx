import { useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { Landmark, Mail, Phone, Lock, Eye, EyeOff, ShieldCheck, TrendingUp, Users } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { login, loading, error, demoLogins } = useAuth()
  const [method, setMethod] = useState('email') // 'email' | 'phone'
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  async function onSubmit(e) {
    e.preventDefault()
    try {
      const identifier = method === 'email' ? email : phone
      const u = await login(identifier, password)
      const dest = location.state?.from || (u.role === 'admin' ? '/admin' : '/resident')
      navigate(dest, { replace: true })
    } catch {
      // error shown via context
    }
  }

  async function fillDemo(role) {
    const d = demoLogins.find((x) => x.role === role)
    setEmail(d.email)
    setPassword(d.password)
    try {
      const u = await login(d.email, d.password)
      const dest = location.state?.from || (u.role === 'admin' ? '/admin' : '/resident')
      navigate(dest, { replace: true })
    } catch {
      // error shown via context
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 login-page">
      {/* Left - brand panel */}
      <div className="hidden lg:flex flex-col justify-between bg-brand-gradient relative overflow-hidden px-12 py-10 text-white">
        <div className="absolute inset-0 opacity-[0.15]" style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
          backgroundSize: '28px 28px',
        }} />
        <div className="relative flex items-center gap-1">
          <img src="/odaa-logo.png" alt="Odaa" className="h-14 w-14 object-contain" />
          <span className="font-display font-bold text-xl">daa</span>
        </div>

        <div className="relative max-w-md">
          <h1 className="font-display text-4xl font-bold leading-tight">
            Every birr accounted for. Every resident in the loop.
          </h1>
          <p className="mt-4 text-brand-100 text-base leading-relaxed">
            A single, transparent home for contributions, community funds, projects, and receipts —
            built for committees and residents to trust the same numbers.
          </p>

          <div className="mt-10 space-y-4">
            <Feature icon={ShieldCheck} text="Every payment logged with a verifiable receipt trail" />
            <Feature icon={TrendingUp} text="Live fund balances across security, maintenance & projects" />
            <Feature icon={Users} text="Residents see exactly where their contributions go" />
          </div>
        </div>

        <p className="relative text-xs text-brand-100/80">© {new Date().getFullYear()} Community Fund Management System · v1.0</p>
      </div>

      {/* Right - form */}
      <div className="flex items-center justify-center px-6 py-12 bg-white">
        <div className="w-full max-w-sm animate-fade-up">
          <div className="lg:hidden flex items-center gap-1 mb-8">
            <img src="/odaa-logo.png" alt="Odaa" className="h-12 w-12 object-contain" />
            <span className="font-display font-bold text-lg text-ink-900">daa</span>
          </div>

          <h2 className="text-2xl font-bold text-ink-900">Welcome back</h2>
          <p className="mt-1.5 text-sm text-ink-500">Sign in to manage your community's finances.</p>

          <form onSubmit={onSubmit} className="mt-7 space-y-4">
            <div>
              <label className="label">Sign in with</label>
              <div className="relative flex rounded-xl border border-ink-200 bg-ink-50 p-1">
                <span
                  className="absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-lg bg-white shadow-soft transition-transform duration-300 ease-out"
                  style={{ transform: method === 'phone' ? 'translateX(calc(100% + 8px))' : 'translateX(0)' }}
                />
                <button
                  type="button"
                  onClick={() => setMethod('email')}
                  className={`relative z-10 flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-sm font-medium transition-colors duration-200 ${method === 'email' ? 'text-brand-700' : 'text-ink-400 hover:text-ink-600'}`}
                >
                  <Mail className="h-3.5 w-3.5" /> Email
                </button>
                <button
                  type="button"
                  onClick={() => setMethod('phone')}
                  className={`relative z-10 flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-sm font-medium transition-colors duration-200 ${method === 'phone' ? 'text-brand-700' : 'text-ink-400 hover:text-ink-600'}`}
                >
                  <Phone className="h-3.5 w-3.5" /> Phone
                </button>
              </div>
            </div>

            {method === 'email' ? (
              <div>
                <label className="label">Email address</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
                  <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@community.org" className="input pl-10" />
                </div>
              </div>
            ) : (
              <div className="animate-fade-up">
                <label className="label">Phone number</label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
                  <input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                    placeholder="+251 9xx xxx xxx" className="input pl-10" />
                </div>
              </div>
            )}
            <div>
              <label className="label">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
                <input required type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••" className="input pl-10 pr-10" />
                <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-600">
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-xl bg-rose-50 border border-rose-100 px-3.5 py-2.5 text-sm text-rose-600">
                {error}
              </div>
            )}

            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 text-ink-500">
                <input type="checkbox" className="rounded border-ink-300 text-brand-600 focus:ring-brand-400" />
                Remember me
              </label>
              <Link to="/forgot-password" className="text-brand-600 font-medium hover:text-brand-700">Forgot password?</Link>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full py-3">
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div className="mt-6 rounded-2xl border border-dashed border-brand-200 bg-brand-50/60 p-4">
            <p className="text-xs font-semibold text-brand-700 mb-1">Try the demo</p>
            <p className="text-[11px] text-ink-400 mb-2">One click, no typing — signs you straight in.</p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => fillDemo('admin')}
                className="btn-secondary flex-1 !py-2 text-xs disabled:opacity-60"
              >
                {loading ? 'Signing in…' : 'Committee login'}
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => fillDemo('resident')}
                className="btn-secondary flex-1 !py-2 text-xs disabled:opacity-60"
              >
                {loading ? 'Signing in…' : 'Resident login'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Feature({ icon: Icon, text }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-8 w-8 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center ring-1 ring-white/30 shrink-0">
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-sm text-brand-50">{text}</p>
    </div>
  )
}
