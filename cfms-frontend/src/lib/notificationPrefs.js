// Notification categories a person can mute individually. There's no
// backend table for this yet (no NotificationPreference model), so — same
// pattern already used for the profile-picture cache (`cfms_avatar_${id}`)
// — preferences live in localStorage, per user, on this device.
//
// `roles` controls which tab sees the toggle: committee members get the
// admin-flavoured categories (approvals, verification queue, receipts),
// residents get the resident-flavoured ones (fee reminders, payment
// results). `transfers` applies to both since anyone can be offered a
// committee seat.
export const NOTIFICATION_CATEGORIES = [
  {
    id: 'transfers',
    label: 'Committee transfers',
    description: 'Someone proposing to hand you their seat, or asking you to approve a transfer.',
    roles: ['admin', 'resident'],
  },
  {
    id: 'approvals',
    label: 'Approval requests',
    description: 'Community changes (like updated payment account details) that need your sign-off.',
    roles: ['admin'],
  },
  {
    id: 'payments',
    label: 'Payment activity',
    description: 'Admin: payments waiting on verification. Resident: your payments being verified or rejected.',
    roles: ['admin', 'resident'],
  },
  {
    id: 'expenses',
    label: 'Expense receipts',
    description: 'Logged expenses that are still missing a receipt.',
    roles: ['admin'],
  },
  {
    id: 'fees',
    label: 'Fee reminders',
    description: 'Fees you haven\u2019t paid yet.',
    roles: ['resident'],
  },
]

const DEFAULTS = Object.fromEntries(NOTIFICATION_CATEGORIES.map((c) => [c.id, true]))
const EVENT_NAME = 'cfms:notif-prefs-changed'
const key = (userId) => `cfms_notif_prefs_${userId}`

export function getNotificationPrefs(userId) {
  if (!userId) return { ...DEFAULTS }
  try {
    const raw = localStorage.getItem(key(userId))
    if (!raw) return { ...DEFAULTS }
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULTS }
  }
}

export function setNotificationPref(userId, categoryId, enabled) {
  if (!userId) return
  const next = { ...getNotificationPrefs(userId), [categoryId]: enabled }
  localStorage.setItem(key(userId), JSON.stringify(next))
  // Same-tab listeners (the bell in AppLayout) don't get a native `storage`
  // event since that only fires in *other* tabs — dispatch our own so the
  // bell updates instantly after a toggle without a page reload.
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { userId, prefs: next } }))
  return next
}

export function onNotificationPrefsChanged(callback) {
  window.addEventListener(EVENT_NAME, callback)
  return () => window.removeEventListener(EVENT_NAME, callback)
}
