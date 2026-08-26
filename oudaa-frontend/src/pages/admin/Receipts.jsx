import { useState } from 'react'
import { Upload, FileCheck2, Trash2, ReceiptText, CheckCircle2, CircleDashed } from 'lucide-react'
import { useData } from '../../context/DataContext'
import { PageHeader, Modal, EmptyState, formatDate } from '../../components/ui'

export default function Receipts() {
  const { receipts, expenses, updateReceipt, removeReceipt, addReceipt } = useData()
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ expenseId: '', file: null })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const expenseOf = (id) => expenses.find((e) => e.id === id)

  async function submit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await addReceipt(form)
      setModal(false)
      setForm({ expenseId: '', file: null })
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Upload failed.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Receipts"
        subtitle={`${receipts.length} uploaded · ${receipts.filter((r) => r.verified).length} verified`}
        action={<button onClick={() => setModal(true)} className="btn-primary"><Upload className="h-4 w-4" /> Upload receipt</button>}
      />

      {receipts.length === 0 ? (
        <div className="card"><EmptyState icon={ReceiptText} title="No receipts uploaded" subtitle="Attach receipts to expenses to keep a verifiable paper trail." /></div>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {receipts.map((r) => {
            const exp = expenseOf(r.expenseId)
            return (
              <div key={r.id} className="card p-5">
                <div className="flex items-start justify-between">
                  <div className="h-10 w-10 rounded-xl bg-brand-50 flex items-center justify-center">
                    <FileCheck2 className="h-5 w-5 text-brand-600" />
                  </div>
                  <button onClick={() => removeReceipt(r.id)} className="p-1.5 rounded-lg text-ink-400 hover:bg-rose-50 hover:text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
                <p className="mt-3 font-medium text-ink-800 text-sm truncate">{r.fileName}</p>
                <p className="text-xs text-ink-400 mt-0.5">{exp?.description || 'Unlinked expense'}</p>
                <p className="text-xs text-ink-400">Uploaded {formatDate(r.uploadedAt)}</p>
                <button
                  onClick={() => updateReceipt(r.id, { verified: !r.verified })}
                  className={`mt-4 w-full flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition ${r.verified ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'}`}
                >
                  {r.verified ? <CheckCircle2 className="h-4 w-4" /> : <CircleDashed className="h-4 w-4" />}
                  {r.verified ? 'Verified' : 'Mark as verified'}
                </button>
              </div>
            )
          })}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title="Upload receipt">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">Linked expense</label>
            <select required className="input" value={form.expenseId} onChange={(e) => setForm({ ...form, expenseId: e.target.value })}>
              <option value="">Select expense</option>
              {expenses.map((e) => <option key={e.id} value={e.id}>{e.description}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Receipt file</label>
            <div className="rounded-xl border-2 border-dashed border-ink-200 hover:border-brand-300 transition p-6 text-center">
              <Upload className="h-6 w-6 text-ink-300 mx-auto mb-2" />
              <input required type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="input mt-1"
                onChange={(e) => setForm({ ...form, file: e.target.files?.[0] || null })} />
              <p className="text-xs text-ink-400 mt-2">JPEG, PNG, WEBP or PDF, up to 5MB.</p>
            </div>
          </div>
          {error && <div className="rounded-xl bg-rose-50 border border-rose-100 px-3.5 py-2.5 text-sm text-rose-600">{error}</div>}
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setModal(false)} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={submitting} className="btn-primary flex-1">{submitting ? 'Uploading…' : 'Upload'}</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
