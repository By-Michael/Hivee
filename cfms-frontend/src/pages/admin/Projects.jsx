import { useState } from 'react'
import { Plus, Pencil, Trash2, FolderKanban, Calendar, Lock } from 'lucide-react'
import { useData } from '../../context/DataContext'
import { PageHeader, Modal, Badge, currency, formatDate, EmptyState, ConfirmDialog, notify } from '../../components/ui'

const empty = { name: '', fundId: '', budget: '', status: 'planned', startDate: '', endDate: '' }

export default function Projects() {
  const { projects, funds, addProject, updateProject, removeProject } = useData()
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const fundOf = (id) => funds.find((f) => f.id === id)?.name || '—'

  function openAdd() { setEditing(null); setForm(empty); setModal(true) }
  function openEdit(p) { setEditing(p); setForm(p); setModal(true) }

  function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    removeProject(deleteTarget.id)
      .then(() => { setDeleteTarget(null); notify('Project deleted.', 'success') })
      // Deletion is blocked server-side once a project has expenses logged
      // — surface that explanation instead of a generic failure.
      .catch((err) => notify(err?.response?.data?.message || err.message))
      .finally(() => setDeleting(false))
  }

  function submit(e) {
    e.preventDefault()
    setSaving(true)
    const payload = { ...form, budget: Number(form.budget) }
    const wasEditing = !!editing
    const action = wasEditing ? updateProject(editing.id, payload) : addProject(payload)
    action
      .then((result) => {
        setModal(false)
        // Budget changes on a project that already has expenses logged go
        // through committee approval rather than applying instantly — tell
        // the admin which happened instead of a blanket "updated".
        if (wasEditing && result?.budgetChangeMessage) {
          notify(result.budgetChangeMessage, result.pendingChange ? 'info' : 'success')
        } else {
          notify(wasEditing ? 'Project updated.' : 'Project added.', 'success')
        }
      })
      .catch((err) => notify(err?.response?.data?.message || err.message))
      .finally(() => setSaving(false))
  }

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle={`${projects.length} projects · ${projects.filter((p) => p.status === 'in-progress').length} in progress`}
        action={<button onClick={openAdd} className="btn-primary"><Plus className="h-4 w-4" /> New project</button>}
      />

      {projects.length === 0 ? (
        <div className="card"><EmptyState icon={FolderKanban} title="No projects yet" subtitle="Create a project to start tracking budget and spend." action={<button onClick={openAdd} className="btn-primary"><Plus className="h-4 w-4" /> New project</button>} /></div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {projects.map((p) => {
            const pct = p.budget ? Math.min(100, Math.round((p.spent / p.budget) * 100)) : 0
            return (
              <div key={p.id} className="card p-5 hover:shadow-glow transition-shadow group">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-ink-800">{p.name}</p>
                    <p className="text-xs text-ink-400 mt-0.5">{fundOf(p.fundId)}</p>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg text-ink-400 hover:bg-brand-50 hover:text-brand-600"><Pencil className="h-3.5 w-3.5" /></button>
                    {p.expenseCount > 0 ? (
                      <span title="Can't be deleted — expenses are logged against this project. Mark it Cancelled or Completed instead." className="p-1.5 rounded-lg text-ink-300 cursor-not-allowed">
                        <Lock className="h-3.5 w-3.5" />
                      </span>
                    ) : (
                      <button onClick={() => setDeleteTarget(p)} className="p-1.5 rounded-lg text-ink-400 hover:bg-rose-50 hover:text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button>
                    )}
                  </div>
                </div>
                <div className="mt-3"><Badge status={p.status} /></div>
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-ink-500 mb-1.5">
                    <span>{currency(p.spent)} spent</span>
                    <span>{currency(p.budget)} budget</span>
                  </div>
                  <div className="h-2 rounded-full bg-ink-100 overflow-hidden">
                    <div className={`h-full rounded-full ${pct >= 95 ? 'bg-rose-500' : 'bg-brand-gradient'}`} style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-1 text-xs font-semibold text-ink-500">{pct}% utilized</p>
                </div>
                <div className="mt-4 flex items-center gap-1.5 text-xs text-ink-400">
                  <Calendar className="h-3.5 w-3.5" />
                  {formatDate(p.startDate)} — {formatDate(p.endDate)}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit project' : 'New project'} wide>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">Project name</label>
            <input required className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Linked fund</label>
              <select required className="input" value={form.fundId} onChange={(e) => setForm({ ...form, fundId: e.target.value })}>
                <option value="">Select fund</option>
                {funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="planned">Planned</option>
                <option value="in-progress">In progress</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Budget (ETB)</label>
            <input required type="number" min="0" className="input" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} />
          </div>
          <p className="text-xs text-ink-400 -mt-1">
            Amount spent isn't set manually — it's calculated automatically from expenses logged against this project.
          </p>
          {editing && editing.expenseCount > 0 && (
            <p className="text-xs text-amber-600 -mt-1">
              This project already has expenses logged against it, so changing the budget will need every other committee member to approve before it takes effect.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Start date</label>
              <input required type="date" className="input" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </div>
            <div>
              <label className="label">End date</label>
              <input required type="date" className="input" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setModal(false)} disabled={saving} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Saving…' : (editing ? 'Save changes' : 'Create project')}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete project?"
        message={deleteTarget ? `This will permanently delete "${deleteTarget.name}". This action cannot be undone.` : ''}
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
