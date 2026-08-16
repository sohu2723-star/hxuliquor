export default function ReceiptLogo({ className = 'h-16 w-16' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 96 96" role="img" aria-label="HXU Liquor logo" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="hxu-logo-bg" x1="18" y1="12" x2="78" y2="84" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7c2d12" />
          <stop offset="1" stopColor="#b45309" />
        </linearGradient>
      </defs>
      <rect x="8" y="8" width="80" height="80" rx="22" fill="url(#hxu-logo-bg)" />
      <path d="M30 24v17h15V24h9v48h-9V50H30v22h-9V24h9Zm25 0h11l-13 23 14 25H56l-8-15-8 15H29l14-25-13-23h11l7 14 7-14Z" fill="#fff7ed" opacity=".96" />
      <path d="M68 22c6 5 9 12 9 21 0 15-9 25-22 33 4-9 4-17 1-24 8-4 13-11 13-21 0-3-.3-6-1-9Z" fill="#fde68a" />
      <path d="M66 56c6 1 10 5 10 10 0 7-6 11-17 11H38c-4 0-7-3-7-7h25c7 0 10-2 10-5 0-2-2-4-6-5l6-4Z" fill="#fff7ed" />
    </svg>
  )
}
