import type { Product } from '../lib/api'

interface CartProps {
  items: { product: Product; quantity: number }[]
  onUpdateQuantity: (productId: string, delta: number) => void
  onRemove: (productId: string) => void
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
  const total = items.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  )

  return (
    <div className="h-full flex flex-col">
      <h2 className="text-xl font-bold mb-4">Cart ({items.length})</h2>

      <div className="flex-1 overflow-y-auto space-y-3 mb-4">
        {items.length === 0 ? (
          <p className="text-gray-500 text-center py-8">Cart is empty</p>
        ) : (
          items.map(({ product, quantity }) => (
            <div
              key={product.id}
              className="border border-gray-200 rounded-md p-3"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <p className="font-medium">{product.name}</p>
                  <p className="text-sm text-gray-500">{product.category}</p>
                  <p className="font-semibold text-primary mt-1">
                    Ks {product.price.toFixed(2)}
                  </p>
                </div>
                <button
                  onClick={() => onRemove(product.id)}
                  className="text-red-600 hover:text-red-800 text-lg font-bold leading-none"
                >
                  ×
                </button>
              </div>

              <div className="flex items-center justify-between mt-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onUpdateQuantity(product.id, -1)}
                    className="w-8 h-8 rounded-md bg-gray-100 hover:bg-gray-200 flex items-center justify-center font-bold"
                  >
                    -
                  </button>
                  <span className="w-8 text-center font-medium">{quantity}</span>
                  <button
                    onClick={() => onUpdateQuantity(product.id, 1)}
                    disabled={quantity >= product.stockQty}
                    className="w-8 h-8 rounded-md bg-gray-100 hover:bg-gray-200 flex items-center justify-center font-bold disabled:opacity-50"
                  >
                    +
                  </button>
                </div>
                <span className="font-semibold">
                  Ks {(product.price * quantity).toFixed(2)}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {requiresAgeCheck && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-md text-sm mb-4">
          Age verification required for restricted items
        </div>
      )}

      <div className="border-t pt-4">
        <div className="flex justify-between text-lg font-bold mb-4">
          <span>Total</span>
          <span>Ks {total.toFixed(2)}</span>
        </div>
        <button
          onClick={onCheckout}
          disabled={items.length === 0 || requiresAgeCheck}
          className="w-full bg-green-600 text-white py-3 px-4 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
        >
          Checkout
        </button>
      </div>
    </div>
  )
}
