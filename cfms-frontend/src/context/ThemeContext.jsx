import { createContext, useContext, useEffect, useState } from 'react'

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
  // White/light is the default unless the user has explicitly chosen dark.
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('cfms_theme')
    return saved === 'dark' ? 'dark' : 'light'
  })

  useEffect(() => {
    applyTheme(theme)
    localStorage.setItem('cfms_theme', theme)
  }, [theme])

  function toggleTheme() {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
