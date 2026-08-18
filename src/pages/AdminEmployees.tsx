import { useCallback, useEffect, useState } from 'react'
import AppHeader from '../components/AppHeader'
import ConfirmDialog from '../components/ConfirmDialog'
import { api, type User } from '../lib/api'
import { useToast } from '../contexts/ToastContext'
import { useActionLoading } from '../contexts/ActionLoadingContext'
import { useLanguage } from '../contexts/LanguageContext'

const EMPLOYEE_FORM_DRAFT_KEY = 'hxu-employee-form-draft'

export default function AdminEmployees() {
  const [employees, setEmployees] = useState<User[]>([])
  const [name, setName] = useState(() => {
    try { return String(JSON.parse(localStorage.getItem(EMPLOYEE_FORM_DRAFT_KEY) || 'null')?.name || '') } catch { return '' }
  })
  const [email, setEmail] = useState(() => {
    try { return String(JSON.parse(localStorage.getItem(EMPLOYEE_FORM_DRAFT_KEY) || 'null')?.email || '') } catch { return '' }
  })
  const [isSaving, setIsSaving] = useState(false)
  const [removeEmployee, setRemoveEmployee] = useState<User | null>(null)

  const { showToast } = useToast()
  const { runWithLoading } = useActionLoading()
  const { t } = useLanguage()

  useEffect(() => {
    try { localStorage.setItem(EMPLOYEE_FORM_DRAFT_KEY, JSON.stringify({ name, email })) } catch { /* storage unavailable */ }
  }, [name, email])

  const load = useCallback((force = false) => api.getEmployees(force).then((fresh) => setEmployees((current) => JSON.stringify(current) === JSON.stringify(fresh) ? current : fresh)).catch((e: unknown) => { if (!force) showToast(e instanceof Error ? e.message : t('employeeLoadError'), 'error') }), [showToast, t])

  useEffect(() => {
    void load()
    const initialRefresh = window.setTimeout(() => void load(true), 100)
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(true) }, 60000)
    return () => { window.clearTimeout(initialRefresh); window.clearInterval(timer) }
  }, [load])

  const add = async (event: React.FormEvent) => {
    event.preventDefault()
    setIsSaving(true)
    try {
      const added = await runWithLoading(() => api.addEmployee({ name, email }))
      setEmployees((current) => [...current.filter((item) => item.id !== added.id), added])
      setName('')
      setEmail('')
      try { localStorage.removeItem(EMPLOYEE_FORM_DRAFT_KEY) } catch { /* storage unavailable */ }
      showToast(t('employeeAdded'), 'success')
      void load(true)
    } catch (error) { showToast(error instanceof Error ? error.message : t('employeeAddError'), 'error') }
    finally { setIsSaving(false) }
  }

  const confirmRemove = () => {
    if (!removeEmployee) return
    const employee = removeEmployee
    setRemoveEmployee(null)
    const previous = employees
    setEmployees((current) => current.filter((item) => item.id !== employee.id))
    void runWithLoading(async () => {
      try {
        await api.deleteEmployee(employee.id)
        showToast(t('employeeRemoved'), 'success')
        await load(true)
      } catch (error) {
        setEmployees(previous)
        showToast(error instanceof Error ? error.message : t('employeeRemoveError'), 'error')
      }
    })
  }

  return <div className="min-h-screen bg-gray-100"><AppHeader /><main className="max-w-3xl mx-auto p-4 lg:p-6">
    <h1 className="text-2xl font-bold">{t('employeeAccounts')}</h1>
    <form onSubmit={add} className="bg-white shadow rounded-lg p-4 grid sm:grid-cols-3 gap-3 mb-5">
      <input required value={name} onChange={(e) => setName(e.target.value)} placeholder={t('employeeName')} className="border rounded px-3 py-2" />
      <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('googleEmail')} className="border rounded px-3 py-2" />
      <button disabled={isSaving} className="bg-primary text-white rounded px-4 py-2 disabled:opacity-50">{isSaving ? t('saving') : t('addEmployee')}</button>
    </form>
    <div className="bg-white shadow rounded-lg divide-y">{employees.map((employee) => <div key={employee.id} className="p-4 flex items-center gap-3">
      <div className="flex-1"><p className="font-medium">{employee.name}</p><p className="text-sm text-gray-500">{employee.email} · {employee.role}</p></div>
      {employee.role !== 'admin' && <button onClick={() => setRemoveEmployee(employee)} className="text-red-700 px-3 py-2">{t('remove')}</button>}
    </div>)}</div>
  </main>
  {removeEmployee && <ConfirmDialog title={t('removeEmployee')} message={`${removeEmployee.name} (${removeEmployee.email}) ${t('removeEmployeeQuestion')}`} confirmLabel={t('remove')} onCancel={() => setRemoveEmployee(null)} onConfirm={confirmRemove} />}
  </div>
}
