import { createContext, ReactNode, useCallback, useContext, useState } from 'react'
import AppToast, { type ToastMessage } from '../components/AppToast'
import { notify } from '../lib/notify'

type ToastContextValue = {
  showToast: (message: string, type: ToastMessage['type']) => void
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const showToast = useCallback((message: string, type: ToastMessage['type']) => {
    notify(setToast, message, type)
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <AppToast toast={toast} />
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used within ToastProvider')
  return context
}
