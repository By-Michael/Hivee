import { useEffect, useState } from 'react'
import { Landmark, Save, CheckCircle2, AlertTriangle, ShieldAlert } from 'lucide-react'
import { useData } from '../../context/DataContext'
import { PageHeader } from '../../components/ui'

export default function AdminSettings() {
  const { community, updateCommunity } = useData()
  const [form, setForm] = useState({
    name: '', address: '', contactInfo: '',
    paymentBankName: '', paymentAccountName: '', paymentAccountNumber: '',
    autoVerifyMaxAmount: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [pendingNotice, setPendingNotice] = useState('')

  useEffect(() => {
    if (community) {
      setForm({
        name: community.name || '',
        address: community.address || '',
        contactInfo: community.contactInfo || '',
        paymentBankName: community.paymentBankName || '',
        paymentAccountName: community.paymentAccountName || '',
        paymentAccountNumber: community.paymentAccountNumber || '',
        autoVerifyMaxAmount: community.autoVerifyMaxAmount ?? '',
      })
    }
  }, [community])

  async function submit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSaved(false)
    setPendingNotice('')
    try {
      const result = await updateCommunity({
        ...form,
        autoVerifyMaxAmount: form.autoVerifyMaxAmount === '' ? null : Number(form.autoVerifyMaxAmount),
      })
      // Bank-detail fields don't apply instantly — they went through
      // committee approval on the backend. Tell the admin which happened
      // rather than showing a plain "Saved" that would imply it's live now.
      if (result?.bankDetailsMessage) {
        setPendingNotice(result.bankDetailsMessage)
        setTimeout(() => setPendingNotice(''), 8000)
      }
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

      {community?.bankVerificationStubActive && (
        <div className="max-w-2xl mb-6 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3.5 text-sm text-rose-700 flex gap-3 items-start">
          <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Bank verification is not live.</p>
            <p className="mt-1">
              No <code className="font-mono">VERITAS_API_KEY</code> is configured on the server, so resident
              self-verified payments are not actually being checked against a real bank. Any transaction ID
              a resident types in will currently be accepted. Set <code className="font-mono">VERITAS_API_KEY</code> in
              the backend environment before relying on self-verification in production.
            </p>
          </div>
        </div>
      )}

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
            Changes here need every other committee member to approve before they take effect (see the notification
            bell / dashboard once you save).
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

        <div className="pt-2 border-t border-ink-100">
          <h3 className="text-sm font-semibold text-ink-800 mb-1 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" /> Self-verification safeguard
          </h3>
          <p className="text-xs text-ink-400 mb-3">
            Self-verified payments at or above this amount always go to "Pending review" for a committee
            member to check, even if the bank lookup matched. Leave blank to only rely on the automatic
            name/amount cross-checks.
          </p>
          <div className="max-w-xs">
            <label className="label">Auto-verify review threshold (birr)</label>
            <input
              type="number" min="0" step="1" className="input"
              placeholder="e.g. 5000"
              value={form.autoVerifyMaxAmount}
              onChange={(e) => setForm({ ...form, autoVerifyMaxAmount: e.target.value })}
            />
          </div>
        </div>

        {error && <div className="rounded-xl bg-rose-50 border border-rose-100 px-3.5 py-2.5 text-sm text-rose-600">{error}</div>}
        {pendingNotice && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 text-sm text-amber-700 flex gap-2 items-start">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> {pendingNotice}
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button type="submit" disabled={saving} className="btn-primary">
            <Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save settings'}
          </button>
          {saved && !pendingNotice && (
            <span className="flex items-center gap-1.5 text-sm text-emerald-600 font-medium">
              <CheckCircle2 className="h-4 w-4" /> Saved
            </span>
          )}
        </div>
      </form>
    </div>
  )
}
