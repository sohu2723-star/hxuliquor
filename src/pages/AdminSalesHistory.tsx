import { useCallback, useEffect, useState } from 'react'
import AppHeader from '../components/AppHeader'
import { api, type Sale } from '../lib/api'
import { formatCurrency } from '../lib/format'

const MYANMAR_TIME_ZONE = 'Asia/Yangon'

function currentMyanmarMonth() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: MYANMAR_TIME_ZONE, year: 'numeric', month: '2-digit' }).formatToParts(new Date())
  return `${parts.find((part) => part.type === 'year')?.value}-${parts.find((part) => part.type === 'month')?.value}`
}

function monthRange(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  return { start: `${month}-01`, end: `${month}-${String(lastDay).padStart(2, '0')}` }
}

export default function AdminSalesHistory() {
  const [selectedMonth, setSelectedMonth] = useState(currentMyanmarMonth)
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    setError('')
    try {
      const { start, end } = monthRange(selectedMonth)
      const result = await api.getSalesStaleFirst(start, end, (fresh) => setSales(fresh))
      setSales(result.sales)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ရောင်းချမှု history ဆွဲမရပါ။')
    } finally {
      setLoading(false)
    }
  }, [selectedMonth])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load(true)
    }, 60000)
    return () => window.clearInterval(timer)
  }, [load])

  const total = sales.reduce((sum, sale) => sum + sale.totalAmount, 0)
  const paid = sales.reduce((sum, sale) => sum + sale.paidAmount, 0)
  const credit = sales.reduce((sum, sale) => sum + sale.balanceDue, 0)

  return <div className="min-h-screen bg-slate-50">
    <AppHeader />
    <main className="mx-auto max-w-5xl p-4 lg:p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><h1 className="text-2xl font-bold text-slate-950">ရောင်းချမှု History</h1><p className="mt-1 text-sm text-slate-500">Income page မှ ခွဲထားသော လအလိုက် ဘောင်ချာနှင့် product ရောင်းချမှုမှတ်တမ်း။</p></div>
        <label className="text-sm font-semibold text-slate-700">လရွေးရန်<input type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} className="mt-1 block rounded-xl border border-slate-300 bg-white px-3 py-2" /></label>
      </div>
      {error && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <section className="surface-card p-5"><p className="text-sm text-slate-500">ဘောင်ချာ</p><p className="mt-2 text-2xl font-bold">{sales.length}</p></section>
        <section className="surface-card p-5"><p className="text-sm text-slate-500">စုစုပေါင်းရောင်းရငွေ</p><p className="mt-2 text-2xl font-bold text-primary">{formatCurrency(total)}</p></section>
        <section className="surface-card p-5"><p className="text-sm text-slate-500">ရပြီး / အကြွေးကျန်</p><p className="mt-2 text-lg font-bold text-emerald-700">{formatCurrency(paid)} <span className="text-amber-700">/ {formatCurrency(credit)}</span></p></section>
      </div>
      {loading ? <div className="surface-card p-8 text-center text-slate-500">History ဆွဲနေပါသည်…</div> : <section className="surface-card p-5">
        <div className="divide-y">{sales.length ? sales.map((sale) => <details key={sale.id} className="py-4 first:pt-0 last:pb-0">
          <summary className="flex cursor-pointer list-none flex-wrap justify-between gap-3"><span><b>{new Date(sale.createdAt).toLocaleString('en-GB', { timeZone: MYANMAR_TIME_ZONE })}</b><small className="mt-1 block text-slate-500">{sale.cashierName} · {sale.cashierEmail}{sale.customerName ? ` · Customer: ${sale.customerName}` : ''}</small></span><span className="text-right"><b>{formatCurrency(sale.totalAmount)}</b><small className={`mt-1 block ${sale.balanceDue ? 'text-amber-700' : 'text-emerald-700'}`}>{sale.balanceDue ? `အကြွေးကျန် ${formatCurrency(sale.balanceDue)}` : 'ငွေရပြီး'}</small></span></summary>
          <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">{sale.items.map((item) => <div key={item.id} className="flex justify-between gap-3 border-b border-slate-200 py-2 last:border-0"><span>{item.productName} · {item.saleUnit === 'pack' ? 'ပါကင်' : 'တစ်ခု'} × {item.saleQuantity}</span><span className="shrink-0 font-semibold">{formatCurrency(item.subtotal)}</span></div>)}</div>
        </details>) : <p className="py-6 text-center text-slate-500">ဒီလအတွက် ရောင်းချမှု မရှိသေးပါ။</p>}</div>
      </section>}
    </main>
  </div>
}
