import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'

interface ScannerProps {
  onScan: (code: string) => void
}

export default function Scanner({ onScan }: ScannerProps) {
  const [isScanning, setIsScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const lastScanTime = useRef(0)

  const startScanning = async () => {
    if (isScanning) return
    try {
      setError(null)
      setIsScanning(true)
      // Let React reveal and size the reader before html5-qrcode attaches video.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      const scanner = new Html5Qrcode('reader')
      scannerRef.current = scanner

      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 150 },
          aspectRatio: 1.333,
        },
        (decodedText) => {
          const now = Date.now()
          if (now - lastScanTime.current > 2000) {
            lastScanTime.current = now
            onScan(decodedText)
          }
        },
        () => {
          // Ignore scan errors
        }
      )
    } catch (err) {
      scannerRef.current = null
      setIsScanning(false)
      setError(
        err instanceof Error && /permission|notallowed/i.test(err.message)
          ? 'Camera permission ပိတ်ထားပါသည်။ Browser Settings → Site settings → Camera → Allow လုပ်ပြီး ပြန်ဖွင့်ပါ။'
          : `Camera ဖွင့်မရပါ။ HTTPS သုံးထားပြီး အခြား app က camera မသုံးကြောင်း စစ်ပါ။${err instanceof Error ? ` (${err.message})` : ''}`
      )
    }
  }

  const stopScanning = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop()
      } catch {
        // Ignore stop errors
      }
      scannerRef.current.clear()
      scannerRef.current = null
    }
    setIsScanning(false)
  }

  useEffect(() => {
    return () => {
      stopScanning()
    }
  }, [])

  return (
    <div>
      {!isScanning ? (
        <button
          onClick={startScanning}
          className="w-full bg-primary text-white py-3 px-4 rounded-md hover:bg-primary/90 transition-colors font-medium"
        >
          📷 Tablet Camera ဖြင့် Barcode Scan ဖတ်မည်
        </button>
      ) : (
        <button
          onClick={stopScanning}
          className="w-full bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 transition-colors font-medium mb-3"
        >
          Camera ပိတ်မည်
        </button>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
          {error}
        </div>
      )}

      {isScanning && (
        <p className="mt-3 text-sm text-gray-600 text-center">
          ပစ္စည်း barcode ကို အောက်က camera ဘောင်အလယ်တည့်တည့်ထားပါ
        </p>
      )}
      <div
        id="reader"
        className={`mt-3 overflow-hidden rounded-lg bg-black ${isScanning ? 'min-h-64' : 'hidden'}`}
      />
    </div>
  )
}
