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
  const paidSales = credits.filter((sale) => sale.paidAmount > 0)
  const unpaidAmount = unpaid.reduce((sum, sale) => sum + sale.balanceDue, 0)
  const paidAmount = credits.reduce((sum, sale) => sum + sale.paidAmount, 0)
  const totalCreditAmount = credits.reduce((sum, sale) => sum + sale.totalAmount, 0)
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
      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <section className="surface-card p-5"><p className="text-sm text-slate-500">အကြွေးဘောင်ချာ</p><p className="mt-2 text-2xl font-bold text-amber-700">{credits.length}</p></section>
        <section className="surface-card p-5"><p className="text-sm text-slate-500">အကြွေးစုစုပေါင်း</p><p className="mt-2 text-2xl font-bold text-slate-900">{formatCurrency(totalCreditAmount)}</p></section>
        <section className="surface-card p-5"><p className="text-sm text-slate-500">ရပြီးငွေ သီးသန့်</p><p className="mt-2 text-2xl font-bold text-emerald-700">{formatCurrency(paidAmount)}</p></section>
        <section className="surface-card p-5"><p className="text-sm text-slate-500">အကြွေးကျန် သီးသန့်</p><p className="mt-2 text-2xl font-bold text-red-700">{formatCurrency(unpaidAmount)}</p></section>
      </div>
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
          <h2 className="text-lg font-bold text-emerald-700">ရပြီးသည့်ငွေစာရင်း ({paidSales.length})</h2>
          <div className="mt-3 divide-y">{paidSales.length ? paidSales.map((sale) => <div key={`paid-${sale.id}`} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between"><div><b>{sale.customerName || 'Customer name မရှိပါ'}</b><p className="text-xs text-slate-500">{myanmarDate(sale.createdAt)} · {sale.cashierEmail}</p></div><span className="font-bold text-emerald-700">ရပြီး {formatCurrency(sale.paidAmount)}</span></div>) : <p className="py-4 text-slate-500">ရပြီးသည့်အကြွေး မရှိသေးပါ။</p>}</div>
        </section>
        <section className="mt-5 surface-card p-5">
          <h2 className="text-lg font-bold text-red-700">အကြွေးကျန်သည့်စာရင်း ({unpaid.length})</h2>
          <div className="mt-3 divide-y">{unpaid.length ? unpaid.map((sale) => <div key={`balance-${sale.id}`} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="font-bold text-slate-900">{sale.customerName || 'Customer name မရှိပါ'}</p><p className="mt-1 text-xs text-slate-500">{myanmarDate(sale.createdAt)} · {sale.cashierEmail}</p><p className="mt-1 text-xs"><span className="font-semibold text-emerald-700">ရပြီး {formatCurrency(sale.paidAmount)}</span><span className="mx-2 text-slate-300">|</span><span className="font-semibold text-red-700">ကျန် {formatCurrency(sale.balanceDue)}</span></p></div><button onClick={() => setConfirmCredit(sale)} className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">အကြွေးဆပ်ပြီး</button></div>) : <p className="py-4 text-emerald-700">အကြွေးကျန်သည့်စာရင်း မရှိပါ။</p>}</div>
        </section>
      </>}
    </main>
    {confirmCredit && <ConfirmDialog title="အကြွေးဆပ်ပြီး အတည်ပြုမည်" message={`${confirmCredit.customerName} · ${formatCurrency(confirmCredit.balanceDue)} ကို ပေးချေပြီးသားအဖြစ် မှတ်မည်။`} confirmLabel="Confirm" tone="success" onCancel={() => setConfirmCredit(null)} onConfirm={() => markCreditPaid(confirmCredit)} />}
  </div>
}
