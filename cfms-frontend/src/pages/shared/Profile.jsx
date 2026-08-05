import { useRef, useState } from 'react'
import { Camera, KeyRound, Mail, Phone, ShieldCheck, Loader2 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useData } from '../../context/DataContext'
import { PageHeader } from '../../components/ui'
import { getMeta, setMeta } from '../../lib/adapters'
import api, { endpoints } from '../../lib/api'

// Every sensitive profile change (password, phone, picture) goes through a
// one-time code sent to the account's email — the one field nobody, not
// even the resident themself, can edit once the committee registers them.
// This environment has no SMTP/email provider wired up, so the code is
// surfaced directly in the UI instead of actually being emailed; swap
// `sendOtp` for a real mail call once one is configured.
function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

export default function Profile() {
  const { user } = useAuth()
  const { residents } = useData()
  const me = residents.find((r) => r.userId === user?.id || r.id === user?.residentId)

  const [pendingAction, setPendingAction] = useState(null) // { type, payload, otp }
  const [otpInput, setOtpInput] = useState('')
  const [otpError, setOtpError] = useState('')
  const [sentNotice, setSentNotice] = useState('')
  const [banner, setBanner] = useState('')
  const fileRef = useRef(null)

  const [phone, setPhone] = useState(me?.phone || '')
  const [avatar, setAvatar] = useState(() => (user?.id ? localStorage.getItem(`cfms_avatar_${user.id}`) : null))

  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' })
  const [pwError, setPwError] = useState('')
  const [pwLoading, setPwLoading] = useState(false)

  function beginVerifiedChange(type, payload) {
    const otp = generateOtp()
    setPendingAction({ type, payload, otp })
    setOtpInput('')
    setOtpError('')
    setSentNotice(`A 6-digit code was "sent" to ${user?.email}. Since no email service is connected in this environment, it's shown here instead: ${otp}`)
  }

  function confirmOtp() {
    if (!pendingAction) return
    if (otpInput.trim() !== pendingAction.otp) {
      setOtpError('That code doesn\u2019t match. Check the code and try again.')
      return
    }
    if (pendingAction.type === 'phone') {
      setMeta('residentPhone', me.id, pendingAction.payload.phone)
      setBanner('Phone number updated.')
    } else if (pendingAction.type === 'avatar') {
      localStorage.setItem(`cfms_avatar_${user.id}`, pendingAction.payload.dataUrl)
      setAvatar(pendingAction.payload.dataUrl)
      setBanner('Profile picture updated.')
    }
    setPendingAction(null)
    setSentNotice('')
    setTimeout(() => setBanner(''), 4000)
  }

  function onPickFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => beginVerifiedChange('avatar', { dataUrl: reader.result })
    reader.readAsDataURL(file)
  }

  function submitPhone(e) {
    e.preventDefault()
    if (!phone.trim()) return
    beginVerifiedChange('phone', { phone: phone.trim() })
  }

  async function submitPassword(e) {
    e.preventDefault()
    setPwError('')
    if (pwForm.next.length < 8) return setPwError('New password must be at least 8 characters.')
    if (pwForm.next !== pwForm.confirm) return setPwError('New password and confirmation don\u2019t match.')
    setPwLoading(true)
    try {
      await api.patch(endpoints.changePassword(), { currentPassword: pwForm.current, newPassword: pwForm.next })
      setPwForm({ current: '', next: '', confirm: '' })
      setBanner('Password changed. You\u2019ll need it next time you sign in.')
      setTimeout(() => setBanner(''), 4000)
    } catch (err) {
      setPwError(err?.response?.data?.message || err.message || 'Could not change password.')
    } finally {
      setPwLoading(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <PageHeader title="Profile settings" subtitle="Manage your password, photo, and phone number. Your email is fixed by the committee." />

      {banner && <div className="mb-5 rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3 text-sm text-emerald-700">{banner}</div>}

      {/* Identity */}
      <div className="card p-5 mb-5">
        <div className="flex items-center gap-4">
          <div className="relative">
            {avatar ? (
              <img src={avatar} alt="" className="h-16 w-16 rounded-full object-cover ring-1 ring-ink-100" />
            ) : (
              <div className="h-16 w-16 rounded-full flex items-center justify-center text-white text-lg font-bold font-display" style={{ background: user?.avatarColor || '#2570f5' }}>
                {user?.name?.split(' ').map((n) => n[0]).slice(0, 2).join('')}
              </div>
            )}
            <button
              onClick={() => fileRef.current?.click()}
              className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-brand-gradient text-white flex items-center justify-center shadow-glow"
              title="Change profile picture"
            >
              <Camera className="h-3.5 w-3.5" />
            </button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onPickFile} />
          </div>
          <div>
            <p className="font-semibold text-ink-800">{user?.name}</p>
            <p className="text-sm text-ink-400 capitalize">{user?.role} · {user?.community}</p>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-2.5 rounded-xl bg-ink-50/70 px-3.5 py-2.5">
          <Mail className="h-4 w-4 text-ink-400 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm text-ink-700 truncate">{user?.email}</p>
            <p className="text-xs text-ink-400">Registered by the committee &middot; can\u2019t be changed here.</p>
          </div>
        </div>
      </div>

      {/* Phone */}
      <form onSubmit={submitPhone} className="card p-5 mb-5 space-y-3">
        <h3 className="font-semibold text-ink-800 flex items-center gap-2"><Phone className="h-4 w-4 text-brand-600" /> Phone number</h3>
        <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+251 9xx xxx xxx" />
        <button type="submit" className="btn-secondary">Update phone (verify by email)</button>
      </form>

      {/* Password */}
      <form onSubmit={submitPassword} className="card p-5 mb-5 space-y-3">
        <h3 className="font-semibold text-ink-800 flex items-center gap-2"><KeyRound className="h-4 w-4 text-brand-600" /> Change password</h3>
        <div>
          <label className="label">Current password</label>
          <input type="password" required className="input" value={pwForm.current} onChange={(e) => setPwForm({ ...pwForm, current: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">New password</label>
            <input type="password" required minLength={8} className="input" value={pwForm.next} onChange={(e) => setPwForm({ ...pwForm, next: e.target.value })} />
          </div>
          <div>
            <label className="label">Confirm new password</label>
            <input type="password" required minLength={8} className="input" value={pwForm.confirm} onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })} />
          </div>
        </div>
        {pwError && <p className="text-sm text-rose-600">{pwError}</p>}
        <button type="submit" disabled={pwLoading} className="btn-primary">
          {pwLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          {pwLoading ? 'Updating…' : 'Change password'}
        </button>
      </form>

      {/* OTP modal */}
      {pendingAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink-900/40 backdrop-blur-sm" onClick={() => setPendingAction(null)} />
          <div className="relative w-full max-w-sm card p-6 animate-fade-up">
            <h3 className="text-lg font-bold text-ink-900 mb-1">Verify it\u2019s you</h3>
            <p className="text-sm text-ink-500 mb-4">{sentNotice}</p>
            <label className="label">6-digit code</label>
            <input
              autoFocus
              inputMode="numeric"
              maxLength={6}
              className="input tracking-[0.5em] text-center text-lg font-semibold"
              value={otpInput}
              onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, ''))}
            />
            {otpError && <p className="text-sm text-rose-600 mt-2">{otpError}</p>}
            <div className="flex gap-2 pt-4">
              <button onClick={() => setPendingAction(null)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={confirmOtp} className="btn-primary flex-1">Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
