import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from '../contexts/LanguageContext'
import Icon from './Icon'

export default function AppHeader() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const { language, setLanguage, t } = useLanguage()
  const [profileOpen, setProfileOpen] = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)
  const userAgent = useMemo(() => navigator.userAgent, [])

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!profileRef.current?.contains(event.target as Node)) setProfileOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const roleLabel = user?.role === 'admin' ? t('admin') : t('employee')
  const initials = (user?.name || user?.email || 'U').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()

  const linkClass = (path: string) =>
    `inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-semibold shadow-sm ${location.pathname === path ? 'bg-primary text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'}`

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-3">
        <nav className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <Link className={linkClass('/pos')} to="/pos"><Icon name="scan" className="h-4 w-4" />{t('sale')}</Link>
          {user?.role === 'admin' && <Link className={linkClass('/admin/products')} to="/admin/products"><Icon name="products" className="h-4 w-4" />{t('products')}</Link>}
          {user?.role === 'admin' && <Link className={linkClass('/admin/employees')} to="/admin/employees"><Icon name="users" className="h-4 w-4" />{t('employees')}</Link>}
          {user?.role === 'admin' && <Link className={linkClass('/admin/dashboard')} to="/admin/dashboard"><Icon name="chart" className="h-4 w-4" />{t('income')}</Link>}
          {user?.role === 'admin' && <Link className={linkClass('/admin/credits')} to="/admin/credits"><Icon name="box" className="h-4 w-4" />{t('credits')}</Link>}
          {user?.role === 'admin' && <Link className={linkClass('/admin/sales-history')} to="/admin/sales-history"><Icon name="chart" className="h-4 w-4" />{t('history')}</Link>}
          {user?.role === 'admin' && <Link className={linkClass('/admin/warnings')} to="/admin/warnings"><Icon name="warning" className="h-4 w-4" />{t('warnings')}</Link>}
        </nav>
        <button onClick={() => setLanguage(language === 'my' ? 'en' : 'my')} className="whitespace-nowrap rounded-xl bg-amber-50 px-3.5 py-2 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">{language === 'my' ? 'EN' : 'မြန်မာ'}</button>
        <div ref={profileRef} className="relative shrink-0">
          <button type="button" onClick={() => setProfileOpen((open) => !open)} className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-primary to-amber-500 text-sm font-extrabold text-white shadow-md ring-2 ring-white" aria-label={t('profile')}>{initials}</button>
          {profileOpen && <div className="absolute right-0 mt-3 w-80 rounded-3xl bg-white p-4 shadow-2xl ring-1 ring-slate-200">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-3"><div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary"><Icon name="user" /></div><div className="min-w-0"><p className="truncate font-bold text-slate-950">{user?.name}</p><p className="text-xs font-semibold text-primary">{roleLabel}</p></div></div>
            <div className="mt-3 space-y-3 text-sm text-slate-600">
              <p className="flex gap-2"><Icon name="mail" className="mt-0.5 h-4 w-4 shrink-0" /><span className="break-all">{user?.email}</span></p>
              <p className="flex gap-2"><Icon name="shield" className="mt-0.5 h-4 w-4 shrink-0" /><span>{roleLabel}</span></p>
              <p className="flex gap-2"><Icon name="monitor" className="mt-0.5 h-4 w-4 shrink-0" /><span className="line-clamp-3">{t('agent')}: {userAgent}</span></p>
            </div>
            <button onClick={logout} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-50 px-3.5 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"><Icon name="logout" className="h-4 w-4" />{t('logout')}</button>
          </div>}
        </div>
      </div>
    </header>
  )
}
