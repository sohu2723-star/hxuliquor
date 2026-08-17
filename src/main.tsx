import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ActionLoadingProvider } from './contexts/ActionLoadingContext'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import './index.css'

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
        <ActionLoadingProvider>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </ActionLoadingProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
