import { createClient } from '@supabase/supabase-js'
import { runComplianceChecks } from '@/lib/visa/complianceChecks'

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function visaComplianceHandler(request: Request): Promise<Response> {
  let body: { token: string; passportId: string; countryCode: string }
  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { token, passportId, countryCode } = body

  if (!token || !passportId || !countryCode) {
    return new Response(JSON.stringify({ error: 'Missing required fields: token, passportId, countryCode' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !userData?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { data: passport, error: passportError } = await (supabaseAdmin as any)
    .from('crew_passports')
    .select('*')
    .eq('id', passportId)
    .single()

  if (passportError || !passport) {
    return new Response(JSON.stringify({ error: 'Passport not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const results = await runComplianceChecks(passport, countryCode)
  const hasBlocking = results.some((r: any) => r.blocking === true)

  return new Response(JSON.stringify({ results, hasBlocking }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
