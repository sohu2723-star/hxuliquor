import { useEffect, useRef, useState } from 'react'
import LoadingSpinner from './LoadingSpinner'

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: { client_id: string; callback: (response: { credential?: string }) => void; auto_select?: boolean; cancel_on_tap_outside?: boolean }) => void
          renderButton: (parent: HTMLElement | null, options: { theme?: string; size?: string; width?: number; type?: string; shape?: string; text?: string }) => void
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

let googleScriptPromise: Promise<void> | null = null

function loadGoogleIdentityScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve()
  if (googleScriptPromise) return googleScriptPromise

  googleScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-google-gsi]')
    const script = existing || document.createElement('script')
    const handleLoad = () => {
      if (window.google?.accounts?.id) resolve()
      else reject(new Error('Google Identity Services loaded without an API'))
    }
    const handleError = () => reject(new Error('Failed to load Google Sign-In script'))

    if (!existing) {
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.defer = true
      script.dataset.googleGsi = 'true'
      document.head.appendChild(script)
    }
    script.addEventListener('load', handleLoad, { once: true })
    script.addEventListener('error', handleError, { once: true })

    if (window.google?.accounts?.id) handleLoad()
  }).catch((error) => {
    googleScriptPromise = null
    throw error
  })

  return googleScriptPromise
}

export default function GoogleSignInButton({ clientId, onSuccess, onError }: GoogleSignInButtonProps) {
  const buttonRef = useRef<HTMLDivElement>(null)
  const onSuccessRef = useRef(onSuccess)
  const onErrorRef = useRef(onError)
  const [isScriptLoaded, setIsScriptLoaded] = useState(Boolean(window.google?.accounts?.id))

  useEffect(() => {
    onSuccessRef.current = onSuccess
    onErrorRef.current = onError
  }, [onSuccess, onError])

  useEffect(() => {
    let cancelled = false
    void loadGoogleIdentityScript()
      .then(() => {
        if (!cancelled) setIsScriptLoaded(true)
      })
      .catch((error: unknown) => {
        if (!cancelled) onErrorRef.current?.(error instanceof Error ? error.message : 'Google Sign-In failed')
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!isScriptLoaded || !buttonRef.current || !window.google?.accounts?.id) return
    const container = buttonRef.current
    container.replaceChildren()

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => {
        if (response.credential) onSuccessRef.current(response.credential)
        else onErrorRef.current?.('Google Sign-In failed')
      },
      auto_select: false,
      cancel_on_tap_outside: true,
    })

    window.google.accounts.id.renderButton(container, {
      theme: 'outline',
      size: 'large',
      width: container.offsetWidth || 320,
      type: 'standard',
      shape: 'pill',
      text: 'signin_with',
    })
  }, [isScriptLoaded, clientId])

  if (!isScriptLoaded) {
    return <div className="flex justify-center"><LoadingSpinner className="h-9 w-9" /></div>
  }

  return <div ref={buttonRef} className="flex justify-center" />
}
