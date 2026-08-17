import { createContext, ReactNode, useContext, useEffect, useState } from 'react'
import { api, AUTH_TOKEN_KEY } from '../lib/api'
import type { User } from '../lib/api'

interface AuthContextType {
  user: User | null
  googleLogin: (idToken: string) => Promise<void>
  logout: () => void
  isLoading: boolean
}

const USER_KEY = 'minimart-pos-user'
const AUTH_META_KEY = 'minimart-pos-auth-meta'
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000

type AuthMeta = { expiresAt: number }

function clearStoredAuth() {
  localStorage.removeItem(USER_KEY)
  localStorage.removeItem(AUTH_TOKEN_KEY)
  localStorage.removeItem(AUTH_META_KEY)
}

function readAuthMeta(): AuthMeta | null {
  const stored = localStorage.getItem(AUTH_META_KEY)
  if (!stored) return null
  const parsed = JSON.parse(stored) as Partial<AuthMeta>
  return typeof parsed.expiresAt === 'number' ? { expiresAt: parsed.expiresAt } : null
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    try {
      const storedUser = localStorage.getItem(USER_KEY)
      const storedToken = localStorage.getItem(AUTH_TOKEN_KEY)
      const storedMeta = readAuthMeta()
      if (storedUser && storedToken && (!storedMeta || storedMeta.expiresAt > Date.now())) {
        if (!storedMeta) localStorage.setItem(AUTH_META_KEY, JSON.stringify({ expiresAt: Date.now() + SESSION_TTL_MS } satisfies AuthMeta))
        setUser(JSON.parse(storedUser) as User)
      } else {
        clearStoredAuth()
      }
    } catch {
      clearStoredAuth()
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (user?.role !== 'admin') return
    const timer = window.setTimeout(() => {
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Yangon', year: 'numeric', month: '2-digit' }).formatToParts(new Date())
      const year = parts.find((part) => part.type === 'year')?.value
      const month = parts.find((part) => part.type === 'month')?.value
      if (!year || !month) return
      const lastDay = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate()
      void api.getEmployees(true).catch(() => {})
      void api.getSales(`${year}-${month}-01`, `${year}-${month}-${String(lastDay).padStart(2, '0')}`, true).catch(() => {})
    }, 800)
    return () => window.clearTimeout(timer)
  }, [user])

  const googleLogin = async (idToken: string) => {
    const userData = await api.googleLogin(idToken)
    setUser(userData)
    localStorage.setItem(USER_KEY, JSON.stringify(userData))
    localStorage.setItem(AUTH_TOKEN_KEY, userData.sessionToken || idToken)
    localStorage.setItem(AUTH_META_KEY, JSON.stringify({ expiresAt: Date.now() + SESSION_TTL_MS } satisfies AuthMeta))
  }

  const logout = () => {
    setUser(null)
    clearStoredAuth()
  }

  return (
    <AuthContext.Provider value={{ user, googleLogin, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  )
}


export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
