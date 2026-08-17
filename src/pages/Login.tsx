import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import LoadingSpinner from '../components/LoadingSpinner'
import ReceiptLogo from '../components/ReceiptLogo'
import { useToast } from '../contexts/ToastContext'

export default function Login() {
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { signInWithGoogle, isLoading, user, authError } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (!authError) return
    setError(authError)
    setIsSubmitting(false)
  }, [authError])

  useEffect(() => {
    if (!user) return
    const destination = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || '/pos'
    showToast('Login အောင်မြင်ပါပြီ။ Dashboard ကိုဖွင့်နေပါတယ်။', 'success')
    const timer = window.setTimeout(() => navigate(destination, { replace: true }), 700)
    return () => window.clearTimeout(timer)
  }, [location.state, navigate, showToast, user])

  const handleGoogleLogin = async () => {
    setError('')
    setIsSubmitting(true)
    try {
      await signInWithGoogle()
      const destination = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || '/pos'
      navigate(destination)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google login failed')
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50"><LoadingSpinner /></div>
  }

  if (user) return <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50"><LoadingSpinner /><p className="text-sm font-semibold text-slate-600">Login အောင်မြင်ပါပြီ။ Dashboard ကိုဖွင့်နေပါတယ်...</p></div>

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#fef3c7,transparent_34%),linear-gradient(135deg,#f8fafc,#eef2ff)] px-4">
      <div className="w-full max-w-md rounded-[2rem] bg-white/95 p-8 shadow-2xl ring-1 ring-slate-200 backdrop-blur">
        <div className="mx-auto mb-5 flex h-24 w-24 items-center justify-center rounded-3xl bg-primary/10 p-3 shadow-inner"><ReceiptLogo className="h-20 w-20" /></div>
        <h1 className="text-center font-serif text-4xl font-black tracking-tight text-slate-950 drop-shadow-sm">HXU Liquor POS</h1>
        <p className="mb-8 mt-2 text-center text-sm font-medium text-slate-500">Sign in securely with Google to continue</p>

        {error && <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"><p>{error}</p><p className="mt-1 text-xs font-semibold text-red-600">Supabase Google OAuth configuration နှင့် Internet connection ကို စစ်ပြီး Retry ပြန်လုပ်ပါ။</p></div>}

        <button type="button" onClick={() => void handleGoogleLogin()} disabled={isSubmitting} className="flex w-full items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">
          {isSubmitting ? <LoadingSpinner className="h-5 w-5" /> : <span className="text-lg font-black text-blue-600">G</span>}
          {isSubmitting ? 'Signing in...' : 'Continue with Google'}
        </button>
      </div>
    </div>
  )
}
