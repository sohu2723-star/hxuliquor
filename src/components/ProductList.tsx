import type { Product } from '../lib/api'
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
          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('image')}</th>
          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('name')}</th>
          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('barcode')}</th>
          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('category')}</th>
          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('price')}</th>
          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('stock')}</th>
          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('ageCheck')}</th>
          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{t('actions')}</th>
        </tr></thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {products.map((product) => <tr key={product.id} className="hover:bg-gray-50">
            <td className="px-4 py-3 whitespace-nowrap">{product.imageUrl ? <img src={product.imageUrl} alt={product.name} className="h-10 w-10 object-cover rounded-md" /> : <div className="h-10 w-10 bg-gray-200 rounded-md flex items-center justify-center text-gray-400 text-xs">{t('noImage')}</div>}</td>
            <td className="px-4 py-3 whitespace-nowrap font-bold">{product.name}</td>
            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{product.barcode}</td>
            <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-violet-700">{[product.category, product.productColor, product.productSize].filter(Boolean).join(' · ')}{product.unitsPerPack > 1 && product.packPrice > 0 && <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800">{t('pack')} × {product.unitsPerPack} · {formatCurrency(product.packPrice)}</span>}</td>
            <td className="px-4 py-3 whitespace-nowrap font-semibold">{formatCurrency(product.price)}</td>
            <td className={`px-4 py-3 whitespace-nowrap font-bold ${product.stockQty <= product.lowStockThreshold ? 'text-red-600' : 'text-emerald-700'}`}>{product.stockQty} {product.saleType === 'pack' ? t('packCount') : t('unitCount')}{product.stockQty <= product.lowStockThreshold && <span className="ml-2 text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded-full">{t('low')}</span>}</td>
            <td className="px-4 py-3 whitespace-nowrap text-sm">{product.requiresAgeCheck ? <span className="text-orange-600 font-medium">{t('yes')}</span> : <span className="text-gray-400">{t('no')}</span>}</td>
            <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium"><button onClick={() => onEdit(product)} className="text-primary hover:text-primary/80 mr-3">{t('edit')}</button><button onClick={() => onDelete(product.id)} className="text-red-600 hover:text-red-800">{t('delete')}</button></td>
          </tr>)}
        </tbody>
      </table>
    </div>
  </div>
}
