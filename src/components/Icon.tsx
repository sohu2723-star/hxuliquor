type IconName = 'scan' | 'bottle' | 'box' | 'cart' | 'products' | 'users' | 'chart' | 'logout'

const paths: Record<IconName, React.ReactNode> = {
  scan: <><path d="M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3"/><path d="M7 12h10"/></>,
  bottle: <><path d="M10 3h4v4l2 3v9a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-9l2-3V3Z"/><path d="M8 13h8"/></>,
  box: <><path d="m4 7 8-4 8 4-8 4-8-4Z"/><path d="m4 7v10l8 4 8-4V7M12 11v10"/></>,
  cart: <><path d="M3 4h2l2 11h10l2-8H6"/><circle cx="9" cy="20" r="1"/><circle cx="17" cy="20" r="1"/></>,
  products: <><path d="M4 5h16v14H4z"/><path d="M4 10h16M9 10v9"/></>,
  users: <><circle cx="9" cy="8" r="3"/><path d="M3 20c0-4 2-6 6-6s6 2 6 6M16 5a3 3 0 0 1 0 6M17 14c3 .5 4 2 4 6"/></>,
  chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>,
  logout: <><path d="M10 4H4v16h6M14 8l4 4-4 4M8 12h10"/></>,
}

export default function Icon({ name, className = 'h-5 w-5' }: { name: IconName; className?: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>{paths[name]}</svg>
}
