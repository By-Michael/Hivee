import { useEffect, useState } from 'react'
import { Landmark, Save, CheckCircle2 } from 'lucide-react'
import { useData } from '../../context/DataContext'
import { PageHeader } from '../../components/ui'

export default function AdminSettings() {
  const { community, updateCommunity } = useData()
  const [form, setForm] = useState({
    name: '', address: '', contactInfo: '',
    paymentBankName: '', paymentAccountName: '', paymentAccountNumber: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (community) {
      setForm({
        name: community.name || '',
        address: community.address || '',
        contactInfo: community.contactInfo || '',
        paymentBankName: community.paymentBankName || '',
        paymentAccountName: community.paymentAccountName || '',
        paymentAccountNumber: community.paymentAccountNumber || '',
      })
    }
  }, [community])

  async function submit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      await updateCommunity(form)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Could not save settings.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader title="Settings" subtitle="Community details and the payment account residents will send money to." />

      <form onSubmit={submit} className="card p-6 max-w-2xl space-y-6">
        <div>
          <h3 className="text-sm font-semibold text-ink-800 mb-3">Community</h3>
          <div className="space-y-4">
            <div>
              <label className="label">Community name</label>
              <input required className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="label">Address</label>
              <input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div>
              <label className="label">Contact info</label>
              <input className="input" value={form.contactInfo} onChange={(e) => setForm({ ...form, contactInfo: e.target.value })} />
            </div>
          </div>
        </div>

        <div className="pt-2 border-t border-ink-100">
          <h3 className="text-sm font-semibold text-ink-800 mb-1 flex items-center gap-2">
            <Landmark className="h-4 w-4 text-brand-600" /> Payment account
          </h3>
          <p className="text-xs text-ink-400 mb-3">
            Shown to every resident in "Make a payment" as the account to transfer into — one account for the whole community.
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="label">Bank name</label>
              <input required className="input" placeholder="e.g. Commercial Bank of Ethiopia" value={form.paymentBankName} onChange={(e) => setForm({ ...form, paymentBankName: e.target.value })} />
            </div>
            <div>
              <label className="label">Account name</label>
              <input required className="input" placeholder="e.g. Greenwood Estate Committee" value={form.paymentAccountName} onChange={(e) => setForm({ ...form, paymentAccountName: e.target.value })} />
            </div>
            <div>
              <label className="label">Account number</label>
              <input required className="input font-mono" value={form.paymentAccountNumber} onChange={(e) => setForm({ ...form, paymentAccountNumber: e.target.value })} />
            </div>
          </div>
        </div>

        {error && <div className="rounded-xl bg-rose-50 border border-rose-100 px-3.5 py-2.5 text-sm text-rose-600">{error}</div>}

        <div className="flex items-center gap-3 pt-2">
          <button type="submit" disabled={saving} className="btn-primary">
            <Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save settings'}
          </button>
          {saved && (
            <span className="flex items-center gap-1.5 text-sm text-emerald-600 font-medium">
              <CheckCircle2 className="h-4 w-4" /> Saved
            </span>
          )}
        </div>
      </form>
    </div>
  )
}
