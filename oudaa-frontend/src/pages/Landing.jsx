import { useState } from 'react'
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
} from 'lucide-react'
import HexHive from '../components/HexHive'
import { useTheme } from '../context/ThemeContext'

const NAV_LINKS = [
  { href: '#features', label: 'What it does' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#faq', label: 'FAQ' },
]

function Navbar() {
  const [open, setOpen] = useState(false)
  const { theme, toggleTheme } = useTheme()
  return (
    <header className="sticky top-0 z-40 border-b border-ink-100/70 bg-white/80 backdrop-blur-md dark:border-[#1f2a49] dark:bg-[#0b1120]/80">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
        <a href="#top" className="flex items-center gap-2">
          <img src="/landing/oudaa-h-mark-sm.png" alt="" className="h-8 w-8 dark:hidden" />
          <img src="/oudaa-icon-dark-bg.png" alt="" className="hidden h-8 w-8 dark:block" />
          <span className="font-display text-lg font-bold text-ink-900 dark:text-white">Oudaa</span>
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

function Hero() {
  return (
    <section id="top" className="relative overflow-hidden">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 pb-20 pt-16 md:grid-cols-[1.1fr_0.9fr] md:pt-24">
        <div className="relative z-10">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 dark:border-[#1f3a44] dark:bg-brand-500/10 dark:text-brand-300">
            Built for committees, trusted by residents
          </span>
          <h1 className="mt-5 max-w-xl font-display text-4xl font-bold leading-[1.1] text-ink-900 sm:text-5xl dark:text-white">
            Run your community's money in the open.
          </h1>
          <p className="mt-5 max-w-md text-base leading-relaxed text-ink-600 dark:text-ink-300">
            Oudaa gives HOAs, condos and residential compounds one place to
            collect fees, verify payments against the bank, track shared
            funds, and show every resident exactly where the money goes.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link to="/login" className="btn-primary px-6 py-3 text-[0.95rem]">
              Create your platform
            </Link>
            <a href="#how-it-works" className="btn-secondary px-6 py-3 text-[0.95rem]">
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

        <div className="relative flex items-center justify-center">
          <div className="absolute inset-0 overflow-hidden rounded-3xl">
            <HexHive />
          </div>
          <div className="relative w-full max-w-sm rounded-2xl border border-white/60 bg-white/90 p-5 shadow-glow backdrop-blur-sm dark:border-[#263255] dark:bg-[#131b30]/90">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-400">Community fund</span>
              <ShieldCheck size={16} className="text-brand-500" />
            </div>
            <p className="mt-2 font-display text-3xl font-bold text-ink-900 dark:text-white">ETB 482,300</p>
            <p className="mt-1 text-xs text-brand-600 dark:text-brand-300">+12,400 verified this week</p>
            <div className="mt-5 space-y-3 border-t border-ink-100 pt-4 dark:border-[#263255]">
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink-500 dark:text-ink-400">Fee collection</span>
                <span className="font-semibold text-ink-800 dark:text-ink-100">94%</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink-500 dark:text-ink-400">Pending review</span>
                <span className="font-semibold text-ink-800 dark:text-ink-100">3 payments</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink-500 dark:text-ink-400">Open projects</span>
                <span className="font-semibold text-ink-800 dark:text-ink-100">2</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

const SHOWCASE = [
  {
    icon: Wallet,
    title: 'Fees & payments, verified against the bank',
    body: "Residents submit a payment, and it's checked against real bank transactions instead of an honor system — so the committee never has to chase down whether something actually cleared.",
  },
  {
    icon: PiggyBank,
    title: 'Shared funds, visible to everyone',
    body: 'Every birr that moves through a community fund is logged and attributed. Residents see the same balances and history the committee sees — no separate spreadsheet, no year-end surprises.',
  },
  {
    icon: FileBarChart,
    title: 'Reports that answer the question before it\u2019s asked',
    body: 'Income, expenses, fund balances and project spend roll up into reports either side can open at any time, instead of being assembled by hand before a meeting.',
  },
]

function ShowcaseSection() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-5 py-20">
      <div className="max-w-xl">
        <h2 className="font-display text-3xl font-bold text-ink-900 dark:text-white">
          Everything a committee tracks, in one place
        </h2>
        <p className="mt-3 text-ink-600 dark:text-ink-300">
          Oudaa replaces the spreadsheet-plus-group-chat setup most
          communities run on with a system both sides can actually see.
        </p>
      </div>

      <div className="mt-14 space-y-16">
        {SHOWCASE.map((item, i) => (
          <div
            key={item.title}
            className={`grid items-center gap-8 md:grid-cols-2 ${i % 2 === 1 ? 'md:[&>*:first-child]:order-2' : ''}`}
          >
            <div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-gradient text-white shadow-glow">
                <item.icon size={20} />
              </div>
              <h3 className="mt-4 font-display text-xl font-semibold text-ink-900 dark:text-white">
                {item.title}
              </h3>
              <p className="mt-3 max-w-md text-ink-600 dark:text-ink-300">{item.body}</p>
            </div>
            <div className="card flex h-48 items-center justify-center bg-mesh md:h-56">
              <item.icon size={64} strokeWidth={1.25} className="text-brand-400/70" />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function CommunitySection() {
  return (
    <section className="mx-auto max-w-6xl px-5 pb-20">
      <div className="grid items-center gap-10 md:grid-cols-2">
        <div>
          <h2 className="font-display text-3xl font-bold text-ink-900 dark:text-white">
            Built for communities like yours
          </h2>
          <p className="mt-4 text-ink-600 dark:text-ink-300">
            Whether it's a row of villas, a condo tower, or a gated compound
            with shared roads and gardens, Oudaa scales to however your
            community is laid out — one fee schedule, one fund, one shared
            view of the books for every unit.
          </p>
          <ul className="mt-6 space-y-3 text-sm text-ink-600 dark:text-ink-300">
            <li className="flex items-start gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
              Any number of units, from a small compound to a full estate
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
              Shared amenities and common-area projects tracked against the community fund
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
              One admin team, any number of resident households
            </li>
          </ul>
        </div>
        <div className="overflow-hidden rounded-2xl border border-ink-100 shadow-card dark:border-[#263255]">
          <img
            src="/landing/community-aerial.jpg"
            alt="Aerial view of a residential villa community with shared gardens and roads"
            className="h-full w-full object-cover"
            loading="lazy"
          />
        </div>
      </div>
    </section>
  )
}

const MORE_FEATURES = [
  { icon: Users, title: 'Resident directory', body: 'Every unit and household in one roster, with self-service profiles.' },
  { icon: Receipt, title: 'Receipts & OCR', body: 'Snap a receipt and let it read the amount and vendor automatically.' },
  { icon: FolderKanban, title: 'Projects', body: 'Track shared projects from budget to completion, funded from the community pool.' },
  { icon: BellRing, title: 'Email notifications', body: 'Welcome messages, password resets and account alerts, sent automatically.' },
  { icon: History, title: 'Audit log', body: 'Every change a committee member makes is recorded and reviewable.' },
  { icon: ScanLine, title: 'Expense tracking', body: 'Log community expenses against the right fund, with a paper trail.' },
]

function MoreFeaturesSection() {
  return (
    <section className="border-y border-ink-100 bg-white/60 py-20 dark:border-[#1f2a49] dark:bg-white/[0.02]">
      <div className="mx-auto max-w-6xl px-5">
        <h2 className="font-display text-2xl font-bold text-ink-900 dark:text-white">And the rest of the day-to-day</h2>
        <div className="mt-10 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {MORE_FEATURES.map((f) => (
            <div key={f.title} className="flex gap-3.5 border-t border-ink-100 pt-4 dark:border-[#1f2a49]">
              <f.icon size={20} className="mt-0.5 shrink-0 text-brand-500" />
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

const STEPS = [
  { title: 'Create your community', body: 'Set the community name, currency and the fees residents pay.' },
  { title: 'Add residents', body: 'Bring in the roster yourself, or invite residents to join.' },
  { title: 'Collect and verify', body: 'Residents submit payments; Oudaa checks them against the bank.' },
  { title: 'Share the numbers', body: 'Funds, expenses and reports stay visible to the people paying into them.' },
]

function HowItWorks() {
  return (
    <section id="how-it-works" className="mx-auto max-w-6xl px-5 py-20">
      <h2 className="font-display text-3xl font-bold text-ink-900 dark:text-white">From zero to running in four steps</h2>
      <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <div key={s.title} className="relative">
            <span className="font-display text-4xl font-bold text-brand-200 dark:text-brand-500/30">
              {String(i + 1).padStart(2, '0')}
            </span>
            <h3 className="mt-2 font-display text-lg font-semibold text-ink-900 dark:text-white">{s.title}</h3>
            <p className="mt-2 text-sm text-ink-600 dark:text-ink-300">{s.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

const FAQS = [
  {
    q: 'Who is Oudaa for?',
    a: 'Homeowner associations, condo buildings and gated residential compounds — anywhere a committee collects fees from residents and needs to account for shared money.',
  },
  {
    q: 'How does payment verification work?',
    a: 'When a resident submits a payment, it can be checked against real bank transaction data rather than relying on a screenshot or a promise. If verification isn\u2019t connected yet, the app falls back to manual review so nothing is blocked.',
  },
  {
    q: 'Can residents see the same numbers the committee sees?',
    a: 'Yes. Residents get their own view of fees, funds, expenses and reports for their community — not just their own account, but the shared picture the committee is working from.',
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

function CtaBand() {
  return (
    <section className="mx-auto max-w-6xl px-5 pb-20">
      <div className="relative overflow-hidden rounded-3xl bg-brand-gradient px-8 py-14 text-center shadow-glow sm:px-16">
        <h2 className="font-display text-3xl font-bold text-white">Ready to see it running with your community?</h2>
        <p className="mx-auto mt-3 max-w-md text-brand-50/90">
          Set up your community and start collecting fees the transparent way.
        </p>
        <Link
          to="/login"
          className="mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-brand-700 shadow-soft transition hover:brightness-95"
        >
          Create your platform
          <ArrowRight size={16} />
        </Link>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-ink-100 bg-white py-12 dark:border-[#1f2a49] dark:bg-[#0b1120]">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <img src="/landing/oudaa-logo-light-sm.png" alt="Oudaa" className="h-7 dark:hidden" />
            <img src="/landing/oudaa-logo-dark-sm.png" alt="Oudaa" className="hidden h-7 dark:block" />
          </div>
          <p className="mt-3 max-w-xs text-sm text-ink-500 dark:text-ink-400">
            Community finance, run in the open.
          </p>
        </div>
        <div className="flex gap-16">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-400">Product</h4>
            <div className="mt-3 flex flex-col gap-2 text-sm">
              <a href="#features" className="text-ink-600 hover:text-brand-700 dark:text-ink-300">What it does</a>
              <a href="#how-it-works" className="text-ink-600 hover:text-brand-700 dark:text-ink-300">How it works</a>
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

export default function Landing() {
  return (
    <div className="min-h-screen bg-transparent">
      <Navbar />
      <Hero />
      <ShowcaseSection />
      <CommunitySection />
      <MoreFeaturesSection />
      <HowItWorks />
      <FaqSection />
      <CtaBand />
      <Footer />
    </div>
  )
}
