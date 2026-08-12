import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import type { Product } from '../lib/api'
import ProductList from '../components/ProductList'
import ProductForm from '../components/ProductForm'

export default function AdminProducts() {
  const [products, setProducts] = useState<Product[]>([])
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [categories, setCategories] = useState<string[]>([])
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    loadProducts()
    loadCategories()
  }, [])

  const loadProducts = async () => {
    try {
      const all = await api.getProducts()
      setProducts(all)
    } catch {
      showToast('Failed to load products', 'error')
    }
  }

  const loadCategories = async () => {
    try {
      const cats = await api.getCategories()
      setCategories(cats)
    } catch {
      // ignore
    }
  }

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const handleSave = async (productData: Partial<Product> & { imageFile?: File }) => {
    try {
      const processProduct = async (isEdit: boolean): Promise<void> => {
        let imageBase64: string | undefined
        let imageFileName: string | undefined

        if (productData.imageFile) {
          imageBase64 = await fileToBase64(productData.imageFile)
          imageFileName = productData.imageFile.name
        }

        const payload = {
          barcode: productData.barcode || '',
          name: productData.name || '',
          category: productData.category || '',
          price: productData.price || 0,
          costPrice: productData.costPrice || 0,
          stockQty: productData.stockQty || 0,
          lowStockThreshold: productData.lowStockThreshold || 0,
          requiresAgeCheck: productData.requiresAgeCheck || false,
          ...(imageBase64 && { imageBase64, imageFileName }),
        }

        if (isEdit && productData.id) {
          await api.updateProduct({ id: productData.id, ...payload })
          showToast('Product updated', 'success')
        } else {
          await api.addProduct(payload)
          showToast('Product added', 'success')
        }
      }

      if (editingProduct) {
        await processProduct(true)
      } else {
        await processProduct(false)
      }

      setShowForm(false)
      setEditingProduct(null)
      loadProducts()
      loadCategories()
    } catch {
      showToast('Failed to save product', 'error')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this product?')) return
    try {
      await api.deleteProduct(id)
      showToast('Product deleted', 'success')
      loadProducts()
    } catch {
      showToast('Failed to delete product', 'error')
    }
  }

  const handleEdit = (product: Product) => {
    setEditingProduct(product)
    setShowForm(true)
  }

  const filteredProducts = products.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.barcode.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory = !categoryFilter || p.category === categoryFilter
    return matchesSearch && matchesCategory
  })

  return (
    <div className="min-h-screen bg-gray-100 p-4 lg:p-6">
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

        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
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
