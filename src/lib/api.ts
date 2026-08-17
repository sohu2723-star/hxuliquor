import { supabase } from './supabase'

export const AUTH_TOKEN_KEY = 'supabase-auth-session'

const PRODUCT_CACHE_KEY = 'hxu-products-v3'
const EMPLOYEE_CACHE_KEY = 'hxu-employees-v1'
const SALES_CACHE_PREFIX = 'hxu-sales-v1:'
const PRODUCT_CACHE_MS = 15 * 60 * 1000
const EMPLOYEE_CACHE_MS = 10 * 60 * 1000

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

export type ProductGroup = 'all' | 'barcode' | 'noBarcode' | 'pack' | 'both'

export const PRODUCT_GROUPS: { id: ProductGroup; label: string; description: string }[] = [
  { id: 'all', label: 'အားလုံး', description: 'Product အားလုံး' },
  { id: 'barcode', label: 'Barcode ရှိ', description: 'Scan ဖတ်ရောင်းမည့် product' },
  { id: 'noBarcode', label: 'Barcode မရှိ', description: 'ပုံနှိပ်ပြီး manual ရောင်းမည့် product' },
  { id: 'pack', label: 'ပါကင်လိုက်', description: 'ပါကင် stock သီးသန့်ထားမည့် product' },
  { id: 'both', label: 'ပါကင် + တစ်ခုချင်း', description: 'stock တစ်ခုတည်းမှ ပါကင်လိုက်/တစ်ခုချင်း နှစ်မျိုးရောင်းမည့် product' },
]

export function productMatchesGroup(product: Product, group: ProductGroup): boolean {
  if (group === 'all') return true
  if (group === 'pack') return product.saleType === 'pack'
  if (group === 'both') return product.saleType === 'both'
  if (group === 'barcode') return product.saleType !== 'pack' && Boolean(product.barcode.trim())
  return product.saleType !== 'pack' && !product.barcode.trim()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : typeof value === 'number' || typeof value === 'boolean' ? String(value) : fallback
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
    productColor: asString(value.productColor ?? value.product_color),
    productSize: asString(value.productSize ?? value.product_size),
    price: asNumber(value.price),
    costPrice: asNumber(value.costPrice ?? value.cost_price),
    stockQty: asInteger(value.stockQty ?? value.stock_qty),
    lowStockThreshold: asInteger(value.lowStockThreshold ?? value.low_stock_threshold),
    unitsPerPack: Math.max(1, asInteger(value.unitsPerPack ?? value.units_per_pack) || 1),
    packPrice: asNumber(value.packPrice ?? value.pack_price),
    saleType: (() => { const saleType = asString(value.saleType ?? value.sale_type, 'both'); return saleType === 'pack' || saleType === 'unit' ? saleType : 'both' })(),
    requiresAgeCheck: asBoolean(value.requiresAgeCheck ?? value.requires_age_check),
    imageUrl: asString(value.imageUrl ?? value.image_url),
    createdAt: asString(value.createdAt ?? value.created_at),
  }
}

function normalizeSaleItem(value: unknown): SaleItem | null {
  if (!isRecord(value)) return null
  const id = asString(value.id) || asString(value.productId ?? value.product_id)
  if (!id) return null
  return {
    id,
    saleId: asString(value.saleId ?? value.sale_id),
    productId: asString(value.productId ?? value.product_id),
    productName: asString(value.productName ?? value.product_name ?? value.name, 'Unknown product'),
    quantity: asInteger(value.quantity),
    unitPrice: asNumber(value.unitPrice ?? value.unit_price),
    subtotal: asNumber(value.subtotal),
    unitCost: asNumber(value.unitCost ?? value.unit_cost),
    profit: asNumber(value.profit),
    saleUnit: asString(value.saleUnit ?? value.sale_unit) === 'pack' ? 'pack' : 'unit',
    saleQuantity: asInteger(value.saleQuantity ?? value.sale_quantity) || asInteger(value.quantity),
  }
}

function normalizeSale(value: unknown): Sale | null {
  if (!isRecord(value)) return null
  const id = asString(value.id)
  if (!id) return null
  const rawItems = Array.isArray(value.items) ? value.items : Array.isArray(value.sale_items) ? value.sale_items : []
  return {
    id,
    cashierId: asString(value.cashierId ?? value.cashier_id ?? value.cashierLegacyId ?? value.cashier_legacy_id),
    cashierName: asString(value.cashierName ?? value.cashier_name),
    cashierEmail: asString(value.cashierEmail ?? value.cashier_email),
    totalAmount: asNumber(value.totalAmount ?? value.total_amount),
    paidAmount: value.paidAmount === undefined && value.paid_amount === undefined ? asNumber(value.totalAmount ?? value.total_amount) : asNumber(value.paidAmount ?? value.paid_amount),
    balanceDue: asNumber(value.balanceDue ?? value.balance_due),
    customerName: asString(value.customerName ?? value.customer_name),
    isCredit: asBoolean(value.isCredit ?? value.is_credit),
    settledAt: asString(value.settledAt ?? value.settled_at),
    paymentMethod: asString(value.paymentMethod ?? value.payment_method, 'Cash'),
    ageVerified: asBoolean(value.ageVerified ?? value.age_verified),
    createdAt: asString(value.createdAt ?? value.created_at),
    items: rawItems.map(normalizeSaleItem).filter((item): item is SaleItem => item !== null),
  }
}

function normalizeUser(value: unknown): User | null {
  if (!isRecord(value)) return null
  const id = asString(value.id)
  const email = asString(value.email).toLowerCase()
  if (!id || !email) return null
  return { id, name: asString(value.name, email.split('@')[0]), email, role: asString(value.role, 'employee').toLowerCase() }
}

function readProductCache(): Product[] | null {
  try {
    const stored = JSON.parse(localStorage.getItem(PRODUCT_CACHE_KEY) || 'null') as { products?: unknown; savedAt?: number } | null
    if (!stored || !Array.isArray(stored.products) || !stored.savedAt || Date.now() - stored.savedAt >= PRODUCT_CACHE_MS) return null
    return stored.products.map(normalizeProduct).filter((product): product is Product => product !== null)
  } catch { return null }
}

function saveProductCache(products: Product[]) {
  try { localStorage.setItem(PRODUCT_CACHE_KEY, JSON.stringify({ products, savedAt: Date.now() })) } catch { /* storage unavailable */ }
}

function clearProductCache() {
  try { localStorage.removeItem(PRODUCT_CACHE_KEY) } catch { /* storage unavailable */ }
}

function readEmployeeCache(): User[] | null {
  try {
    const stored = JSON.parse(localStorage.getItem(EMPLOYEE_CACHE_KEY) || 'null') as { users?: unknown; savedAt?: number } | null
    if (!stored || !Array.isArray(stored.users) || !stored.savedAt || Date.now() - stored.savedAt >= EMPLOYEE_CACHE_MS) return null
    return stored.users.map(normalizeUser).filter((user): user is User => user !== null)
  } catch { return null }
}

function saveEmployeeCache(users: User[]) {
  try { localStorage.setItem(EMPLOYEE_CACHE_KEY, JSON.stringify({ users, savedAt: Date.now() })) } catch { /* storage unavailable */ }
}

function salesCacheKey(startDate?: string, endDate?: string) { return `${SALES_CACHE_PREFIX}${startDate || ''}:${endDate || ''}` }

function readSalesCache(key: string): Sale[] | null {
  try {
    const stored = JSON.parse(localStorage.getItem(key) || 'null')
    return Array.isArray(stored) ? stored.map(normalizeSale).filter((sale): sale is Sale => sale !== null) : null
  } catch { return null }
}

function saveSalesCache(key: string, sales: Sale[]) {
  try { localStorage.setItem(key, JSON.stringify(sales)) } catch { /* storage unavailable */ }
}

function clearSalesCache() {
  try { Object.keys(localStorage).filter((key) => key.startsWith(SALES_CACHE_PREFIX)).forEach((key) => localStorage.removeItem(key)) } catch { /* storage unavailable */ }
}

export function normalizeBarcode(value: string): string { return String(value || '').trim().replace(/[\s-]+/g, '').toUpperCase() }

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

function throwDatabaseError(error: { message?: string } | null): never {
  throw new Error(error?.message || 'Supabase request failed. Please try again.')
}

function productPayload(payload: Record<string, unknown>) {
  const output: Record<string, unknown> = {}
  const textFields: [string, string][] = [['barcode', 'barcode'], ['name', 'name'], ['category', 'category'], ['productColor', 'product_color'], ['productSize', 'product_size']]
  textFields.forEach(([source, target]) => { if (payload[source] !== undefined) output[target] = asString(payload[source]) })
  const numberFields: [string, string][] = [['price', 'price'], ['costPrice', 'cost_price'], ['stockQty', 'stock_qty'], ['lowStockThreshold', 'low_stock_threshold'], ['packPrice', 'pack_price']]
  numberFields.forEach(([source, target]) => { if (payload[source] !== undefined) output[target] = source === 'stockQty' || source === 'lowStockThreshold' ? asInteger(payload[source]) : asNumber(payload[source]) })
  if (payload.unitsPerPack !== undefined) output.units_per_pack = Math.max(1, asInteger(payload.unitsPerPack) || 1)
  if (payload.saleType !== undefined) output.sale_type = asString(payload.saleType, 'both')
  if (payload.requiresAgeCheck !== undefined) output.requires_age_check = asBoolean(payload.requiresAgeCheck)
  return output
}

async function uploadProductImage(productId: string, imageBase64: string, fileName: string): Promise<string> {
  const raw = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64
  const binary = atob(raw)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  const extension = (fileName.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const path = `${productId}/${Date.now()}.${extension}`
  const { error } = await supabase.storage.from('product-images').upload(path, new Blob([bytes], { type: `image/${extension === 'jpg' ? 'jpeg' : extension}` }), { upsert: true, contentType: `image/${extension === 'jpg' ? 'jpeg' : extension}` })
  if (error) throwDatabaseError(error)
  return supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl
}

async function fetchProducts(): Promise<Product[]> {
  const { data, error } = await supabase.from('products').select('*').eq('is_active', true).order('name', { ascending: true })
  if (error) throwDatabaseError(error)
  return (data || []).map(normalizeProduct).filter((product): product is Product => product !== null)
}

async function fetchSales(startDate?: string, endDate?: string): Promise<Sale[]> {
  let query = supabase.from('sales').select('*, sale_items(*)').order('created_at', { ascending: false })
  if (startDate) query = query.gte('created_at', `${startDate}T00:00:00+06:30`)
  if (endDate) query = query.lte('created_at', `${endDate}T23:59:59+06:30`)
  const { data, error } = await query
  if (error) throwDatabaseError(error)
  return (data || []).map(normalizeSale).filter((sale): sale is Sale => sale !== null)
}

export const api = {
  async getProducts(forceRefresh = false): Promise<Product[]> {
    if (!forceRefresh) {
      const cached = readProductCache()
      if (cached) return cached
    }
    const products = await fetchProducts()
    saveProductCache(products)
    return products
  },

  async getProductsStaleFirst(onFresh?: (products: Product[]) => void): Promise<{ products: Product[]; fromCache: boolean }> {
    const cached = readProductCache()
    if (cached) {
      void fetchProducts().then((fresh) => { saveProductCache(fresh); onFresh?.(fresh) }).catch(() => {})
      return { products: cached, fromCache: true }
    }
    const products = await fetchProducts()
    saveProductCache(products)
    return { products, fromCache: false }
  },

  async getProductByBarcode(barcode: string): Promise<Product | null> {
    return (await this.getProducts()).find((product) => barcodeMatches(product.barcode, barcode)) || null
  },

  async searchProducts(query: string): Promise<Product[]> {
    const products = await this.getProducts()
    const normalized = query.trim().toLowerCase()
    return products.filter((product) => product.name.toLowerCase().includes(normalized) || product.category.toLowerCase().includes(normalized) || product.barcode.toLowerCase().includes(normalized))
  },

  async getCategories(): Promise<string[]> {
    return [...new Set((await this.getProducts()).map((product) => product.category).filter(Boolean))].sort()
  },

  async getSales(startDate?: string, endDate?: string, forceRefresh = false): Promise<Sale[]> {
    const cacheKey = salesCacheKey(startDate, endDate)
    if (!forceRefresh) {
      const cached = readSalesCache(cacheKey)
      if (cached) return cached
    }
    const sales = await fetchSales(startDate, endDate)
    saveSalesCache(cacheKey, sales)
    return sales
  },

  async getSalesStaleFirst(startDate?: string, endDate?: string, onFresh?: (sales: Sale[]) => void): Promise<{ sales: Sale[]; fromCache: boolean }> {
    const cacheKey = salesCacheKey(startDate, endDate)
    const cached = readSalesCache(cacheKey)
    if (cached) {
      void fetchSales(startDate, endDate).then((fresh) => { saveSalesCache(cacheKey, fresh); onFresh?.(fresh) }).catch(() => {})
      return { sales: cached, fromCache: true }
    }
    const sales = await fetchSales(startDate, endDate)
    saveSalesCache(cacheKey, sales)
    return { sales, fromCache: false }
  },

  async getCurrentUser(): Promise<User | null> {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) throwDatabaseError(sessionError)
    if (!session?.user) return null
    const metadata = session.user.user_metadata || {}
    const fallback = { id: session.user.id, name: metadata.full_name || metadata.name || session.user.email?.split('@')[0] || '', email: session.user.email || '', role: 'employee' }
    const { data, error } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle()
    if (error) throwDatabaseError(error)
    if (!data) {
      const { data: created, error: createError } = await supabase.from('profiles').upsert({ id: session.user.id, name: fallback.name, email: fallback.email }, { onConflict: 'id' }).select().single()
      if (createError) throwDatabaseError(createError)
      return normalizeUser(created)
    }
    return normalizeUser(data)
  },

  async signInWithGoogle(): Promise<void> {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/login` } })
    if (error) throwDatabaseError(error)
  },

  async getEmployees(forceRefresh = false): Promise<User[]> {
    if (!forceRefresh) {
      const cached = readEmployeeCache()
      if (cached) return cached
    }
    const { data, error } = await supabase.from('profiles').select('*').order('name', { ascending: true })
    if (error) throwDatabaseError(error)
    const users = (data || []).map(normalizeUser).filter((user): user is User => user !== null)
    saveEmployeeCache(users)
    return users
  },

  async addEmployee(payload: { name: string; email: string }): Promise<User> {
    const { data, error } = await supabase.functions.invoke('invite-employee', { body: { name: payload.name, email: payload.email } })
    if (error) throwDatabaseError(error)
    const user = normalizeUser(data?.user || data)
    if (!user) throw new Error('Employee invitation response မမှန်ပါ။')
    saveEmployeeCache([...(readEmployeeCache() || []).filter((item) => item.id !== user.id), user])
    return user
  },

  async deleteEmployee(id: string): Promise<void> {
    const { error } = await supabase.functions.invoke('delete-employee', { body: { id } })
    if (error) throwDatabaseError(error)
    saveEmployeeCache((readEmployeeCache() || []).filter((user) => user.id !== id))
  },

  async createSale(payload: { cashierId: string; cashierName: string; items: { productId: string; quantity: number; saleUnit: 'unit' | 'pack' }[]; ageVerified: boolean; paymentMethod: string; customerName?: string; isCredit?: boolean }): Promise<Sale> {
    const { data, error } = await supabase.rpc('create_sale', { p_items: payload.items, p_age_verified: payload.ageVerified, p_payment_method: payload.paymentMethod, p_customer_name: payload.customerName || '', p_is_credit: payload.isCredit || false })
    if (error) throwDatabaseError(error)
    clearProductCache(); clearSalesCache()
    const sale = normalizeSale((data as Record<string, unknown> | null)?.sale || data)
    if (!sale) throw new Error('Sale response မမှန်ပါ။')
    return sale
  },

  async payCredit(saleId: string): Promise<Sale> {
    const { data, error } = await supabase.rpc('pay_credit', { p_sale_id: saleId })
    if (error) throwDatabaseError(error)
    clearSalesCache()
    const sale = normalizeSale((data as Record<string, unknown> | null)?.sale || data)
    if (!sale) throw new Error('အကြွေးငွေပေးချေမှု response မမှန်ပါ။')
    return sale
  },

  async addProduct(payload: { barcode: string; name: string; category: string; productColor?: string; productSize?: string; price: number; costPrice: number; stockQty: number; lowStockThreshold: number; unitsPerPack: number; packPrice: number; saleType: 'unit' | 'pack' | 'both'; requiresAgeCheck: boolean; imageBase64?: string; imageFileName?: string }): Promise<Product> {
    const id = crypto.randomUUID()
    const imageUrl = payload.imageBase64 ? await uploadProductImage(id, payload.imageBase64, payload.imageFileName || 'product.jpg') : ''
    const { data, error } = await supabase.from('products').insert({ id, ...productPayload(payload), image_url: imageUrl }).select().single()
    if (error) throwDatabaseError(error)
    const product = normalizeProduct(data)
    if (!product) throw new Error('Product response မမှန်ပါ။')
    clearProductCache()
    return product
  },

  async updateProduct(payload: { id: string; barcode?: string; name?: string; category?: string; productColor?: string; productSize?: string; price?: number; costPrice?: number; stockQty?: number; lowStockThreshold?: number; unitsPerPack?: number; packPrice?: number; saleType?: 'unit' | 'pack' | 'both'; requiresAgeCheck?: boolean; imageBase64?: string; imageFileName?: string }): Promise<Product> {
    const updates: Record<string, unknown> = productPayload(payload)
    if (payload.imageBase64) updates.image_url = await uploadProductImage(payload.id, payload.imageBase64, payload.imageFileName || 'product.jpg')
    const { data, error } = await supabase.from('products').update(updates).eq('id', payload.id).select().single()
    if (error) throwDatabaseError(error)
    const product = normalizeProduct(data)
    if (!product) throw new Error('Product response မမှန်ပါ။')
    clearProductCache()
    return product
  },

  async deleteProduct(id: string): Promise<void> {
    const { error } = await supabase.from('products').update({ is_active: false }).eq('id', id)
    if (error) throwDatabaseError(error)
    clearProductCache()
  },
}
