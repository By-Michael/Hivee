import { useMemo, useState } from 'react'
import { Plus, Search, Pencil, Trash2, Users, Phone, Mail, Copy, Check, AlertTriangle } from 'lucide-react'
import { useData } from '../../context/DataContext'
import { PageHeader, Badge, Modal, EmptyState, formatDate } from '../../components/ui'
import { getMeta, setMeta } from '../../lib/adapters'

const empty = { name: '', unit: '', phone: '', email: '', status: 'active', idNumber: '', ownerType: 'owner' }

function generateTempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let out = ''
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

export default function Residents() {
  const { residents, addResident, updateResident, removeResident } = useData()
  const [query, setQuery] = useState('')
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(empty)
  const [created, setCreated] = useState(null) // { name, email, tempPassword }
  const [copied, setCopied] = useState(false)

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    return residents.filter((r) => [r.name, r.unit, r.phone, r.email, getMeta('residentIdNumber', r.id, '')].join(' ').toLowerCase().includes(q))
  }, [residents, query])

  function openAdd() { setEditing(null); setForm({ ...empty, tempPassword: generateTempPassword() }); setModal(true) }
  function openEdit(r) {
    setEditing(r)
    setForm({
      ...r,
      idNumber: getMeta('residentIdNumber', r.id, ''),
      ownerType: getMeta('residentOwnerType', r.id, 'owner'),
    })
    setModal(true)
  }

  async function submit(e) {
    e.preventDefault()
    if (editing) {
      await updateResident(editing.id, form)
      setMeta('residentIdNumber', editing.id, form.idNumber)
      setMeta('residentOwnerType', editing.id, form.ownerType)
      setModal(false)
    } else {
      const tempPassword = form.tempPassword || generateTempPassword()
      const newId = await addResident({ ...form, password: tempPassword })
      if (newId) {
        setMeta('residentIdNumber', newId, form.idNumber)
        setMeta('residentOwnerType', newId, form.ownerType)
      }
      setModal(false)
      setCreated({ name: form.name, email: form.email, tempPassword })
    }
  }

  function copyPassword() {
    navigator.clipboard?.writeText(created?.tempPassword || '')
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div>
      <PageHeader
        title="Residents"
        subtitle={`${residents.length} registered · ${residents.filter((r) => r.status === 'active').length} active`}
        action={<button onClick={openAdd} className="btn-primary"><Plus className="h-4 w-4" /> Add resident</button>}
      />

      <div className="card p-4 mb-5">
        <div className="relative max-w-sm">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, unit, phone, ID…" className="input pl-10" />
        </div>
      </div>

      <div className="card overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState icon={Users} title="No residents found" subtitle="Try a different search, or add a new resident to get started." action={<button onClick={openAdd} className="btn-primary"><Plus className="h-4 w-4" /> Add resident</button>} />
        ) : (
          <div className="table-wrap !border-0">
            <table className="data-table">
              <thead><tr><th>Resident</th><th>Unit</th><th>ID No.</th><th>Type</th><th>Contact</th><th>Joined</th><th>Status</th><th className="text-right">Actions</th></tr></thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-xs font-display">
                          {r.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                        </div>
                        <span className="font-medium text-ink-800">{r.name}</span>
                      </div>
                    </td>
                    <td>{r.unit}</td>
                    <td className="font-mono text-xs">{getMeta('residentIdNumber', r.id, '—')}</td>
                    <td className="capitalize">{getMeta('residentOwnerType', r.id, 'owner')}</td>
                    <td>
                      <div className="flex flex-col gap-0.5 text-xs text-ink-500">
                        <span className="flex items-center gap-1.5"><Phone className="h-3 w-3" />{r.phone}</span>
                        <span className="flex items-center gap-1.5"><Mail className="h-3 w-3" />{r.email}</span>
                      </div>
                    </td>
                    <td>{formatDate(r.joined)}</td>
                    <td><Badge status={r.status} /></td>
                    <td>
                      <div className="flex justify-end gap-1.5">
                        <button onClick={() => openEdit(r)} className="p-2 rounded-lg text-ink-400 hover:bg-brand-50 hover:text-brand-600"><Pencil className="h-4 w-4" /></button>
                        <button onClick={() => removeResident(r.id).catch((err) => alert(err?.response?.data?.message || err.message))} className="p-2 rounded-lg text-ink-400 hover:bg-rose-50 hover:text-rose-500"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit resident' : 'Add resident'}>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">Full name</label>
            <input required className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Unit</label>
              <input required className="input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="A-204" />
            </div>
            <div>
              <label className="label">ID number</label>
              <input required className="input" value={form.idNumber} onChange={(e) => setForm({ ...form, idNumber: e.target.value })} placeholder="e.g. national/resident ID" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Owner or renter</label>
              <select className="input" value={form.ownerType} onChange={(e) => setForm({ ...form, ownerType: e.target.value })}>
                <option value="owner">Owner</option>
                <option value="renter">Renter</option>
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Phone</label>
            <input required className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div>
            <label className="label">Email</label>
            <input required type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setModal(false)} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" className="btn-primary flex-1">{editing ? 'Save changes' : 'Add resident'}</button>
          </div>
        </form>
      </Modal>

      {/* Post-create: confirm temp password was captured */}
      <Modal open={!!created} onClose={() => setCreated(null)} title="Resident added" dismissible={false}>
        {created && (
          <div className="space-y-4">
            <p className="text-sm text-ink-600">{created.name} has been added. Share this one-time password with them — it's valid for 24 hours.</p>
            <div className="flex items-center gap-2 rounded-xl bg-ink-50 px-3.5 py-2.5">
              <span className="font-mono text-sm flex-1">{created.tempPassword}</span>
              <button type="button" onClick={copyPassword} className="p-1.5 rounded-lg text-ink-400 hover:bg-white hover:text-brand-600" title="Copy password">
                {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5">
              <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700">Once you confirm this message box, you won't be able to see this password again. Make sure you've copied it or shared it with the resident.</p>
            </div>
            <button onClick={() => setCreated(null)} className="btn-primary w-full">I've saved this password</button>
          </div>
        )}
      </Modal>
    </div>
  )
}
