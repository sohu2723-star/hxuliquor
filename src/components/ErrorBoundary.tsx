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
    // Do not force a reload automatically: on mobile browsers this can loop
    // every time the app is reopened while an old PWA asset is still cached.
    console.error('ErrorBoundary caught an error:', error, errorInfo)
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
      window.location.replace(`${window.location.pathname}?refresh=${Date.now()}${window.location.hash}`)
    }
  }

  render() {
    const isEnglish = typeof window !== 'undefined' && window.localStorage.getItem('hxu-language') === 'en'
    const copy = isEnglish
      ? { title: 'Something went wrong', message: 'An unexpected error occurred. Reload the app to try again.', reload: 'Reload app' }
      : { title: 'စနစ်တွင် အမှားတစ်ခု ဖြစ်နေပါသည်', message: 'မမျှော်လင့်ထားသော အမှားတစ်ခု ဖြစ်နေပါသည်။ App ကို ပြန်ဖွင့်ပြီး ထပ်ကြိုးစားပါ။', reload: 'App ကို ပြန်ဖွင့်မည်' }

    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">{copy.title}</h1>
            <p className="text-gray-600 mb-4">
              {copy.message}
            </p>
            <button
              onClick={() => void this.clearOldAppAndReload()}
              className="bg-primary text-white px-4 py-2 rounded-md hover:bg-primary/90 transition-colors"
            >
              {copy.reload}
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
