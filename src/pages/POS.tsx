import { useState, useEffect, useCallback } from 'react'
import Scanner from '../components/Scanner'
import Cart from '../components/Cart'
import Checkout from '../components/Checkout'
import type { Product } from '../lib/api'
import { api } from '../lib/api'

export default function POS() {
  const [products, setProducts] = useState<Product[]>([])
  const [cart, setCart] = useState<{ product: Product; quantity: number }[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Product[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [showCheckout, setShowCheckout] = useState(false)

  useEffect(() => {
    loadProducts()
  }, [])

  const loadProducts = async () => {
    try {
      const all = await api.getProducts()
      setProducts(all)
    } catch {
      showToast('Failed to load products', 'error')
    }
  }

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const addToCart = useCallback((product: Product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id)
      if (existing) {
        if (existing.quantity >= product.stockQty) {
          showToast('Not enough stock', 'error')
          return prev
        }
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      }
      return [...prev, { product, quantity: 1 }]
    })
    showToast(`Added ${product.name}`, 'success')
  }, [showToast])

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId))
  }

  const updateQuantity = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.product.id === productId
            ? { ...item, quantity: item.quantity + delta }
            : item
        )
        .filter((item) => item.quantity > 0)
    )
  }

  const handleScan = (code: string) => {
    const product = products.find((p) => p.barcode === code)
    if (product) {
      addToCart(product)
    } else {
      showToast('Product not found', 'error')
    }
  }

  const handleSearch = async (query: string) => {
    setSearchQuery(query)
    if (query.length < 2) {
      setSearchResults([])
      return
    }
    setIsSearching(true)
    try {
      const results = await api.searchProducts(query)
      setSearchResults(results)
    } catch {
      showToast('Search failed', 'error')
    } finally {
      setIsSearching(false)
    }
  }

  const requiresAgeCheck = cart.some((item) => item.product.requiresAgeCheck)

  const handleCheckoutSuccess = () => {
    setCart([])
    setShowCheckout(false)
    loadProducts()
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {toast && (
        <div
          className={`fixed top-4 right-4 px-6 py-3 rounded-md shadow-lg z-50 ${
            toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
          } text-white font-medium`}
        >
          {toast.message}
        </div>
      )}

      <div className="flex flex-col lg:flex-row">
        <div className="flex-1 p-4 lg:p-6 space-y-6">
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-lg font-semibold mb-3">Scan Product</h2>
            <Scanner onScan={handleScan} />
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-lg font-semibold mb-3">Search Product</h2>
            <input
              type="text"
              placeholder="Search by name..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {isSearching && (
              <p className="mt-2 text-sm text-gray-500">Searching...</p>
            )}
            {searchResults.length > 0 && (
              <div className="mt-3 space-y-2 max-h-60 overflow-y-auto">
                {searchResults.map((product) => (
                  <button
                    key={product.id}
                    onClick={() => {
                      addToCart(product)
                      setSearchQuery('')
                      setSearchResults([])
                    }}
                    className="w-full text-left p-3 border border-gray-200 rounded-md hover:bg-gray-50 flex justify-between items-center"
                  >
                    <div>
                      <p className="font-medium">{product.name}</p>
                      <p className="text-sm text-gray-500">{product.category}</p>
                    </div>
                    <span className="font-semibold text-primary">
                      Ks {product.price.toFixed(2)}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {searchQuery.length >= 2 && !isSearching && searchResults.length === 0 && (
              <p className="mt-3 text-sm text-gray-500">No products found</p>
            )}
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-lg font-semibold mb-3">Products ({products.length})</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[50vh] overflow-y-auto">
              {products.map((product) => (
                <button
                  key={product.id}
                  onClick={() => addToCart(product)}
                  className="p-3 border border-gray-200 rounded-md hover:bg-gray-50 text-left"
                >
                  <p className="font-medium truncate">{product.name}</p>
                  <p className="text-sm text-gray-500">{product.category}</p>
                  <p className="font-semibold text-primary mt-1">
                    Ks {product.price.toFixed(2)}
                  </p>
                  <p className="text-xs text-gray-400">Stock: {product.stockQty}</p>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:w-96 bg-white shadow-lg p-4 lg:p-6">
          <Cart
            items={cart}
            onUpdateQuantity={updateQuantity}
            onRemove={removeFromCart}
            onCheckout={() => setShowCheckout(true)}
            requiresAgeCheck={requiresAgeCheck}
          />
        </div>
      </div>

      {showCheckout && (
        <Checkout
          cart={cart}
          requiresAgeCheck={requiresAgeCheck}
          onClose={() => setShowCheckout(false)}
          onSuccess={handleCheckoutSuccess}
        />
      )}
    </div>
  )
}
