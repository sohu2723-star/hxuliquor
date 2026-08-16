import { useEffect, useId, useRef, useState } from 'react'
import { Html5Qrcode, Html5QrcodeSupportedFormats, type CameraDevice } from 'html5-qrcode'

interface ScannerProps { onScan: (code: string) => void }
type ExtendedCapabilities = MediaTrackCapabilities & { focusMode?: string[]; zoom?: { min: number; max: number; step?: number }; torch?: boolean }
type ExtendedConstraints = MediaTrackConstraints & { advanced?: Array<MediaTrackConstraintSet & { focusMode?: string; zoom?: number; torch?: boolean }> }

const FORMATS = [
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.CODABAR,
  Html5QrcodeSupportedFormats.DATA_MATRIX,
]

export default function Scanner({ onScan }: ScannerProps) {
  const readerId = `reader-${useId().replace(/:/g, '')}`
  const [isScanning, setIsScanning] = useState(false)
  const [cameras, setCameras] = useState<CameraDevice[]>([])
  const [cameraId, setCameraId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [canTorch, setCanTorch] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const [zoomRange, setZoomRange] = useState<{ min: number; max: number; step: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const lastScan = useRef({ code: '', time: 0 })
  const onScanRef = useRef(onScan)
  const scanLockedUntil = useRef(0)

  useEffect(() => { onScanRef.current = onScan }, [onScan])

  const stopScanning = async () => {
    const scanner = scannerRef.current
    scannerRef.current = null
    if (scanner) {
      try { if (scanner.isScanning) await scanner.stop() } catch { /* already stopped */ }
      try { scanner.clear() } catch { /* reader already removed */ }
    }
    setIsScanning(false)
    setCanTorch(false)
    setTorchOn(false)
    setZoomRange(null)
  }

  const startScanning = async (requestedCameraId?: string) => {
    if (scannerRef.current) await stopScanning()
    try {
      setError(null)
      setIsScanning(true)
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      const available = cameras.length ? cameras : await Html5Qrcode.getCameras()
      if (!available.length) throw new Error('Camera မတွေ့ပါ')
      setCameras(available)
      const rear = available.find((camera) => /back|rear|environment/i.test(camera.label))
      const selected = requestedCameraId || cameraId || rear?.id || available[0].id
      setCameraId(selected)

      const scanner = new Html5Qrcode(readerId, { formatsToSupport: FORMATS, verbose: false })
      scannerRef.current = scanner
      await scanner.start(
        selected,
        // Scan the complete video instead of a fixed qrbox. This catches large
        // QR codes and barcodes even when they are not perfectly centered.
        { fps: 30, aspectRatio: 1.777 },
        (rawCode) => {
          const code = rawCode.trim()
          const now = Date.now()
          const sameCodeTooSoon = code === lastScan.current.code && now - lastScan.current.time < 3000
          if (code && now >= scanLockedUntil.current && !sameCodeTooSoon) {
            lastScan.current = { code, time: now }
            // A decoder reports the same visible barcode on many consecutive
            // video frames. Lock briefly so one physical scan adds exactly once.
            scanLockedUntil.current = now + 650
            onScanRef.current(code)
          }
        },
        () => undefined,
      )
      const capabilities = scanner.getRunningTrackCapabilities() as ExtendedCapabilities
      const focusMode = capabilities.focusMode?.includes('continuous') ? 'continuous' : capabilities.focusMode?.includes('single-shot') ? 'single-shot' : undefined
      const zoomCapability = capabilities.zoom
      const initialZoom = zoomCapability ? Math.min(zoomCapability.max, Math.max(zoomCapability.min, 1)) : undefined
      const advanced = [{ ...(focusMode && { focusMode }), ...(initialZoom !== undefined && { zoom: initialZoom }) }]
      try {
        await scanner.applyVideoConstraints({
          width: { ideal: 1280 }, height: { ideal: 720 },
          ...(advanced[0].focusMode || advanced[0].zoom !== undefined ? { advanced } : {}),
        } as ExtendedConstraints)
      } catch { /* Some browsers report capabilities but reject constraints. */ }
      setCanTorch(capabilities.torch === true)
      if (zoomCapability) {
        setZoom(initialZoom ?? zoomCapability.min)
        setZoomRange({ min: zoomCapability.min, max: zoomCapability.max, step: zoomCapability.step || .1 })
      }
    } catch (err) {
      await stopScanning()
      const detail = err instanceof Error ? err.message : String(err)
      setError(/permission|notallowed/i.test(detail)
        ? 'Camera permission ပိတ်ထားသည်။ Browser Site settings → Camera → Allow လုပ်ပြီး Reload လုပ်ပါ။'
        : `Camera ဖွင့်မရပါ။ အခြား app သုံးနေခြင်းရှိ/မရှိ စစ်ပါ။ (${detail})`)
    }
  }

  useEffect(() => () => { void stopScanning() }, [])

  const applyCameraControl = async (control: { torch?: boolean; zoom?: number; focusMode?: string }) => {
    if (!scannerRef.current?.isScanning) return
    try { await scannerRef.current.applyVideoConstraints({ advanced: [control] } as ExtendedConstraints) }
    catch { setError('ဤ camera/browser က ရွေးထားသော focus control ကို မပံ့ပိုးပါ။') }
  }

  return <div>
    {!isScanning ? <button type="button" onClick={() => void startScanning()} className="w-full bg-primary text-white py-3 px-4 rounded-md font-medium">
      📷 Barcode / QR Scan ဖတ်မည်
    </button> : <div className="flex gap-2 mb-2">
      {cameras.length > 1 && <select aria-label="Camera ရွေးရန်" value={cameraId} onChange={(event) => void startScanning(event.target.value)} className="min-w-0 flex-1 border rounded-md px-2 py-2">
        {cameras.map((camera, index) => <option key={camera.id} value={camera.id}>{camera.label || `Camera ${index + 1}`}</option>)}
      </select>}
      <button type="button" onClick={() => void stopScanning()} className="bg-red-600 text-white py-2 px-4 rounded-md">Camera ပိတ်မည်</button>
    </div>}
    {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">{error}</div>}
    {isScanning && <p className="my-2 text-sm text-center text-gray-600">Code တစ်ခုဖတ်ပြီး အသံကြားလျှင် နောက် product ကို ပြောင်းဖတ်ပါ။ တစ်ခါဖတ်လျှင် တစ်ခုသာထည့်ပါမည်။</p>}
    {isScanning && <div className="flex flex-wrap items-center gap-2 mb-2">
      <button type="button" onClick={() => void applyCameraControl({ focusMode: 'single-shot' })} className="border rounded-md px-3 py-2 text-sm bg-white">🎯 ပြန် Focus</button>
      {canTorch && <button type="button" onClick={() => { const next = !torchOn; setTorchOn(next); void applyCameraControl({ torch: next }) }} className="border rounded-md px-3 py-2 text-sm bg-white">{torchOn ? '🔦 မီးပိတ်' : '🔦 မီးဖွင့်'}</button>}
      {zoomRange && <label className="flex flex-1 min-w-44 items-center gap-2 text-sm">Zoom
        <input aria-label="Camera zoom" type="range" min={zoomRange.min} max={zoomRange.max} step={zoomRange.step} value={zoom} onChange={(event) => { const next = Number(event.target.value); setZoom(next); void applyCameraControl({ zoom: next }) }} className="flex-1" />
      </label>}
    </div>}
    <div className={`relative overflow-hidden rounded-lg bg-black ${isScanning ? 'min-h-64' : 'hidden'}`}>
      <div id={readerId} />
      <div className="pointer-events-none absolute inset-3 rounded-xl border-2 border-green-400/80 scanner-frame" />
    </div>
  </div>
}
