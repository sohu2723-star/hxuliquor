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
      const all = await api.getProducts(true)
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
        requiresAgeCheck: productData.requiresAgeCheck || false,
        ...(imageBase64 && { imageBase64, imageFileName }),
      }

      if (editingProduct) {
        await api.updateProduct({ id: editingProduct.id, ...payload })
        showToast('Product updated', 'success')
      } else {
        await api.addProduct(payload)
        showToast('Product added', 'success')
      }

      setShowForm(false)
      setEditingProduct(null)
      loadProducts()
      loadCategories()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to save product', 'error')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this product?')) return
    try {
      await api.deleteProduct(id)
      showToast('Product deleted', 'success')
      loadProducts()
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
    <div className="min-h-screen bg-gray-100">
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
          <button
            onClick={() => {
              setEditingProduct(null)
              setShowForm(true)
            }}
            className="bg-primary text-white px-4 py-2 rounded-md hover:bg-primary/90 transition-colors"
          >
            Add Product
          </button>
        </div>

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
    reader.readAsDataURL(file)
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = (error) => reject(error)
  })
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
