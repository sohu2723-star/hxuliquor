import { useEffect, useState, useRef } from 'react'
import type { Product } from '../lib/api'
import Scanner from './Scanner'
import { useLanguage } from '../contexts/LanguageContext'

const PRODUCT_FORM_DRAFT_PREFIX = 'hxu-product-form-draft:'

interface ProductFormProps {
  product: Product | null
  categories: string[]
  onSave: (data: Partial<Product> & { imageFile?: File }) => Promise<void>
  onClose: () => void
}

export default function ProductForm({ product, categories, onSave, onClose }: ProductFormProps) {
  const { t } = useLanguage()
  const draftKey = `${PRODUCT_FORM_DRAFT_PREFIX}${product?.id || 'new'}`
  const initialFormData = {
    barcode: product?.barcode || '',
    name: product?.name || '',
    category: product?.category || '',
    productColor: product?.productColor || '',
    productSize: product?.productSize || '',
    price: product?.price?.toString() || '',
    costPrice: product?.costPrice?.toString() || '',
    stockQty: product?.stockQty?.toString() || '',
    lowStockThreshold: product?.lowStockThreshold?.toString() || '5',
    unitsPerPack: product?.unitsPerPack?.toString() || '1',
    packPrice: product?.packPrice?.toString() || '',
    saleType: product?.saleType || 'unit',
    requiresAgeCheck: product?.requiresAgeCheck || false,
  }
  const initialProductKind = product?.saleType === 'pack' ? 'pack' : product?.saleType === 'both' ? 'both' : product?.barcode ? 'barcode' : 'noBarcode'
  const [formData, setFormData] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(draftKey) || 'null') as { formData?: Partial<typeof initialFormData> } | null
      return saved?.formData ? { ...initialFormData, ...saved.formData } : initialFormData
    } catch { return initialFormData }
  })
  const [productKind, setProductKind] = useState<'barcode' | 'noBarcode' | 'pack' | 'both'>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(draftKey) || 'null') as { productKind?: 'barcode' | 'noBarcode' | 'pack' | 'both' } | null
      return saved?.productKind || initialProductKind
    } catch { return initialProductKind }
  })
  const [imageFile, setImageFile] = useState<File | undefined>()
  const [imagePreview, setImagePreview] = useState<string | null>(product?.imageUrl || null)
  const [isScanning, setIsScanning] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try { localStorage.setItem(draftKey, JSON.stringify({ formData, productKind })) } catch { /* storage unavailable */ }
  }, [draftKey, formData, productKind])

  const unitsPerPackValue = Math.max(1, parseInt(formData.unitsPerPack) || 1)
  const stockQtyValue = parseInt(formData.stockQty) || 0
  const costPriceValue = parseFloat(formData.costPrice) || 0
  const packPriceValue = parseFloat(formData.packPrice) || 0
  const unitPriceValue = parseFloat(formData.price) || 0
  const stockUnitLabel = formData.saleType === 'pack' ? t('pack') : t('unitCount')
  const costUnitLabel = formData.saleType === 'pack' ? t('packSalePrice') : t('unitCostPrice')
  const inventoryCostPreview = stockQtyValue * costPriceValue
  const packProfitPreview = formData.saleType === 'both' ? packPriceValue - (costPriceValue * unitsPerPackValue) : formData.saleType === 'pack' ? unitPriceValue - costPriceValue : 0
  const unitProfitPreview = formData.saleType !== 'pack' ? unitPriceValue - costPriceValue : 0
  const packCountPreview = formData.saleType === 'both' ? Math.floor(stockQtyValue / unitsPerPackValue) : 0

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    if (name === 'barcode') setProductKind(value.trim() ? 'barcode' : 'noBarcode')
    if (name === 'saleType' && value === 'pack') setProductKind('pack')
    if (name === 'saleType' && value === 'both') setProductKind('both')
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }))
  }

  const selectProductKind = (kind: 'barcode' | 'noBarcode' | 'pack' | 'both') => {
    setProductKind(kind)
    setFormData((prev) => ({
      ...prev,
      saleType: kind === 'pack' ? 'pack' : kind === 'both' ? 'both' : 'unit',
      ...(kind === 'noBarcode' ? { barcode: '' } : {}),
    }))
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        alert(t('imageTooLarge'))
        return
      }
      setImageFile(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setImagePreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleScan = (code: string) => {
    const detected = detectProductDetails(code)
    setProductKind(detected.barcode || code ? 'barcode' : 'noBarcode')
    setFormData((prev) => ({
      ...prev,
      saleType: 'unit',
      barcode: detected.barcode || code,
      name: detected.name || prev.name,
      productColor: detected.productColor || prev.productColor,
      productSize: detected.productSize || prev.productSize,
    }))
    setIsScanning(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    const data: Partial<Product> & { imageFile?: File } = {
      barcode: formData.barcode,
      name: formData.name,
      category: formData.category,
      productColor: formData.productColor,
      productSize: formData.productSize,
      price: parseFloat(formData.price) || 0,
      costPrice: parseFloat(formData.costPrice) || 0,
      stockQty: parseInt(formData.stockQty) || 0,
      lowStockThreshold: parseInt(formData.lowStockThreshold) || 0,
      unitsPerPack: Math.max(1, parseInt(formData.unitsPerPack) || 1),
      packPrice: formData.saleType === 'both' ? (parseFloat(formData.packPrice) || 0) : formData.saleType === 'pack' ? (parseFloat(formData.price) || 0) : 0,
      saleType: formData.saleType as 'unit' | 'pack' | 'both',
      requiresAgeCheck: formData.requiresAgeCheck,
    }

    if (imageFile) {
      data.imageFile = imageFile
    }

    try {
      await onSave(data)
      try { localStorage.removeItem(draftKey) } catch { /* storage unavailable */ }
    } finally { setIsSubmitting(false) }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto border border-slate-200">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">{product ? t('productEditTitle') : t('productAddTitle')}</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-2xl"
            >
              ×
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <fieldset className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <legend className="px-1 text-sm font-semibold">{t('productType')}</legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                <button type="button" onClick={() => selectProductKind('barcode')} className={`cursor-pointer rounded-lg border p-3 text-center ${productKind === 'barcode' ? 'border-primary bg-amber-50 text-primary' : 'bg-white'}`}><span className="block font-semibold">{t('barcodeProduct')}</span><small>{t('barcodeProductHint')}</small></button>
                <button type="button" onClick={() => selectProductKind('noBarcode')} className={`cursor-pointer rounded-lg border p-3 text-center ${productKind === 'noBarcode' ? 'border-slate-500 bg-slate-50 text-slate-800' : 'bg-white'}`}><span className="block font-semibold">{t('noBarcodeProduct')}</span><small>{t('noBarcodeProductHint')}</small></button>
                <button type="button" onClick={() => selectProductKind('pack')} className={`cursor-pointer rounded-lg border p-3 text-center ${productKind === 'pack' ? 'border-violet-600 bg-violet-50 text-violet-800' : 'bg-white'}`}><span className="block font-semibold">{t('packOnlyProduct')}</span><small>{t('packOnlyProductHint')}</small></button>
                <button type="button" onClick={() => selectProductKind('both')} className={`cursor-pointer rounded-lg border p-3 text-center ${productKind === 'both' ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'bg-white'}`}><span className="block font-semibold">{t('packBothProduct')}</span><small>{t('packBothProductHint')}</small></button>
              </div>
            </fieldset>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Barcode / QR codes
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  name="barcode"
                  value={formData.barcode}
                  onChange={handleChange}
                  className="h-11 flex-1 rounded-xl border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder={t('barcodeCodesPlaceholder')}
                />
                <button
                  type="button"
                  onClick={() => setIsScanning(!isScanning)}
                  className="px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  {isScanning ? t('cancel') : t('scan')}
                </button>
              </div>
              {isScanning && (
                <div className="mt-2">
                  <Scanner onScan={handleScan} />
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('productName')}
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                className="h-11 w-full rounded-xl border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Category
              </label>
              <select
                name="category"
                value={formData.category}
                onChange={handleChange}
                className="h-11 w-full rounded-xl border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">{t('selectCategory')}</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              <input
                type="text"
                placeholder={t('newCategoryPlaceholder')}
                value={formData.category}
                required
                onChange={(e) => setFormData((prev) => ({ ...prev, category: e.target.value }))}
                className="mt-2 h-11 w-full rounded-xl border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col">
                <label className="mb-1 flex h-14 items-end text-sm font-medium leading-5 text-gray-700">{t('color')}</label>
                <input type="text" name="productColor" value={formData.productColor} onChange={handleChange} placeholder={t('colorPlaceholder')} className="h-11 w-full rounded-xl border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div className="flex flex-col">
                <label className="mb-1 flex h-14 items-end text-sm font-medium leading-5 text-gray-700">{t('size')}</label>
                <input type="text" name="productSize" value={formData.productSize} onChange={handleChange} placeholder={t('sizePlaceholder')} className="h-11 w-full rounded-xl border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col">
                <label className="mb-1 flex h-14 items-end text-sm font-medium leading-5 text-gray-700">
                  {formData.saleType === 'pack' ? t('packSalePrice') : t('unitSalePrice')}
                </label>
                <input
                  type="number"
                  name="price"
                  value={formData.price}
                  onChange={handleChange}
                  required
                  step="0.01"
                  className="h-11 w-full rounded-xl border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div className="flex flex-col">
                <label className="mb-1 flex h-14 items-end text-sm font-medium leading-5 text-gray-700">
                  {costUnitLabel}
                </label>
                <input
                  type="number"
                  name="costPrice"
                  value={formData.costPrice}
                  onChange={handleChange}
                  required
                  step="0.01"
                  className="h-11 w-full rounded-xl border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            {formData.saleType === 'both' && <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-4">
              <h3 className="font-semibold text-slate-900">{t('packInfo')}</h3>
              <div className="flex flex-col">
                <label className="flex h-14 flex-col text-sm font-medium leading-5 text-gray-700">{t('unitsPerPack')}
                  <input type="number" name="unitsPerPack" min="2" value={formData.unitsPerPack} onChange={handleChange} required className="mt-1 h-11 w-full rounded-xl border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary" />
                </label>
              </div>
              {formData.saleType === 'both' && <div className="mt-3 flex flex-col">
                <label className="flex h-14 flex-col text-sm font-medium leading-5 text-gray-700">{t('packSalePrice')}
                  <input type="number" name="packPrice" value={formData.packPrice} onChange={handleChange} required step="0.01" className="mt-1 h-11 w-full rounded-xl border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary" />
                </label>
                <p className="mt-2 rounded-lg bg-white/80 px-3 py-2 text-sm font-semibold text-violet-800">{t('packCountPreview')}: {packCountPreview} {t('pack')}</p>
              </div>}
            </div>}

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col">
                <label className="mb-1 flex h-20 items-end text-sm font-medium leading-5 text-gray-700">
                  {t('stockQuantity')} ({stockUnitLabel})
                </label>
                <input
                  type="number"
                  name="stockQty"
                  value={formData.stockQty}
                  onChange={handleChange}
                  required
                  className="h-11 w-full rounded-xl border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div className="flex flex-col">
                <label className="mb-1 flex h-20 items-end text-sm font-medium leading-5 text-gray-700">
                  {t('lowStockThreshold')}
                </label>
                <input
                  type="number"
                  name="lowStockThreshold"
                  value={formData.lowStockThreshold}
                  onChange={handleChange}
                  className="h-11 w-full rounded-xl border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
              <p className="font-semibold">{t('stockProfitPreview')}</p>
              <p>{t('investmentPreview')}: {stockQtyValue} × {costPriceValue.toLocaleString()} = {inventoryCostPreview.toLocaleString()} Ks</p>
              {formData.saleType !== 'pack' && <p>{t('unitProfit')}: {(unitProfitPreview || 0).toLocaleString()} Ks</p>}
              {formData.saleType !== 'unit' && <p>{t('packProfit')}: {(packProfitPreview || 0).toLocaleString()} Ks</p>}
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                name="requiresAgeCheck"
                id="requiresAgeCheck"
                checked={formData.requiresAgeCheck}
                onChange={handleChange}
                className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
              />
              <label htmlFor="requiresAgeCheck" className="ml-2 block text-sm text-gray-700">
                {t('ageCheckRequired')}
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('productImage')}
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="h-11 w-full rounded-xl border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
              />
              {imagePreview && (
                <img
                  src={imagePreview}
                  alt={t('preview')}
                  className="mt-2 h-32 w-32 object-cover rounded-md"
                />
              )}
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 bg-primary text-white px-4 py-2 rounded-md hover:bg-primary/90 disabled:opacity-50"
              >
                {isSubmitting ? t('saving') : product ? t('updateProduct') : t('addProduct')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}


type DetectedProductDetails = {
  barcode: string
  name: string
  productColor: string
  productSize: string
}

const COLOR_WORDS = [
  'black', 'white', 'red', 'blue', 'green', 'gold', 'golden', 'silver', 'yellow', 'orange', 'pink', 'purple', 'brown', 'gray', 'grey',
  'အနက်', 'အဖြူ', 'အနီ', 'အပြာ', 'အစိမ်း', 'ရွှေ', 'ငွေ', 'အဝါ', 'လိမ္မော်', 'ပန်းရောင်', 'ခရမ်း', 'အညို', 'မီးခိုး',
]

function detectProductDetails(rawCode: string): DetectedProductDetails {
  const raw = String(rawCode || '').trim()
  const fields = parseScannedFields(raw)
  const productSize = fields.size || fields.ml || fields.volume || detectSize(raw)
  const productColor = fields.color || fields.colour || detectColor(raw)
  const name = fields.name || fields.product || detectName(raw, productColor, productSize)
  const barcode = fields.barcode || fields.code || fields.qr || (looksLikePlainBarcode(raw) ? raw : '')
  return { barcode, name, productColor, productSize }
}

function parseScannedFields(raw: string): Record<string, string> {
  return raw.split(/[\n|;,]+/).reduce<Record<string, string>>((fields, part) => {
    const match = part.match(/^\s*([a-zA-Z ]{2,16})\s*[:-=]\s*(.+?)\s*$/)
    if (!match) return fields
    const key = match[1].trim().toLowerCase().replace(/\s+/g, '')
    fields[key] = match[2].trim()
    return fields
  }, {})
}

function detectSize(raw: string): string {
  return raw.match(/\b\d+(?:\.\d+)?\s*(?:ml|l|liter|litre|cl)\b/i)?.[0]?.replace(/\s+/g, '') || ''
}

function detectColor(raw: string): string {
  const normalized = raw.toLowerCase()
  return COLOR_WORDS.find((color) => normalized.includes(color.toLowerCase())) || ''
}

function detectName(raw: string, productColor: string, productSize: string): string {
  if (looksLikePlainBarcode(raw)) return ''
  const cleaned = raw
    .split(/[\n|;,]+/)
    .filter((part) => !/^\s*(?:barcode|code|qr|color|colour|size|ml|volume)\s*[:-=]/i.test(part))
    .join(' ')
    .replace(productColor, '')
    .replace(productSize, '')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned.length >= 2 ? cleaned.slice(0, 80) : ''
}

function looksLikePlainBarcode(raw: string): boolean {
  return /^[0-9A-Z\-\s]{6,}$/i.test(raw) && !/[\n|;,]/.test(raw)
}
