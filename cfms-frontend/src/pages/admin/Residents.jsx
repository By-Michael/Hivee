import { useMemo, useState } from 'react'
import { Plus, Search, Pencil, Trash2, Users, Phone, Mail, Copy, Check, AlertTriangle, Eye, MapPin, IdCard, ReceiptText, ShieldCheck } from 'lucide-react'
import { useData } from '../../context/DataContext'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, Badge, Modal, EmptyState, formatDate, currency, ConfirmDialog, notify } from '../../components/ui'

const empty = { name: '', unit: '', phone: '', email: '', status: 'active', idNumber: '', ownerType: 'owner', address: '' }

function generateTempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let out = ''
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

export default function Residents() {
  const { residents, addResident, updateResident, removeResident, fetchResidentSummary } = useData()
  const { user } = useAuth()
  const [query, setQuery] = useState('')
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(empty)
  const [formSaving, setFormSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [created, setCreated] = useState(null) // { name, email, tempPassword }
  const [copied, setCopied] = useState(false)

  // ---- Resident info popup (view details + missing payments + edit) ----
  const [infoOpen, setInfoOpen] = useState(false)
  const [infoLoading, setInfoLoading] = useState(false)
  const [infoError, setInfoError] = useState('')
  const [infoResident, setInfoResident] = useState(null)
  const [missingPayments, setMissingPayments] = useState([])
  const [infoForm, setInfoForm] = useState(empty)
  const [infoSaving, setInfoSaving] = useState(false)
  const [infoSaved, setInfoSaved] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    return residents.filter((r) => [r.name, r.unit, r.phone, r.email, r.idNumber].join(' ').toLowerCase().includes(q))
  }, [residents, query])

  function openAdd() { setEditing(null); setForm({ ...empty, tempPassword: generateTempPassword() }); setFormError(''); setModal(true) }
  function openEdit(r) {
    setEditing(r)
    setForm({ ...empty, ...r })
    setFormError('')
    setModal(true)
  }

  async function openInfo(r) {
    setInfoOpen(true)
    setInfoLoading(true)
    setInfoError('')
    setInfoResident(r)
    setInfoForm({ ...empty, ...r })
    setMissingPayments([])
    setInfoSaved(false)
    try {
      const { resident, missingPayments: mp } = await fetchResidentSummary(r.id)
      setInfoResident(resident)
      setInfoForm({ ...empty, ...resident })
      setMissingPayments(mp)
    } catch (err) {
      setInfoError(err?.response?.data?.message || err.message || 'Could not load resident details.')
    } finally {
      setInfoLoading(false)
    }
  }

  async function submit(e) {
    e.preventDefault()
    setFormSaving(true)
    setFormError('')
    try {
      if (editing) {
        await updateResident(editing.id, form)
        setModal(false)
        notify('Resident updated.', 'success')
      } else {
        const tempPassword = form.tempPassword || generateTempPassword()
        await addResident({ ...form, password: tempPassword })
        setModal(false)
        setCreated({ name: form.name, email: form.email, tempPassword })
      }
    } catch (err) {
      const status = err?.response?.status
      const msg = status === 429
        ? "You're doing that a bit too fast — please wait a moment and try again."
        : (err?.response?.data?.message || err.message || 'Could not save this resident. Please try again.')
      setFormError(msg)
    } finally {
      setFormSaving(false)
    }
  }

  async function submitInfo(e) {
    e.preventDefault()
    if (!infoResident) return
    setInfoSaving(true)
    setInfoError('')
    setInfoSaved(false)
    try {
      await updateResident(infoResident.id, infoForm)
      setInfoResident({ ...infoResident, ...infoForm })
      setInfoSaved(true)
      setTimeout(() => setInfoSaved(false), 2000)
    } catch (err) {
      setInfoError(err?.response?.data?.message || err.message || 'Could not save changes.')
    } finally {
      setInfoSaving(false)
    }
  }

  function tryDelete(r) {
    setDeleteError('')
    if (r.isCommittee) {
      setDeleteTarget(r)
      setDeleteError(
        r.userId === user?.id
          ? "You're a committee member, so you can't delete yourself here. Go to Profile settings → \"Transfer committee status\" to hand your seat to another resident first."
          : `${r.name} is a committee member and can't be removed from the residents panel.`
      )
      return
    }
    setDeleteTarget(r)
  }

  function confirmDelete() {
    if (!deleteTarget) return
    if (deleteTarget.isCommittee) return // blocked client-side; message already shown
    setDeleting(true)
    setDeleteError('')
    removeResident(deleteTarget.id)
      .then(() => { setDeleteTarget(null); notify('Resident removed.', 'success') })
      .catch((err) => {
        const status = err?.response?.status
        const msg = status === 429
          ? "You're doing that a bit too fast — please wait a moment and try again."
          : (err?.response?.data?.message || err.message || 'Could not remove this resident.')
        setDeleteError(msg)
      })
      .finally(() => setDeleting(false))
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
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, house number, phone, ID…" className="input pl-10" />
        </div>
      </div>

      <div className="card overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState icon={Users} title="No residents found" subtitle="Try a different search, or add a new resident to get started." action={<button onClick={openAdd} className="btn-primary"><Plus className="h-4 w-4" /> Add resident</button>} />
        ) : (
          <div className="table-wrap !border-0">
            <table className="data-table">
              <thead><tr><th>Resident</th><th>House number</th><th>ID No.</th><th>Type</th><th>Contact</th><th>Joined</th><th>Status</th><th className="text-right">Actions</th></tr></thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <button onClick={() => openInfo(r)} className="flex items-center gap-3 text-left hover:opacity-80">
                        <div className="h-9 w-9 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-xs font-display">
                          {r.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                        </div>
                        <span className="font-medium text-ink-800 flex items-center gap-1.5">
                          {r.name}
                          {r.isCommittee && (
                            <span title="Committee member" className="inline-flex items-center gap-1 rounded-full bg-brand-50 text-brand-700 ring-1 ring-brand-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                              <ShieldCheck className="h-3 w-3" /> Committee
                            </span>
                          )}
                        </span>
                      </button>
                    </td>
                    <td>{r.unit}</td>
                    <td className="font-mono text-xs">{r.idNumber || '—'}</td>
                    <td className="capitalize">{r.ownerType || 'owner'}</td>
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
                        <button onClick={() => openInfo(r)} className="p-2 rounded-lg text-ink-400 hover:bg-brand-50 hover:text-brand-600" title="View details & missing payments"><Eye className="h-4 w-4" /></button>
                        <button onClick={() => openEdit(r)} className="p-2 rounded-lg text-ink-400 hover:bg-brand-50 hover:text-brand-600" title="Quick edit"><Pencil className="h-4 w-4" /></button>
                        <button
                          onClick={() => tryDelete(r)}
                          className={`p-2 rounded-lg ${r.isCommittee ? 'text-ink-200 cursor-not-allowed' : 'text-ink-400 hover:bg-rose-50 hover:text-rose-500'}`}
                          title={r.isCommittee ? "Committee members can't be removed here" : 'Remove resident'}
                        ><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit resident' : 'Add resident'} wide>
        <form onSubmit={submit} className="space-y-5">
          {formError && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-xs text-rose-700">{formError}</div>
          )}
          <div>
            <label className="label">Full name</label>
            <input required className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">House number</label>
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
            <input required type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} disabled={!!editing} />
            {editing && <p className="mt-1 text-xs text-ink-400">Change the email from the resident's info popup.</p>}
          </div>
          <div>
            <label className="label">Address</label>
            <input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Optional" />
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setModal(false)} disabled={formSaving} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={formSaving} className="btn-primary flex-1">{formSaving ? 'Saving…' : (editing ? 'Save changes' : 'Add resident')}</button>
          </div>
        </form>
      </Modal>

      {/* Post-create: confirm temp password was captured */}
      <Modal open={!!created} onClose={() => setCreated(null)} title="Resident added" dismissible={false}>
        {created && (
          <div className="space-y-5">
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

      {/* Resident info popup: full details + missing payments + inline edit */}
      <Modal open={infoOpen} onClose={() => setInfoOpen(false)} title="Resident details" wide>
        {infoLoading ? (
          <p className="text-sm text-ink-400 py-8 text-center">Loading resident details…</p>
        ) : infoResident ? (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold font-display">
                {infoResident.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
              </div>
              <div>
                <p className="font-semibold text-ink-900">{infoResident.name}</p>
                <p className="text-xs text-ink-400">House {infoResident.unit} · Joined {formatDate(infoResident.joined)}</p>
              </div>
              <div className="ml-auto"><Badge status={infoForm.status} /></div>
            </div>

            {infoError && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-xs text-rose-700">{infoError}</div>
            )}

            <form onSubmit={submitInfo} className="space-y-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Editable details</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Full name</label>
                  <input required className="input" value={infoForm.name} onChange={(e) => setInfoForm({ ...infoForm, name: e.target.value })} />
                </div>
                <div>
                  <label className="label">House number</label>
                  <input required className="input" value={infoForm.unit} onChange={(e) => setInfoForm({ ...infoForm, unit: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> Email</label>
                  <input required type="email" className="input" value={infoForm.email} onChange={(e) => setInfoForm({ ...infoForm, email: e.target.value })} />
                </div>
                <div>
                  <label className="label flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> Phone</label>
                  <input className="input" value={infoForm.phone} onChange={(e) => setInfoForm({ ...infoForm, phone: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label flex items-center gap-1.5"><IdCard className="h-3.5 w-3.5" /> ID number</label>
                  <input className="input" value={infoForm.idNumber} onChange={(e) => setInfoForm({ ...infoForm, idNumber: e.target.value })} />
                </div>
                <div>
                  <label className="label">Owner or renter</label>
                  <select className="input" value={infoForm.ownerType} onChange={(e) => setInfoForm({ ...infoForm, ownerType: e.target.value })}>
                    <option value="owner">Owner</option>
                    <option value="renter">Renter</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> Address</label>
                  <input className="input" value={infoForm.address} onChange={(e) => setInfoForm({ ...infoForm, address: e.target.value })} />
                </div>
                <div>
                  <label className="label">Status</label>
                  <select className="input" value={infoForm.status} onChange={(e) => setInfoForm({ ...infoForm, status: e.target.value })}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
              <p className="text-xs text-ink-400">Password isn't shown or editable here — use "Reset password" workflows if you need to issue a new one.</p>
              <div className="flex items-center gap-3">
                <button type="submit" disabled={infoSaving} className="btn-primary flex-1">{infoSaving ? 'Saving…' : 'Save changes'}</button>
                {infoSaved && (
                  <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
                    <Check className="h-4 w-4" /> Saved
                  </span>
                )}
              </div>
            </form>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-400 mb-2 flex items-center gap-1.5"><ReceiptText className="h-3.5 w-3.5" /> Missing payments</p>
              {missingPayments.length === 0 ? (
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 text-xs text-emerald-700">
                  This resident has no missing or unpaid fees.
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead><tr><th>Fee</th><th>Amount</th><th>Frequency</th></tr></thead>
                    <tbody>
                      {missingPayments.map((m) => (
                        <tr key={m.feeId}>
                          <td>{m.name}</td>
                          <td>{currency(m.amount)}</td>
                          <td className="capitalize">{m.frequency}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title={deleteTarget?.isCommittee ? 'Cannot remove committee member' : 'Remove resident?'}
        message={deleteTarget && !deleteTarget.isCommittee ? `This will permanently remove "${deleteTarget.name}" and their records. This action cannot be undone.` : ''}
        confirmLabel={deleteTarget?.isCommittee ? 'OK' : 'Delete'}
        danger={!deleteTarget?.isCommittee}
        loading={deleting}
        error={deleteError}
        onConfirm={deleteTarget?.isCommittee ? () => { setDeleteTarget(null); setDeleteError('') } : confirmDelete}
        onCancel={() => { setDeleteTarget(null); setDeleteError('') }}
      />
    </div>
  )
}
