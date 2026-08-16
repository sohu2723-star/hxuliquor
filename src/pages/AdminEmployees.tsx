import { useEffect, useState } from 'react'
import AppHeader from '../components/AppHeader'
import { api, type User } from '../lib/api'

export default function AdminEmployees() {
  const [employees, setEmployees] = useState<User[]>([])
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const load = async () => {
    setIsLoading(true)
    try {
      setEmployees(await api.getEmployees())
    } catch (error) {
      setMessage(getErrorMessage(error, 'Employee data ဆွဲမရပါ။'))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const add = async (event: React.FormEvent) => {
    event.preventDefault()
    const cleanName = name.trim()
    const cleanEmail = email.trim().toLowerCase()
    if (!cleanName || !cleanEmail) {
      setMessage('Employee name နှင့် Google email လိုအပ်ပါသည်။')
      return
    }
    setIsSaving(true)
    setMessage('')
    try {
      await api.addEmployee({ name: cleanName, email: cleanEmail })
      setName('')
      setEmail('')
      await load()
      setMessage('Employee account ထည့်ပြီးပါပြီ။ သူ့ Google email ဖြင့် login ဝင်နိုင်ပါပြီ။')
    } catch (error) {
      setMessage(getErrorMessage(error, 'Employee add မအောင်မြင်ပါ။'))
    } finally {
      setIsSaving(false)
    }
  }

  const remove = async (id: string) => {
    try {
      setMessage('Removing...')
      await api.deleteEmployee(id)
      await load()
      setMessage('Employee ဖယ်ရှားပြီးပါပြီ။')
    } catch (error) {
      setMessage(getErrorMessage(error, 'Employee remove မအောင်မြင်ပါ။'))
    }
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <AppHeader />
      <main className="max-w-3xl mx-auto p-4 lg:p-6">
        <div className="flex items-center justify-between gap-3 mb-1">
          <h1 className="text-2xl font-bold">Employee Accounts</h1>
          <button onClick={() => void load()} disabled={isLoading} className="border rounded px-3 py-2 disabled:opacity-50">{isLoading ? 'Loading...' : 'Refresh'}</button>
        </div>
        <p className="text-gray-600 mt-1 mb-5">ဝန်ထမ်း၏ Google email ကို အရင်ထည့်ပါ။ Employee သည် အဲဒီ account ဖြင့် login ဝင်ပြီး Scan / Sale သာလုပ်နိုင်မည်။</p>
        {message && <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">{message}</div>}
        <form onSubmit={add} className="bg-white shadow rounded-lg p-4 grid sm:grid-cols-3 gap-3 mb-5">
          <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Employee name" className="border rounded px-3 py-2" />
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Google email" className="border rounded px-3 py-2" />
          <button disabled={isSaving} className="bg-primary text-white rounded px-4 py-2 disabled:opacity-50">{isSaving ? 'Saving...' : 'Add Employee'}</button>
        </form>
        <div className="bg-white shadow rounded-lg divide-y">
          {isLoading ? <p className="p-4 text-gray-500">Loading employees...</p> : employees.length === 0 ? <p className="p-4 text-gray-500">Employee မရှိသေးပါ။</p> : employees.map((employee) => (
            <div key={employee.id} className="p-4 flex items-center gap-3">
              <div className="flex-1"><p className="font-medium">{employee.name || 'Unnamed employee'}</p><p className="text-sm text-gray-500">{employee.email} · {employee.role}</p></div>
              {employee.role !== 'admin' && <button onClick={() => void remove(employee.id)} className="text-red-700 px-3 py-2">Remove</button>}
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
