import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Users,
  Wallet,
  PiggyBank,
  Receipt,
  FolderKanban,
  FileBarChart,
  ShieldCheck,
  BellRing,
  ScanLine,
  History,
  Menu,
  X,
  ChevronDown,
  ArrowRight,
  Sun,
  Moon,
  Sparkles,
  AlertTriangle,
  Clock,
  MessageSquareOff,
  Building2,
  Home,
  Warehouse,
  MapPin,
  Landmark,
  Building,
  Star,
  Quote,
  Activity,
  Globe2,
} from 'lucide-react'
import HexHive from '../components/HexHive'
import { useTheme } from '../context/ThemeContext'

const NAV_LINKS = [
  { href: '#features', label: 'What it does' },
  { href: '#use-cases', label: 'Who it\u2019s for' },
  { href: '#faq', label: 'FAQ' },
]

/* ---------------------------------- Logo --------------------------------- */

function Logo({ size = 'md', withWordmark = true }) {
  const dims = size === 'sm' ? 'h-7 w-7' : size === 'lg' ? 'h-11 w-11' : 'h-8 w-8'
  return (
    <span className="flex items-center gap-2.5">
      <img src="/landing/oudaa-h-mark-sm.png" alt="Oudaa" className={`${dims} object-contain dark:hidden`} />
      <img src="/oudaa-icon-dark-bg.png" alt="Oudaa" className={`${dims} hidden object-contain dark:block`} />
      {withWordmark && (
        <span className={`font-display font-bold text-ink-900 dark:text-white ${size === 'lg' ? 'text-2xl' : 'text-lg'}`}>
          Oudaa
        </span>
      )}
    </span>
  )
}

/* --------------------------------- Navbar --------------------------------- */

function Navbar() {
  const [open, setOpen] = useState(false)
  const { theme, toggleTheme } = useTheme()
  return (
    <header className="sticky top-0 z-40 border-b border-ink-100/70 bg-white/80 backdrop-blur-md dark:border-[#1f2a49] dark:bg-[#0b1120]/80">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
        <a href="#top" aria-label="Oudaa home">
          <Logo />
        </a>

        <nav className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm font-medium text-ink-600 transition-colors hover:text-brand-700 dark:text-ink-300 dark:hover:text-brand-300"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle dark mode"
            className="mr-1 flex h-9 w-9 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-ink-100/70 dark:text-ink-300 dark:hover:bg-[#1c2947]"
          >
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <Link to="/login" className="btn-ghost text-sm">
            Log in
          </Link>
          <Link to="/login" className="btn-primary text-sm">
            Create your platform
          </Link>
        </div>

        <div className="flex items-center gap-1 md:hidden">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle dark mode"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-500 dark:text-ink-300"
          >
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <button
            type="button"
            className="rounded-lg p-2 text-ink-600 dark:text-ink-300"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-ink-100 bg-white px-5 py-4 md:hidden dark:border-[#1f2a49] dark:bg-[#0b1120]">
          <div className="flex flex-col gap-3">
            {NAV_LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="py-1 text-sm font-medium text-ink-600 dark:text-ink-300"
              >
                {l.label}
              </a>
            ))}
            <div className="mt-2 flex flex-col gap-2 border-t border-ink-100 pt-3 dark:border-[#1f2a49]">
              <Link to="/login" className="btn-secondary justify-center text-sm">
                Log in
              </Link>
              <Link to="/login" className="btn-primary justify-center text-sm">
                Create your platform
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}

/* ---------------------------------- Hero ---------------------------------- */

function Hero() {
  const [pulse, setPulse] = useState(false)
  useEffect(() => {
    const id = setInterval(() => setPulse((p) => !p), 2400)
    return () => clearInterval(id)
  }, [])

  return (
    <section id="top" className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full opacity-30 blur-3xl"
        style={{ background: 'radial-gradient(closest-side, #2fc39d, #2570f5 55%, transparent 75%)' }}
      />

      <div className="relative mx-auto grid max-w-6xl items-stretch gap-12 px-5 pb-4 pt-16 md:grid-cols-[1.1fr_0.9fr] md:pt-24">
        <div className="relative z-10 flex flex-col justify-center">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 dark:border-[#1f3a44] dark:bg-brand-500/10 dark:text-brand-300">
            <Sparkles size={12} />
            Built for committees, trusted by residents
          </span>
          <h1 className="mt-5 max-w-xl font-display text-4xl font-bold leading-[1.1] text-ink-900 sm:text-5xl dark:text-white">
            Run your community's money{' '}
            <span className="bg-brand-gradient bg-clip-text text-transparent">in the open.</span>
          </h1>
          <p className="mt-5 max-w-md text-base leading-relaxed text-ink-600 dark:text-ink-300">
            Oudaa gives HOAs, condos and residential compounds one place to
            collect fees, verify payments against the bank, track shared
            funds, and show every resident exactly where the money goes.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link to="/login" className="btn-primary px-6 py-3 text-[0.95rem]">
              Create your platform
              <ArrowRight size={16} />
            </Link>
            <a href="#solution" className="btn-secondary px-6 py-3 text-[0.95rem]">
              See how it works
            </a>
          </div>
          <dl className="mt-12 grid max-w-md grid-cols-3 gap-6 border-t border-ink-100 pt-6 dark:border-[#1f2a49]">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-ink-400">Modules</dt>
              <dd className="mt-1 font-display text-2xl font-bold text-ink-900 dark:text-white">9</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-ink-400">Roles</dt>
              <dd className="mt-1 font-display text-2xl font-bold text-ink-900 dark:text-white">Admin & resident</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-ink-400">Setup</dt>
              <dd className="mt-1 font-display text-2xl font-bold text-ink-900 dark:text-white">Minutes</dd>
            </div>
          </dl>
        </div>

        <DashboardPreview pulse={pulse} />
      </div>
    </section>
  )
}

/* ------------------------------ Dashboard preview ---------------------------- */
// Glassmorphism "live" panel styled after the CyberShield reference
// template's security dashboard \u2014 same grid backdrop, pulse-live badge,
// stat tiles, mini bar chart and activity feed, retinted to Oudaa's
// brand teal/blue gradient and real community-finance content.

function DashboardPreview({ pulse }) {
  const bars = [40, 62, 48, 74, 58, 80, 66]
  const activity = [
    { icon: ShieldCheck, label: 'Payment verified \u2014 Unit 12B', tone: 'text-brand-500' },
    { icon: PiggyBank, label: 'Community fund reconciled', tone: 'text-teal-500' },
    { icon: Wallet, label: 'Fee collection at 94% this month', tone: 'text-ink-400 dark:text-ink-400' },
  ]
  return (
    <div className="relative min-h-[440px]">
      <div
        className="absolute inset-0 overflow-hidden rounded-3xl"
        style={{ background: 'linear-gradient(135deg, #0c1c44 0%, #155f8b 45%, #0f2b3a 100%)' }}
      >
        <HexHive intensity="vivid" />
        <div className="absolute top-10 left-8 h-32 w-32 rounded-full bg-brand-400/20 blur-3xl" />
        <div className="absolute bottom-16 right-10 h-40 w-40 rounded-full bg-teal-400/20 blur-3xl" />
      </div>

      <div className="absolute inset-0 flex items-center justify-center p-6">
        <div className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-white/15 bg-white/10 p-5 shadow-glow backdrop-blur-xl">
          <div className="pointer-events-none absolute inset-0 grid-pattern-bg opacity-30" />

          <div className="relative z-10">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold text-white">Community Dashboard</h3>
              <div className="flex items-center gap-1.5">
                <span className="relative flex h-1.5 w-1.5">
                  <span className={`absolute inline-flex h-full w-full rounded-full bg-brand-400 ${pulse ? 'animate-ping' : ''}`} />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand-400" />
                </span>
                <span className="text-[0.65rem] font-semibold uppercase tracking-wide text-white/60">Live</span>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-[0.65rem] text-white/50">Community fund</p>
                <p className="mt-1 font-display text-xl font-bold text-white">ETB 482,300</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-[0.65rem] text-white/50">Fee collection</p>
                <p className="mt-1 font-display text-xl font-bold text-brand-300">94%</p>
              </div>
            </div>

            <div className="mt-4 flex h-24 items-end justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 p-3">
              {bars.map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-sm bg-gradient-to-t from-brand-500 to-teal-300 opacity-80"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>

            <div className="mt-4 space-y-2">
              <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-white/40">Recent activity</p>
              {activity.map((a, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2">
                  <a.icon size={13} className="text-brand-300" />
                  <span className="text-[0.72rem] text-white/80">{a.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="float-badge absolute -bottom-14 -left-6 z-20 flex items-center gap-2 rounded-xl border border-ink-100 bg-white px-3.5 py-2.5 shadow-card dark:border-[#263255] dark:bg-[#131b30]">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">
              <ShieldCheck size={14} />
            </span>
            <div className="leading-tight">
              <p className="text-xs font-semibold text-ink-800 dark:text-ink-100">Payment verified</p>
              <p className="text-[0.7rem] text-ink-400">2 minutes ago</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* --------------------------------- Problem --------------------------------- */

const PROBLEMS = [
  {
    icon: MessageSquareOff,
    stat: 'Spreadsheets and group chats don\u2019t scale',
    body: 'Fee tracking scattered across chat threads and shared sheets breaks down the moment a community grows past a handful of units.',
  },
  {
    icon: AlertTriangle,
    stat: 'No one trusts the numbers by default',
    body: 'Without a shared source of truth, residents are left taking the committee\u2019s word for where the money went \u2014 and committees are left defending it.',
  },
  {
    icon: Clock,
    stat: 'Manual reconciliation eats hours every month',
    body: 'Checking payment screenshots against bank statements by hand doesn\u2019t scale with the community, and mistakes slip through.',
  },
]

function ProblemSection() {
  return (
    <section className="border-y border-ink-100 bg-white/60 py-20 dark:border-[#1f2a49] dark:bg-white/[0.02]">
      <div className="mx-auto max-w-6xl px-5">
        <div className="max-w-xl">
          <span className="text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-300">The problem</span>
          <h2 className="mt-2 font-display text-3xl font-bold text-ink-900 dark:text-white">
            Community finance breaks down the old-fashioned way
          </h2>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-3">
          {PROBLEMS.map((p) => (
            <div key={p.stat} className="glow-card p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-100 text-ink-500 dark:bg-[#1c2947] dark:text-ink-300">
                <p.icon size={19} />
              </span>
              <h3 className="mt-4 font-display text-base font-semibold text-ink-900 dark:text-white">{p.stat}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-600 dark:text-ink-300">{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* --------------------------------- Solution --------------------------------- */

const SOLUTION = [
  {
    icon: Wallet,
    title: 'Fees & payments, verified against the bank',
    body: "Residents submit a payment, and it's checked against real bank transactions instead of an honor system \u2014 so the committee never has to chase down whether something actually cleared.",
    big: true,
  },
  {
    icon: PiggyBank,
    title: 'Shared funds, visible to everyone',
    body: 'Every birr that moves through a community fund is logged and attributed. Residents see the same balances the committee sees.',
  },
  {
    icon: FileBarChart,
    title: 'Reports that answer the question first',
    body: 'Income, expenses, fund balances and project spend roll up into reports either side can open at any time.',
  },
]

function SolutionSection() {
  return (
    <section id="solution" className="mx-auto max-w-6xl px-5 py-20">
      <div className="max-w-xl">
        <span className="text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-300">The solution</span>
        <h2 className="mt-2 font-display text-3xl font-bold text-ink-900 dark:text-white">
          One system both sides can actually see
        </h2>
        <p className="mt-3 text-ink-600 dark:text-ink-300">
          Oudaa replaces the spreadsheet-plus-group-chat setup most
          communities run on with a shared, verifiable record.
        </p>
      </div>

      <div className="mt-10 grid gap-5 lg:grid-cols-3">
        {SOLUTION.map((item) => (
          <div
            key={item.title}
            className={`glow-card relative overflow-hidden p-7 ${item.big ? 'lg:col-span-2' : ''}`}
          >
            <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-mesh opacity-70" />
            <div className="relative z-10 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-gradient text-white shadow-glow">
              <item.icon size={20} />
            </div>
            <h3 className="relative z-10 mt-4 font-display text-xl font-semibold text-ink-900 dark:text-white">
              {item.title}
            </h3>
            <p className="relative z-10 mt-3 max-w-lg text-ink-600 dark:text-ink-300">{item.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

/* --------------------------------- Features --------------------------------- */

const FEATURES = [
  { icon: Users, title: 'Resident directory', body: 'Every unit and household in one roster, with self-service profiles.' },
  { icon: Receipt, title: 'Receipts & OCR', body: 'Snap a receipt and let it read the amount and vendor automatically.' },
  { icon: FolderKanban, title: 'Projects', body: 'Track shared projects from budget to completion, funded from the community pool.' },
  { icon: BellRing, title: 'Email notifications', body: 'Welcome messages, password resets and account alerts, sent automatically.' },
  { icon: History, title: 'Audit log', body: 'Every change a committee member makes is recorded and reviewable.' },
  { icon: ScanLine, title: 'Expense tracking', body: 'Log community expenses against the right fund, with a paper trail.' },
]

function FeaturesSection() {
  return (
    <section id="features" className="border-y border-ink-100 bg-white/60 py-20 dark:border-[#1f2a49] dark:bg-white/[0.02]">
      <div className="mx-auto max-w-6xl px-5">
        <span className="text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-300">What it does</span>
        <h2 className="mt-2 font-display text-3xl font-bold text-ink-900 dark:text-white">Everything a committee tracks, in one place</h2>
        <div className="mt-10 grid gap-x-6 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="glow-card flex gap-3.5 p-5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">
                <f.icon size={18} />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-ink-900 dark:text-ink-100">{f.title}</h3>
                <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">{f.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* --------------------------------- Use cases --------------------------------- */

const USE_CASES = [
  { icon: Home, title: 'Villa rows', body: 'Any number of units, from a small row to a full estate.' },
  { icon: Building2, title: 'Condo towers', body: 'One fee schedule, one fund, per building or per floor.' },
  { icon: Warehouse, title: 'Gated compounds', body: 'Shared roads, gardens and amenities tracked against the community fund.' },
  { icon: Building, title: 'Mixed-use estates', body: 'Residential and commercial units on one shared ledger.' },
  { icon: Landmark, title: 'Homeowner associations', body: 'One admin team, any number of resident households.' },
  { icon: MapPin, title: 'Remote-managed properties', body: 'Run the books for a community you don\u2019t visit day to day.' },
]

function UseCasesSection() {
  return (
    <section id="use-cases" className="mx-auto max-w-6xl px-5 py-20">
      <div className="max-w-xl">
        <span className="text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-300">Built to scale</span>
        <h2 className="mt-2 font-display text-3xl font-bold text-ink-900 dark:text-white">Built for communities like yours</h2>
        <p className="mt-3 text-ink-600 dark:text-ink-300">
          Whether it's a row of villas, a condo tower, or a gated compound
          with shared roads and gardens, Oudaa scales to however your
          community is laid out.
        </p>
      </div>
      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {USE_CASES.map((u) => (
          <div key={u.title} className="glow-card p-6">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">
              <u.icon size={19} />
            </span>
            <h3 className="mt-4 font-display text-base font-semibold text-ink-900 dark:text-white">{u.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-600 dark:text-ink-300">{u.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

/* --------------------------------- Testimonials --------------------------------- */
// Placeholder quotes \u2014 swap these for real committee/resident feedback once you have it.
const TESTIMONIALS = [
  {
    quote: 'We stopped getting messages asking where the fee money went. Everyone can just look it up now.',
    author: 'Committee chair',
    role: 'Villa compound, 42 units',
  },
  {
    quote: 'Bank verification cut our monthly reconciliation from a full day down to about an hour.',
    author: 'Treasurer',
    role: 'Condo association, 3 buildings',
  },
  {
    quote: 'Residents finally see the same numbers we see. That alone cut complaints way down.',
    author: 'Property manager',
    role: 'Gated community, 90 households',
  },
]

function TestimonialsSection() {
  return (
    <section className="border-y border-ink-100 bg-white/60 py-20 dark:border-[#1f2a49] dark:bg-white/[0.02]">
      <div className="mx-auto max-w-6xl px-5">
        <span className="text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-300">What committees say</span>
        <h2 className="mt-2 font-display text-3xl font-bold text-ink-900 dark:text-white">Built around how committees actually work</h2>
        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {TESTIMONIALS.map((t) => (
            <div key={t.author} className="glow-card p-6">
              <Quote size={20} className="text-brand-400" />
              <p className="mt-3 text-sm leading-relaxed text-ink-700 dark:text-ink-200">{t.quote}</p>
              <div className="mt-5 flex items-center gap-1 text-brand-500">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} size={13} fill="currentColor" strokeWidth={0} />
                ))}
              </div>
              <p className="mt-3 text-sm font-semibold text-ink-900 dark:text-white">{t.author}</p>
              <p className="text-xs text-ink-400">{t.role}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ----------------------------------- FAQ ------------------------------------ */

const FAQS = [
  {
    q: 'Who is Oudaa for?',
    a: 'Homeowner associations, condo buildings and gated residential compounds \u2014 anywhere a committee collects fees from residents and needs to account for shared money.',
  },
  {
    q: 'How does payment verification work?',
    a: 'When a resident submits a payment, it can be checked against real bank transaction data rather than relying on a screenshot or a promise. If verification isn\u2019t connected yet, the app falls back to manual review so nothing is blocked.',
  },
  {
    q: 'Can residents see the same numbers the committee sees?',
    a: 'Yes. Residents get their own view of fees, funds, expenses and reports for their community \u2014 not just their own account, but the shared picture the committee is working from.',
  },
  {
    q: 'What happens to our data?',
    a: 'Your community\u2019s data belongs to your community. See our Privacy Policy for the full details on what we collect and how it\u2019s used.',
  },
]

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-ink-100 py-5 dark:border-[#1f2a49]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="font-display text-base font-semibold text-ink-900 dark:text-white">{q}</span>
        <ChevronDown
          size={18}
          className={`shrink-0 text-ink-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-600 dark:text-ink-300">{a}</p>}
    </div>
  )
}

function FaqSection() {
  return (
    <section id="faq" className="mx-auto max-w-3xl px-5 py-20">
      <h2 className="font-display text-3xl font-bold text-ink-900 dark:text-white">Questions committees ask us</h2>
      <div className="mt-8">
        {FAQS.map((f) => (
          <FaqItem key={f.q} {...f} />
        ))}
      </div>
    </section>
  )
}

/* --------------------------------- Final CTA --------------------------------- */

function FinalCta() {
  return (
    <section className="mx-auto max-w-6xl px-5 pb-20">
      <div className="relative overflow-hidden rounded-3xl bg-brand-gradient px-8 py-14 text-center shadow-glow sm:px-16">
        <div className="absolute inset-0 opacity-40">
          <HexHive intensity="vivid" />
        </div>
        <img
          src="/oudaa-icon-dark-bg.png"
          alt=""
          aria-hidden="true"
          className="pointer-events-none relative z-10 mx-auto mb-5 h-14 w-14 object-contain drop-shadow-lg"
        />
        <h2 className="relative z-10 font-display text-3xl font-bold text-white">Ready to see it running with your community?</h2>
        <p className="relative z-10 mx-auto mt-3 max-w-md text-brand-50/90">
          Set up your community and start collecting fees the transparent way.
        </p>
        <Link
          to="/login"
          className="relative z-10 mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-brand-700 shadow-soft transition hover:brightness-95"
        >
          Create your platform
          <ArrowRight size={16} />
        </Link>
      </div>
    </section>
  )
}

/* ---------------------------------- Footer ---------------------------------- */

function Footer() {
  return (
    <footer className="border-t border-ink-100 bg-white py-12 dark:border-[#1f2a49] dark:bg-[#0b1120]">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Logo size="sm" />
          <p className="mt-3 max-w-xs text-sm text-ink-500 dark:text-ink-400">
            Community finance, run in the open.
          </p>
        </div>
        <div className="flex gap-16">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-400">Product</h4>
            <div className="mt-3 flex flex-col gap-2 text-sm">
              <a href="#features" className="text-ink-600 hover:text-brand-700 dark:text-ink-300">What it does</a>
              <a href="#use-cases" className="text-ink-600 hover:text-brand-700 dark:text-ink-300">Who it's for</a>
              <Link to="/login" className="text-ink-600 hover:text-brand-700 dark:text-ink-300">Log in</Link>
            </div>
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-400">Legal</h4>
            <div className="mt-3 flex flex-col gap-2 text-sm">
              <Link to="/privacy" className="text-ink-600 hover:text-brand-700 dark:text-ink-300">Privacy Policy</Link>
              <Link to="/terms" className="text-ink-600 hover:text-brand-700 dark:text-ink-300">Terms of Use</Link>
            </div>
          </div>
        </div>
      </div>
      <div className="mx-auto mt-10 max-w-6xl border-t border-ink-100 px-5 pt-6 text-xs text-ink-400 dark:border-[#1f2a49]">
        &copy; {new Date().getFullYear()} Oudaa. All rights reserved.
      </div>
    </footer>
  )
}

/* ---------------------------------- Page ------------------------------------ */

export default function Landing() {
  return (
    <div className="min-h-screen bg-transparent">
      <Navbar />
      <Hero />
      <ProblemSection />
      <SolutionSection />
      <FeaturesSection />
      <UseCasesSection />
      <TestimonialsSection />
      <FaqSection />
      <FinalCta />
      <Footer />
    </div>
  )
}
