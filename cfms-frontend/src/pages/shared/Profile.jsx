import { useEffect, useRef, useState } from 'react'
import { Camera, KeyRound, Mail, Phone, ShieldCheck, Loader2, Users2, Clock, XCircle, Search, Check } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useData } from '../../context/DataContext'
import { PageHeader, Modal, notify } from '../../components/ui'
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
  const { residents, requestCommitteeTransfer, fetchMyTransferItems, cancelCommitteeTransfer, refresh } = useData()
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

  // ---- committee seat transfer (committee members only) ----
  const isCommittee = user?.role === 'admin'
  const [transferOpen, setTransferOpen] = useState(false)
  const [transferTarget, setTransferTarget] = useState('')
  const [transferQuery, setTransferQuery] = useState('')
  const [transferSubmitting, setTransferSubmitting] = useState(false)
  const [transferError, setTransferError] = useState('')
  const [transferConfirm, setTransferConfirm] = useState(false)
  const [myOutgoingRequest, setMyOutgoingRequest] = useState(null)
  const [cancelling, setCancelling] = useState(false)

  useEffect(() => {
    if (!isCommittee) return
    let cancelled = false
    fetchMyTransferItems().then((r) => {
      if (!cancelled) setMyOutgoingRequest(r.asRequester?.[0] || null)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [isCommittee, fetchMyTransferItems])

  const eligibleResidents = residents.filter((r) => r.userId !== user?.id && r.status === 'active')
  const filteredResidents = (() => {
    const q = transferQuery.trim().toLowerCase()
    if (!q) return eligibleResidents
    return eligibleResidents.filter((r) => [r.name, r.unit, r.email].join(' ').toLowerCase().includes(q))
  })()
  const selectedResident = eligibleResidents.find((r) => r.id === transferTarget)

  async function confirmTransfer() {
    setTransferSubmitting(true)
    setTransferError('')
    try {
      const created = await requestCommitteeTransfer(transferTarget)
      setMyOutgoingRequest(created)
      setTransferConfirm(false)
      setTransferOpen(false)
      setBanner('Transfer request sent. It needs every other committee member to approve, then the resident\u2019s acceptance.')
      setTimeout(() => setBanner(''), 5000)
    } catch (err) {
      setTransferError(err?.response?.data?.message || err.message || 'Could not start the transfer.')
      setTransferConfirm(false)
    } finally {
      setTransferSubmitting(false)
    }
  }

  async function cancelOutgoing() {
    if (!myOutgoingRequest) return
    setCancelling(true)
    try {
      await cancelCommitteeTransfer(myOutgoingRequest.id)
      setMyOutgoingRequest(null)
    } catch (err) {
      notify(err?.response?.data?.message || err.message || 'Could not cancel the request.')
    } finally {
      setCancelling(false)
    }
  }

  function beginVerifiedChange(type, payload) {
    const otp = generateOtp()
    setPendingAction({ type, payload, otp })
    setOtpInput('')
    setOtpError('')
    setSentNotice(`A 6-digit code was "sent" to ${user?.email}. Since no email service is connected in this environment, it's shown here instead: ${otp}`)
  }

  async function confirmOtp() {
    if (!pendingAction) return
    if (otpInput.trim() !== pendingAction.otp) {
      setOtpError('That code doesn\u2019t match. Check the code and try again.')
      return
    }
    if (pendingAction.type === 'phone') {
      try {
        await api.patch(endpoints.myResidentProfile(), { phone: pendingAction.payload.phone })
        await refresh()
        setBanner('Phone number updated.')
      } catch (err) {
        setOtpError(err?.response?.data?.message || err.message || 'Could not update your phone number.')
        return
      }
    } else if (pendingAction.type === 'avatar') {
      localStorage.setItem(`cfms_avatar_${user.id}`, pendingAction.payload.dataUrl)
      setAvatar(pendingAction.payload.dataUrl)
      setBanner('Profile picture updated.')
    }
    setPendingAction(null)
    setSentNotice('')
    setTimeout(() => setBanner(''), 4000)
  }

  function applyAvatar(dataUrl) {
    localStorage.setItem(`cfms_avatar_${user.id}`, dataUrl)
    setAvatar(dataUrl)
    setBanner('Profile picture updated.')
    setTimeout(() => setBanner(''), 4000)
  }

  function onPickFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      // Committee members can change their photo without email verification;
      // it's only required for password and phone number changes.
      if (isCommittee) applyAvatar(reader.result)
      else beginVerifiedChange('avatar', { dataUrl: reader.result })
    }
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
            <p className="text-sm text-ink-400 capitalize">{user?.role === 'admin' ? 'Committee member' : user?.role} · {user?.community}</p>
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

      {/* Committee seat transfer */}
      {isCommittee && (
        <div className="card p-5 mb-5 space-y-3">
          <h3 className="font-semibold text-ink-800 flex items-center gap-2"><Users2 className="h-4 w-4 text-brand-600" /> Transfer committee status</h3>
          <p className="text-sm text-ink-500">
            Hand your committee seat to another resident. The transfer only goes through once every other
            committee member approves, and the resident you choose accepts it too.
          </p>

          {myOutgoingRequest ? (
            <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm text-amber-700">
                <Clock className="h-4 w-4 shrink-0" />
                <span>
                  Pending &mdash; {myOutgoingRequest.status === 'PENDING_COMMITTEE' ? 'awaiting committee approval' : 'awaiting the resident\u2019s acceptance'} for{' '}
                  <strong>{myOutgoingRequest.toResident?.user?.fullName}</strong>.
                </span>
              </div>
              <button onClick={cancelOutgoing} disabled={cancelling} className="btn-secondary !py-1.5 !px-3 text-xs shrink-0">
                <XCircle className="h-3.5 w-3.5" /> {cancelling ? 'Cancelling…' : 'Cancel'}
              </button>
            </div>
          ) : (
            <button onClick={() => { setTransferOpen(true); setTransferTarget(''); setTransferQuery(''); setTransferError('') }} className="btn-secondary">
              <Users2 className="h-4 w-4" /> Start a transfer
            </button>
          )}
        </div>
      )}

      {/* Transfer: pick resident */}
      <Modal open={transferOpen} onClose={() => setTransferOpen(false)} title="Transfer committee status">
        <div className="space-y-4">
          <p className="text-sm text-ink-500">Search for the resident you want to become a committee member in your place.</p>
          <div>
            <label className="label">Resident</label>
            {selectedResident ? (
              <div className="flex items-center justify-between rounded-xl border border-brand-200 bg-brand-50/60 px-3.5 py-2.5">
                <div className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-brand-600 shrink-0" />
                  <span className="font-medium text-ink-800">{selectedResident.name}</span>
                  <span className="text-ink-400">· Unit {selectedResident.unit}</span>
                </div>
                <button
                  type="button"
                  onClick={() => { setTransferTarget(''); setTransferQuery('') }}
                  className="text-xs font-medium text-brand-600 hover:text-brand-700"
                >
                  Change
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
                <input
                  autoFocus
                  className="input pl-9"
                  placeholder="Type a name, unit, or email…"
                  value={transferQuery}
                  onChange={(e) => setTransferQuery(e.target.value)}
                />
                {transferQuery.trim() && (
                  <div className="mt-1.5 rounded-xl border border-ink-100 max-h-56 overflow-y-auto divide-y divide-ink-50">
                    {filteredResidents.length === 0 ? (
                      <p className="px-3.5 py-3 text-sm text-ink-400 text-center">No matching residents.</p>
                    ) : (
                      filteredResidents.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => { setTransferTarget(r.id); setTransferQuery('') }}
                          className="w-full text-left px-3.5 py-2.5 hover:bg-brand-50 transition flex items-center justify-between"
                        >
                          <span className="text-sm font-medium text-ink-800">{r.name}</span>
                          <span className="text-xs text-ink-400">Unit {r.unit}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          {transferError && <p className="text-sm text-rose-600">{transferError}</p>}
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setTransferOpen(false)} className="btn-secondary flex-1">Cancel</button>
            <button type="button" disabled={!transferTarget} onClick={() => setTransferConfirm(true)} className="btn-primary flex-1 disabled:opacity-40">Continue</button>
          </div>
        </div>
      </Modal>

      {/* Transfer: final confirmation */}
      <Modal open={transferConfirm} onClose={() => setTransferConfirm(false)} title="Confirm transfer request">
        <div className="space-y-4">
          <p className="text-sm text-ink-500">
            You\u2019re about to request handing your committee seat to{' '}
            <strong className="text-ink-800">{selectedResident?.name}</strong>.
            This can\u2019t be undone once everyone accepts &mdash; are you sure?
          </p>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setTransferConfirm(false)} className="btn-secondary flex-1">Go back</button>
            <button type="button" disabled={transferSubmitting} onClick={confirmTransfer} className="btn-primary flex-1">
              {transferSubmitting ? 'Sending…' : 'Yes, send request'}
            </button>
          </div>
        </div>
      </Modal>

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
