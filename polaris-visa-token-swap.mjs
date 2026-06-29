/**
 * POLARIS — VISA UI MIGRATION: PASS 1
 * Global token swap — old navy/gold → official brand palette
 *
 * Run from repo root:
 *   node polaris-visa-token-swap.mjs
 *   node polaris-visa-token-swap.mjs --dry-run   (preview only, no writes)
 *
 * Scope: src/components/visa/**, src/emails/visa-report/**, src/lib/visa-reporting/**
 *        src/pages/**/visas/**, src/app/**/visas/**
 *
 * Official Polaris palette:
 *   Jamaica Bay  #96CBC7   (teal accent, soft highlights)
 *   Dodger Blue  #4590BA   (primary interactive — buttons, links, active states)
 *   Teal Blue    #07435E   (nav surfaces, dark headers)
 *
 * Retired tokens (MUST NOT appear in production):
 *   #0D1F3C  old placeholder navy
 *   #C9A84C  old placeholder gold
 *   + all rgba() variants derived from those hex values
 *
 * Author: Captain Mike — JLS Yachts LLC
 * Ticket: #196  Migration: 053
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

const DRY_RUN = process.argv.includes('--dry-run');

// ─── Replacement map ────────────────────────────────────────────────────────
//
// Each entry: { pattern: RegExp, replacement: string, note: string }
//
// ORDER MATTERS — more specific patterns (rgba variants, darkened/lightened
// hex derivatives) must come before the base hex catch-alls.
//
const REPLACEMENTS = [

  // ── Old navy rgba() variants ──────────────────────────────────────────────
  // These appear in overlay backdrops, shadows, and hover states.
  // rgba(13,31,60, …) is the CSS decimal form of #0D1F3C.

  {
    pattern: /rgba\(\s*13\s*,\s*31\s*,\s*60\s*,\s*0\.7\s*\)/gi,
    replacement: 'rgba(0,0,0,0.45)',
    note: 'Modal backdrop — old navy 70% → neutral black 45%',
  },
  {
    pattern: /rgba\(\s*13\s*,\s*31\s*,\s*60\s*,\s*0\.5\s*\)/gi,
    replacement: 'rgba(0,0,0,0.35)',
    note: 'Overlay 50% → neutral black 35%',
  },
  {
    pattern: /rgba\(\s*13\s*,\s*31\s*,\s*60\s*,\s*0\.([0-9]+)\s*\)/gi,
    replacement: (_match, alpha) => `rgba(7,67,94,${(parseFloat('0.' + alpha)).toFixed(2)})`,
    note: 'Other navy rgba → Teal Blue rgba (preserves alpha)',
  },

  // ── Old gold rgba() variants ──────────────────────────────────────────────
  // rgba(201,168,76, …) is the CSS decimal form of #C9A84C.

  {
    pattern: /rgba\(\s*201\s*,\s*168\s*,\s*76\s*,\s*0\.([0-9]+)\s*\)/gi,
    replacement: (_match, alpha) => `rgba(69,144,186,${(parseFloat('0.' + alpha)).toFixed(2)})`,
    note: 'Gold rgba → Dodger Blue rgba (preserves alpha)',
  },

  // ── Lightened/darkened navy hex derivatives ───────────────────────────────
  // Common tints that appear in hover states, disabled states, borders.

  { pattern: /#1a3050/gi, replacement: '#0d5578', note: 'Navy +10% light → Teal Blue lighter' },
  { pattern: /#0a1828/gi, replacement: '#052e42', note: 'Navy -10% dark → Teal Blue darker' },
  { pattern: /#0d2240/gi, replacement: '#083550', note: 'Navy variant → Teal Blue mid' },
  { pattern: /#162a4a/gi, replacement: '#0a3d56', note: 'Navy variant → Teal Blue mid' },

  // ── Lightened/darkened gold hex derivatives ───────────────────────────────

  { pattern: /#d4b060/gi, replacement: '#5aa0cc', note: 'Gold +10% light → Dodger Blue lighter' },
  { pattern: /#b8943a/gi, replacement: '#3a7fa8', note: 'Gold -10% dark → Dodger Blue darker' },
  { pattern: /#e8c878/gi, replacement: '#7ab8d4', note: 'Gold light tint → Jamaica Bay mid' },
  { pattern: /#f0d898/gi, replacement: '#96cbc7', note: 'Gold very light → Jamaica Bay' },

  // ── Base hex values — catch-all (must come last) ──────────────────────────

  {
    pattern: /#0[Dd]1[Ff]3[Cc]/g,
    replacement: '#07435E',
    note: 'Old navy → Teal Blue (nav surfaces, dark headers)',
  },
  {
    pattern: /#[Cc]9[Aa]84[Cc]/g,
    replacement: '#4590BA',
    note: 'Old gold → Dodger Blue (buttons, links, active states)',
  },

  // ── CSS variable references that named the old tokens ────────────────────
  // If Matt created any custom CSS vars using old values in :root or theme files.

  {
    pattern: /--polaris-navy\s*:\s*#0[Dd]1[Ff]3[Cc]/g,
    replacement: '--polaris-teal-dark: #07435E',
    note: 'CSS var --polaris-navy renamed to --polaris-teal-dark',
  },
  {
    pattern: /--polaris-gold\s*:\s*#[Cc]9[Aa]84[Cc]/g,
    replacement: '--polaris-blue: #4590BA',
    note: 'CSS var --polaris-gold renamed to --polaris-blue',
  },
  {
    pattern: /var\(--polaris-navy\)/g,
    replacement: 'var(--polaris-teal-dark)',
    note: 'CSS var usage --polaris-navy → --polaris-teal-dark',
  },
  {
    pattern: /var\(--polaris-gold\)/g,
    replacement: 'var(--polaris-blue)',
    note: 'CSS var usage --polaris-gold → --polaris-blue',
  },

  // ── Tailwind arbitrary-value classes ─────────────────────────────────────
  // e.g. bg-[#0D1F3C], text-[#C9A84C], border-[#0d1f3c]

  {
    pattern: /bg-\[#0[Dd]1[Ff]3[Cc]\]/g,
    replacement: 'bg-[#07435E]',
    note: 'Tailwind arbitrary bg — navy → Teal Blue',
  },
  {
    pattern: /bg-\[#[Cc]9[Aa]84[Cc]\]/g,
    replacement: 'bg-[#4590BA]',
    note: 'Tailwind arbitrary bg — gold → Dodger Blue',
  },
  {
    pattern: /text-\[#0[Dd]1[Ff]3[Cc]\]/g,
    replacement: 'text-[#07435E]',
    note: 'Tailwind arbitrary text — navy → Teal Blue',
  },
  {
    pattern: /text-\[#[Cc]9[Aa]84[Cc]\]/g,
    replacement: 'text-[#4590BA]',
    note: 'Tailwind arbitrary text — gold → Dodger Blue',
  },
  {
    pattern: /border-\[#0[Dd]1[Ff]3[Cc]\]/g,
    replacement: 'border-[#07435E]',
    note: 'Tailwind arbitrary border — navy → Teal Blue',
  },
  {
    pattern: /border-\[#[Cc]9[Aa]84[Cc]\]/g,
    replacement: 'border-[#4590BA]',
    note: 'Tailwind arbitrary border — gold → Dodger Blue',
  },
];

// ─── File scope ──────────────────────────────────────────────────────────────

const SCAN_DIRS = [
  'src/components/visa',
  'src/emails/visa-report',
  'src/lib/visa-reporting',
  'src/pages/visas',
  'src/app/(dashboard)/visas',    // Next.js app router variant
  'src/app/visas',
];

const EXTENSIONS = new Set(['.tsx', '.ts', '.jsx', '.js', '.css', '.scss']);

// Files that should never be auto-modified (snapshots, tests, generated output)
const SKIP_PATTERNS = [
  /\.test\.(tsx?|jsx?)$/,
  /\.spec\.(tsx?|jsx?)$/,
  /\.d\.ts$/,
  /\/node_modules\//,
  /\/__snapshots__\//,
  /\/dist\//,
  /\/\.next\//,
  /\/build\//,
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function shouldSkip(filePath) {
  return SKIP_PATTERNS.some(p => p.test(filePath));
}

function walkDir(dir, results = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return results; // directory doesn't exist — skip silently
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walkDir(full, results);
    } else if (EXTENSIONS.has(extname(full)) && !shouldSkip(full)) {
      results.push(full);
    }
  }
  return results;
}

// ─── Core transform ──────────────────────────────────────────────────────────

function processFile(filePath) {
  const original = readFileSync(filePath, 'utf8');
  let updated = original;
  const applied = [];

  for (const { pattern, replacement, note } of REPLACEMENTS) {
    const before = updated;
    // replacement can be a string or function
    updated = updated.replace(pattern, replacement);
    if (updated !== before) {
      // count occurrences replaced
      const count = (before.match(pattern) || []).length;
      applied.push({ note, count });
    }
  }

  if (applied.length === 0) return null;

  return { filePath, original, updated, applied };
}

// ─── Runner ───────────────────────────────────────────────────────────────────

const allFiles = SCAN_DIRS.flatMap(d => walkDir(d));
const results  = allFiles.map(processFile).filter(Boolean);

if (results.length === 0) {
  console.log('\n✓ No old tokens found. All visa components are already on the new palette.\n');
  process.exit(0);
}

// Summary header
const totalFiles   = results.length;
const totalChanges = results.reduce((n, r) => n + r.applied.reduce((s, a) => s + a.count, 0), 0);

console.log('\n' + '─'.repeat(60));
console.log(`POLARIS VISA — PASS 1 TOKEN SWAP${DRY_RUN ? ' (DRY RUN)' : ''}`);
console.log('─'.repeat(60));
console.log(`Files with old tokens : ${totalFiles}`);
console.log(`Total replacements    : ${totalChanges}`);
console.log('─'.repeat(60) + '\n');

for (const { filePath, updated, applied } of results) {
  console.log(`📄 ${filePath}`);
  for (const { note, count } of applied) {
    console.log(`   ✦ [×${count}] ${note}`);
  }
  if (!DRY_RUN) {
    writeFileSync(filePath, updated, 'utf8');
    console.log(`   ✓ Written\n`);
  } else {
    console.log(`   ○ Skipped (dry run)\n`);
  }
}

console.log('─'.repeat(60));
if (DRY_RUN) {
  console.log('Dry run complete. Run without --dry-run to apply changes.');
} else {
  console.log('Pass 1 complete. Commit as: "style: visa module — global brand token swap (P1)"');
  console.log('\nNext: run Pass 2 (component rebuilds) before visual QA.\n');
}
console.log('─'.repeat(60) + '\n');
