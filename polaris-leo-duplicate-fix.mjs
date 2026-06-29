#!/usr/bin/env node
/**
 * POLARIS — LEO BRIEFING DUPLICATE TEXT DIAGNOSTIC & FIX
 *
 * Scans the Leo briefing component(s) for the three known causes of
 * duplicate briefing text and applies the appropriate fix.
 *
 * Run from repo root:
 *   node polaris-leo-duplicate-fix.mjs
 *   node polaris-leo-duplicate-fix.mjs --dry-run
 *
 * What it checks:
 *   1. Duplicate JSX render blocks (same variable rendered twice)
 *   2. State append instead of replace (setBriefing(prev => prev + ...))
 *   3. Missing state clear before fetch (no setBriefing('') before async call)
 *   4. Parent + child both rendering the same prop
 *
 * Author: Captain Mike — JLS Yachts LLC
 * Ticket: #196  Migration: 053
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, extname, relative } from 'path';

const DRY_RUN = process.argv.includes('--dry-run');
const ROOT    = process.cwd();

// ─── Scan scope ───────────────────────────────────────────────────────────────

const SCAN_DIRS = [
  'src/components/leo',
  'src/components/dashboard',
  'src/components/captain',
  'src/pages',
  'src/app',
  'components',          // flat structure fallback
];

const EXTENSIONS   = new Set(['.tsx', '.ts', '.jsx', '.js']);
const SKIP_PATTERN = /node_modules|dist|\.next|build|__snapshots__|\.test\.|\.spec\.|\.d\.ts/;

// ─── Issue registry ───────────────────────────────────────────────────────────

const issues = [];   // { file, type, line, description, original, fixed }

// ─── File walker ──────────────────────────────────────────────────────────────

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const full = join(dir, e);
    if (SKIP_PATTERN.test(full)) continue;
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (EXTENSIONS.has(extname(full))) out.push(full);
  }
  return out;
}

// ─── Heuristics ───────────────────────────────────────────────────────────────

/**
 * HEURISTIC 1 — Duplicate JSX render of the same briefing variable.
 *
 * Looks for any JSX expression {someVar} that appears more than once in
 * JSX return blocks, where the variable name matches common Leo briefing
 * naming conventions.
 *
 * Fixes by removing the second occurrence's containing JSX line.
 */
function checkDuplicateJsxRender(src, filePath) {
  const BRIEFING_VAR = /\{(briefing(?:Text|Content|Message|Summary|Data)?(?:\?\.(?:text|content|message|body))?)\}/g;
  const lines = src.split('\n');
  const seen  = {};   // varExpression -> [lineNumbers]

  lines.forEach((line, i) => {
    let m;
    const re = new RegExp(BRIEFING_VAR.source, 'g');
    while ((m = re.exec(line)) !== null) {
      const expr = m[1];
      if (!seen[expr]) seen[expr] = [];
      seen[expr].push(i + 1);
    }
  });

  for (const [expr, lineNums] of Object.entries(seen)) {
    if (lineNums.length < 2) continue;

    // Flag the duplicate lines (all after the first)
    const duplicates = lineNums.slice(1);
    for (const lineNo of duplicates) {
      const lineIdx = lineNo - 1;
      const original = lines[lineIdx];

      // Only fix if the duplicate line is a self-contained JSX expression line
      // (i.e. the entire meaningful content of the line is the duplicate render)
      const isSafeToRemove = /^\s*(<[^>]+>)?\s*\{/.test(original) &&
                              /\}\s*(<\/[^>]+>)?\s*$/.test(original);

      issues.push({
        file:        filePath,
        type:        'DUPLICATE_JSX_RENDER',
        line:        lineNo,
        description: `{${expr}} rendered more than once (first at line ${lineNums[0]}, duplicate at line ${lineNo})`,
        original,
        fixed:       isSafeToRemove ? null : original,   // null = line should be deleted
        safeToAuto:  isSafeToRemove,
      });
    }
  }
}

/**
 * HEURISTIC 2 — State append instead of replace.
 *
 * Detects patterns like:
 *   setBriefing(prev => prev + chunk)
 *   setBriefing(prev => prev + data.text)
 *   setLeoText(existing => existing + newText)
 *
 * Fixes by converting to a direct set:
 *   setBriefing(chunk)
 */
function checkStateAppend(src, filePath) {
  const lines = src.split('\n');
  // Match: setSomeState(prev => prev + ...)  or  setSomeState(existing => existing + ...)
  const APPEND_RE = /\b(set\w*(?:Briefing|Brief|Leo|Summary|Message|Content|Text)\w*)\(\s*(\w+)\s*=>\s*\2\s*\+\s*([^)]+)\)/g;

  lines.forEach((line, i) => {
    let m;
    const re = new RegExp(APPEND_RE.source, 'g');
    while ((m = re.exec(line)) !== null) {
      const setter   = m[1];
      const newValue = m[3].trim();
      const fixed    = line.replace(m[0], `${setter}(${newValue})`);

      issues.push({
        file:        filePath,
        type:        'STATE_APPEND',
        line:        i + 1,
        description: `${setter} appends to previous state instead of replacing — causes text to double on re-fetch`,
        original:    line,
        fixed,
        safeToAuto:  true,
      });
    }
  });
}

/**
 * HEURISTIC 3 — Missing state clear before async fetch.
 *
 * Looks for useEffect blocks that call a briefing-fetch function WITHOUT
 * a preceding state-clear call (setBriefing('') or setBriefing(null)).
 *
 * This is a flag-only heuristic — we report the location but don't auto-fix
 * because the safe insertion point depends on async pattern (then/await/callback).
 */
function checkMissingStateClear(src, filePath) {
  const lines  = src.split('\n');
  const srcStr = src;

  // Find useEffect blocks that contain a briefing fetch
  const EFFECT_RE = /useEffect\s*\(\s*\(\s*\)\s*=>\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}\s*,/gs;
  let m;
  while ((m = EFFECT_RE.exec(srcStr)) !== null) {
    const body      = m[1];
    const hasFetch  = /fetch|axios|supabase|getBriefing|fetchBriefing|loadBriefing|getLeo|fetchLeo/i.test(body);
    const hasClear  = /setBriefing\s*\(\s*(?:''|""|null|undefined)\s*\)|setLeo\w*\s*\(\s*(?:''|""|null)\s*\)/i.test(body);

    if (hasFetch && !hasClear) {
      // Find the line number of this useEffect
      const linesBefore = srcStr.slice(0, m.index).split('\n').length;
      issues.push({
        file:        filePath,
        type:        'MISSING_STATE_CLEAR',
        line:        linesBefore,
        description: 'useEffect fetches briefing data but does not clear state first — stale text remains visible during refetch',
        original:    null,
        fixed:       null,
        safeToAuto:  false,
        manualFix:   `Add  setBriefing('')  (or setLeoText(''), setBriefingData(null)) as the FIRST line inside this useEffect, before the fetch call.`,
      });
    }
  }
}

/**
 * HEURISTIC 4 — Parent and child both rendering the same prop.
 *
 * Detects when a component both passes a prop AND renders it inline,
 * and the child component is also likely to render the same prop.
 *
 * Looks for patterns like:
 *   <LeoBriefing text={briefingText} />
 *   ...
 *   <div>{briefingText}</div>   ← same variable rendered in parent too
 */
function checkParentChildDuplicate(src, filePath) {
  const lines = src.split('\n');

  // Find JSX component tags that pass a briefing-like prop
  const COMPONENT_RE = /<(Leo\w+|Briefing\w+|\w+Briefing|\w+Leo)[^>]*\b(text|briefing|content|message|summary)=\{(\w+)\}/g;

  lines.forEach((line, i) => {
    let m;
    const re = new RegExp(COMPONENT_RE.source, 'g');
    while ((m = re.exec(line)) !== null) {
      const componentName = m[1];
      const propValue     = m[3];

      // Now check if the same variable is also rendered directly in this file
      // outside of the component tag
      const directRenderRe = new RegExp(
        `(?<!\\w)\\{${propValue}(?:\\?\\.[\\w.]+)?\\}(?!\\s*=)`,
        'g'
      );
      const allMatches = [...src.matchAll(directRenderRe)];

      if (allMatches.length > 1) {
        // More than one render of this variable — likely parent+child duplicate
        const matchLines = allMatches.map(mm => src.slice(0, mm.index).split('\n').length);
        const duplicateLines = matchLines.filter(l => l !== i + 1);

        if (duplicateLines.length > 0) {
          issues.push({
            file:        filePath,
            type:        'PARENT_CHILD_DUPLICATE',
            line:        i + 1,
            description: `${componentName} receives "${propValue}" as a prop (line ${i + 1}) AND the parent also renders {${propValue}} directly at line(s) ${duplicateLines.join(', ')} — text will appear twice`,
            original:    null,
            fixed:       null,
            safeToAuto:  false,
            manualFix:   `Remove the direct {${propValue}} render from the parent. Let ${componentName} own the rendering of this prop internally.`,
          });
        }
      }
    }
  });
}

// ─── Run heuristics over all files ───────────────────────────────────────────

const allFiles = SCAN_DIRS.flatMap(d => walk(join(ROOT, d)));

if (allFiles.length === 0) {
  console.log('\n⚠  No files found. Check that SCAN_DIRS paths match your project structure.\n');
  console.log('   Searched in:');
  SCAN_DIRS.forEach(d => console.log(`     ${d}`));
  console.log('\n   Run from the repo root, e.g.: node polaris-leo-duplicate-fix.mjs\n');
  process.exit(1);
}

for (const filePath of allFiles) {
  const src = readFileSync(filePath, 'utf8');

  // Only run heuristics on files that mention Leo or briefing at all
  if (!/briefing|leo|LEO/i.test(src)) continue;

  checkDuplicateJsxRender(filePath, filePath);
  checkStateAppend(src, filePath);
  checkMissingStateClear(src, filePath);
  checkParentChildDuplicate(src, filePath);
}

// ─── Report ───────────────────────────────────────────────────────────────────

const rel = (f) => relative(ROOT, f);

if (issues.length === 0) {
  console.log('\n✓ No duplicate briefing issues detected.\n');
  console.log('  If the problem persists, run the browser DevTools check:');
  console.log('  Inspect the briefing text node — if two sibling <div> nodes');
  console.log('  contain the same text, add a console.log to the component');
  console.log('  render function to count how many times it fires.\n');
  process.exit(0);
}

console.log('\n' + '─'.repeat(64));
console.log(`POLARIS LEO — DUPLICATE BRIEFING DIAGNOSTIC${DRY_RUN ? ' (DRY RUN)' : ''}`);
console.log('─'.repeat(64));
console.log(`Issues found : ${issues.length}`);
console.log(`Auto-fixable : ${issues.filter(i => i.safeToAuto).length}`);
console.log(`Manual only  : ${issues.filter(i => !i.safeToAuto).length}`);
console.log('─'.repeat(64) + '\n');

// Group by file
const byFile = {};
for (const issue of issues) {
  if (!byFile[issue.file]) byFile[issue.file] = [];
  byFile[issue.file].push(issue);
}

const filesToWrite = {};

for (const [filePath, fileIssues] of Object.entries(byFile)) {
  console.log(`📄 ${rel(filePath)}`);

  let src = readFileSync(filePath, 'utf8');
  let lines = src.split('\n');
  let modified = false;
  const linesToDelete = new Set();

  for (const issue of fileIssues) {
    const autoTag = issue.safeToAuto ? '[AUTO-FIX]' : '[MANUAL]  ';
    console.log(`\n  ${autoTag} Line ${issue.line} — ${issue.type}`);
    console.log(`           ${issue.description}`);

    if (!issue.safeToAuto && issue.manualFix) {
      console.log(`\n  ✏  Manual fix required:`);
      console.log(`     ${issue.manualFix}`);
    }

    if (issue.safeToAuto && !DRY_RUN) {
      if (issue.fixed === null) {
        // Delete this line
        linesToDelete.add(issue.line - 1);
        modified = true;
        console.log(`\n  ✓  Line ${issue.line} queued for deletion`);
      } else if (issue.fixed !== issue.original) {
        // Replace line
        lines[issue.line - 1] = issue.fixed;
        modified = true;
        console.log(`\n  ✓  Line ${issue.line} updated`);
        console.log(`     Before: ${issue.original?.trim()}`);
        console.log(`     After:  ${issue.fixed?.trim()}`);
      }
    } else if (issue.safeToAuto && DRY_RUN) {
      if (issue.fixed === null) {
        console.log(`\n  ○  Would delete line ${issue.line}: ${lines[issue.line - 1]?.trim()}`);
      } else {
        console.log(`\n  ○  Would change line ${issue.line}:`);
        console.log(`     Before: ${issue.original?.trim()}`);
        console.log(`     After:  ${issue.fixed?.trim()}`);
      }
    }
  }

  if (modified) {
    // Apply deletions in reverse order so line numbers stay valid
    const filteredLines = lines.filter((_, i) => !linesToDelete.has(i));
    filesToWrite[filePath] = filteredLines.join('\n');
  }

  console.log('');
}

// ─── Write fixes ──────────────────────────────────────────────────────────────

if (!DRY_RUN && Object.keys(filesToWrite).length > 0) {
  for (const [filePath, newSrc] of Object.entries(filesToWrite)) {
    writeFileSync(filePath, newSrc, 'utf8');
    console.log(`  ✓ Written: ${rel(filePath)}`);
  }
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log('─'.repeat(64));

const manualItems = issues.filter(i => !i.safeToAuto);
if (manualItems.length > 0) {
  console.log('\n⚠  Manual fixes still required:\n');
  manualItems.forEach((issue, idx) => {
    console.log(`  ${idx + 1}. ${rel(issue.file)} — line ${issue.line}`);
    console.log(`     ${issue.manualFix ?? issue.description}\n`);
  });
}

if (DRY_RUN) {
  console.log('Dry run complete. Run without --dry-run to apply auto-fixes.\n');
} else {
  const fixed = issues.filter(i => i.safeToAuto).length;
  console.log(`\n${fixed > 0 ? `✓ ${fixed} issue(s) auto-fixed.` : 'No auto-fixes applied.'}`);
  console.log('Commit as: "fix: leo briefing — remove duplicate text render (ticket #196)"\n');
}

console.log('─'.repeat(64) + '\n');
