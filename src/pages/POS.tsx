import { useState, useEffect, useCallback, useRef } from 'react'
import Cart from '../components/Cart'
import Checkout from '../components/Checkout'
import type { Product, Sale } from '../lib/api'
import { api, barcodeMatches } from '../lib/api'
import { formatCurrency } from '../lib/format'
import AppHeader from '../components/AppHeader'
import Scanner from '../components/Scanner'
import Icon from '../components/Icon'
import ReceiptLogo from '../components/ReceiptLogo'
import AppToast, { type ToastMessage } from '../components/AppToast'

export default function POS() {
  const [products, setProducts] = useState<Product[]>([])
  const [cart, setCart] = useState<{ product: Product; quantity: number; saleUnit: 'unit' | 'pack' }[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Product[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const [showCheckout, setShowCheckout] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false)
  const [completedSale, setCompletedSale] = useState<Sale | null>(null)
  const lastHandledScan = useRef({ code: '', time: 0 })
  const productsRefreshing = useRef(false)

  const showToast = useCallback((message: string, type: ToastMessage['type']) => {
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
    const stockUnits = saleUnit === 'pack' && product.saleType !== 'pack' ? product.unitsPerPack : 1
    if (product.stockQty <= 0) {
      showToast(`${product.name} stock ကုန်နေပါသည်`, 'error')
      return
    }
    setCart((prev) => {
      const reservedStock = prev.filter((item) => item.product.id === product.id)
        .reduce((sum, item) => sum + item.quantity * (item.saleUnit === 'pack' && product.saleType !== 'pack' ? product.unitsPerPack : 1), 0)
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
    showToast(`${product.name} — ${saleUnit === 'pack' ? 'တစ်ပါကင်' : 'တစ်ဘူး/တစ်ခု'} Cart ထဲထည့်ပြီးပါပြီ`, 'success')
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
        .reduce((sum, item) => sum + item.quantity * (item.saleUnit === 'pack' && item.product.saleType !== 'pack' ? item.product.unitsPerPack : 1), 0)
      const requested = Math.max(0, nextQuantity) * (saleUnit === 'pack' && target.product.saleType !== 'pack' ? target.product.unitsPerPack : 1)
      if (requested + reservedByOthers > target.product.stockQty) return prev
      return prev.map((item) => item === target ? { ...item, quantity: nextQuantity } : item).filter((item) => item.quantity > 0)
    })
  }

  const handleScan = (code: string) => {
    const now = Date.now()
    if (lastHandledScan.current.code === code && now - lastHandledScan.current.time < 3000) return
    lastHandledScan.current = { code, time: now }
    const product = products.find((p) => barcodeMatches(p.barcode, code)) || findProductByVisualFallback(products, code)
    if (product) {
      playScanSound(true)
      addToCart(product, product.saleType === 'pack' ? 'pack' : 'unit')
    } else {
      playScanSound(false)
      showToast(`Code/Text ${code} ကို product စာရင်းတွင် မတွေ့ပါ။ Product name/color/size သို့မဟုတ် QR code ကို စစ်ပါ။`, 'error')
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
      <AppToast toast={toast} />

      <div className="flex flex-col lg:flex-row">
        <div className="flex-1 p-4 lg:p-6 space-y-5 max-w-5xl mx-auto w-full">
          <section className="rounded-3xl bg-gradient-to-br from-amber-900 via-primary to-amber-700 p-5 text-white shadow-lg">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-amber-100">Fast Sale</p>
            <h1 className="mt-2 text-2xl font-extrabold tracking-tight">သန့်ရှင်းလွယ်ကူသော HXU Liquor အရောင်းစာမျက်နှာ</h1>
            <p className="mt-2 text-sm text-amber-50/90">Scan, search, cart စနစ်များကို အပိုရှုပ်ထွေးမှုမရှိဘဲ တစ်နေရာတည်းတွင်အသုံးပြုနိုင်သည်။</p>
          </section>

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
                      addToCart(product, product.saleType === 'pack' ? 'pack' : 'unit')
                      setSearchQuery('')
                      setSearchResults([])
                    }}
                    className="w-full text-left p-3 border border-gray-200 rounded-md hover:bg-gray-50 flex justify-between items-center"
                  >
                    <div className="flex items-center gap-3">
                      <ProductImage url={product.imageUrl} name={product.name} />
                      <div>
                        <p className="font-medium">{product.name}</p>
                        <p className="text-sm text-gray-500">{[product.category, product.productColor, product.productSize].filter(Boolean).join(' · ')}</p>
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
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 max-h-[50vh] overflow-y-auto pr-1">
                {products.map((product) => (
                  <div key={product.id} className="product-card p-3 text-left flex flex-col shadow-sm">
                  <div className="text-left flex-1">
                    <div className="flex justify-center mb-2">
                      <ProductImage url={product.imageUrl} name={product.name} />
                    </div>
                    <p className="font-medium truncate">{product.name}</p>
                    <p className="text-sm text-gray-500">{[product.category, product.productColor, product.productSize].filter(Boolean).join(' · ')}</p>
                    <p className={`mt-1 inline-flex rounded-full px-2 py-1 text-xs font-semibold ${product.saleType === 'pack' ? 'bg-violet-100 text-violet-800' : 'bg-slate-100 text-slate-700'}`}>Stock: {product.stockQty} {product.saleType === 'pack' ? 'ပါကင်' : 'ခု/ဘူး'}</p>
                  </div>
                  <div className="mt-3 grid gap-2">
                    {product.saleType !== 'pack' && <button onClick={() => addToCart(product, 'unit')} className="w-full rounded-xl bg-primary px-3 py-2.5 text-left text-white shadow-sm">
                      <span className="flex items-center gap-1 text-[11px] font-medium text-white/80"><Icon name="bottle" className="h-4 w-4" />တစ်ဘူး / တစ်ခု ဈေး</span><strong className="block text-base">{formatCurrency(product.price)}</strong>
                    </button>}
                    {product.saleType !== 'unit' && product.unitsPerPack > 1 && product.packPrice > 0 && <button onClick={() => addToCart(product, 'pack')} disabled={product.stockQty < (product.saleType === 'pack' ? 1 : product.unitsPerPack)} className="w-full rounded-xl border-2 border-violet-400 bg-violet-50 px-3 py-2.5 text-left text-violet-950 shadow-sm disabled:opacity-40">
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-violet-700"><Icon name="box" className="h-4 w-4" />တစ်ပါကင် ({product.unitsPerPack} ခု) ဈေး</span><strong className="block text-base">{formatCurrency(product.packPrice)}</strong>
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
      {completedSale && <div className="receipt-modal fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 print:static print:bg-white print:p-0">
        <div className="receipt-slip max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl print:max-h-none print:w-[80mm] print:overflow-visible print:rounded-none print:p-3 print:shadow-none">
          <div className="text-center">
            <ReceiptLogo className="mx-auto mb-2 h-16 w-16 print:h-12 print:w-12" />
            <h2 className="text-2xl font-extrabold tracking-tight print:text-lg">HXU Liquor</h2>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-700 print:text-[10px]">Sale Receipt</p>
          </div>
          <div className="my-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-600 print:my-2 print:rounded-none print:border-x-0 print:bg-white print:px-0">
            <p>{new Date(completedSale.createdAt).toLocaleString('en-GB', { timeZone: 'Asia/Yangon' })}</p>
            <p>Cashier: {completedSale.cashierName}</p>
            <p>Payment: {completedSale.paymentMethod}</p>
            <p>Slip: {completedSale.id}</p>
          </div>
          <div className="space-y-2">{completedSale.items.map((item) => <div key={item.id} className="flex justify-between gap-2 text-sm print:text-xs"><span>{item.productName} × {item.saleQuantity}</span><b>{formatCurrency(item.subtotal)}</b></div>)}</div>
          <div className="mt-4 border-t pt-3 print:mt-2 print:pt-2"><div className="flex justify-between text-lg font-bold print:text-sm"><span>Total</span><span>{formatCurrency(completedSale.totalAmount)}</span></div>{completedSale.isCredit && <p className="mt-2 rounded bg-amber-50 p-2 text-sm text-amber-800 print:text-xs">အကြွေး · {completedSale.customerName} · ကျန်ငွေ {formatCurrency(completedSale.balanceDue)}</p>}</div>
          <p className="mt-4 text-center text-xs text-slate-500 print:mt-2">Thank you for shopping with HXU Liquor</p>
          <div className="mt-5 grid grid-cols-2 gap-2 print:hidden"><button onClick={() => window.print()} className="rounded-xl border border-slate-200 px-4 py-3 font-semibold text-slate-800 shadow-sm">Print Slip</button><button onClick={() => setCompletedSale(null)} className="rounded-xl bg-primary px-4 py-3 font-semibold text-white shadow-sm">ပြီးပါပြီ</button></div>
        </div>
      </div>}
    </div>
  )
}


function findProductByVisualFallback(products: Product[], scannedValue: string) {
  const scanned = normalizeVisualText(scannedValue)
  if (!scanned) return undefined
  return products.find((product) => {
    const tokens = [product.name, product.productColor, product.productSize, product.category]
      .map(normalizeVisualText)
      .filter(Boolean)
    if (!tokens.length) return false
    const strongTokens = tokens.filter((token) => token.length >= 2)
    return strongTokens.every((token) => scanned.includes(token)) || scanned.includes(tokens.join(''))
  })
}

function normalizeVisualText(value: string) {
  return String(value || '').toLowerCase().replace(/[|:;,_\-\s]+/g, '')
}

function playScanSound(success: boolean) {
  try {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return
    const context = new AudioContextClass()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.frequency.value = success ? 1050 : 240
    gain.gain.setValueAtTime(success ? .55 : .45, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + (success ? .22 : .35))
    oscillator.connect(gain); gain.connect(context.destination)
    oscillator.start(); oscillator.stop(context.currentTime + (success ? .22 : .35))
    oscillator.onended = () => void context.close()
  } catch { /* sound is optional when the browser blocks audio */ }
}
