import { createContext, useContext, useState, useEffect } from 'react'

const THEMES = [
  { id: 'sunset', label: 'غروب', swatch: '#E8873A' },
  { id: 'ocean', label: 'محيط', swatch: '#2E8BC0' },
  { id: 'berry', label: 'توت', swatch: '#C15B8F' },
]

const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('masar-theme') || 'sunset')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('masar-theme', theme)
  }, [theme])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider')
  return ctx
}