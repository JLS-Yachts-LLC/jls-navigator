/**
 * Import Monday.com permit CSV exports into Supabase permits table.
 * Usage: node scripts/import-permits.mjs
 *
 * Reads 3 CSV files, skips test/draft rows, maps boat names to yacht UUIDs,
 * and inserts all records via Supabase REST API using the service role key.
 */

import fs from 'fs';
import path from 'path';
import { createInterface } from 'readline';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Config ────────────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://cqzdroabjcdyncfqwawy.supabase.co';
// Pass service role key as env var: SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-permits.mjs
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error('ERROR: Set SUPABASE_SERVICE_ROLE_KEY env var before running.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── CSV helpers ───────────────────────────────────────────────────────────────
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
    rl.on('line', line => lines.push(line));
    rl.on('close', () => {
      if (lines.length === 0) { resolve([]); return; }
      const headers = parseCSVLine(lines[0]);
      const rows = lines.slice(1).map(l => {
        const vals = parseCSVLine(l);
        const obj = {};
        headers.forEach((h, i) => { obj[h] = vals[i] ?? ''; });
        return obj;
      });
      resolve(rows);
    });
    rl.on('error', reject);
  });
}

// ── Date helpers ──────────────────────────────────────────────────────────────
function parseDate(raw) {
  if (!raw || raw.trim() === '') return null;
  // M/D/YYYY or M/D/YYYY H:MM AM/PM
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const [, mo, dy, yr] = m;
  // Reject far-future dates (typos like year 2114, 2115)
  const year = parseInt(yr);
  if (year > 2050) return null;
  return `${yr}-${mo.padStart(2, '0')}-${dy.padStart(2, '0')}`;
}

// ── Status mapping ────────────────────────────────────────────────────────────
function mapStatus(raw) {
  const s = (raw || '').toLowerCase().trim();
  if (s === 'completed') return 'active';
  if (s === 'cancelled' || s === 'canceled') return 'cancelled';
  if (s === 'in progress') return 'pending';
  return 'pending';
}

// ── Test row filter ───────────────────────────────────────────────────────────
const TEST_EMAILS = ['mattpeeters@newhorizon-it.co.uk', 'support@jlsyachts.com', 'h.ackermann@jlsyachts.com', 'h.ackerman@jlsyachts.com', 'info.auh@jlsyachts.com'];
const TEST_NAME_PATTERNS = [/^pacific\s*x\s*exit\s*permit$/i, /^test$/i, /^boat\s*[a-z]$/i, /^vboat/i, /^boaten/i];

function isTestRow(boatName, email, holderName, attachments) {
  if (!boatName || boatName.trim() === '') return true;
  if (TEST_NAME_PATTERNS.some(p => p.test(boatName.trim()))) return true;
  if (TEST_EMAILS.includes((email || '').toLowerCase().trim())) return true;
  if (/test/i.test(holderName || '') && !/latest|contest|protest/i.test(holderName || '')) return true;
  // skip truly empty drafts (no attachments at all AND save only)
  if (attachments === '0') return true;
  return false;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  // 1. Load yacht map
  const { data: yachts, error: yErr } = await supabase.from('yachts').select('id, vessel_name');
  if (yErr) { console.error('Failed to load yachts:', yErr.message); process.exit(1); }

  const yachtMap = new Map();
  for (const y of yachts) {
    yachtMap.set(y.vessel_name.toUpperCase().trim(), y.id);
  }

  // Also add known aliases
  yachtMap.set('MY OLMIDA', yachtMap.get('LADY MAXINE (EX OLMIDA)'));
  yachtMap.set('OLMIDA', yachtMap.get('LADY MAXINE (EX OLMIDA)'));
  yachtMap.set('JULIA', yachtMap.get('JULIA'));
  yachtMap.set('AURORA', yachtMap.get('AURORA'));
  yachtMap.set('AURORA 74', yachtMap.get('AURORA X'));
  yachtMap.set('PLUS ULTRA', yachtMap.get('PLVS VLTRA'));
  yachtMap.set('MY PLUS ULTRA', yachtMap.get('PLVS VLTRA'));
  yachtMap.set('M PLUS ULTRA', yachtMap.get('PLVS VLTRA'));
  yachtMap.set('QUEEN ALLA', yachtMap.get('QUEEN ALLA'));
  yachtMap.set('MY QUEEN ALLA', yachtMap.get('QUEEN ALLA'));
  yachtMap.set('02', null); // not in yachts table
  yachtMap.set('O2', null);
  yachtMap.set('O3', null);

  function resolveYacht(name) {
    if (!name) return null;
    const key = name.toUpperCase().trim();
    if (yachtMap.has(key)) return yachtMap.get(key) || null;
    return null;
  }

  const records = [];

  // ── 2. Exit & Entry Permits ──────────────────────────────────────────────
  console.log('Reading Exit & Entry Permit.csv …');
  const eeRows = await readCSV('C:\\Users\\Matthew\\Downloads\\Exit and Entry Permit.csv');
  let eeSkipped = 0, eeAdded = 0;

  for (const row of eeRows) {
    const boatName  = (row['Boat Name'] || '').trim();
    const email     = (row['Email Address'] || '').trim();
    const holder    = (row['Client Purser Name'] || '').trim();
    const attachments = (row['Attachments'] || '0').trim();
    const saveOnly  = (row['Save Only'] || '').toLowerCase().trim();

    if (isTestRow(boatName, email, holder, attachments)) { eeSkipped++; continue; }

    const permitType    = row['Permit Type'] || '';     // Entry or Exit
    const typeText      = row['Permit Type Text'] || permitType;
    const entryDate     = parseDate(row['Entry Permit Date']);
    const entryExpiry   = parseDate(row['Entry Permit Expiration']);
    const exitDate      = parseDate(row['Exit Permit date']);
    const entryPort     = (row['Entry Port'] || '').trim();
    const nextPort      = (row['Next Port of call'] || '').trim();
    const nextOther     = (row['Next Other Port'] || '').trim();
    const quotation     = (row['Quotation Number'] || '').trim();
    const appliedBy     = (row['Applied By'] || row['Created By'] || '').trim();
    const status        = mapStatus(row['Status']);

    // For Exit: issue_date = exit permit date, no expiry
    // For Entry: issue_date = entry date, expiry = entry expiration
    const isEntry = /entry/i.test(typeText);
    const issueDate  = isEntry ? entryDate : exitDate;
    const expiryDate = isEntry ? entryExpiry : null;

    // Build notes
    const noteParts = [];
    if (entryPort)  noteParts.push(`Entry port: ${entryPort}`);
    if (nextPort)   noteParts.push(`Next port: ${nextPort}`);
    if (nextOther)  noteParts.push(nextOther);
    const notes = noteParts.join(' | ') || null;

    records.push({
      permit_type: 'exit_entry',
      yacht_id: resolveYacht(boatName),
      issue_date: issueDate,
      expiry_date: expiryDate,
      status,
      holder_name: holder || null,
      contact_email: email || null,
      jls_quotation_number: quotation || null,
      requested_by: appliedBy || null,
      notes,
      dma_phase: typeText || null,
      issuing_authority: null,
      permit_number: null,
    });
    eeAdded++;
  }
  console.log(`  Exit & Entry: ${eeAdded} added, ${eeSkipped} skipped`);

  // ── 3. Cruising Permit Mothership ────────────────────────────────────────
  console.log('Reading Cruising Permit Mothership.csv …');
  const msRows = await readCSV('C:\\Users\\Matthew\\Downloads\\Cruising Permit Mothership.csv');
  let msSkipped = 0, msAdded = 0;

  for (const row of msRows) {
    const boatName  = (row['Boat Name'] || '').trim();
    const email     = (row['Email'] || '').trim();
    const holder    = (row['Name'] || '').trim();
    const attachments = (row['Attachments'] || '0').trim();

    if (isTestRow(boatName, email, holder, attachments)) { msSkipped++; continue; }

    // Additional filter: skip obvious test rows in mothership
    const permitNo  = (row['Permit No'] || '').trim();
    if (/^test/i.test(permitNo)) { msSkipped++; continue; }

    const issueDate  = parseDate(row['Cruising Permit Date Applied']);
    const expiryDate = parseDate(row['Cruising Permit Duration (6 Months)']);
    const authority  = (row['Authority'] || '').trim() || null;
    const requestedBy = (row['Requested By'] || '').trim() || null;
    const remarks    = (row['Remarks'] || '').trim() || null;
    const status     = remarks?.toLowerCase().includes('completed') ? 'active' : 'active'; // all issued = active

    records.push({
      permit_type: 'cruising_mothership',
      yacht_id: resolveYacht(boatName),
      issue_date: issueDate,
      expiry_date: expiryDate,
      status: 'active',
      holder_name: holder || null,
      contact_email: email || null,
      permit_number: permitNo || null,
      issuing_authority: authority,
      requested_by: requestedBy,
      notes: remarks,
      jls_quotation_number: null,
      dma_phase: null,
    });
    msAdded++;
  }
  console.log(`  Mothership: ${msAdded} added, ${msSkipped} skipped`);

  // ── 4. Cruising Permit Tenders & Appurtenances ───────────────────────────
  console.log('Reading Cruising Permit Tenders and Appurtenances.csv …');
  const tdRows = await readCSV('C:\\Users\\Matthew\\Downloads\\Cruising Permit Tenders and Appurtenances.csv');
  let tdSkipped = 0, tdAdded = 0;

  for (const row of tdRows) {
    const boatName  = (row['Boat Name'] || '').trim();
    const email     = (row['Email'] || '').trim();
    const holder    = (row['Name'] || '').trim();
    const attachments = (row['Attachments'] || '0').trim();

    if (isTestRow(boatName, email, holder, attachments)) { tdSkipped++; continue; }

    const permitNo   = (row['Permit No'] || '').trim();
    if (/^test/i.test(permitNo)) { tdSkipped++; continue; }

    const issueDate  = parseDate(row['Cruising Permit Date Applied']);
    const expiryDate = parseDate(row['Cruising Permit Duration (6 Months)']);
    const authority  = (row['Authority'] || '').trim() || null;
    const requestedBy = (row['Requested By'] || '').trim() || null;
    const remarks    = (row['Remarks'] || '').trim() || null;

    records.push({
      permit_type: 'cruising_tenders',
      yacht_id: resolveYacht(boatName),
      issue_date: issueDate,
      expiry_date: expiryDate,
      status: 'active',
      holder_name: holder || null,
      contact_email: email || null,
      permit_number: permitNo || null,
      issuing_authority: authority,
      requested_by: requestedBy,
      notes: remarks,
      jls_quotation_number: null,
      dma_phase: null,
    });
    tdAdded++;
  }
  console.log(`  Tenders: ${tdAdded} added, ${tdSkipped} skipped`);

  // ── 5. Batch insert ──────────────────────────────────────────────────────
  console.log(`\nTotal records to insert: ${records.length}`);
  console.log('Inserting in batches of 100 …');

  const BATCH = 100;
  let inserted = 0;
  let failed = 0;

  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);
    const { error } = await supabase.from('permits').insert(batch);
    if (error) {
      console.error(`  Batch ${Math.floor(i/BATCH)+1} FAILED: ${error.message}`);
      failed += batch.length;
    } else {
      inserted += batch.length;
      process.stdout.write(`  Inserted ${inserted}/${records.length}\r`);
    }
  }

  console.log(`\n✓ Done. ${inserted} inserted, ${failed} failed.`);
}

main().catch(err => { console.error(err); process.exit(1); });
