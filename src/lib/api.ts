import { supabase } from './supabase'
import { sortCategories, type CategoryLocale } from './category'

export const AUTH_TOKEN_KEY = 'supabase-auth-session'

const PRODUCT_CACHE_KEY = 'hxu-products-v3'
const EMPLOYEE_CACHE_KEY = 'hxu-employees-v1'
const SALES_CACHE_PREFIX = 'hxu-sales-v1:'
const CUSTOMER_BALANCE_CACHE_KEY = 'hxu-customer-balances-v1'
const PRODUCT_CACHE_MS = 15 * 60 * 1000
const EMPLOYEE_CACHE_MS = 10 * 60 * 1000
const CUSTOMER_BALANCE_CACHE_MS = 30 * 1000

export type Product = {
  id: string
  barcode: string
  name: string
  category: string
  productColor: string
  productSize: string
  price: number
  costPrice: number
  purchaseCost: number
  purchaseUnit: 'unit' | 'pack' | 'case'
  stockQty: number
  lowStockThreshold: number
  unitsPerPack: number
  packsPerCase: number
  packPrice: number
  casePrice: number
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
  saleUnit: 'unit' | 'pack' | 'case'
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

export type CashTransaction = {
  id: string
  type: 'outside_income' | 'expense'
  amount: number
  note: string
  createdAt: string
  createdBy: string
}

export type CustomerLedgerEntry = {
  id: string
  customerName: string
  saleId: string
  entryType: 'sale_credit' | 'payment' | 'deposit' | 'deposit_applied'
  amount: number
  note: string
  createdAt: string
}

export type CustomerBalance = {
  customerName: string
  creditDue: number
  depositBalance: number
  netBalance: number
}

export type ProductGroup = 'all' | 'unit' | 'both'

export const PRODUCT_GROUPS: { id: ProductGroup; label: string; description: string }[] = [
  { id: 'all', label: 'အားလုံး', description: 'ပစ္စည်းအားလုံး' },
  { id: 'unit', label: 'တစ်ခုချင်းသာ', description: 'ဘူး/အထုပ် သို့မဟုတ် တစ်ခုချင်းသာ ရောင်းမည့်ပစ္စည်း' },
  { id: 'both', label: 'ပါကင် + တစ်ခုချင်း', description: 'ပါကင်နှင့် ဘူး/အထုပ် နှစ်မျိုးရောင်းမည့်ပစ္စည်း' },
]

export function productMatchesGroup(product: Product, group: ProductGroup): boolean {
  if (group === 'all') return true
  if (group === 'both') return product.saleType === 'both'
  return product.saleType !== 'both'
}

export function isProductLowStock(product: Product): boolean {
  const threshold = Math.max(0, product.lowStockThreshold || 0)
  if (product.saleType === 'both') {
    const unitsPerPack = Math.max(2, product.unitsPerPack || 2)
    const fullPacks = Math.floor(product.stockQty / unitsPerPack)
    const looseUnits = product.stockQty % unitsPerPack
    // Warn when either sale level is low: full packs or the opened pack's units.
    return fullPacks <= threshold || looseUnits <= threshold
  }
  return product.stockQty <= threshold
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
    purchaseCost: asNumber(value.purchaseCost ?? value.purchase_cost ?? value.costPrice ?? value.cost_price),
    purchaseUnit: (() => { const purchaseUnit = asString(value.purchaseUnit ?? value.purchase_unit, 'unit'); return purchaseUnit === 'pack' || purchaseUnit === 'case' ? purchaseUnit : 'unit' })(),
    stockQty: asInteger(value.stockQty ?? value.stock_qty),
    lowStockThreshold: asInteger(value.lowStockThreshold ?? value.low_stock_threshold),
    unitsPerPack: Math.max(1, asInteger(value.unitsPerPack ?? value.units_per_pack) || 1),
    packsPerCase: Math.max(1, asInteger(value.packsPerCase ?? value.packs_per_case) || 1),
    packPrice: asNumber(value.packPrice ?? value.pack_price),
    casePrice: asNumber(value.casePrice ?? value.case_price),
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
    saleUnit: (() => { const unit = asString(value.saleUnit ?? value.sale_unit); return unit === 'case' || unit === 'pack' ? unit : 'unit' })(),
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

function normalizeCashTransaction(value: unknown): CashTransaction | null {
  if (!isRecord(value)) return null
  const id = asString(value.id)
  const type = asString(value.type)
  if (!id || (type !== 'outside_income' && type !== 'expense')) return null
  return {
    id,
    type,
    amount: asNumber(value.amount),
    note: asString(value.note),
    createdAt: asString(value.createdAt ?? value.created_at),
    createdBy: asString(value.createdBy ?? value.created_by),
  }
}

function normalizeCustomerLedgerEntry(value: unknown): CustomerLedgerEntry | null {
  if (!isRecord(value)) return null
  const id = asString(value.id)
  const entryType = asString(value.entryType ?? value.entry_type)
  if (!id || !['sale_credit', 'payment', 'deposit', 'deposit_applied'].includes(entryType)) return null
  return {
    id,
    customerName: asString(value.customerName ?? value.customer_name),
    saleId: asString(value.saleId ?? value.sale_id),
    entryType: entryType as CustomerLedgerEntry['entryType'],
    amount: asNumber(value.amount),
    note: asString(value.note),
    createdAt: asString(value.createdAt ?? value.created_at),
  }
}

function normalizeCustomerBalance(value: unknown): CustomerBalance | null {
  if (!isRecord(value)) return null
  const customerName = asString(value.customerName ?? value.customer_name)
  if (!customerName) return null
  return {
    customerName,
    creditDue: asNumber(value.creditDue ?? value.credit_due),
    depositBalance: asNumber(value.depositBalance ?? value.deposit_balance),
    netBalance: asNumber(value.netBalance ?? value.net_balance),
  }
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

function readCustomerBalanceCache(): CustomerBalance[] | null {
  try {
    const stored = JSON.parse(localStorage.getItem(CUSTOMER_BALANCE_CACHE_KEY) || 'null') as { balances?: unknown; savedAt?: number } | null
    if (!stored || !Array.isArray(stored.balances) || !stored.savedAt || Date.now() - stored.savedAt >= CUSTOMER_BALANCE_CACHE_MS) return null
    return stored.balances.map(normalizeCustomerBalance).filter((item): item is CustomerBalance => item !== null)
  } catch { return null }
}

function saveCustomerBalanceCache(balances: CustomerBalance[]) {
  try { localStorage.setItem(CUSTOMER_BALANCE_CACHE_KEY, JSON.stringify({ balances, savedAt: Date.now() })) } catch { /* storage unavailable */ }
}

function clearCustomerBalanceCache() {
  try { localStorage.removeItem(CUSTOMER_BALANCE_CACHE_KEY) } catch { /* storage unavailable */ }
}

function salesCacheKey(startDate?: string, endDate?: string) { return `${SALES_CACHE_PREFIX}${startDate || ''}:${endDate || ''}` }

let productsFetchInFlight: Promise<Product[]> | null = null
let customerBalancesFetchInFlight: Promise<CustomerBalance[]> | null = null
const salesFetchInFlight = new Map<string, Promise<Sale[]>>()

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

function isEnglishLanguage() {
  return typeof window !== 'undefined' && window.localStorage.getItem('hxu-language') === 'en'
}

function localizedError(english: string, myanmar: string) {
  return isEnglishLanguage() ? english : myanmar
}

function throwDatabaseError(error: { message?: string } | null): never {
  throw new Error(error?.message || localizedError('The data request failed. Please try again.', 'ဒေတာတောင်းဆိုမှု မအောင်မြင်ပါ။ ထပ်မံကြိုးစားပါ။'))
}

function productPayload(payload: Record<string, unknown>) {
  const output: Record<string, unknown> = {}
  const textFields: [string, string][] = [['barcode', 'barcode'], ['name', 'name'], ['category', 'category'], ['productColor', 'product_color'], ['productSize', 'product_size']]
  textFields.forEach(([source, target]) => { if (payload[source] !== undefined) output[target] = asString(payload[source]) })
  const numberFields: [string, string][] = [['price', 'price'], ['costPrice', 'cost_price'], ['purchaseCost', 'purchase_cost'], ['stockQty', 'stock_qty'], ['lowStockThreshold', 'low_stock_threshold'], ['packPrice', 'pack_price'], ['casePrice', 'case_price']]
  numberFields.forEach(([source, target]) => { if (payload[source] !== undefined) output[target] = source === 'stockQty' || source === 'lowStockThreshold' ? asInteger(payload[source]) : asNumber(payload[source]) })
  if (payload.unitsPerPack !== undefined) output.units_per_pack = Math.max(1, asInteger(payload.unitsPerPack) || 1)
  if (payload.packsPerCase !== undefined) output.packs_per_case = Math.max(1, asInteger(payload.packsPerCase) || 1)
  if (payload.saleType !== undefined) output.sale_type = asString(payload.saleType, 'both')
  if (payload.purchaseUnit !== undefined) output.purchase_unit = asString(payload.purchaseUnit, 'unit')
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
  const { data, error } = await supabase.from('products').select('id,barcode,name,category,product_color,product_size,price,cost_price,purchase_cost,purchase_unit,stock_qty,low_stock_threshold,units_per_pack,packs_per_case,pack_price,case_price,sale_type,requires_age_check,image_url,created_at').eq('is_active', true).order('name', { ascending: true })
  if (error) throwDatabaseError(error)
  return (data || []).map(normalizeProduct).filter((product): product is Product => product !== null)
}

async function fetchSales(startDate?: string, endDate?: string): Promise<Sale[]> {
  let query = supabase.from('sales').select('id,cashier_id,cashier_name,cashier_email,total_amount,paid_amount,balance_due,customer_name,is_credit,settled_at,payment_method,age_verified,created_at,sale_items(id,sale_id,product_id,product_name,quantity,unit_price,subtotal,unit_cost,profit,sale_unit,sale_quantity)').order('created_at', { ascending: false })
  if (startDate) query = query.gte('created_at', `${startDate}T00:00:00+06:30`)
  if (endDate) query = query.lte('created_at', `${endDate}T23:59:59+06:30`)
  const { data, error } = await query
  if (error) throwDatabaseError(error)
  return (data || []).map(normalizeSale).filter((sale): sale is Sale => sale !== null)
}

function fetchProductsOnce(): Promise<Product[]> {
  if (!productsFetchInFlight) {
    productsFetchInFlight = fetchProducts().finally(() => { productsFetchInFlight = null })
  }
  return productsFetchInFlight
}

function fetchSalesOnce(startDate?: string, endDate?: string): Promise<Sale[]> {
  const key = salesCacheKey(startDate, endDate)
  const existing = salesFetchInFlight.get(key)
  if (existing) return existing
  const request = fetchSales(startDate, endDate).finally(() => { salesFetchInFlight.delete(key) })
  salesFetchInFlight.set(key, request)
  return request
}

export const api = {
  async getProducts(forceRefresh = false): Promise<Product[]> {
    if (!forceRefresh) {
      const cached = readProductCache()
      if (cached) return cached
    }
    const products = await fetchProductsOnce()
    saveProductCache(products)
    return products
  },

  async getProductsStaleFirst(onFresh?: (products: Product[]) => void): Promise<{ products: Product[]; fromCache: boolean }> {
    const cached = readProductCache()
    if (cached) {
      void fetchProductsOnce().then((fresh) => { saveProductCache(fresh); onFresh?.(fresh) }).catch(() => {})
      return { products: cached, fromCache: true }
    }
    const products = await fetchProductsOnce()
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

  async getCategories(locale: CategoryLocale = 'my'): Promise<string[]> {
    return sortCategories((await this.getProducts()).map((product) => product.category), locale)
  },

  async getSales(startDate?: string, endDate?: string, forceRefresh = false): Promise<Sale[]> {
    const cacheKey = salesCacheKey(startDate, endDate)
    if (!forceRefresh) {
      const cached = readSalesCache(cacheKey)
      if (cached) return cached
    }
    const sales = await fetchSalesOnce(startDate, endDate)
    saveSalesCache(cacheKey, sales)
    return sales
  },

  async getSalesStaleFirst(startDate?: string, endDate?: string, onFresh?: (sales: Sale[]) => void): Promise<{ sales: Sale[]; fromCache: boolean }> {
    const cacheKey = salesCacheKey(startDate, endDate)
    const cached = readSalesCache(cacheKey)
    if (cached) {
      void fetchSalesOnce(startDate, endDate).then((fresh) => { saveSalesCache(cacheKey, fresh); onFresh?.(fresh) }).catch(() => {})
      return { sales: cached, fromCache: true }
    }
    const sales = await fetchSalesOnce(startDate, endDate)
    saveSalesCache(cacheKey, sales)
    return { sales, fromCache: false }
  },

  async getCashTransactions(startDate?: string, endDate?: string): Promise<CashTransaction[]> {
    let query = supabase.from('cash_transactions').select('id,type,amount,note,created_at,created_by').order('created_at', { ascending: false })
    if (startDate) query = query.gte('created_at', `${startDate}T00:00:00+06:30`)
    if (endDate) query = query.lte('created_at', `${endDate}T23:59:59+06:30`)
    const { data, error } = await query
    if (error) throwDatabaseError(error)
    return (data || []).map(normalizeCashTransaction).filter((transaction): transaction is CashTransaction => transaction !== null)
  },

  async addCashTransaction(payload: { type: CashTransaction['type']; amount: number; note?: string }): Promise<CashTransaction> {
    const { data, error } = await supabase.from('cash_transactions').insert({ type: payload.type, amount: asNumber(payload.amount), note: payload.note?.trim() || '' }).select('id,type,amount,note,created_at,created_by').single()
    if (error) throwDatabaseError(error)
    const transaction = normalizeCashTransaction(data)
    if (!transaction) throw new Error(localizedError('The cash transaction response was invalid.', 'ငွေစာရင်းအဖြေ မမှန်ကန်ပါ။'))
    return transaction
  },

  async updateCashTransaction(payload: { id: string; type: CashTransaction['type']; amount: number; note?: string }): Promise<CashTransaction> {
    const { data, error } = await supabase.from('cash_transactions').update({ type: payload.type, amount: asNumber(payload.amount), note: payload.note?.trim() || '' }).eq('id', payload.id).select('id,type,amount,note,created_at,created_by').single()
    if (error) throwDatabaseError(error)
    const transaction = normalizeCashTransaction(data)
    if (!transaction) throw new Error(localizedError('The cash transaction response was invalid.', 'ငွေစာရင်းအဖြေ မမှန်ကန်ပါ။'))
    return transaction
  },

  async deleteCashTransaction(id: string): Promise<void> {
    const { error } = await supabase.from('cash_transactions').delete().eq('id', id)
    if (error) throwDatabaseError(error)
  },

  async getCurrentUser(): Promise<User | null> {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) throwDatabaseError(sessionError)
    if (!session?.user) return null
    const { data, error } = await supabase.from('profiles').select('id,name,email,role,is_authorized').eq('id', session.user.id).maybeSingle()
    if (error) throwDatabaseError(error)
    if (!data || data.is_authorized === false) {
      await supabase.auth.signOut()
      throw new Error(localizedError('An administrator must add this Google account to Employee Accounts before sign-in.', 'ဤဂူဂယ်အကောင့်ကို ဝင်ရောက်နိုင်ရန် အက်ဒမင်က ဝန်ထမ်းအကောင့်များထဲသို့ အရင်ထည့်ပေးရပါမည်။'))
    }
    return normalizeUser(data)
  },

  async signInWithGoogle(idToken: string): Promise<void> {
    const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken })
    if (error) throwDatabaseError(error)
  },

  async getEmployees(forceRefresh = false): Promise<User[]> {
    if (!forceRefresh) {
      const cached = readEmployeeCache()
      if (cached) return cached
    }
    const { data, error } = await supabase.from('profiles').select('id,name,email,role,is_authorized').order('name', { ascending: true })
    if (error) throwDatabaseError(error)
    const users = (data || []).map(normalizeUser).filter((user): user is User => user !== null)
    saveEmployeeCache(users)
    return users
  },

  async addEmployee(payload: { name: string; email: string }): Promise<User> {
    const { data, error } = await supabase.functions.invoke('invite-employee', { body: { name: payload.name, email: payload.email } })
    if (error) throwDatabaseError(error)
    const user = normalizeUser(data?.user || data)
    if (!user) throw new Error(localizedError('The employee invitation response was invalid.', 'ဝန်ထမ်းဖိတ်ကြားမှုအဖြေ မမှန်ကန်ပါ။'))
    saveEmployeeCache([...(readEmployeeCache() || []).filter((item) => item.id !== user.id), user])
    return user
  },

  async deleteEmployee(id: string): Promise<void> {
    const { error } = await supabase.functions.invoke('delete-employee', { body: { id } })
    if (error) throwDatabaseError(error)
    saveEmployeeCache((readEmployeeCache() || []).filter((user) => user.id !== id))
  },

  async recordPrintedReceipt(sale: Sale): Promise<void> {
    if (!sale.id || sale.id.startsWith('local-')) return
    const { error } = await supabase.from('printed_receipts').upsert({ sale_id: sale.id, printed_at: new Date().toISOString(), receipt_data: sale }, { onConflict: 'sale_id' })
    if (error) throwDatabaseError(error)
  },

  async getPrintedReceiptIds(saleIds: string[]): Promise<string[]> {
    if (!saleIds.length) return []
    const { data, error } = await supabase.from('printed_receipts').select('sale_id').in('sale_id', saleIds)
    if (error) throwDatabaseError(error)
    return ((data || []) as { sale_id: string }[]).map((row) => row.sale_id)
  },

  async getPrintedReceipt(saleId: string): Promise<Sale | null> {
    const { data, error } = await supabase.from('printed_receipts').select('receipt_data').eq('sale_id', saleId).maybeSingle()
    if (error) throwDatabaseError(error)
    return normalizeSale((data as { receipt_data?: unknown } | null)?.receipt_data || null)
  },

  async createSale(payload: { cashierId: string; cashierName: string; items: { productId: string; quantity: number; saleUnit: 'unit' | 'pack' | 'case' }[]; ageVerified: boolean; paymentMethod: string; customerName?: string; isCredit?: boolean; initialPaidAmount?: number }): Promise<Sale> {
    const useLedgerPayment = Boolean(payload.isCredit)
    const rpcName = useLedgerPayment ? 'create_sale_with_payment' : 'create_sale'
    const rpcArgs = {
      p_items: payload.items,
      p_age_verified: payload.ageVerified,
      p_payment_method: payload.paymentMethod,
      p_customer_name: payload.customerName || '',
      p_is_credit: payload.isCredit || false,
      ...(useLedgerPayment ? { p_initial_paid_amount: Math.max(0, asNumber(payload.initialPaidAmount)) } : {}),
    }
    const { data, error } = await supabase.rpc(rpcName, rpcArgs)
    if (error) throwDatabaseError(error)
    clearProductCache(); clearSalesCache(); clearCustomerBalanceCache()
    const sale = normalizeSale((data as Record<string, unknown> | null)?.sale || data)
    if (!sale) throw new Error(localizedError('The sale response was invalid.', 'အရောင်းအဖြေ မမှန်ကန်ပါ။'))
    return sale
  },

  async payCredit(saleId: string): Promise<Sale> {
    const { data, error } = await supabase.rpc('pay_credit', { p_sale_id: saleId })
    if (error) throwDatabaseError(error)
    clearSalesCache()
    const sale = normalizeSale((data as Record<string, unknown> | null)?.sale || data)
    if (!sale) throw new Error(localizedError('The credit payment response was invalid.', 'အကြွေးငွေပေးချေမှုအဖြေ မမှန်ကန်ပါ။'))
    return sale
  },

  async addCustomerPayment(payload: { customerName: string; amount: number; saleId?: string; note?: string }): Promise<{ applied: number; depositAdded: number; balanceDue: number }> {
    const { data, error } = await supabase.rpc('add_customer_payment', {
      p_customer_name: payload.customerName.trim(),
      p_amount: asNumber(payload.amount),
      p_sale_id: payload.saleId || null,
      p_note: payload.note?.trim() || '',
    })
    if (error) throwDatabaseError(error)
    clearSalesCache(); clearCustomerBalanceCache()
    const result = isRecord(data) ? data : {}
    return { applied: asNumber(result.applied), depositAdded: asNumber(result.depositAdded ?? result.deposit_added), balanceDue: asNumber(result.balanceDue ?? result.balance_due) }
  },

  async addCustomerDeposit(payload: { customerName: string; amount: number; note?: string }): Promise<{ applied: number; depositAdded: number; balanceDue: number }> {
    const { data, error } = await supabase.rpc('add_customer_deposit', {
      p_customer_name: payload.customerName.trim(),
      p_amount: asNumber(payload.amount),
      p_note: payload.note?.trim() || '',
    })
    if (error) throwDatabaseError(error)
    clearSalesCache(); clearCustomerBalanceCache()
    const result = isRecord(data) ? data : {}
    return { applied: asNumber(result.applied), depositAdded: asNumber(result.depositAdded ?? result.deposit_added), balanceDue: asNumber(result.balanceDue ?? result.balance_due) }
  },

  async deleteCustomerLedger(customerName: string): Promise<void> {
    const { error } = await supabase.rpc('delete_customer_ledger', { p_customer_name: customerName.trim() })
    if (error) throwDatabaseError(error)
    clearSalesCache(); clearCustomerBalanceCache()
  },

  async getCustomerBalances(forceRefresh = false): Promise<CustomerBalance[]> {
    if (!forceRefresh) {
      const cached = readCustomerBalanceCache()
      if (cached) return cached
    }
    if (!customerBalancesFetchInFlight) {
      customerBalancesFetchInFlight = (async () => {
        const { data, error } = await supabase.rpc('get_customer_balances')
        if (error) throwDatabaseError(error)
        const balances = (Array.isArray(data) ? data : []).map(normalizeCustomerBalance).filter((item): item is CustomerBalance => item !== null)
        saveCustomerBalanceCache(balances)
        return balances
      })().finally(() => { customerBalancesFetchInFlight = null })
    }
    return customerBalancesFetchInFlight!
  },

  async getCustomerLedger(customerName: string): Promise<CustomerLedgerEntry[]> {
    const { data, error } = await supabase.rpc('get_customer_ledger', { p_customer_name: customerName })
    if (error) throwDatabaseError(error)
    return (Array.isArray(data) ? data : []).map(normalizeCustomerLedgerEntry).filter((item): item is CustomerLedgerEntry => item !== null)
  },

  async addProduct(payload: { barcode: string; name: string; category: string; productColor?: string; productSize?: string; price: number; costPrice: number; purchaseCost?: number; purchaseUnit?: 'unit' | 'pack' | 'case'; stockQty: number; lowStockThreshold: number; unitsPerPack: number; packsPerCase?: number; packPrice: number; casePrice?: number; saleType: 'unit' | 'pack' | 'both'; requiresAgeCheck: boolean; imageBase64?: string; imageFileName?: string }): Promise<Product> {
    const id = crypto.randomUUID()
    const imageUrl = payload.imageBase64 ? await uploadProductImage(id, payload.imageBase64, payload.imageFileName || 'product.jpg') : ''
    const { data, error } = await supabase.from('products').insert({ id, ...productPayload(payload), image_url: imageUrl }).select().single()
    if (error) throwDatabaseError(error)
    const product = normalizeProduct(data)
    if (!product) throw new Error(localizedError('The product response was invalid.', 'ပစ္စည်းအဖြေ မမှန်ကန်ပါ။'))
    clearProductCache()
    return product
  },

  async updateProduct(payload: { id: string; barcode?: string; name?: string; category?: string; productColor?: string; productSize?: string; price?: number; costPrice?: number; purchaseCost?: number; purchaseUnit?: 'unit' | 'pack' | 'case'; stockQty?: number; lowStockThreshold?: number; unitsPerPack?: number; packsPerCase?: number; packPrice?: number; casePrice?: number; saleType?: 'unit' | 'pack' | 'both'; requiresAgeCheck?: boolean; imageBase64?: string; imageFileName?: string }): Promise<Product> {
    const updates: Record<string, unknown> = productPayload(payload)
    if (payload.imageBase64) updates.image_url = await uploadProductImage(payload.id, payload.imageBase64, payload.imageFileName || 'product.jpg')
    const { data, error } = await supabase.from('products').update(updates).eq('id', payload.id).select().single()
    if (error) throwDatabaseError(error)
    const product = normalizeProduct(data)
    if (!product) throw new Error(localizedError('The product response was invalid.', 'ပစ္စည်းအဖြေ မမှန်ကန်ပါ။'))
    clearProductCache()
    return product
  },

  async deleteProduct(id: string): Promise<void> {
    const { error } = await supabase.from('products').delete().eq('id', id)
    if (error) {
      const errorCode = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code?: unknown }).code || '') : ''
      const errorMessage = String(error.message || '').toLowerCase()
      const productIsReferencedBySale = errorCode === '23503' || errorMessage.includes('sale_items') || errorMessage.includes('foreign key')
      if (!productIsReferencedBySale) throwDatabaseError(error)

      // Preserve sales history when sale_items still references this product.
      const { error: archiveError } = await supabase.from('products').update({ is_active: false }).eq('id', id)
      if (archiveError) throwDatabaseError(archiveError)
    }
    clearProductCache()
  },
}
