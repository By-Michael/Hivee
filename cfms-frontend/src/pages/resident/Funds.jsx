import { useMemo, useState } from 'react'
import { Landmark, Target, Users, TrendingUp, HandCoins } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useData } from '../../context/DataContext'
import { PageHeader, Modal, currency } from '../../components/ui'
import { getMeta } from '../../lib/adapters'

const catColors = {
  Security: 'from-brand-500 to-brand-600',
  Utilities: 'from-sky-400 to-sky-600',
  Maintenance: 'from-emerald-500 to-emerald-600',
  Development: 'from-violet-500 to-violet-600',
}

export default function ResidentFunds() {
  const { user } = useAuth()
  const { funds, fees, payments, residents, addPayment } = useData()
  const total = funds.reduce((s, f) => s + f.balance, 0)
  const [contribute, setContribute] = useState(null)
  const [form, setForm] = useState({ feeId: '', amount: '', method: 'Bank Transfer' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const me = residents.find((r) => r.id === user?.residentId) || residents[0]

  const enriched = useMemo(() => funds.map((f) => {
    const feesInCategory = fees.filter((x) => x.category === f.category)
    const feeIds = new Set(feesInCategory.map((x) => x.id))
    const verifiedPayments = payments.filter((p) => feeIds.has(p.feeId) && p.status === 'paid')
    const collected = verifiedPayments.reduce((s, p) => s + p.amount, 0)
    const contributorIds = new Set(verifiedPayments.map((p) => p.residentId))
    const goal = Number(getMeta('fundGoal', f.id, 0)) || null
    return {
      ...f,
      feesInCategory,
      collected,
      contributors: contributorIds.size,
      nonContributors: Math.max(residents.length - contributorIds.size, 0),
      goal,
      pct: goal ? Math.min(100, Math.round((collected / goal) * 100)) : null,
    }
  }), [funds, fees, payments, residents])

  function openContribute(f) {
    setContribute(f)
    setForm({ feeId: f.feesInCategory[0]?.id || '', amount: f.feesInCategory[0]?.amount || '', method: 'Bank Transfer' })
    setError('')
    setDone(false)
  }

  async function submit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await addPayment({ residentId: me?.id, feeId: form.feeId, amount: Number(form.amount), method: form.method, status: 'pending' })
      setDone(true)
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Could not submit payment.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <PageHeader title="Community Funds" subtitle={`Transparent balances totalling ${currency(total)}`} />
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {enriched.map((f) => (
          <div key={f.id} className="card p-5">
            <div className={`h-11 w-11 rounded-2xl bg-gradient-to-br ${catColors[f.category] || catColors.Security} flex items-center justify-center shadow-glow`}>
              <Landmark className="h-5 w-5 text-white" />
            </div>
            <p className="mt-4 font-semibold text-ink-800">{f.name}</p>
            <span className="badge bg-ink-100 text-ink-600 mt-1">{f.category}</span>
            <p className="mt-4 text-2xl font-bold font-display text-ink-900">{currency(f.balance)}</p>
            <p className="text-xs text-ink-400">Fund balance</p>

            <div className="mt-4 space-y-2 text-xs">
              <div className="flex items-center justify-between text-ink-500">
                <span className="flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5 text-emerald-500" /> Collected</span>
                <span className="font-semibold text-ink-800">{currency(f.collected)}</span>
              </div>
              {f.goal ? (
                <>
                  <div className="flex items-center justify-between text-ink-500">
                    <span className="flex items-center gap-1.5"><Target className="h-3.5 w-3.5 text-brand-500" /> Goal</span>
                    <span className="font-semibold text-ink-800">{currency(f.goal)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-ink-100 overflow-hidden">
                    <div className="h-full bg-brand-gradient" style={{ width: `${f.pct}%` }} />
                  </div>
                </>
              ) : (
                <p className="text-ink-400 italic">No goal set yet for this fund.</p>
              )}
              <div className="flex items-center justify-between text-ink-500">
                <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-ink-400" /> Contributors</span>
                <span className="font-semibold text-ink-800">{f.contributors} paid · {f.nonContributors} haven't</span>
              </div>
            </div>

            <button
              onClick={() => openContribute(f)}
              disabled={f.feesInCategory.length === 0}
              className="mt-4 w-full btn-secondary disabled:opacity-40"
            >
              <HandCoins className="h-4 w-4" /> Contribute
            </button>
          </div>
        ))}
      </div>

      <Modal open={!!contribute} onClose={() => setContribute(null)} title={`Contribute to ${contribute?.name || ''}`}>
        {!done ? (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-sm text-ink-500">Pay more than the mandatory amount if you'd like — every extra birr goes straight to this fund.</p>
            <div>
              <label className="label">Fee</label>
              <select required className="input" value={form.feeId} onChange={(e) => setForm({ ...form, feeId: e.target.value })}>
                {contribute?.feesInCategory.map((fe) => <option key={fe.id} value={fe.id}>{fe.name} · usually {currency(fe.amount)}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Amount (ETB)</label>
                <input required type="number" min="1" className="input" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </div>
              <div>
                <label className="label">Method</label>
                <select className="input" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
                  <option>Bank Transfer</option>
                  <option>Cash</option>
                  <option>Mobile Money</option>
                </select>
              </div>
            </div>
            {error && <div className="rounded-xl bg-rose-50 border border-rose-100 px-3.5 py-2.5 text-sm text-rose-600">{error}</div>}
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setContribute(null)} className="btn-secondary flex-1">Cancel</button>
              <button type="submit" disabled={submitting} className="btn-primary flex-1">{submitting ? 'Submitting…' : 'Submit contribution'}</button>
            </div>
          </form>
        ) : (
          <div className="text-center py-4">
            <p className="text-ink-800 font-semibold">Contribution submitted</p>
            <p className="text-sm text-ink-500 mt-1">It'll show as pending until the committee verifies it against the cash or transfer received.</p>
            <button onClick={() => setContribute(null)} className="btn-primary mt-4">Done</button>
          </div>
        )}
      </Modal>
    </div>
  )
}
