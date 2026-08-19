import { useState } from 'react'
import { Plus, Trash2, FileText, Paperclip, Eye, Download, Upload, CheckCircle2, CircleDashed, RotateCcw, Ban } from 'lucide-react'
import { useData } from '../../context/DataContext'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, Modal, EmptyState, currency, formatDate, ConfirmDialog, notify, usePagedList, Pager } from '../../components/ui'
import { fileUrl, downloadFile } from '../../lib/api'

const empty = { projectId: '', description: '', amount: '', vendor: '', date: '', bankName: '', transactionReference: '', file: null }

const ETHIOPIAN_BANKS = [
  'Telebirr', 'Commercial Bank of Ethiopia', 'Awash Bank', 'Dashen Bank', 'Bank of Abyssinia',
  'Wegagen Bank', 'United Bank', 'Nib International Bank', 'Cooperative Bank of Oromia',
  'Lion International Bank', 'Zemen Bank', 'Oromia International Bank', 'Bunna Bank',
  'Berhan Bank', 'Abay Bank', 'Addis International Bank', 'Debub Global Bank', 'Enat Bank',
  'Hijra Bank', 'Shabelle Bank', 'Siinqee Bank', 'Goh Betoch Bank', 'Amhara Bank',
  'Tsehay Bank', 'Gadaa Bank', 'Ethio-China Africa Bank', 'Rammis Bank', 'Ahadu Bank',
  'Sinqee Microfinance', 'Development Bank of Ethiopia', 'Other',
]

// Mirrors the backend's DELETE_GRACE_WINDOW_MS (expenseController.js) —
// used only to decide whether to show the delete option at all. The
// backend is the actual source of truth and will reject a stale request
// with an explanatory message even if this check is somehow bypassed.
const DELETE_GRACE_WINDOW_MS = 15 * 60 * 1000

export default function Expenses() {
  const { expenses, projects, receipts, addExpense, reverseExpense, removeExpense, addReceipt, updateReceipt, dataFullyLoaded, expensesMeta } = useData()
  const { user } = useAuth()
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(empty)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState(null)
  const [uploadingFor, setUploadingFor] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [reverseTarget, setReverseTarget] = useState(null)
  const [reversing, setReversing] = useState(false)
  const [reverseReason, setReverseReason] = useState('')

  const projectOf = (id) => projects.find((p) => p.id === id)?.name || '—'
  const receiptOf = (id) => receipts.find((r) => r.id === id)

  // Expenses are append-only, so this is deliberately narrow: only the
  // person who recorded it, only within a short window, and only before a
  // receipt has been attached or it's part of a reversal. Everything else
  // is corrected via reverse, not delete.
  function canDelete(e) {
    if (e.isVoided || e.isReversal) return false
    if (e.recordedBy && user?.id && e.recordedBy !== user.id) return false
    if ((e.receiptId)) return false
    if (!e.createdAt) return true // be permissive if the field is missing rather than hide a legitimate option
    return Date.now() - new Date(e.createdAt).getTime() <= DELETE_GRACE_WINDOW_MS
  }

  async function submit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await addExpense({ ...form, amount: Number(form.amount) })
      setModal(false)
      setForm(empty)
      notify('Expense logged.', 'success')
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Could not log expense.')
    } finally {
      setSubmitting(false)
    }
  }

  async function attachReceipt(expenseId, file) {
    if (!file) return
    setUploadingFor(expenseId)
    try {
      await addReceipt({ expenseId, file })
      notify('Receipt uploaded.', 'success')
    } catch (err) {
      notify(err?.response?.data?.message || err.message || 'Upload failed.')
    } finally {
      setUploadingFor(null)
    }
  }

  function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    removeExpense(deleteTarget.id)
      .then(() => { setDeleteTarget(null); notify('Expense deleted.', 'success') })
      .catch((err) => notify(err?.response?.data?.message || err.message))
      .finally(() => setDeleting(false))
  }

  function confirmReverse() {
    if (!reverseTarget) return
    setReversing(true)
    reverseExpense(reverseTarget.id, reverseReason.trim() || undefined)
      .then(() => {
        setReverseTarget(null)
        setReverseReason('')
        setDetail(null)
        notify('Expense reversed. The offsetting entry is now in the trail.', 'success')
      })
      .catch((err) => notify(err?.response?.data?.message || err.message))
      .finally(() => setReversing(false))
  }

  const total = expenses.reduce((s, e) => s + e.amount, 0)

  // Render at most 50 rows at a time — with thousands of expenses,
  // rendering every row into the DOM on every render is what made
  // switching to/around this page slow. `total` above still sums every
  // expense, so the header stays accurate.
  const { pageItems: pagedExpenses, page: tablePage, totalPages: tableTotalPages, total: tableTotal, setPage: setTablePage } = usePagedList(expenses, 50)

  return (
    <div>
      <PageHeader
        title="Expenses"
        subtitle={`${expensesMeta.total} record${expensesMeta.total === 1 ? '' : 's'}${!dataFullyLoaded ? ` (${expenses.length} loaded so far)` : ` · ${currency(total)} net spend`} — tap a row for details — corrections are made by reversing, not editing`}
        action={<button onClick={() => setModal(true)} className="btn-primary"><Plus className="h-4 w-4" /> Log expense</button>}
      />

      <div className="card overflow-hidden">
        {expenses.length === 0 ? (
          <EmptyState icon={FileText} title="No expenses logged" subtitle="Log an expense against a project to track spend." action={<button onClick={() => setModal(true)} className="btn-primary"><Plus className="h-4 w-4" /> Log expense</button>} />
        ) : (
          <div className="table-wrap !border-0">
            <table className="data-table">
              <thead><tr><th>Description</th><th>Project</th><th>Vendor</th><th>Amount</th><th>Date</th><th>Receipt</th><th /></tr></thead>
              <tbody>
                {pagedExpenses.map((e) => {
                  const rc = receiptOf(e.receiptId)
                  const deletable = canDelete(e)
                  return (
                    <tr key={e.id} className={`cursor-pointer ${e.isVoided ? 'opacity-60' : ''}`} onClick={() => setDetail(e)}>
                      <td className="font-medium text-ink-800">
                        {e.description}
                        {e.isVoided && <span className="badge bg-ink-100 text-ink-500 ml-2"><Ban className="h-3 w-3" /> Reversed</span>}
                        {e.isReversal && <span className="badge bg-amber-50 text-amber-700 ring-1 ring-amber-200 ml-2"><RotateCcw className="h-3 w-3" /> Reversal</span>}
                      </td>
                      <td>{projectOf(e.projectId)}</td>
                      <td>{e.vendor}</td>
                      <td className={`font-semibold ${e.amount < 0 ? 'text-rose-600' : ''}`}>{currency(e.amount)}</td>
                      <td>{formatDate(e.date)}</td>
                      <td>
                        {rc ? (
                          <span className="badge bg-brand-50 text-brand-700 ring-1 ring-brand-200"><Paperclip className="h-3 w-3" /> Attached</span>
                        ) : (
                          <span className="badge bg-ink-100 text-ink-500">None</span>
                        )}
                      </td>
                      <td onClick={(ev) => ev.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          {!e.isVoided && !e.isReversal && (
                            <button onClick={() => setReverseTarget(e)} title="Reverse this expense with a linked offsetting entry" className="p-2 rounded-lg text-ink-400 hover:bg-amber-50 hover:text-amber-600">
                              <RotateCcw className="h-4 w-4" />
                            </button>
                          )}
                          {deletable && (
                            <button onClick={() => setDeleteTarget(e)} title="Delete (only available briefly after recording, before any receipt is attached)" className="p-2 rounded-lg text-ink-400 hover:bg-rose-50 hover:text-rose-500">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <Pager page={tablePage} totalPages={tableTotalPages} total={tableTotal} onChange={setTablePage} pageSize={50} />
          </div>
        )}
      </div>

      {/* Log expense */}
      <Modal open={modal} onClose={() => setModal(false)} title="Log expense" wide>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">Description</label>
            <input required className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Fencing materials — Phase 2" />
          </div>
          <div>
            <label className="label">Project</label>
            <select required className="input" value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
              <option value="">Select project</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Amount (ETB)</label>
              <input required type="number" min="0" className="input" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div>
              <label className="label">Date</label>
              <input required type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Vendor</label>
            <input required className="input" value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Bank</label>
              <select className="input" value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })}>
                <option value="">Select bank (optional)</option>
                {ETHIOPIAN_BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Transaction ID</label>
              <input className="input" placeholder="e.g. FT2408..." value={form.transactionReference} onChange={(e) => setForm({ ...form, transactionReference: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Receipt (optional)</label>
            <div className="rounded-xl border-2 border-dashed border-ink-200 hover:border-brand-300 transition p-4 text-center">
              <Upload className="h-5 w-5 text-ink-300 mx-auto mb-1.5" />
              <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="input"
                onChange={(e) => setForm({ ...form, file: e.target.files?.[0] || null })} />
              <p className="text-xs text-ink-400 mt-1.5">Any resident will be able to view or download this.</p>
            </div>
          </div>
          <p className="text-xs text-ink-400 -mt-1">
            Once logged, this record can't be edited. Mistakes are corrected by reversing the entry and, if needed, logging a fresh one — both stay visible in the trail.
          </p>
          {error && <div className="rounded-xl bg-rose-50 border border-rose-100 px-3.5 py-2.5 text-sm text-rose-600">{error}</div>}
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setModal(false)} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={submitting} className="btn-primary flex-1">{submitting ? 'Saving…' : 'Log expense'}</button>
          </div>
        </form>
      </Modal>

      {/* Expense detail with receipt view/download */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.description || 'Expense'}>
        {detail && (
          <ExpenseDetail
            expense={detail}
            project={projectOf(detail.projectId)}
            receipt={receiptOf(detail.receiptId)}
            onAttach={(file) => attachReceipt(detail.id, file)}
            uploading={uploadingFor === detail.id}
            onToggleVerified={(rc) => updateReceipt(rc.id, { verified: !rc.verified })}
            onReverse={() => setReverseTarget(detail)}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete expense?"
        message={deleteTarget ? `This will permanently delete "${deleteTarget.description}". Only available briefly after recording, with no receipt attached — this action cannot be undone. For anything else, use Reverse instead.` : ''}
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Reverse — the normal way to correct an expense. Creates a linked,
          offsetting entry rather than touching the original row. */}
      <Modal open={!!reverseTarget} onClose={() => { setReverseTarget(null); setReverseReason('') }} title="Reverse expense">
        {reverseTarget && (
          <div className="space-y-4">
            <p className="text-sm text-ink-600">
              This creates a new entry for <span className="font-semibold">-{currency(reverseTarget.amount)}</span> that offsets
              "{reverseTarget.description}". The original stays in the record, marked as reversed — nothing is deleted or edited.
            </p>
            <div>
              <label className="label">Reason (optional, recommended)</label>
              <input className="input" value={reverseReason} onChange={(e) => setReverseReason(e.target.value)} placeholder="e.g. Wrong amount entered, corrected below" />
            </div>
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => { setReverseTarget(null); setReverseReason('') }} disabled={reversing} className="btn-secondary flex-1">Cancel</button>
              <button type="button" onClick={confirmReverse} disabled={reversing} className="btn-primary flex-1">{reversing ? 'Reversing…' : 'Reverse expense'}</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

function ExpenseDetail({ expense, project, receipt, onAttach, uploading, onToggleVerified, onReverse }) {
  const url = receipt ? fileUrl(receipt.fileUrl) : null
  const handleDownload = async () => {
    try {
      await downloadFile(url, receipt.fileName)
    } catch (err) {
      notify(err.message || 'Failed to download receipt.', 'error')
    }
  }

  return (
    <div className="space-y-4">
      {expense.isVoided && (
        <div className="rounded-xl bg-ink-50 border border-ink-200 px-3.5 py-2.5 text-sm text-ink-600 flex items-center gap-2">
          <Ban className="h-4 w-4" /> This expense has been reversed by a linked offsetting entry.
        </div>
      )}
      {expense.isReversal && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 text-sm text-amber-700 flex items-center gap-2">
          <RotateCcw className="h-4 w-4" /> This is a reversal entry, offsetting an earlier expense.
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div><p className="text-ink-400 text-xs uppercase font-semibold">Project</p><p className="text-ink-800">{project}</p></div>
        <div><p className="text-ink-400 text-xs uppercase font-semibold">Vendor</p><p className="text-ink-800">{expense.vendor}</p></div>
        <div><p className="text-ink-400 text-xs uppercase font-semibold">Amount</p><p className="text-ink-800 font-semibold">{currency(expense.amount)}</p></div>
        <div><p className="text-ink-400 text-xs uppercase font-semibold">Date</p><p className="text-ink-800">{formatDate(expense.date)}</p></div>
        {expense.bankName && <div><p className="text-ink-400 text-xs uppercase font-semibold">Bank</p><p className="text-ink-800">{expense.bankName}</p></div>}
        {expense.transactionReference && <div><p className="text-ink-400 text-xs uppercase font-semibold">Transaction ID</p><p className="text-ink-800 font-mono text-xs">{expense.transactionReference}</p></div>}
      </div>

      <div className="border-t border-ink-100 pt-4">
        <p className="text-xs uppercase font-semibold text-ink-400 mb-2">Receipt</p>
        {receipt ? (
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <a href={url} target="_blank" rel="noopener noreferrer" className="btn-secondary"><Eye className="h-4 w-4" /> View</a>
              <button type="button" onClick={handleDownload} className="btn-secondary"><Download className="h-4 w-4" /> Download</button>
              <button
                onClick={() => onToggleVerified(receipt)}
                className={`badge cursor-pointer ${receipt.verified ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'}`}
              >
                {receipt.verified ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CircleDashed className="h-3.5 w-3.5" />}
                {receipt.verified ? 'Verified' : 'Mark verified'}
              </button>
            </div>
          </div>
        ) : expense.isVoided ? (
          <p className="text-sm text-ink-400">No receipt was attached, and this expense has been reversed — no new receipts can be added.</p>
        ) : (
          <div>
            <p className="text-sm text-ink-400 mb-2">No receipt attached yet.</p>
            <label className="btn-secondary cursor-pointer inline-flex">
              <Upload className="h-4 w-4" /> {uploading ? 'Uploading…' : 'Attach receipt'}
              <input type="file" className="hidden" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={uploading}
                onChange={(e) => e.target.files?.[0] && onAttach(e.target.files[0])} />
            </label>
          </div>
        )}
      </div>

      {!expense.isVoided && !expense.isReversal && (
        <div className="border-t border-ink-100 pt-4">
          <button onClick={onReverse} className="btn-secondary"><RotateCcw className="h-4 w-4" /> Reverse this expense</button>
          <p className="text-xs text-ink-400 mt-1.5">Creates a linked offsetting entry instead of editing or deleting this record.</p>
        </div>
      )}
    </div>
  )
}
