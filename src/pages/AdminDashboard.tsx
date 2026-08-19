import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AppHeader from '../components/AppHeader'
import { api, type Product, type Sale } from '../lib/api'
import { formatCurrency } from '../lib/format'
import { useLanguage } from '../contexts/LanguageContext'

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
  const { t } = useLanguage()
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
        api.getProducts(true).then((freshProducts) => { setProducts(freshProducts); return freshProducts }),
      ])
      setSales(saleData); setProducts(productData)
    } catch (error) { setError(error instanceof Error ? error.message : t('dashboardLoadError')) }
    finally { setLoading(false); loadingRef.current = false }
  }, [selectedMonth, t])

  useEffect(() => {
    void loadDashboard()
    const refreshWhenReturning = () => {
      if (document.visibilityState === 'visible') void loadDashboard(true)
    }
    document.addEventListener('visibilitychange', refreshWhenReturning)
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadDashboard(true)
    }, 60000)
    return () => {
      document.removeEventListener('visibilitychange', refreshWhenReturning)
      window.clearInterval(timer)
    }
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
      { labelKey: 'paid', amount: paid, className: 'bg-emerald-600' },
      { labelKey: 'profit', amount: profit, className: 'bg-primary' },
    ].map((item) => ({ ...item, percent: item.amount / max * 100 }))
  }, [sales])

  const Card = ({ title, data }: { title: string; data: { revenue: number; profit: number; count: number; units: number } }) => (
    <section className="surface-card p-5">
      <h2 className="font-bold text-lg">{title}</h2>
      <p className="mt-3 text-sm text-gray-500">{t('revenue')}</p>
      <p className="text-2xl font-bold text-primary">{formatCurrency(data.revenue)}</p>
      <div className="mt-3 grid grid-cols-3 gap-2 border-t pt-3 text-sm">
        <p>{t('profit')}<br /><b className="text-green-700">{formatCurrency(data.profit)}</b></p>
        <p>{t('invoice')}<br /><b>{data.count}</b></p>
        <p>{t('sold')}<br /><b>{data.units} {t('unitCount')}</b></p>
      </div>
    </section>
  )

  return <div className="min-h-screen bg-slate-50">
    <AppHeader />
    <main className="max-w-5xl mx-auto p-4 lg:p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><h1 className="text-2xl font-bold">{t('dashboard')}</h1></div>
        <label className="text-sm font-medium">{t('chooseMonth')}
          <input type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2" />
        </label>
      </div>
      {error && <p className="bg-red-50 text-red-700 p-3 mb-4 rounded-lg">{error}</p>}
      {loading ? <div className="surface-card p-8 text-center text-slate-500">{t('calculating')}</div> : <div className="grid md:grid-cols-3 gap-4">
        <Card title={t('today')} data={report.today} />
        <Card title={`${selectedMonth} ${t('monthly')}`} data={report.month} />
        <section className="surface-card p-5"><h2 className="font-bold text-lg">{t('inventoryInvestment')}</h2><p className="text-2xl font-bold text-violet-700">{formatCurrency(inventoryInvestment)}</p></section>
      </div>}
      <section className="mt-5 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="surface-card p-5">
          <div className="flex items-center justify-between"><h2 className="text-lg font-bold">{t('dailyIncome')}</h2><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">{t('today')}</span></div>
          <div className="mt-5 rounded-2xl bg-slate-50 p-4"><div className="mb-2 flex items-center justify-between text-sm"><b>{dailyIncome.date}</b><span>{formatCurrency(dailyIncome.amount)}</span></div><div className="h-5 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-gradient-to-r from-primary to-amber-500" style={{ width: `${Math.max(dailyIncome.percent, dailyIncome.amount ? 8 : 0)}%` }} /></div></div>
        </div>
        <div className="surface-card p-5">
          <h2 className="text-lg font-bold">{t('monthlyIncome')}</h2><p className="text-xs text-slate-500">{t('paid')} {t('and')} {t('profit')}</p>
          <div className="mt-5 space-y-4">{monthlyIncomeChart.map((item) => <div key={item.labelKey}><div className="mb-1 flex justify-between text-sm"><b>{t(item.labelKey)}</b><span>{formatCurrency(item.amount)}</span></div><div className="h-3 overflow-hidden rounded-full bg-slate-100"><div className={`h-full ${item.className}`} style={{ width: `${Math.max(item.percent, item.amount ? 4 : 0)}%` }} /></div></div>)}</div>
        </div>
      </section>
    </main>
  </div>
}
