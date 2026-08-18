import { useState } from 'react'
import type { Product } from '../lib/api'
import { formatCurrency } from '../lib/format'
import Icon from './Icon'
import { useLanguage } from '../contexts/LanguageContext'

interface CartProps {
  items: { product: Product; quantity: number; saleUnit: 'unit' | 'pack' }[]
  onUpdateQuantity: (productId: string, saleUnit: 'unit' | 'pack', delta: number) => void
  onRemove: (productId: string, saleUnit: 'unit' | 'pack') => void
  onCheckout: () => void
  requiresAgeCheck: boolean
}

export default function Cart({
  items,
  onUpdateQuantity,
  onRemove,
  onCheckout,
  requiresAgeCheck,
}: CartProps) {
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null)
  const { t } = useLanguage()

  const total = items.reduce(
    (sum, item) => sum + (item.saleUnit === 'pack' ? item.product.packPrice : item.product.price) * item.quantity,
    0
  )

  return (
    <div className="h-full flex flex-col">
      <h2 className="text-xl font-bold mb-4">{t('cart')} ({items.length})</h2>

      <div className="flex-1 overflow-y-auto space-y-3 mb-4">
        {items.length === 0 ? (
          <p className="text-gray-500 text-center py-8">{t('cartEmpty')}</p>
        ) : (
          items.map(({ product, quantity, saleUnit }) => {
            const lineId = `${product.id}-${saleUnit}`
            return (
            <div
              key={`${product.id}-${saleUnit}`}
              className="border border-gray-200 rounded-md p-3"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <p className="font-medium">{product.name}</p>
                  <p className="flex items-center gap-1 text-sm font-medium text-gray-500"><Icon name={saleUnit === 'pack' ? 'box' : 'bottle'} className="h-4 w-4" />{saleUnit === 'pack' ? (product.saleType === 'pack' ? t('pack') : `${t('pack')} (${product.unitsPerPack} ${t('unitCount')})`) : t('unit')}</p>
                  <p className="font-semibold text-primary mt-1">
                    {formatCurrency(saleUnit === 'pack' ? product.packPrice : product.price)}
                  </p>
                </div>
                {pendingRemoveId === lineId ? (
                  <div className="flex gap-1">
                    <button
                      onClick={() => {
                        onRemove(product.id, saleUnit)
                        setPendingRemoveId(null)
                      }}
                      className="text-xs bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700"
                    >
                      {t('remove')}
                    </button>
                    <button
                      onClick={() => setPendingRemoveId(null)}
                      className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded hover:bg-gray-300"
                    >
                      {t('cancel')}
                    </button>
                  </div>
                ) : (
                  <button
                      onClick={() => setPendingRemoveId(lineId)}
                    className="text-red-600 hover:text-red-800 text-lg font-bold leading-none"
                  >
                    ×
                  </button>
                )}
              </div>

              <div className="flex items-center justify-between mt-3">
                <div className="flex items-center gap-2">
                  <button
                      onClick={() => onUpdateQuantity(product.id, saleUnit, -1)}
                    className="w-8 h-8 rounded-md bg-gray-100 hover:bg-gray-200 flex items-center justify-center font-bold"
                  >
                    -
                  </button>
                  <span className="w-8 text-center font-medium">{quantity}</span>
                  <button
                    onClick={() => onUpdateQuantity(product.id, saleUnit, 1)}
                    disabled={quantity * (saleUnit === 'pack' && product.saleType !== 'pack' ? product.unitsPerPack : 1) >= product.stockQty}
                    className="w-8 h-8 rounded-md bg-gray-100 hover:bg-gray-200 flex items-center justify-center font-bold disabled:opacity-50"
                  >
                    +
                  </button>
                </div>
                <span className="font-semibold">
                  {formatCurrency((saleUnit === 'pack' ? product.packPrice : product.price) * quantity)}
                </span>
              </div>
            </div>
          )})
        )}
      </div>

      {requiresAgeCheck && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-md text-sm mb-4">
          {t('ageRequired')}
        </div>
      )}

      <div className="border-t pt-4">
        <div className="flex justify-between text-lg font-bold mb-4">
          <span>{t('total')}</span>
          <span>{formatCurrency(total)}</span>
        </div>
        <button
          onClick={onCheckout}
          disabled={items.length === 0}
          className="w-full bg-primary text-white py-3 px-4 rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
        >
          {t('checkout')}
        </button>
      </div>
    </div>
  )
}
