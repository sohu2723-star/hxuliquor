import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Cart from '../components/Cart'
import Checkout from '../components/Checkout'
import type { Product, Sale } from '../lib/api'
import { api, barcodeMatches, PRODUCT_GROUPS, productMatchesGroup, type ProductGroup } from '../lib/api'
import { formatCurrency } from '../lib/format'
import { downloadReceipt } from '../lib/receiptDownload'
import AppHeader from '../components/AppHeader'
import Scanner from '../components/Scanner'
import Icon from '../components/Icon'
import ReceiptLogo from '../components/ReceiptLogo'
import { useToast } from '../contexts/ToastContext'
import { useLanguage } from '../contexts/LanguageContext'
import { useActionLoading } from '../contexts/ActionLoadingContext'

const WELCOME_SESSION_KEY = 'hxu_show_welcome'
const POS_DRAFT_KEY = 'hxu-pos-draft'
type CartDraftItem = { productId: string; quantity: number; saleUnit: 'unit' | 'pack' }
type PosDraft = { cart?: CartDraftItem[]; searchQuery?: string; productGroup?: ProductGroup; categoryFilter?: string; showCheckout?: boolean }

const readPosDraft = (): PosDraft => {
  try { return JSON.parse(localStorage.getItem(POS_DRAFT_KEY) || '{}') as PosDraft } catch { return {} }
}

export default function POS() {
  const [products, setProducts] = useState<Product[]>([])
  const [cart, setCart] = useState<{ product: Product; quantity: number; saleUnit: 'unit' | 'pack' }[]>([])
  const [searchQuery, setSearchQuery] = useState(() => readPosDraft().searchQuery || '')
  const [productGroup, setProductGroup] = useState<ProductGroup>(() => readPosDraft().productGroup || 'all')
  const [categoryFilter, setCategoryFilter] = useState(() => readPosDraft().categoryFilter || '')
  const [showCheckout, setShowCheckout] = useState(() => readPosDraft().showCheckout === true)
  const [isLoading, setIsLoading] = useState(true)
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false)
  const [completedSale, setCompletedSale] = useState<Sale | null>(null)
  const [receiptSaving, setReceiptSaving] = useState(false)
  const [welcomeOpen, setWelcomeOpen] = useState(() => window.sessionStorage.getItem(WELCOME_SESSION_KEY) === '1')
  const lastHandledScan = useRef({ code: '', time: 0 })
  const productsRefreshing = useRef(false)
  const cartHydrated = useRef(false)
  const savedCartDraft = useRef(readPosDraft().cart || [])
  const { showToast } = useToast()
  const { t, language } = useLanguage()
  const { isLoading: isActionLoading, runWithLoading } = useActionLoading()

  useEffect(() => {
    if (!welcomeOpen) return
    window.sessionStorage.removeItem(WELCOME_SESSION_KEY)
    const timer = window.setTimeout(() => setWelcomeOpen(false), 2500)
    return () => window.clearTimeout(timer)
  }, [welcomeOpen])

  const loadProducts = useCallback(async (forceRefresh = false, quiet = false): Promise<boolean> => {
    if (productsRefreshing.current) return false
    productsRefreshing.current = true
    if (forceRefresh) {
      if (!quiet) setIsLoading(true)
      try {
        const all = await api.getProducts(true)
        setProducts((current) => JSON.stringify(current) === JSON.stringify(all) ? current : all)
        return true
      } catch (error) {
        if (!quiet) showToast(error instanceof Error ? error.message : t('productLoadError'), 'error')
        return false
      } finally {
        if (!quiet) setIsLoading(false)
        productsRefreshing.current = false
      }
    }
    try {
      const { products: all } = await api.getProductsStaleFirst((fresh) => setProducts(fresh))
      setProducts(all)
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('productLoadError'), 'error')
      return false
    } finally {
      setIsLoading(false)
      productsRefreshing.current = false
    }
    return true
  }, [showToast, t])

  useEffect(() => {
    void loadProducts()
    const refreshWhenReturning = () => {
      if (document.visibilityState === 'visible') void loadProducts(false, true)
    }
    document.addEventListener('visibilitychange', refreshWhenReturning)
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadProducts(false, true)
    }, 30000)
    return () => {
      document.removeEventListener('visibilitychange', refreshWhenReturning)
      window.clearInterval(timer)
    }
  }, [loadProducts])

  const lowStockProducts = useMemo(() => products.filter((product) => product.stockQty <= product.lowStockThreshold), [products])
  useEffect(() => {
    if (!products.length) return
    setCart((current) => {
      const source = cartHydrated.current ? current.map((item) => ({ ...item })) : savedCartDraft.current.map((item) => ({ product: products.find((product) => product.id === item.productId), quantity: item.quantity, saleUnit: item.saleUnit })).filter((item): item is { product: Product; quantity: number; saleUnit: 'unit' | 'pack' } => Boolean(item.product))
      cartHydrated.current = true
      savedCartDraft.current = []
      return source.map((item) => {
        const freshProduct = products.find((product) => product.id === item.product.id)
        if (!freshProduct) return null
        const unitsPerSale = item.saleUnit === 'pack' && freshProduct.saleType !== 'pack' ? Math.max(1, freshProduct.unitsPerPack) : 1
        const maxQuantity = Math.floor(freshProduct.stockQty / unitsPerSale)
        return maxQuantity > 0 ? { product: freshProduct, quantity: Math.min(item.quantity, maxQuantity), saleUnit: item.saleUnit } : null
      }).filter((item): item is { product: Product; quantity: number; saleUnit: 'unit' | 'pack' } => Boolean(item))
    })
  }, [products])

  useEffect(() => {
    try {
      localStorage.setItem(POS_DRAFT_KEY, JSON.stringify({
        cart: cart.map((item) => ({ productId: item.product.id, quantity: item.quantity, saleUnit: item.saleUnit })),
        searchQuery,
        productGroup,
        categoryFilter,
        showCheckout,
      }))
    } catch { /* storage unavailable */ }
  }, [cart, searchQuery, productGroup, categoryFilter, showCheckout])

  const addToCart = useCallback((product: Product, saleUnit: 'unit' | 'pack' = 'unit') => {
    const stockUnits = saleUnit === 'pack' && product.saleType !== 'pack' ? product.unitsPerPack : 1
    if (product.stockQty <= 0) {
      showToast(t('productStockOut', { name: product.name }), 'error')
      return
    }
    setCart((prev) => {
      const reservedStock = prev.filter((item) => item.product.id === product.id)
        .reduce((sum, item) => sum + item.quantity * (item.saleUnit === 'pack' && product.saleType !== 'pack' ? product.unitsPerPack : 1), 0)
      const existing = prev.find((item) => item.product.id === product.id && item.saleUnit === saleUnit)
      if (reservedStock + stockUnits > product.stockQty) {
        showToast(t('stockLow'), 'error')
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
    showToast(t('addedToCart', { name: product.name, unit: saleUnit === 'pack' ? t('pack') : t('unit') }), 'success')
  }, [showToast, t])

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
      showToast(t('scanProductNotFound', { code }), 'error')
    }
  }

  const handleSearch = (query: string) => setSearchQuery(query)

  const productCategories = useMemo(() => [...new Set(products.map((product) => product.category).filter(Boolean))].sort(), [products])
  const matchesCategoryFilter = useCallback((product: Product) => !categoryFilter || product.category === categoryFilter, [categoryFilter])
  const visibleProducts = useMemo(() => products.filter((product) => productMatchesGroup(product, productGroup) && matchesCategoryFilter(product)), [products, productGroup, matchesCategoryFilter])
  const filteredSearchResults = useMemo(() => {
    const normalized = searchQuery.trim().toLowerCase()
    if (normalized.length < 1) return []
    return products.filter((product) => {
      const searchable = [product.name, product.barcode, product.category, product.productColor, product.productSize].join(' ').toLowerCase()
      return searchable.includes(normalized) && productMatchesGroup(product, productGroup) && matchesCategoryFilter(product)
    })
  }, [products, searchQuery, productGroup, matchesCategoryFilter])

  const requiresAgeCheck = cart.some((item) => item.product.requiresAgeCheck)

  const handleProductRefresh = async () => {
    const success = await runWithLoading(() => loadProducts(true))
    if (success) showToast(`${t('refresh')} ${t('done')}`, 'success')
  }

  const saveReceiptArchive = async () => {
    if (!completedSale || receiptSaving) return false
    setReceiptSaving(true)
    try {
      await api.recordPrintedReceipt(completedSale)
      return true
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('receiptSaveError'), 'error')
      return false
    } finally {
      setReceiptSaving(false)
    }
  }

  const handlePrintReceipt = async () => {
    if (!completedSale || receiptSaving) return
    const saved = await saveReceiptArchive()
    if (!saved) return
    showToast(t('receiptSaved'), 'success')
    window.print()
  }

  const handleDownloadReceipt = async () => {
    if (!completedSale || receiptSaving) return
    const saved = await saveReceiptArchive()
    if (!saved) return
    downloadReceipt(completedSale, language)
    showToast(t('receiptDownloaded'), 'success')
  }

  const handleCheckoutSuccess = (sale: Sale) => {
    setCart([])
    setShowCheckout(false)
    setCompletedSale(sale)
    if (sale.id.startsWith('local-')) setProducts((current) => reduceSoldStock(current, sale))
    showToast(t('checkoutSuccess'), 'success')
    void loadProducts(false, true)
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
        {t('noImage')}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {welcomeOpen && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/35 p-4" role="dialog" aria-live="polite" aria-modal="true" aria-label={t('welcome')}>
        <div className="relative w-full max-w-sm rounded-3xl bg-white px-8 py-10 text-center shadow-2xl ring-1 ring-white/70">
          <button type="button" onClick={() => setWelcomeOpen(false)} className="absolute right-4 top-4 rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={t('close')}><svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" /></svg></button>
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><svg viewBox="0 0 24 24" className="h-12 w-12" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" strokeLinejoin="round" d="m8 12 2.5 2.5L16.5 9" /></svg></div>
          <h2 className="mt-5 text-2xl font-extrabold text-slate-950">{t('welcome')}</h2>
        </div>
      </div>}
      <AppHeader />
      {lowStockProducts.length > 0 && <div className="sticky top-0 z-30 border-b border-red-200 bg-red-50 px-4 py-2.5 text-red-900 shadow-sm" role="status" aria-live="polite">
        <div className="mx-auto flex max-w-5xl items-start gap-2 text-sm">
          <Icon name="warning" className="mt-0.5 h-5 w-5 shrink-0 text-red-700" />
          <div className="min-w-0 flex-1">
            <p className="font-bold">{t('warningCount', { count: lowStockProducts.length })}</p>
            <p className="mt-0.5 truncate text-xs text-red-800">{lowStockProducts.map((product) => product.name).join(' · ')}</p>
          </div>
        </div>
      </div>}
      <div className="flex flex-col lg:flex-row">
        <div className="flex-1 p-4 lg:p-6 space-y-5 max-w-5xl mx-auto w-full">

          <div className="surface-card p-4 sm:p-5">
            <h2 className="text-lg font-semibold">{t('scanProduct')}</h2>
            <Scanner onScan={handleScan} />
          </div>

          <div className="surface-card p-4 sm:p-5">
            <h2 className="text-lg font-semibold mb-3">{t('searchProduct')}</h2>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <input
                type="text"
                placeholder={t('searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="min-w-40 rounded-md border border-gray-300 px-3 py-2 font-semibold text-violet-700 focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="">{t('allCategories')}</option>
                {productCategories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </div>
            {filteredSearchResults.length > 0 && (
              <div className="mt-3 space-y-2 max-h-60 overflow-y-auto">
                {filteredSearchResults.map((product) => (
                  <button
                    key={product.id}
                    onClick={() => {
                      addToCart(product, product.saleType === 'pack' ? 'pack' : 'unit')
                      setSearchQuery('')
                    }}
                    className="w-full text-left p-3 border border-gray-200 rounded-md hover:bg-gray-50 flex justify-between items-center"
                  >
                    <div className="flex items-center gap-3">
                      <ProductImage url={product.imageUrl} name={product.name} />
                      <div>
                        <p className="font-bold">{product.name}</p>
                        <p className="text-sm font-semibold text-violet-700">{[product.category, product.productColor, product.productSize].filter(Boolean).join(' · ')}</p>
                      </div>
                    </div>
                    <span className="font-semibold text-primary">
                      {formatCurrency(product.price)}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {searchQuery.trim().length >= 1 && filteredSearchResults.length === 0 && (
              <p className="mt-3 text-sm text-gray-500">{t('noProductsFound')}</p>
            )}
          </div>

          <div className="surface-card p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h2 className="text-lg font-semibold">{t('products')} ({visibleProducts.length}/{products.length})</h2>
              <button onClick={() => void handleProductRefresh()} disabled={isLoading || isActionLoading} className="text-sm border border-gray-300 rounded px-3 py-1 disabled:opacity-50">
                {isLoading ? t('loading') : t('refresh')}
              </button>
            </div>
            {!isLoading && products.length > 0 && <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
              {PRODUCT_GROUPS.map((group) => {
                const count = products.filter((product) => productMatchesGroup(product, group.id)).length
                return <button key={group.id} type="button" onClick={() => setProductGroup(group.id)} className={`shrink-0 rounded-full border px-3 py-2 text-sm font-semibold ${productGroup === group.id ? 'border-primary bg-primary text-white' : 'border-slate-200 bg-white text-slate-700'}`}>{t(group.id === 'all' ? 'groupAll' : group.id === 'barcode' ? 'groupBarcode' : group.id === 'noBarcode' ? 'groupNoBarcode' : group.id === 'pack' ? 'groupPack' : 'groupBoth')} ({count})</button>
              })}
            </div>}
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
                <p className="text-gray-500 mb-4">{t('noProducts')}</p>
                  <button
                   onClick={() => void handleProductRefresh()}
                   disabled={isLoading || isActionLoading}
                   className="bg-primary text-white px-4 py-2 rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
                 >
                  {t('retry')}
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 max-h-[50vh] overflow-y-auto pr-1">
                {visibleProducts.map((product) => (
                  <div key={product.id} className={`product-card p-3 text-left flex flex-col shadow-sm ${product.stockQty <= 0 ? 'opacity-40 grayscale' : ''}`}>
                  <div className="text-left flex-1">
                    <div className="flex justify-center mb-2">
                      <ProductImage url={product.imageUrl} name={product.name} />
                    </div>
                    <p className="truncate font-bold">{product.name}</p>
                    <p className="text-sm font-semibold text-violet-700">{[product.category, product.productColor, product.productSize].filter(Boolean).join(' · ')}</p>
                    <div className={`mt-1 flex flex-col rounded-xl px-3 py-2 text-xs font-semibold ${product.stockQty <= product.lowStockThreshold ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>{product.saleType === 'both' ? <><span>• {t('fullPacks')} - {Math.floor(product.stockQty / Math.max(2, product.unitsPerPack || 2))} {t('pack')}</span><span>• {t('looseUnits')} - {product.stockQty % Math.max(2, product.unitsPerPack || 2)} {t('unitCount')}</span><span>• {t('totalUnitStock')} - {product.stockQty} {t('unitCount')}</span></> : <span>• {t('stock')} - {product.stockQty} {product.saleType === 'pack' ? t('packCount') : t('unitCount')}</span>}</div>
                  </div>
                  <div className="mt-3 grid gap-2">
                    {product.saleType !== 'pack' && <button onClick={() => addToCart(product, 'unit')} disabled={product.stockQty <= 0} className="w-full rounded-xl bg-primary disabled:cursor-not-allowed disabled:bg-slate-300 px-3 py-2.5 text-left text-white shadow-sm">
                      <span className="flex items-center gap-1 text-[11px] font-medium text-white/80"><Icon name="bottle" className="h-4 w-4" />{t('unitPriceLabel')}</span><strong className="block text-base">{formatCurrency(product.price)}</strong>
                    </button>}
                    {product.saleType !== 'unit' && (product.saleType === 'pack' || product.unitsPerPack > 1) && product.packPrice > 0 && <button onClick={() => addToCart(product, 'pack')} disabled={product.stockQty < (product.saleType === 'pack' ? 1 : product.unitsPerPack)} className="w-full rounded-xl border-2 border-violet-400 bg-violet-50 px-3 py-2.5 text-left text-violet-950 shadow-sm disabled:opacity-40">
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-violet-700"><Icon name="box" className="h-4 w-4" />{product.saleType === 'pack' ? t('packPriceLabel') : t('packPriceWithUnits', { count: product.unitsPerPack })}</span><strong className="block text-base">{formatCurrency(product.packPrice)}</strong>
                    </button>}
                  </div>
                  {!product.barcode && <span className="mt-2 text-center text-[11px] font-medium text-slate-500">{t('manualSale')}</span>}
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
                <h2 className="text-xl font-bold">{t('cart')} ({cart.length})</h2>
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
          onError={(message) => showToast(message, 'error')}
        />
      )}
      {completedSale && <div className="receipt-modal fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 print:static print:bg-white print:p-0">
        <div className="receipt-slip max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl print:max-h-none print:w-[80mm] print:overflow-visible print:rounded-none print:p-3 print:shadow-none">
          <div className="text-center">
            <ReceiptLogo className="mx-auto mb-2 h-16 w-16 print:h-12 print:w-12" />
            <h2 className="text-2xl font-extrabold tracking-tight print:text-lg">HXU Liquor</h2>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-700 print:text-[10px]">{t('saleReceipt')}</p>
          </div>
          <div className="my-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-600 print:my-2 print:rounded-none print:border-x-0 print:bg-white print:px-0">
            <p>{new Date(completedSale.createdAt).toLocaleString(language === 'my' ? 'my-MM' : 'en-GB', { timeZone: 'Asia/Yangon' })}</p>
            <p>{t('cashier')}: {completedSale.cashierName}</p>
            <p>{t('payment')}: {completedSale.paymentMethod === 'Cash' ? t('cash') : completedSale.paymentMethod === 'Card' ? t('card') : completedSale.paymentMethod === 'Mobile Wallet' ? t('mobileWallet') : t('credit')}</p>
            <p>{t('slipId')}: {formatSlipId(completedSale)}</p>
          </div>
          <div className="space-y-2">{completedSale.items.map((item) => <div key={item.id} className="flex justify-between gap-2 text-sm print:text-xs"><span>{item.productName} × {item.saleQuantity}</span><b>{formatCurrency(item.subtotal)}</b></div>)}</div>
          <div className="mt-4 border-t pt-3 print:mt-2 print:pt-2"><div className="flex justify-between text-lg font-bold print:text-sm"><span>{t('total')}</span><span>{formatCurrency(completedSale.totalAmount)}</span></div>{completedSale.isCredit && <p className="mt-2 rounded bg-amber-50 p-2 text-sm text-amber-800 print:text-xs">{t('credit')} · {completedSale.customerName} · {t('creditBalance')} {formatCurrency(completedSale.balanceDue)}</p>}</div>
          <p className="mt-4 text-center text-xs text-slate-500 print:mt-2">{t('thankYou')}</p>
          <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3 print:hidden"><button onClick={() => void handlePrintReceipt()} disabled={receiptSaving} className="rounded-xl border border-slate-200 px-4 py-3 font-semibold text-slate-800 shadow-sm disabled:opacity-60">{receiptSaving ? t('saving') : t('printSlip')}</button><button onClick={() => void handleDownloadReceipt()} disabled={receiptSaving} className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 font-semibold text-violet-800 shadow-sm disabled:opacity-60">{t('downloadReceipt')}</button><button onClick={() => setCompletedSale(null)} className="rounded-xl bg-primary px-4 py-3 font-semibold text-white shadow-sm">{t('done')}</button></div>
        </div>
      </div>}
    </div>
  )
}



function formatSlipId(sale: Sale) {
  const date = new Date(sale.createdAt)
  const pad = (value: number) => String(value).padStart(2, '0')
  if (Number.isNaN(date.getTime())) return String(sale.id || '').slice(-8).toUpperCase()
  return `HXU-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}


function reduceSoldStock(products: Product[], sale: Sale) {
  return products.map((product) => {
    const sold = sale.items.filter((item) => item.productId === product.id).reduce((sum, item) => sum + item.quantity, 0)
    return sold ? { ...product, stockQty: Math.max(0, product.stockQty - sold) } : product
  })
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
