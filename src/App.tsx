import { lazy, Suspense, type ComponentType } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import AdminCredits from './pages/AdminCredits'
import AdminFinance from './pages/AdminFinance'
import AdminDashboard from './pages/AdminDashboard'
const CHUNK_RECOVERY_KEY = 'hxu-chunk-recovery-at'

type LazyPageModule = { default: ComponentType<Record<string, never>> }

function isChunkLoadError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /dynamically imported module|importing a module script failed|loading chunk|chunkloaderror/i.test(message)
}

async function clearAppCaches() {
  try {
    if ('caches' in window) {
      const cacheNames = await caches.keys()
      await Promise.all(cacheNames.map((name) => caches.delete(name)))
    }
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map((registration) => registration.unregister()))
    }
  } catch {
    // A normal reload below is still useful when cache APIs are unavailable.
  }
}

function lazyPage(loader: () => Promise<LazyPageModule>) {
  return lazy(async () => {
    try {
      const page = await loader()
      sessionStorage.removeItem(CHUNK_RECOVERY_KEY)
      return page
    } catch (error) {
      if (!isChunkLoadError(error)) throw error
      const now = Date.now()
      const previous = Number(sessionStorage.getItem(CHUNK_RECOVERY_KEY) || 0)
      if (!previous || now - previous > 30000) {
        sessionStorage.setItem(CHUNK_RECOVERY_KEY, String(now))
        await clearAppCaches()
        window.location.replace(`${window.location.pathname}?app-refresh=${now}${window.location.hash}`)
        return new Promise<never>(() => {})
      }
      sessionStorage.removeItem(CHUNK_RECOVERY_KEY)
      throw error
    }
  })
}

const Login = lazyPage(() => import('./pages/Login'))
const POS = lazyPage(() => import('./pages/POS'))
const AdminProducts = lazyPage(() => import('./pages/AdminProducts'))
const AdminEmployees = lazyPage(() => import('./pages/AdminEmployees'))
const AdminSalesHistory = lazyPage(() => import('./pages/AdminSalesHistory'))
const AdminWarnings = lazyPage(() => import('./pages/AdminWarnings'))
import LoadingSpinner from './components/LoadingSpinner'
import { ToastProvider } from './contexts/ToastContext'

function ProtectedRoute({ children, adminOnly = false }: { children: React.JSX.Element; adminOnly?: boolean }) {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (adminOnly && user.role !== 'admin') {
    return <Navigate to="/pos" replace />
  }

  return children
}

function App() {
  return (
    <ToastProvider>
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><LoadingSpinner /></div>}>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/admin/dashboard"
        element={<ProtectedRoute adminOnly><AdminDashboard /></ProtectedRoute>}
      />
      <Route
        path="/admin/employees"
        element={<ProtectedRoute adminOnly><AdminEmployees /></ProtectedRoute>}
      />
      <Route
        path="/admin/credits"
        element={<ProtectedRoute adminOnly><AdminCredits /></ProtectedRoute>}
      />
      <Route
        path="/admin/sales-history"
        element={<ProtectedRoute adminOnly><AdminSalesHistory /></ProtectedRoute>}
      />
      <Route
        path="/admin/warnings"
        element={<ProtectedRoute adminOnly><AdminWarnings /></ProtectedRoute>}
      />
      <Route
        path="/admin/finance"
        element={<ProtectedRoute adminOnly><AdminFinance /></ProtectedRoute>}
      />
      <Route
        path="/pos"
        element={
          <ProtectedRoute>
            <POS />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/products"
        element={
          <ProtectedRoute adminOnly>
            <AdminProducts />
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<Navigate to="/pos" replace />} />
    </Routes>
    </Suspense>
    </ToastProvider>
  )
}

export default App
