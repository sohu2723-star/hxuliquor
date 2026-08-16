import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AppHeader from '../components/AppHeader'
import { api, type Product, type Sale } from '../lib/api'
import { formatCurrency } from '../lib/format'
import AppToast, { type ToastMessage } from '../components/AppToast'

const MYANMAR_TIME_ZONE = 'Asia/Yangon'

function myanmarDate(date: Date | string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: MYANMAR_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(date))
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || ''
  return `${value('year')}-${value('month')}-${value('day')}`
}

function currentMyanmarMonth() {
  return myanmarDate(new Date()).slice(0, 7)
}

function monthRange(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  return { start: `${month}-01`, end: `${month}-${String(lastDay).padStart(2, '0')}` }
}

export default function AdminDashboard() {
  const [sales, setSales] = useState<Sale[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [selectedMonth, setSelectedMonth] = useState(currentMyanmarMonth)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const [confirmCredit, setConfirmCredit] = useState<Sale | null>(null)
  const loadingRef = useRef(false)

  const showToast = useCallback((message: string, type: ToastMessage['type']) => {
    setToast({ message, type })
    window.setTimeout(() => setToast(null), 4000)
  }, [])

  const loadDashboard = useCallback(async (quiet = false) => {
    if (loadingRef.current || document.visibilityState === 'hidden') return
    loadingRef.current = true
    const { start, end } = monthRange(selectedMonth)
    if (!quiet) setLoading(true)
    setError('')
    try {
      const [saleData, productData] = await Promise.all([api.getSales(start, end, quiet), api.getProducts(quiet)])
      setSales(saleData); setProducts(productData)
    } catch (error) { setError(error instanceof Error ? error.message : 'Data ဆွဲမရပါ။') }
    finally { setLoading(false); loadingRef.current = false }
  }, [selectedMonth])

  useEffect(() => {
    void loadDashboard()
    const initialRefresh = window.setTimeout(() => void loadDashboard(true), 100)
    const timer = window.setInterval(() => void loadDashboard(true), 30000)
    return () => { window.clearTimeout(initialRefresh); window.clearInterval(timer) }
  }, [loadDashboard])

  const report = useMemo(() => {
    const today = myanmarDate(new Date())
    const costs = new Map(products.map((product) => [product.id, product.costPrice]))
    const summarize = (entries: Sale[]) => ({
      revenue: entries.reduce((sum, sale) => sum + sale.paidAmount, 0),
      profit: entries.filter((sale) => sale.paidAmount > 0).flatMap((sale) => sale.items).reduce((sum, item) => {
        const unitCost = item.unitCost || costs.get(item.productId) || 0
        return sum + (item.profit || ((item.unitPrice - unitCost) * item.quantity))
      }, 0),
      count: entries.length,
      units: entries.flatMap((sale) => sale.items).reduce((sum, item) => sum + item.quantity, 0),
    })
    return {
      today: summarize(sales.filter((sale) => sale.isCredit ? Boolean(sale.settledAt) && myanmarDate(sale.settledAt) === today : myanmarDate(sale.createdAt) === today)),
      month: summarize(sales),
    }
  }, [products, sales])

  const lowStock = products.filter((product) => product.stockQty <= product.lowStockThreshold)
  const unpaidCredits = sales.filter((sale) => sale.balanceDue > 0)
  const dailyIncome = useMemo(() => {
    const totals = new Map<string, number>()
    sales.forEach((sale) => {
      if (!sale.paidAmount) return
      const date = myanmarDate(sale.isCredit ? sale.settledAt : sale.createdAt)
      totals.set(date, (totals.get(date) || 0) + sale.paidAmount)
    })
    const max = Math.max(...totals.values(), 1)
    return [...totals.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, amount]) => ({ date, amount, percent: amount / max * 100 }))
  }, [sales])

  const markCreditPaid = useCallback((sale: Sale) => {
    const settledAt = new Date().toISOString()
    setConfirmCredit(null)
    setSales((current) => current.map((item) => item.id === sale.id ? {
      ...item,
      paidAmount: item.totalAmount,
      balanceDue: 0,
      settledAt,
    } : item))
    showToast('အကြွေးဆပ်ပြီးပါပြီ။ Daily / Monthly income ထဲ ထည့်တွက်ပြီးပါပြီ။', 'success')
    void api.payCredit(sale.id)
      .then((updated) => setSales((current) => current.map((item) => item.id === updated.id ? updated : item)))
      .then(() => loadDashboard(true))
      .catch((error) => {
        showToast(error instanceof Error ? error.message : 'အကြွေးပေးချေမှု မအောင်မြင်ပါ။', 'error')
        void loadDashboard(true)
      })
  }, [loadDashboard, showToast])

  const Card = ({ title, data }: { title: string; data: { revenue: number; profit: number; count: number; units: number } }) => (
    <section className="surface-card p-5">
      <h2 className="font-bold text-lg">{title}</h2>
      <p className="mt-3 text-sm text-gray-500">ရောင်းရငွေ</p>
      <p className="text-2xl font-bold text-primary">{formatCurrency(data.revenue)}</p>
      <div className="mt-3 grid grid-cols-3 gap-2 border-t pt-3 text-sm">
        <p>အမြတ်<br /><b className="text-green-700">{formatCurrency(data.profit)}</b></p>
        <p>ဘောင်ချာ<br /><b>{data.count}</b></p>
        <p>ရောင်းပြီး<br /><b>{data.units} ခု</b></p>
      </div>
    </section>
  )

  return <div className="min-h-screen bg-slate-50">
    <AppHeader />
    <AppToast toast={toast} />
    <main className="max-w-5xl mx-auto p-4 lg:p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><h1 className="text-2xl font-bold">Income & Stock Dashboard</h1><p className="text-sm text-slate-500">Daily စာရင်းကို မြန်မာစံတော်ချိန် (UTC+6:30) ဖြင့်တွက်ထားပါသည်။</p></div>
        <label className="text-sm font-medium">လစဉ်စာရင်းရွေးရန်
          <input type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2" />
        </label>
      </div>
      {error && <p className="bg-red-50 text-red-700 p-3 mb-4 rounded-lg">{error}</p>}
      {loading ? <div className="surface-card p-8 text-center text-slate-500">စာရင်းတွက်နေပါသည်…</div> : <div className="grid md:grid-cols-2 gap-4">
        <Card title="ယနေ့ Daily (မြန်မာစံတော်ချိန်)" data={report.today} />
        <Card title={`${selectedMonth} Monthly`} data={report.month} />
      </div>}
      <section className="mt-5 surface-card p-5"><h2 className="font-bold text-lg text-red-700">ကုန်တော့မည့်ပစ္စည်း Warning ({lowStock.length})</h2><div className="mt-3 divide-y">{lowStock.length ? lowStock.map((product) => <div key={product.id} className="py-2 flex justify-between"><span>{product.name} <small className="text-slate-500">({product.saleType === 'pack' ? 'ပါကင် Product' : 'တစ်ခုချင်း Product'})</small></span><b className="text-red-600">Stock {product.stockQty} {product.saleType === 'pack' ? 'ပါကင်' : 'ခု/ဘူး'}</b></div>) : <p className="text-green-700">Stock အားလုံးလုံလောက်ပါသည်</p>}</div></section>
      <section className="mt-5 surface-card p-5"><h2 className="text-lg font-bold">Daily Income Chart</h2><div className="mt-4 flex h-44 items-end gap-1 overflow-x-auto border-b pb-1">{dailyIncome.map((day) => <div key={day.date} className="group flex min-w-8 flex-1 flex-col items-center justify-end"><span className="mb-1 hidden text-[10px] group-hover:block">{formatCurrency(day.amount)}</span><div className="w-full rounded-t bg-primary" style={{ height: `${Math.max(day.percent, 3)}%` }} /><span className="mt-1 text-[9px] text-slate-500">{day.date.slice(8)}</span></div>)}</div></section>
      <section className="mt-5 surface-card p-5"><h2 className="text-lg font-bold text-amber-700">အကြွေးစာရင်း ({unpaidCredits.length})</h2><div className="mt-3 divide-y">{unpaidCredits.length ? unpaidCredits.map((sale) => <div key={sale.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center"><div className="flex-1"><b>{sale.customerName}</b><p className="text-xs text-slate-500">{myanmarDate(sale.createdAt)} · {sale.cashierName} ({sale.cashierEmail})</p></div><b className="text-amber-700">{formatCurrency(sale.balanceDue)}</b><button onClick={() => setConfirmCredit(sale)} className="rounded-lg bg-green-700 px-3 py-2 text-sm font-medium text-white">အကြွေးဆပ်ပြီး</button></div>) : <p className="py-3 text-green-700">ပေးရန်ကျန်သည့်အကြွေး မရှိပါ</p>}</div></section>
      <section className="mt-5 surface-card p-5"><h2 className="text-lg font-bold">ရောင်းချမှု History · {selectedMonth}</h2><p className="text-xs text-slate-500">Calendar ဖြင့် လအလိုက်ခွဲကြည့်နိုင်ပါသည်။ စာရင်းများကို အလိုအလျောက်မဖျက်ဘဲ audit အတွက်သိမ်းထားပါသည်။</p><div className="mt-3 max-h-96 divide-y overflow-y-auto">{sales.map((sale) => <details key={sale.id} className="py-3"><summary className="flex cursor-pointer list-none flex-wrap justify-between gap-2"><span><b>{new Date(sale.createdAt).toLocaleString('en-GB', { timeZone: MYANMAR_TIME_ZONE })}</b><small className="block text-slate-500">{sale.cashierName} · {sale.cashierEmail}</small></span><span className="text-right"><b>{formatCurrency(sale.totalAmount)}</b><small className={`block ${sale.balanceDue ? 'text-amber-700' : 'text-green-700'}`}>{sale.balanceDue ? `အကြွေးကျန် ${formatCurrency(sale.balanceDue)}` : 'ငွေရပြီး'}</small></span></summary><div className="mt-2 rounded-lg bg-slate-50 p-3 text-sm">{sale.items.map((item) => <div key={item.id} className="flex justify-between"><span>{item.productName} · {item.saleUnit === 'pack' ? 'ပါကင်' : 'တစ်ခု'} × {item.saleQuantity}</span><span>{formatCurrency(item.subtotal)}</span></div>)}</div></details>)}</div></section>
    </main>
    {confirmCredit && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg></div>
        <h2 className="mt-4 text-center text-xl font-bold">အကြွေးဆပ်ပြီး အတည်ပြုမည်</h2>
        <p className="mt-2 text-center text-sm text-slate-500">{confirmCredit.customerName} · {formatCurrency(confirmCredit.balanceDue)} ကို Daily / Monthly income ထဲ ချက်ချင်းပေါင်းထည့်မည်။</p>
        <div className="mt-5 grid grid-cols-2 gap-2"><button onClick={() => setConfirmCredit(null)} className="rounded-xl border border-slate-200 px-4 py-3 font-semibold">Cancel</button><button onClick={() => markCreditPaid(confirmCredit)} className="rounded-xl bg-green-700 px-4 py-3 font-semibold text-white">Confirm</button></div>
      </div>
    </div>}
  </div>
}
