import { createAPIFileRoute } from '@tanstack/react-start/api'
import { runDailyComplianceChecks } from '@/lib/visa/complianceMonitor.server'

export const APIRoute = createAPIFileRoute('/api/visa/monitor')({
  POST: async ({ request }) => {
    const cronSecret = process.env.CRON_SECRET
    if (cronSecret) {
      const provided = request.headers.get('x-cron-secret')
      if (provided !== cronSecret) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }

    try {
      const result = await runDailyComplianceChecks()
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  },
})
