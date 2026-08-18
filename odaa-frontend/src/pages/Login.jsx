import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Mail, Phone, Lock, Eye, EyeOff, ShieldCheck, TrendingUp, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login, loading, error, demoLogins } = useAuth();
  const [method, setMethod] = useState('email'); // 'email' | 'phone'
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Refs for hex SVG generation
  const svgRef = useRef(null);

  // Generate hex grid on mount
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const HEX_R = 34;
    const GAP = 3;
    const r = HEX_R;
    const w = r * 2;
    const hStep = w * 0.75;
    const vStep = r * Math.sqrt(3);
    const cols = 20;
    const rows = 12;
    const width = cols * hStep + w;
    const height = rows * vStep + vStep;

    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    // Clear any existing children except possible defs
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    svg.appendChild(g);

    for (let col = 0; col < cols; col++) {
      for (let row = 0; row < rows; row++) {
        const cx = col * hStep + r;
        const cy = row * vStep + (col % 2 ? vStep / 2 : 0) + vStep / 2;
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        // Hex path
        const pts = [];
        for (let i = 0; i < 6; i++) {
          const a = Math.PI / 180 * (60 * i);
          pts.push((cx + (r - GAP) * Math.cos(a)).toFixed(1) + ',' + (cy + (r - GAP) * Math.sin(a)).toFixed(1));
        }
        path.setAttribute('d', 'M' + pts.join('L') + 'Z');
        path.setAttribute('class', 'hex-cell');
        const delay = (Math.random() * 7).toFixed(2);
        const dur = (6 + Math.random() * 6).toFixed(2);
        const peak = (0.20 + Math.random() * 0.30).toFixed(2);
        path.style.animationDelay = delay + 's';
        path.style.animationDuration = dur + 's';
        path.style.setProperty('--peak', peak);
        g.appendChild(path);
      }
    }
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    try {
      const identifier = method === 'email' ? email : phone;
      const u = await login(identifier, password);
      const dest = location.state?.from || (u.role === 'admin' ? '/admin' : '/resident');
      navigate(dest, { replace: true });
    } catch {
      // error shown via context
    }
  }

  async function fillDemo(role) {
    const d = demoLogins.find((x) => x.role === role);
    if (!d) return;
    setEmail(d.email);
    setPassword(d.password);
    try {
      const u = await login(d.email, d.password);
      const dest = location.state?.from || (u.role === 'admin' ? '/admin' : '/resident');
      navigate(dest, { replace: true });
    } catch {
      // error shown via context
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-[#f4f6fb]">
      {/* Left Panel – Brand & Features */}
      <div
        className="hidden lg:flex flex-col justify-between relative overflow-hidden px-12 py-10 text-white"
        style={{
          background:
            'linear-gradient(135deg, #0b2b6b 0%, #1554d6 42%, #2570f5 75%, #4f94ff 100%)',
        }}
      >
        {/* Hex background */}
        <svg
          ref={svgRef}
          className="absolute inset-0 w-full h-full filter blur-[2.5px] opacity-55"
          style={{ transform: 'scale(1.04) translate(-1.2%, -1.2%)', animation: 'hexDrift 26s ease-in-out infinite' }}
          preserveAspectRatio="xMidYMid slice"
        />
        {/* Scrim */}
        <div
          className="absolute inset-0 z-0"
          style={{
            background:
              'linear-gradient(to right, rgba(6,20,58,0.55) 0%, rgba(8,28,77,0.30) 45%, rgba(8,28,77,0.10) 75%)',
          }}
        />
        {/* Brand */}
        <div className="relative z-10 flex items-center gap-2">
          <span
            className="shrink-0"
            style={{
              color: '#FFD700',
              fontWeight: 900,
              fontSize: '44px',
              lineHeight: 1,
              textShadow: '0 2px 6px rgba(0,0,0,0.45)',
              background: 'transparent',
            }}
          >
            H
          </span>
          <span
            className="font-display font-extrabold text-2xl"
            style={{ textShadow: '0 2px 10px rgba(0,0,0,0.35)' }}
          >
            <span className="text-amber-300">i</span>vee
          </span>
        </div>

        {/* Hero */}
        <div className="relative z-10 max-w-md">
          <h1
            className="font-display text-4xl font-extrabold leading-tight tracking-tight"
            style={{ textShadow: '0 2px 14px rgba(0,0,0,0.45)' }}
          >
            Every birr accounted for. Every resident in the loop.
          </h1>
          <p
            className="mt-4 text-white/95 text-base font-medium leading-relaxed"
            style={{ textShadow: '0 1px 8px rgba(0,0,0,0.35)' }}
          >
            A single, transparent home for contributions, community funds, projects, and receipts —
            built for committees and residents to trust the same numbers.
          </p>

          <div className="mt-10 space-y-4">
            <Feature icon={ShieldCheck} text="Every payment logged with a verifiable receipt trail" />
            <Feature icon={TrendingUp} text="Live fund balances across security, maintenance & projects" />
            <Feature icon={Users} text="Residents see exactly where their contributions go" />
          </div>
        </div>

        <p className="relative z-10 text-xs font-semibold text-white/85">
          © {new Date().getFullYear()} Community Fund Management System · v1.0
        </p>
      </div>

      {/* Right Panel – Login Form */}
      <div className="flex items-center justify-center px-6 py-12 bg-white">
        <div className="w-full max-w-sm">
          {/* Mobile brand */}
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <span
              className="shrink-0"
              style={{
                color: '#FFD700',
                fontWeight: 900,
                fontSize: '36px',
                lineHeight: 1,
                textShadow: '0 1px 4px rgba(0,0,0,0.2)',
                background: 'transparent',
              }}
            >
              H
            </span>
            <span className="font-display font-bold text-xl text-ink-900">
              <span className="text-amber-500">i</span>vee
            </span>
          </div>

          <h2 className="text-2xl font-bold text-ink-900">Welcome back</h2>
          <p className="mt-1.5 text-sm text-ink-500">Sign in to manage your community's finances.</p>

          <form onSubmit={onSubmit} className="mt-7 space-y-4">
            {/* Toggle: Email / Phone */}
            <div>
              <label className="label text-xs font-bold uppercase tracking-wider text-ink-600 block mb-2">
                Sign in with
              </label>
              <div className="relative flex rounded-xl border border-ink-200 bg-ink-50 p-1">
                <span
                  className="absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-lg bg-white shadow-soft transition-transform duration-300 ease-out"
                  style={{ transform: method === 'phone' ? 'translateX(calc(100% + 8px))' : 'translateX(0)' }}
                />
                <button
                  type="button"
                  onClick={() => setMethod('email')}
                  className={`relative z-10 flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-sm font-medium transition-colors duration-200 ${
                    method === 'email' ? 'text-brand-600' : 'text-ink-400 hover:text-ink-600'
                  }`}
                >
                  <Mail className="h-3.5 w-3.5" /> Email
                </button>
                <button
                  type="button"
                  onClick={() => setMethod('phone')}
                  className={`relative z-10 flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-sm font-medium transition-colors duration-200 ${
                    method === 'phone' ? 'text-brand-600' : 'text-ink-400 hover:text-ink-600'
                  }`}
                >
                  <Phone className="h-3.5 w-3.5" /> Phone
                </button>
              </div>
            </div>

            {/* Email / Phone input */}
            {method === 'email' ? (
              <div>
                <label className="label text-xs font-bold uppercase tracking-wider text-ink-600 block mb-1.5">
                  Email address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
                  <input
                    required
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@community.org"
                    className="input w-full rounded-xl border border-ink-200 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="label text-xs font-bold uppercase tracking-wider text-ink-600 block mb-1.5">
                  Phone number
                </label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
                  <input
                    required
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+251 9xx xxx xxx"
                    className="input w-full rounded-xl border border-ink-200 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
                  />
                </div>
              </div>
            )}

            {/* Password */}
            <div>
              <label className="label text-xs font-bold uppercase tracking-wider text-ink-600 block mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
                <input
                  required
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input w-full rounded-xl border border-ink-200 py-2.5 pl-10 pr-10 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-600"
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-xl bg-rose-50 border border-rose-100 px-3.5 py-2.5 text-sm text-rose-600">
                {error}
              </div>
            )}

            {/* Remember & Forgot */}
            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 text-ink-500 cursor-pointer">
                <input type="checkbox" className="rounded border-ink-300 text-brand-600 focus:ring-brand-400" />
                Remember me
              </label>
              <Link to="/forgot-password" className="text-brand-600 font-medium hover:text-brand-700">
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 py-3 text-sm font-bold text-white shadow-lg shadow-brand-200 transition hover:brightness-105 disabled:opacity-60"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          {/* Demo box */}
          <div className="mt-6 rounded-2xl border border-dashed border-brand-200 bg-brand-50/60 p-4">
            <p className="text-xs font-semibold text-brand-700 mb-1">Try the demo</p>
            <p className="text-[11px] text-ink-400 mb-2">One click, no typing — signs you straight in.</p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => fillDemo('admin')}
                className="btn-secondary flex-1 rounded-lg border border-ink-200 bg-white py-2 text-xs font-bold text-brand-600 transition hover:bg-brand-50 disabled:opacity-60"
              >
                {loading ? 'Signing in…' : 'Committee login'}
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => fillDemo('resident')}
                className="btn-secondary flex-1 rounded-lg border border-ink-200 bg-white py-2 text-xs font-bold text-brand-600 transition hover:bg-brand-50 disabled:opacity-60"
              >
                {loading ? 'Signing in…' : 'Resident login'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Global animation styles (tailwind doesn't cover hex keyframes) */}
      <style jsx>{`
        @keyframes hexDrift {
          0%, 100% { transform: scale(1) translate(0,0); }
          50% { transform: scale(1.04) translate(-1.2%,-1.2%); }
        }
        .hex-cell {
          animation-name: hexPulse;
          animation-timing-function: ease-in-out;
          animation-iteration-count: infinite;
        }
        @keyframes hexPulse {
          0%, 100% { fill: rgba(255,255,255,0.06); stroke: rgba(255,255,255,0.22); }
          50% { fill: rgba(255,214,130,var(--peak, 0.28)); stroke: rgba(255,224,160,0.7); }
        }
      `}</style>
    </div>
  );
}

// Feature component (reusable)
function Feature({ icon: Icon, text }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-8 w-8 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center ring-1 ring-white/30 shrink-0">
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-sm font-semibold text-white" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.3)' }}>
        {text}
      </p>
    </div>
  );
}