import { createContext, ReactNode, useContext, useEffect, useState } from 'react'
import { api } from '../lib/api'
import { supabase } from '../lib/supabase'
import type { User } from '../lib/api'

interface AuthContextType {
  user: User | null
  signInWithGoogle: () => Promise<void>
  logout: () => Promise<void>
  isLoading: boolean
}

const USER_KEY = 'minimart-pos-user'

function clearStoredUser() {
  try { localStorage.removeItem(USER_KEY) } catch { /* storage unavailable */ }
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    const loadUser = async () => {
      try {
        const currentUser = await api.getCurrentUser()
        if (!mounted) return
        setUser(currentUser)
        if (currentUser) localStorage.setItem(USER_KEY, JSON.stringify(currentUser))
        else clearStoredUser()
      } catch {
        if (mounted) {
          setUser(null)
          clearStoredUser()
        }
      } finally {
        if (mounted) setIsLoading(false)
      }
    }

    void loadUser()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => { void loadUser() })
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
    }, 800)
    return () => window.clearTimeout(timer)
  }, [user])

  const signInWithGoogle = async () => {
    await api.signInWithGoogle()
  }

  const logout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    clearStoredUser()
  }

  return <AuthContext.Provider value={{ user, signInWithGoogle, logout, isLoading }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) throw new Error('useAuth must be used within AuthProvider')
  return context
}
