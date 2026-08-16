import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import Icon from './Icon'

export default function AppHeader() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const [language, setLanguage] = useState(() => localStorage.getItem('hxu-language') || 'my')
  useEffect(() => {
    localStorage.setItem('hxu-language', language)
    document.documentElement.lang = language === 'my' ? 'my' : 'en'
  }, [language])

  const labels = language === 'my' ? { sale: 'အရောင်း', products: 'ပစ္စည်းများ', employees: 'ဝန်ထမ်း', income: 'ဝင်ငွေ', logout: 'ထွက်မည်', roleAdmin: 'Admin', roleEmployee: 'Employee' } : { sale: 'Scan / Sale', products: 'Products', employees: 'Employees', income: 'Income', logout: 'Logout', roleAdmin: 'Admin', roleEmployee: 'Employee' }

  const linkClass = (path: string) =>
    `inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-semibold shadow-sm ${location.pathname === path ? 'bg-primary text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'}`

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center">
        <div className="shrink-0">
          <p className="text-lg font-extrabold tracking-tight text-slate-950">HXU Liquor POS</p>
          <p className="text-xs font-medium text-slate-500">{user?.name} · {user?.role === 'admin' ? labels.roleAdmin : labels.roleEmployee}</p>
        </div>
        <nav className="flex min-w-0 items-center gap-2 overflow-x-auto pb-1 sm:ml-auto sm:pb-0">
          <Link className={linkClass('/pos')} to="/pos"><Icon name="scan" className="h-4 w-4" />{labels.sale}</Link>
          {user?.role === 'admin' && <Link className={linkClass('/admin/products')} to="/admin/products"><Icon name="products" className="h-4 w-4" />{labels.products}</Link>}
          {user?.role === 'admin' && <Link className={linkClass('/admin/employees')} to="/admin/employees"><Icon name="users" className="h-4 w-4" />{labels.employees}</Link>}
          {user?.role === 'admin' && <Link className={linkClass('/admin/dashboard')} to="/admin/dashboard"><Icon name="chart" className="h-4 w-4" />{labels.income}</Link>}
          <button onClick={() => setLanguage(language === 'my' ? 'en' : 'my')} className="whitespace-nowrap rounded-xl bg-amber-50 px-3.5 py-2 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">{language === 'my' ? 'EN' : 'မြန်မာ'}</button>
          <button onClick={logout} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"><Icon name="logout" className="h-4 w-4" />{labels.logout}</button>
        </nav>
      </div>
    </header>
  )
}
