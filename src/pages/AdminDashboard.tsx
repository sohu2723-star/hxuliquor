import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AppHeader from '../components/AppHeader'
import { api, type Product, type Sale } from '../lib/api'
import { formatCurrency } from '../lib/format'

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
  const loadingRef = useRef(false)

  const loadDashboard = useCallback(async (quiet = false) => {
    if (loadingRef.current || document.visibilityState === 'hidden') return
    loadingRef.current = true
    const { start, end } = monthRange(selectedMonth)
    if (!quiet) setLoading(true)
    setError('')
    try {
      const [saleData, productData] = await Promise.all([
        api.getSalesStaleFirst(start, end, setSales).then((result) => result.sales),
        api.getProductsStaleFirst(setProducts).then((result) => result.products),
      ])
      setSales(saleData); setProducts(productData)
    } catch (error) { setError(error instanceof Error ? error.message : 'Data ဆွဲမရပါ။') }
    finally { setLoading(false); loadingRef.current = false }
  }, [selectedMonth])

  useEffect(() => {
    void loadDashboard()
    const timer = window.setInterval(() => void loadDashboard(true), 60000)
    return () => window.clearInterval(timer)
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
  const inventoryInvestment = useMemo(() => products.reduce((sum, product) => {
    const stockCost = product.stockQty * product.costPrice
    return sum + stockCost
  }, 0), [products])
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
    const profit = sales.filter((sale) => sale.paidAmount > 0).flatMap((sale) => sale.items).reduce((sum, item) => sum + item.profit, 0)
    const max = Math.max(paid, profit, 1)
    return [
      { label: 'Paid', my: 'ရပြီး', amount: paid, className: 'bg-emerald-600' },
      { label: 'Profit', my: 'အမြတ်', amount: profit, className: 'bg-primary' },
    ].map((item) => ({ ...item, percent: item.amount / max * 100 }))
  }, [sales])

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
    <main className="max-w-5xl mx-auto p-4 lg:p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><h1 className="text-2xl font-bold">Income & Stock Dashboard</h1><p className="text-sm text-slate-500">Daily စာရင်းကို မြန်မာစံတော်ချိန် (UTC+6:30) ဖြင့်တွက်ထားပါသည်။</p></div>
        <label className="text-sm font-medium">လစဉ်စာရင်းရွေးရန်
          <input type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2" />
        </label>
      </div>
      {error && <p className="bg-red-50 text-red-700 p-3 mb-4 rounded-lg">{error}</p>}
      {loading ? <div className="surface-card p-8 text-center text-slate-500">စာရင်းတွက်နေပါသည်…</div> : <div className="grid md:grid-cols-3 gap-4">
        <Card title="ယနေ့ Daily (မြန်မာစံတော်ချိန်)" data={report.today} />
        <Card title={`${selectedMonth} Monthly`} data={report.month} />
        <section className="surface-card p-5"><h2 className="font-bold text-lg">ဆိုင်ထဲ Product ရင်းနှီးမှု</h2><p className="text-2xl font-bold text-violet-700">{formatCurrency(inventoryInvestment)}</p></section>
      </div>}
      <section className="mt-5 surface-card p-5"><h2 className="font-bold text-lg text-red-700">ကုန်တော့မည့်ပစ္စည်း Warning ({lowStock.length})</h2><div className="mt-3 divide-y">{lowStock.length ? lowStock.map((product) => <div key={product.id} className="py-2 flex justify-between"><span>{product.name} <small className="text-slate-500">({product.saleType === 'pack' ? 'ပါကင် Product' : 'တစ်ခုချင်း Product'})</small></span><b className="text-red-600">Stock {product.stockQty} {product.saleType === 'pack' ? 'ပါကင်' : 'ခု/ဘူး'}</b></div>) : <p className="text-green-700">Stock အားလုံးလုံလောက်ပါသည်</p>}</div></section>
      <section className="mt-5 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="surface-card p-5">
          <div className="flex items-center justify-between"><h2 className="text-lg font-bold">Daily Income Bar</h2><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">Today</span></div>
          <div className="mt-5 rounded-2xl bg-slate-50 p-4"><div className="mb-2 flex items-center justify-between text-sm"><b>{dailyIncome.date}</b><span>{formatCurrency(dailyIncome.amount)}</span></div><div className="h-5 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-gradient-to-r from-primary to-amber-500" style={{ width: `${Math.max(dailyIncome.percent, dailyIncome.amount ? 8 : 0)}%` }} /></div></div>
        </div>
        <div className="surface-card p-5">
          <h2 className="text-lg font-bold">Monthly Income Chart</h2><p className="text-xs text-slate-500">လအတွင်း ငွေရပြီး နှင့် အမြတ်</p>
          <div className="mt-5 space-y-4">{monthlyIncomeChart.map((item) => <div key={item.label}><div className="mb-1 flex justify-between text-sm"><b>{item.my}</b><span>{formatCurrency(item.amount)}</span></div><div className="h-3 overflow-hidden rounded-full bg-slate-100"><div className={`h-full ${item.className}`} style={{ width: `${Math.max(item.percent, item.amount ? 4 : 0)}%` }} /></div></div>)}</div>
        </div>
      </section>
    </main>
  </div>
}
