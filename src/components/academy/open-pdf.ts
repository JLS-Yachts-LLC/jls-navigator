/**
 * Open a PDF that needs the signed-in user's token (certificates). The tab is
 * opened first, inside the click, so phones don't block it as a pop-up; the
 * file is then loaded into it.
 */
export async function openAuthedPdf(fetcher: () => Promise<Response>): Promise<void> {
  const tab = window.open("", "_blank");
  try {
    const res = await fetcher();
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error ?? `Couldn't open the certificate (${res.status})`);
    }
    const url = URL.createObjectURL(await res.blob());
    if (tab) tab.location.href = url; else window.location.assign(url);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) {
    tab?.close();
    throw e;
  }
}
