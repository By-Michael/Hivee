import { useMemo, useState } from 'react'
import { Plus, Search, Pencil, Trash2, Users, Phone, Mail, Copy, Check, AlertTriangle, Eye, MapPin, IdCard, ReceiptText, ShieldCheck, Download, Ban, RotateCcw } from 'lucide-react'
import { useData } from '../../context/DataContext'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, Badge, Modal, EmptyState, formatDate, currency, ConfirmDialog, notify, usePagedList, Pager } from '../../components/ui'

const empty = { name: '', unit: '', phone: '', email: '', idNumber: '', ownerType: 'owner', address: '' }

// Clickable one-click chips for the deactivation reason modal — the
// committee can tap one of these instead of typing, or pick "Other" to
// type a custom reason. Kept in sync with the backend's
// COMMON_INACTIVE_REASONS (residentController.js) but not strictly
// required to match — the backend accepts any free-text reason.
const COMMON_INACTIVE_REASONS = [
  'Non-payment of fees',
  'Moved out / no longer a resident',
  'Property sold',
  'Requested by resident',
  'Violation of community rules',
  'Duplicate or incorrect account',
]

function generateTempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let out = ''
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

export default function Residents() {
  const { residents, addResident, updateResident, removeResident, fetchResidentSummary, residentsMeta, deactivateResident, reactivateResident, exportResidentPayments } = useData()
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
  const [exporting, setExporting] = useState(false)

  // ---- Deactivate resident: reason popup ----
  const [deactivateTarget, setDeactivateTarget] = useState(null) // resident being deactivated
  const [deactivateReason, setDeactivateReason] = useState('')
  const [deactivateCustom, setDeactivateCustom] = useState('')
  const [deactivating, setDeactivating] = useState(false)
  const [deactivateError, setDeactivateError] = useState('')
  const [reactivating, setReactivating] = useState(false)

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    return residents.filter((r) => [r.name, r.unit, r.phone, r.email, r.idNumber].join(' ').toLowerCase().includes(q))
  }, [residents, query])

  // Only render 50 rows into the DOM at a time — with thousands of
  // residents, rendering the whole filtered list on every keystroke/render
  // is what made the page feel frozen. Totals above still use the full
  // `residents`/`filtered` arrays, so counts stay accurate.
  const { pageItems: pagedResidents, page, totalPages, total, setPage } = usePagedList(filtered, 50)

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

  // ---- Deactivate flow ----
  function openDeactivate(r) {
    setDeactivateTarget(r)
    setDeactivateReason('')
    setDeactivateCustom('')
    setDeactivateError('')
  }

  function confirmDeactivate() {
    if (!deactivateTarget) return
    const reason = deactivateReason === 'Other' ? deactivateCustom.trim() : deactivateReason
    if (!reason) { setDeactivateError('Pick a reason, or type your own.'); return }
    setDeactivating(true)
    setDeactivateError('')
    deactivateResident(deactivateTarget.id, reason)
      .then((updated) => {
        setDeactivateTarget(null)
        notify(`${deactivateTarget.name} has been deactivated. They've been emailed the reason.`, 'success')
        if (infoResident?.id === updated.id) {
          setInfoResident(updated)
          setInfoForm({ ...empty, ...updated })
        }
      })
      .catch((err) => setDeactivateError(err?.response?.data?.message || err.message || 'Could not deactivate this resident.'))
      .finally(() => setDeactivating(false))
  }

  function doReactivate(r) {
    setReactivating(true)
    reactivateResident(r.id)
      .then((updated) => {
        notify(`${r.name} has been reactivated.`, 'success')
        if (infoResident?.id === updated.id) {
          setInfoResident(updated)
          setInfoForm({ ...empty, ...updated })
        }
      })
      .catch((err) => notify(err?.response?.data?.message || err.message || 'Could not reactivate this resident.'))
      .finally(() => setReactivating(false))
  }

  function doExport(r) {
    setExporting(true)
    exportResidentPayments(r.id, r.name?.replace(/[^a-z0-9]+/gi, '_') || 'resident')
      .catch((err) => notify(err?.response?.data?.message || err.message || 'Could not export this resident.'))
      .finally(() => setExporting(false))
  }

  return (
    <div>
      <PageHeader
        title="Residents"
        subtitle={`${residentsMeta.total} registered · ${residentsMeta.activeTotal} active`}
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
                {pagedResidents.map((r) => (
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
                        {!r.isCommittee && (
                          r.status === 'active' ? (
                            <button onClick={() => openDeactivate(r)} className="p-2 rounded-lg text-ink-400 hover:bg-amber-50 hover:text-amber-600" title="Deactivate resident"><Ban className="h-4 w-4" /></button>
                          ) : (
                            <button onClick={() => doReactivate(r)} disabled={reactivating} className="p-2 rounded-lg text-ink-400 hover:bg-emerald-50 hover:text-emerald-600" title="Reactivate resident"><RotateCcw className="h-4 w-4" /></button>
                          )
                        )}
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
            <Pager page={page} totalPages={totalPages} total={total} onChange={setPage} pageSize={50} />
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
          <div>
            <label className="label">Owner or renter</label>
            <select className="input" value={form.ownerType} onChange={(e) => setForm({ ...form, ownerType: e.target.value })}>
              <option value="owner">Owner</option>
              <option value="renter">Renter</option>
            </select>
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
              <div className="ml-auto flex items-center gap-2">
                <Badge status={infoResident.status} />
                <button
                  type="button"
                  onClick={() => doExport(infoResident)}
                  disabled={exporting}
                  className="btn-secondary !py-1.5 !px-3 text-xs"
                  title="Export resident info & payment history to Excel"
                >
                  <Download className="h-3.5 w-3.5" /> {exporting ? 'Exporting…' : 'Export'}
                </button>
              </div>
            </div>

            {infoError && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-xs text-rose-700">{infoError}</div>
            )}

            {/* Deactivate / reactivate, with the reason shown once inactive */}
            {!infoResident.isCommittee && (
              <div className="rounded-xl border border-ink-100 px-3.5 py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-ink-800">Account access</p>
                  {infoResident.status === 'active' ? (
                    <p className="text-xs text-ink-400">This resident can currently log in.</p>
                  ) : (
                    <p className="text-xs text-ink-400">
                      Deactivated{infoResident.inactivatedAt ? ` on ${formatDate(infoResident.inactivatedAt)}` : ''}
                      {infoResident.inactiveReason ? ` — ${infoResident.inactiveReason}` : ''}. They can't log in.
                    </p>
                  )}
                </div>
                {infoResident.status === 'active' ? (
                  <button type="button" onClick={() => openDeactivate(infoResident)} className="btn-secondary !py-1.5 !px-3 text-xs shrink-0">
                    <Ban className="h-3.5 w-3.5" /> Deactivate
                  </button>
                ) : (
                  <button type="button" onClick={() => doReactivate(infoResident)} disabled={reactivating} className="btn-secondary !py-1.5 !px-3 text-xs shrink-0">
                    <RotateCcw className="h-3.5 w-3.5" /> Reactivate
                  </button>
                )}
              </div>
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
              <div>
                <label className="label flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> Address</label>
                <input className="input" value={infoForm.address} onChange={(e) => setInfoForm({ ...infoForm, address: e.target.value })} />
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

      {/* Deactivate resident: reason picker */}
      <Modal open={!!deactivateTarget} onClose={() => setDeactivateTarget(null)} title="Deactivate resident">
        {deactivateTarget && (
          <div className="space-y-5">
            <p className="text-sm text-ink-600">
              {deactivateTarget.name} won't be able to log in once deactivated. They'll be emailed the reason and told to contact the committee office for more info.
            </p>
            {deactivateError && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-xs text-rose-700">{deactivateError}</div>
            )}
            <div>
              <label className="label">Reason</label>
              <div className="flex flex-wrap gap-2">
                {COMMON_INACTIVE_REASONS.map((reason) => (
                  <button
                    type="button"
                    key={reason}
                    onClick={() => setDeactivateReason(reason)}
                    className={`badge cursor-pointer transition ${deactivateReason === reason ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'}`}
                  >
                    {reason}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setDeactivateReason('Other')}
                  className={`badge cursor-pointer transition ${deactivateReason === 'Other' ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'}`}
                >
                  Other
                </button>
              </div>
            </div>
            {deactivateReason === 'Other' && (
              <div>
                <label className="label">Describe the reason</label>
                <textarea
                  autoFocus
                  rows={3}
                  className="input"
                  value={deactivateCustom}
                  onChange={(e) => setDeactivateCustom(e.target.value)}
                  placeholder="e.g. Vacated unit as of March 2026"
                />
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setDeactivateTarget(null)} disabled={deactivating} className="btn-secondary flex-1">Cancel</button>
              <button type="button" onClick={confirmDeactivate} disabled={deactivating} className="btn-primary flex-1">{deactivating ? 'Deactivating…' : 'Confirm deactivation'}</button>
            </div>
          </div>
        )}
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
