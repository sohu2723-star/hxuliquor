const API_URL = '/api/gas'

export const AUTH_TOKEN_KEY = 'minimart-pos-token'

const PRODUCT_CACHE_KEY = 'hxu-products-v3'
const EMPLOYEE_CACHE_KEY = 'hxu-employees-v1'
const SALES_CACHE_PREFIX = 'hxu-sales-v1:'
const PRODUCT_CACHE_MS = 15 * 60 * 1000

const RETRYABLE_ACTIONS = new Set(['getProducts', 'getProductByBarcode', 'searchProducts', 'getCategories', 'getSales', 'getEmployees'])
const MAX_READ_RETRIES = 2
const REQUEST_TIMEOUT_MS = 20000

let productCache: { products: Product[]; savedAt: number } | null = null
let employeeCache: User[] | null = null
const salesCache = new Map<string, Sale[]>()

type Json = Record<string, unknown>

export type Product = {
  id: string
  barcode: string
  name: string
  category: string
  productColor: string
  productSize: string
  price: number
  costPrice: number
  stockQty: number
  lowStockThreshold: number
  unitsPerPack: number
  packPrice: number
  saleType: 'unit' | 'pack' | 'both'
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
  saleUnit: 'unit' | 'pack'
  saleQuantity: number
}

export type Sale = {
  id: string
  cashierId: string
  cashierName: string
  cashierEmail: string
  totalAmount: number
  paidAmount: number
  balanceDue: number
  customerName: string
  isCredit: boolean
  settledAt: string
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
  sessionToken?: string
}


export type ProductGroup = 'all' | 'barcode' | 'noBarcode' | 'pack'

export const PRODUCT_GROUPS: { id: ProductGroup; label: string; description: string }[] = [
  { id: 'all', label: 'အားလုံး', description: 'Product အားလုံး' },
  { id: 'barcode', label: 'Barcode ရှိ', description: 'Scan ဖတ်ရောင်းမည့် product' },
  { id: 'noBarcode', label: 'Barcode မရှိ', description: 'ပုံနှိပ်ပြီး manual ရောင်းမည့် product' },
  { id: 'pack', label: 'ပါကင်လိုက်', description: 'ပါကင်လိုက်ရောင်းမည့် product' },
]

export function productMatchesGroup(product: Product, group: ProductGroup): boolean {
  if (group === 'all') return true
  if (group === 'pack') return product.saleType === 'pack'
  if (group === 'barcode') return product.saleType !== 'pack' && Boolean(product.barcode.trim())
  return product.saleType !== 'pack' && !product.barcode.trim()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value
    : typeof value === 'number' || typeof value === 'boolean' ? String(value)
    : fallback
}

function asNumber(value: unknown): number {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

function asInteger(value: unknown): number {
  return Math.trunc(asNumber(value))
}

function asBoolean(value: unknown): boolean {
  return value === true || asString(value).toLowerCase() === 'true'
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
    productColor: asString(value.productColor),
    productSize: asString(value.productSize),
    price: asNumber(value.price),
    costPrice: asNumber(value.costPrice),
    stockQty: asInteger(value.stockQty),
    lowStockThreshold: asInteger(value.lowStockThreshold),
    unitsPerPack: Math.max(1, asInteger(value.unitsPerPack) || 1),
    packPrice: asNumber(value.packPrice),
    saleType: value.saleType === 'pack' || value.saleType === 'unit' ? value.saleType : 'both',
    requiresAgeCheck: asBoolean(value.requiresAgeCheck),
    imageUrl: asString(value.imageUrl),
    createdAt: asString(value.createdAt),
  }
}

function normalizeSale(value: unknown): Sale | null {
  if (!isRecord(value)) return null
  const id = asString(value.id)
  if (!id) return null
  const items = Array.isArray(value.items) ? value.items.map(normalizeSaleItem).filter((item): item is SaleItem => item !== null) : []
  return {
    id,
    cashierId: asString(value.cashierId),
    cashierName: asString(value.cashierName),
    cashierEmail: asString(value.cashierEmail),
    totalAmount: asNumber(value.totalAmount),
    paidAmount: value.paidAmount === undefined ? asNumber(value.totalAmount) : asNumber(value.paidAmount),
    balanceDue: asNumber(value.balanceDue),
    customerName: asString(value.customerName),
    isCredit: asBoolean(value.isCredit),
    settledAt: asString(value.settledAt),
    paymentMethod: asString(value.paymentMethod, 'Cash'),
    ageVerified: asBoolean(value.ageVerified),
    createdAt: asString(value.createdAt),
    items,
  }
}

function normalizeSaleItem(value: unknown): SaleItem | null {
  if (!isRecord(value)) return null
  const id = asString(value.id) || asString(value.productId)
  if (!id) return null
  return {
    id,
    saleId: asString(value.saleId),
    productId: asString(value.productId),
    productName: asString(value.productName, asString(value.name, 'Unknown product')),
    quantity: asInteger(value.quantity),
    unitPrice: asNumber(value.unitPrice),
    subtotal: asNumber(value.subtotal),
    unitCost: asNumber(value.unitCost),
    profit: asNumber(value.profit),
    saleUnit: asString(value.saleUnit) === 'pack' ? 'pack' : 'unit',
    saleQuantity: asInteger(value.saleQuantity) || asInteger(value.quantity),
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
    sessionToken: asString(value.sessionToken) || undefined,
  }
}

function unwrapArray(value: unknown, label: string): unknown[] {
  if (Array.isArray(value)) return value
  if (isRecord(value) && Array.isArray(value.data)) return value.data
  if (isRecord(value) && Array.isArray(value[label])) return value[label]
  return []
}

function unwrapObject(value: unknown, label: string): unknown {
  if (isRecord(value)) {
    if (isRecord(value.data)) return value.data
    if (isRecord(value[label])) return value[label]
    return value
  }
  return {}
}

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

function readEmployeeCache(): User[] | null {
  if (employeeCache) return employeeCache
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(EMPLOYEE_CACHE_KEY) || 'null')
    if (!Array.isArray(stored)) return null
    employeeCache = stored.map(normalizeUser).filter((user): user is User => user !== null)
    return employeeCache
  } catch { return null }
}

function saveEmployeeCache(users: User[]) {
  employeeCache = users
  try { localStorage.setItem(EMPLOYEE_CACHE_KEY, JSON.stringify(users)) } catch { /* storage unavailable */ }
}

function salesCacheKey(startDate?: string, endDate?: string) {
  return `${SALES_CACHE_PREFIX}${startDate || ''}:${endDate || ''}`
}

function readSalesCache(key: string): Sale[] | null {
  if (salesCache.has(key)) return salesCache.get(key) || null
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(key) || 'null')
    if (!Array.isArray(stored)) return null
    const sales = stored.map(normalizeSale).filter((sale): sale is Sale => sale !== null)
    salesCache.set(key, sales)
    return sales
  } catch { return null }
}

function saveSalesCache(key: string, sales: Sale[]) {
  salesCache.set(key, sales)
  try { localStorage.setItem(key, JSON.stringify(sales)) } catch { /* storage unavailable */ }
}

function clearSalesCache() {
  salesCache.clear()
  try {
    Object.keys(localStorage).filter((key) => key.startsWith(SALES_CACHE_PREFIX)).forEach((key) => localStorage.removeItem(key))
  } catch { /* storage unavailable */ }
}

export function normalizeBarcode(value: string): string {
  return String(value || '').trim().replace(/[\s-]+/g, '').toUpperCase()
}

export function barcodeMatches(savedValue: string, scannedValue: string): boolean {
  const scanned = normalizeBarcode(scannedValue)
  if (!scanned) return false
  return String(savedValue || '').split(/[,\n;]/).some((entry) => {
    const saved = normalizeBarcode(entry)
    if (!saved) return false
    if (saved.endsWith('*')) return scanned.startsWith(saved.slice(0, -1))
    return saved === scanned || `0${saved}` === scanned || saved === `0${scanned}`
  })
}

function upsertProductCache(product: Product) {
  const cached = readProductCache() || []
  saveProductCache([product, ...cached.filter((item) => item.id !== product.id)])
}

class ApiError extends Error {
  readonly retryable: boolean

  constructor(message: string, retryable = false) {
    super(message)
    this.name = 'ApiError'
    this.retryable = retryable
  }
}

async function gasFetch(action: string, payload?: Json): Promise<unknown> {
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

export const api = {
  async getProducts(forceRefresh = false): Promise<Product[]> {
    if (!forceRefresh) {
      const cached = readProductCache()
      if (cached) return cached
    }
    const data = await gasFetch('getProducts')
    const products = unwrapArray(data, 'products').map(normalizeProduct).filter((product): product is Product => product !== null)
    saveProductCache(products)
    return products
  },

  async getProductsStaleFirst(): Promise<{ products: Product[]; fromCache: boolean }> {
    const cached = readProductCache()
    if (cached) {
      void gasFetch('getProducts')
        .then((data) => {
          const fresh = unwrapArray(data, 'products').map(normalizeProduct).filter((p): p is Product => p !== null)
          if (fresh.length > 0) saveProductCache(fresh)
        })
        .catch(() => {})
      return { products: cached, fromCache: true }
    }
    const data = await gasFetch('getProducts')
    const products = unwrapArray(data, 'products').map(normalizeProduct).filter((product): product is Product => product !== null)
    saveProductCache(products)
    return { products, fromCache: false }
  },

  async getProductByBarcode(barcode: string): Promise<Product | null> {
    const localProduct = readProductCache()?.find((product) => barcodeMatches(product.barcode, barcode))
    if (localProduct) return localProduct
    const data = await gasFetch('getProductByBarcode', { barcode })
    return normalizeProduct(unwrapObject(data, 'product'))
  },

  async searchProducts(query: string): Promise<Product[]> {
    const cached = readProductCache()
    if (cached) {
      const normalized = query.trim().toLowerCase()
      return cached.filter((product) =>
        product.name.toLowerCase().includes(normalized) ||
        product.category.toLowerCase().includes(normalized) ||
        product.barcode.includes(normalized))
    }
    const data = await gasFetch('searchProducts', { query })
    return unwrapArray(data, 'products').map(normalizeProduct).filter((product): product is Product => product !== null)
  },

  async getCategories(): Promise<string[]> {
    const cached = readProductCache()
    if (cached) return [...new Set(cached.map((product) => product.category).filter(Boolean))].sort()
    const data = unwrapArray(await gasFetch('getCategories'), 'categories')
    return data.map((category) => asString(category)).filter(Boolean)
  },

  async getSales(startDate?: string, endDate?: string, forceRefresh = false): Promise<Sale[]> {
    const cacheKey = salesCacheKey(startDate, endDate)
    if (!forceRefresh) {
      const cached = readSalesCache(cacheKey)
      if (cached) return cached
    }
    const params: Json = {}
    if (startDate) params.startDate = startDate
    if (endDate) params.endDate = endDate
    const data = unwrapArray(await gasFetch('getSales', params), 'sales')
    const sales = data.map(normalizeSale).filter((sale): sale is Sale => sale !== null)
    saveSalesCache(cacheKey, sales)
    return sales
  },

  async googleLogin(idToken: string): Promise<User> {
    const data = unwrapObject(await gasFetch('googleLogin', { idToken }), 'user')
    const user = normalizeUser(data)
    if (!user?.sessionToken) throw new Error('Login response မမှန်ပါ။ Google login ပြန်လုပ်ပါ။')
    return user
  },

  async getEmployees(forceRefresh = false): Promise<User[]> {
    if (!forceRefresh) {
      const cached = readEmployeeCache()
      if (cached) return cached
    }
    const data = unwrapArray(await gasFetch('getEmployees'), 'employees')
    const users = data.map(normalizeUser).filter((user): user is User => user !== null)
    saveEmployeeCache(users)
    return users
  },

  async addEmployee(payload: { name: string; email: string }): Promise<User> {
    const data = unwrapObject(await gasFetch('addEmployee', payload), 'user')
    const user = normalizeUser(data)
    if (!user) throw new Error('Employee response မမှန်ပါ။ Backend deployment ကို စစ်ပါ။')
    saveEmployeeCache([...(readEmployeeCache() || []).filter((item) => item.id !== user.id), user])
    return user
  },

  async deleteEmployee(id: string): Promise<void> {
    await gasFetch('deleteEmployee', { id })
    saveEmployeeCache((readEmployeeCache() || []).filter((user) => user.id !== id))
  },

  async createSale(payload: {
    cashierId: string
    cashierName: string
    items: { productId: string; quantity: number; saleUnit: 'unit' | 'pack' }[]
    ageVerified: boolean
    paymentMethod: string
    customerName?: string
    isCredit?: boolean
  }): Promise<Sale> {
    const data = await gasFetch('createSale', payload)
    clearProductCache()
    clearSalesCache()
    const sale = normalizeSale(unwrapObject(data, 'sale'))
    if (!sale) throw new Error('Sale response မမှန်ပါ။')
    return sale
  },

  async payCredit(saleId: string): Promise<Sale> {
    const data = await gasFetch('payCredit', { saleId })
    const sale = normalizeSale(unwrapObject(data, 'sale'))
    if (!sale) throw new Error('အကြွေးငွေပေးချေမှု response မမှန်ပါ။')
    clearSalesCache()
    return sale
  },

  async addProduct(payload: {
    barcode: string
    name: string
    category: string
    productColor?: string
    productSize?: string
    price: number
    costPrice: number
    stockQty: number
    lowStockThreshold: number
    unitsPerPack: number
    packPrice: number
    saleType: 'unit' | 'pack' | 'both'
    requiresAgeCheck: boolean
    imageBase64?: string
    imageFileName?: string
  }): Promise<Product> {
    const data = await gasFetch('addProduct', payload)
    const product = normalizeProduct(unwrapObject(data, 'product'))
    if (!product) throw new Error('Product response မမှန်ပါ။')
    upsertProductCache(product)
    return product
  },

  async updateProduct(payload: {
    id: string
    barcode?: string
    name?: string
    category?: string
    productColor?: string
    productSize?: string
    price?: number
    costPrice?: number
    stockQty?: number
    lowStockThreshold?: number
    unitsPerPack?: number
    packPrice?: number
    saleType?: 'unit' | 'pack' | 'both'
    requiresAgeCheck?: boolean
    imageBase64?: string
    imageFileName?: string
  }): Promise<Product> {
    const data = await gasFetch('updateProduct', payload)
    const product = normalizeProduct(unwrapObject(data, 'product'))
    if (!product) throw new Error('Product response မမှန်ပါ။')
    upsertProductCache(product)
    return product
  },

  async deleteProduct(id: string): Promise<void> {
    await gasFetch('deleteProduct', { id })
    clearProductCache()
  },
}
