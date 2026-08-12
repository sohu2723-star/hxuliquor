import { useRef, useEffect } from 'react'

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

  useEffect(() => {
    if (!window.google?.accounts?.id || !buttonRef.current) return

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => {
        if (response.credential) {
          onSuccess(response.credential)
        } else {
          onError?.('Google Sign-In failed')
        }
      },
    })

    window.google.accounts.id.renderButton(buttonRef.current, {
      theme: 'outline',
      size: 'large',
      width: buttonRef.current.offsetWidth || 320,
    })
  }, [clientId, onSuccess, onError])

  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    document.head.appendChild(script)

    return () => {
      document.head.removeChild(script)
    }
  }, [])

  return <div ref={buttonRef} className="flex justify-center" />
}
