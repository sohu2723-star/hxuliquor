import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const url = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const authHeader = req.headers.get('Authorization') || ''
    const callerClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } })
    const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser()
    if (callerError || !caller) return response({ error: 'Unauthorized' }, 401)

    const adminClient = createClient(url, serviceRoleKey)
    const { data: profile, error: profileError } = await adminClient.from('profiles').select('role').eq('id', caller.id).single()
    if (profileError || profile?.role !== 'admin') return response({ error: 'Admin permission required' }, 403)

    const body = await req.json() as { name?: string; email?: string }
    const name = body.name?.trim() || ''
    const email = body.email?.trim().toLowerCase() || ''
    if (!name || !email || !email.includes('@')) return response({ error: 'Name and valid email are required' }, 400)

    const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { full_name: name, name },
      redirectTo: `${new URL(req.url).origin}/login`,
    })
    if (error) return response({ error: error.message }, 400)

    if (data.user) {
      await adminClient.from('profiles').upsert({ id: data.user.id, name, email, role: 'employee' }, { onConflict: 'id' })
    }
    return response({ user: { id: data.user?.id || '', name, email, role: 'employee' } })
  } catch (error) {
    return response({ error: error instanceof Error ? error.message : 'Unexpected error' }, 500)
  }
})
