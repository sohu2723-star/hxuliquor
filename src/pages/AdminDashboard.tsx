import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AppHeader from '../components/AppHeader'
import { api, type Product, type Sale } from '../lib/api'
import { formatCurrency } from '../lib/format'
import AppToast, { type ToastMessage } from '../components/AppToast'
import ConfirmDialog from '../components/ConfirmDialog'
import { notify } from '../lib/notify'

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
    notify(setToast, message, type)
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
    const timer = window.setInterval(() => void loadDashboard(true), 5000)
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
    const today = myanmarDate(new Date())
    const amount = sales.reduce((sum, sale) => {
      if (!sale.paidAmount) return sum
      const paidDate = myanmarDate(sale.isCredit ? sale.settledAt : sale.createdAt)
      return paidDate === today ? sum + sale.paidAmount : sum
    }, 0)
    return { date: today, amount, percent: amount > 0 ? 100 : 0 }
  }, [sales])

  const monthlyIncomeChart = useMemo(() => {
    const paid = sales.reduce((sum, sale) => sum + sale.paidAmount, 0)
    const credit = sales.reduce((sum, sale) => sum + sale.balanceDue, 0)
    const profit = sales.filter((sale) => sale.paidAmount > 0).flatMap((sale) => sale.items).reduce((sum, item) => sum + item.profit, 0)
    const max = Math.max(paid, credit, profit, 1)
    return [
      { label: 'Paid', my: 'ရပြီး', amount: paid, className: 'bg-emerald-600' },
      { label: 'Credit', my: 'အကြွေးကျန်', amount: credit, className: 'bg-amber-500' },
      { label: 'Profit', my: 'အမြတ်', amount: profit, className: 'bg-primary' },
    ].map((item) => ({ ...item, percent: item.amount / max * 100 }))
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
      <section className="mt-5 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="surface-card p-5">
          <div className="flex items-center justify-between"><div><h2 className="text-lg font-bold">Daily Income Chart</h2><p className="text-xs text-slate-500">ယနေ့တစ်ရက်စာဝင်ငွေကို bar chart ဖြင့်ပြထားသည်။ နောက်နေ့တွင် 0 မှပြန်စပါသည်။</p></div><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">Today</span></div>
          <div className="mt-4 flex h-48 items-end justify-center rounded-2xl bg-slate-50 p-3"><div className="group flex h-full w-24 flex-col items-center justify-end"><span className="mb-2 rounded bg-slate-900 px-2 py-1 text-[10px] font-semibold text-white">{formatCurrency(dailyIncome.amount)}</span><div className="w-full rounded-t-xl bg-gradient-to-t from-primary to-amber-500" style={{ height: `${Math.max(dailyIncome.percent, dailyIncome.amount ? 4 : 0)}%` }} /><span className="mt-2 text-[10px] font-semibold text-slate-500">{dailyIncome.date.slice(8)}</span></div></div>
        </div>
        <div className="surface-card p-5">
          <h2 className="text-lg font-bold">Monthly Income Chart</h2><p className="text-xs text-slate-500">လအတွင်း ငွေရပြီး၊ အကြွေးကျန်၊ အမြတ်</p>
          <div className="mt-5 space-y-4">{monthlyIncomeChart.map((item) => <div key={item.label}><div className="mb-1 flex justify-between text-sm"><b>{item.my}</b><span>{formatCurrency(item.amount)}</span></div><div className="h-3 overflow-hidden rounded-full bg-slate-100"><div className={`h-full ${item.className}`} style={{ width: `${Math.max(item.percent, item.amount ? 4 : 0)}%` }} /></div></div>)}</div>
        </div>
      </section>
      <section className="mt-5 surface-card p-5"><h2 className="text-lg font-bold text-amber-700">အကြွေးစာရင်း ({unpaidCredits.length})</h2><div className="mt-3 divide-y">{unpaidCredits.length ? unpaidCredits.map((sale) => <div key={sale.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center"><div className="flex-1"><b>{sale.customerName}</b><p className="text-xs text-slate-500">{myanmarDate(sale.createdAt)} · {sale.cashierName} ({sale.cashierEmail})</p></div><b className="text-amber-700">{formatCurrency(sale.balanceDue)}</b><button onClick={() => setConfirmCredit(sale)} className="rounded-lg bg-green-700 px-3 py-2 text-sm font-medium text-white">အကြွေးဆပ်ပြီး</button></div>) : <p className="py-3 text-green-700">ပေးရန်ကျန်သည့်အကြွေး မရှိပါ</p>}</div></section>
      <section className="mt-5 surface-card p-5"><h2 className="text-lg font-bold">ရောင်းချမှု History · {selectedMonth}</h2><p className="text-xs text-slate-500">Calendar ဖြင့် လအလိုက်ခွဲကြည့်နိုင်ပါသည်။ စာရင်းများကို အလိုအလျောက်မဖျက်ဘဲ audit အတွက်သိမ်းထားပါသည်။</p><div className="mt-3 max-h-96 divide-y overflow-y-auto">{sales.map((sale) => <details key={sale.id} className="py-3"><summary className="flex cursor-pointer list-none flex-wrap justify-between gap-2"><span><b>{new Date(sale.createdAt).toLocaleString('en-GB', { timeZone: MYANMAR_TIME_ZONE })}</b><small className="block text-slate-500">{sale.cashierName} · {sale.cashierEmail}</small></span><span className="text-right"><b>{formatCurrency(sale.totalAmount)}</b><small className={`block ${sale.balanceDue ? 'text-amber-700' : 'text-green-700'}`}>{sale.balanceDue ? `အကြွေးကျန် ${formatCurrency(sale.balanceDue)}` : 'ငွေရပြီး'}</small></span></summary><div className="mt-2 rounded-lg bg-slate-50 p-3 text-sm">{sale.items.map((item) => <div key={item.id} className="flex justify-between"><span>{item.productName} · {item.saleUnit === 'pack' ? 'ပါကင်' : 'တစ်ခု'} × {item.saleQuantity}</span><span>{formatCurrency(item.subtotal)}</span></div>)}</div></details>)}</div></section>
    </main>
    {confirmCredit && <ConfirmDialog
      title="အကြွေးဆပ်ပြီး အတည်ပြုမည်"
      message={`${confirmCredit.customerName} · ${formatCurrency(confirmCredit.balanceDue)} ကို Daily / Monthly income ထဲ ချက်ချင်းပေါင်းထည့်မည်။`}
      confirmLabel="Confirm"
      tone="success"
      onCancel={() => setConfirmCredit(null)}
      onConfirm={() => markCreditPaid(confirmCredit)}
    />}
  </div>
}
