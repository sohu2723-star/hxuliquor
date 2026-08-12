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
    try {
      setError(null)
      const scanner = new Html5Qrcode('reader')
      scannerRef.current = scanner

      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 150 },
          aspectRatio: 1.0,
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
      setIsScanning(true)
    } catch (err) {
      setError(
        err instanceof Error && err.message.includes('Permission')
          ? 'Camera permission denied. Please allow camera access.'
          : 'Could not access camera. Ensure you are using HTTPS.'
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
          Open Camera Scanner
        </button>
      ) : (
        <button
          onClick={stopScanning}
          className="w-full bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 transition-colors font-medium mb-3"
        >
          Stop Scanner
        </button>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
          {error}
        </div>
      )}

      <div id="reader" className={isScanning ? 'mt-3' : 'hidden'}></div>
    </div>
  )
}
