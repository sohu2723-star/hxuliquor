import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import AppHeader from '../components/AppHeader'
import ConfirmDialog from '../components/ConfirmDialog'
import { api, type CashTransaction, type Sale } from '../lib/api'
import { formatCurrency } from '../lib/format'
import { useLanguage } from '../contexts/LanguageContext'
import { useToast } from '../contexts/ToastContext'
import { useActionLoading } from '../contexts/ActionLoadingContext'

const MYANMAR_TIME_ZONE = 'Asia/Yangon'

type TransactionType = CashTransaction['type']

function myanmarDate(date: Date | string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: MYANMAR_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(date))
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

export default function AdminFinance() {
  const [selectedMonth, setSelectedMonth] = useState(currentMyanmarMonth)
  const [sales, setSales] = useState<Sale[]>([])
  const [transactions, setTransactions] = useState<CashTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteTransactionId, setDeleteTransactionId] = useState<string | null>(null)
  const [type, setType] = useState<TransactionType>('expense')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const { t } = useLanguage()
  const { showToast } = useToast()
  const { isLoading: isActionLoading, runWithLoading } = useActionLoading()

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    setError('')
    try {
      const { start, end } = monthRange(selectedMonth)
      const [salesResult, transactionResult] = await Promise.all([
        api.getSalesStaleFirst(start, end, (fresh) => setSales(fresh)),
        api.getCashTransactions(start, end),
      ])
      setSales(salesResult.sales)
      setTransactions(transactionResult)
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : t('financeLoadError'))
      return false
    } finally {
      setLoading(false)
    }
  }, [selectedMonth, t])

  useEffect(() => {
    void load()
  }, [load])

  const summary = useMemo(() => {
    const cashReceived = sales.reduce((sum, sale) => sum + sale.paidAmount, 0)
    const cashPayment = sales.filter((sale) => sale.paymentMethod === 'Cash').reduce((sum, sale) => sum + sale.paidAmount, 0)
    const mmqrPayment = sales.filter((sale) => sale.paymentMethod === 'MMQR Pay' || sale.paymentMethod === 'Mobile Wallet').reduce((sum, sale) => sum + sale.paidAmount, 0)
    const creditSalesAmount = sales.filter((sale) => sale.paymentMethod === 'Credit').reduce((sum, sale) => sum + sale.totalAmount, 0)
    const shopProfit = sales.filter((sale) => sale.paidAmount > 0).flatMap((sale) => sale.items).reduce((sum, item) => sum + item.profit, 0)
    const outsideIncome = transactions.filter((item) => item.type === 'outside_income').reduce((sum, item) => sum + item.amount, 0)
    const expenses = transactions.filter((item) => item.type === 'expense').reduce((sum, item) => sum + item.amount, 0)
    return { cashReceived, cashPayment, mmqrPayment, creditSalesAmount, shopProfit, outsideIncome, expenses, balance: cashReceived + outsideIncome - expenses }
  }, [sales, transactions])

  const handleRefresh = async () => {
    const success = await runWithLoading(() => load())
    if (success) showToast(`${t('refresh')} ${t('done')}`, 'success')
  }

  const resetForm = () => {
    setEditingId(null)
    setType('expense')
    setAmount('')
    setNote('')
  }

  const submitTransaction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const numericAmount = Number(amount)
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      showToast(t('transactionAmount'), 'error')
      return
    }
    setSaving(true)
    try {
      if (editingId) {
        await api.updateCashTransaction({ id: editingId, type, amount: numericAmount, note })
      } else {
        await api.addCashTransaction({ type, amount: numericAmount, note })
      }
      resetForm()
      await load(true)
      showToast(t('transactionSaved'), 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('financeLoadError'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const beginEdit = (transaction: CashTransaction) => {
    setEditingId(transaction.id)
    setType(transaction.type)
    setAmount(String(transaction.amount))
    setNote(transaction.note)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const removeTransaction = (id: string) => {
    setDeleteTransactionId(id)
  }

  const confirmRemoveTransaction = () => {
    if (!deleteTransactionId) return
    const id = deleteTransactionId
    setDeleteTransactionId(null)
    void runWithLoading(async () => {
      try {
        await api.deleteCashTransaction(id)
        setTransactions((current) => current.filter((item) => item.id !== id))
        showToast(t('transactionDeleted'), 'success')
      } catch (err) {
        showToast(err instanceof Error ? err.message : t('financeLoadError'), 'error')
      }
    })
  }

  const Card = ({ label, value, className = 'text-slate-950' }: { label: string; value: number; className?: string }) => (
    <section className="surface-card p-4 sm:p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-2 text-xl font-extrabold sm:text-2xl ${className}`}>{formatCurrency(value)}</p>
    </section>
  )

  return <div className="min-h-screen bg-slate-50">
    <AppHeader />
    <main className="mx-auto max-w-6xl p-4 lg:p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">{t('financeTitle')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('financeDescription')}</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm font-semibold text-slate-700">{t('chooseMonth')}
            <input type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} className="mt-1 block rounded-xl border border-slate-300 bg-white px-3 py-2" />
          </label>
          <button type="button" onClick={() => void handleRefresh()} disabled={loading || isActionLoading} className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-50">{t('refresh')}</button>
        </div>
      </div>

      {error && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Card label={t('cashPayment')} value={summary.cashPayment} className="text-emerald-700" />
        <Card label={t('mmqrPayment')} value={summary.mmqrPayment} className="text-violet-700" />
        <Card label={t('creditSalesAmount')} value={summary.creditSalesAmount} className="text-amber-700" />
      </div>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card label={t('cashReceived')} value={summary.cashReceived} className="text-emerald-700" />
        <Card label={t('shopProfit')} value={summary.shopProfit} className="text-primary" />
        <Card label={t('outsideIncome')} value={summary.outsideIncome} className="text-sky-700" />
        <Card label={t('cashSpent')} value={summary.expenses} className="text-red-700" />
        <Card label={t('cashBalance')} value={summary.balance} className={summary.balance >= 0 ? 'text-emerald-700' : 'text-red-700'} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <section className="surface-card p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-950">{editingId ? t('editTransaction') : t('addTransaction')}</h2>
            {editingId && <button type="button" onClick={resetForm} className="text-sm font-semibold text-slate-500 hover:text-slate-900">{t('cancel')}</button>}
          </div>
          <form onSubmit={submitTransaction} className="space-y-4">
            <label className="block text-sm font-semibold text-slate-700">{t('transactionType')}
              <select value={type} onChange={(event) => setType(event.target.value as TransactionType)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5">
                <option value="expense">{t('expenseType')}</option>
                <option value="outside_income">{t('outsideIncomeType')}</option>
              </select>
            </label>
            <label className="block text-sm font-semibold text-slate-700">{t('transactionAmount')}
              <input type="number" min="0.01" step="0.01" inputMode="decimal" required value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5" />
            </label>
            <label className="block text-sm font-semibold text-slate-700">{t('transactionNote')}
              <input type="text" value={note} onChange={(event) => setNote(event.target.value)} placeholder={t('transactionNotePlaceholder')} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5" />
            </label>
            <button type="submit" disabled={saving} className="w-full rounded-xl bg-primary px-4 py-3 font-bold text-white disabled:opacity-60">{saving ? t('saving') : t('saveTransaction')}</button>
          </form>
        </section>

        <section className="surface-card p-5">
          <h2 className="mb-4 text-lg font-bold text-slate-950">{t('financeTitle')}</h2>
          {loading ? <p className="py-8 text-center text-slate-500">{t('loading')}</p> : transactions.length === 0 ? <p className="py-8 text-center text-slate-500">{t('noTransactions')}</p> : <div className="divide-y divide-slate-100">
            {transactions.map((transaction) => <div key={transaction.id} className="flex flex-col gap-3 py-4 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-bold text-slate-950">{transaction.type === 'expense' ? t('expenseType') : t('outsideIncomeType')}</p>
                <p className="mt-1 break-words text-sm text-slate-500">{transaction.note || '—'} · {new Date(transaction.createdAt).toLocaleDateString('en-GB', { timeZone: MYANMAR_TIME_ZONE })}</p>
              </div>
              <div className="flex items-center justify-between gap-3 sm:justify-end">
                <p className={`font-extrabold ${transaction.type === 'expense' ? 'text-red-700' : 'text-emerald-700'}`}>{transaction.type === 'expense' ? '-' : '+'}{formatCurrency(transaction.amount)}</p>
                <button type="button" onClick={() => beginEdit(transaction)} className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-600 ring-1 ring-slate-200">{t('edit')}</button>
                <button type="button" onClick={() => void removeTransaction(transaction.id)} className="rounded-lg px-2 py-1 text-sm font-semibold text-red-700 ring-1 ring-red-200">{t('delete')}</button>
              </div>
            </div>)}
          </div>}
        </section>
      </div>
      {deleteTransactionId && <ConfirmDialog
        title={t('delete')}
        message={t('deleteTransactionQuestion')}
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
        onCancel={() => setDeleteTransactionId(null)}
        onConfirm={confirmRemoveTransaction}
      />}
    </main>
  </div>
}
