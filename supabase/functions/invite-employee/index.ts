import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const url = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function normalizeEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function employeePayload(id: string, name: string, email: string) {
  return { id, name, email, role: 'employee', is_authorized: true }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization') || ''
    const callerClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser()
    if (callerError || !caller) return response({ error: 'Unauthorized' }, 401)

    const adminClient = createClient(url, serviceRoleKey)
    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .single()
    if (profileError || profile?.role !== 'admin') return response({ error: 'Admin permission required' }, 403)

    const body = await req.json() as { name?: string; email?: string }
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const email = normalizeEmail(body.email)
    if (!name || !email || !email.includes('@')) return response({ error: 'Name and valid email are required' }, 400)

    const { data: existingProfiles, error: existingProfileError } = await adminClient
      .from('profiles')
      .select('id,name,email,role,is_authorized')
      .ilike('email', email)
      .limit(1)
    if (existingProfileError) return response({ error: existingProfileError.message }, 500)

    const existingProfile = existingProfiles?.[0]
    if (existingProfile?.role === 'admin' && existingProfile.id !== caller.id) {
      return response({ error: 'This Google account is already an admin account.' }, 409)
    }

    const { data: usersData, error: usersError } = await adminClient.auth.admin.listUsers({ perPage: 1000 })
    if (usersError) return response({ error: usersError.message }, 500)
    const existingAuthUser = usersData.users.find((user) => normalizeEmail(user.email) === email)

    let userId = existingProfile?.id || existingAuthUser?.id || ''
    if (!userId) {
      const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
        data: { full_name: name, name },
        redirectTo: `${new URL(req.url).origin}/login`,
      })
      if (error) return response({ error: error.message }, 400)
      userId = data.user?.id || ''
    }

    if (!userId) return response({ error: 'The employee account could not be created.' }, 500)

    const { error: profileUpsertError } = await adminClient
      .from('profiles')
      .upsert(employeePayload(userId, name, email), { onConflict: 'id' })
    if (profileUpsertError) return response({ error: profileUpsertError.message }, 500)

    return response({
      user: { id: userId, name, email, role: 'employee' },
      existing: Boolean(existingProfile || existingAuthUser),
    })
  } catch (error) {
    return response({ error: error instanceof Error ? error.message : 'Unexpected error' }, 500)
  }
})
