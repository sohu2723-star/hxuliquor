import { useState } from 'react'
import { api } from '../lib/api'
import type { Product, Sale } from '../lib/api'
import { formatCurrency } from '../lib/format'

interface CheckoutProps {
  cart: { product: Product; quantity: number; saleUnit: 'unit' | 'pack' }[]
  requiresAgeCheck: boolean
  onClose: () => void
  onSuccess: (sale: Sale) => void
}

type PaymentMethod = 'Cash' | 'Card' | 'Mobile Wallet' | 'Credit'

export default function Checkout({ cart, requiresAgeCheck, onClose, onSuccess }: CheckoutProps) {
  const [ageVerified, setAgeVerified] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [customerName, setCustomerName] = useState('')

  const total = cart.reduce(
    (sum, item) => sum + (item.saleUnit === 'pack' ? item.product.packPrice : item.product.price) * item.quantity,
    0
  )

  const handleSubmit = async () => {
    if (requiresAgeCheck && !ageVerified) {
      setError('Age verification is required')
      return
    }

    setIsSubmitting(true)
    setError('')

    try {
      const user = JSON.parse(localStorage.getItem('minimart-pos-user') || '{}')
      if (paymentMethod === 'Credit' && !customerName.trim()) {
        setError('အကြွေးရောင်းရန် Customer Name ထည့်ပါ။')
        return
      }
      const sale = await api.createSale({
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
      })
      onSuccess(sale)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">Checkout</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-2xl"
            >
              ×
            </button>
          </div>

          <div className="space-y-4">
            <div className="bg-gray-50 p-4 rounded-md">
              <h3 className="font-semibold mb-2">Items</h3>
              {cart.map(({ product, quantity, saleUnit }) => (
                <div key={`${product.id}-${saleUnit}`} className="flex justify-between text-sm mb-1">
                  <span>
                    {product.name} ({saleUnit === 'pack' ? `ပါကင် × ${product.unitsPerPack}` : 'ဘူး/ခု'}) × {quantity}
                  </span>
                  <span>{formatCurrency((saleUnit === 'pack' ? product.packPrice : product.price) * quantity)}</span>
                </div>
              ))}
              <div className="border-t mt-2 pt-2 flex justify-between font-bold">
                <span>Total</span>
                <span>{formatCurrency(total)}</span>
              </div>
            </div>

            {requiresAgeCheck && (
              <div className="border border-yellow-200 bg-yellow-50 p-4 rounded-md">
                <label className="block text-sm font-medium text-yellow-800 mb-2">
                  Age Verified?
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
                    Yes
                  </button>
                  <button
                    onClick={() => setAgeVerified(false)}
                    className={`flex-1 py-2 px-4 rounded-md border ${
                      !ageVerified
                        ? 'bg-red-600 text-white border-red-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    No
                  </button>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Payment Method
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="Cash">Cash</option>
                <option value="Card">Card</option>
                <option value="Mobile Wallet">Mobile Wallet</option>
                <option value="Credit">အကြွေး</option>
              </select>
            </div>
            {paymentMethod === 'Credit' && <label className="block text-sm font-medium text-gray-700">Customer Name
              <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="အကြွေးယူသူအမည်" className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
              <span className="mt-1 block text-xs text-amber-700">အကြွေးမဆပ်မချင်း Daily / Monthly income ထဲ မပေါင်းပါ။</span>
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
              {isSubmitting ? 'Processing...' : `Pay ${formatCurrency(total)}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
