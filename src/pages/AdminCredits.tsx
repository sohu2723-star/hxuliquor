import { useCallback, useEffect, useMemo, useState } from 'react'
import AppHeader from '../components/AppHeader'
import ConfirmDialog from '../components/ConfirmDialog'
import { api, type Sale } from '../lib/api'
import { formatCurrency } from '../lib/format'
import { useToast } from '../contexts/ToastContext'
import { useActionLoading } from '../contexts/ActionLoadingContext'

const MYANMAR_TIME_ZONE = 'Asia/Yangon'

function myanmarDate(date: Date | string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: MYANMAR_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(date))
}

export default function AdminCredits() {
  const [sales, setSales] = useState<Sale[]>([])
  const [confirmCredit, setConfirmCredit] = useState<Sale | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const { showToast } = useToast()
  const { runWithLoading } = useActionLoading()

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    setError('')
    try {
      const result = await api.getSalesStaleFirst(undefined, undefined, (fresh) => setSales(fresh))
      setSales(result.sales)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'အကြွေးစာရင်း ဆွဲမရပါ။')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load(true)
    }, 60000)
    return () => window.clearInterval(timer)
  }, [load])

  const credits = useMemo(() => sales.filter((sale) => sale.isCredit), [sales])
  const unpaid = credits.filter((sale) => sale.balanceDue > 0)
  const unpaidAmount = unpaid.reduce((sum, sale) => sum + sale.balanceDue, 0)
  const paidAmount = credits.filter((sale) => sale.balanceDue <= 0).reduce((sum, sale) => sum + sale.paidAmount, 0)
  const totalCreditAmount = credits.reduce((sum, sale) => sum + sale.totalAmount, 0)
  const customerCreditRows = useMemo(() => {
    const grouped = new Map<string, number>()
    unpaid.forEach((sale) => {
      const customer = sale.customerName?.trim() || 'Customer name မရှိပါ'
      grouped.set(customer, (grouped.get(customer) || 0) + sale.balanceDue)
    })
    return [...grouped.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
  }, [unpaid])
  const maxCustomerBalance = customerCreditRows[0]?.[1] || 1
  const outstandingPercent = totalCreditAmount > 0 ? Math.min(100, (unpaidAmount / totalCreditAmount) * 100) : 0

  const markCreditPaid = (sale: Sale) => {
    setConfirmCredit(null)
    const previous = sales
    setSales((current) => current.map((item) => item.id === sale.id ? { ...item, paidAmount: item.totalAmount, balanceDue: 0, settledAt: new Date().toISOString() } : item))
    void runWithLoading(async () => {
      try {
        const updated = await api.payCredit(sale.id)
        setSales((current) => current.map((item) => item.id === updated.id ? updated : item))
        showToast('အကြွေးဆပ်ပြီးပါပြီ။ Income ထဲတွင် ထည့်တွက်ပြီးပါပြီ။', 'success')
      } catch (err) {
        setSales(previous)
        showToast(err instanceof Error ? err.message : 'အကြွေးပေးချေမှု မအောင်မြင်ပါ။', 'error')
      }
    })
  }

  return <div className="min-h-screen bg-slate-50">
    <AppHeader />
    <main className="mx-auto max-w-5xl p-4 lg:p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">အကြွေးစာရင်း</h1>
          <p className="mt-1 text-sm text-slate-500">Income page မှ ခွဲထားသော customer credit စာရင်းနှင့် ပေးချေမှုများ။</p>
        </div>
        <button onClick={() => void load()} className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">Refresh</button>
      </div>
      {error && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <section className="surface-card p-5"><p className="text-sm text-slate-500">အကြွေးဘောင်ချာ</p><p className="mt-2 text-2xl font-bold text-amber-700">{credits.length}</p></section>
        <section className="surface-card p-5"><p className="text-sm text-slate-500">ပေးရန်ကျန်ငွေ</p><p className="mt-2 text-2xl font-bold text-red-700">{formatCurrency(unpaidAmount)}</p></section>
        <section className="surface-card p-5"><p className="text-sm text-slate-500">အကြွေးမှ ရပြီးငွေ</p><p className="mt-2 text-2xl font-bold text-emerald-700">{formatCurrency(paidAmount)}</p></section>
      </div>
      <section className="surface-card mb-5 p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div><h2 className="text-lg font-bold text-slate-900">အကြွေးကျန် Bar Chart</h2><p className="mt-1 text-sm text-slate-500">Customer အလိုက် ပေးရန်ကျန်ငွေကို အများဆုံးမှ အနည်းဆုံးစီထားပါသည်။</p></div>
          <p className="text-sm font-semibold text-red-700">စုစုပေါင်းကျန် {formatCurrency(unpaidAmount)}</p>
        </div>
        <div className="mt-5 space-y-4">
          {customerCreditRows.length ? customerCreditRows.map(([customer, amount]) => <div key={customer}>
            <div className="mb-1 flex items-center justify-between gap-3 text-sm"><span className="min-w-0 truncate font-semibold text-slate-700">{customer}</span><span className="shrink-0 font-bold text-red-700">{formatCurrency(amount)}</span></div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-red-500 transition-all" style={{ width: `${Math.max(4, (amount / maxCustomerBalance) * 100)}%` }} /></div>
          </div>) : <p className="py-3 text-center text-emerald-700">ပေးရန်ကျန်သည့်အကြွေး မရှိပါ။</p>}
        </div>
        <div className="mt-5 border-t border-slate-100 pt-4">
          <div className="mb-1 flex justify-between text-xs font-semibold text-slate-500"><span>အကြွေးစုစုပေါင်းထဲမှ ကျန်ငွေရာခိုင်နှုန်း</span><span>{outstandingPercent.toFixed(0)}%</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-emerald-100"><div className="h-full rounded-full bg-red-500" style={{ width: `${outstandingPercent}%` }} /></div>
        </div>
      </section>
      {loading ? <div className="surface-card p-8 text-center text-slate-500">အကြွေးစာရင်း ဆွဲနေပါသည်…</div> : <>
        <section className="surface-card p-5">
          <h2 className="text-lg font-bold text-amber-700">ပေးရန်ကျန်သည့်စာရင်း ({unpaid.length})</h2>
          <div className="mt-3 divide-y">
            {unpaid.length ? unpaid.map((sale) => <div key={sale.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1"><p className="font-bold text-slate-900">{sale.customerName || 'Customer name မရှိပါ'}</p><p className="mt-1 text-xs text-slate-500">{myanmarDate(sale.createdAt)} · {sale.cashierName} · {sale.cashierEmail}</p></div>
              <p className="font-bold text-amber-700">{formatCurrency(sale.balanceDue)}</p>
              <button onClick={() => setConfirmCredit(sale)} className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">အကြွေးဆပ်ပြီး</button>
            </div>) : <p className="py-4 text-emerald-700">ပေးရန်ကျန်သည့်အကြွေး မရှိပါ။</p>}
          </div>
        </section>
        <section className="mt-5 surface-card p-5">
          <h2 className="text-lg font-bold">အကြွေးမှတ်တမ်း</h2>
          <div className="mt-3 divide-y">{credits.length ? credits.map((sale) => <div key={sale.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between"><div><b>{sale.customerName || 'Customer name မရှိပါ'}</b><p className="text-xs text-slate-500">{myanmarDate(sale.createdAt)} · {sale.cashierEmail}</p></div><span className={sale.balanceDue > 0 ? 'font-bold text-amber-700' : 'font-bold text-emerald-700'}>{sale.balanceDue > 0 ? `ကျန် ${formatCurrency(sale.balanceDue)}` : `ရှင်းပြီး ${formatCurrency(sale.totalAmount)}`}</span></div>) : <p className="py-4 text-slate-500">အကြွေးမှတ်တမ်း မရှိသေးပါ။</p>}</div>
        </section>
      </>}
    </main>
    {confirmCredit && <ConfirmDialog title="အကြွေးဆပ်ပြီး အတည်ပြုမည်" message={`${confirmCredit.customerName} · ${formatCurrency(confirmCredit.balanceDue)} ကို ပေးချေပြီးသားအဖြစ် မှတ်မည်။`} confirmLabel="Confirm" tone="success" onCancel={() => setConfirmCredit(null)} onConfirm={() => markCreditPaid(confirmCredit)} />}
  </div>
}
