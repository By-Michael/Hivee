import { useMemo, useRef, useState } from 'react'
import { Plus, Search, Wallet, Filter, Check, CheckCheck, X as XIcon, Paperclip, Pencil, Trash2, FileText, AlertTriangle, UserX, SlidersHorizontal, Landmark } from 'lucide-react'
import { useData } from '../../context/DataContext'
import { PageHeader, Modal, Badge, EmptyState, currency, formatDate, ConfirmDialog, notify, usePagedList, Pager } from '../../components/ui'

const empty = { residentId: '', targetType: 'fee', feeId: '', projectId: '', amount: '', method: 'Bank Transfer', reference: '', receiptFile: null }

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const STATUS_OPTIONS = [
  { value: 'all', label: 'Any status' },
  { value: 'pending', label: 'Pending' },
  { value: 'pending_review', label: 'Needs review' },
  { value: 'paid', label: 'Verified' },
  { value: 'rejected', label: 'Rejected' },
]
const METHOD_OPTIONS = ['Cash', 'Bank Transfer', 'Mobile Money', 'Card', 'Other']

const emptyFilters = {
  residentQuery: '',
  target: 'all', // 'all' | `fee:<id>` | `project:<id>`
  status: 'all',
  method: 'all',
  year: 'all',
  month: 'all',
  minAmount: '',
  maxAmount: '',
  nonPayersOnly: false,
  includeInactiveResidents: false,
}

function countActiveFilters(f) {
  let n = 0
  if (f.residentQuery.trim()) n++
  if (f.target !== 'all') n++
  if (f.status !== 'all') n++
  if (f.method !== 'all') n++
  if (f.year !== 'all') n++
  if (f.month !== 'all') n++
  if (f.minAmount !== '') n++
  if (f.maxAmount !== '') n++
  if (f.nonPayersOnly) n++
  return n
}

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

// Shared body for both "Record payment" (create) and "Edit payment"
// (update) — same fields, different submit handler/labels from the caller.
function PaymentForm({ form, setForm, fees, projects, residents, showResidentPicker, fileInputRef, existingReceiptUrl }) {
  const selectedFee = fees.find((f) => f.id === form.feeId)

  return (
    <>
      {showResidentPicker && (
        <div>
          <label className="label">Resident</label>
          <ResidentPicker residents={residents} value={form.residentId} onChange={(id) => setForm({ ...form, residentId: id })} />
        </div>
      )}

      <div>
        <label className="label">Paying for</label>
        <div className="flex gap-2 mb-2">
          {['fee', 'project'].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setForm({ ...form, targetType: t, feeId: '', projectId: '', amount: t === 'project' ? form.amount : '' })}
              className={`badge capitalize border ${form.targetType === t ? 'bg-brand-gradient text-white border-transparent' : 'bg-white text-ink-500 border-ink-200 hover:border-brand-300'}`}
            >
              {t === 'fee' ? 'A fee' : 'A project'}
            </button>
          ))}
        </div>
        {form.targetType === 'fee' ? (
          <select required className="input" value={form.feeId} onChange={(e) => {
            const fee = fees.find((f) => f.id === e.target.value)
            setForm({ ...form, feeId: e.target.value, amount: fee ? String(fee.amount) : form.amount })
          }}>
            <option value="">Select fee</option>
            {fees.map((f) => <option key={f.id} value={f.id}>{f.name} · {currency(f.amount)}</option>)}
          </select>
        ) : (
          <select required className="input" value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
            <option value="">Select project</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        {form.targetType === 'project' && projects.length === 0 && (
          <p className="mt-1.5 text-xs text-amber-600">No projects set up yet — add one under Projects first.</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Amount (ETB)</label>
          <input
            type="number" min="0" required={form.targetType === 'project'} className="input"
            placeholder={form.targetType === 'fee' ? 'Auto from fee' : 'Enter amount'}
            value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}
          />
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

      <div>
        <label className="label">Transaction reference <span className="text-ink-400 font-normal normal-case">(optional)</span></label>
        <input
          className="input font-mono" placeholder="e.g. FT24219XXXXX — leave blank to auto-generate"
          value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })}
        />
      </div>

      <div>
        <label className="label">Receipt photo <span className="text-ink-400 font-normal normal-case">(optional)</span></label>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => fileInputRef.current?.click()} className="btn-secondary !py-2 text-sm">
            <Paperclip className="h-3.5 w-3.5" /> {form.receiptFile ? 'Change file' : 'Attach receipt'}
          </button>
          <input
            ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden"
            onChange={(e) => setForm({ ...form, receiptFile: e.target.files?.[0] || null })}
          />
          {form.receiptFile ? (
            <span className="text-xs text-ink-500 truncate max-w-[14rem]">{form.receiptFile.name}</span>
          ) : existingReceiptUrl ? (
            <a href={existingReceiptUrl} target="_blank" rel="noreferrer" className="text-xs text-brand-700 flex items-center gap-1">
              <FileText className="h-3.5 w-3.5" /> Current receipt
            </a>
          ) : null}
        </div>
        <p className="mt-1.5 text-xs text-ink-400">A photo of a cash slip or bank receipt, in case the entry ever needs to be double-checked.</p>
      </div>

      <p className="text-xs text-ink-400">
        Recorded here because you (the committee) received it directly — cash in hand or a receipt shown to you.
        It's saved as verified immediately, since you're recording it after the fact.
      </p>
    </>
  )
}

export default function Payments() {
  const { payments, residents, fees, projects, addPayment, updatePayment, batchVerifyPayments, editPayment, removePayment, dataFullyLoaded } = useData()
  const [query, setQuery] = useState('')
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)
  const [rejectTarget, setRejectTarget] = useState(null)
  const [rejecting, setRejecting] = useState(false)
  const [verifyingId, setVerifyingId] = useState(null)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [batchVerifying, setBatchVerifying] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [editForm, setEditForm] = useState(empty)
  const [editSaving, setEditSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const fileInputRef = useRef(null)
  const editFileInputRef = useRef(null)

  // ---- Comprehensive filter panel ----
  // `filters` is what's actually applied to the list; `draft` is what the
  // modal edits — nothing changes in the table until "Apply filters" is
  // pressed, so partial edits (e.g. picking a fee before picking a month)
  // never flash intermediate results.
  const [filterOpen, setFilterOpen] = useState(false)
  const [filters, setFilters] = useState(emptyFilters)
  const [draft, setDraft] = useState(emptyFilters)

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

  // Anything sitting in 'pending' (basic unverified) or 'pending_review'
  // (bank lookup matched but a safeguard flagged it, or the verification
  // service was unreachable) needs an admin to actually look at it —
  // that's the review queue.
  const needsReviewCount = useMemo(
    () => payments.filter((p) => p.status === 'pending' || p.status === 'pending_review').length,
    [payments]
  )

  const activeFilterCount = countActiveFilters(filters)
  const selectedFeeId = filters.target.startsWith('fee:') ? filters.target.slice(4) : ''
  const selectedFee = feeOf(selectedFeeId)

  function openFilter() { setDraft(filters); setFilterOpen(true) }
  function applyFilters(e) {
    e?.preventDefault()
    setFilters(draft)
    setFilterOpen(false)
  }
  function clearFilters() {
    setDraft(emptyFilters)
    setFilters(emptyFilters)
    setFilterOpen(false)
  }

  // ---- Regular filtered payment rows (used unless "non-payers only") ----
  const filtered = useMemo(() => {
    if (filters.nonPayersOnly) return []
    const targetFeeId = filters.target.startsWith('fee:') ? filters.target.slice(4) : ''
    const targetProjectId = filters.target.startsWith('project:') ? filters.target.slice(8) : ''
    const min = filters.minAmount !== '' ? Number(filters.minAmount) : null
    const max = filters.maxAmount !== '' ? Number(filters.maxAmount) : null
    return payments.filter((p) => {
      const q = query.toLowerCase()
      const label = p.feeId ? feeOf(p.feeId)?.name : p.projectName
      const matchesQuery = [residentOf(p.residentId)?.name, label, p.reference].join(' ').toLowerCase().includes(q)
      const matchesResident = !filters.residentQuery.trim() ||
        [residentOf(p.residentId)?.name, residentOf(p.residentId)?.unit, residentOf(p.residentId)?.phone]
          .join(' ').toLowerCase().includes(filters.residentQuery.trim().toLowerCase())
      const d = p.date ? new Date(p.date) : null
      const matchesYear = filters.year === 'all' || (d && String(d.getFullYear()) === filters.year)
      const matchesMonth = filters.month === 'all' || (d && String(d.getMonth()) === filters.month)
      const matchesTarget = filters.target === 'all' ||
        (targetFeeId && p.feeId === targetFeeId) ||
        (targetProjectId && p.projectId === targetProjectId)
      const matchesStatus = filters.status === 'all' || p.status === filters.status
      const matchesMethod = filters.method === 'all' || p.method === filters.method
      const matchesMin = min === null || p.amount >= min
      const matchesMax = max === null || p.amount <= max
      return matchesQuery && matchesResident && matchesYear && matchesMonth && matchesTarget &&
        matchesStatus && matchesMethod && matchesMin && matchesMax
    }).sort((a, b) => new Date(b.date) - new Date(a.date))
  }, [payments, query, filters, residents, fees])

  // ---- "Who hasn't paid" — residents with no non-rejected payment for
  // the selected fee within the selected period. This is the answer to
  // "which people didn't pay which month": the payments table only ever
  // lists payments that *were* made, so finding gaps means cross-checking
  // every resident against that fee instead of filtering payment rows.
  const nonPayers = useMemo(() => {
    if (!filters.nonPayersOnly || !selectedFeeId) return []
    const pool = residents.filter((r) => filters.includeInactiveResidents || r.status === 'active')
    return pool.filter((r) => {
      const matchesResident = !filters.residentQuery.trim() ||
        [r.name, r.unit, r.phone].join(' ').toLowerCase().includes(filters.residentQuery.trim().toLowerCase())
      if (!matchesResident) return false
      const hasPayment = payments.some((p) => {
        if (p.residentId !== r.id || p.feeId !== selectedFeeId || p.status === 'rejected') return false
        if (filters.year === 'all' && filters.month === 'all') return true
        if (!p.date) return false
        const d = new Date(p.date)
        const matchesYear = filters.year === 'all' || String(d.getFullYear()) === filters.year
        const matchesMonth = filters.month === 'all' || String(d.getMonth()) === filters.month
        return matchesYear && matchesMonth
      })
      return !hasPayment
    }).sort((a, b) => a.name.localeCompare(b.name))
  }, [filters, residents, payments, selectedFeeId])

  function periodLabel() {
    if (filters.year === 'all' && filters.month === 'all') return 'ever'
    if (filters.month === 'all') return filters.year
    return `${MONTH_NAMES[Number(filters.month)]} ${filters.year === 'all' ? '' : filters.year}`.trim()
  }

  // Jumps straight into "Record payment" prefilled for a non-payer found
  // above, so following up on the list is one click instead of a
  // separate resident lookup.
  function recordForNonPayer(resident) {
    setForm({ ...empty, residentId: resident.id, targetType: 'fee', feeId: selectedFeeId, amount: selectedFee ? String(selectedFee.amount) : '' })
    setModal(true)
  }

  function submit(e) {
    e.preventDefault()
    setSaving(true)
    const fee = fees.find((f) => f.id === form.feeId)
    addPayment({ ...form, amount: Number(form.amount) || fee?.amount || 0, reference: form.reference || `TRX-${Math.floor(Math.random() * 90000 + 10000)}` })
      .then(() => { setModal(false); setForm(empty); notify('Payment recorded.', 'success') })
      .catch((err) => notify(err?.response?.data?.message || err.message))
      .finally(() => setSaving(false))
  }

  function openEdit(p) {
    setEditForm({
      residentId: p.residentId,
      targetType: p.feeId ? 'fee' : 'project',
      feeId: p.feeId || '',
      projectId: p.projectId || '',
      amount: String(p.amount),
      method: p.method,
      reference: p.reference,
      receiptFile: null,
      receiptUrl: p.receiptUrl,
    })
    setEditTarget(p)
  }

  function submitEdit(e) {
    e.preventDefault()
    if (!editTarget) return
    setEditSaving(true)
    editPayment(editTarget.id, editForm)
      .then(() => { setEditTarget(null); notify('Payment updated.', 'success') })
      .catch((err) => notify(err?.response?.data?.message || err.message))
      .finally(() => setEditSaving(false))
  }

  function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    removePayment(deleteTarget.id)
      .then(() => { setDeleteTarget(null); notify('Payment deleted.', 'success') })
      .catch((err) => notify(err?.response?.data?.message || err.message))
      .finally(() => setDeleting(false))
  }

  function verify(payment) {
    setVerifyingId(payment.id)
    updatePayment(payment.id, { status: 'paid' })
      .then(() => notify('Payment verified.', 'success'))
      .catch((err) => notify(err?.response?.data?.message || err.message))
      .finally(() => setVerifyingId(null))
  }

  // Render at most 50 rows at a time — see Residents.jsx for why. `total`
  // (defined below, from `filtered`) still sums the full filtered set, so
  // the header stays accurate regardless of pagination.
  const { pageItems: pagedPayments, page: tablePage, totalPages: tableTotalPages, total: tableTotal, setPage: setTablePage } = usePagedList(filtered, 50)
  const { pageItems: pagedNonPayers, page: npPage, totalPages: npTotalPages, total: npTotal, setPage: setNpPage } = usePagedList(nonPayers, 50)

  // Only pending / needs-review rows are ever selectable — verified/
  // rejected rows have nothing to batch-verify.
  const selectablePaged = pagedPayments.filter((p) => p.status === 'pending' || p.status === 'pending_review')
  const allPagedSelected = selectablePaged.length > 0 && selectablePaged.every((p) => selectedIds.has(p.id))

  function toggleRow(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  function toggleAllOnPage() {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allPagedSelected) {
        selectablePaged.forEach((p) => next.delete(p.id))
      } else {
        selectablePaged.forEach((p) => next.add(p.id))
      }
      return next
    })
  }

  function runBatchVerify() {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    setBatchVerifying(true)
    batchVerifyPayments(ids)
      .then((count) => {
        notify(`${count} payment${count === 1 ? '' : 's'} verified.`, 'success')
        setSelectedIds(new Set())
      })
      .catch((err) => notify(err?.response?.data?.message || err.message))
      .finally(() => setBatchVerifying(false))
  }

  function confirmReject() {
    if (!rejectTarget) return
    setRejecting(true)
    updatePayment(rejectTarget.id, { status: 'rejected' })
      .then(() => { setRejectTarget(null); notify('Payment rejected.', 'success') })
      .catch((err) => notify(err?.response?.data?.message || err.message))
      .finally(() => setRejecting(false))
  }

  const total = filtered.reduce((s, p) => s + p.amount, 0)

  return (
    <div>
      <PageHeader
        title="Payments"
        subtitle={
          filters.nonPayersOnly
            ? `${nonPayers.length} residents haven't paid "${selectedFee?.name || '—'}" (${periodLabel()})`
            : `${filtered.length} records · ${currency(total)} in view${needsReviewCount > 0 ? ` · ${needsReviewCount} awaiting review` : ''}`
        }
        action={<button onClick={() => { setForm(empty); setModal(true) }} className="btn-primary"><Plus className="h-4 w-4" /> Record payment</button>}
      />

      <div className="card p-4 mb-5 flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Quick search resident, fee, reference…" className="input pl-10" />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={openFilter}
            className={`badge border transition ${activeFilterCount > 0 ? 'bg-brand-gradient text-white border-transparent' : 'bg-white text-ink-500 border-ink-200 hover:border-brand-300'}`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </button>
          {filters.nonPayersOnly && (
            <span className="badge bg-orange-50 text-orange-700 border border-orange-300">
              <UserX className="h-3.5 w-3.5" /> Showing who hasn't paid
            </span>
          )}
          {activeFilterCount > 0 && (
            <button type="button" onClick={clearFilters} className="text-xs text-ink-400 hover:text-rose-500 underline underline-offset-2">
              Clear filters
            </button>
          )}
          {selectedIds.size > 0 && (
            <button
              type="button"
              onClick={runBatchVerify}
              disabled={batchVerifying}
              className="btn-primary !py-1.5 !px-3 text-xs disabled:opacity-50"
              title="Marks the selected payments as verified. The bulk bank re-check API isn't wired in yet — this is a placeholder until that's connected."
            >
              <CheckCheck className="h-3.5 w-3.5" /> {batchVerifying ? 'Verifying…' : `Batch verify (${selectedIds.size})`}
            </button>
          )}
        </div>
      </div>

      {filters.nonPayersOnly && !dataFullyLoaded && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 text-xs text-amber-700 mb-4">
          Still loading the full payment history in the background — this list may be missing a few names until it finishes.
        </div>
      )}

      <div className="card overflow-hidden">
        {filters.nonPayersOnly ? (
          nonPayers.length === 0 ? (
            <EmptyState icon={Check} title="Everyone's paid" subtitle={selectedFee ? `Every resident has a payment on record for "${selectedFee.name}" in this period.` : 'Pick a fee in the filter panel to check who has and hasn\'t paid.'} />
          ) : (
            <div className="table-wrap !border-0">
              <table className="data-table">
                <thead><tr><th>Resident</th><th>House number</th><th>Contact</th><th /></tr></thead>
                <tbody>
                  {pagedNonPayers.map((r) => (
                    <tr key={r.id}>
                      <td className="font-medium text-ink-800">{r.name}</td>
                      <td>{r.unit}</td>
                      <td className="text-xs text-ink-500">{r.phone}</td>
                      <td className="text-right">
                        <button onClick={() => recordForNonPayer(r)} className="btn-secondary !py-1.5 !px-3 text-xs">
                          <Plus className="h-3.5 w-3.5" /> Record payment
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pager page={npPage} totalPages={npTotalPages} total={npTotal} onChange={setNpPage} pageSize={50} />
            </div>
          )
        ) : filtered.length === 0 ? (
          <EmptyState icon={Wallet} title="No payments found" subtitle="Adjust your filters or record a new payment." />
        ) : (
          <div className="table-wrap !border-0">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="w-8">
                    {selectablePaged.length > 0 && (
                      <input type="checkbox" checked={allPagedSelected} onChange={toggleAllOnPage} title="Select all pending on this page" />
                    )}
                  </th>
                  <th>Resident</th><th>For</th><th>Amount</th><th>Method</th><th>Reference</th><th>Date</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {pagedPayments.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {(p.status === 'pending' || p.status === 'pending_review') && (
                        <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleRow(p.id)} />
                      )}
                    </td>
                    <td className="font-medium text-ink-800">{residentOf(p.residentId)?.name}</td>
                    <td>
                      {p.feeId ? feeOf(p.feeId)?.name : (
                        <span className="inline-flex items-center gap-1">
                          <span className="badge bg-violet-50 text-violet-700 ring-1 ring-violet-200 !py-0.5">Project</span>
                          {p.projectName}
                        </span>
                      )}
                    </td>
                    <td className="font-semibold">{currency(p.amount)}</td>
                    <td>{p.method}</td>
                    <td className="font-mono text-xs text-ink-400">
                      {p.reference}
                      {p.receiptUrl && (
                        <a href={p.receiptUrl} target="_blank" rel="noreferrer" title="View receipt" className="ml-1.5 text-brand-600 inline-flex align-middle">
                          <Paperclip className="h-3 w-3" />
                        </a>
                      )}
                    </td>
                    <td>{formatDate(p.date)}</td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <Badge status={p.status} />
                        {p.status === 'pending_review' && p.reviewFlags && (
                          <span title={p.reviewFlags} className="text-orange-500 cursor-help">
                            <AlertTriangle className="h-3.5 w-3.5" />
                          </span>
                        )}
                      </div>
                      {p.senderName && (
                        <div className="mt-0.5 text-[11px] text-ink-400">
                          Bank: <span className={p.reviewFlags?.includes('sender name') ? 'text-orange-600 font-medium' : 'text-ink-500'}>{p.senderName}</span>
                        </div>
                      )}
                      {p.paidToPreviousAccount && (
                        <div className="mt-0.5 text-[11px] text-blue-600 flex items-center gap-1" title={p.reviewFlags}>
                          <Landmark className="h-3 w-3" /> Paid to a previous account
                        </div>
                      )}
                    </td>
                    <td>
                      {p.status === 'pending' || p.status === 'pending_review' ? (
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
                      ) : p.recordedBy ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openEdit(p)}
                            className="p-2 rounded-lg text-ink-400 hover:bg-brand-50 hover:text-brand-700"
                            title="Edit payment"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(p)}
                            className="p-2 rounded-lg text-ink-400 hover:bg-rose-50 hover:text-rose-500"
                            title="Delete payment"
                          >
                            <Trash2 className="h-4 w-4" />
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
            <Pager page={tablePage} totalPages={tableTotalPages} total={tableTotal} onChange={setTablePage} pageSize={50} />
          </div>
        )}
      </div>

      {/* Comprehensive filter panel */}
      <Modal open={filterOpen} onClose={() => setFilterOpen(false)} title="Filter payments" wide>
        <form onSubmit={applyFilters} className="space-y-5">
          <div>
            <label className="label">Resident</label>
            <input
              className="input" placeholder="Name, house number, or phone…"
              value={draft.residentQuery} onChange={(e) => setDraft({ ...draft, residentQuery: e.target.value })}
            />
          </div>

          <div>
            <label className="label">Paying for</label>
            <select className="input" value={draft.target} onChange={(e) => setDraft({ ...draft, target: e.target.value })}>
              <option value="all">Any fee or project</option>
              <optgroup label="Fees">
                {fees.map((f) => <option key={f.id} value={`fee:${f.id}`}>{f.name}</option>)}
              </optgroup>
              <optgroup label="Projects">
                {projects.map((p) => <option key={p.id} value={`project:${p.id}`}>{p.name}</option>)}
              </optgroup>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Year</label>
              <select className="input" value={draft.year} onChange={(e) => setDraft({ ...draft, year: e.target.value })}>
                <option value="all">All years</option>
                {yearOptions.map((y) => <option key={y} value={String(y)}>{y}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Month</label>
              <select className="input" value={draft.month} onChange={(e) => setDraft({ ...draft, month: e.target.value })}>
                <option value="all">All months</option>
                {MONTH_NAMES.map((label, idx) => <option key={label} value={String(idx)}>{label}</option>)}
              </select>
            </div>
          </div>

          {!draft.nonPayersOnly && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Status</label>
                  <select className="input" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                    {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Method</label>
                  <select className="input" value={draft.method} onChange={(e) => setDraft({ ...draft, method: e.target.value })}>
                    <option value="all">Any method</option>
                    {METHOD_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Min amount (ETB)</label>
                  <input type="number" min="0" className="input" value={draft.minAmount} onChange={(e) => setDraft({ ...draft, minAmount: e.target.value })} placeholder="No minimum" />
                </div>
                <div>
                  <label className="label">Max amount (ETB)</label>
                  <input type="number" min="0" className="input" value={draft.maxAmount} onChange={(e) => setDraft({ ...draft, maxAmount: e.target.value })} placeholder="No maximum" />
                </div>
              </div>
            </>
          )}

          <div className="rounded-xl border border-ink-100 px-3.5 py-3 space-y-3">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={draft.nonPayersOnly}
                onChange={(e) => setDraft({ ...draft, nonPayersOnly: e.target.checked })}
              />
              <span>
                <span className="text-sm font-medium text-ink-800 flex items-center gap-1.5"><UserX className="h-3.5 w-3.5" /> Only show residents who haven't paid</span>
                <span className="block text-xs text-ink-400 mt-0.5">
                  Instead of listing payments, lists every resident with no payment on record for the fee and period above — e.g. pick a fee and a month to see exactly who's missing that month's dues.
                </span>
              </span>
            </label>
            {draft.nonPayersOnly && (
              <>
                {!draft.target.startsWith('fee:') && (
                  <p className="text-xs text-amber-600 flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> Pick a specific fee above (not "Any fee") for this to work.</p>
                )}
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.includeInactiveResidents}
                    onChange={(e) => setDraft({ ...draft, includeInactiveResidents: e.target.checked })}
                  />
                  <span className="text-sm text-ink-700">Include inactive residents</span>
                </label>
              </>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={clearFilters} className="btn-secondary flex-1">Clear all</button>
            <button type="submit" className="btn-primary flex-1">Apply filters</button>
          </div>
        </form>
      </Modal>

      <Modal open={modal} onClose={() => setModal(false)} title="Record payment" wide>
        <form onSubmit={submit} className="space-y-5">
          <PaymentForm form={form} setForm={setForm} fees={fees} projects={projects} residents={residents} showResidentPicker fileInputRef={fileInputRef} />
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setModal(false)} disabled={saving} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Saving…' : 'Record payment'}</button>
          </div>
        </form>
      </Modal>

      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title="Edit payment" wide>
        <form onSubmit={submitEdit} className="space-y-5">
          <p className="text-xs text-ink-500 -mt-1">
            Editing {residentOf(editTarget?.residentId)?.name}'s payment recorded on {formatDate(editTarget?.date)}.
          </p>
          <PaymentForm form={editForm} setForm={setEditForm} fees={fees} projects={projects} residents={residents} showResidentPicker={false} fileInputRef={editFileInputRef} existingReceiptUrl={editForm.receiptUrl} />
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setEditTarget(null)} disabled={editSaving} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={editSaving} className="btn-primary flex-1">{editSaving ? 'Saving…' : 'Save changes'}</button>
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

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete this payment?"
        message="This removes the record entirely — use this only to fix a mistaken manual entry (wrong resident, duplicate, etc). It's still kept in the audit log for reference. This can't be undone."
        confirmLabel="Delete payment"
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
