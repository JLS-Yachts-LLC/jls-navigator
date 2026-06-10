import { createServerFn } from '@tanstack/react-start'

/**
 * App → SharePoint write-back. Call after saving a synced record so the change
 * is pushed immediately. Fire-and-forget on the client (don't block the UI).
 * target: 'yachts' | 'permits' | 'small_boats' | 'crew_members' | 'visa_applications'
 */
export const doPushToSharePoint = createServerFn({ method: 'POST' })
  // @ts-expect-error — TanStack Start v1 serverFn handler typing
  .handler(async (ctx: { data: { target: string; id: string } }) => {
    const { target, id } = ctx.data ?? {}
    if (!target || !id) return { ok: false }
    const { pushRecordToSharePoint } = await import('@/lib/sharepoint-sync.server')
    await pushRecordToSharePoint(target, id)
    return { ok: true }
  })
