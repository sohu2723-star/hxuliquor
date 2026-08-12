import { useRef, useEffect, useState } from 'react'

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: { client_id: string; callback: (response: { credential: string }) => void }) => void
          renderButton: (parent: HTMLElement | null, options: { theme?: string; size?: string; width?: number }) => void
        }
      }
    }
  }
}

interface GoogleSignInButtonProps {
  clientId: string
  onSuccess: (idToken: string) => void
  onError?: (error: string) => void
}

export default function GoogleSignInButton({ clientId, onSuccess, onError }: GoogleSignInButtonProps) {
  const buttonRef = useRef<HTMLDivElement>(null)
  const onSuccessRef = useRef(onSuccess)
  const onErrorRef = useRef(onError)
  const [isScriptLoaded, setIsScriptLoaded] = useState(false)

  useEffect(() => {
    onSuccessRef.current = onSuccess
    onErrorRef.current = onError
  })

  useEffect(() => {
    if (!isScriptLoaded) return
    if (!buttonRef.current) return

    if (!window.google?.accounts?.id) {
      onErrorRef.current?.('Google Identity Services not loaded')
      return
    }

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => {
        if (response.credential) {
          onSuccessRef.current(response.credential)
        } else {
          onErrorRef.current?.('Google Sign-In failed')
        }
      },
    })

    window.google.accounts.id.renderButton(buttonRef.current, {
      theme: 'outline',
      size: 'large',
      width: buttonRef.current.offsetWidth || 320,
    })
  }, [isScriptLoaded, clientId])

  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = () => setIsScriptLoaded(true)
    script.onerror = () => onError?.('Failed to load Google Sign-In script')
    document.head.appendChild(script)

    return () => {
      document.head.removeChild(script)
    }
  }, [])

  if (!isScriptLoaded) {
    return <div className="flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>
  }

  return <div ref={buttonRef} className="flex justify-center" />
}
