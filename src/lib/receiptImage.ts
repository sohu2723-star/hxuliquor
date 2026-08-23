import type { Sale } from './api'

const PAPER_WIDTH = 384
const LOGO_SVG = `<svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="hxu-logo-bg" x1="18" y1="12" x2="78" y2="84" gradientUnits="userSpaceOnUse"><stop stop-color="#7c2d12"/><stop offset="1" stop-color="#b45309"/></linearGradient></defs><rect x="8" y="8" width="80" height="80" rx="22" fill="url(#hxu-logo-bg)"/><path d="M30 24v17h15V24h9v48h-9V50H30v22h-9V24h9Zm25 0h11l-13 23 14 25H56l-8-15-8 15H29l14-25-13-23h11l7 14 7-14Z" fill="#fff7ed"/><path d="M68 22c6 5 9 12 9 21 0 15-9 25-22 33 4-9 4-17 1-24 8-4 13-11 13-21 0-3-.3-6-1-9Z" fill="#fde68a"/><path d="M66 56c6 1 10 5 10 10 0 7-6 11-17 11H38c-4 0-7-3-7-7h25c7 0 10-2 10-5 0-2-2-4-6-5l6-4Z" fill="#fff7ed"/></svg>`

function amount(value: number) {
  return `Ks ${Math.round(Number(value) || 0).toLocaleString('en-US')}`
}

function paymentLabel(method: string) {
  if (method === 'Cash') return 'ငွေသား'
  if (method === 'MMQR Pay' || method === 'Mobile Wallet') return 'MMQR Pay'
  if (method === 'Wave Pay') return 'Wave Pay'
  if (method === 'KPay') return 'KPay'
  return 'အကြွေး'
}

function wrapText(context: CanvasRenderingContext2D, value: string, maxWidth: number) {
  const words = String(value || '').split(/\s+/).filter(Boolean)
  if (!words.length) return ['']
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (current && context.measureText(candidate).width > maxWidth) {
      lines.push(current)
      current = word
    } else {
      current = candidate
    }
  }
  if (current) lines.push(current)
  return lines
}

function loadLogo() {
  const image = new Image()
  return new Promise<HTMLImageElement>((resolve, reject) => {
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Receipt logo could not be prepared.'))
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(LOGO_SVG)}`
  })
}

export async function createReceiptImage(sale: Sale) {
  const canvas = document.createElement('canvas')
  canvas.width = PAPER_WIDTH
  canvas.height = 2200
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Receipt image is not available in this browser.')

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#000000'
  context.textBaseline = 'top'
  context.textAlign = 'center'
  let y = 18

  try {
    const logo = await loadLogo()
    context.drawImage(logo, 140, y, 104, 104)
    y += 116
  } catch {
    // Print remains available without a logo if the browser blocks SVG image loading.
  }

  const center = (value: string, font: string, gap: number) => {
    context.textAlign = 'center'
    context.font = font
    context.fillText(value, PAPER_WIDTH / 2, y)
    y += gap
  }
  const separator = () => {
    context.strokeStyle = '#000000'
    context.lineWidth = 2
    context.beginPath()
    context.moveTo(12, y + 4)
    context.lineTo(PAPER_WIDTH - 12, y + 4)
    context.stroke()
    y += 20
  }
  const left = (value: string, font = '22px "Noto Sans Myanmar", Arial, sans-serif') => {
    context.textAlign = 'left'
    context.font = font
    wrapText(context, value, PAPER_WIDTH - 28).forEach((line) => {
      context.fillText(line, 14, y)
      y += 31
    })
    context.textAlign = 'center'
  }

  center('Hsu Myat San Mini Store', 'bold 28px Arial, sans-serif', 38)
  center('အရောင်းဘောင်ချာ', 'bold 22px "Noto Sans Myanmar", Arial, sans-serif', 36)
  separator()
  left(new Date(sale.createdAt).toLocaleString('my-MM', { timeZone: 'Asia/Yangon' }))
  left(`Customer ID: ${String(sale.id || '').slice(-12).toUpperCase()}`)
  left(`ငွေပေးချေမှု: ${paymentLabel(sale.paymentMethod)}`)
  if (sale.customerName) left(`ဝယ်ယူသူ: ${sale.customerName}`)
  separator()

  for (const item of sale.items) {
    context.textAlign = 'left'
    context.font = 'bold 22px "Noto Sans Myanmar", Arial, sans-serif'
    const itemLines = wrapText(context, `${item.productName} × ${item.saleQuantity}`, PAPER_WIDTH - 150)
    itemLines.forEach((line) => {
      context.fillText(line, 14, y)
      y += 29
    })
    context.textAlign = 'right'
    context.font = 'bold 22px Arial, sans-serif'
    context.fillText(amount(item.subtotal), PAPER_WIDTH - 14, y - 29)
    context.textAlign = 'center'
    y += 8
  }

  separator()
  context.textAlign = 'left'
  context.font = 'bold 28px "Noto Sans Myanmar", Arial, sans-serif'
  context.fillText('စုစုပေါင်း', 14, y)
  context.textAlign = 'right'
  context.font = 'bold 28px Arial, sans-serif'
  context.fillText(amount(sale.totalAmount), PAPER_WIDTH - 14, y)
  y += 42
  if (sale.isCredit) {
    context.textAlign = 'left'
    context.font = 'bold 22px "Noto Sans Myanmar", Arial, sans-serif'
    context.fillText('ကျန်ငွေ', 14, y)
    context.textAlign = 'right'
    context.font = 'bold 22px Arial, sans-serif'
    context.fillText(amount(sale.balanceDue), PAPER_WIDTH - 14, y)
    y += 36
  }
  center('ကျေးဇူးတင်ပါသည်', '22px "Noto Sans Myanmar", Arial, sans-serif', 38)
  y += 12

  const output = document.createElement('canvas')
  output.width = PAPER_WIDTH
  output.height = Math.max(80, y)
  const outputContext = output.getContext('2d')
  if (!outputContext) throw new Error('Receipt image output is not available.')
  outputContext.drawImage(canvas, 0, 0, PAPER_WIDTH, output.height, 0, 0, PAPER_WIDTH, output.height)

  const blob = await new Promise<Blob | null>((resolve) => output.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('Receipt image could not be created.')
  return blob
}

export function receiptImageFilename(sale: Sale) {
  return `HXU-${String(sale.id || '').slice(-12).toUpperCase()}.png`
}
