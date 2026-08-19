import { isProductLowStock, type Product } from '../lib/api'
import { formatCurrency } from '../lib/format'
import { useLanguage } from '../contexts/LanguageContext'

interface ProductListProps {
  products: Product[]
  onEdit: (product: Product) => void
  onDelete: (id: string) => void
}

export default function ProductList({ products, onEdit, onDelete }: ProductListProps) {
  const { t } = useLanguage()
  if (products.length === 0) {
    return <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">{t('noProducts')}</div>
  }

  return <div className="bg-white rounded-lg shadow overflow-hidden">
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50"><tr>
          <th className="w-24 min-w-24 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('image')}</th>
          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('name')}</th>
          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('barcode')}</th>
          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('category')}</th>
          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('price')}</th>
          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('stock')}</th>
          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('ageCheck')}</th>
          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{t('actions')}</th>
        </tr></thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {products.map((product) => {
            const unitsPerPack = Math.max(1, product.unitsPerPack || 1)
            const packsPerCase = Math.max(1, product.packsPerCase || 1)
            const isThreeLevel = packsPerCase > 1 && unitsPerPack > 1
            const caseUnits = unitsPerPack * packsPerCase
            const fullCases = isThreeLevel ? Math.floor(product.stockQty / caseUnits) : 0
            const remainderAfterCases = isThreeLevel ? product.stockQty % caseUnits : product.stockQty
            const fullPacks = product.saleType === 'both' ? Math.floor(remainderAfterCases / unitsPerPack) : 0
            const looseUnits = product.saleType === 'both' ? remainderAfterCases % unitsPerPack : 0
            const isLowStock = isProductLowStock(product)
            return <tr key={product.id} className="hover:bg-gray-50">
              <td className="w-24 min-w-24 px-4 py-3 whitespace-nowrap"><div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-gray-100">{product.imageUrl ? <img src={product.imageUrl} alt={product.name} loading="lazy" decoding="async" className="block h-full w-full max-w-none object-cover" /> : <div className="flex h-full w-full items-center justify-center text-center text-xs text-gray-400">{t('noImage')}</div>}</div></td>
              <td className="px-4 py-3 whitespace-nowrap font-bold">{product.name}</td>
              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{product.barcode}</td>
              <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-violet-700">{[product.category, product.productColor, product.productSize].filter(Boolean).join(' · ')}</td>
              <td className="px-4 py-3 whitespace-nowrap text-sm">
                {product.saleType === 'pack' ? <>
                  <div className="font-semibold text-emerald-700">{t('packSalePrice')}: {formatCurrency(product.packPrice || product.price)}</div>
                  <div className="mt-1 text-gray-500">{t('packCostPrice')}: {formatCurrency(product.costPrice)}</div>
                </> : product.saleType === 'both' ? <>
                  <div className="font-semibold text-emerald-700">{t(isThreeLevel ? 'stickSalePrice' : 'unitSalePrice')}: {formatCurrency(product.price)}</div>
                  <div className="mt-1 text-gray-500">{t(isThreeLevel ? 'stickCostPrice' : 'unitCostPrice')}: {formatCurrency(product.costPrice)}</div>
                  <div className="mt-1 font-semibold text-violet-700">{t(isThreeLevel ? 'boxSalePrice' : 'packSalePrice')}: {formatCurrency(product.packPrice)}</div>
                  <div className="mt-1 text-slate-500">{t(isThreeLevel ? 'boxPurchasePriceShort' : 'packPurchasePriceShort')}: {formatCurrency(product.costPrice * unitsPerPack)}</div>
                  {isThreeLevel && <><div className="mt-1 font-semibold text-amber-700">{t('caseSalePrice')}: {formatCurrency(product.casePrice)}</div><div className="mt-1 text-amber-700">{t('casePurchasePrice')}: {formatCurrency(product.costPrice * caseUnits)}</div></>}
                </> : <>
                  <div className="font-semibold text-emerald-700">{t(isThreeLevel ? 'stickSalePrice' : 'unitSalePrice')}: {formatCurrency(product.price)}</div>
                  <div className="mt-1 text-gray-500">{t(isThreeLevel ? 'stickCostPrice' : 'unitCostPrice')}: {formatCurrency(product.costPrice)}</div>
                </>}
              </td>
              <td className={`px-4 py-3 whitespace-nowrap font-bold ${isLowStock ? 'text-red-600' : 'text-emerald-700'}`}>
                {isThreeLevel ? <div className={`space-y-1 rounded-xl px-3 py-2 ring-1 ${isLowStock ? 'bg-red-50 text-red-800 ring-red-100' : 'bg-emerald-50 text-emerald-800 ring-emerald-100'}`}>
                  <div>• {t('case')} - {fullCases} {t('case')}</div>
                  <div className="text-sm">• {t('innerPack')} - {fullPacks} {t('innerPack')}</div>
                  <div className="text-sm">• {t('looseUnits')} - {looseUnits} {t('unitCount')}</div>
                  <div className="text-sm">• {t('totalUnitStock')} - {product.stockQty} {t('unitCount')}</div>
                </div> : product.saleType === 'both' ? <div className={`space-y-1 rounded-xl px-3 py-2 ring-1 ${isLowStock ? 'bg-red-50 text-red-800 ring-red-100' : 'bg-emerald-50 text-emerald-800 ring-emerald-100'}`}>
                  <div>• {t('genericFullPacks')} - {fullPacks} {t('pack')}</div>
                  <div className="text-sm">• {t('genericLooseUnits')} - {looseUnits} {t('unitCount')}</div>
                  <div className="text-sm">• {t('genericTotalUnitStock')} - {product.stockQty} {t('unitCount')}</div>
                </div> : <div>• {t('stock')} - {product.stockQty} {product.saleType === 'pack' ? t('packCount') : t('unitCount')}</div>}
                {isLowStock && <span className="ml-2 text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded-full">{t('low')}</span>}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sm">{product.requiresAgeCheck ? <span className="text-orange-600 font-medium">{t('yes')}</span> : <span className="text-gray-400">{t('no')}</span>}</td>
              <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium"><button onClick={() => onEdit(product)} className="text-primary hover:text-primary/80 mr-3">{t('edit')}</button><button onClick={() => onDelete(product.id)} className="text-red-600 hover:text-red-800">{t('delete')}</button></td>
            </tr>
          })}
        </tbody>
      </table>
    </div>
  </div>
}
