/** Extract an 11-char YouTube video id from a URL/token/bare id, else null. */
export function youtubeId(input: string): string | null {
  const s = (input ?? "").trim();
  if (/^[\w-]{11}$/.test(s)) return s; // bare id
  const m = s.match(
    /(?:youtube\.com\/(?:watch\?(?:[^ ]*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([\w-]{11})/i,
  );
  return m ? m[1] : null;
}

/** A line that is solely a YouTube URL or a `::youtube[…]` token → its video id. */
export function youtubeLineId(line: string): string | null {
  const s = line.trim();
  const token = s.match(/^::youtube\[([^\]]+)\]$/i);
  if (token) return youtubeId(token[1]);
  if (/^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\/\S+$/i.test(s)) return youtubeId(s);
  return null;
}
