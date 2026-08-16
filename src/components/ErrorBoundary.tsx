import { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: { componentStack: string }) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
    try {
      if (/dynamically imported module|failed to fetch/i.test(error.message) && !sessionStorage.getItem('asset-recovery-attempted')) {
        sessionStorage.setItem('asset-recovery-attempted', '1')
        void this.clearOldAppAndReload()
      }
    } catch { /* Manual recovery button remains available when storage is blocked. */ }
  }

  private clearOldAppAndReload = async () => {
    try {
      if ('caches' in window) {
        const cacheNames = await caches.keys()
        await Promise.all(cacheNames.map((name) => caches.delete(name)))
      }
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations()
        await Promise.all(registrations.map((registration) => registration.unregister()))
      }
    } finally {
      window.location.replace(`/?refresh=${Date.now()}`)
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">App version အသစ်ရယူရန်လိုပါသည်</h1>
            <p className="text-gray-600 mb-4">
              Page အဟောင်း cache ကျန်နေပါသည်။ Reload လုပ်ပြီး version အသစ်ကို ပြန်ဖွင့်ပါ။
            </p>
            <button
              onClick={() => void this.clearOldAppAndReload()}
              className="bg-primary text-white px-4 py-2 rounded-md hover:bg-primary/90 transition-colors"
            >
              Cache ရှင်းပြီး Reload လုပ်မည်
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
