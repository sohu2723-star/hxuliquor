import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { Product } from '../lib/api'
import ProductList from '../components/ProductList'
import ProductForm from '../components/ProductForm'
import AppHeader from '../components/AppHeader'

export default function AdminProducts() {
  const [products, setProducts] = useState<Product[]>([])
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [categories, setCategories] = useState<string[]>([])
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type })
    window.setTimeout(() => setToast(null), 4000)
  }, [])

  const refreshProducts = useCallback(async () => {
    setIsLoading(true)
    try {
      const { products: all } = await api.getProductsStaleFirst()
      setProducts(all)
    } catch (error) {
      showToast(getErrorMessage(error, 'Product data ဆွဲမရပါ။'), 'error')
    } finally {
      setIsLoading(false)
    }
  }, [showToast])

  const loadCategories = useCallback(async () => {
    try {
      const cats = await api.getCategories()
      setCategories(cats)
    } catch (error) {
      showToast(getErrorMessage(error, 'Category data ဆွဲမရပါ။'), 'error')
    }
  }, [showToast])

  useEffect(() => {
    void refreshProducts()
    void loadCategories()
  }, [refreshProducts, loadCategories])

  const handleSave = async (productData: Partial<Product> & { imageFile?: File }) => {
    try {
      let imageBase64: string | undefined
      let imageFileName: string | undefined

      if (productData.imageFile) {
        imageBase64 = await fileToBase64(productData.imageFile)
        imageFileName = productData.imageFile.name
      }

      const payload = {
        barcode: String(productData.barcode || '').trim(),
        name: String(productData.name || '').trim(),
        category: String(productData.category || '').trim(),
        price: productData.price || 0,
        costPrice: productData.costPrice || 0,
        stockQty: productData.stockQty || 0,
        lowStockThreshold: productData.lowStockThreshold || 0,
        unitsPerPack: productData.unitsPerPack || 1,
        packPrice: productData.packPrice || 0,
        requiresAgeCheck: productData.requiresAgeCheck || false,
        ...(imageBase64 && { imageBase64, imageFileName }),
      }

      if (editingProduct) {
        const updated = await api.updateProduct({ id: editingProduct.id, ...payload })
        setProducts((current) => current.map((item) => item.id === updated.id ? updated : item))
        showToast('Product updated', 'success')
      } else {
        const added = await api.addProduct(payload)
        setProducts((current) => [added, ...current])
        showToast('Product added', 'success')
      }

      setShowForm(false)
      setEditingProduct(null)
      void loadCategories()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to save product', 'error')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this product?')) return
    try {
      await api.deleteProduct(id)
      showToast('Product deleted', 'success')
      void refreshProducts()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to delete product', 'error')
    }
  }

  const handleEdit = (product: Product) => {
    setEditingProduct(product)
    setShowForm(true)
  }

  const filteredProducts = products.filter((p) => {
    const matchesSearch = String(p.name).toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(p.barcode).toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory = !categoryFilter || p.category === categoryFilter
    return matchesSearch && matchesCategory
  })

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader />
      <main className="p-4 lg:p-6">
      {toast && (
        <div
          className={`fixed top-4 right-4 px-6 py-3 rounded-md shadow-lg z-50 ${
            toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
          } text-white font-medium`}
        >
          {toast.message}
        </div>
      )}

      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <h1 className="text-2xl font-bold">Product Management</h1>
          <div className="flex gap-2">
            <button onClick={() => void refreshProducts()} disabled={isLoading} className="border border-gray-300 px-4 py-2 rounded-md disabled:opacity-50">
              {isLoading ? 'Loading...' : 'Refresh'}
            </button>
            <button onClick={() => { setEditingProduct(null); setShowForm(true) }} className="bg-primary text-white px-4 py-2 rounded-md hover:bg-primary/90 transition-colors">
              Add Product
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <input
            type="text"
            placeholder="Search by name or barcode..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">All Categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        <ProductList
          products={filteredProducts}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />

        {showForm && (
          <ProductForm
            product={editingProduct}
            categories={categories}
            onSave={handleSave}
            onClose={() => {
              setShowForm(false)
              setEditingProduct(null)
            }}
          />
        )}
      </div>
      </main>
    </div>
  )
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const image = new Image()
      image.onload = () => {
        const scale = Math.min(1, 640 / Math.max(image.width, image.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(image.width * scale)
        canvas.height = Math.round(image.height * scale)
        const context = canvas.getContext('2d')
        if (!context) return reject(new Error('ပုံကို ပြင်ဆင်၍မရပါ။ အခြားပုံရွေးပါ။'))
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        let quality = .76
        let result = canvas.toDataURL('image/jpeg', quality)
        while (result.length > 45000 && quality > .3) {
          quality -= .08
          result = canvas.toDataURL('image/jpeg', quality)
        }
        if (result.length > 48000) {
          return reject(new Error('ပုံဖိုင်ကို ချုံ့၍မရပါ။ ပိုသေးသောပုံကို ရွေးပါ။'))
        }
        resolve(result)
      }
      image.onerror = () => reject(new Error('ပုံဖိုင်ကို ဖတ်၍မရပါ။ JPG/PNG ပုံရွေးပါ။'))
      image.src = String(reader.result)
    }
    reader.onerror = (error) => reject(error)
    reader.readAsDataURL(file)
  })
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
