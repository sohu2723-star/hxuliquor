import { useEffect, useId, useRef, useState } from 'react'
import { Html5Qrcode, Html5QrcodeSupportedFormats, type CameraDevice } from 'html5-qrcode'
import Icon from './Icon'
import { useLanguage } from '../contexts/LanguageContext'

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
  const { t } = useLanguage()
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
  const focusTimer = useRef<number | null>(null)
  const focusModeRef = useRef<'continuous' | 'single-shot' | undefined>(undefined)

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
    focusModeRef.current = undefined
    if (focusTimer.current) { window.clearInterval(focusTimer.current); focusTimer.current = null }
  }

  const startScanning = async (requestedCameraId?: string) => {
    if (scannerRef.current) await stopScanning()
    try {
      setError(null)
      setIsScanning(true)
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      const available = cameras.length ? cameras : await Html5Qrcode.getCameras()
      if (!available.length) throw new Error(t('cameraNotFound'))
      setCameras(available)
      const rear = available.find((camera) => /back|rear|environment|world/i.test(camera.label))
      const front = available.find((camera) => /front|user|fac(e|ing)/i.test(camera.label))
      // Rear camera gives barcodes more light and a more stable working distance.
      // The camera selector still lets the user switch whenever needed.
      const selected = requestedCameraId || cameraId || rear?.id || front?.id || available[0].id
      setCameraId(selected)

      const scanner = new Html5Qrcode(readerId, { formatsToSupport: FORMATS, verbose: false })
      scannerRef.current = scanner
      const hasExplicitCamera = Boolean(requestedCameraId || cameraId)
      const videoConstraints: MediaTrackConstraints = hasExplicitCamera
        ? { deviceId: { exact: selected }, width: { ideal: 1280 }, height: { ideal: 960 } }
        : { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 960 } }
      await scanner.start(
        selected,
        {
          fps: 24,
          aspectRatio: 1.333334,
          videoConstraints,
        },
        (rawCode) => {
          const code = rawCode.trim()
          const now = Date.now()
          const sameCodeTooSoon = code === lastScan.current.code && now - lastScan.current.time < 3000
          if (code && now >= scanLockedUntil.current && !sameCodeTooSoon) {
            lastScan.current = { code, time: now }
            // A decoder reports the same visible barcode on many consecutive
            // video frames. Lock briefly so one physical scan adds exactly once.
            scanLockedUntil.current = now + 650
            // Keep the lens continuously focused after detection so the barcode stays sharp
            // while the user moves the next item into the center guide.
            if (focusModeRef.current) void applyCameraControl({ focusMode: focusModeRef.current }, true)
            onScanRef.current(code)
          }
        },
        () => undefined,
      )
      const capabilities = scanner.getRunningTrackCapabilities() as ExtendedCapabilities
      const focusMode = capabilities.focusMode?.includes('continuous') ? 'continuous' : capabilities.focusMode?.includes('single-shot') ? 'single-shot' : undefined
      focusModeRef.current = focusMode
      const zoomCapability = capabilities.zoom
      // A small initial optical zoom makes narrow barcodes occupy more pixels without
      // forcing the user to use the slider on every scan. Keep enough room for close items.
      const initialZoom = zoomCapability
        ? Math.min(zoomCapability.max, Math.max(zoomCapability.min, zoomCapability.min + Math.max(zoomCapability.step || 0.1, (zoomCapability.max - zoomCapability.min) * 0.15)))
        : undefined
      const advanced = [{ ...(focusMode && { focusMode }), ...(initialZoom !== undefined && { zoom: initialZoom }) }]
      try {
        await scanner.applyVideoConstraints({
          ...(advanced[0].focusMode || advanced[0].zoom !== undefined ? { advanced } : {}),
        } as ExtendedConstraints)
      } catch { /* Some browsers report capabilities but reject constraints. */ }
      if (focusMode === 'continuous') {
        void applyCameraControl({ focusMode: 'continuous' }, true)
      } else if (focusMode === 'single-shot') {
        focusTimer.current = window.setInterval(() => {
          void applyCameraControl({ focusMode: 'single-shot' }, true)
        }, 1200)
      }
      setCanTorch(capabilities.torch === true)
      if (zoomCapability) {
        setZoom(initialZoom ?? zoomCapability.min)
        setZoomRange({ min: zoomCapability.min, max: zoomCapability.max, step: zoomCapability.step || .1 })
      }
    } catch (err) {
      await stopScanning()
      const detail = err instanceof Error ? err.message : String(err)
      setError(/permission|notallowed/i.test(detail)
        ? t('cameraPermissionError')
        : `${t('cameraOpenError')} (${detail})`)
    }
  }

  useEffect(() => () => { void stopScanning() }, [])

  const applyCameraControl = async (control: { torch?: boolean; zoom?: number; focusMode?: string }, silent = false) => {
    if (!scannerRef.current?.isScanning) return
    try { await scannerRef.current.applyVideoConstraints({ advanced: [control] } as ExtendedConstraints) }
    catch { if (!silent) setError(t('focusUnsupported')) }
  }

  return <div>
    {!isScanning ? <button type="button" onClick={() => void startScanning()} className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 font-medium text-white">
      <Icon name="camera" className="h-5 w-5" /> {t('scanProduct')}
    </button> : <div className="flex gap-2 mb-2">
      {cameras.length > 1 && <select aria-label={t('cameraSelect')} value={cameraId} onChange={(event) => void startScanning(event.target.value)} className="min-w-0 flex-1 border rounded-md px-2 py-2">
        {cameras.map((camera, index) => <option key={camera.id} value={camera.id}>{camera.label || `Camera ${index + 1}`}</option>)}
      </select>}
      <button type="button" onClick={() => void stopScanning()} className="bg-red-600 text-white py-2 px-4 rounded-md">{t('closeCamera')}</button>
    </div>}
    {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">{error}</div>}
    {isScanning && <div className="flex flex-wrap items-center gap-2 mb-2">
      <button type="button" onClick={() => void applyCameraControl({ focusMode: 'single-shot' })} className="inline-flex items-center gap-1.5 rounded-md border bg-white px-3 py-2 text-sm"><Icon name="target" className="h-4 w-4" /> {t('refocus')}</button>
      {canTorch && <button type="button" onClick={() => { const next = !torchOn; setTorchOn(next); void applyCameraControl({ torch: next }) }} className="inline-flex items-center gap-1.5 rounded-md border bg-white px-3 py-2 text-sm"><Icon name="flash" className="h-4 w-4" />{torchOn ? t('torchOff') : t('torchOn')}</button>}
      {zoomRange && <label className="flex flex-1 min-w-44 items-center gap-2 text-sm">{t('zoom')}
        <input aria-label={t('zoom')} type="range" min={zoomRange.min} max={zoomRange.max} step={zoomRange.step} value={zoom} onChange={(event) => { const next = Number(event.target.value); setZoom(next); void applyCameraControl({ zoom: next }) }} className="flex-1" />
      </label>}
    </div>}
    <div className={`relative mx-auto aspect-[4/3] max-h-[360px] w-full max-w-md overflow-hidden rounded-2xl bg-black ${isScanning ? '' : 'hidden'}`}>
      <div id={readerId} />
      <div className="pointer-events-none absolute left-6 top-6 h-8 w-8 border-l-4 border-t-4 border-green-300" />
      <div className="pointer-events-none absolute right-6 top-6 h-8 w-8 border-r-4 border-t-4 border-green-300" />
      <div className="pointer-events-none absolute bottom-6 left-6 h-8 w-8 border-b-4 border-l-4 border-green-300" />
      <div className="pointer-events-none absolute bottom-6 right-6 h-8 w-8 border-b-4 border-r-4 border-green-300" />
      <div className="pointer-events-none absolute left-[9%] right-[9%] top-1/2 aspect-[3/1] -translate-y-1/2 rounded-lg border-2 border-green-300 shadow-[0_0_0_9999px_rgba(0,0,0,0.16),0_0_18px_rgba(134,239,172,0.95)]">
        <div className="absolute inset-x-2 top-1/2 h-0.5 -translate-y-1/2 bg-gradient-to-r from-transparent via-green-200 to-transparent shadow-[0_0_18px_rgba(134,239,172,0.95)]" />
      </div>
    </div>
  </div>
}
