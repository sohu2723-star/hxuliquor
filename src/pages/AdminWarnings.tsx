import { useCallback, useEffect, useMemo, useState } from 'react'
import AppHeader from '../components/AppHeader'
import Icon from '../components/Icon'
import { api, isProductLowStock, productMatchesGroup, type Product, type ProductGroup } from '../lib/api'
import { useLanguage } from '../contexts/LanguageContext'
import { useToast } from '../contexts/ToastContext'
import { useActionLoading } from '../contexts/ActionLoadingContext'

export default function AdminWarnings() {
  const { t } = useLanguage()
  const { showToast } = useToast()
  const { isLoading: isActionLoading, runWithLoading } = useActionLoading()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [productGroup, setProductGroup] = useState<ProductGroup>('all')

  const load = useCallback(async (quiet = false): Promise<boolean> => {
    if (!quiet) setLoading(true)
    try {
      const freshProducts = await api.getProducts(true)
      setProducts(freshProducts)
      setError('')
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : t('lowStockLoadError'))
      return false
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [t])

  const handleRefresh = async () => {
    const success = await runWithLoading(() => load())
    if (success) showToast(`${t('refresh')} ${t('done')}`, 'success')
  }

  useEffect(() => {
    void load()
    const refresh = () => { if (document.visibilityState === 'visible') void load(true) }
    document.addEventListener('visibilitychange', refresh)
    const timer = window.setInterval(refresh, 60000)
    return () => { document.removeEventListener('visibilitychange', refresh); window.clearInterval(timer) }
  }, [load])

  const lowStock = useMemo(() => products.filter(isProductLowStock), [products])
  const categories = useMemo(() => [...new Set(lowStock.map((product) => product.category).filter(Boolean))].sort(), [lowStock])
  const filteredLowStock = useMemo(() => {
    const normalized = searchQuery.trim().toLowerCase()
    return lowStock.filter((product) => {
      const searchable = [product.name, product.barcode, product.category, product.productColor, product.productSize].join(' ').toLowerCase()
      return (!normalized || searchable.includes(normalized)) && (!categoryFilter || product.category === categoryFilter) && productMatchesGroup(product, productGroup)
    })
  }, [lowStock, searchQuery, categoryFilter, productGroup])

  return <div className="min-h-screen bg-slate-50">
    <AppHeader />
    <main className="mx-auto max-w-5xl p-4 lg:p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-red-700"><Icon name="warning" className="h-7 w-7" />{t('warningPage')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('warningCount', { count: lowStock.length })}</p>
        </div>
        <button type="button" onClick={() => void handleRefresh()} disabled={loading || isActionLoading} className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 disabled:opacity-60"><Icon name="refresh" className="mr-1 inline h-4 w-4" />{t('refresh')}</button>
      </div>
      {error && <div className="mb-4 flex items-center gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700"><Icon name="warning" className="h-5 w-5 shrink-0" />{error}</div>}
      <div className="mb-4 space-y-3">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {(['all', 'unit', 'both'] as ProductGroup[]).map((group) => {
            const count = lowStock.filter((product) => productMatchesGroup(product, group)).length
            return <button key={group} type="button" onClick={() => setProductGroup(group)} className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold ${productGroup === group ? 'border-primary bg-primary text-white' : 'border-slate-200 bg-white text-slate-700'}`}>{t(group === 'all' ? 'groupAll' : group === 'unit' ? 'groupUnit' : 'groupBoth')} ({count})</button>
          })}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder={`${t('searchProduct')} / ${t('barcode')}`} className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
            <option value="">{t('allCategoriesShort')}</option>
            {categories.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
        </div>
      </div>
      {loading ? <div className="surface-card p-8 text-center text-slate-500">{t('loading')}</div> : filteredLowStock.length === 0 ? <div className="surface-card flex flex-col items-center justify-center gap-3 p-12 text-center text-emerald-700"><Icon name={lowStock.length === 0 ? 'check' : 'warning'} className="h-12 w-12" /><p className="font-semibold">{lowStock.length === 0 ? t('warningEmpty') : t('noProductsFound')}</p></div> : <div className="grid items-stretch gap-4 lg:grid-cols-2">
        {filteredLowStock.map((product) => <article key={product.id} className="surface-card grid h-full min-w-0 grid-cols-[5rem_minmax(0,1fr)] items-start gap-4 border-l-4 border-red-500 p-4 lg:grid-cols-[5rem_minmax(0,1fr)_minmax(10rem,auto)]">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-slate-100">
            {product.imageUrl ? <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-slate-400">{t('noImage')}</div>}
          </div>
          <div className="min-w-0"><h2 className="break-words whitespace-normal leading-snug font-bold text-slate-950 [overflow-wrap:anywhere]">{product.name}</h2><p className="mt-1 break-words whitespace-normal text-sm text-slate-500 [overflow-wrap:anywhere]">{[product.category, product.productColor, product.productSize].filter(Boolean).join(' · ') || t('categoryUnknown')}</p></div>
          <div className="col-span-2 min-w-0 border-t border-slate-100 pt-3 text-left lg:col-span-1 lg:border-l lg:border-t-0 lg:pl-4 lg:text-right"><p className="text-xs font-semibold text-slate-500">{t('warningStock')}</p>{product.packsPerCase > 1 && product.unitsPerPack > 1 ? (() => { const caseUnits = product.packsPerCase * product.unitsPerPack; const remainder = product.stockQty % caseUnits; const fullPacks = Math.floor(remainder / product.unitsPerPack); const looseUnits = remainder % product.unitsPerPack; return <div className="mt-1 space-y-1 break-words whitespace-normal text-sm font-extrabold text-red-700 [overflow-wrap:anywhere]"><p>• {t('case')} - {Math.floor(product.stockQty / caseUnits)} {t('case')}</p><p>• {t('innerPack')} - {fullPacks} {t('innerPack')}</p><p>• {t('looseUnits')} - {looseUnits} {t('unitCount')}</p><p>• {t('totalUnitStock')} - {product.stockQty} {t('unitCount')}</p></div> })() : product.saleType === 'both' ? <div className="mt-1 space-y-1 break-words whitespace-normal text-sm font-extrabold text-red-700 [overflow-wrap:anywhere]"><p>• {t('genericFullPacks')} - {Math.floor(product.stockQty / Math.max(1, product.unitsPerPack || 1))} {t('pack')}</p><p>• {t('genericLooseUnits')} - {product.stockQty % Math.max(1, product.unitsPerPack || 1)} {t('unitCount')}</p><p>• {t('genericTotalUnitStock')} - {product.stockQty} {t('unitCount')}</p></div> : <p className="break-words whitespace-normal text-lg font-extrabold text-red-700 [overflow-wrap:anywhere]">• {t('stock')} - {product.stockQty} {product.saleType === 'pack' ? t('packCount') : t('unitCount')}</p>}<p className="text-xs text-slate-400">{t('threshold')}: {product.lowStockThreshold}</p></div>
        </article>)}
      </div>}
    </main>
  </div>
}
