import { createContext, useContext, useState, useEffect } from 'react'

const THEMES = [
  { id: 'sunset', label: 'غروب', desc: 'دافئ وودود، الافتراضي', swatch: '#E8873A', mode: 'light' },
  { id: 'ocean', label: 'محيط', desc: 'أزرق هادئ ومركّز', swatch: '#2E8BC0', mode: 'light' },
  { id: 'berry', label: 'توت', desc: 'وردي دافئ، طاقة إيجابية', swatch: '#C15B8F', mode: 'light' },
  { id: 'forest', label: 'غابة', desc: 'أخضر طبيعي، مريح للعين', swatch: '#2F8F5B', mode: 'light' },
  { id: 'midnight', label: 'ليلي', desc: 'داكن أنيق لقلة الإضاءة', swatch: '#6C8CFF', mode: 'dark' },
  { id: 'royal', label: 'ملكي', desc: 'بنفسجي فخم، طابع إداري', swatch: '#7C5CD6', mode: 'light' },
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