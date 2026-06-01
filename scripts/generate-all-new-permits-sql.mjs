/**
 * generate-all-new-permits-sql.mjs
 *
 * 1. Splits existing permits_ms.sql and permits_ee.sql into ~85-row chunks
 * 2. Generates SQL for: Gate Pass, Sanitation, TDRA, Navigation License,
 *    DMA Permits, Abu Dhabi, Small Boats
 *
 * Run: node scripts/generate-all-new-permits-sql.mjs 2>&1
 */

import fs from 'fs';
import { createInterface } from 'readline';

const DL = 'C:/Users/Matthew/Downloads';

// ── CSV parser ────────────────────────────────────────────────────────────────
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
      resolve(lines.slice(1).filter(l => l.trim()).map(l => {
        const vals = parseCSVLine(l); const obj = {};
        headers.forEach((h, i) => { obj[h] = vals[i] ?? ''; }); return obj;
      }));
    });
    rl.on('error', reject);
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseDate(raw) {
  if (!raw?.trim()) return null;
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const yr = parseInt(m[3]);
  if (yr > 2050 || yr < 2000) return null;
  return `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
}

function esc(v) {
  if (v === null || v === undefined || v === '') return 'NULL';
  return `'${String(v).replace(/'/g,"''")}'`;
}

function dateVal(d) { return d ? `'${d}'::date` : 'NULL'; }

const TEST_EMAILS = new Set([
  'mattpeeters@newhorizon-it.co.uk','support@jlsyachts.com',
  'h.ackermann@jlsyachts.com','h.ackerman@jlsyachts.com',
]);
const TEST_NAME_RE = [/^pacific\s*x\s*exit\s*permit$/i,/^boat\s*[a-z\d]$/i,/^vboat/i,/^boaten/i,/^boat\s+(a|b|c)$/i];

function isTestBase(boatName, email, holder) {
  if (!boatName?.trim()) return true;
  if (TEST_NAME_RE.some(p => p.test(boatName.trim()))) return true;
  const e = (email||'').toLowerCase().trim();
  if (TEST_EMAILS.has(e)) return true;
  const h = (holder||'').toLowerCase().trim();
  if (h==='test'||h==='test test') return true;
  return false;
}

function isTestWithAttach(boatName, email, holder, attach) {
  if (isTestBase(boatName, email, holder)) return true;
  if ((attach||'0').trim()==='0') return true;
  return false;
}

// ── SQL templates ─────────────────────────────────────────────────────────────
function makeHeader(extraCols = []) {
  const baseCols = ['permit_type','yacht_id','issue_date','expiry_date','status',
    'holder_name','contact_email','permit_number','issuing_authority',
    'jls_quotation_number','requested_by','notes','dma_phase'];
  const allCols = [...baseCols, ...extraCols];
  const selectBaseCols = ['d.permit_type::permit_type','y.id AS yacht_id','d.issue_date',
    'd.expiry_date','d.status::permit_status','d.holder_name','d.contact_email',
    'd.permit_number','d.issuing_authority','d.jls_quotation_number','d.requested_by',
    'd.notes','d.dma_phase'];
  const selectExtraCols = extraCols.map(c => `d.${c}`);
  return `INSERT INTO permits (
  ${allCols.join(', ')}
)
SELECT
  ${[...selectBaseCols, ...selectExtraCols].join(',\n  ')}
FROM (VALUES`;
}

function makeFooter(extraCols = []) {
  const baseDCols = ['permit_type','boat_name','issue_date','expiry_date','status',
    'holder_name','contact_email','permit_number','issuing_authority',
    'jls_quotation_number','requested_by','notes','dma_phase'];
  const allDCols = [...baseDCols, ...extraCols];
  return `) AS d(
  ${allDCols.join(', ')}
)
LEFT JOIN yachts y ON upper(trim(y.vessel_name)) = d.boat_name;`;
}

function writePermitSQL(outPath, label, rows, extraCols = []) {
  if (!rows.length) { process.stderr.write(`${label}: 0 rows, skipping\n`); return; }
  const header = makeHeader(extraCols);
  const footer = makeFooter(extraCols);
  fs.writeFileSync(outPath,
    `-- ${label}: ${rows.length} rows\n` +
    header + '\n' + rows.join(',\n') + '\n' + footer + '\n',
    'utf8');
  process.stderr.write(`${label}: ${rows.length} rows → ${outPath}\n`);
}

// ── Split existing SQL files ───────────────────────────────────────────────────
function splitExistingSQL(inputPath, outputPrefix, rowsPerChunk) {
  if (!fs.existsSync(inputPath)) {
    process.stderr.write(`SKIP (not found): ${inputPath}\n`); return 0;
  }
  const content = fs.readFileSync(inputPath, 'utf8');
  const lines = content.split('\n');

  // Find "FROM (VALUES" line
  let valuesLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === 'FROM (VALUES') { valuesLine = i; break; }
  }
  // Find ") AS d(" footer line
  let footerLine = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].startsWith(') AS d(')) { footerLine = i; break; }
  }
  if (valuesLine === -1 || footerLine === -1) {
    process.stderr.write(`ERROR: Could not parse ${inputPath}\n`); return 0;
  }

  const header = lines.slice(0, valuesLine + 1).join('\n');
  const footer = lines.slice(footerLine).join('\n');
  const dataLines = lines.slice(valuesLine + 1, footerLine);

  // Each row is a single line starting with "  ("
  const rows = dataLines
    .filter(l => l.trim().startsWith('('))
    .map(l => l.trimEnd().replace(/,$/, '')); // strip trailing comma

  const numChunks = Math.ceil(rows.length / rowsPerChunk);
  for (let c = 0; c < numChunks; c++) {
    const chunk = rows.slice(c * rowsPerChunk, (c + 1) * rowsPerChunk);
    const body = chunk.map((r, i) => '  ' + r + (i < chunk.length - 1 ? ',' : '')).join('\n');
    const sql = header + '\n' + body + '\n' + footer + '\n';
    const outPath = `${outputPrefix}_chunk${c + 1}.sql`;
    fs.writeFileSync(outPath, sql, 'utf8');
    process.stderr.write(`  chunk ${c+1}/${numChunks}: ${chunk.length} rows → ${outPath}\n`);
  }
  process.stderr.write(`Split ${rows.length} rows into ${numChunks} chunks from ${inputPath}\n`);
  return rows.length;
}

// ── Gate Pass ─────────────────────────────────────────────────────────────────
async function generateGatePass() {
  const data = await readCSV(`${DL}/Gate Pass.csv`);
  const rows = []; let skip = 0;
  for (const r of data) {
    const boat   = r['Boat Name']?.trim() || '';
    const email  = r['Email']?.trim() || '';
    const holder = r['Name']?.trim() || '';
    const attach = r['Attachments']?.trim() || '0';
    if (isTestWithAttach(boat, email, holder, attach)) { skip++; continue; }
    // Skip obvious test rows by remarks
    if (/^test\s+pass$/i.test((r['Remarks']||'').trim())) { skip++; continue; }

    const issDate = parseDate(r['Gate Pass Date']);
    const duration = r['Gate Pass Duration']?.trim() || '';
    const company  = r['Company']?.trim() || '';
    const portVisit = r['Port to Visit']?.trim() || '';
    const remarks  = r['Remarks']?.trim() || '';
    const saveOnly = (r['Save Only']||'').toLowerCase().trim();
    const status   = saveOnly === 'no' ? 'active' : 'pending';

    const noteParts = [];
    if (remarks) noteParts.push(remarks);
    if (company) noteParts.push(`Company: ${company}`);
    if (portVisit) noteParts.push(`Port: ${portVisit}`);

    rows.push(
      `  (${esc('gate_pass')}, ${esc(boat.toUpperCase())}, ${dateVal(issDate)}, NULL, ` +
      `${esc(status)}, ${esc(holder||null)}, ${esc(email||null)}, ` +
      `${esc(r['Token No']?.trim()||null)}, ${esc(r['Authority']?.trim()||null)}, ` +
      `NULL, ${esc(r['Requested By']?.trim()||null)}, ` +
      `${esc(noteParts.join(' | ')||null)}, ${esc(duration||null)}, NULL, NULL)`
    );
  }
  writePermitSQL(`${DL}/permits_gp.sql`, `Gate Pass (${skip} skipped)`, rows, ['preferred_inspection_date','license_no']);
}

// ── Sanitation ────────────────────────────────────────────────────────────────
async function generateSanitation() {
  const data = await readCSV(`${DL}/Sanitation.csv`);
  const rows = []; let skip = 0;
  for (const r of data) {
    const boat   = r['Boat Name']?.trim() || '';
    const email  = r['Email']?.trim() || '';
    const holder = r['Name']?.trim() || '';
    const attach = r['Attachments']?.trim() || '0';
    if (isTestWithAttach(boat, email, holder, attach)) { skip++; continue; }
    // Skip if the JLS quote and authority invoice are both test strings
    const auth_inv = (r['Invoice No of Authority']||'').trim();
    const jls_q    = (r['JLS Quotation Number']||'').trim();
    if (/^test$/i.test(auth_inv) && /^test$/i.test(jls_q)) { skip++; continue; }

    const issDate  = parseDate(r['Sanitation date applied']);
    const inspDate = parseDate(r['Preferred inspection date']);
    const expDate  = parseDate(r['Expiry Date']);
    const authority = r['Authority']?.trim() || '';

    rows.push(
      `  (${esc('sanitation')}, ${esc(boat.toUpperCase())}, ${dateVal(issDate)}, ${dateVal(expDate)}, ` +
      `'active', ${esc(holder||null)}, ${esc(email||null)}, ` +
      `${esc(auth_inv||null)}, ${esc(authority||null)}, ` +
      `${esc(jls_q||null)}, ${esc(r['Applied By']?.trim()||null)}, ` +
      `NULL, NULL, ${dateVal(inspDate)}, NULL)`
    );
  }
  writePermitSQL(`${DL}/permits_san.sql`, `Sanitation (${skip} skipped)`, rows, ['preferred_inspection_date','license_no']);
}

// ── TDRA ──────────────────────────────────────────────────────────────────────
async function generateTDRA() {
  const data = await readCSV(`${DL}/TDRA.csv`);
  const rows = []; let skip = 0;
  for (const r of data) {
    const boat   = r['Boat Name']?.trim() || '';
    const email  = r['Email']?.trim() || '';
    const holder = r['Name']?.trim() || '';
    const attach = r['Attachments']?.trim() || '0';
    if (isTestWithAttach(boat, email, holder, attach)) { skip++; continue; }

    const issDate = parseDate(r['Certificate Date Start']) || parseDate(r['TDRA Date Applied']);
    const expDate = parseDate(r['Expiry Date']);

    rows.push(
      `  (${esc('tdra')}, ${esc(boat.toUpperCase())}, ${dateVal(issDate)}, ${dateVal(expDate)}, ` +
      `'active', ${esc(holder||null)}, ${esc(email||null)}, ` +
      `NULL, ${esc(r['Authority']?.trim()||null)}, ` +
      `${esc(r['JLS Quotation No.']?.trim()||null)}, ${esc(r['Applied By']?.trim()||null)}, ` +
      `NULL, NULL, NULL, NULL)`
    );
  }
  writePermitSQL(`${DL}/permits_tdra.sql`, `TDRA (${skip} skipped)`, rows, ['preferred_inspection_date','license_no']);
}

// ── Navigation License ────────────────────────────────────────────────────────
async function generateNavLicense() {
  const data = await readCSV(`${DL}/Navigation License.csv`);
  const rows = []; let skip = 0;
  for (const r of data) {
    const boat   = r['Boat Name']?.trim() || '';
    const email  = r['Email']?.trim() || '';
    const holder = r['Name']?.trim() || '';
    const attach = r['Attachments']?.trim() || '0';
    if (isTestWithAttach(boat, email, holder, attach)) { skip++; continue; }

    const issDate = parseDate(r['Navigation License Date Applied']);
    const expDate = parseDate(r['Expiry Date']);
    const licenseNo = r['License No.']?.trim() || '';
    const remarks   = r['Remarks']?.trim() || '';
    const qNum      = r['Quotation Number']?.trim() || '';

    rows.push(
      `  (${esc('navigation_license')}, ${esc(boat.toUpperCase())}, ${dateVal(issDate)}, ${dateVal(expDate)}, ` +
      `'active', ${esc(holder||null)}, ${esc(email||null)}, ` +
      `${esc(licenseNo||null)}, ${esc(r['Authority']?.trim()||null)}, ` +
      `${esc(qNum||null)}, ${esc(r['Applied By']?.trim()||null)}, ` +
      `${esc(remarks||null)}, NULL, NULL, ${esc(licenseNo||null)})`
    );
  }
  writePermitSQL(`${DL}/permits_navlic.sql`, `Navigation License (${skip} skipped)`, rows, ['preferred_inspection_date','license_no']);
}

// ── DMA Permits ───────────────────────────────────────────────────────────────
async function generateDMAPermits() {
  const data = await readCSV(`${DL}/DMA Permits.csv`);
  const rows = []; let skip = 0;
  for (const r of data) {
    const boat   = r['Boat Name']?.trim() || '';
    const email  = r['Email']?.trim() || '';
    const holder = r['Name']?.trim() || '';
    const attach = r['Attachments']?.trim() || '0';
    if (isTestWithAttach(boat, email, holder, attach)) { skip++; continue; }
    // Skip Save Only = Yes entries (test/draft)
    if ((r['Save Only']||'').toLowerCase().trim() === 'yes') { skip++; continue; }

    const issDate  = parseDate(r['DMA Permit Date Applied']);
    const expDate  = parseDate(r['DMA Permit Duration (6 Months)']);
    const portVisit = r['Port to Visit']?.trim() || '';
    const remarks   = r['Remarks']?.trim() || '';
    const noteParts = [];
    if (remarks) noteParts.push(remarks);
    if (portVisit) noteParts.push(`Port: ${portVisit}`);

    rows.push(
      `  (${esc('dma')}, ${esc(boat.toUpperCase())}, ${dateVal(issDate)}, ${dateVal(expDate)}, ` +
      `'active', ${esc(holder||null)}, ${esc(email||null)}, ` +
      `${esc(r['Permit No']?.trim()||null)}, ${esc(r['Authority']?.trim()||null)}, ` +
      `NULL, ${esc(r['Applied By']?.trim()||null)}, ` +
      `${esc(noteParts.join(' | ')||null)}, NULL, NULL, NULL)`
    );
  }
  writePermitSQL(`${DL}/permits_dma.sql`, `DMA Permits (${skip} skipped)`, rows, ['preferred_inspection_date','license_no']);
}

// ── Abu Dhabi Permits ─────────────────────────────────────────────────────────
async function generateAbuDhabi() {
  const data = await readCSV(`${DL}/Abu Dhabi.csv`);
  const rows = []; let skip = 0;
  for (const r of data) {
    const boat   = (r['Boat Name']||'').replace(/^v\\/i,'').trim(); // fix typo "v\Vector"
    const email  = r['Client/Purser Email']?.trim() || '';
    const holder = r['Client/Purser Name']?.trim() || '';
    if (!boat || isTestBase(boat, email, holder)) { skip++; continue; }
    // Skip obvious test rows (have "test" in most key fields)
    const permitTypeField = r['Permit Type']?.trim() || '';
    if (!permitTypeField) { skip++; continue; }
    // Skip Save Only = Yes
    if ((r['Save Only']||'').toLowerCase().trim() === 'yes') { skip++; continue; }

    // Choose best issue date based on permit type
    let issDate = parseDate(r['Issue Date'])
      || parseDate(r['Application Date'])
      || parseDate(r['Work Permit Date'])
      || parseDate(r['Bunkering Date'])
      || parseDate(r['Date Required']);
    const expDate = parseDate(r['Expiry Date'])
      || parseDate(r['Bunkering Permit Duration'])
      || parseDate(r['Permit Duration'])
      || parseDate(r['Skip Rental Duration']);

    // Build permit number
    const permitNo = r['Permit No.']?.trim()
      || r['Application Reference Number']?.trim()
      || r['Request No.']?.trim()
      || null;

    // Build notes with key context
    const noteParts = [];
    if (r['Location']?.trim()) noteParts.push(`Location: ${r['Location'].trim()}`);
    if (r['Work Description']?.trim()) noteParts.push(r['Work Description'].trim());
    if (r['Work Permit Type']?.trim()) noteParts.push(`Type: ${r['Work Permit Type'].trim()}`);
    if (r['Supplier']?.trim()) noteParts.push(`Supplier: ${r['Supplier'].trim()}`);
    if (r['Maqta Rotation Number']?.trim()) noteParts.push(`Maqta: ${r['Maqta Rotation Number'].trim()}`);

    rows.push(
      `  (${esc('abu_dhabi')}, ${esc(boat.toUpperCase())}, ${dateVal(issDate)}, ${dateVal(expDate)}, ` +
      `'active', ${esc(holder||null)}, ${esc(email||null)}, ` +
      `${esc(permitNo||null)}, ${esc(r['Authority']?.trim()||null)}, ` +
      `NULL, ${esc(r['Applied By']?.trim()||null)}, ` +
      `${esc(noteParts.join(' | ')||null)}, ${esc(permitTypeField)}, NULL, NULL)`
    );
  }
  writePermitSQL(`${DL}/permits_ad.sql`, `Abu Dhabi (${skip} skipped)`, rows, ['preferred_inspection_date','license_no']);
}

// ── Small Boats ───────────────────────────────────────────────────────────────
function parseBool(v) {
  if (v === null || v === undefined || v === '') return 'NULL';
  const s = String(v).toLowerCase().trim();
  if (s === 'true' || s === 'yes' || s === '1') return 'TRUE';
  if (s === 'false' || s === 'no' || s === '0') return 'FALSE';
  return 'NULL';
}

async function generateSmallBoats() {
  const data = await readCSV(`${DL}/Small Boat Reg (1).csv`);
  const rows = []; let skip = 0;

  for (const r of data) {
    const boat = r['Boat Name']?.trim() || '';
    if (!boat || TEST_NAME_RE.some(p => p.test(boat))) { skip++; continue; }
    // Skip rows with test holder
    const email = r['Client Email']?.trim() || '';
    if (TEST_EMAILS.has(email.toLowerCase())) { skip++; continue; }

    const startDate = parseDate(r['Reg Start Date']);
    const endDate   = parseDate(r['Reg End Date']);
    const inspDate  = parseDate(r['Inspection Date']);
    const submitDate = parseDate(r['Document Submission Date']);

    // Status mapping
    const rawStatus = (r['Status']||'').trim();
    const status = rawStatus || null;

    rows.push(
      `  (${esc(boat)}, ${esc(status)}, ${esc(r['Reg Type']?.trim()||null)}, ` +
      `${esc(r['Authority']?.trim()||null)}, ${dateVal(startDate)}, ${dateVal(endDate)}, ` +
      `${esc(r['Boat Type']?.trim()||null)}, ${esc(r['Reg. Type']?.trim()||null)}, ` +
      `${parseBool(r['8 Meters or below'])}, ${esc(r['Marine craft length']?.trim()||null)}, ` +
      `${esc(email||null)}, ${esc(r['Login - Username']?.trim()||null)}, ` +
      `${esc(r['Login - Password']?.trim()||null)}, ${esc(r['Quotation No.']?.trim()||null)}, ` +
      `${parseBool(r['Signed Quote'])}, ${parseBool(r['Quotation Approved'])}, ` +
      `${parseBool(r['Emirates ID'])}, ${parseBool(r['Passport Copy'])}, ` +
      `${parseBool(r['Visa Copy'])}, ${parseBool(r['Salary Certificate with income of 20,000 and above'])}, ` +
      `${parseBool(r['Copy of Partnership in commercial Dubai-issued trade license '])}, ` +
      `${parseBool(r['Copy of title deed for freehold property owners to whom the residence law is not applicable'])}, ` +
      `${parseBool(r['Valid Dubai-issued Trade License '])}, ` +
      `${parseBool(r['Establishment card'])}, ` +
      `${parseBool(r['Marine Craft Builder Certificate'])}, ` +
      `${parseBool(r['Proof of ownership or attested purchase invoice'])}, ` +
      `${parseBool(r['Marine craft cancellation certificate'])}, ` +
      `${parseBool(r['Attested sale agreement'])}, ` +
      `${parseBool(r['Customs clearance certificate'])}, ` +
      `${parseBool(r['TDRA - Ship Station License '])}, ` +
      `${parseBool(r['Copy of insurance policy valid for (13) months, issued by an insurance firm licensed to operate in the Emirate'])}, ` +
      `${parseBool(r['Copy of valid trailer registration or copy of valid annual berth contract issued by marine club or marina in the Emirate'])}, ` +
      `${parseBool(r['Copy of environment specifications certificate issued by Emirates Authority for Standardization and Metrology (ESMA), for the new Petrol Outboard marine engines'])}, ` +
      `${parseBool(r['Copy of stability booklet for all marine crafts, licensed to carry more than 12 passengers, regardless of type or structure material.'])}, ` +
      `${dateVal(submitDate)}, ${dateVal(inspDate)}, ` +
      `${esc(r['Inspection Location']?.trim()||null)}, ` +
      `${esc(r['PRO']?.trim()||null)}, ` +
      `${esc(r['Marine craft license']?.trim()||null)}, ` +
      `${esc(r['Link to folder']?.trim()||null)}, ` +
      `${esc(r['Notes and Updates']?.trim()||null)}, ` +
      `${parseBool(r['Send Email'])}, ` +
      `${parseBool(r['Archive'])})`
    );
  }

  if (!rows.length) { process.stderr.write(`Small Boats: 0 rows, skipping\n`); return; }

  const sql = `-- Small Boats: ${rows.length} rows (${skip} skipped)
INSERT INTO small_boats (
  boat_name, status, reg_type, authority, reg_start_date, reg_end_date,
  boat_type, reg_sub_type, eight_meters_or_below, marine_craft_length,
  client_email, login_username, login_password, quotation_no,
  signed_quote, quotation_approved,
  doc_emirates_id, doc_passport_copy, doc_visa_copy, doc_salary_certificate,
  doc_partnership_trade_license, doc_title_deed, doc_trade_license,
  doc_establishment_card, doc_builder_certificate, doc_proof_of_ownership,
  doc_cancellation_certificate, doc_sale_agreement, doc_customs_clearance,
  doc_tdra_license, doc_insurance_policy, doc_trailer_registration,
  doc_environment_certificate, doc_stability_booklet,
  document_submission_date, inspection_date, inspection_location,
  pro, marine_craft_license, link_to_folder, notes, send_email, archive
)
VALUES
${rows.join(',\n')};
`;
  fs.writeFileSync(`${DL}/small_boats.sql`, sql, 'utf8');
  process.stderr.write(`Small Boats: ${rows.length} rows → ${DL}/small_boats.sql\n`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  process.stderr.write('=== Splitting existing SQL files ===\n');
  splitExistingSQL(`${DL}/permits_ms.sql`, `${DL}/permits_ms`, 85);
  splitExistingSQL(`${DL}/permits_ee.sql`, `${DL}/permits_ee`, 85);

  process.stderr.write('\n=== Generating new permit SQL files ===\n');
  await generateGatePass();
  await generateSanitation();
  await generateTDRA();
  await generateNavLicense();
  await generateDMAPermits();
  await generateAbuDhabi();
  await generateSmallBoats();

  process.stderr.write('\nDone! Files written to ' + DL + '\n');
}

main().catch(e => { process.stderr.write(e.stack + '\n'); process.exit(1); });
