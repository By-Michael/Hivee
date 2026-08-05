import { useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, Landmark, TrendingUp, Target, Users } from 'lucide-react'
import { useData } from '../../context/DataContext'
import { PageHeader, Modal, currency } from '../../components/ui'
import { getMeta, setMeta } from '../../lib/adapters'

const empty = { name: '', category: 'Security', goal: '' }
const catColors = {
  Security: 'from-brand-500 to-brand-600',
  Utilities: 'from-sky-400 to-sky-600',
  Maintenance: 'from-emerald-500 to-emerald-600',
  Development: 'from-violet-500 to-violet-600',
}

export default function Funds() {
  const { funds, projects, fees, payments, residents, addFund, updateFund, removeFund } = useData()
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(empty)

  const total = funds.reduce((s, f) => s + f.balance, 0)

  const enriched = useMemo(() => funds.map((f) => {
    const feesInCategory = fees.filter((x) => x.category === f.category)
    const feeIds = new Set(feesInCategory.map((x) => x.id))
    const verifiedPayments = payments.filter((p) => feeIds.has(p.feeId) && p.status === 'paid')
    const collected = verifiedPayments.reduce((s, p) => s + p.amount, 0)
    const contributorIds = new Set(verifiedPayments.map((p) => p.residentId))
    const goal = Number(getMeta('fundGoal', f.id, 0)) || null
    return {
      ...f,
      collected,
      contributors: contributorIds.size,
      nonContributors: Math.max(residents.length - contributorIds.size, 0),
      goal,
      pct: goal ? Math.min(100, Math.round((collected / goal) * 100)) : null,
    }
  }), [funds, fees, payments, residents])

  function openAdd() { setEditing(null); setForm(empty); setModal(true) }
  function openEdit(f) { setEditing(f); setForm({ ...f, goal: getMeta('fundGoal', f.id, '') }); setModal(true) }

  function submit(e) {
    e.preventDefault()
    const payload = { name: form.name, category: form.category }
    const action = editing ? updateFund(editing.id, payload) : addFund(payload)
    action.then((idMaybe) => {
      const targetId = editing ? editing.id : idMaybe
      if (targetId && form.goal !== '') setMeta('fundGoal', targetId, Number(form.goal))
      setModal(false)
    }).catch((err) => alert(err?.response?.data?.message || err.message))
  }

  return (
    <div>
      <PageHeader
        title="Community Funds"
        subtitle={`Total balance ${currency(total)} across ${funds.length} funds`}
        action={<button onClick={openAdd} className="btn-primary"><Plus className="h-4 w-4" /> Add fund</button>}
      />

      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {enriched.map((f) => {
          const linkedProjects = projects.filter((p) => p.fundId === f.id)
          return (
            <div key={f.id} className="card p-5 group hover:shadow-glow transition-shadow relative overflow-hidden">
              <div className={`absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br ${catColors[f.category] || catColors.Security} opacity-10`} />
              <div className="flex items-start justify-between relative">
                <div className={`h-11 w-11 rounded-2xl bg-gradient-to-br ${catColors[f.category] || catColors.Security} flex items-center justify-center shadow-glow`}>
                  <Landmark className="h-5 w-5 text-white" />
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEdit(f)} className="p-1.5 rounded-lg text-ink-400 hover:bg-brand-50 hover:text-brand-600"><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => removeFund(f.id).catch((err) => alert(err?.response?.data?.message || err.message))} className="p-1.5 rounded-lg text-ink-400 hover:bg-rose-50 hover:text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
              <p className="mt-4 font-semibold text-ink-800">{f.name}</p>
              <span className="badge bg-ink-100 text-ink-600 mt-1">{f.category}</span>
              <p className="mt-4 text-2xl font-bold font-display text-ink-900">{currency(f.balance)}</p>
              <p className="text-xs text-ink-400">Fund balance</p>

              <div className="mt-3 space-y-1.5 text-xs">
                <div className="flex items-center justify-between text-ink-500">
                  <span className="flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5 text-emerald-500" /> Collected</span>
                  <span className="font-semibold text-ink-800">{currency(f.collected)}</span>
                </div>
                {f.goal ? (
                  <>
                    <div className="flex items-center justify-between text-ink-500">
                      <span className="flex items-center gap-1.5"><Target className="h-3.5 w-3.5 text-brand-500" /> Goal</span>
                      <span className="font-semibold text-ink-800">{currency(f.goal)} ({f.pct}%)</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-ink-100 overflow-hidden">
                      <div className="h-full bg-brand-gradient" style={{ width: `${f.pct}%` }} />
                    </div>
                  </>
                ) : (
                  <p className="text-ink-400 italic">No goal set — edit this fund to add one.</p>
                )}
                <div className="flex items-center justify-between text-ink-500">
                  <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-ink-400" /> Contributed</span>
                  <span className="font-semibold text-ink-800">{f.contributors} of {residents.length} residents</span>
                </div>
                <div className="flex items-center justify-between text-rose-500">
                  <span>Haven't contributed</span>
                  <span className="font-semibold">{f.nonContributors}</span>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-1.5 text-xs text-ink-400">
                {linkedProjects.length} linked project{linkedProjects.length !== 1 ? 's' : ''}
              </div>
            </div>
          )
        })}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit fund' : 'Add fund'}>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">Fund name</label>
            <input required className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="label">Category</label>
            <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option>Security</option><option>Utilities</option><option>Maintenance</option><option>Development</option>
            </select>
          </div>
          <div>
            <label className="label">Collection goal (ETB, optional)</label>
            <input type="number" min="0" className="input" value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} placeholder="e.g. 200000" />
          </div>
          <p className="text-xs text-ink-400 -mt-1">
            Balance isn't set manually — it's calculated automatically from this fund's project budgets and logged expenses. "Collected" reflects verified payments against fees in this category.
          </p>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setModal(false)} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" className="btn-primary flex-1">{editing ? 'Save changes' : 'Add fund'}</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
