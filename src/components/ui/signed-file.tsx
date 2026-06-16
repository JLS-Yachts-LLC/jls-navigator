import { useSignedUrl } from "@/lib/signed-url";

/**
 * Anchor that resolves a stored storage reference (public URL or path) to a
 * short-lived signed URL before opening. Renders disabled while resolving.
 */
export function SignedAnchor({
  stored, bucket, className, title, style, onClick, children,
}: {
  stored: string | null | undefined;
  bucket?: string;
  className?: string;
  title?: string;
  style?: React.CSSProperties;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  children: React.ReactNode;
}) {
  const url = useSignedUrl(stored, bucket);
  return (
    <a
      href={url || undefined}
      target="_blank"
      rel="noreferrer"
      title={title}
      aria-disabled={!url}
      className={className}
      style={style}
      onClick={(e) => { if (!url) e.preventDefault(); onClick?.(e); }}
    >
      {children}
    </a>
  );
}

/** Image that loads from a freshly-signed URL. */
export function SignedImage({
  stored, bucket, className, alt = "",
}: {
  stored: string | null | undefined;
  bucket?: string;
  className?: string;
  alt?: string;
}) {
  const url = useSignedUrl(stored, bucket);
  if (!url) return null;
  return <img src={url} alt={alt} className={className} />;
}
