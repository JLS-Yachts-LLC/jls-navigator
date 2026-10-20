/**
 * /api/sharepoint/gate-pass-documents — one-off: copy each gate pass's document
 * from its SharePoint "Gate Pass" list item into Polaris.
 *
 *   GET  ?libraries=1  dry run: where the files are, and what an import would do.
 *                      Writes nothing. libraries=1 also searches the site's
 *                      document libraries for "gate pass" files;
 *                      folders=A|B lists what is inside those library folders.
 *   POST {limit}       import up to `limit` (default 150, max 250) documents.
 *                      Repeat until `remaining` is 0, or stop when a call imports
 *                      nothing (only failures are left).
 *
 * Global/org admin, Bearer token. See src/lib/gate-pass-documents.server.ts for
 * which items are trusted. The permits sync stays off; nothing goes to SharePoint.
 */
import { requireAdminAccess } from '@/lib/admin/access'
import { gatePassDocumentProbe, gatePassDocumentsAttach, gatePassDocumentsAttachFromLibrary, gatePassDocumentsDryRun, gatePassDocumentsImport, gatePassDocumentsReview, gatePassLibrarySearch } from '@/lib/gate-pass-documents.server'

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b, null, 2), {
    status: s,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

export async function gatePassDocumentsHandler(request: Request): Promise<Response> {
  const session = await requireAdminAccess(request, ['global_admin', 'org_admin'])
  if (!session.ok) return session.response

  try {
    if (request.method === 'GET') {
      const q = new URL(request.url).searchParams
      if (q.get('probe')) return json({ ok: true, probe: await gatePassDocumentProbe(Number(q.get('probe'))) })
      // librarySearch=<offset> — candidate files in the Documents library for passes still without one.
      if (q.has('librarySearch')) return json({ ok: true, ...(await gatePassLibrarySearch(Number(q.get('librarySearch')) || 0)) })
      const libraries = q.get('libraries') === '1'
      // folders=Gate Pass|ISSUED GATE PASS — peek inside library folders (paths from the library root).
      const folders = (q.get('folders') ?? '').split('|').map((f) => f.trim()).filter(Boolean).slice(0, 6)
      return json({ ok: true, dryRun: true, ...(await gatePassDocumentsDryRun({ libraries, folders })) })
    }
    if (request.method === 'POST') {
      const body = await request.json().catch(() => ({})) as {
        limit?: number
        attach?: Array<{ id: string; file: string }>
        review?: Array<{ itemId: string; file: string }>
        attachFromLibrary?: { driveId: string; items: Array<{ id: string; driveItemId: string }> }
      }
      // Checked by a person: the named attachment of each row's own item.
      if (Array.isArray(body.attach)) return json({ ok: true, ...(await gatePassDocumentsAttach(body.attach.slice(0, 100))) })
      // Private 15-minute links to read a pass before deciding; attaches nothing.
      if (Array.isArray(body.review)) return json({ ok: true, ...(await gatePassDocumentsReview(body.review)) })
      if (body.attachFromLibrary?.driveId && Array.isArray(body.attachFromLibrary.items)) {
        return json({ ok: true, ...(await gatePassDocumentsAttachFromLibrary(body.attachFromLibrary.driveId, body.attachFromLibrary.items.slice(0, 100))) })
      }
      return json({ ok: true, ...(await gatePassDocumentsImport(Number(body.limit) || 150)) })
    }
    return json({ ok: false, error: 'Method not allowed' }, 405)
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message ?? e).slice(0, 500) }, 500)
  }
}
