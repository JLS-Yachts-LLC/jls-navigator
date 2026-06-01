/**
 * Generates 3 separate SQL files — one per permit type.
 * Outputs to C:/Users/Matthew/Downloads/permits_ee.sql, C:/Users/Matthew/Downloads/permits_ms.sql, C:/Users/Matthew/Downloads/permits_td.sql
 */

import fs from 'fs';
import { createInterface } from 'readline';
import path from 'path';

function parseCSVLine(line) {
  const result = []; let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
    else if (ch === ',' && !inQ) { result.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  result.push(cur.trim()); return result;
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
        const vals = parseCSVLine(l); const obj = {};
        headers.forEach((h,i) => { obj[h] = vals[i] ?? ''; }); return obj;
      }));
    });
    rl.on('error', reject);
  });
}

function parseDate(raw) {
  if (!raw?.trim()) return null;
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const yr = parseInt(m[3]);
  if (yr > 2050 || yr < 2000) return null;
  return `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
}

function mapStatus(raw) {
  const s = (raw||'').toLowerCase().trim();
  if (s==='completed') return 'active';
  if (s==='cancelled'||s==='canceled') return 'cancelled';
  return 'pending';
}

function esc(v) {
  if (v === null || v === undefined || v === '') return 'NULL';
  return `'${String(v).replace(/'/g,"''")}'`;
}

const TEST_EMAILS = new Set([
  'mattpeeters@newhorizon-it.co.uk','support@jlsyachts.com',
  'h.ackermann@jlsyachts.com','h.ackerman@jlsyachts.com',
]);
const TEST_NAME_RE = [/^pacific\s*x\s*exit\s*permit$/i,/^boat\s*[a-z\d]$/i,/^vboat/i,/^boaten/i];

function isTest(boatName, email, holder, attach) {
  if (!boatName?.trim()) return true;
  if (TEST_NAME_RE.some(p => p.test(boatName.trim()))) return true;
  if (TEST_EMAILS.has((email||'').toLowerCase().trim())) return true;
  const h = (holder||'').toLowerCase().trim();
  if (h==='test'||h==='test test') return true;
  if ((attach||'0').trim()==='0') return true;
  return false;
}

function sqlRow(permitType, boatName, issueDate, expiryDate, status, holder, email,
                permitNo, authority, quotation, requestedBy, notes, dmaPhase) {
  const bn = boatName ? boatName.toUpperCase().trim() : null;
  const id = issueDate  ? `'${issueDate}'::date`  : 'NULL';
  const ed = expiryDate ? `'${expiryDate}'::date` : 'NULL';
  return `  (${esc(permitType)}, ${esc(bn)}, ${id}, ${ed}, ${esc(status)}, ` +
    `${esc(holder||null)}, ${esc(email||null)}, ${esc(permitNo||null)}, ` +
    `${esc(authority||null)}, ${esc(quotation||null)}, ${esc(requestedBy||null)}, ` +
    `${esc(notes||null)}, ${esc(dmaPhase||null)})`;
}

const SQL_HEADER = `INSERT INTO permits (
  permit_type, yacht_id, issue_date, expiry_date, status,
  holder_name, contact_email, permit_number, issuing_authority,
  jls_quotation_number, requested_by, notes, dma_phase
)
SELECT
  d.permit_type::permit_type,
  y.id AS yacht_id,
  d.issue_date,
  d.expiry_date,
  d.status::permit_status,
  d.holder_name,
  d.contact_email,
  d.permit_number,
  d.issuing_authority,
  d.jls_quotation_number,
  d.requested_by,
  d.notes,
  d.dma_phase
FROM (VALUES`;

const SQL_FOOTER = `) AS d(
  permit_type, boat_name, issue_date, expiry_date, status,
  holder_name, contact_email, permit_number, issuing_authority,
  jls_quotation_number, requested_by, notes, dma_phase
)
LEFT JOIN yachts y ON upper(trim(y.vessel_name)) = d.boat_name;`;

async function main() {
  // ── Exit & Entry ──────────────────────────────────────────────────────────
  const eeData = await readCSV('C:\\Users\\Matthew\\Downloads\\Exit and Entry Permit.csv');
  const eeRows = []; let eeSkip = 0;
  for (const r of eeData) {
    const boat  = r['Boat Name']?.trim()||''; const email = r['Email Address']?.trim()||'';
    const holder= r['Client Purser Name']?.trim()||''; const attach = r['Attachments']?.trim()||'0';
    if (isTest(boat,email,holder,attach)) { eeSkip++; continue; }
    const typeText = (r['Permit Type Text']||r['Permit Type']||'').trim();
    const isEntry  = /entry/i.test(typeText);
    const issDate  = isEntry ? parseDate(r['Entry Permit Date']) : parseDate(r['Exit Permit date']);
    const expDate  = isEntry ? parseDate(r['Entry Permit Expiration']) : null;
    const ep = r['Entry Port']?.trim()||''; const np = r['Next Port of call']?.trim()||'';
    const no = r['Next Other Port']?.trim()||'';
    const noteParts=[]; if(ep) noteParts.push(`Entry port: ${ep}`);
    if(np) noteParts.push(`Next port: ${np}`);
    if(no&&no!==np) noteParts.push(no);
    eeRows.push(sqlRow('exit_entry',boat,issDate,expDate,mapStatus(r['Status']),
      holder,email,null,null,r['Quotation Number']?.trim()||'',
      (r['Applied By']||r['Created By']||'').trim(),noteParts.join(' | ')||null,typeText||null));
  }
  fs.writeFileSync('C:/Users/Matthew/Downloads/permits_ee.sql',
    `-- Exit & Entry Permits: ${eeRows.length} rows (${eeSkip} skipped)\n` +
    SQL_HEADER+'\n'+eeRows.join(',\n')+'\n'+SQL_FOOTER+'\n');
  process.stderr.write(`E&E: ${eeRows.length} rows written\n`);

  // ── Mothership ────────────────────────────────────────────────────────────
  const msData = await readCSV('C:\\Users\\Matthew\\Downloads\\Cruising Permit Mothership.csv');
  const msRows = []; let msSkip = 0;
  for (const r of msData) {
    const boat  = r['Boat Name']?.trim()||''; const email = r['Email']?.trim()||'';
    const holder= r['Name']?.trim()||''; const attach = r['Attachments']?.trim()||'0';
    if (isTest(boat,email,holder,attach)) { msSkip++; continue; }
    const permitNo = r['Permit No']?.trim()||'';
    if (/^test/i.test(permitNo)) { msSkip++; continue; }
    msRows.push(sqlRow('cruising_mothership',boat,
      parseDate(r['Cruising Permit Date Applied']),parseDate(r['Cruising Permit Duration (6 Months)']),
      'active',holder,email,permitNo,r['Authority']?.trim()||'',null,
      r['Requested By']?.trim()||'',r['Remarks']?.trim()||null,null));
  }
  fs.writeFileSync('C:/Users/Matthew/Downloads/permits_ms.sql',
    `-- Cruising Mothership: ${msRows.length} rows (${msSkip} skipped)\n` +
    SQL_HEADER+'\n'+msRows.join(',\n')+'\n'+SQL_FOOTER+'\n');
  process.stderr.write(`Mothership: ${msRows.length} rows written\n`);

  // ── Tenders ───────────────────────────────────────────────────────────────
  const tdData = await readCSV('C:\\Users\\Matthew\\Downloads\\Cruising Permit Tenders and Appurtenances.csv');
  const tdRows = []; let tdSkip = 0;
  for (const r of tdData) {
    const boat  = r['Boat Name']?.trim()||''; const email = r['Email']?.trim()||'';
    const holder= r['Name']?.trim()||''; const attach = r['Attachments']?.trim()||'0';
    if (isTest(boat,email,holder,attach)) { tdSkip++; continue; }
    const permitNo = r['Permit No']?.trim()||'';
    if (/^test/i.test(permitNo)) { tdSkip++; continue; }
    tdRows.push(sqlRow('cruising_tenders',boat,
      parseDate(r['Cruising Permit Date Applied']),parseDate(r['Cruising Permit Duration (6 Months)']),
      'active',holder,email,permitNo,r['Authority']?.trim()||'',null,
      r['Requested By']?.trim()||'',r['Remarks']?.trim()||null,null));
  }
  fs.writeFileSync('C:/Users/Matthew/Downloads/permits_td.sql',
    `-- Cruising Tenders: ${tdRows.length} rows (${tdSkip} skipped)\n` +
    SQL_HEADER+'\n'+tdRows.join(',\n')+'\n'+SQL_FOOTER+'\n');
  process.stderr.write(`Tenders: ${tdRows.length} rows written\n`);
}

main().catch(e => { process.stderr.write(e.stack+'\n'); process.exit(1); });
