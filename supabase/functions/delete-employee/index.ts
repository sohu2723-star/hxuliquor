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

    const body = await req.json() as { id?: string }
    const id = body.id?.trim() || ''
    if (!id || id === caller.id) return response({ error: 'A valid employee ID other than your own is required' }, 400)

    const { error } = await adminClient.auth.admin.deleteUser(id)
    if (error) return response({ error: error.message }, 400)
    return response({ success: true })
  } catch (error) {
    return response({ error: error instanceof Error ? error.message : 'Unexpected error' }, 500)
  }
})
