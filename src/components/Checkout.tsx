import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { Product, Sale } from '../lib/api'
import { formatCurrency } from '../lib/format'
import { useActionLoading } from '../contexts/ActionLoadingContext'
import { useLanguage } from '../contexts/LanguageContext'

interface CheckoutProps {
  cart: { product: Product; quantity: number; saleUnit: 'unit' | 'pack' }[]
  requiresAgeCheck: boolean
  onClose: () => void
  onSuccess: (sale: Sale) => void
  onError?: (message: string) => void
}

type PaymentMethod = 'Cash' | 'Card' | 'Mobile Wallet' | 'Credit'

const CHECKOUT_DRAFT_KEY = 'hxu-checkout-draft'

export default function Checkout({ cart, requiresAgeCheck, onClose, onSuccess, onError }: CheckoutProps) {
  const [ageVerified, setAgeVerified] = useState(() => {
    try { return JSON.parse(localStorage.getItem(CHECKOUT_DRAFT_KEY) || 'null')?.ageVerified === true } catch { return false }
  })
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(() => {
    try {
      const value = JSON.parse(localStorage.getItem(CHECKOUT_DRAFT_KEY) || 'null')?.paymentMethod
      return value === 'Card' || value === 'Mobile Wallet' || value === 'Credit' ? value : 'Cash'
    } catch { return 'Cash' }
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [customerName, setCustomerName] = useState(() => {
    try { return String(JSON.parse(localStorage.getItem(CHECKOUT_DRAFT_KEY) || 'null')?.customerName || '') } catch { return '' }
  })
  const { runWithLoading } = useActionLoading()
  const { t } = useLanguage()

  useEffect(() => {
    try { localStorage.setItem(CHECKOUT_DRAFT_KEY, JSON.stringify({ ageVerified, paymentMethod, customerName })) } catch { /* storage unavailable */ }
  }, [ageVerified, paymentMethod, customerName])

  const total = cart.reduce(
    (sum, item) => sum + (item.saleUnit === 'pack' ? item.product.packPrice : item.product.price) * item.quantity,
    0
  )

  const handleSubmit = async () => {
    if (requiresAgeCheck && !ageVerified) {
      setError(t('ageError'))
      return
    }

    setIsSubmitting(true)
    setError('')

    const user = JSON.parse(localStorage.getItem('minimart-pos-user') || '{}')
    if (paymentMethod === 'Credit' && !customerName.trim()) {
      setError(t('creditCustomerRequired'))
      setIsSubmitting(false)
      return
    }

    const payload = {
      cashierId: user.id || 'unknown',
      cashierName: user.name || 'Cashier',
      items: cart.map((item) => ({
        productId: item.product.id,
        quantity: item.quantity,
        saleUnit: item.saleUnit,
      })),
      ageVerified: requiresAgeCheck ? ageVerified : true,
      paymentMethod,
      isCredit: paymentMethod === 'Credit',
      customerName: customerName.trim(),
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
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">{t('checkout')}</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-2xl"
            >
              ×
            </button>
          </div>

          <div className="space-y-4">
            <div className="bg-gray-50 p-4 rounded-md">
              <h3 className="font-semibold mb-2">{t('items')}</h3>
              {cart.map(({ product, quantity, saleUnit }) => (
                <div key={`${product.id}-${saleUnit}`} className="flex justify-between text-sm mb-1">
                  <span>
                    {product.name} ({saleUnit === 'pack' ? (product.saleType === 'pack' ? t('pack') : `${t('pack')} × ${product.unitsPerPack}`) : t('unit')}) × {quantity}
                  </span>
                  <span>{formatCurrency((saleUnit === 'pack' ? product.packPrice : product.price) * quantity)}</span>
                </div>
              ))}
              <div className="border-t mt-2 pt-2 flex justify-between font-bold">
                <span>{t('total')}</span>
                <span>{formatCurrency(total)}</span>
              </div>
            </div>

            {requiresAgeCheck && (
              <div className="border border-yellow-200 bg-yellow-50 p-4 rounded-md">
                <label className="block text-sm font-medium text-yellow-800 mb-2">
                  {t('ageVerified')}
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setAgeVerified(true)}
                    className={`flex-1 py-2 px-4 rounded-md border ${
                      ageVerified
                        ? 'bg-primary text-white border-primary'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {t('yes')}
                  </button>
                  <button
                    onClick={() => setAgeVerified(false)}
                    className={`flex-1 py-2 px-4 rounded-md border ${
                      !ageVerified
                        ? 'bg-red-600 text-white border-red-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {t('no')}
                  </button>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('paymentMethod')}
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="Cash">{t('cash')}</option>
                <option value="Card">{t('card')}</option>
                <option value="Mobile Wallet">{t('mobileWallet')}</option>
                <option value="Credit">{t('credit')}</option>
              </select>
            </div>
            {paymentMethod === 'Credit' && <label className="block text-sm font-medium text-gray-700">{t('customerName')}
              <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder={t('customerNamePlaceholder')} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
              <span className="mt-1 block text-xs text-amber-700">{t('creditIncomeExclusion')}</span>
            </label>}

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
                {error}
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="w-full bg-primary text-white py-3 px-4 rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {isSubmitting ? t('processing') : `${t('pay')} ${formatCurrency(total)}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

