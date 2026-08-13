import { useEffect, useState } from 'react'
import AppHeader from '../components/AppHeader'
import { api, type User } from '../lib/api'

export default function AdminEmployees() {
  const [employees, setEmployees] = useState<User[]>([])
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const load = () => api.getEmployees().then(setEmployees).catch((e) => setMessage(e.message))
  useEffect(() => { void load() }, [])

  const add = async (event: React.FormEvent) => {
    event.preventDefault()
    setIsSaving(true)
    setMessage('')
    try {
      await api.addEmployee({ name, email })
      setName(''); setEmail(''); setMessage('Employee account ထည့်ပြီးပါပြီ။ သူ့ Google email ဖြင့် login ဝင်နိုင်ပါပြီ။'); load()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Failed') }
    finally { setIsSaving(false) }
  }

  return <div className="min-h-screen bg-gray-100"><AppHeader /><main className="max-w-3xl mx-auto p-4 lg:p-6">
    <h1 className="text-2xl font-bold">Employee Accounts</h1>
    <p className="text-gray-600 mt-1 mb-5">ဝန်ထမ်း၏ Google email ကို အရင်ထည့်ပါ။ Employee သည် အဲဒီ account ဖြင့် login ဝင်ပြီး Scan / Sale သာလုပ်နိုင်မည်။</p>
    {message && <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">{message}</div>}
    <form onSubmit={add} className="bg-white shadow rounded-lg p-4 grid sm:grid-cols-3 gap-3 mb-5">
      <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Employee name" className="border rounded px-3 py-2" />
      <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Google email" className="border rounded px-3 py-2" />
      <button disabled={isSaving} className="bg-primary text-white rounded px-4 py-2 disabled:opacity-50">{isSaving ? 'Saving...' : 'Add Employee'}</button>
    </form>
    <div className="bg-white shadow rounded-lg divide-y">{employees.map((employee) => <div key={employee.id} className="p-4 flex items-center gap-3">
      <div className="flex-1"><p className="font-medium">{employee.name}</p><p className="text-sm text-gray-500">{employee.email} · {employee.role}</p></div>
      {employee.role !== 'admin' && <button onClick={async () => { await api.deleteEmployee(employee.id); load() }} className="text-red-700 px-3 py-2">Remove</button>}
    </div>)}</div>
  </main></div>
}
