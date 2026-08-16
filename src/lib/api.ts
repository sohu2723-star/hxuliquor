// The Apps Script response does not reliably include CORS headers, so the browser
// reaches it through the same-origin Vercel proxy.
const API_URL = '/api/gas'
export const AUTH_TOKEN_KEY = 'hxu-google-id-token'
const REQUEST_TIMEOUT_MS = 20_000
const MAX_READ_RETRIES = 2
const PRODUCT_CACHE_KEY = 'hxu-products-v3'
const PRODUCT_CACHE_MS = 5 * 60 * 1000

const RETRYABLE_ACTIONS = new Set([
  'getProducts',
  'getProductByBarcode',
  'searchProducts',
  'getCategories',
  'getSales',
  'getEmployees',
  'googleLogin',
])

type JsonObject = Record<string, unknown>

function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown, fallback = ''): string {
  return value === null || value === undefined ? fallback : String(value).trim()
}

function asNumber(value: unknown, fallback = 0): number {
  const number = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''))
  return Number.isFinite(number) ? number : fallback
}

function asInteger(value: unknown, fallback = 0): number {
  const number = asNumber(value, fallback)
  return Number.isFinite(number) ? Math.trunc(number) : fallback
}

function asBoolean(value: unknown): boolean {
  return value === true || value === 'TRUE' || value === 'true' || value === 1 || value === '1'
}

function unwrapArray(value: unknown, key: string): unknown[] {
  if (Array.isArray(value)) return value
  if (isRecord(value) && Array.isArray(value[key])) return value[key]
  return []
}

function unwrapObject(value: unknown, key: string): JsonObject | null {
  if (isRecord(value) && isRecord(value[key])) return value[key]
  return isRecord(value) ? value : null
}

function normalizeProduct(value: unknown): Product | null {
  if (!isRecord(value)) return null
  const id = asString(value.id)
  if (!id) return null
  return {
    id,
    barcode: asString(value.barcode),
    name: asString(value.name, 'Unnamed product'),
    category: asString(value.category),
    price: asNumber(value.price),
    costPrice: asNumber(value.costPrice),
    stockQty: asInteger(value.stockQty),
    lowStockThreshold: asInteger(value.lowStockThreshold),
    requiresAgeCheck: asBoolean(value.requiresAgeCheck),
    imageUrl: asString(value.imageUrl),
    createdAt: asString(value.createdAt),
  }
}

function normalizeUser(value: unknown): User | null {
  if (!isRecord(value)) return null
  const id = asString(value.id)
  const email = asString(value.email).toLowerCase()
  if (!id || !email) return null
  return {
    id,
    name: asString(value.name, email.split('@')[0]),
    email,
    role: asString(value.role, 'employee').toLowerCase(),
  }
}

function normalizeSale(value: unknown): Sale | null {
  if (!isRecord(value)) return null
  const id = asString(value.id)
  if (!id) return null
  const rawItems = Array.isArray(value.items) ? value.items : []
  const items: SaleItem[] = rawItems.filter(isRecord).map((item) => ({
    id: asString(item.id),
    saleId: asString(item.saleId, id),
    productId: asString(item.productId),
    productName: asString(item.productName, 'Unnamed product'),
    quantity: asInteger(item.quantity),
    unitPrice: asNumber(item.unitPrice),
    subtotal: asNumber(item.subtotal),
    unitCost: asNumber(item.unitCost),
    profit: asNumber(item.profit),
  }))
  return {
    id,
    cashierId: asString(value.cashierId),
    cashierName: asString(value.cashierName, 'Cashier'),
    totalAmount: asNumber(value.totalAmount),
    paymentMethod: asString(value.paymentMethod),
    ageVerified: asBoolean(value.ageVerified),
    createdAt: asString(value.createdAt),
    items,
  }
}

let productCache: { products: Product[]; savedAt: number } | null = null

function readProductCache(): Product[] | null {
  if (productCache && Date.now() - productCache.savedAt < PRODUCT_CACHE_MS) return productCache.products
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(PRODUCT_CACHE_KEY) || 'null')
    if (isRecord(stored) && Array.isArray(stored.products) && Number.isFinite(Number(stored.savedAt))) {
      const products = stored.products.map(normalizeProduct).filter((product): product is Product => product !== null)
      if (products.length === stored.products.length && Date.now() - Number(stored.savedAt) < PRODUCT_CACHE_MS) {
        productCache = { products, savedAt: Number(stored.savedAt) }
        return products
      }
    }
  } catch {
    try { localStorage.removeItem(PRODUCT_CACHE_KEY) } catch { /* storage unavailable */ }
  }
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

class ApiError extends Error {
  readonly retryable: boolean

  constructor(message: string, retryable = false) {
    super(message)
    this.name = 'ApiError'
    this.retryable = retryable
  }
}

async function gasFetch(action: string, payload?: JsonObject): Promise<unknown> {
  const url = `${API_URL}?action=${encodeURIComponent(action)}`
  const token = action === 'googleLogin' ? '' : (() => {
    try { return localStorage.getItem(AUTH_TOKEN_KEY) || '' } catch { return '' }
  })()
  const requestPayload = token ? { ...(payload ?? {}), accessToken: token } : (payload ?? {})
  const body = JSON.stringify(requestPayload)
  const maxAttempts = RETRYABLE_ACTIONS.has(action) ? MAX_READ_RETRIES + 1 : 1
  let lastError: unknown

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body,
        signal: controller.signal,
      })
      const text = await response.text()
      let data: unknown = null
      try {
        data = text ? JSON.parse(text) : null
      } catch {
        throw new ApiError('Server returned an invalid response. Please reload and try again.', response.status >= 500)
      }

      if (!response.ok) {
        const message = isRecord(data) && typeof data.message === 'string'
          ? data.message
          : `Server error (${response.status})`
        throw new ApiError(message, response.status >= 500 || response.status === 429)
      }

      if (isRecord(data) && data.success === false) {
        throw new ApiError(asString(data.message, 'Request failed'))
      }

      return data
    } catch (error) {
      lastError = error
      const retryable = error instanceof ApiError ? error.retryable : true
      if (!retryable || attempt >= maxAttempts - 1) break
      await new Promise((resolve) => window.setTimeout(resolve, 600 * (attempt + 1)))
    } finally {
      window.clearTimeout(timeoutId)
    }
  }

  if (lastError instanceof ApiError) throw lastError
  if (lastError instanceof DOMException && lastError.name === 'AbortError') {
    throw new Error('Network timeout. Server response ကြာနေပါသည်။ Retry ပြန်လုပ်ပါ။')
  }
  throw new Error('Network error. Internet သို့မဟုတ် server connection ကို စစ်ပြီး Retry ပြန်လုပ်ပါ။')
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
    if (forceRefresh) clearProductCache()
    else {
      const cached = readProductCache()
      if (cached) return cached
    }
    const data = unwrapArray(await gasFetch('getProducts'), 'products')
    const products = data.map(normalizeProduct).filter((product): product is Product => product !== null)
    saveProductCache(products)
    return products
  },

  async getProductByBarcode(barcode: string): Promise<Product | null> {
    const data = unwrapObject(await gasFetch('getProductByBarcode', { barcode: asString(barcode) }), 'product')
    return normalizeProduct(data)
  },

  async searchProducts(query: string): Promise<Product[]> {
    const normalized = asString(query).toLowerCase()
    const cached = readProductCache()
    if (cached) {
      const cachedResults = cached.filter((product) => (
        asString(product.name).toLowerCase().includes(normalized) ||
        asString(product.category).toLowerCase().includes(normalized) ||
        asString(product.barcode).toLowerCase().includes(normalized)
      ))
      // A product may have been added from another device while this cache is
      // still alive. If cache misses, ask the backend before showing "not found".
      if (cachedResults.length > 0) return cachedResults
    }
    const data = unwrapArray(await gasFetch('searchProducts', { query: normalized }), 'products')
    const products = data.map(normalizeProduct).filter((product): product is Product => product !== null)
    if (products.length > 0) saveProductCache(products)
    return products
  },

  async getCategories(): Promise<string[]> {
    const data = unwrapArray(await gasFetch('getCategories'), 'categories')
    return data.map((category) => asString(category)).filter(Boolean)
  },

  async getSales(startDate?: string, endDate?: string): Promise<Sale[]> {
    const params: JsonObject = {}
    if (startDate) params.startDate = startDate
    if (endDate) params.endDate = endDate
    const data = unwrapArray(await gasFetch('getSales', params), 'sales')
    return data.map(normalizeSale).filter((sale): sale is Sale => sale !== null)
  },

  async googleLogin(idToken: string): Promise<User> {
    const data = unwrapObject(await gasFetch('googleLogin', { idToken }), 'user')
    const user = normalizeUser(data)
    if (!user) throw new Error('Login response မမှန်ပါ။ Google login ပြန်လုပ်ပါ။')
    return user
  },

  async getEmployees(): Promise<User[]> {
    const data = unwrapArray(await gasFetch('getEmployees'), 'employees')
    return data.map(normalizeUser).filter((user): user is User => user !== null)
  },

  async addEmployee(payload: { name: string; email: string }): Promise<User> {
    const data = unwrapObject(await gasFetch('addEmployee', payload), 'user')
    const user = normalizeUser(data)
    if (!user) throw new Error('Employee response မမှန်ပါ။ Backend deployment ကို စစ်ပါ။')
    return user
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
    const data = unwrapObject(await gasFetch('createSale', payload), 'sale')
    clearProductCache()
    const sale = normalizeSale(data)
    if (!sale) throw new Error('Sale response မမှန်ပါ။')
    return sale
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
    const data = unwrapObject(await gasFetch('addProduct', payload), 'product')
    clearProductCache()
    const product = normalizeProduct(data)
    if (!product) throw new Error('Product response မမှန်ပါ။ Backend deployment ကို စစ်ပါ။')
    return product
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
