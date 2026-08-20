import type { Sale } from './api'

const PRINTER_SERVICE_UUIDS = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  '0000ae30-0000-1000-8000-00805f9b34fb',
  '0000ff00-0000-1000-8000-00805f9b34fb',
]

const PRINTER_WRITE_UUIDS = [
  '00002af1-0000-1000-8000-00805f9b34fb',
  '0000ae01-0000-1000-8000-00805f9b34fb',
  '0000ff02-0000-1000-8000-00805f9b34fb',
  '0000ff01-0000-1000-8000-00805f9b34fb',
]

const PRINTER_DEVICE_KEY = 'hxu-bluetooth-printer-name'
const encoder = new TextEncoder()

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

function text(value: string) {
  return encoder.encode(value)
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

function receiptLines(sale: Sale) {
  const lines = [
    'Hsu Myat San Mini Store',
    '------------------------------',
    `Receipt: ${sale.id.slice(-12).toUpperCase()}`,
    `Payment: ${sale.paymentMethod}`,
    `Date: ${new Date(sale.createdAt).toLocaleString('en-GB', { timeZone: 'Asia/Yangon' })}`,
    '------------------------------',
  ]
  sale.items.forEach((item) => {
    lines.push(`${item.productName} x ${item.saleQuantity}`)
    lines.push(`  Ks ${Math.round(item.subtotal).toLocaleString('en-US')}`)
  })
  lines.push('------------------------------')
  lines.push(`TOTAL: Ks ${Math.round(sale.totalAmount).toLocaleString('en-US')}`)
  if (sale.isCredit) lines.push(`BALANCE DUE: Ks ${Math.round(sale.balanceDue).toLocaleString('en-US')}`)
  lines.push('', 'Thank you', '', '')
  return lines
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
    await new Promise((resolve) => window.setTimeout(resolve, 15))
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
  const services = await server.getPrimaryServices()
  for (const service of services) {
    const characteristics = await service.getCharacteristics()
    const writable = characteristics.find((item) => item.properties.write || item.properties.writeWithoutResponse)
    if (writable) return writable
  }
  return null
}

async function connectDevice(device: BluetoothDeviceLike) {
  if (!device.gatt) throw new Error('This Bluetooth printer does not provide a GATT connection.')
  const server = device.gatt.connected ? device.gatt : await device.gatt.connect()
  const characteristic = await findWritableCharacteristic(server)
  if (!characteristic) throw new Error('No writable printer service was found. This printer may use classic Bluetooth instead of BLE.')
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
  const parts = [bytes(0x1b, 0x40), bytes(0x1b, 0x61, 0x01), text('Hsu Myat San Mini Store\n'), bytes(0x1b, 0x61, 0x00), text(receiptLines(sale).join('\n')), bytes(0x1b, 0x64, 0x04), bytes(0x1d, 0x56, 0x00)]
  await writeChunk(writeCharacteristic, joinBytes(parts))
}
