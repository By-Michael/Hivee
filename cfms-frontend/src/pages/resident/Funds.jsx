import { useMemo, useRef, useState } from 'react'
import { Landmark, Target, Users, TrendingUp, HandCoins, Copy, Check, Camera, Loader2, ShieldCheck } from 'lucide-react'
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

// Small "value + copy button" row used in the "pay to" block — identical
// to the one on the Make a Payment page, so the two flows feel the same.
function CopyRow({ label, value, mono }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(String(value))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard API unavailable — silently no-op, the value is still visible to copy by hand
    }
  }
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-ink-400">{label}</p>
        <p className={`text-sm font-semibold text-ink-800 truncate ${mono ? 'font-mono' : ''}`}>{value}</p>
      </div>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand-700 bg-brand-50 hover:bg-brand-100 transition"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

const emptyForm = { feeId: '', amount: '', payerName: '', txnId: '', reason: '' }

export default function ResidentFunds() {
  const { user } = useAuth()
  const { funds, fees, payments, residents, community, submitSelfPayment, parsePaymentScreenshot } = useData()
  const total = funds.reduce((s, f) => s + f.balance, 0)
  const me = residents.find((r) => r.id === user?.residentId) || residents[0]

  const [contribute, setContribute] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [useMyName, setUseMyName] = useState(false)
  // phase: 'form' | 'verifying' | 'success'
  const [phase, setPhase] = useState('form')
  const [error, setError] = useState('')
  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrNote, setOcrNote] = useState('')
  const fileInputRef = useRef(null)

  const selectedFee = fees.find((f) => f.id === form.feeId)

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
    const fee = f.feesInCategory[0]
    setContribute(f)
    setForm({ ...emptyForm, feeId: fee?.id || '', amount: fee ? String(fee.amount) : '' })
    setUseMyName(false)
    setPhase('form')
    setError('')
    setOcrNote('')
  }

  function closeModal() {
    if (phase === 'verifying') return // don't allow closing mid-verification
    setContribute(null)
  }

  function toggleUseMyName() {
    const next = !useMyName
    setUseMyName(next)
    setForm((f) => ({ ...f, payerName: next ? (user?.name || '') : '' }))
  }

  async function handleScreenshot(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setOcrLoading(true)
    setOcrNote('')
    try {
      const result = await parsePaymentScreenshot(file)
      const updates = {}
      if (result.name) updates.payerName = result.name
      if (result.txnId) updates.txnId = result.txnId
      if (Object.keys(updates).length) {
        setForm((f) => ({ ...f, ...updates }))
        setUseMyName(false)
        setOcrNote('Filled in from your screenshot — please double-check before submitting.')
      } else {
        setOcrNote("Couldn't read a name or transaction ID from that image. Please fill them in manually.")
      }
    } catch (err) {
      setOcrNote(err?.response?.data?.message || err.message || 'Could not read that screenshot.')
    } finally {
      setOcrLoading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function submit(e) {
    e.preventDefault()
    setError('')
    setPhase('verifying')
    try {
      await submitSelfPayment({
        feeId: form.feeId,
        amount: Number(form.amount),
        txnId: form.txnId.trim(),
        payerName: form.payerName.trim(),
        reason: form.reason.trim() || `Contribution to ${contribute?.name || ''}`,
      })
      setPhase('success')
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Could not verify this payment.')
      setPhase('form')
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

      <Modal open={!!contribute} onClose={closeModal} title={`Contribute to ${contribute?.name || ''}`} dismissible={phase !== 'verifying'} wide>
        {phase === 'success' ? (
          <div className="text-center py-6">
            <div className="mx-auto h-14 w-14 rounded-full bg-emerald-50 flex items-center justify-center">
              <ShieldCheck className="h-7 w-7 text-emerald-600" />
            </div>
            <p className="mt-4 text-lg font-bold text-ink-900">Contribution recorded</p>
            <p className="mt-1 text-sm text-ink-500">
              Your bank transaction was verified and this contribution has been added to {contribute?.name}.
            </p>
            <button onClick={() => setContribute(null)} className="btn-primary mt-6">Done</button>
          </div>
        ) : phase === 'verifying' ? (
          <div className="text-center py-10">
            <Loader2 className="h-10 w-10 text-brand-600 mx-auto animate-spin" />
            <p className="mt-4 font-semibold text-ink-800">Verifying your payment…</p>
            <p className="mt-1 text-sm text-ink-500">This only takes a moment. Please don't close this window.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-5">
            <p className="text-sm text-ink-500 -mt-1">Pay more than the usual amount if you'd like — every extra birr goes straight to this fund.</p>

            <div>
              <label className="label">Fee</label>
              <select required className="input" value={form.feeId} onChange={(e) => {
                const fee = fees.find((x) => x.id === e.target.value)
                setForm({ ...form, feeId: e.target.value, amount: fee ? String(fee.amount) : form.amount })
              }}>
                {contribute?.feesInCategory.map((fe) => <option key={fe.id} value={fe.id}>{fe.name} · usually {currency(fe.amount)}</option>)}
              </select>
            </div>

            <div>
              <label className="label">Amount (ETB)</label>
              <input
                required type="number" min={selectedFee?.amount || 1} className="input"
                value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
              {selectedFee && <p className="mt-1 text-xs text-ink-400">Minimum {currency(selectedFee.amount)} — enter more to top up the fund.</p>}
            </div>

            {selectedFee && (
              <div className="rounded-xl bg-brand-50/60 ring-1 ring-brand-100 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-700 flex items-center gap-1.5 mb-1.5">
                  <Landmark className="h-3.5 w-3.5" /> Send payment to
                </p>
                <div className="divide-y divide-brand-100/80">
                  <CopyRow label="Bank" value={community?.paymentBankName || '—'} />
                  <CopyRow label="Account name" value={community?.paymentAccountName || '—'} />
                  <CopyRow label="Account number" value={community?.paymentAccountNumber || '—'} mono />
                  <CopyRow label="Amount" value={currency(Number(form.amount) || selectedFee.amount)} />
                </div>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="label !mb-0">Paid by (name on the transfer)</label>
                <label className="flex items-center gap-1.5 text-xs text-ink-500 cursor-pointer select-none">
                  <input type="checkbox" checked={useMyName} onChange={toggleUseMyName} className="rounded" />
                  Use my account name
                </label>
              </div>
              <input
                required
                className="input"
                placeholder="Full name of whoever sent the money"
                value={form.payerName}
                onChange={(e) => { setForm({ ...form, payerName: e.target.value }); setUseMyName(false) }}
              />
              <p className="mt-1 text-xs text-ink-400">If someone paid on your behalf (e.g. a family member), put their name here.</p>
            </div>

            <div>
              <label className="label">Transaction ID</label>
              <input
                required
                className="input font-mono"
                placeholder="From your bank's transfer confirmation"
                value={form.txnId}
                onChange={(e) => setForm({ ...form, txnId: e.target.value })}
              />
            </div>

            <div>
              <label className="label">Reason (optional)</label>
              <textarea
                rows={2}
                className="input"
                placeholder={`e.g. Contribution to ${contribute?.name || 'this fund'}`}
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
              />
            </div>

            <div className="rounded-xl border border-dashed border-ink-200 p-3.5">
              <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleScreenshot} />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={ocrLoading}
                className="w-full flex items-center justify-center gap-2 text-sm font-medium text-ink-600 hover:text-brand-700 disabled:opacity-50"
              >
                {ocrLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                {ocrLoading ? 'Reading screenshot…' : 'Upload a screenshot to autofill name & transaction ID'}
              </button>
              {ocrNote && <p className="mt-2 text-xs text-center text-ink-500">{ocrNote}</p>}
            </div>

            {error && <div className="rounded-xl bg-rose-50 border border-rose-100 px-3.5 py-2.5 text-sm text-rose-600">{error}</div>}

            <div className="flex gap-2 pt-2">
              <button type="button" onClick={closeModal} className="btn-secondary flex-1">Cancel</button>
              <button type="submit" className="btn-primary flex-1">Submit contribution</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
