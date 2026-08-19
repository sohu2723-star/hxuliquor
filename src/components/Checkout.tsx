import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../lib/api'
import type { Product, Sale } from '../lib/api'
import { formatCurrency } from '../lib/format'
import { useActionLoading } from '../contexts/ActionLoadingContext'
import { useLanguage } from '../contexts/LanguageContext'

interface CheckoutProps {
  cart: { product: Product; quantity: number; saleUnit: 'unit' | 'pack' | 'case' }[]
  requiresAgeCheck: boolean
  onClose: () => void
  onSuccess: (sale: Sale) => void
  onError?: (message: string) => void
}

type PaymentMethod = 'Cash' | 'MMQR Pay' | 'Credit'

const CHECKOUT_DRAFT_KEY = 'hxu-checkout-draft'

function readDraft() {
  try {
    const value = JSON.parse(localStorage.getItem(CHECKOUT_DRAFT_KEY) || 'null')
    return value && typeof value === 'object' ? value as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function numericValue(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

export default function Checkout({ cart, requiresAgeCheck, onClose, onSuccess, onError }: CheckoutProps) {
  const draft = readDraft()
  const [ageVerified, setAgeVerified] = useState(draft.ageVerified === true)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(() => {
    const value = draft.paymentMethod
    return value === 'MMQR Pay' || value === 'Credit' ? value : 'Cash'
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const [error, setError] = useState('')
  const [customerName, setCustomerName] = useState(String(draft.customerName || ''))
  const [initialPaidAmount, setInitialPaidAmount] = useState(String(draft.initialPaidAmount || '0'))
  const [depositBalance, setDepositBalance] = useState(0)
  const [depositLoading, setDepositLoading] = useState(false)
  const { runWithLoading } = useActionLoading()
  const { t } = useLanguage()

  useEffect(() => {
    try {
      localStorage.setItem(CHECKOUT_DRAFT_KEY, JSON.stringify({ ageVerified, paymentMethod, customerName, initialPaidAmount }))
    } catch { /* storage unavailable */ }
  }, [ageVerified, paymentMethod, customerName, initialPaidAmount])

  const saleUnitPrice = (product: Product, saleUnit: 'unit' | 'pack' | 'case') => saleUnit === 'case' ? product.casePrice : saleUnit === 'pack' ? product.packPrice : product.price
  const total = useMemo(() => cart.reduce((sum, item) => sum + saleUnitPrice(item.product, item.saleUnit) * item.quantity, 0), [cart])
  const paidNow = numericValue(initialPaidAmount)
  const depositApplied = Math.min(depositBalance, Math.max(total - paidNow, 0))
  const balanceDue = Math.max(total - paidNow - depositApplied, 0)

  useEffect(() => {
    if (paymentMethod !== 'Credit' || !customerName.trim()) {
      setDepositBalance(0)
      setDepositLoading(false)
      return
    }

    let cancelled = false
    const timer = window.setTimeout(async () => {
      setDepositLoading(true)
      try {
        const balances = await api.getCustomerBalances()
        if (cancelled) return
        const normalized = customerName.trim().toLocaleLowerCase()
        const customer = balances.find((item) => item.customerName.trim().toLocaleLowerCase() === normalized)
        setDepositBalance(customer?.depositBalance || 0)
      } catch {
        if (!cancelled) setDepositBalance(0)
      } finally {
        if (!cancelled) setDepositLoading(false)
      }
    }, 350)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [customerName, paymentMethod])

  const handleSubmit = async () => {
    if (submittingRef.current) return
    if (requiresAgeCheck && !ageVerified) {
      setError(t('ageError'))
      return
    }

    setError('')
    if (paymentMethod === 'Credit' && !customerName.trim()) {
      setError(t('creditCustomerRequired'))
      return
    }
    if (paymentMethod === 'Credit' && paidNow > total) {
      setError(t('partialPaymentTooHigh'))
      return
    }

    submittingRef.current = true
    setIsSubmitting(true)
    const user = JSON.parse(localStorage.getItem('minimart-pos-user') || '{}')
    const payload = {
      cashierId: user.id || 'unknown',
      cashierName: user.name || 'Cashier',
      items: cart.map((item) => ({ productId: item.product.id, quantity: item.quantity, saleUnit: item.saleUnit })),
      ageVerified: requiresAgeCheck ? ageVerified : true,
      paymentMethod,
      isCredit: paymentMethod === 'Credit',
      customerName: customerName.trim(),
      initialPaidAmount: paymentMethod === 'Credit' ? paidNow : undefined,
    }

    try {
      const sale = await runWithLoading(() => api.createSale(payload))
      onSuccess(sale)
      try { localStorage.removeItem(CHECKOUT_DRAFT_KEY) } catch { /* storage unavailable */ }
      onClose()
    } catch (err) {
      const message = err instanceof Error ? err.message : t('checkoutFailed')
      setError(message)
      onError?.(message)
    } finally {
      submittingRef.current = false
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-white shadow-xl">
        <div className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold">{t('checkout')}</h2>
            <button onClick={onClose} className="text-2xl text-gray-500 hover:text-gray-700" aria-label={t('close')}>×</button>
          </div>

          <div className="space-y-4">
            <div className="rounded-md bg-gray-50 p-4">
              <h3 className="mb-2 font-semibold">{t('items')}</h3>
              {cart.map(({ product, quantity, saleUnit }) => (
                <div key={`${product.id}-${saleUnit}`} className="mb-1 flex justify-between text-sm">
                  <span>{product.name} ({saleUnit === 'case' ? t('case') : saleUnit === 'pack' ? (product.saleType === 'pack' ? t('pack') : `${t('pack')} × ${product.unitsPerPack}`) : t('unit')}) × {quantity}</span>
                  <span>{formatCurrency(saleUnitPrice(product, saleUnit) * quantity)}</span>
                </div>
              ))}
              <div className="mt-2 flex justify-between border-t pt-2 font-bold">
                <span>{t('total')}</span>
                <span>{formatCurrency(total)}</span>
              </div>
            </div>

            {requiresAgeCheck && (
              <div className="rounded-md border border-yellow-200 bg-yellow-50 p-4">
                <label className="mb-2 block text-sm font-medium text-yellow-800">{t('ageVerified')}</label>
                <div className="flex gap-2">
                  <button onClick={() => setAgeVerified(true)} className={`flex-1 rounded-md border px-4 py-2 ${ageVerified ? 'border-primary bg-primary text-white' : 'border-gray-300 bg-white text-gray-700'}`}>{t('yes')}</button>
                  <button onClick={() => setAgeVerified(false)} className={`flex-1 rounded-md border px-4 py-2 ${!ageVerified ? 'border-red-600 bg-red-600 text-white' : 'border-gray-300 bg-white text-gray-700'}`}>{t('no')}</button>
                </div>
              </div>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">{t('paymentMethod')}</label>
              <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)} className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="Cash">{t('cash')}</option>
                <option value="MMQR Pay">{t('mobileWallet')}</option>
                <option value="Credit">{t('credit')}</option>
              </select>
            </div>

            {paymentMethod === 'Credit' && (
              <div className="space-y-3 rounded-md border border-amber-200 bg-amber-50 p-4">
                <label className="block text-sm font-medium text-gray-700">
                  {t('customerName')}
                  <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder={t('customerNamePlaceholder')} className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2" />
                </label>
                <label className="block text-sm font-medium text-gray-700">
                  {t('partialPayment')}
                  <input type="number" min="0" step="1" inputMode="decimal" value={initialPaidAmount} onChange={(event) => setInitialPaidAmount(event.target.value)} className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2" />
                </label>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span>{t('depositBalance')}</span><span className="font-semibold text-emerald-700">{depositLoading ? t('loading') : formatCurrency(depositBalance)}</span></div>
                  <div className="flex justify-between"><span>{t('depositApplied')}</span><span className="font-semibold text-emerald-700">{formatCurrency(depositApplied)}</span></div>
                  <div className="flex justify-between border-t border-amber-200 pt-1 font-bold"><span>{t('balanceDue')}</span><span className={balanceDue > 0 ? 'text-red-700' : 'text-emerald-700'}>{formatCurrency(balanceDue)}</span></div>
                </div>
                <p className="text-xs text-amber-800">{t('creditIncomeExclusion')}</p>
              </div>
            )}

            {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

            <button onClick={handleSubmit} disabled={isSubmitting} className="w-full rounded-md bg-primary px-4 py-3 font-medium text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
              {isSubmitting ? t('processing') : `${t('pay')} ${formatCurrency(paymentMethod === 'Credit' ? paidNow : total)}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

