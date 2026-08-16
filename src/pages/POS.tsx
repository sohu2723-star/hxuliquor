import { useState, useEffect, useCallback, useRef } from 'react'
import Cart from '../components/Cart'
import Checkout from '../components/Checkout'
import type { Product, Sale } from '../lib/api'
import { api, barcodeMatches } from '../lib/api'
import { formatCurrency } from '../lib/format'
import AppHeader from '../components/AppHeader'
import Scanner from '../components/Scanner'

export default function POS() {
  const [products, setProducts] = useState<Product[]>([])
  const [cart, setCart] = useState<{ product: Product; quantity: number; saleUnit: 'unit' | 'pack' }[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Product[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [showCheckout, setShowCheckout] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false)
  const [completedSale, setCompletedSale] = useState<Sale | null>(null)
  const lastHandledScan = useRef({ code: '', time: 0 })
  const productsRefreshing = useRef(false)

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type })
    window.setTimeout(() => setToast(null), 3000)
  }, [])

  const loadProducts = useCallback(async (forceRefresh = false, quiet = false) => {
    if (productsRefreshing.current) return
    productsRefreshing.current = true
    if (forceRefresh) {
      if (!quiet) setIsLoading(true)
      try {
        const all = await api.getProducts(true)
        setProducts((current) => JSON.stringify(current) === JSON.stringify(all) ? current : all)
      } catch (error) {
        if (!quiet) showToast(error instanceof Error ? error.message : 'Product data ဆွဲမရပါ။', 'error')
      } finally {
        if (!quiet) setIsLoading(false)
        productsRefreshing.current = false
      }
      return
    }
    try {
      const { products: all } = await api.getProductsStaleFirst()
      setProducts(all)
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Product data ဆွဲမရပါ။', 'error')
    } finally {
      setIsLoading(false)
      productsRefreshing.current = false
    }
  }, [showToast])

  useEffect(() => {
    void loadProducts()
    const refreshWhenReturning = () => {
      if (document.visibilityState === 'visible') void loadProducts(true, true)
    }
    document.addEventListener('visibilitychange', refreshWhenReturning)
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadProducts(true, true)
    }, 30000)
    return () => {
      document.removeEventListener('visibilitychange', refreshWhenReturning)
      window.clearInterval(timer)
    }
  }, [loadProducts])

  const addToCart = useCallback((product: Product, saleUnit: 'unit' | 'pack' = 'unit') => {
    const stockUnits = saleUnit === 'pack' ? product.unitsPerPack : 1
    if (product.stockQty <= 0) {
      showToast(`${product.name} stock ကုန်နေပါသည်`, 'error')
      return
    }
    setCart((prev) => {
      const reservedStock = prev.filter((item) => item.product.id === product.id)
        .reduce((sum, item) => sum + item.quantity * (item.saleUnit === 'pack' ? product.unitsPerPack : 1), 0)
      const existing = prev.find((item) => item.product.id === product.id && item.saleUnit === saleUnit)
      if (reservedStock + stockUnits > product.stockQty) {
        showToast('ရောင်းရန် stock မလုံလောက်ပါ', 'error')
        return prev
      }
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id && item.saleUnit === saleUnit
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      }
      return [...prev, { product, quantity: 1, saleUnit }]
    })
    showToast(`✅ ${product.name} — ${saleUnit === 'pack' ? 'တစ်ပါကင်' : 'တစ်ဘူး/တစ်ခု'} Cart ထဲထည့်ပြီးပါပြီ`, 'success')
  }, [showToast])

  const removeFromCart = (productId: string, saleUnit: 'unit' | 'pack') => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId || item.saleUnit !== saleUnit))
  }

  const updateQuantity = (productId: string, saleUnit: 'unit' | 'pack', delta: number) => {
    setCart((prev) => {
      const target = prev.find((item) => item.product.id === productId && item.saleUnit === saleUnit)
      if (!target) return prev
      const nextQuantity = target.quantity + delta
      const reservedByOthers = prev.filter((item) => item.product.id === productId && item.saleUnit !== saleUnit)
        .reduce((sum, item) => sum + item.quantity * (item.saleUnit === 'pack' ? item.product.unitsPerPack : 1), 0)
      const requested = Math.max(0, nextQuantity) * (saleUnit === 'pack' ? target.product.unitsPerPack : 1)
      if (requested + reservedByOthers > target.product.stockQty) return prev
      return prev.map((item) => item === target ? { ...item, quantity: nextQuantity } : item).filter((item) => item.quantity > 0)
    })
  }

  const handleScan = (code: string) => {
    const now = Date.now()
    if (lastHandledScan.current.code === code && now - lastHandledScan.current.time < 3000) return
    lastHandledScan.current = { code, time: now }
    const product = products.find((p) => barcodeMatches(p.barcode, code))
    if (product) {
      playScanSound(true)
      addToCart(product, 'unit')
    } else {
      playScanSound(false)
      showToast(`Barcode ${code} ကို product စာရင်းတွင် မတွေ့ပါ။ Products ကို Refresh လုပ်ပြီး စစ်ပါ။`, 'error')
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
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Search failed', 'error')
    } finally {
      setIsSearching(false)
    }
  }

  const requiresAgeCheck = cart.some((item) => item.product.requiresAgeCheck)

  const handleCheckoutSuccess = (sale: Sale) => {
    setCart([])
    setShowCheckout(false)
    setCompletedSale(sale)
    showToast('✅ Checkout အောင်မြင်ပါသည်။ Slip ထွက်ပြီးပါပြီ။', 'success')
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
    <div className="min-h-screen bg-slate-50">
      <AppHeader />
      {(() => {
        const lowStock = products.filter((p) => p.stockQty <= p.lowStockThreshold)
        if (lowStock.length === 0) return null
        const visible = lowStock.slice(0, 5)
        const remaining = lowStock.length - visible.length
        return (
          <div className="bg-red-50 border-b border-red-200 text-red-800 px-4 py-2 text-sm font-medium">
            <p>⚠️ ကုန်တော့မည့်ပစ္စည်း {lowStock.length} မျိုးရှိသည်။ Admin Income dashboard တွင်ကြည့်ပါ။</p>
            <p className="mt-1 text-xs text-red-600">
              {visible.map((p) => p.name).join('၊ ')}
              {remaining > 0 && ` နှင့် အခြား ${remaining} မျိုး`}
            </p>
          </div>
        )
      })()}
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
        <div className="flex-1 p-4 lg:p-6 space-y-5 max-w-5xl mx-auto w-full">
          <div className="surface-card p-4 sm:p-5">
            <h2 className="text-lg font-semibold">Scan Product / Barcode ဖတ်ရန်</h2>
            <p className="text-sm text-gray-500 mb-3">Admin နှင့် Employee နှစ်ဦးလုံး အရောင်းအတွက် tablet နောက် camera ဖြင့် scan ဖတ်နိုင်သည်။</p>
            <Scanner onScan={handleScan} />
          </div>

          <div className="surface-card p-4 sm:p-5">
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
                      addToCart(product, 'unit')
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

          <div className="surface-card p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h2 className="text-lg font-semibold">Products ({products.length})</h2>
              <button onClick={() => void loadProducts(true)} disabled={isLoading} className="text-sm border border-gray-300 rounded px-3 py-1 disabled:opacity-50">
                {isLoading ? 'Loading...' : 'Refresh'}
              </button>
            </div>
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
                  <div key={product.id} className="product-card p-3 text-left flex flex-col">
                  <div className="text-left flex-1">
                    <div className="flex justify-center mb-2">
                      <ProductImage url={product.imageUrl} name={product.name} />
                    </div>
                    <p className="font-medium truncate">{product.name}</p>
                    <p className="text-sm text-gray-500">{product.category}</p>
                    <p className="text-xs text-gray-400">Stock: {product.stockQty}</p>
                  </div>
                  <div className="mt-3 grid gap-2">
                    <button onClick={() => addToCart(product, 'unit')} className="w-full rounded-xl bg-primary px-3 py-2.5 text-left text-white shadow-sm">
                      <span className="block text-[11px] font-medium text-white/80">🍾 တစ်ဘူး / တစ်ခု ဈေး</span><strong className="block text-base">{formatCurrency(product.price)}</strong>
                    </button>
                    {product.unitsPerPack > 1 && product.packPrice > 0 && <button onClick={() => addToCart(product, 'pack')} disabled={product.stockQty < product.unitsPerPack} className="w-full rounded-xl border-2 border-amber-400 bg-amber-50 px-3 py-2.5 text-left text-amber-950 shadow-sm disabled:opacity-40">
                      <span className="block text-[11px] font-semibold text-amber-700">📦 တစ်ပါကင် ({product.unitsPerPack} ခု) ဈေး</span><strong className="block text-base">{formatCurrency(product.packPrice)}</strong>
                    </button>}
                  </div>
                  {!product.barcode && <span className="mt-2 text-center text-[11px] font-medium text-slate-500">Manual sale · Barcode မရှိ</span>}
                  </div>
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
      {completedSale && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 print:static print:bg-white print:p-0">
        <div className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl print:max-h-none print:shadow-none">
          <div className="text-center"><h2 className="text-xl font-bold">HXU Liquor POS</h2><p className="text-sm text-slate-500">SALE RECEIPT</p></div>
          <div className="my-4 border-y py-3 text-xs text-slate-600"><p>{new Date(completedSale.createdAt).toLocaleString('en-GB', { timeZone: 'Asia/Yangon' })}</p><p>Cashier: {completedSale.cashierName} · {completedSale.cashierEmail}</p><p>Slip: {completedSale.id}</p></div>
          <div className="space-y-2">{completedSale.items.map((item) => <div key={item.id} className="flex justify-between gap-2 text-sm"><span>{item.productName} × {item.saleQuantity}</span><b>{formatCurrency(item.subtotal)}</b></div>)}</div>
          <div className="mt-4 border-t pt-3"><div className="flex justify-between text-lg font-bold"><span>Total</span><span>{formatCurrency(completedSale.totalAmount)}</span></div>{completedSale.isCredit && <p className="mt-2 rounded bg-amber-50 p-2 text-sm text-amber-800">အကြွေး · {completedSale.customerName} · ကျန်ငွေ {formatCurrency(completedSale.balanceDue)}</p>}</div>
          <div className="mt-5 grid grid-cols-2 gap-2 print:hidden"><button onClick={() => window.print()} className="rounded-lg border px-4 py-2 font-medium">Print Slip</button><button onClick={() => setCompletedSale(null)} className="rounded-lg bg-primary px-4 py-2 font-medium text-white">ပြီးပါပြီ</button></div>
        </div>
      </div>}
    </div>
  )
}

function playScanSound(success: boolean) {
  try {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return
    const context = new AudioContextClass()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.frequency.value = success ? 1050 : 240
    gain.gain.setValueAtTime(.16, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + (success ? .1 : .25))
    oscillator.connect(gain); gain.connect(context.destination)
    oscillator.start(); oscillator.stop(context.currentTime + (success ? .1 : .25))
    oscillator.onended = () => void context.close()
  } catch { /* sound is optional when the browser blocks audio */ }
}
