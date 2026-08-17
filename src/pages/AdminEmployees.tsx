import { useCallback, useEffect, useState } from 'react'
import AppHeader from '../components/AppHeader'
import AppToast, { type ToastMessage } from '../components/AppToast'
import ConfirmDialog from '../components/ConfirmDialog'
import { api, type User } from '../lib/api'
import { notify } from '../lib/notify'

export default function AdminEmployees() {
  const [employees, setEmployees] = useState<User[]>([])
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [removeEmployee, setRemoveEmployee] = useState<User | null>(null)

  const showToast = useCallback((message: string, type: ToastMessage['type']) => notify(setToast, message, type), [])
  const load = useCallback((force = false) => api.getEmployees(force).then((fresh) => setEmployees((current) => JSON.stringify(current) === JSON.stringify(fresh) ? current : fresh)).catch((e: unknown) => { if (!force) showToast(e instanceof Error ? e.message : 'Employee data ဆွဲမရပါ။', 'error') }), [showToast])

  useEffect(() => {
    void load()
    const initialRefresh = window.setTimeout(() => void load(true), 100)
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(true) }, 5000)
    return () => { window.clearTimeout(initialRefresh); window.clearInterval(timer) }
  }, [load])

  const add = async (event: React.FormEvent) => {
    event.preventDefault()
    setIsSaving(true)
    try {
      const added = await api.addEmployee({ name, email })
      setEmployees((current) => [...current.filter((item) => item.id !== added.id), added])
      setName('')
      setEmail('')
      showToast('Employee account ထည့်ပြီးပါပြီ။', 'success')
      void load(true)
    } catch (error) { showToast(error instanceof Error ? error.message : 'Employee add failed', 'error') }
    finally { setIsSaving(false) }
  }

  const confirmRemove = () => {
    if (!removeEmployee) return
    const employee = removeEmployee
    setRemoveEmployee(null)
    const previous = employees
    setEmployees((current) => current.filter((item) => item.id !== employee.id))
    showToast('Employee remove ကို နောက်ကွယ်မှာ လုပ်နေပါသည်…', 'info')
    void api.deleteEmployee(employee.id)
      .then(() => { showToast('Employee ဖယ်ရှားပြီးပါပြီ။', 'success'); void load(true) })
      .catch((error) => { setEmployees(previous); showToast(error instanceof Error ? error.message : 'Remove failed', 'error') })
  }

  return <div className="min-h-screen bg-gray-100"><AppHeader /><AppToast toast={toast} /><main className="max-w-3xl mx-auto p-4 lg:p-6">
    <h1 className="text-2xl font-bold">Employee Accounts</h1>
    <p className="text-gray-600 mt-1 mb-5">ဝန်ထမ်း၏ Google email ကို အရင်ထည့်ပါ။ Employee သည် အဲဒီ account ဖြင့် login ဝင်ပြီး Scan / Sale သာလုပ်နိုင်မည်။</p>
    <form onSubmit={add} className="bg-white shadow rounded-lg p-4 grid sm:grid-cols-3 gap-3 mb-5">
      <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Employee name" className="border rounded px-3 py-2" />
      <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Google email" className="border rounded px-3 py-2" />
      <button disabled={isSaving} className="bg-primary text-white rounded px-4 py-2 disabled:opacity-50">{isSaving ? 'Saving...' : 'Add Employee'}</button>
    </form>
    <div className="bg-white shadow rounded-lg divide-y">{employees.map((employee) => <div key={employee.id} className="p-4 flex items-center gap-3">
      <div className="flex-1"><p className="font-medium">{employee.name}</p><p className="text-sm text-gray-500">{employee.email} · {employee.role}</p></div>
      {employee.role !== 'admin' && <button onClick={() => setRemoveEmployee(employee)} className="text-red-700 px-3 py-2">Remove</button>}
    </div>)}</div>
  </main>
  {removeEmployee && <ConfirmDialog title="Remove employee?" message={`${removeEmployee.name} (${removeEmployee.email}) ကို ဖယ်ရှားရန် သေချာပါသလား။`} confirmLabel="Remove" onCancel={() => setRemoveEmployee(null)} onConfirm={confirmRemove} />}
  </div>
}
