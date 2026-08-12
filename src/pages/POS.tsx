import { useState, useEffect, useCallback } from 'react'
import Scanner from '../components/Scanner'
import Cart from '../components/Cart'
import Checkout from '../components/Checkout'
import type { Product } from '../lib/api'
import { api } from '../lib/api'
import { formatCurrency } from '../lib/format'
import AppHeader from '../components/AppHeader'

export default function POS() {
  const [products, setProducts] = useState<Product[]>([])
  const [cart, setCart] = useState<{ product: Product; quantity: number }[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Product[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [showCheckout, setShowCheckout] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false)

  useEffect(() => {
    loadProducts()
  }, [])

  const loadProducts = async (forceRefresh = false) => {
    setIsLoading(true)
    try {
      const all = await api.getProducts(forceRefresh)
      setProducts(all)
    } catch {
      showToast('Failed to load products', 'error')
    } finally {
      setIsLoading(false)
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
      showToast(`No product found for barcode: ${code}`, 'error')
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

  const ProductImage = ({ url, name }: { url: string; name: string }) => {
    if (url) {
      return (
        <img
          src={url}
          alt={name}
          className="h-10 w-10 object-cover rounded-md"
        />
      )
    }
    return (
      <div className="h-10 w-10 bg-gray-200 rounded-md flex items-center justify-center text-gray-400 text-xs">
        No img
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <AppHeader />
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
            <h2 className="text-lg font-semibold">Scan Product / Barcode ဖတ်ရန်</h2>
            <p className="text-sm text-gray-500 mb-3">Admin နှင့် Employee နှစ်ဦးလုံး အရောင်းအတွက် tablet နောက် camera ဖြင့် scan ဖတ်နိုင်သည်။</p>
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
                    <div className="flex items-center gap-3">
                      <ProductImage url={product.imageUrl} name={product.name} />
                      <div>
                        <p className="font-medium">{product.name}</p>
                        <p className="text-sm text-gray-500">{product.category}</p>
                      </div>
                    </div>
                    <span className="font-semibold text-primary">
                      {formatCurrency(product.price)}
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
            {isLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="p-3 border border-gray-200 rounded-md animate-pulse">
                    <div className="h-10 w-10 bg-gray-200 rounded-md mb-2" />
                    <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                    <div className="h-3 bg-gray-200 rounded w-1/2 mb-3" />
                    <div className="h-4 bg-gray-200 rounded w-1/3" />
                  </div>
                ))}
              </div>
            ) : products.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500 mb-4">No products available</p>
                <button
                  onClick={() => loadProducts(true)}
                  className="bg-primary text-white px-4 py-2 rounded-md hover:bg-primary/90 transition-colors"
                >
                  Retry
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[50vh] overflow-y-auto">
                {products.map((product) => (
                  <button
                    key={product.id}
                    onClick={() => addToCart(product)}
                    className="p-3 border border-gray-200 rounded-md hover:bg-gray-50 text-left"
                  >
                    <div className="flex justify-center mb-2">
                      <ProductImage url={product.imageUrl} name={product.name} />
                    </div>
                    <p className="font-medium truncate">{product.name}</p>
                    <p className="text-sm text-gray-500">{product.category}</p>
                    <p className="font-semibold text-primary mt-1">
                      {formatCurrency(product.price)}
                    </p>
                    <p className="text-xs text-gray-400">Stock: {product.stockQty}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Desktop sidebar */}
        <div className="hidden lg:block lg:w-96 bg-white shadow-lg p-4 lg:p-6">
          <Cart
            items={cart}
            onUpdateQuantity={updateQuantity}
            onRemove={removeFromCart}
            onCheckout={() => setShowCheckout(true)}
            requiresAgeCheck={requiresAgeCheck}
          />
        </div>

        {/* Mobile floating cart button */}
        <div className="lg:hidden fixed bottom-4 right-4 z-40">
          <button
            onClick={() => setIsMobileCartOpen(true)}
            className="bg-primary text-white p-4 rounded-full shadow-lg hover:bg-primary/90 transition-colors relative"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            {cart.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-600 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                {cart.reduce((sum, item) => sum + item.quantity, 0)}
              </span>
            )}
          </button>
        </div>

        {/* Mobile cart bottom sheet */}
        {isMobileCartOpen && (
          <div className="lg:hidden fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black bg-opacity-50" onClick={() => setIsMobileCartOpen(false)} />
            <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-xl shadow-xl max-h-[85vh] flex flex-col">
              <div className="p-4 border-b flex justify-between items-center">
                <h2 className="text-xl font-bold">Cart ({cart.length})</h2>
                <button
                  onClick={() => setIsMobileCartOpen(false)}
                  className="text-gray-500 hover:text-gray-700 text-2xl"
                >
                  ×
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <Cart
                  items={cart}
                  onUpdateQuantity={updateQuantity}
                  onRemove={removeFromCart}
                  onCheckout={() => {
                    setIsMobileCartOpen(false)
                    setShowCheckout(true)
                  }}
                  requiresAgeCheck={requiresAgeCheck}
                />
              </div>
            </div>
          </div>
        )}
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
