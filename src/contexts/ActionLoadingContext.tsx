import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

const MIN_LOADING_MS = 1000

type ActionLoadingContextValue = {
  isLoading: boolean
  runWithLoading: <T>(action: () => Promise<T>) => Promise<T>
}

const ActionLoadingContext = createContext<ActionLoadingContextValue | undefined>(undefined)

function wait(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms))
}

export function ActionLoadingProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState(0)

  const runWithLoading = useCallback(async <T,>(action: () => Promise<T>) => {
    const startedAt = Date.now()
    setPending((value) => value + 1)
    try {
      return await action()
    } finally {
      const remaining = MIN_LOADING_MS - (Date.now() - startedAt)
      if (remaining > 0) await wait(remaining)
      setPending((value) => Math.max(0, value - 1))
    }
  }, [])

  return (
    <ActionLoadingContext.Provider value={{ isLoading: pending > 0, runWithLoading }}>
      {children}
      {pending > 0 && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/25 backdrop-blur-[2px]" role="status" aria-live="polite" aria-label="လုပ်ဆောင်နေပါသည်">
          <div className="flex min-w-[190px] flex-col items-center gap-3 rounded-2xl bg-white px-8 py-6 shadow-2xl">
            <span className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-primary" />
            <span className="text-sm font-semibold text-slate-700">လုပ်ဆောင်နေပါသည်…</span>
          </div>
        </div>
      )}
    </ActionLoadingContext.Provider>
  )
}

export function useActionLoading() {
  const context = useContext(ActionLoadingContext)
  if (!context) throw new Error('useActionLoading must be used within ActionLoadingProvider')
  return context
}
