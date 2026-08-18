import { createContext, useContext, useEffect, useState } from 'react'
import api, { endpoints } from '../lib/api'
import { useAuth } from './AuthContext'

const ThemeContext = createContext(null)

function applyTheme(theme) {
  const root = document.documentElement

  // Kill every transition on the page for one frame so the class flip
  // below is instant (no color/background fade), then restore normal
  // transitions (hover states, sidebar collapse, etc.) right after.
  const style = document.createElement('style')
  style.textContent = '*, *::before, *::after { transition: none !important; }'
  document.head.appendChild(style)

  if (theme === 'dark') root.classList.add('dark')
  else root.classList.remove('dark')

  // Force a reflow so the class change is applied under "no transition",
  // then remove the override on the next frame.
  window.getComputedStyle(style).opacity
  requestAnimationFrame(() => {
    document.head.removeChild(style)
  })
}

export function ThemeProvider({ children }) {
  const { user, patchUser } = useAuth()
  // White/light is the default unless the user has explicitly chosen dark.
  // Sourced from the user's database-backed preferences (see
  // PATCH /users/me/preferences) so the choice follows them to any
  // device/browser, not just the one that set it.
  const [theme, setTheme] = useState(() => (user?.preferences?.theme === 'dark' ? 'dark' : 'light'))

  // Re-sync if the logged-in user changes (e.g. login/logout, or /auth/me
  // resolving after page load with a different cached value).
  useEffect(() => {
    setTheme(user?.preferences?.theme === 'dark' ? 'dark' : 'light')
  }, [user?.id, user?.preferences?.theme])

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  function persistTheme(next) {
    setTheme(next)
    if (!user) return
    patchUser({ preferences: { ...(user.preferences || {}), theme: next } })
    api.patch(endpoints.myPreferences(), { theme: next }).catch(() => {})
  }

  function toggleTheme() {
    persistTheme(theme === 'dark' ? 'light' : 'dark')
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme: persistTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
