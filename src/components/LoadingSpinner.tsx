import { useLanguage } from '../contexts/LanguageContext'

export default function LoadingSpinner({ className = 'h-12 w-12' }: { className?: string }) {
  const { t } = useLanguage()
  return (
    <svg aria-label={t('loading')} viewBox="0 0 48 48" className={`animate-spin text-primary ${className}`} fill="none">
      <path d="M24 5a19 19 0 1 1-13.44 32.44" stroke="currentColor" strokeWidth="5" strokeLinecap="round" opacity="0.22" />
      <path d="M24 5a19 19 0 0 1 19 19" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      <path d="M16 12a14 14 0 0 1 16 0" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.5" />
    </svg>
  )
}
