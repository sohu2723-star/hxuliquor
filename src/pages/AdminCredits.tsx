import { useCallback, useEffect, useState } from 'react'
import AppHeader from '../components/AppHeader'
import { api, type CustomerBalance, type CustomerLedgerEntry } from '../lib/api'
import { formatCurrency } from '../lib/format'
import { useToast } from '../contexts/ToastContext'
import { useActionLoading } from '../contexts/ActionLoadingContext'
import { useLanguage } from '../contexts/LanguageContext'

const MYANMAR_TIME_ZONE = 'Asia/Yangon'
type PaymentMode = 'payment' | 'deposit'

function myanmarDate(date: Date | string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: MYANMAR_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(date))
}

function entryLabel(entryType: CustomerLedgerEntry['entryType'], t: (key: string) => string) {
  if (entryType === 'sale_credit') return t('saleCredit')
  if (entryType === 'payment') return t('paymentHistory')
  if (entryType === 'deposit') return t('deposit')
  return t('depositApplied')
}

export default function AdminCredits() {
  const [balances, setBalances] = useState<CustomerBalance[]>([])
  const [ledgerByCustomer, setLedgerByCustomer] = useState<Record<string, CustomerLedgerEntry[]>>({})
  const [expandedCustomer, setExpandedCustomer] = useState('')
  const [paymentCustomer, setPaymentCustomer] = useState<CustomerBalance | null>(null)
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('payment')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [paymentError, setPaymentError] = useState('')
  const { showToast } = useToast()
  const { isLoading: isActionLoading, runWithLoading } = useActionLoading()
  const { t } = useLanguage()

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    setError('')
    try {
      setBalances(await api.getCustomerBalances())
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : t('creditLoadError'))
      return false
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void load()
    const refreshWhenReturning = () => { if (document.visibilityState === 'visible') void load(true) }
    document.addEventListener('visibilitychange', refreshWhenReturning)
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(true) }, 60000)
    return () => { document.removeEventListener('visibilitychange', refreshWhenReturning); window.clearInterval(timer) }
  }, [load])

  const handleRefresh = async () => {
    const success = await runWithLoading(() => load())
    if (success) showToast(`${t('refresh')} ${t('done')}`, 'success')
  }

  const openPayment = (customer: CustomerBalance, mode: PaymentMode) => {
    setPaymentCustomer(customer)
    setPaymentMode(mode)
    setPaymentAmount('')
    setPaymentError('')
  }

  const closePayment = () => {
    if (isActionLoading) return
    setPaymentCustomer(null)
    setPaymentAmount('')
    setPaymentError('')
  }

  const submitPayment = async () => {
    if (!paymentCustomer) return
    const amount = Number(paymentAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setPaymentError(t('amountRequired'))
      return
    }
    setPaymentError('')
    const result = await runWithLoading(async () => {
      try {
        const response = await api.addCustomerPayment({
          customerName: paymentCustomer.customerName,
          amount,
          note: paymentMode === 'deposit' ? t('deposit') : t('paymentHistory'),
        })
        return { ok: true as const, response }
      } catch (err) {
        return { ok: false as const, message: err instanceof Error ? err.message : t('creditPaidError') }
      }
    })
    if (!result.ok) {
      setPaymentError(result.message)
      return
    }
    closePayment()
    await load(true)
    showToast(`${t('creditPaidSuccess')} ${formatCurrency(result.response.applied)}${result.response.depositAdded > 0 ? ` · ${t('deposit')} ${formatCurrency(result.response.depositAdded)}` : ''}`, 'success')
  }

  const toggleLedger = async (customerName: string) => {
    if (expandedCustomer === customerName) {
      setExpandedCustomer('')
      return
    }
    setExpandedCustomer(customerName)
    if (ledgerByCustomer[customerName]) return
    try {
      const entries = await api.getCustomerLedger(customerName)
      setLedgerByCustomer((current) => ({ ...current, [customerName]: entries }))
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('ledgerLoadError'), 'error')
    }
  }

  const totalCreditDue = balances.reduce((sum, item) => sum + item.creditDue, 0)
  const totalDeposit = balances.reduce((sum, item) => sum + item.depositBalance, 0)
  const netBalance = balances.reduce((sum, item) => sum + item.netBalance, 0)

  return <div className="min-h-screen bg-slate-50">
    <AppHeader />
    <main className="mx-auto max-w-5xl p-4 lg:p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><h1 className="text-2xl font-bold text-slate-950">{t('credits')}</h1><p className="mt-1 text-sm text-slate-500">{t('customerLedger')}</p></div>
        <button onClick={() => void handleRefresh()} disabled={loading || isActionLoading} className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-50">{t('refresh')}</button>
      </div>
      {error && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <section className="surface-card p-5"><p className="text-sm text-slate-500">{t('customers')}</p><p className="mt-2 text-2xl font-bold text-slate-900">{balances.length}</p></section>
        <section className="surface-card p-5"><p className="text-sm text-slate-500">{t('creditDue')}</p><p className="mt-2 text-2xl font-bold text-red-700">{formatCurrency(totalCreditDue)}</p></section>
        <section className="surface-card p-5"><p className="text-sm text-slate-500">{t('depositBalance')}</p><p className="mt-2 text-2xl font-bold text-emerald-700">{formatCurrency(totalDeposit)}</p></section>
        <section className="surface-card p-5"><p className="text-sm text-slate-500">{t('netBalance')}</p><p className={`mt-2 text-2xl font-bold ${netBalance > 0 ? 'text-red-700' : 'text-emerald-700'}`}>{formatCurrency(netBalance)}</p></section>
      </div>

      {loading ? <div className="surface-card p-8 text-center text-slate-500">{t('loading')}</div> : (
        <section className="surface-card overflow-hidden">
          {balances.length === 0 ? <p className="p-8 text-center text-emerald-700">{t('noCustomerBalances')}</p> : <div className="divide-y divide-slate-200">
            {balances.map((customer) => {
              const ledger = ledgerByCustomer[customer.customerName]
              const expanded = expandedCustomer === customer.customerName
              return <div key={customer.customerName}>
                <div className="p-4 sm:p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <button onClick={() => void toggleLedger(customer.customerName)} className="min-w-0 text-left" aria-expanded={expanded}>
                      <p className="truncate text-lg font-bold text-slate-950">{customer.customerName}</p>
                      <p className="mt-1 text-xs text-slate-500">{expanded ? t('hideLedger') : t('viewLedger')}</p>
                    </button>
                    <div className="grid grid-cols-3 gap-3 text-right sm:min-w-[360px]">
                      <div><p className="text-xs text-slate-500">{t('creditDue')}</p><p className="font-bold text-red-700">{formatCurrency(customer.creditDue)}</p></div>
                      <div><p className="text-xs text-slate-500">{t('depositBalance')}</p><p className="font-bold text-emerald-700">{formatCurrency(customer.depositBalance)}</p></div>
                      <div><p className="text-xs text-slate-500">{t('netBalance')}</p><p className={`font-bold ${customer.netBalance > 0 ? 'text-red-700' : 'text-emerald-700'}`}>{formatCurrency(customer.netBalance)}</p></div>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button onClick={() => openPayment(customer, 'payment')} className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">{t('payCustomer')}</button>
                    <button onClick={() => openPayment(customer, 'deposit')} className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600">{t('addDeposit')}</button>
                  </div>
                </div>
                {expanded && <div className="border-t border-slate-100 bg-slate-50 px-4 py-4 sm:px-5">
                  {!ledger ? <p className="text-sm text-slate-500">{t('loading')}</p> : ledger.length === 0 ? <p className="text-sm text-slate-500">{t('noLedger')}</p> : <div className="space-y-2">
                    {ledger.map((entry) => <div key={entry.id} className="flex items-start justify-between gap-3 rounded-lg bg-white p-3 text-sm ring-1 ring-slate-200">
                      <div className="min-w-0"><p className="font-semibold text-slate-800">{entryLabel(entry.entryType, t)}</p><p className="mt-1 text-xs text-slate-500">{myanmarDate(entry.createdAt)}{entry.note ? ` · ${entry.note}` : ''}</p></div>
                      <span className={`shrink-0 font-bold ${entry.entryType === 'sale_credit' ? 'text-red-700' : 'text-emerald-700'}`}>{entry.entryType === 'sale_credit' ? '+' : ''}{formatCurrency(entry.amount)}</span>
                    </div>)}
                  </div>}
                </div>}
              </div>
            })}
          </div>}
        </section>
      )}
    </main>

    {paymentCustomer && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-bold text-slate-950">{paymentMode === 'deposit' ? t('addDeposit') : t('payCustomer')}</h2><p className="mt-1 text-sm text-slate-500">{paymentCustomer.customerName}</p></div><button onClick={closePayment} className="text-2xl text-slate-400" aria-label={t('close')}>×</button></div>
        <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm"><div className="flex justify-between"><span>{t('creditDue')}</span><b className="text-red-700">{formatCurrency(paymentCustomer.creditDue)}</b></div><div className="mt-1 flex justify-between"><span>{t('depositBalance')}</span><b className="text-emerald-700">{formatCurrency(paymentCustomer.depositBalance)}</b></div></div>
        <label className="mt-4 block text-sm font-medium text-slate-700">{t('transactionAmount')}<input type="number" min="0" step="1" inputMode="decimal" autoFocus value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3" /></label>
        {paymentMode === 'deposit' && <p className="mt-2 text-xs text-amber-700">{t('depositPaymentHint')}</p>}
        {paymentError && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{paymentError}</p>}
        <div className="mt-5 flex gap-2"><button onClick={closePayment} disabled={isActionLoading} className="flex-1 rounded-xl bg-slate-100 px-4 py-3 font-semibold text-slate-700">{t('cancel')}</button><button onClick={() => void submitPayment()} disabled={isActionLoading} className="flex-1 rounded-xl bg-primary px-4 py-3 font-semibold text-white disabled:opacity-50">{isActionLoading ? t('processing') : t('confirm')}</button></div>
      </div>
    </div>}
  </div>
}
