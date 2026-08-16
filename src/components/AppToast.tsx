type ToastType = 'success' | 'error' | 'info'

export type ToastMessage = { message: string; type: ToastType }

const iconClasses = {
  success: 'bg-emerald-100 text-emerald-700',
  error: 'bg-red-100 text-red-700',
  info: 'bg-amber-100 text-amber-700',
}

export default function AppToast({ toast }: { toast: ToastMessage | null }) {
  if (!toast) return null
  return (
    <div className="fixed right-4 top-4 z-[80] flex max-w-sm items-start gap-3 rounded-2xl bg-white px-4 py-3 text-slate-900 shadow-2xl ring-1 ring-slate-200">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${iconClasses[toast.type]}`}>
        {toast.type === 'success' && <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
        {toast.type === 'error' && <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v5m0 4h.01M4.93 19h14.14c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.2 16c-.77 1.33.19 3 1.73 3Z" /></svg>}
        {toast.type === 'info' && <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8h.01M11 12h1v4h1M21 12a9 9 0 11-18 0 9 9 0 0118 0Z" /></svg>}
      </span>
      <p className="pt-1 text-sm font-semibold leading-5">{toast.message}</p>
    </div>
  )
}
