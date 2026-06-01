/**
 * Reads the 3 Monday.com permit CSV exports and writes INSERT SQL to stdout.
 * Usage: node scripts/generate-permit-sql.mjs > /tmp/permits.sql
 */

import fs from 'fs';
import { createInterface } from 'readline';
import { fileURLToPath } from 'url';
import path from 'path';

// ── CSV parser ────────────────────────────────────────────────────────────────
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

async function readCSV(filePath) {
  return new Promise((resolve, reject) => {
    const lines = [];
    const rl = createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });
    rl.on('line', l => lines.push(l));
    rl.on('close', () => {
      if (!lines.length) { resolve([]); return; }
      const headers = parseCSVLine(lines[0]);
      resolve(lines.slice(1).map(l => {
        const vals = parseCSVLine(l);
        const obj = {};
        headers.forEach((h, i) => { obj[h] = vals[i] ?? ''; });
        return obj;
      }));
    });
    rl.on('error', reject);
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseDate(raw) {
  if (!raw || !raw.trim()) return null;
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const yr = parseInt(m[3]);
  if (yr > 2050 || yr < 2000) return null;
  return `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
}

function mapStatus(raw) {
  const s = (raw || '').toLowerCase().trim();
  if (s === 'completed') return 'active';
  if (s === 'cancelled' || s === 'canceled') return 'cancelled';
  return 'pending';
}

function esc(v) {
  if (v === null || v === undefined || v === '') return 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}

const TEST_EMAILS = new Set([
  'mattpeeters@newhorizon-it.co.uk',
  'support@jlsyachts.com',
  'h.ackermann@jlsyachts.com',
  'h.ackerman@jlsyachts.com',
]);
const TEST_NAME_PATTERNS = [
  /^pacific\s*x\s*exit\s*permit$/i,
  /^boat\s*[a-z\d]$/i,
  /^vboat/i,
  /^boaten/i,
  /^boat\s+(a|b|c)$/i,
];

function isTest(boatName, email, holder, attachments) {
  if (!boatName || !boatName.trim()) return true;
  if (TEST_NAME_PATTERNS.some(p => p.test(boatName.trim()))) return true;
  const e = (email || '').toLowerCase().trim();
  if (TEST_EMAILS.has(e)) return true;
  const h = (holder || '').toLowerCase().trim();
  if (h === 'test' || h === 'test test') return true;
  // skip rows where permit # is literally "test"
  if (/^test$/i.test((attachments||''))) return true;
  if ((attachments || '0').trim() === '0') return true;
  return false;
}

// ── Build SQL row ─────────────────────────────────────────────────────────────
function toRow(permitType, boatName, issueDate, expiryDate, status, holderName, email,
               permitNumber, authority, quotation, requestedBy, notes, dmaPhase) {
  return [
    esc(permitType),
    esc(boatName ? boatName.toUpperCase().trim() : null),
    issueDate  ? `'${issueDate}'::date`  : 'NULL',
    expiryDate ? `'${expiryDate}'::date` : 'NULL',
    esc(status),
    esc(holderName || null),
    esc(email || null),
    esc(permitNumber || null),
    esc(authority || null),
    esc(quotation || null),
    esc(requestedBy || null),
    esc(notes || null),
    esc(dmaPhase || null),
  ].join(', ');
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const rows = [];

  // ── Exit & Entry ──────────────────────────────────────────────────────────
  const eeData = await readCSV('C:\\Users\\Matthew\\Downloads\\Exit and Entry Permit.csv');
  let eeSkip = 0;
  for (const r of eeData) {
    const boatName = r['Boat Name']?.trim() || '';
    const email    = r['Email Address']?.trim() || '';
    const holder   = r['Client Purser Name']?.trim() || '';
    const attach   = r['Attachments']?.trim() || '0';
    if (isTest(boatName, email, holder, attach)) { eeSkip++; continue; }

    const typeText   = (r['Permit Type Text'] || r['Permit Type'] || '').trim();
    const isEntry    = /entry/i.test(typeText);
    const issueDate  = isEntry ? parseDate(r['Entry Permit Date']) : parseDate(r['Exit Permit date']);
    const expiryDate = isEntry ? parseDate(r['Entry Permit Expiration']) : null;
    const entryPort  = r['Entry Port']?.trim() || '';
    const nextPort   = r['Next Port of call']?.trim() || '';
    const nextOther  = r['Next Other Port']?.trim() || '';
    const quotation  = r['Quotation Number']?.trim() || '';
    const appliedBy  = (r['Applied By'] || r['Created By'] || '').trim();
    const status     = mapStatus(r['Status']);

    const noteParts = [];
    if (entryPort) noteParts.push(`Entry port: ${entryPort}`);
    if (nextPort)  noteParts.push(`Next port: ${nextPort}`);
    if (nextOther && nextOther !== nextPort) noteParts.push(nextOther);
    const notes = noteParts.join(' | ') || null;

    rows.push(`  (${toRow('exit_entry', boatName, issueDate, expiryDate, status,
      holder, email, null, null, quotation, appliedBy, notes, typeText || null)})`);
  }
  process.stderr.write(`Exit & Entry: ${rows.length} rows (${eeSkip} skipped)\n`);

  // ── Cruising Mothership ───────────────────────────────────────────────────
  const msStart = rows.length;
  const msData = await readCSV('C:\\Users\\Matthew\\Downloads\\Cruising Permit Mothership.csv');
  let msSkip = 0;
  for (const r of msData) {
    const boatName = r['Boat Name']?.trim() || '';
    const email    = r['Email']?.trim() || '';
    const holder   = r['Name']?.trim() || '';
    const attach   = r['Attachments']?.trim() || '0';
    if (isTest(boatName, email, holder, attach)) { msSkip++; continue; }
    const permitNo = r['Permit No']?.trim() || '';
    if (/^test/i.test(permitNo)) { msSkip++; continue; }

    const issueDate  = parseDate(r['Cruising Permit Date Applied']);
    const expiryDate = parseDate(r['Cruising Permit Duration (6 Months)']);
    const authority  = r['Authority']?.trim() || '';
    const requestedBy = r['Requested By']?.trim() || '';
    const remarks    = r['Remarks']?.trim() || null;

    rows.push(`  (${toRow('cruising_mothership', boatName, issueDate, expiryDate, 'active',
      holder, email, permitNo, authority, null, requestedBy, remarks, null)})`);
  }
  process.stderr.write(`Mothership: ${rows.length - msStart} rows (${msSkip} skipped)\n`);

  // ── Cruising Tenders ──────────────────────────────────────────────────────
  const tdStart = rows.length;
  const tdData = await readCSV('C:\\Users\\Matthew\\Downloads\\Cruising Permit Tenders and Appurtenances.csv');
  let tdSkip = 0;
  for (const r of tdData) {
    const boatName = r['Boat Name']?.trim() || '';
    const email    = r['Email']?.trim() || '';
    const holder   = r['Name']?.trim() || '';
    const attach   = r['Attachments']?.trim() || '0';
    if (isTest(boatName, email, holder, attach)) { tdSkip++; continue; }
    const permitNo = r['Permit No']?.trim() || '';
    if (/^test/i.test(permitNo)) { tdSkip++; continue; }

    const issueDate  = parseDate(r['Cruising Permit Date Applied']);
    const expiryDate = parseDate(r['Cruising Permit Duration (6 Months)']);
    const authority  = r['Authority']?.trim() || '';
    const requestedBy = r['Requested By']?.trim() || '';
    const remarks    = r['Remarks']?.trim() || null;

    rows.push(`  (${toRow('cruising_tenders', boatName, issueDate, expiryDate, 'active',
      holder, email, permitNo, authority, null, requestedBy, remarks, null)})`);
  }
  process.stderr.write(`Tenders: ${rows.length - tdStart} rows (${tdSkip} skipped)\n`);
  process.stderr.write(`Total: ${rows.length} rows\n`);

  // ── Output SQL ────────────────────────────────────────────────────────────
  console.log(`-- Auto-generated permit import: ${new Date().toISOString()}`);
  console.log(`-- ${rows.length} total records`);
  console.log();
  console.log(`INSERT INTO permits (`);
  console.log(`  permit_type, yacht_id, issue_date, expiry_date, status,`);
  console.log(`  holder_name, contact_email, permit_number, issuing_authority,`);
  console.log(`  jls_quotation_number, requested_by, notes, dma_phase`);
  console.log(`)`);
  console.log(`SELECT`);
  console.log(`  d.permit_type::permit_type,`);
  console.log(`  y.id AS yacht_id,`);
  console.log(`  d.issue_date,`);
  console.log(`  d.expiry_date,`);
  console.log(`  d.status::permit_status,`);
  console.log(`  d.holder_name,`);
  console.log(`  d.contact_email,`);
  console.log(`  d.permit_number,`);
  console.log(`  d.issuing_authority,`);
  console.log(`  d.jls_quotation_number,`);
  console.log(`  d.requested_by,`);
  console.log(`  d.notes,`);
  console.log(`  d.dma_phase`);
  console.log(`FROM (VALUES`);
  console.log(rows.join(',\n'));
  console.log(`) AS d(`);
  console.log(`  permit_type, boat_name, issue_date, expiry_date, status,`);
  console.log(`  holder_name, contact_email, permit_number, issuing_authority,`);
  console.log(`  jls_quotation_number, requested_by, notes, dma_phase`);
  console.log(`)`);
  console.log(`LEFT JOIN yachts y ON upper(trim(y.vessel_name)) = d.boat_name;`);
}

main().catch(err => { process.stderr.write(err.stack + '\n'); process.exit(1); });
