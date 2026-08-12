// Keep Apps Script behind our same-origin serverless endpoint. Apps Script web-app
// responses do not reliably include CORS headers, so browsers cannot call them
// directly even when the request itself does not trigger a preflight.
const API_URL = '/api/gas'

type Json = Record<string, unknown>

const PRODUCT_CACHE_KEY = 'hxu-products-v1'
const PRODUCT_CACHE_MS = 5 * 60 * 1000
let productCache: { products: Product[]; savedAt: number } | null = null

function readProductCache(): Product[] | null {
  if (productCache && Date.now() - productCache.savedAt < PRODUCT_CACHE_MS) return productCache.products
  try {
    const stored = JSON.parse(localStorage.getItem(PRODUCT_CACHE_KEY) || 'null')
    if (stored && Date.now() - stored.savedAt < PRODUCT_CACHE_MS && Array.isArray(stored.products)) {
      productCache = stored
      return stored.products
    }
  } catch { localStorage.removeItem(PRODUCT_CACHE_KEY) }
  return null
}

function saveProductCache(products: Product[]) {
  productCache = { products, savedAt: Date.now() }
  try { localStorage.setItem(PRODUCT_CACHE_KEY, JSON.stringify(productCache)) } catch { /* storage may be full */ }
}

function clearProductCache() {
  productCache = null
  try { localStorage.removeItem(PRODUCT_CACHE_KEY) } catch { /* storage unavailable */ }
}

async function gasFetch(action: string, payload?: Json): Promise<Json> {
  const url = `${API_URL}?action=${encodeURIComponent(action)}`

  const body = payload ? JSON.stringify(payload) : undefined

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
    },
    body,
  })

  if (!response.ok) {
    let message = `HTTP ${response.status}: ${response.statusText}`
    try {
      const error = await response.json()
      if (typeof error?.message === 'string') message = error.message
    } catch {
      // Keep the HTTP fallback when the proxy did not return JSON.
    }
    throw new Error(message)
  }

  const data = await response.json()

  if (data && data.success === false) {
    throw new Error(data.message || 'Request failed')
  }

  return data
}

export type Product = {
  id: string
  barcode: string
  name: string
  category: string
  price: number
  costPrice: number
  stockQty: number
  lowStockThreshold: number
  requiresAgeCheck: boolean
  imageUrl: string
  createdAt: string
}

export type SaleItem = {
  id: string
  saleId: string
  productId: string
  productName: string
  quantity: number
  unitPrice: number
  subtotal: number
  unitCost: number
  profit: number
}

export type Sale = {
  id: string
  cashierId: string
  cashierName: string
  totalAmount: number
  paymentMethod: string
  ageVerified: boolean
  createdAt: string
  items: SaleItem[]
}

export type User = {
  id: string
  name: string
  email: string
  role: string
}

export const api = {
  async getProducts(forceRefresh = false): Promise<Product[]> {
    if (!forceRefresh) {
      const cached = readProductCache()
      if (cached) return cached
    }
    const data = await gasFetch('getProducts')
    const products = Array.isArray(data) ? data as Product[] : []
    saveProductCache(products)
    return products
  },

  async getProductByBarcode(barcode: string): Promise<Product | null> {
    const data = await gasFetch('getProductByBarcode', { barcode })
    return (data.product as Product | undefined) ?? null
  },

  async searchProducts(query: string): Promise<Product[]> {
    const cached = readProductCache()
    if (cached) {
      const normalized = query.trim().toLowerCase()
      return cached.filter((product) => product.name.toLowerCase().includes(normalized) || product.category.toLowerCase().includes(normalized) || product.barcode.includes(normalized))
    }
    const data = await gasFetch('searchProducts', { query })
    return Array.isArray(data) ? data : []
  },

  async getCategories(): Promise<string[]> {
    const data = await gasFetch('getCategories')
    return Array.isArray(data) ? data : []
  },

  async getSales(startDate?: string, endDate?: string): Promise<Sale[]> {
    const params: Json = {}
    if (startDate) params.startDate = startDate
    if (endDate) params.endDate = endDate
    const data = await gasFetch('getSales', params)
    return Array.isArray(data) ? data : []
  },

  async googleLogin(idToken: string): Promise<User> {
    const data = await gasFetch('googleLogin', { idToken })
    return data.user as User
  },

  async getEmployees(): Promise<User[]> {
    const data = await gasFetch('getEmployees')
    return Array.isArray(data) ? data as User[] : []
  },

  async addEmployee(payload: { name: string; email: string }): Promise<User> {
    const data = await gasFetch('addEmployee', payload)
    return data.user as User
  },

  async deleteEmployee(id: string): Promise<void> {
    await gasFetch('deleteEmployee', { id })
  },

  async createSale(payload: {
    cashierId: string
    cashierName: string
    items: { productId: string; quantity: number }[]
    ageVerified: boolean
    paymentMethod: string
  }): Promise<Sale> {
    const data = await gasFetch('createSale', payload)
    clearProductCache()
    return data.sale as Sale
  },

  async addProduct(payload: {
    barcode: string
    name: string
    category: string
    price: number
    costPrice: number
    stockQty: number
    lowStockThreshold: number
    requiresAgeCheck: boolean
    imageBase64?: string
    imageFileName?: string
  }): Promise<Product> {
    const data = await gasFetch('addProduct', payload)
    clearProductCache()
    return data.product as Product
  },

  async updateProduct(payload: {
    id: string
    barcode?: string
    name?: string
    category?: string
    price?: number
    costPrice?: number
    stockQty?: number
    lowStockThreshold?: number
    requiresAgeCheck?: boolean
    imageBase64?: string
    imageFileName?: string
  }): Promise<void> {
    await gasFetch('updateProduct', payload)
    clearProductCache()
  },

  async deleteProduct(id: string): Promise<void> {
    await gasFetch('deleteProduct', { id })
    clearProductCache()
  },
}
