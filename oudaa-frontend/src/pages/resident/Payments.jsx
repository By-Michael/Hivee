import { useRef, useState } from 'react'
import {
  Wallet, Plus, Copy, Check, Landmark, Camera, Loader2, ShieldCheck, Clock, RotateCw,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useData } from '../../context/DataContext'
import { PageHeader, Modal, Badge, EmptyState, currency, formatDate, usePagedList, Pager } from '../../components/ui'

// Small "value + copy button" row used in the "pay to" block.
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

const emptyForm = { feeId: '', payerName: '', txnId: '', reason: '' }

export default function ResidentPayments() {
  const { user } = useAuth()
  const { payments, fees, residents, community, submitSelfPayment, retractPayment, parsePaymentScreenshot, loadError, loading } = useData()
  const resident = residents.find((r) => r.id === user?.residentId) || residents[0]
  const mine = payments.filter((p) => p.residentId === resident?.id).sort((a, b) => new Date(b.date) - new Date(a.date))
  const feeOf = (id) => fees.find((f) => f.id === id)
  const { pageItems: pagedMine, page: tablePage, totalPages: tableTotalPages, total: tableTotal, setPage: setTablePage } = usePagedList(mine, 50)

  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [useMyName, setUseMyName] = useState(false)
  // phase: 'form' | 'verifying' | 'success'
  const [phase, setPhase] = useState('form')
  const [error, setError] = useState('')
  const [canRetry, setCanRetry] = useState(false)
  const [successStatus, setSuccessStatus] = useState('paid')
  const [successReviewFlags, setSuccessReviewFlags] = useState('')
  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrNote, setOcrNote] = useState('')
  const [receiptAmount, setReceiptAmount] = useState(null)
  const fileInputRef = useRef(null)

  const selectedFee = fees.find((f) => f.id === form.feeId)

  function openModal() {
    setForm({ ...emptyForm, feeId: fees[0]?.id || '' })
    setUseMyName(false)
    setPhase('form')
    setError('')
    setCanRetry(false)
    setOcrNote('')
    setReceiptAmount(null)
    setModal(true)
  }

  function closeModal() {
    if (phase === 'verifying') return // don't allow closing mid-verification
    setModal(false)
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
        let note = 'Filled in from your screenshot — please double-check before submitting.'
        // Amount isn't a form field (it's fixed by the selected fee), but if
        // the screenshot shows a different amount than the fee you picked,
        // that's exactly the kind of mismatch worth flagging before submit —
        // plain OCR text alone couldn't tell you this, only the structured
        // amount field can.
        if (result.amount != null && selectedFee && Math.abs(result.amount - Number(selectedFee.amount)) > 0.01) {
          note += ` Heads up: the screenshot shows ${result.amount}, but "${selectedFee.name}" is ${currency(selectedFee.amount)} — double-check you selected the right fee.`
        }
        setOcrNote(note)
      } else {
        setOcrNote("Couldn't read a name or transaction ID from that image. Please fill them in manually.")
      }
      setReceiptAmount(result.amount != null ? Number(result.amount) : null)
    } catch (err) {
      setOcrNote(err?.response?.data?.message || err.message || 'Could not read that screenshot.')
    } finally {
      setOcrLoading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const isAdminPreview = user?.role === 'admin'

  async function attemptSubmit() {
    setError('')
    setCanRetry(false)
    if (isAdminPreview) {
      setError("You're previewing the resident view as an admin — payment submission is only available to residents.")
      return
    }
    setPhase('verifying')
    try {
      const payment = await submitSelfPayment({
        feeId: form.feeId,
        txnId: form.txnId.trim(),
        payerName: form.payerName.trim(),
        reason: form.reason.trim(),
        receiptAmount,
      })
      setSuccessStatus(payment?.status || 'paid')
      setSuccessReviewFlags(payment?.reviewFlags || '')
      setPhase('success')
    } catch (err) {
      // No `response` means the request never reached the server (offline,
      // DNS hiccup, dropped connection, the API host itself unreachable) —
      // that's worth letting the resident retry with one tap rather than
      // re-typing the whole form. A `response` means the server answered
      // (validation error, duplicate txn ID, etc.) — retrying won't help
      // until they change something, so no retry button for those.
      const isNetworkError = !err?.response
      const serverMessage = err?.response?.data?.message
      setError(
        serverMessage ||
        (isNetworkError
          ? "Couldn't reach the server. Check your connection and try again."
          : err.message || 'Could not verify this payment.')
      )
      setCanRetry(isNetworkError || err?.response?.status >= 500)
      setPhase('form')
    }
  }

  async function submit(e) {
    e.preventDefault()
    await attemptSubmit()
  }

  const [retractingId, setRetractingId] = useState(null)
  const [retractError, setRetractError] = useState('')

  async function handleRetract(id) {
    if (!window.confirm("Retract this payment? This can't be undone — you'll need to resubmit if it was actually correct.")) return
    setRetractingId(id)
    setRetractError('')
    try {
      await retractPayment(id)
    } catch (err) {
      setRetractError(err?.response?.data?.message || 'Could not retract this payment.')
    } finally {
      setRetractingId(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="My Payments"
        subtitle={`Full contribution history for unit ${resident?.unit}`}
        action={<button onClick={openModal} className="btn-primary"><Plus className="h-4 w-4" /> Make a payment</button>}
      />

      {retractError && (
        <div className="mb-4 rounded-lg bg-rose-50 border border-rose-100 p-3 text-sm text-rose-700">{retractError}</div>
      )}

      <div className="card overflow-hidden">
        {mine.length === 0 ? (
          <EmptyState icon={Wallet} title="No payments yet" subtitle="Once you make a contribution it will show up here." />
        ) : (
          <div className="table-wrap !border-0">
            <table className="data-table">
              <thead><tr><th>Fee</th><th>Amount</th><th>Method</th><th>Paid by</th><th>Reference</th><th>Date</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {pagedMine.map((p) => (
                  <tr key={p.id}>
                    <td className="font-medium text-ink-800">{feeOf(p.feeId)?.name}</td>
                    <td className="font-semibold">{currency(p.amount)}</td>
                    <td>{p.method}</td>
                    <td className="text-ink-500">{p.payerName || '—'}</td>
                    <td className="font-mono text-xs text-ink-400">{p.reference}</td>
                    <td>{formatDate(p.date)}</td>
                    <td><Badge status={p.status} /></td>
                    <td>
                      {p.status === 'pending_review' && (
                        <button
                          onClick={() => handleRetract(p.id)}
                          disabled={retractingId === p.id}
                          className="text-xs font-medium text-rose-600 hover:text-rose-700 disabled:opacity-50"
                          title="Retract — only possible before an admin reviews it"
                        >
                          {retractingId === p.id ? 'Retracting…' : 'Retract'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pager page={tablePage} totalPages={tableTotalPages} total={tableTotal} onChange={setTablePage} pageSize={50} />
          </div>
        )}
      </div>

      <Modal open={modal} onClose={closeModal} title="Make a payment" dismissible={phase !== 'verifying'} wide>
        {phase === 'success' ? (
          successStatus === 'pending_review' ? (
            <div className="text-center py-6">
              <div className="mx-auto h-14 w-14 rounded-full bg-amber-50 flex items-center justify-center">
                <Clock className="h-7 w-7 text-amber-600" />
              </div>
              <p className="mt-4 text-lg font-bold text-ink-900">Submitted for review</p>
              <p className="mt-1 text-sm text-ink-500">
                We couldn't fully auto-verify this transaction. It's been recorded and a
                committee admin will review it shortly.
              </p>
              {successReviewFlags ? (
                <div className="mt-4 mx-auto max-w-sm rounded-lg bg-amber-50 border border-amber-100 p-3 text-left">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 mb-1">
                    Why this needs review
                  </p>
                  <ul className="text-sm text-amber-800 space-y-1 list-disc list-inside">
                    {successReviewFlags.split('. ').filter(Boolean).map((flag, i) => (
                      <li key={i}>{flag.replace(/\.$/, '')}.</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <button onClick={() => setModal(false)} className="btn-primary mt-6">Done</button>
            </div>
          ) : (
            <div className="text-center py-6">
              <div className="mx-auto h-14 w-14 rounded-full bg-emerald-50 flex items-center justify-center">
                <ShieldCheck className="h-7 w-7 text-emerald-600" />
              </div>
              <p className="mt-4 text-lg font-bold text-ink-900">Payment initiated</p>
              <p className="mt-1 text-sm text-ink-500">
                Your bank transaction was verified and this payment has been recorded as paid.
              </p>
              <button onClick={() => setModal(false)} className="btn-primary mt-6">Done</button>
            </div>
          )
        ) : phase === 'verifying' ? (
          <div className="text-center py-10">
            <Loader2 className="h-10 w-10 text-brand-600 mx-auto animate-spin" />
            <p className="mt-4 font-semibold text-ink-800">Verifying your payment…</p>
            <p className="mt-1 text-sm text-ink-500">This only takes a moment. Please don't close this window.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-5">
            <div>
              <label className="label">Fee</label>
              <select required className="input" value={form.feeId} onChange={(e) => setForm({ ...form, feeId: e.target.value })}>
                <option value="">Select fee</option>
                {fees.map((f) => <option key={f.id} value={f.id}>{f.name} · {currency(f.amount)}</option>)}
              </select>
              {fees.length === 0 && (
                <p className="mt-1.5 text-xs text-amber-600">
                  {loading
                    ? 'Loading fees…'
                    : loadError
                    ? `Couldn't load fees: ${loadError}`
                    : "No fees set up yet for your community — ask the committee to add one under Fees."}
                </p>
              )}
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
                  <CopyRow label="Amount" value={currency(selectedFee.amount)} />
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
                placeholder="e.g. August dues"
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

            {error && (
              <div className="rounded-xl bg-rose-50 border border-rose-100 px-3.5 py-2.5 text-sm text-rose-600">
                <div className="flex items-start justify-between gap-3">
                  <span>{error}</span>
                  {canRetry && (
                    <button
                      type="button"
                      onClick={attemptSubmit}
                      className="shrink-0 flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-rose-700 bg-rose-100 hover:bg-rose-200 transition"
                    >
                      <RotateCw className="h-3.5 w-3.5" /> Retry
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button type="button" onClick={closeModal} className="btn-secondary flex-1">Cancel</button>
              <button type="submit" className="btn-primary flex-1" disabled={isAdminPreview} title={isAdminPreview ? 'Admins are previewing this page — submission is resident-only' : undefined}>Submit payment</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
