import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { api } from '../lib/api'
import type { User } from '../lib/api'

interface AuthContextType {
  user: User | null
  googleLogin: (idToken: string) => Promise<void>
  logout: () => void
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem('minimart-pos-user')
    if (stored) {
      try {
        setUser(JSON.parse(stored))
      } catch {
        localStorage.removeItem('minimart-pos-user')
      }
    }
    setIsLoading(false)
  }, [])

  const googleLogin = async (idToken: string) => {
    const userData = await api.googleLogin(idToken)
    setUser(userData)
    localStorage.setItem('minimart-pos-user', JSON.stringify(userData))
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem('minimart-pos-user')
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
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
