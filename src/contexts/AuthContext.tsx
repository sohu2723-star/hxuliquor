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
const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    try {
      const storedUser = localStorage.getItem(USER_KEY)
      const storedToken = localStorage.getItem(AUTH_TOKEN_KEY)
      if (storedUser && storedToken && !isExpiredGoogleToken(storedToken)) {
        setUser(JSON.parse(storedUser) as User)
      } else {
        localStorage.removeItem(USER_KEY)
        localStorage.removeItem(AUTH_TOKEN_KEY)
      }
    } catch {
      localStorage.removeItem(USER_KEY)
      localStorage.removeItem(AUTH_TOKEN_KEY)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const googleLogin = async (idToken: string) => {
    const userData = await api.googleLogin(idToken)
    setUser(userData)
    localStorage.setItem(USER_KEY, JSON.stringify(userData))
    localStorage.setItem(AUTH_TOKEN_KEY, idToken)
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem(USER_KEY)
    localStorage.removeItem(AUTH_TOKEN_KEY)
  }

  return (
    <AuthContext.Provider value={{ user, googleLogin, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  )
}

function isExpiredGoogleToken(token: string): boolean {
  try {
    const payload = token.split('.')[1]
    if (!payload) return true
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number }
    return typeof decoded.exp === 'number' && decoded.exp * 1000 <= Date.now()
  } catch {
    return true
  }
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
