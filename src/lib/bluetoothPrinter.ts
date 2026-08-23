import type { Sale } from './api'

const PRINTER_SERVICE_UUIDS = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  '0000ae30-0000-1000-8000-00805f9b34fb',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '0000ffe5-0000-1000-8000-00805f9b34fb',
  '0000ffe9-0000-1000-8000-00805f9b34fb',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
]

const PRINTER_WRITE_UUIDS = [
  '00002af1-0000-1000-8000-00805f9b34fb',
  '0000ae01-0000-1000-8000-00805f9b34fb',
  '0000ff01-0000-1000-8000-00805f9b34fb',
  '0000ff02-0000-1000-8000-00805f9b34fb',
  '0000ffe1-0000-1000-8000-00805f9b34fb',
  '0000ffe4-0000-1000-8000-00805f9b34fb',
  '0000ffea-0000-1000-8000-00805f9b34fb',
  '49535343-8841-43f4-a8d4-ecbe34729bb3',
]

const PRINTER_DEVICE_KEY = 'hxu-bluetooth-printer-name'
const PAPER_WIDTH_PX = 384

type BluetoothCharacteristicLike = {
  properties: { write?: boolean; writeWithoutResponse?: boolean }
  writeValue: (data: Uint8Array) => Promise<void>
  writeValueWithoutResponse?: (data: Uint8Array) => Promise<void>
}

type BluetoothServiceLike = {
  getCharacteristic: (uuid: string) => Promise<BluetoothCharacteristicLike>
  getCharacteristics: () => Promise<BluetoothCharacteristicLike[]>
}

type BluetoothServerLike = {
  connected: boolean
  getPrimaryService: (uuid: string) => Promise<BluetoothServiceLike>
  getPrimaryServices: () => Promise<BluetoothServiceLike[]>
}

type BluetoothDeviceLike = EventTarget & {
  name?: string
  gatt?: BluetoothServerLike & {
    connect: () => Promise<BluetoothServerLike>
  }
}

type BluetoothApiLike = {
  requestDevice: (options: { acceptAllDevices: boolean; optionalServices: string[] }) => Promise<BluetoothDeviceLike>
}

let connectedDevice: BluetoothDeviceLike | null = null
let writeCharacteristic: BluetoothCharacteristicLike | null = null

function bluetoothApi() {
  return (navigator as Navigator & { bluetooth?: BluetoothApiLike }).bluetooth
}

function assertBluetoothSupported() {
  if (!bluetoothApi()) {
    throw new Error('Bluetooth printing is not supported in this browser. Use Chrome on Android or desktop.')
  }
}

function bytes(...values: number[]) {
  return new Uint8Array(values)
}

function joinBytes(parts: Uint8Array[]) {
  const size = parts.reduce((total, part) => total + part.length, 0)
  const output = new Uint8Array(size)
  let offset = 0
  parts.forEach((part) => {
    output.set(part, offset)
    offset += part.length
  })
  return output
}

const LOGO_SVG = `<svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="hxu-logo-bg" x1="18" y1="12" x2="78" y2="84" gradientUnits="userSpaceOnUse"><stop stop-color="#7c2d12"/><stop offset="1" stop-color="#b45309"/></linearGradient></defs><rect x="8" y="8" width="80" height="80" rx="22" fill="url(#hxu-logo-bg)"/><path d="M30 24v17h15V24h9v48h-9V50H30v22h-9V24h9Zm25 0h11l-13 23 14 25H56l-8-15-8 15H29l14-25-13-23h11l7 14 7-14Z" fill="#fff7ed"/><path d="M68 22c6 5 9 12 9 21 0 15-9 25-22 33 4-9 4-17 1-24 8-4 13-11 13-21 0-3-.3-6-1-9Z" fill="#fde68a"/><path d="M66 56c6 1 10 5 10 10 0 7-6 11-17 11H38c-4 0-7-3-7-7h25c7 0 10-2 10-5 0-2-2-4-6-5l6-4Z" fill="#fff7ed"/></svg>`

function formatAmount(value: number) {
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

async function loadLogoImage() {
  const image = new Image()
  const source = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(LOGO_SVG)}`
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('Receipt logo could not be prepared.'))
    image.src = source
  })
  return image
}

async function renderReceiptRaster(sale: Sale) {
  const canvas = document.createElement('canvas')
  canvas.width = PAPER_WIDTH_PX
  canvas.height = 2400
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Receipt canvas is not available in this browser.')

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#000000'
  context.textBaseline = 'top'
  context.textAlign = 'center'

  let y = 18
  const center = (value: string, font: string, gap = 34) => {
    context.font = font
    context.fillText(value, PAPER_WIDTH_PX / 2, y)
    y += gap
  }
  const separator = () => {
    context.strokeStyle = '#000000'
    context.lineWidth = 2
    context.beginPath()
    context.moveTo(12, y + 4)
    context.lineTo(PAPER_WIDTH_PX - 12, y + 4)
    context.stroke()
    y += 18
  }
  const left = (value: string, font = '22px "Noto Sans Myanmar", Arial, sans-serif', gap = 31) => {
    context.textAlign = 'left'
    context.font = font
    wrapText(context, value, PAPER_WIDTH_PX - 28).forEach((line) => {
      context.fillText(line, 14, y)
      y += gap
    })
    context.textAlign = 'center'
  }

  try {
    const logo = await loadLogoImage()
    context.drawImage(logo, (PAPER_WIDTH_PX - 104) / 2, y, 104, 104)
    y += 116
  } catch {
    // The receipt remains printable if the logo cannot be rasterized.
  }

  center('Hsu Myat San Mini Store', 'bold 28px Arial, sans-serif', 38)
  center('အရောင်းဘောင်ချာ', 'bold 22px "Noto Sans Myanmar", Arial, sans-serif', 35)
  separator()
  left(new Date(sale.createdAt).toLocaleString('my-MM', { timeZone: 'Asia/Yangon' }))
  left(`Customer ID: ${String(sale.id || '').slice(-12).toUpperCase()}`)
  left(`ငွေပေးချေမှု: ${paymentLabel(sale.paymentMethod)}`)
  if (sale.customerName) left(`ဝယ်ယူသူ: ${sale.customerName}`)
  separator()

  for (const item of sale.items) {
    context.textAlign = 'left'
    context.font = 'bold 22px "Noto Sans Myanmar", Arial, sans-serif'
    const itemLines = wrapText(context, `${item.productName} × ${item.saleQuantity}`, PAPER_WIDTH_PX - 150)
    itemLines.forEach((line) => {
      context.fillText(line, 14, y)
      y += 29
    })
    context.textAlign = 'right'
    context.font = 'bold 22px Arial, sans-serif'
    context.fillText(formatAmount(item.subtotal), PAPER_WIDTH_PX - 14, y - 29)
    context.textAlign = 'center'
    y += 8
  }

  separator()
  context.textAlign = 'left'
  context.font = 'bold 28px "Noto Sans Myanmar", Arial, sans-serif'
  context.fillText('စုစုပေါင်း', 14, y)
  context.textAlign = 'right'
  context.font = 'bold 28px Arial, sans-serif'
  context.fillText(formatAmount(sale.totalAmount), PAPER_WIDTH_PX - 14, y)
  y += 42
  if (sale.isCredit) {
    context.textAlign = 'left'
    context.font = 'bold 22px "Noto Sans Myanmar", Arial, sans-serif'
    context.fillText('ကျန်ငွေ', 14, y)
    context.textAlign = 'right'
    context.font = 'bold 22px Arial, sans-serif'
    context.fillText(formatAmount(sale.balanceDue), PAPER_WIDTH_PX - 14, y)
    y += 36
  }
  center('ကျေးဇူးတင်ပါသည်', '22px "Noto Sans Myanmar", Arial, sans-serif', 36)
  y += 16

  const output = document.createElement('canvas')
  output.width = PAPER_WIDTH_PX
  output.height = Math.max(80, y)
  const outputContext = output.getContext('2d')
  if (!outputContext) throw new Error('Receipt output canvas is not available.')
  outputContext.drawImage(canvas, 0, 0, PAPER_WIDTH_PX, output.height, 0, 0, PAPER_WIDTH_PX, output.height)

  const pixels = outputContext.getImageData(0, 0, output.width, output.height).data
  const widthBytes = Math.ceil(output.width / 8)
  const raster = new Uint8Array(widthBytes * output.height)
  for (let row = 0; row < output.height; row += 1) {
    for (let column = 0; column < output.width; column += 1) {
      const pixel = (row * output.width + column) * 4
      const darkness = (pixels[pixel] * 0.299) + (pixels[pixel + 1] * 0.587) + (pixels[pixel + 2] * 0.114)
      if (darkness < 190) raster[row * widthBytes + Math.floor(column / 8)] |= 0x80 >> (column % 8)
    }
  }

  return joinBytes([bytes(0x1d, 0x76, 0x30, 0x00, widthBytes & 0xff, (widthBytes >> 8) & 0xff, output.height & 0xff, (output.height >> 8) & 0xff), raster])
}

async function writeChunk(characteristic: BluetoothCharacteristicLike, data: Uint8Array) {
  const chunkSize = 180
  for (let offset = 0; offset < data.length; offset += chunkSize) {
    const chunk = data.slice(offset, Math.min(offset + chunkSize, data.length))
    if (characteristic.properties.writeWithoutResponse && characteristic.writeValueWithoutResponse) {
      await characteristic.writeValueWithoutResponse(chunk)
    } else {
      await characteristic.writeValue(chunk)
    }
    await new Promise((resolve) => window.setTimeout(resolve, 18))
  }
}

async function findWritableCharacteristic(server: BluetoothServerLike) {
  for (const serviceUuid of PRINTER_SERVICE_UUIDS) {
    try {
      const service = await server.getPrimaryService(serviceUuid)
      for (const characteristicUuid of PRINTER_WRITE_UUIDS) {
        try {
          const characteristic = await service.getCharacteristic(characteristicUuid)
          if (characteristic.properties.write || characteristic.properties.writeWithoutResponse) return characteristic
        } catch { /* try the next characteristic */ }
      }
      const characteristics = await service.getCharacteristics()
      const writable = characteristics.find((item) => item.properties.write || item.properties.writeWithoutResponse)
      if (writable) return writable
    } catch { /* try the next service */ }
  }

  try {
    const services = await server.getPrimaryServices()
    for (const service of services) {
      const characteristics = await service.getCharacteristics()
      const writable = characteristics.find((item) => item.properties.write || item.properties.writeWithoutResponse)
      if (writable) return writable
    }
  } catch { /* the device may expose no GATT services */ }
  return null
}

async function connectDevice(device: BluetoothDeviceLike) {
  if (!device.gatt) throw new Error('This printer is Classic Bluetooth and cannot be controlled directly by Chrome. Use a BLE thermal printer or an Android print bridge.')
  const server = device.gatt.connected ? device.gatt : await device.gatt.connect()
  const characteristic = await findWritableCharacteristic(server)
  if (!characteristic) throw new Error('No BLE printer service was found. This printer may use Classic Bluetooth instead of BLE.')
  connectedDevice = device
  writeCharacteristic = characteristic
  try { localStorage.setItem(PRINTER_DEVICE_KEY, device.name || 'Bluetooth printer') } catch { /* storage unavailable */ }
  device.addEventListener('gattserverdisconnected', () => {
    if (connectedDevice === device) {
      connectedDevice = null
      writeCharacteristic = null
    }
  })
  return device.name || 'Bluetooth printer'
}

export async function connectBluetoothPrinter() {
  assertBluetoothSupported()
  const device = await bluetoothApi()!.requestDevice({
    acceptAllDevices: true,
    optionalServices: PRINTER_SERVICE_UUIDS,
  })
  return connectDevice(device)
}

export function isBluetoothPrinterConnected() {
  return Boolean(connectedDevice?.gatt?.connected && writeCharacteristic)
}

export function connectedBluetoothPrinterName() {
  return connectedDevice?.name || localStorage.getItem(PRINTER_DEVICE_KEY) || ''
}

export async function printSaleToBluetooth(sale: Sale) {
  assertBluetoothSupported()
  if (!connectedDevice || !writeCharacteristic || !connectedDevice.gatt?.connected) {
    await connectBluetoothPrinter()
  }
  if (!writeCharacteristic) throw new Error('Bluetooth printer is not connected.')
  const raster = await renderReceiptRaster(sale)
  const parts = [bytes(0x1b, 0x40), bytes(0x1b, 0x61, 0x01), raster, bytes(0x1b, 0x64, 0x04), bytes(0x1d, 0x56, 0x00)]
  await writeChunk(writeCharacteristic, joinBytes(parts))
}
