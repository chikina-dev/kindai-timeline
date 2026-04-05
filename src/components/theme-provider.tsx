'use client'

import * as React from 'react'

type ThemeMode = 'light' | 'dark' | 'system'

type ThemeProviderContextValue = {
  theme: ThemeMode
  resolvedTheme: 'light' | 'dark'
  systemTheme: 'light' | 'dark'
  setTheme: (theme: ThemeMode) => void
  themes: ThemeMode[]
}

export type ThemeProviderProps = {
  children: React.ReactNode
  attribute?: 'class' | `data-${string}`
  defaultTheme?: ThemeMode
  enableSystem?: boolean
  enableColorScheme?: boolean
  disableTransitionOnChange?: boolean
  storageKey?: string
}

const ThemeProviderContext = React.createContext<ThemeProviderContextValue | undefined>(undefined)

const DEFAULT_THEMES: ThemeMode[] = ['light', 'dark', 'system']

function getSystemTheme() {
  if (typeof window === 'undefined') {
    return 'dark' as const
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function getStoredTheme(storageKey: string) {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const storedTheme = window.localStorage.getItem(storageKey)
    return storedTheme === 'light' || storedTheme === 'dark' || storedTheme === 'system'
      ? storedTheme
      : null
  } catch {
    return null
  }
}

function applyThemeToDocument(
  attribute: ThemeProviderProps['attribute'],
  theme: ThemeMode,
  enableSystem: boolean,
  enableColorScheme: boolean,
) {
  if (typeof document === 'undefined') {
    return getSystemTheme()
  }

  const resolvedTheme = theme === 'system' && enableSystem ? getSystemTheme() : theme === 'system' ? 'light' : theme
  const root = document.documentElement

  if (attribute === 'class') {
    root.classList.remove('light', 'dark')
    root.classList.add(resolvedTheme)
  } else {
    root.setAttribute(attribute ?? 'data-theme', resolvedTheme)
  }

  if (enableColorScheme) {
    root.style.colorScheme = resolvedTheme
  }

  return resolvedTheme
}

function disableTransitionsTemporarily() {
  const style = document.createElement('style')
  style.appendChild(
    document.createTextNode(
      '*,*::before,*::after{-webkit-transition:none!important;-moz-transition:none!important;-o-transition:none!important;-ms-transition:none!important;transition:none!important}',
    ),
  )

  document.head.appendChild(style)

  return () => {
    window.getComputedStyle(document.body)
    window.setTimeout(() => {
      document.head.removeChild(style)
    }, 1)
  }
}

function buildThemeInitScript({
  attribute = 'data-theme',
  defaultTheme = 'system',
  enableSystem = true,
  enableColorScheme = true,
  storageKey = 'theme',
}: Omit<ThemeProviderProps, 'children' | 'disableTransitionOnChange'>) {
  return `(function(){try{var attribute=${JSON.stringify(attribute)};var defaultTheme=${JSON.stringify(defaultTheme)};var enableSystem=${JSON.stringify(enableSystem)};var enableColorScheme=${JSON.stringify(enableColorScheme)};var storageKey=${JSON.stringify(storageKey)};var root=document.documentElement;var systemTheme=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';var storedTheme=localStorage.getItem(storageKey);var theme=storedTheme==='light'||storedTheme==='dark'||storedTheme==='system'?storedTheme:defaultTheme;var resolvedTheme=theme==='system'&&enableSystem?systemTheme:(theme==='system'?'light':theme);if(attribute==='class'){root.classList.remove('light','dark');root.classList.add(resolvedTheme);}else{root.setAttribute(attribute,resolvedTheme);}if(enableColorScheme){root.style.colorScheme=resolvedTheme;}}catch(e){}})();`
}

export function ThemeProvider({
  children,
  attribute = 'data-theme',
  defaultTheme = 'system',
  enableSystem = true,
  enableColorScheme = true,
  disableTransitionOnChange = false,
  storageKey = 'theme',
}: ThemeProviderProps) {
  const [theme, setThemeState] = React.useState<ThemeMode>(defaultTheme)
  const [systemTheme, setSystemTheme] = React.useState<'light' | 'dark'>('dark')

  const resolvedTheme = theme === 'system' && enableSystem ? systemTheme : theme === 'system' ? 'light' : theme

  React.useEffect(() => {
    const nextSystemTheme = getSystemTheme()
    const nextTheme = getStoredTheme(storageKey) ?? defaultTheme

    setSystemTheme(nextSystemTheme)
    setThemeState(nextTheme)
    applyThemeToDocument(attribute, nextTheme, enableSystem, enableColorScheme)
  }, [attribute, defaultTheme, enableColorScheme, enableSystem, storageKey])

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const updateSystemTheme = () => {
      const nextSystemTheme = mediaQuery.matches ? 'dark' : 'light'
      setSystemTheme(nextSystemTheme)

      if (theme === 'system' && enableSystem) {
        applyThemeToDocument(attribute, 'system', enableSystem, enableColorScheme)
      }
    }

    updateSystemTheme()
    mediaQuery.addEventListener('change', updateSystemTheme)

    return () => {
      mediaQuery.removeEventListener('change', updateSystemTheme)
    }
  }, [attribute, enableColorScheme, enableSystem, theme])

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== storageKey) {
        return
      }

      const nextTheme = getStoredTheme(storageKey) ?? defaultTheme
      setThemeState(nextTheme)
      applyThemeToDocument(attribute, nextTheme, enableSystem, enableColorScheme)
    }

    window.addEventListener('storage', handleStorage)

    return () => {
      window.removeEventListener('storage', handleStorage)
    }
  }, [attribute, defaultTheme, enableColorScheme, enableSystem, storageKey])

  const setTheme = React.useCallback(
    (nextTheme: ThemeMode) => {
      const cleanupTransitions =
        disableTransitionOnChange && typeof document !== 'undefined'
          ? disableTransitionsTemporarily()
          : null

      setThemeState(nextTheme)

      try {
        window.localStorage.setItem(storageKey, nextTheme)
      } catch {}

      applyThemeToDocument(attribute, nextTheme, enableSystem, enableColorScheme)
      cleanupTransitions?.()
    },
    [attribute, disableTransitionOnChange, enableColorScheme, enableSystem, storageKey],
  )

  const value = React.useMemo<ThemeProviderContextValue>(
    () => ({
      theme,
      resolvedTheme,
      systemTheme,
      setTheme,
      themes: DEFAULT_THEMES,
    }),
    [resolvedTheme, setTheme, systemTheme, theme],
  )

  return (
    <ThemeProviderContext.Provider value={value}>
      <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: buildThemeInitScript({ attribute, defaultTheme, enableSystem, enableColorScheme, storageKey }) }} />
      {children}
    </ThemeProviderContext.Provider>
  )
}

export function useTheme() {
  const context = React.useContext(ThemeProviderContext)

  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }

  return context
}
