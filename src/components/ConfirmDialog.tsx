import Icon from './Icon'

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  onCancel,
  onConfirm,
}: {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'danger' | 'success'
  onCancel: () => void
  onConfirm: () => void
}) {
  const isDanger = tone === 'danger'
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
        <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${isDanger ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
          <Icon name={isDanger ? 'warning' : 'check'} className="h-8 w-8" />
        </div>
        <h2 className="mt-4 text-center text-xl font-bold text-slate-950">{title}</h2>
        <p className="mt-2 text-center text-sm leading-6 text-slate-500">{message}</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" onClick={onCancel} className="rounded-xl border border-slate-200 px-4 py-3 font-semibold text-slate-700">{cancelLabel}</button>
          <button type="button" onClick={onConfirm} className={`rounded-xl px-4 py-3 font-semibold text-white ${isDanger ? 'bg-red-700' : 'bg-green-700'}`}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
