import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function AppHeader() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const linkClass = (path: string) =>
    `whitespace-nowrap px-3 py-2 rounded-lg text-sm font-medium ${location.pathname === path ? 'bg-primary text-white' : 'bg-white text-gray-700 border border-slate-200'}`

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
      <div className="max-w-7xl mx-auto flex items-center gap-3">
        <div className="mr-auto shrink-0">
          <p className="font-bold">HXU Liquor POS</p>
          <p className="text-xs text-gray-500">{user?.name} · {user?.role === 'admin' ? 'Admin' : 'Employee'}</p>
        </div>
        <nav className="flex min-w-0 items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <Link className={linkClass('/pos')} to="/pos">Scan / Sale</Link>
          {user?.role === 'admin' && <Link className={linkClass('/admin/products')} to="/admin/products">Products</Link>}
          {user?.role === 'admin' && <Link className={linkClass('/admin/employees')} to="/admin/employees">Employees</Link>}
          {user?.role === 'admin' && <Link className={linkClass('/admin/dashboard')} to="/admin/dashboard">Income</Link>}
          <button onClick={logout} className="whitespace-nowrap px-3 py-2 text-sm text-red-700">Logout</button>
        </nav>
      </div>
    </header>
  )
}
