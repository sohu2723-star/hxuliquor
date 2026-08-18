import { createContext, ReactNode, useContext, useEffect, useState } from 'react'
import { api } from '../lib/api'
import { supabase } from '../lib/supabase'
import type { User } from '../lib/api'

interface AuthContextType {
  user: User | null
  signInWithGoogle: (idToken: string) => Promise<void>
  logout: () => Promise<void>
  isLoading: boolean
  authError: string
}

const USER_KEY = 'minimart-pos-user'
const AUTH_LOAD_TIMEOUT_MS = 15000

function readStoredUser(): User | null {
  try {
    const stored = JSON.parse(localStorage.getItem(USER_KEY) || 'null') as Partial<User> | null
    if (!stored?.id || !stored.email) return null
    return { id: String(stored.id), name: String(stored.name || stored.email.split('@')[0]), email: String(stored.email).toLowerCase(), role: String(stored.role || 'employee').toLowerCase(), sessionToken: stored.sessionToken }
  } catch { return null }
}

function clearStoredUser() {
  try { localStorage.removeItem(USER_KEY) } catch { /* storage unavailable */ }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('Login is taking too long. Please try again.')), timeoutMs)
    promise.then(
      (value) => { window.clearTimeout(timer); resolve(value) },
      (error) => { window.clearTimeout(timer); reject(error) },
    )
  })
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => readStoredUser())
  const [isLoading, setIsLoading] = useState(() => !readStoredUser())
  const [authError, setAuthError] = useState('')

  useEffect(() => {
    let mounted = true
    let loadRequest = 0

    const loadUser = async () => {
      const requestId = ++loadRequest
      try {
        const currentUser = await withTimeout(api.getCurrentUser(), AUTH_LOAD_TIMEOUT_MS)
        if (!mounted || requestId !== loadRequest) return
        setUser(currentUser)
        setAuthError('')
        if (currentUser) localStorage.setItem(USER_KEY, JSON.stringify(currentUser))
        else clearStoredUser()
      } catch (error) {
        if (!mounted || requestId !== loadRequest) return
        const message = error instanceof Error ? error.message : 'Unable to finish login. Please try again.'
        if (/Employee Accounts|Gmail/i.test(message)) {
          setUser(null)
          clearStoredUser()
        }
        // Keep a cached user visible during temporary network/proxy delays.
        // The next auth event or successful request will replace it with fresh data.
        setAuthError(message)
      } finally {
        if (mounted && requestId === loadRequest) setIsLoading(false)
      }
    }

    void loadUser()
    // Defer database/profile work until Supabase has released its auth lock.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted || event === 'INITIAL_SESSION') return
      if (event === 'SIGNED_OUT' || !session) {
        loadRequest += 1
        setUser(null)
        setAuthError('')
        clearStoredUser()
        setIsLoading(false)
        return
      }
      // SIGNED_IN / TOKEN_REFRESHED should refresh quietly when a user is already cached.
      if (event === 'SIGNED_IN') setIsLoading(true)
      window.setTimeout(() => { if (mounted) void loadUser() }, 0)
    })
    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (user?.role !== 'admin') return
    const timer = window.setTimeout(() => {
      void api.getEmployees(true).catch(() => {})
      const now = new Date()
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Yangon', year: 'numeric', month: '2-digit' }).formatToParts(now)
      const year = parts.find((part) => part.type === 'year')?.value
      const month = parts.find((part) => part.type === 'month')?.value
      if (!year || !month) return
      const lastDay = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate()
      void api.getSales(`${year}-${month}-01`, `${year}-${month}-${String(lastDay).padStart(2, '0')}`, true).catch(() => {})
    }, 1500)
    return () => window.clearTimeout(timer)
  }, [user])

  const signInWithGoogle = async (idToken: string) => {
    setAuthError('')
    await api.signInWithGoogle(idToken)
  }

  const logout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    clearStoredUser()
  }

  return <AuthContext.Provider value={{ user, signInWithGoogle, logout, isLoading, authError }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) throw new Error('useAuth must be used within AuthProvider')
  return context
}
