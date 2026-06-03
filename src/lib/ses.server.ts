/**
 * Minimal AWS SES v2 client for Cloudflare Workers.
 * Uses the Web Crypto API (available in all CF Workers) for HMAC-SHA256 signing.
 *
 * Required environment variables (set as Wrangler secrets):
 *   AWS_ACCESS_KEY_ID       — IAM access key with ses:SendEmail permission
 *   AWS_SECRET_ACCESS_KEY   — IAM secret key
 *   AWS_SES_REGION          — AWS region where SES is configured (e.g. eu-west-1)
 *   AWS_SES_FROM_EMAIL      — Verified sender address (e.g. permits@jlsyachts.com)
 */

export interface SendEmailOptions {
  to: string[];
  cc?: string[];
  subject: string;
  html: string;
  text: string;
}

// ── AWS Signature V4 helpers ──────────────────────────────────────────────────

const enc = new TextEncoder();

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const algo = { name: "HMAC", hash: "SHA-256" };
  // @ts-expect-error — SubtleCrypto typings vary across environments; this is valid in CF Workers
  const k = await crypto.subtle.importKey("raw", key, algo, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k as CryptoKey, enc.encode(data));
}

async function sha256hex(data: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(data));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function deriveSigningKey(secret: string, date: string, region: string, service: string): Promise<ArrayBuffer> {
  const kDate    = await hmac(enc.encode("AWS4" + secret), date);
  const kRegion  = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  const kSigning = await hmac(kService, "aws4_request");
  return kSigning;
}

// ── Main send function ────────────────────────────────────────────────────────

export async function sendEmail(opts: SendEmailOptions): Promise<void> {
  const accessKey = (process.env as any).AWS_ACCESS_KEY_ID        as string | undefined;
  const secretKey = (process.env as any).AWS_SECRET_ACCESS_KEY    as string | undefined;
  const region    = (process.env as any).AWS_SES_REGION           as string | undefined;
  const fromEmail = (process.env as any).AWS_SES_FROM_EMAIL       as string | undefined;

  if (!accessKey || !secretKey || !region || !fromEmail) {
    throw new Error("Missing AWS SES environment variables. Ensure AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SES_REGION and AWS_SES_FROM_EMAIL are set as Wrangler secrets.");
  }

  const now = new Date();
  const amzDate  = now.toISOString().replace(/[:-]/g, "").split(".")[0] + "Z";
  const dateStamp = amzDate.slice(0, 8);

  const host = `email.${region}.amazonaws.com`;
  const endpoint = `https://${host}/v2/email/outbound-emails`;

  const body = JSON.stringify({
    FromEmailAddress: fromEmail,
    Destination: {
      ToAddresses: opts.to,
      ...(opts.cc?.length ? { CcAddresses: opts.cc } : {}),
    },
    Content: {
      Simple: {
        Subject: { Data: opts.subject, Charset: "UTF-8" },
        Body: {
          Html: { Data: opts.html, Charset: "UTF-8" },
          Text: { Data: opts.text, Charset: "UTF-8" },
        },
      },
    },
  });

  const contentHash = await sha256hex(body);

  // Canonical headers (must be sorted alphabetically)
  const canonicalHeaders = [
    `content-type:application/json`,
    `host:${host}`,
    `x-amz-content-sha256:${contentHash}`,
    `x-amz-date:${amzDate}`,
  ].join("\n") + "\n";

  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";

  const canonicalRequest = [
    "POST",
    "/v2/email/outbound-emails",
    "", // no query string
    canonicalHeaders,
    signedHeaders,
    contentHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${region}/ses/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256hex(canonicalRequest),
  ].join("\n");

  const signingKey = await deriveSigningKey(secretKey, dateStamp, region, "ses");
  const signature = toHex(await hmac(signingKey, stringToSign));

  const authHeader = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Amz-Date": amzDate,
      "X-Amz-Content-Sha256": contentHash,
      "Authorization": authHeader,
    },
    body,
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`SES error ${response.status}: ${err}`);
  }
}
