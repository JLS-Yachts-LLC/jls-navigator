/**
 * Minimal AWS clients for the Mini Backup platform, built for the Cloudflare
 * Workers runtime: SigV4 via WebCrypto, no SDK.
 *
 *  - EC2 Query API (XML — the only protocol EC2 speaks): CreateImage,
 *    DescribeImages, DescribeInstances, DeregisterImage, DeleteSnapshot.
 *    Responses are picked apart with targeted regexes; we only ever need a
 *    handful of scalar fields, never a general XML tree.
 *  - EBS direct APIs (JSON): ListSnapshotBlocks / ListChangedBlocks /
 *    GetSnapshotBlock — how the snapshot bytes actually leave AWS.
 *  - A generic S3-compatible PUT/GET for Impossible Cloud (path-style).
 *
 * Credentials come from integration_settings and are entered by an admin in
 * the Backups tab; nothing here ever logs them.
 */
import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(process.env.SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', { auth: { persistSession: false } })
}

export type AwsCreds = { accessKeyId: string; secretAccessKey: string }
export type AwsBackupConfig = AwsCreds & { enabled: boolean; region: string }
export type ImpossibleConfig = AwsCreds & { endpoint: string; region: string; bucket: string }

export async function awsBackupConfig(): Promise<AwsBackupConfig> {
  const { data } = await (admin() as any).from('integration_settings')
    .select('enabled, config').eq('integration_name', 'aws_backup').maybeSingle()
  const c = data?.config ?? {}
  return {
    enabled: !!data?.enabled,
    accessKeyId: String(c.access_key_id ?? ''),
    secretAccessKey: String(c.secret_access_key ?? ''),
    region: String(c.region ?? 'ap-southeast-1'),
  }
}

export async function impossibleConfig(): Promise<ImpossibleConfig | null> {
  const { data } = await (admin() as any).from('integration_settings')
    .select('enabled, config').eq('integration_name', 'impossible_cloud').maybeSingle()
  const c = data?.config ?? {}
  if (!data?.enabled || !c.access_key_id || !c.endpoint || !c.bucket) return null
  return {
    accessKeyId: String(c.access_key_id),
    secretAccessKey: String(c.secret_access_key ?? ''),
    endpoint: String(c.endpoint).replace(/\/+$/, ''),
    region: String(c.region ?? 'us-east-1'),
    bucket: String(c.bucket),
  }
}

// ── SigV4 ──────────────────────────────────────────────────────────────────────

const enc = new TextEncoder()

async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string' ? enc.encode(data) : data
  const d = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('')
}

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey('raw', key as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return crypto.subtle.sign('HMAC', k, enc.encode(data))
}

/** RFC 3986 encoding, the flavour AWS canonical requests require. */
function awsEncode(s: string): string {
  return encodeURIComponent(s).replace(/[!'()*]/g, ch => '%' + ch.charCodeAt(0).toString(16).toUpperCase())
}

export async function sigv4Fetch(o: {
  method: string
  url: string
  service: string
  region: string
  creds: AwsCreds
  body?: Uint8Array | string
  headers?: Record<string, string>
}): Promise<Response> {
  const u = new URL(o.url)
  const now = new Date()
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const dateStamp = amzDate.slice(0, 8)
  const bodyBytes = typeof o.body === 'string' ? enc.encode(o.body) : (o.body ?? new Uint8Array())
  const payloadHash = await sha256Hex(bodyBytes)

  const headers: Record<string, string> = {
    host: u.host,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash,
    ...Object.fromEntries(Object.entries(o.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v])),
  }

  const canonicalPath = u.pathname.split('/').map(seg => awsEncode(decodeURIComponent(seg))).join('/') || '/'
  const params = [...u.searchParams.entries()]
    .map(([k, v]) => [awsEncode(k), awsEncode(v)] as const)
    .sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1))
  const canonicalQuery = params.map(([k, v]) => `${k}=${v}`).join('&')

  const signedHeaderNames = Object.keys(headers).sort()
  const canonicalHeaders = signedHeaderNames.map(h => `${h}:${headers[h].trim()}\n`).join('')
  const signedHeaders = signedHeaderNames.join(';')

  const canonicalRequest = [o.method, canonicalPath, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n')
  const scope = `${dateStamp}/${o.region}/${o.service}/aws4_request`
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, await sha256Hex(canonicalRequest)].join('\n')

  let key: ArrayBuffer | Uint8Array = enc.encode('AWS4' + o.creds.secretAccessKey)
  for (const part of [dateStamp, o.region, o.service, 'aws4_request']) key = await hmac(key, part)
  const sigBytes = await hmac(key, stringToSign)
  const signature = [...new Uint8Array(sigBytes)].map(b => b.toString(16).padStart(2, '0')).join('')

  headers.authorization =
    `AWS4-HMAC-SHA256 Credential=${o.creds.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  const { host: _h, ...sendHeaders } = headers
  return fetch(o.url, {
    method: o.method,
    headers: sendHeaders,
    body: bodyBytes.length ? (bodyBytes as BodyInit) : undefined,
  })
}

// ── EC2 Query API ──────────────────────────────────────────────────────────────

export async function ec2Query(cfg: AwsBackupConfig, region: string, action: string, params: Record<string, string>): Promise<string> {
  const body = new URLSearchParams({ Action: action, Version: '2016-11-15', ...params }).toString()
  const res = await sigv4Fetch({
    method: 'POST',
    url: `https://ec2.${region}.amazonaws.com/`,
    service: 'ec2',
    region,
    creds: cfg,
    body,
    headers: { 'content-type': 'application/x-www-form-urlencoded; charset=utf-8' },
  })
  const text = await res.text()
  if (!res.ok) {
    const msg = xml(text, 'Message') ?? text.slice(0, 200)
    throw new Error(`EC2 ${action} → ${res.status}: ${msg}`)
  }
  return text
}

export function xml(text: string, tag: string): string | null {
  const m = text.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))
  return m ? m[1] : null
}
export function xmlAll(text: string, tag: string): string[] {
  return [...text.matchAll(new RegExp(`<${tag}>([^<]*)</${tag}>`, 'g'))].map(m => m[1])
}

export type Ec2Instance = { instanceId: string; name: string; state: string; type: string }

export async function describeInstances(cfg: AwsBackupConfig, region: string): Promise<Ec2Instance[]> {
  const text = await ec2Query(cfg, region, 'DescribeInstances', {})
  const out: Ec2Instance[] = []
  // One <item> per instance inside instancesSet; each carries its own tagSet.
  for (const m of text.matchAll(/<instancesSet>([\s\S]*?)<\/instancesSet>/g)) {
    for (const inst of m[1].matchAll(/<item>([\s\S]*?<instanceType>[\s\S]*?)<\/item>(?=\s*(?:<item>|<\/instancesSet>))/g)) {
      const chunk = inst[1]
      const id = xml(chunk, 'instanceId')
      if (!id) continue
      const nameTag = chunk.match(/<key>Name<\/key>\s*<value>([^<]*)<\/value>/)
      out.push({
        instanceId: id,
        name: nameTag?.[1] ?? id,
        state: xml(chunk, 'name') ?? 'unknown',
        type: xml(chunk, 'instanceType') ?? '',
      })
    }
  }
  return out
}

export async function createImage(cfg: AwsBackupConfig, region: string, instanceId: string, name: string, instancePk: string): Promise<string> {
  const text = await ec2Query(cfg, region, 'CreateImage', {
    InstanceId: instanceId,
    Name: name,
    NoReboot: 'true',
    'TagSpecification.1.ResourceType': 'image',
    'TagSpecification.1.Tag.1.Key': 'polaris-backup',
    'TagSpecification.1.Tag.1.Value': instancePk,
    'TagSpecification.2.ResourceType': 'snapshot',
    'TagSpecification.2.Tag.1.Key': 'polaris-backup',
    'TagSpecification.2.Tag.1.Value': instancePk,
  })
  const amiId = xml(text, 'imageId')
  if (!amiId) throw new Error('CreateImage returned no imageId')
  return amiId
}

export type AmiStatus = { state: string; snapshots: Array<{ snapshotId: string; volumeSizeGiB: number }> }

export async function describeImage(cfg: AwsBackupConfig, region: string, amiId: string): Promise<AmiStatus> {
  const text = await ec2Query(cfg, region, 'DescribeImages', { 'ImageId.1': amiId })
  const snapshots: AmiStatus['snapshots'] = []
  for (const m of text.matchAll(/<ebs>([\s\S]*?)<\/ebs>/g)) {
    const sid = xml(m[1], 'snapshotId')
    if (sid) snapshots.push({ snapshotId: sid, volumeSizeGiB: Number(xml(m[1], 'volumeSize') ?? 0) })
  }
  return { state: xml(text, 'imageState') ?? 'unknown', snapshots }
}

/** AMIs previously created by this platform for one instance, newest first. */
export async function listBackupImages(cfg: AwsBackupConfig, region: string, instancePk: string): Promise<Array<{ amiId: string; created: string; snapshotIds: string[] }>> {
  const text = await ec2Query(cfg, region, 'DescribeImages', {
    'Owner.1': 'self',
    'Filter.1.Name': 'tag:polaris-backup',
    'Filter.1.Value.1': instancePk,
  })
  const out: Array<{ amiId: string; created: string; snapshotIds: string[] }> = []
  for (const m of text.matchAll(/<item>\s*<imageId>([\s\S]*?)<\/blockDeviceMapping>/g)) {
    const chunk = `<imageId>${m[1]}</blockDeviceMapping>`
    const amiId = xml(chunk, 'imageId')
    if (!amiId) continue
    out.push({ amiId, created: xml(chunk, 'creationDate') ?? '', snapshotIds: xmlAll(chunk, 'snapshotId') })
  }
  return out.sort((a, b) => (a.created < b.created ? 1 : -1))
}

export async function deregisterImage(cfg: AwsBackupConfig, region: string, amiId: string, snapshotIds: string[]): Promise<void> {
  await ec2Query(cfg, region, 'DeregisterImage', { ImageId: amiId })
  for (const sid of snapshotIds) {
    await ec2Query(cfg, region, 'DeleteSnapshot', { SnapshotId: sid }).catch(() => { /* snapshot may be shared/in use */ })
  }
}

// ── EBS direct APIs ────────────────────────────────────────────────────────────

export type SnapshotBlock = { BlockIndex: number; BlockToken: string }
export type BlockListPage = { blocks: SnapshotBlock[]; nextToken: string | null; blockSize: number }

async function ebsGet(cfg: AwsBackupConfig, region: string, path: string, query: Record<string, string>): Promise<Response> {
  const qs = new URLSearchParams(query).toString()
  return sigv4Fetch({
    method: 'GET',
    url: `https://ebs.${region}.amazonaws.com${path}${qs ? `?${qs}` : ''}`,
    service: 'ebs',
    region,
    creds: cfg,
  })
}

export async function listSnapshotBlocks(cfg: AwsBackupConfig, region: string, snapshotId: string, pageToken: string | null): Promise<BlockListPage> {
  const res = await ebsGet(cfg, region, `/snapshots/${snapshotId}/blocks`, {
    maxResults: '1000', ...(pageToken ? { pageToken } : {}),
  })
  if (!res.ok) throw new Error(`ListSnapshotBlocks ${snapshotId} → ${res.status}: ${(await res.text()).slice(0, 160)}`)
  const j = await res.json() as any
  return {
    blocks: (j.Blocks ?? []).map((b: any) => ({ BlockIndex: b.BlockIndex, BlockToken: b.BlockToken })),
    nextToken: j.NextPageToken ?? null,
    blockSize: j.BlockSize ?? 524288,
  }
}

/** Blocks that differ between two snapshots of the same volume — the incremental path. */
export async function listChangedBlocks(cfg: AwsBackupConfig, region: string, firstSnapshotId: string, secondSnapshotId: string, pageToken: string | null): Promise<BlockListPage> {
  const res = await ebsGet(cfg, region, `/snapshots/${secondSnapshotId}/changedblocks`, {
    firstSnapshotId, maxResults: '1000', ...(pageToken ? { pageToken } : {}),
  })
  if (!res.ok) throw new Error(`ListChangedBlocks ${secondSnapshotId} → ${res.status}: ${(await res.text()).slice(0, 160)}`)
  const j = await res.json() as any
  return {
    blocks: (j.ChangedBlocks ?? [])
      .filter((b: any) => b.SecondBlockToken)
      .map((b: any) => ({ BlockIndex: b.BlockIndex, BlockToken: b.SecondBlockToken })),
    nextToken: j.NextPageToken ?? null,
    blockSize: j.BlockSize ?? 524288,
  }
}

export async function getSnapshotBlock(cfg: AwsBackupConfig, region: string, snapshotId: string, block: SnapshotBlock): Promise<Uint8Array> {
  const res = await ebsGet(cfg, region, `/snapshots/${snapshotId}/blocks/${block.BlockIndex}`, { blockToken: block.BlockToken })
  if (!res.ok) throw new Error(`GetSnapshotBlock ${snapshotId}#${block.BlockIndex} → ${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}

// ── Impossible Cloud (S3-compatible, path-style) ───────────────────────────────

function s3Url(ic: ImpossibleConfig, key: string): string {
  const path = key.split('/').map(encodeURIComponent).join('/')
  return `${ic.endpoint}/${ic.bucket}/${path}`
}

export async function s3Put(ic: ImpossibleConfig, key: string, body: Uint8Array | string, contentType = 'application/octet-stream'): Promise<void> {
  const res = await sigv4Fetch({
    method: 'PUT', url: s3Url(ic, key), service: 's3', region: ic.region, creds: ic,
    body, headers: { 'content-type': contentType },
  })
  if (!res.ok) throw new Error(`Impossible PUT ${key} → ${res.status}: ${(await res.text()).slice(0, 160)}`)
  await res.body?.cancel()
}

export async function s3Get(ic: ImpossibleConfig, key: string): Promise<Uint8Array | null> {
  const res = await sigv4Fetch({ method: 'GET', url: s3Url(ic, key), service: 's3', region: ic.region, creds: ic })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Impossible GET ${key} → ${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}
