import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function AppHeader() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const linkClass = (path: string) =>
    `px-3 py-2 rounded-md text-sm font-medium ${location.pathname === path ? 'bg-primary text-white' : 'bg-white text-gray-700 border'}`

  return (
    <header className="sticky top-0 z-30 bg-white border-b shadow-sm px-4 py-3">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <p className="font-bold">HXU Liquor POS</p>
          <p className="text-xs text-gray-500">{user?.name} · {user?.role === 'admin' ? 'Admin' : 'Employee'}</p>
        </div>
        <Link className={linkClass('/pos')} to="/pos">Scan / Sale</Link>
        {user?.role === 'admin' && <Link className={linkClass('/admin/products')} to="/admin/products">Products</Link>}
        {user?.role === 'admin' && <Link className={linkClass('/admin/employees')} to="/admin/employees">Employees</Link>}
        {user?.role === 'admin' && <Link className={linkClass('/admin/dashboard')} to="/admin/dashboard">Income</Link>}
        <button onClick={logout} className="px-3 py-2 text-sm text-red-700">Logout</button>
      </div>
    </header>
  )
}
