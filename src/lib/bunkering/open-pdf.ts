/** Fetch a PDF that needs the user's sign-in (so a plain link won't do) and open it in a new tab. Throws a readable message on failure. */
export async function openPdf(load: () => Promise<Response>): Promise<void> {
  const res = await load()
  if (!res.ok) {
    const j = await res.json().catch(() => ({}))
    throw new Error((j as { error?: string }).error ?? 'Could not open the declaration')
  }
  const url = URL.createObjectURL(await res.blob())
  const win = window.open(url, '_blank', 'noopener')
  // A blocked pop-up: fall back to saving the file.
  if (!win) { const a = document.createElement('a'); a.href = url; a.download = 'Master-Declaration-VAT.pdf'; a.click() }
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
