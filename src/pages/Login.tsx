import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import GoogleSignInButton from '../components/GoogleSignInButton'

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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
        <h1 className="text-3xl font-bold text-center text-gray-900 mb-2">HXU Liquor POS</h1>
        <p className="text-center text-gray-500 mb-8">Sign in with Google to continue</p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm mb-4">
            {error}
          </div>
        )}

        {googleClientId ? (
          <div>
            <GoogleSignInButton
              clientId={googleClientId}
              onSuccess={handleGoogleSuccess}
              onError={handleGoogleError}
            />
            {isSubmitting && (
              <p className="text-center text-sm text-gray-500 mt-2">Signing in with Google...</p>
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
