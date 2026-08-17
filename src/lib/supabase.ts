import { createClient } from '@supabase/supabase-js'

const configuredSupabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

const isBrowser = typeof window !== 'undefined'
const isLocalDevelopment = isBrowser && ['localhost', '127.0.0.1'].includes(window.location.hostname)
const supabaseUrl = isBrowser && !isLocalDevelopment
  ? `${window.location.origin}/api/supabase`
  : configuredSupabaseUrl

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('Supabase configuration is missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.')
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

export const supabaseProjectUrl = configuredSupabaseUrl
