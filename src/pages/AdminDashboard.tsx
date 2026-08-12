import { useEffect, useMemo, useState } from 'react'
import AppHeader from '../components/AppHeader'
import { api, type Product, type Sale } from '../lib/api'
import { formatCurrency } from '../lib/format'

export default function AdminDashboard() {
  const [sales, setSales] = useState<Sale[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    const now = new Date(); const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
    Promise.all([api.getSales(start), api.getProducts()]).then(([saleData, productData]) => { setSales(saleData); setProducts(productData) }).catch((e) => setError(e.message))
  }, [])
  const report = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const costs = new Map(products.map((product) => [product.id, product.costPrice]))
    const summarize = (entries: Sale[]) => ({ revenue: entries.reduce((sum, sale) => sum + sale.totalAmount, 0), profit: entries.flatMap((sale) => sale.items).reduce((sum, item) => {
      const unitCost = item.unitCost || costs.get(item.productId) || 0
      return sum + (item.profit || ((item.unitPrice - unitCost) * item.quantity))
    }, 0), count: entries.length })
    return { today: summarize(sales.filter((sale) => String(sale.createdAt).slice(0, 10) === today)), month: summarize(sales) }
  }, [products, sales])
  const lowStock = products.filter((product) => product.stockQty <= product.lowStockThreshold)
  const Card = ({ title, data }: { title: string; data: { revenue: number; profit: number; count: number } }) => <section className="bg-white rounded-lg shadow p-5"><h2 className="font-bold text-lg">{title}</h2><p className="mt-3 text-gray-500">ရောင်းရငွေ</p><p className="text-2xl font-bold text-primary">{formatCurrency(data.revenue)}</p><p className="mt-2">အမြတ်: <b className="text-green-700">{formatCurrency(data.profit)}</b></p><p>ဘောင်ချာ: {data.count}</p></section>
  return <div className="min-h-screen bg-gray-100"><AppHeader /><main className="max-w-5xl mx-auto p-4 lg:p-6"><h1 className="text-2xl font-bold mb-5">Income & Stock Dashboard</h1>{error && <p className="bg-red-50 text-red-700 p-3 mb-4">{error}</p>}<div className="grid md:grid-cols-2 gap-4"><Card title="ယနေ့ Daily" data={report.today} /><Card title="ယခုလ Monthly" data={report.month} /></div><section className="mt-5 bg-white rounded-lg shadow p-5"><h2 className="font-bold text-lg text-red-700">ကုန်တော့မည့်ပစ္စည်း Warning ({lowStock.length})</h2><div className="mt-3 divide-y">{lowStock.length ? lowStock.map((product) => <div key={product.id} className="py-2 flex justify-between"><span>{product.name}</span><b className="text-red-600">Stock {product.stockQty}</b></div>) : <p className="text-green-700">Stock အားလုံးလုံလောက်ပါသည်</p>}</div></section></main></div>
}
