import { useState } from 'react'
import { Plus, Pencil, Trash2, Receipt as ReceiptIcon } from 'lucide-react'
import { useData } from '../../context/DataContext'
import { PageHeader, Modal, EmptyState, currency } from '../../components/ui'

const empty = { name: '', amount: '', frequency: 'monthly', category: 'Security' }

export default function Fees() {
  const { fees, addFee, updateFee, removeFee } = useData()
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(empty)

  function openAdd() { setEditing(null); setForm(empty); setModal(true) }
  function openEdit(f) { setEditing(f); setForm(f); setModal(true) }

  function submit(e) {
    e.preventDefault()
    const payload = { ...form, amount: Number(form.amount) }
    if (editing) updateFee(editing.id, payload)
    else addFee(payload)
    setModal(false)
  }

  return (
    <div>
      <PageHeader
        title="Fee Structure"
        subtitle="Define the recurring fees residents are billed for."
        action={<button onClick={openAdd} className="btn-primary"><Plus className="h-4 w-4" /> Add fee</button>}
      />

      {fees.length === 0 ? (
        <div className="card"><EmptyState icon={ReceiptIcon} title="No fees configured" subtitle="Create your first fee category, like Monthly Security or Water & Cleaning." action={<button onClick={openAdd} className="btn-primary"><Plus className="h-4 w-4" /> Add fee</button>} /></div>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {fees.map((f) => (
            <div key={f.id} className="card p-5 group hover:shadow-glow transition-shadow">
              <div className="flex items-start justify-between">
                <div className="h-10 w-10 rounded-xl bg-brand-50 flex items-center justify-center">
                  <ReceiptIcon className="h-5 w-5 text-brand-600" />
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEdit(f)} className="p-1.5 rounded-lg text-ink-400 hover:bg-brand-50 hover:text-brand-600"><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => removeFee(f.id).catch((err) => alert(err?.response?.data?.message || err.message))} className="p-1.5 rounded-lg text-ink-400 hover:bg-rose-50 hover:text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
              <p className="mt-3 font-semibold text-ink-800">{f.name}</p>
              <p className="text-xs text-ink-400">{f.category}</p>
              <div className="mt-4 flex items-end justify-between">
                <p className="text-2xl font-bold font-display text-brand-700">{currency(f.amount)}</p>
                <span className="badge bg-ink-100 text-ink-600 capitalize">{f.frequency}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit fee' : 'Add fee'}>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">Fee name</label>
            <input required className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Monthly Security" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Amount (ETB)</label>
              <input required type="number" min="0" className="input" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div>
              <label className="label">Frequency</label>
              <select className="input" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
                <option value="one-time">One-time</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Category</label>
            <select
              className="input"
              value={['Security', 'Utilities', 'Maintenance', 'Development'].includes(form.category) ? form.category : 'Other'}
              onChange={(e) => setForm({ ...form, category: e.target.value === 'Other' ? '' : e.target.value })}
            >
              <option>Security</option>
              <option>Utilities</option>
              <option>Maintenance</option>
              <option>Development</option>
              <option>Other</option>
            </select>
            {!['Security', 'Utilities', 'Maintenance', 'Development'].includes(form.category) && (
              <input
                required
                autoFocus
                className="input mt-2"
                placeholder="Describe the category"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              />
            )}
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setModal(false)} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" className="btn-primary flex-1">{editing ? 'Save changes' : 'Add fee'}</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
