import { useState, useRef } from 'react'
import type { Product } from '../lib/api'
import Scanner from './Scanner'

interface ProductFormProps {
  product: Product | null
  categories: string[]
  onSave: (data: Partial<Product> & { imageFile?: File }) => Promise<void>
  onClose: () => void
}

export default function ProductForm({ product, categories, onSave, onClose }: ProductFormProps) {
  const [formData, setFormData] = useState({
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
  })
  const [productKind, setProductKind] = useState<'barcode' | 'noBarcode' | 'pack' | 'both'>(product?.saleType === 'pack' ? 'pack' : product?.saleType === 'both' ? 'both' : product?.barcode ? 'barcode' : 'noBarcode')
  const [imageFile, setImageFile] = useState<File | undefined>()
  const [imagePreview, setImagePreview] = useState<string | null>(product?.imageUrl || null)
  const [isScanning, setIsScanning] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
        alert('ပုံဖိုင် 10MB ထက်ငယ်ရပါမည်။')
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

    try { await onSave(data) } finally { setIsSubmitting(false) }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto border border-slate-200">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">{product ? 'Edit Product' : 'Add Product'}</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-2xl"
            >
              ×
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <fieldset className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <legend className="px-1 text-sm font-semibold">Product အမျိုးအစား</legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                <button type="button" onClick={() => selectProductKind('barcode')} className={`cursor-pointer rounded-lg border p-3 text-center ${productKind === 'barcode' ? 'border-primary bg-amber-50 text-primary' : 'bg-white'}`}><span className="block font-semibold">Barcode ရှိ Product</span><small>Barcode ထည့်ပြီး scan ရောင်းရန်</small></button>
                <button type="button" onClick={() => selectProductKind('noBarcode')} className={`cursor-pointer rounded-lg border p-3 text-center ${productKind === 'noBarcode' ? 'border-slate-500 bg-slate-50 text-slate-800' : 'bg-white'}`}><span className="block font-semibold">Barcode မရှိ Product</span><small>Barcode ကို ကွက်လပ်ထားပါ</small></button>
                <button type="button" onClick={() => selectProductKind('pack')} className={`cursor-pointer rounded-lg border p-3 text-center ${productKind === 'pack' ? 'border-violet-600 bg-violet-50 text-violet-800' : 'bg-white'}`}><span className="block font-semibold">ပါကင် သီးသန့်</span><small>Stock ကို ပါကင်ဖြင့်ထည့်ပါ</small></button>
                <button type="button" onClick={() => selectProductKind('both')} className={`cursor-pointer rounded-lg border p-3 text-center ${productKind === 'both' ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'bg-white'}`}><span className="block font-semibold">ပါကင် + တစ်ခုချင်း</span><small>Stock ကို တစ်ခုချင်းစုစုပေါင်းထည့်ပါ</small></button>
              </div>
              <p className="mt-2 text-xs text-slate-500">ပါကင် + တစ်ခုချင်း ကိုရွေးလျှင် stock ကို အတွင်းပါ တစ်ခုချင်းစုစုပေါင်းဖြင့်သိမ်းပြီး ပါကင်ရောင်းလျှင် တစ်ပါကင်ပါဝင်မှုအတိုင်း အလိုအလျောက်လျှော့ပါမည်။</p>
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
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Codes များလျှင် comma ခြားထည့်ပါ"
                />
                <button
                  type="button"
                  onClick={() => setIsScanning(!isScanning)}
                  className="px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  {isScanning ? 'Cancel' : 'Scan'}
                </button>
              </div>
              {isScanning && (
                <div className="mt-2">
                  <Scanner onScan={handleScan} />
                </div>
              )}
              <p className="mt-1 text-xs text-gray-500">QR မတူလျှင် code အားလုံးကို comma ခြားထည့်ပါ။ Scan text ထဲတွင် name/color/size/ml ပါလျှင် Product Name, အရောင်, အရွယ်အစားကို အလိုအလျောက်ဖြည့်ပေးပါမည်။ Code မရှိလျှင် ကွက်လပ်ထားပြီး POS product ပုံကိုနှိပ်ရောင်းနိုင်သည်။</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Product Name
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Select category</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Or type new category"
                value={formData.category}
                required
                onChange={(e) => setFormData((prev) => ({ ...prev, category: e.target.value }))}
                className="w-full mt-2 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Product Color / အရောင်</label>
                <input type="text" name="productColor" value={formData.productColor} onChange={handleChange} placeholder="ဥပမာ Red, Blue, Gold" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Product Size / အရွယ်အစား</label>
                <input type="text" name="productSize" value={formData.productSize} onChange={handleChange} placeholder="ဥပမာ 500ml, 1L, Small" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
            </div>
            <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">Barcode မရှိသော product များအတွက် camera OCR မဟုတ်ဘဲ QR text ထဲတွင် product name / color / size ပါအောင်ထည့်ပါ။ POS scan သည် ထို text များနှင့် fallback match လုပ်ပါမည်။</p>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col">
                <label className="mb-1 flex min-h-10 items-end text-sm font-medium text-gray-700">
                  {formData.saleType === 'pack' ? 'တစ်ပါကင် ရောင်းဈေး (Ks)' : 'တစ်ဘူး / တစ်ခု ရောင်းဈေး (Ks)'}
                </label>
                <input
                  type="number"
                  name="price"
                  value={formData.price}
                  onChange={handleChange}
                  required
                  step="0.01"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div className="flex flex-col">
                <label className="mb-1 flex min-h-10 items-end text-sm font-medium text-gray-700">
                  Cost Price (Ks)
                </label>
                <input
                  type="number"
                  name="costPrice"
                  value={formData.costPrice}
                  onChange={handleChange}
                  required
                  step="0.01"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            {formData.saleType !== 'unit' && <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-4">
              <h3 className="font-semibold text-slate-900">ပါကင် Product အချက်အလက်</h3>
              <p className="mb-3 mt-1 text-xs text-slate-600">ပါကင်သီးသန့်ဆို Stock Quantity တွင် ပါကင်အရေအတွက် ထည့်ပါ။ ပါကင် + တစ်ခုချင်းဆို Stock Quantity တွင် အတွင်းပါ တစ်ခုချင်းစုစုပေါင်း ထည့်ပါ (ဥပမာ 10 ပါကင် × 12 ခု = 120)။</p>
              <div>
                <label className="text-sm font-medium text-gray-700">တစ်ပါကင်ပါဝင်မှု
                  <input type="number" name="unitsPerPack" min="2" value={formData.unitsPerPack} onChange={handleChange} required className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary" />
                </label>
              </div>
              {formData.saleType === 'both' && <div className="mt-3">
                <label className="text-sm font-medium text-gray-700">တစ်ပါကင် ရောင်းဈေး (Ks)
                  <input type="number" name="packPrice" value={formData.packPrice} onChange={handleChange} required step="0.01" className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary" />
                </label>
              </div>}
              <p className="mt-3 rounded-lg bg-white p-3 text-xs text-violet-800">တစ်ခုချင်း stock ကုန်သွားလျှင် ပါကင် + တစ်ခုချင်း product တွင် Stock ကျန်နေသေးသရွေ့ ပါကင်ဖောက်ရောင်းသကဲ့သို့ တစ်ခုချင်းရောင်းနိုင်ပါသည်။ ဆေးလိပ် carton/ဘူး/အလိပ်လို အဆင့် ၃ ဆင့်ရှိလျှင် အလိပ်ကို smallest unit အဖြစ် stock ထားပြီး carton နှင့် ဘူးကို sale item သီးသန့် product အဖြစ် ဖွင့်ပါ။</p>
            </div>}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Stock Quantity
                </label>
                <input
                  type="number"
                  name="stockQty"
                  value={formData.stockQty}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Low Stock Threshold
                </label>
                <input
                  type="number"
                  name="lowStockThreshold"
                  value={formData.lowStockThreshold}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
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
                Requires age check (cigarettes/alcohol)
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Product Image
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="mt-1.5 text-xs text-gray-500">ပုံကို upload မတင်မီ အလိုအလျောက် ချုံ့ပေးပါမည် (JPG, PNG, WebP)။</p>
              {imagePreview && (
                <img
                  src={imagePreview}
                  alt="Preview"
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
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 bg-primary text-white px-4 py-2 rounded-md hover:bg-primary/90 disabled:opacity-50"
              >
                {isSubmitting ? 'Saving...' : product ? 'Update' : 'Add Product'}
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
    const match = part.match(/^\s*([a-zA-Z ]{2,16})\s*[:=\-]\s*(.+?)\s*$/)
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
    .filter((part) => !/^\s*(?:barcode|code|qr|color|colour|size|ml|volume)\s*[:=\-]/i.test(part))
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
