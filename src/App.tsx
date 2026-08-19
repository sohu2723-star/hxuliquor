import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
const Login = lazy(() => import('./pages/Login'))
const POS = lazy(() => import('./pages/POS'))
const AdminProducts = lazy(() => import('./pages/AdminProducts'))
const AdminEmployees = lazy(() => import('./pages/AdminEmployees'))
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))
const AdminCredits = lazy(() => import('./pages/AdminCredits'))
const AdminSalesHistory = lazy(() => import('./pages/AdminSalesHistory'))
const AdminWarnings = lazy(() => import('./pages/AdminWarnings'))
const AdminFinance = lazy(() => import('./pages/AdminFinance'))
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
