import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ActionLoadingProvider } from './contexts/ActionLoadingContext'
import { LanguageProvider } from './contexts/LanguageContext'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import './index.css'

const PWA_CACHE_VERSION = '2026-08-23-walkprint-receipt-v2'

async function purgeStalePwaCaches() {
  try {
    if (localStorage.getItem('hxu-pwa-cache-version') === PWA_CACHE_VERSION) return
    if ('caches' in window) {
      const cacheNames = await caches.keys()
      await Promise.all(cacheNames
        .filter((name) => name === 'js-cache' || name.startsWith('workbox-'))
        .map((name) => caches.delete(name)))
    }
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map((registration) => registration.update().catch(() => undefined)))
    }
    localStorage.setItem('hxu-pwa-cache-version', PWA_CACHE_VERSION)
  } catch {
    // Cache APIs may be unavailable in private browsing; normal app startup continues.
  }
}

void purgeStalePwaCaches()

window.addEventListener('error', (event) => {
  console.error('Global error:', event.error)
})

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason)
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <LanguageProvider>
          <ActionLoadingProvider>
            <ErrorBoundary>
              <App />
            </ErrorBoundary>
          </ActionLoadingProvider>
        </LanguageProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
