type IconName = 'scan' | 'bottle' | 'box' | 'cart' | 'products' | 'users' | 'chart' | 'logout' | 'user' | 'mail' | 'shield' | 'monitor' | 'check' | 'warning' | 'camera' | 'target' | 'flash'

const paths: Record<IconName, React.ReactNode> = {
  scan: <><path d="M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3"/><path d="M7 12h10"/></>,
  bottle: <><path d="M10 3h4v4l2 3v9a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-9l2-3V3Z"/><path d="M8 13h8"/></>,
  box: <><path d="m4 7 8-4 8 4-8 4-8-4Z"/><path d="m4 7v10l8 4 8-4V7M12 11v10"/></>,
  cart: <><path d="M3 4h2l2 11h10l2-8H6"/><circle cx="9" cy="20" r="1"/><circle cx="17" cy="20" r="1"/></>,
  products: <><path d="M4 5h16v14H4z"/><path d="M4 10h16M9 10v9"/></>,
  users: <><circle cx="9" cy="8" r="3"/><path d="M3 20c0-4 2-6 6-6s6 2 6 6M16 5a3 3 0 0 1 0 6M17 14c3 .5 4 2 4 6"/></>,
  chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>,
  logout: <><path d="M10 4H4v16h6M14 8l4 4-4 4M8 12h10"/></>,
  user: <><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.2-6 8-6s6.5 2 8 6"/></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></>,
  shield: <><path d="M12 3 20 6v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6l8-3Z"/><path d="m9 12 2 2 4-5"/></>,
  monitor: <><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></>,
  check: <path d="M5 13l4 4L19 7"/>,
  warning: <><path d="M12 8v5m0 4h.01M4.93 19h14.14c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.2 16c-.77 1.33.19 3 1.73 3Z"/></>,
  camera: <><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="4"/></>,
  target: <><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></>,
  flash: <path d="M13 2 4 14h7l-1 8 10-13h-7l1-7Z"/>,
}

export default function Icon({ name, className = 'h-5 w-5' }: { name: IconName; className?: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>{paths[name]}</svg>
}
