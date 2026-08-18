import type { Sale } from './api'
import { formatCurrency } from './format'

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function slipId(sale: Sale) {
  const date = new Date(sale.createdAt)
  const pad = (value: number) => String(value).padStart(2, '0')
  if (Number.isNaN(date.getTime())) return String(sale.id || '').slice(-8).toUpperCase()
  return `HXU-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

export function downloadReceipt(sale: Sale, language: 'my' | 'en' = 'my') {
  const isMyanmar = language === 'my'
  const title = isMyanmar ? 'အရောင်းဘောင်ချာ' : 'Sales Receipt'
  const total = isMyanmar ? 'စုစုပေါင်း' : 'Total'
  const cashier = isMyanmar ? 'ငွေရှင်းသူ' : 'Cashier'
  const payment = isMyanmar ? 'ငွေပေးချေမှု' : 'Payment'
  const customer = isMyanmar ? 'ဝယ်ယူသူ' : 'Customer'
  const credit = isMyanmar ? 'အကြွေးကျန်' : 'Balance due'
  const cash = sale.paymentMethod === 'Cash' ? (isMyanmar ? 'ငွေသား' : 'Cash') : sale.paymentMethod === 'Card' ? (isMyanmar ? 'ကတ်' : 'Card') : sale.paymentMethod === 'Mobile Wallet' ? (isMyanmar ? 'မိုဘိုင်းငွေ' : 'Mobile wallet') : (isMyanmar ? 'အကြွေး' : 'Credit')
  const createdAt = new Date(sale.createdAt).toLocaleString(isMyanmar ? 'my-MM' : 'en-GB', { timeZone: 'Asia/Yangon' })
  const items = sale.items.map((item) => `<tr><td>${escapeHtml(item.productName)} × ${item.saleQuantity}</td><td>${escapeHtml(formatCurrency(item.subtotal))}</td></tr>`).join('')
  const html = `<!doctype html><html lang="${isMyanmar ? 'my' : 'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} - ${escapeHtml(slipId(sale))}</title><style>body{font-family:Arial,"Noto Sans Myanmar",sans-serif;max-width:420px;margin:24px auto;padding:20px;color:#0f172a}h1{text-align:center;margin:0 0 4px}h2{text-align:center;color:#a16207;font-size:14px;margin:0 0 20px}p{margin:6px 0;font-size:13px}table{width:100%;border-collapse:collapse;margin-top:18px}td{padding:8px 0;border-bottom:1px dashed #cbd5e1}td:last-child{text-align:right;white-space:nowrap}.total{display:flex;justify-content:space-between;border-top:2px solid #0f172a;margin-top:14px;padding-top:12px;font-size:18px;font-weight:700}.balance{background:#fffbeb;padding:10px;margin-top:12px}@media print{body{margin:0;padding:8px;max-width:none}}</style></head><body><h1>HXU Liquor</h1><h2>${escapeHtml(title)}</h2><p>${escapeHtml(createdAt)}</p><p>${escapeHtml(cashier)}: ${escapeHtml(sale.cashierName)}</p><p>${escapeHtml(payment)}: ${escapeHtml(cash)}</p><p>Slip ID: ${escapeHtml(slipId(sale))}</p>${sale.customerName ? `<p>${escapeHtml(customer)}: ${escapeHtml(sale.customerName)}</p>` : ''}<table><tbody>${items}</tbody></table><div class="total"><span>${escapeHtml(total)}</span><span>${escapeHtml(formatCurrency(sale.totalAmount))}</span></div>${sale.isCredit ? `<div class="balance">${escapeHtml(credit)}: ${escapeHtml(formatCurrency(sale.balanceDue))}</div>` : ''}</body></html>`
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${slipId(sale)}.html`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
