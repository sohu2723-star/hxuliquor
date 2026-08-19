import { useCallback, useEffect, useState } from 'react'
import AppHeader from '../components/AppHeader'
import { api, type Sale } from '../lib/api'
import { formatCurrency } from '../lib/format'
import { downloadReceipt } from '../lib/receiptDownload'
import { useLanguage } from '../contexts/LanguageContext'
import { useToast } from '../contexts/ToastContext'
import { useActionLoading } from '../contexts/ActionLoadingContext'

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
  const [printedReceiptIds, setPrintedReceiptIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const { t, language } = useLanguage()
  const { showToast } = useToast()
  const { isLoading: isActionLoading, runWithLoading } = useActionLoading()

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    setError('')
    try {
      const { start, end } = monthRange(selectedMonth)
      const result = await api.getSalesStaleFirst(start, end, (fresh) => setSales(fresh))
      setSales(result.sales)
      try {
        const printedIds = await api.getPrintedReceiptIds(result.sales.map((sale) => sale.id))
        setPrintedReceiptIds(new Set(printedIds))
      } catch {
        setPrintedReceiptIds(new Set())
      }
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : t('salesLoadError'))
      return false
    } finally {
      setLoading(false)
    }
  }, [selectedMonth, t])

  useEffect(() => {
    void load()
    const refreshWhenReturning = () => {
      if (document.visibilityState === 'visible') void load(true)
    }
    document.addEventListener('visibilitychange', refreshWhenReturning)
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load(true)
    }, 60000)
    return () => {
      document.removeEventListener('visibilitychange', refreshWhenReturning)
      window.clearInterval(timer)
    }
  }, [load])

  const handleRefresh = async () => {
    const success = await runWithLoading(() => load())
    if (success) showToast(`${t('refresh')} ${t('done')}`, 'success')
  }

  const handleDownloadStoredReceipt = async (sale: Sale) => {
    try {
      const storedReceipt = await api.getPrintedReceipt(sale.id)
      if (!storedReceipt) {
        showToast(t('receiptDownloadError'), 'error')
        return
      }
      downloadReceipt(storedReceipt, language)
      showToast(t('receiptDownloaded'), 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('receiptDownloadError'), 'error')
    }
  }

  const total = sales.reduce((sum, sale) => sum + sale.totalAmount, 0)
  const paid = sales.reduce((sum, sale) => sum + sale.paidAmount, 0)
  const credit = sales.reduce((sum, sale) => sum + sale.balanceDue, 0)

  return <div className="min-h-screen bg-slate-50">
    <AppHeader />
    <main className="mx-auto max-w-5xl p-4 lg:p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><h1 className="text-2xl font-bold text-slate-950">{t('salesHistory')}</h1></div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="text-sm font-semibold text-slate-700">{t('chooseMonth')}<input type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} className="mt-1 block rounded-xl border border-slate-300 bg-white px-3 py-2" /></label>
          <button onClick={() => void handleRefresh()} disabled={loading || isActionLoading} className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-50">{t('refresh')}</button>
        </div>
      </div>
      {error && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <section className="surface-card p-5"><p className="text-sm text-slate-500">{t('receipts')}</p><p className="mt-2 text-2xl font-bold">{sales.length}</p></section>
        <section className="surface-card p-5"><p className="text-sm text-slate-500">{t('totalSales')}</p><p className="mt-2 text-2xl font-bold text-primary">{formatCurrency(total)}</p></section>
        <section className="surface-card p-5"><p className="text-sm text-slate-500">{t('paid')} / {t('outstanding')}</p><p className="mt-2 text-lg font-bold text-emerald-700">{formatCurrency(paid)} <span className="text-amber-700">/ {formatCurrency(credit)}</span></p></section>
      </div>
      {loading ? <div className="surface-card p-8 text-center text-slate-500">{t('loading')}</div> : <section className="surface-card p-5">
        <div className="divide-y">{sales.length ? sales.map((sale) => <details key={sale.id} className="py-4 first:pt-0 last:pb-0">
          <summary className="flex cursor-pointer list-none flex-wrap justify-between gap-3"><span><b>{new Date(sale.createdAt).toLocaleString('en-GB', { timeZone: MYANMAR_TIME_ZONE })}</b><small className="mt-1 block text-slate-500">{sale.cashierName} · {sale.cashierEmail}{sale.customerName ? ` · ${t('customer')}: ${sale.customerName}` : ''}{printedReceiptIds.has(sale.id) ? ` · ${t('printedReceipt')}` : ''}</small></span><span className="text-right"><b>{formatCurrency(sale.totalAmount)}</b><small className={`mt-1 block ${sale.balanceDue ? 'text-amber-700' : 'text-emerald-700'}`}>{sale.balanceDue ? `${t('outstanding')} ${formatCurrency(sale.balanceDue)}` : t('paid')}</small></span></summary>
          <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">{sale.items.map((item) => <div key={item.id} className="flex justify-between gap-3 border-b border-slate-200 py-2 last:border-0"><span>{item.productName} · {item.saleUnit === 'case' ? t('case') : item.saleUnit === 'pack' ? t('innerPack') : t('unit')} × {item.saleQuantity}</span><span className="shrink-0 font-semibold">{formatCurrency(item.subtotal)}</span></div>)}{printedReceiptIds.has(sale.id) && <button type="button" onClick={() => void handleDownloadStoredReceipt(sale)} className="mt-3 w-full rounded-lg bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-800 ring-1 ring-violet-200 hover:bg-violet-100">{t('downloadReceipt')}</button>}</div>
        </details>) : <p className="py-6 text-center text-slate-500">{t('noSalesThisMonth')}</p>}</div>
      </section>}
    </main>
  </div>
}
