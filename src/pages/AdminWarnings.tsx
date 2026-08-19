import { useCallback, useEffect, useState } from 'react'
import AppHeader from '../components/AppHeader'
import Icon from '../components/Icon'
import { api, isProductLowStock, type Product } from '../lib/api'
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

  const load = useCallback(async (quiet = false): Promise<boolean> => {
    if (!quiet) setLoading(true)
    try {
      const result = await api.getProductsStaleFirst((fresh) => setProducts(fresh))
      setProducts(result.products)
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

  const lowStock = products.filter(isProductLowStock)

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
      {loading ? <div className="surface-card p-8 text-center text-slate-500">{t('loading')}</div> : lowStock.length === 0 ? <div className="surface-card flex flex-col items-center justify-center gap-3 p-12 text-center text-emerald-700"><Icon name="check" className="h-12 w-12" /><p className="font-semibold">{t('warningEmpty')}</p></div> : <div className="grid items-stretch gap-4 sm:grid-cols-2">
        {lowStock.map((product) => <article key={product.id} className="surface-card flex h-full items-start gap-4 border-l-4 border-red-500 p-4">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-slate-100">
            {product.imageUrl ? <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-slate-400">{t('noImage')}</div>}
          </div>
          <div className="min-w-0 flex-1"><h2 className="truncate font-bold text-slate-950">{product.name}</h2><p className="mt-1 text-sm text-slate-500">{[product.category, product.productColor, product.productSize].filter(Boolean).join(' · ') || t('categoryUnknown')}</p></div>
          <div className="shrink-0 text-right"><p className="text-xs font-semibold text-slate-500">{t('warningStock')}</p>{product.packsPerCase > 1 && product.unitsPerPack > 1 ? (() => { const caseUnits = product.packsPerCase * product.unitsPerPack; const remainder = product.stockQty % caseUnits; const fullPacks = Math.floor(remainder / product.unitsPerPack); const looseUnits = remainder % product.unitsPerPack; return <div className="mt-1 space-y-1 text-sm font-extrabold text-red-700"><p>• {t('case')} - {Math.floor(product.stockQty / caseUnits)} {t('case')}</p><p>• {t('innerPack')} - {fullPacks} {t('innerPack')}</p><p>• {t('looseUnits')} - {looseUnits} {t('unitCount')}</p><p>• {t('totalUnitStock')} - {product.stockQty} {t('unitCount')}</p></div> })() : product.saleType === 'both' ? <div className="mt-1 space-y-1 text-sm font-extrabold text-red-700"><p>• {t('genericFullPacks')} - {Math.floor(product.stockQty / Math.max(1, product.unitsPerPack || 1))} {t('pack')}</p><p>• {t('genericLooseUnits')} - {product.stockQty % Math.max(1, product.unitsPerPack || 1)} {t('unitCount')}</p><p>• {t('genericTotalUnitStock')} - {product.stockQty} {t('unitCount')}</p></div> : <p className="text-lg font-extrabold text-red-700">• {t('stock')} - {product.stockQty} {product.saleType === 'pack' ? t('packCount') : t('unitCount')}</p>}<p className="text-xs text-slate-400">{t('threshold')}: {product.lowStockThreshold}</p></div>
        </article>)}
      </div>}
    </main>
  </div>
}
