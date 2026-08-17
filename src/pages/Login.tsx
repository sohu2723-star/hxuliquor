import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import GoogleSignInButton from '../components/GoogleSignInButton'
import LoadingSpinner from '../components/LoadingSpinner'
import ReceiptLogo from '../components/ReceiptLogo'

export default function Login() {
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { googleLogin } = useAuth()
  const navigate = useNavigate()

  const handleGoogleSuccess = async (idToken: string) => {
    setIsSubmitting(true)
    setError('')

    try {
      await googleLogin(idToken)
      navigate('/pos')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google login failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleGoogleError = (errorMessage: string) => {
    setError(errorMessage)
    setIsSubmitting(false)
  }

  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#fef3c7,transparent_34%),linear-gradient(135deg,#f8fafc,#eef2ff)] px-4">
      <div className="w-full max-w-md rounded-[2rem] bg-white/95 p-8 shadow-2xl ring-1 ring-slate-200 backdrop-blur">
        <div className="mx-auto mb-5 flex h-24 w-24 items-center justify-center rounded-3xl bg-primary/10 p-3 shadow-inner">
          <ReceiptLogo className="h-20 w-20" />
        </div>
        <h1 className="text-center font-serif text-4xl font-black tracking-tight text-slate-950 drop-shadow-sm">HXU Liquor POS</h1>
        <p className="mb-8 mt-2 text-center text-sm font-medium text-slate-500">Sign in securely with Google to continue</p>

        {error && (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </div>
        )}

        {googleClientId ? (
          <div className="relative">
            <GoogleSignInButton
              clientId={googleClientId}
              onSuccess={handleGoogleSuccess}
              onError={handleGoogleError}
            />
            {isSubmitting && (
              <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-white/85 backdrop-blur-sm">
                <LoadingSpinner className="h-10 w-10" />
                <p className="mt-2 text-center text-sm font-semibold text-slate-500">Signing in...</p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-center text-sm text-gray-500">
            Google Sign-In is not configured. Please contact the administrator.
          </p>
        )}
      </div>
    </div>
  )
}
