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
    // Best-effort SharePoint List push (no-op if no list is mapped for this target).
    try { await pushRecordToSharePoint(target, id) } catch (e) { console.error('[sp-push] list push failed:', e) }
    // Visa changes also mirror into the SharePoint Excel trackers.
    if (target === 'visa_applications') {
      try {
        const { pushVisaToExcel } = await import('@/lib/visa/excel-writeback.server')
        const r = await pushVisaToExcel(id)
        if (!r.ok) console.error('[visa-excel] writeback error:', r.error)
      } catch (e) { console.error('[visa-excel] writeback threw:', e) }
    }
    return { ok: true }
  })
