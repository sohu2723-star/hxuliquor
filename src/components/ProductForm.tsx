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
    price: product?.price?.toString() || '',
    costPrice: product?.costPrice?.toString() || '',
    stockQty: product?.stockQty?.toString() || '',
    lowStockThreshold: product?.lowStockThreshold?.toString() || '5',
    unitsPerPack: product?.unitsPerPack?.toString() || '1',
    packPrice: product?.packPrice?.toString() || '',
    saleType: product?.saleType === 'pack' ? 'pack' : 'unit',
    requiresAgeCheck: product?.requiresAgeCheck || false,
  })
  const [imageFile, setImageFile] = useState<File | undefined>()
  const [imagePreview, setImagePreview] = useState<string | null>(product?.imageUrl || null)
  const [isScanning, setIsScanning] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
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
    setFormData((prev) => ({ ...prev, barcode: code }))
    setIsScanning(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    const data: Partial<Product> & { imageFile?: File } = {
      barcode: formData.barcode,
      name: formData.name,
      category: formData.category,
      price: parseFloat(formData.price) || 0,
      costPrice: parseFloat(formData.costPrice) || 0,
      stockQty: parseInt(formData.stockQty) || 0,
      lowStockThreshold: parseInt(formData.lowStockThreshold) || 0,
      unitsPerPack: Math.max(1, parseInt(formData.unitsPerPack) || 1),
      packPrice: formData.saleType === 'pack' ? (parseFloat(formData.price) || 0) : 0,
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
              <div className="grid grid-cols-2 gap-2">
                <label className={`cursor-pointer rounded-lg border p-3 text-center ${formData.saleType === 'unit' ? 'border-primary bg-amber-50 text-primary' : 'bg-white'}`}><input className="sr-only" type="radio" name="saleType" value="unit" checked={formData.saleType === 'unit'} onChange={handleChange} /><span className="block font-semibold">တစ်ခုချင်း Product</span><small>Stock ကို ဘူး/ခုဖြင့်ထည့်ပါ</small></label>
                <label className={`cursor-pointer rounded-lg border p-3 text-center ${formData.saleType === 'pack' ? 'border-violet-600 bg-violet-50 text-violet-800' : 'bg-white'}`}><input className="sr-only" type="radio" name="saleType" value="pack" checked={formData.saleType === 'pack'} onChange={handleChange} /><span className="block font-semibold">ပါကင် Product</span><small>Stock ကို ပါကင်ဖြင့်ထည့်ပါ</small></label>
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
              <p className="mt-1 text-xs text-gray-500">QR မတူလျှင် code အားလုံးကို comma ခြားထည့်ပါ။ အစပိုင်းတူပြီး အဆုံးသာပြောင်းလျှင် တူသောအစနောက်တွင် * ထည့်နိုင်သည် (ဥပမာ ABC123*)။ Code မရှိလျှင် ကွက်လပ်ထားပြီး POS product ပုံကိုနှိပ်ရောင်းနိုင်သည်။</p>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
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
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
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

            {formData.saleType === 'pack' && <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-4">
              <h3 className="font-semibold text-slate-900">ပါကင် Product အချက်အလက်</h3>
              <p className="mb-3 mt-1 text-xs text-slate-600">Stock Quantity တွင် ကျန်သည့် “ပါကင်အရေအတွက်” ကို ထည့်ပါ။ Barcode မရှိလျှင် ကွက်လပ်ထားနိုင်ပါသည်။</p>
              <div>
                <label className="text-sm font-medium text-gray-700">တစ်ပါကင်ပါဝင်မှု
                  <input type="number" name="unitsPerPack" min="2" value={formData.unitsPerPack} onChange={handleChange} required className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary" />
                </label>
              </div>
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
