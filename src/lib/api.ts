// Keep Apps Script behind our same-origin serverless endpoint. Apps Script web-app
// responses do not reliably include CORS headers, so browsers cannot call them
// directly even when the request itself does not trigger a preflight.
const API_URL = '/api/gas'

type Json = Record<string, unknown>

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
  async getProducts(): Promise<Product[]> {
    const data = await gasFetch('getProducts')
    return Array.isArray(data) ? data : []
  },

  async getProductByBarcode(barcode: string): Promise<Product | null> {
    const data = await gasFetch('getProductByBarcode', { barcode })
    return (data.product as Product | undefined) ?? null
  },

  async searchProducts(query: string): Promise<Product[]> {
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

  async createSale(payload: {
    cashierId: string
    cashierName: string
    items: { productId: string; quantity: number }[]
    ageVerified: boolean
    paymentMethod: string
  }): Promise<Sale> {
    const data = await gasFetch('createSale', payload)
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
  },

  async deleteProduct(id: string): Promise<void> {
    await gasFetch('deleteProduct', { id })
  },
}
