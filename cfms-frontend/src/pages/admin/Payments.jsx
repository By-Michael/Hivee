import { useMemo, useState } from 'react'
import { Plus, Search, Wallet, Filter, ChevronDown, Check, X as XIcon } from 'lucide-react'
import { useData } from '../../context/DataContext'
import { PageHeader, Modal, EmptyState, currency, formatDate, ConfirmDialog, Badge } from '../../components/ui'

const empty = { residentId: '', feeId: '', amount: '', method: 'Bank Transfer', status: 'paid', reference: '' }

function ResidentPicker({ residents, value, onChange }) {
  const [term, setTerm] = useState('')
  const [open, setOpen] = useState(false)
  const selected = residents.find((r) => r.id === value)

  const matches = useMemo(() => {
    const q = term.trim().toLowerCase()
    if (!q) return []
    return residents.filter((r) => [r.name, r.phone, r.unit].join(' ').toLowerCase().startsWith(q) ||
      [r.name, r.phone, r.unit].some((f) => (f || '').toLowerCase().startsWith(q))).slice(0, 8)
  }, [term, residents])

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
        <input
          className="input pl-10"
          placeholder={selected ? `${selected.name} · ${selected.unit}` : 'Type a name, phone, or ID no…'}
          value={term}
          onChange={(e) => { setTerm(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
        />
      </div>
      {open && term.trim() && (
        <div className="absolute left-0 right-0 top-full mt-1 card p-1.5 max-h-56 overflow-y-auto z-20">
          {matches.length === 0 ? (
            <p className="px-3 py-3 text-sm text-ink-400 text-center">No residents match "{term}"</p>
          ) : (
            matches.map((r) => (
              <button
                type="button"
                key={r.id}
                onClick={() => { onChange(r.id); setTerm(''); setOpen(false) }}
                className="w-full text-left flex items-center justify-between rounded-lg px-3 py-2 hover:bg-brand-50 transition"
              >
                <span className="text-sm font-medium text-ink-800">{r.name}</span>
                <span className="text-xs text-ink-400">{r.unit} · {r.phone}</span>
              </button>
            ))
          )}
        </div>
      )}
      {selected && (
        <p className="mt-1.5 text-xs text-brand-700">Selected: {selected.name} ({selected.unit})</p>
      )}
    </div>
  )
}

export default function Payments() {
  const { payments, residents, fees, addPayment, updatePayment } = useData()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(empty)
  const [rejectTarget, setRejectTarget] = useState(null)
  const [rejecting, setRejecting] = useState(false)
  const [verifyingId, setVerifyingId] = useState(null)
  const [year, setYear] = useState('all')
  const [month, setMonth] = useState('all')

  const residentOf = (id) => residents.find((r) => r.id === id)
  const feeOf = (id) => fees.find((f) => f.id === id)

  const yearOptions = useMemo(() => {
    const years = new Set()
    for (const p of payments) {
      if (!p.date) continue
      years.add(new Date(p.date).getFullYear())
    }
    return Array.from(years).sort((a, b) => b - a)
  }, [payments])

  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

  const filtered = useMemo(() => {
    return payments.filter((p) => {
      const matchesStatus = status === 'all' || p.status === status
      const q = query.toLowerCase()
      const matchesQuery = [residentOf(p.residentId)?.name, feeOf(p.feeId)?.name, p.reference].join(' ').toLowerCase().includes(q)
      const d = p.date ? new Date(p.date) : null
      const matchesYear = year === 'all' || (d && String(d.getFullYear()) === year)
      const matchesMonth = month === 'all' || (d && String(d.getMonth()) === month)
      return matchesStatus && matchesQuery && matchesYear && matchesMonth
    }).sort((a, b) => new Date(b.date) - new Date(a.date))
  }, [payments, query, status, year, month, residents, fees])

  function submit(e) {
    e.preventDefault()
    const fee = fees.find((f) => f.id === form.feeId)
    addPayment({ ...form, amount: Number(form.amount) || fee?.amount || 0, reference: form.reference || `TRX-${Math.floor(Math.random() * 90000 + 10000)}` })
      .then(() => { setModal(false); setForm(empty) })
      .catch((err) => alert(err?.response?.data?.message || err.message))
  }

  function verify(payment) {
    setVerifyingId(payment.id)
    updatePayment(payment.id, { status: 'paid' })
      .catch((err) => alert(err?.response?.data?.message || err.message))
      .finally(() => setVerifyingId(null))
  }

  function confirmReject() {
    if (!rejectTarget) return
    setRejecting(true)
    updatePayment(rejectTarget.id, { status: 'rejected' })
      .then(() => setRejectTarget(null))
      .catch((err) => alert(err?.response?.data?.message || err.message))
      .finally(() => setRejecting(false))
  }

  const total = filtered.reduce((s, p) => s + p.amount, 0)

  return (
    <div>
      <PageHeader
        title="Payments"
        subtitle={`${filtered.length} records · ${currency(total)} in view`}
        action={<button onClick={() => setModal(true)} className="btn-primary"><Plus className="h-4 w-4" /> Record payment</button>}
      />

      <div className="card p-4 mb-5 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search resident, fee, reference…" className="input pl-10" />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-4 w-4 text-ink-400" />
          {['all', 'paid', 'pending', 'overdue'].map((s) => (
            <button key={s} onClick={() => setStatus(s)}
              className={`badge capitalize border ${status === s ? 'bg-brand-gradient text-white border-transparent' : 'bg-white text-ink-500 border-ink-200 hover:border-brand-300'}`}>
              {s}
            </button>
          ))}
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="input !w-auto !py-1.5 text-sm"
          >
            <option value="all">All years</option>
            {yearOptions.map((y) => (
              <option key={y} value={String(y)}>{y}</option>
            ))}
          </select>
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="input !w-auto !py-1.5 text-sm"
          >
            <option value="all">All months</option>
            {MONTH_NAMES.map((label, idx) => (
              <option key={label} value={String(idx)}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="card overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState icon={Wallet} title="No payments found" subtitle="Adjust your filters or record a new payment." />
        ) : (
          <div className="table-wrap !border-0">
            <table className="data-table">
              <thead><tr><th>Resident</th><th>Fee</th><th>Amount</th><th>Method</th><th>Reference</th><th>Date</th><th>Status</th><th /></tr></thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id}>
                    <td className="font-medium text-ink-800">{residentOf(p.residentId)?.name}</td>
                    <td>{feeOf(p.feeId)?.name}</td>
                    <td className="font-semibold">{currency(p.amount)}</td>
                    <td>{p.method}</td>
                    <td className="font-mono text-xs text-ink-400">{p.reference}</td>
                    <td>{formatDate(p.date)}</td>
                    <td><Badge status={p.status} /></td>
                    <td>
                      {p.status === 'pending' ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => verify(p)}
                            disabled={verifyingId === p.id}
                            className="p-2 rounded-lg text-ink-400 hover:bg-emerald-50 hover:text-emerald-600 disabled:opacity-50"
                            title="Verify payment"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setRejectTarget(p)}
                            className="p-2 rounded-lg text-ink-400 hover:bg-rose-50 hover:text-rose-500"
                            title="Reject payment"
                          >
                            <XIcon className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-ink-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="Record payment" wide>
        <form onSubmit={submit} className="space-y-5">
          <div>
            <label className="label">Resident</label>
            <ResidentPicker residents={residents} value={form.residentId} onChange={(id) => setForm({ ...form, residentId: id })} />
          </div>
          <div>
            <label className="label">Fee</label>
            <select required className="input" value={form.feeId} onChange={(e) => setForm({ ...form, feeId: e.target.value })}>
              <option value="">Select fee</option>
              {fees.map((f) => <option key={f.id} value={f.id}>{f.name} · {currency(f.amount)}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Amount (ETB)</label>
              <input type="number" min="0" className="input" placeholder="Auto from fee" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
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
          <p className="text-xs text-ink-400 -mt-1">
            Recorded payments are the ones you've actually received in cash or with proof, so they're marked paid automatically — no status to pick.
            Residents who haven't paid simply won't have a matching record here.
          </p>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setModal(false)} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" className="btn-primary flex-1">Record payment</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!rejectTarget}
        title="Reject this payment?"
        message="The resident will be shown as not having paid this fee. Payments are kept as a record (not deleted) so reporting stays accurate — you can still see it here as rejected."
        confirmLabel="Reject payment"
        loading={rejecting}
        onConfirm={confirmReject}
        onCancel={() => setRejectTarget(null)}
      />
    </div>
  )
}
