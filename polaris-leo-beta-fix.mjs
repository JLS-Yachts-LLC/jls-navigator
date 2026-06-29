#!/usr/bin/env node
/**
 * POLARIS — LEO MISSING FROM BETA VIEW: DIAGNOSTIC & FIX
 *
 * Scans the beta layout and related files to identify exactly why
 * LeoPanel is not appearing in the beta view, then outputs a targeted
 * fix for Matt to apply.
 *
 * Run from repo root:
 *   node polaris-leo-beta-fix.mjs
 *   node polaris-leo-beta-fix.mjs --dry-run
 *
 * What it checks:
 *   1. Beta layout file — does it import and render LeoPanel/PolarisShell?
 *   2. Feature flags — is Leo gated behind devMode / isBeta / featureFlags.leo?
 *   3. User prop — is UserWithClaims being passed to the beta layout?
 *   4. Module permission — is the 'leo' module check blocking render?
 *   5. Route registration — is the beta route using the correct layout wrapper?
 *
 * Author: Captain Mike — JLS Yachts LLC
 * Ticket: #196  Migration: 053
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, extname, relative, dirname } from 'path';

const DRY_RUN = process.argv.includes('--dry-run');
const ROOT    = process.cwd();
const rel     = (f) => relative(ROOT, f);

// ─── Findings accumulator ─────────────────────────────────────────────────────

const findings = [];   // { severity, type, file, line, description, fix, autoFix? }

function flag(severity, type, file, line, description, fix, autoFix = null) {
  findings.push({ severity, type, file, line, description, fix, autoFix });
}

// ─── File walker ──────────────────────────────────────────────────────────────

const SKIP = /node_modules|dist|\.next|build|__snapshots__|\.test\.|\.spec\.|\.d\.ts/;
const EXTS = new Set(['.tsx', '.ts', '.jsx', '.js']);

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const full = join(dir, e);
    if (SKIP.test(full)) continue;
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (EXTS.has(extname(full))) out.push(full);
  }
  return out;
}

// ─── Locate key files ─────────────────────────────────────────────────────────

function findFiles(pattern) {
  const all = walk(join(ROOT, 'src'));
  return all.filter(f => pattern.test(f));
}

const betaLayoutFiles = findFiles(/beta.*layout|layout.*beta/i);
const shellFiles      = findFiles(/PolarisShell|polaris-shell/i);
const leoPanelFiles   = findFiles(/LeoPanel|leo-panel|LeoBriefing/i);
const routeFiles      = findFiles(/routes?|router|_app|layout/i).filter(f =>
  readFileSync(f, 'utf8').includes('beta') ||
  readFileSync(f, 'utf8').includes('Beta')
);

// ─── CHECK 1: Does beta layout exist? ────────────────────────────────────────

console.log('\n' + '─'.repeat(64));
console.log('POLARIS LEO — BETA VIEW DIAGNOSTIC');
console.log('─'.repeat(64));

if (betaLayoutFiles.length === 0) {
  console.log('\n⚠  No beta layout file found by name.');
  console.log('   Searching by content (files that mention "beta" and render a layout)...\n');

  // Broaden search — look for any layout file that references beta
  const allLayouts = findFiles(/layout|Layout|shell|Shell/i);
  const betaRefs   = allLayouts.filter(f => {
    const src = readFileSync(f, 'utf8');
    return /beta|Beta|BETA/.test(src);
  });

  if (betaRefs.length > 0) {
    betaRefs.forEach(f => betaLayoutFiles.push(f));
    console.log(`  Found ${betaRefs.length} layout file(s) referencing beta:`);
    betaRefs.forEach(f => console.log(`    ${rel(f)}`));
  } else {
    flag(
      'CRITICAL', 'NO_BETA_LAYOUT', null, null,
      'No beta layout file found anywhere in src/. The beta view may be using the default layout without a Leo slot.',
      'Create a beta layout file or ensure the beta route is wrapped by PolarisShell. See fix output below.'
    );
  }
} else {
  console.log(`\n  Beta layout file(s) found: ${betaLayoutFiles.length}`);
  betaLayoutFiles.forEach(f => console.log(`    ${rel(f)}`));
}

// ─── CHECK 2: Does beta layout import/render LeoPanel or PolarisShell? ───────

for (const layoutFile of betaLayoutFiles) {
  const src   = readFileSync(layoutFile, 'utf8');
  const lines = src.split('\n');

  const hasLeoPanelImport  = /import.*LeoPanel|import.*LeoBriefing/i.test(src);
  const hasLeoPanelRender  = /<LeoPanel|<LeoBriefing/i.test(src);
  const hasShellImport     = /import.*PolarisShell/i.test(src);
  const hasShellRender     = /<PolarisShell/i.test(src);

  console.log(`\n  ${rel(layoutFile)}:`);
  console.log(`    LeoPanel imported : ${hasLeoPanelImport ? '✓' : '✗'}`);
  console.log(`    LeoPanel rendered : ${hasLeoPanelRender ? '✓' : '✗'}`);
  console.log(`    PolarisShell used : ${hasShellRender    ? '✓' : '✗'}`);

  if (!hasShellRender && !hasLeoPanelRender) {
    // Generate the fix — find where <main> or the content area starts
    let insertLine = null;
    let insertAfter = null;

    lines.forEach((line, i) => {
      if (/<main|className=["'][^"']*content|className=["'][^"']*main-area/.test(line)) {
        insertLine = i + 1;
        insertAfter = line;
      }
    });

    flag(
      'CRITICAL', 'LEO_NOT_IN_BETA_LAYOUT', layoutFile, insertLine,
      'Beta layout does not import or render LeoPanel. Leo will be completely absent from the beta view.',
      insertLine
        ? `Insert <LeoPanel user={user} /> immediately after line ${insertLine}:\n     "${insertAfter?.trim()}"`
        : 'Import LeoPanel and add <LeoPanel user={user} /> at the top of the main content area.',
      // Auto-fix: inject import + LeoPanel into layout
      !hasLeoPanelImport ? {
        type:       'INJECT_LEO',
        file:       layoutFile,
        insertLine,
        src,
      } : null
    );
  } else if (hasLeoPanelImport && !hasLeoPanelRender) {
    flag(
      'HIGH', 'LEO_IMPORTED_NOT_RENDERED', layoutFile, null,
      'LeoPanel is imported in the beta layout but never rendered — it is imported but the JSX tag is missing.',
      'Find the content area in the beta layout and add: <LeoPanel user={user} />'
    );
  }
}

// ─── CHECK 3: Feature flag gating ────────────────────────────────────────────

const allFiles = walk(join(ROOT, 'src'));

for (const f of allFiles) {
  const src = readFileSync(f, 'utf8');
  if (!/LeoPanel|LeoBriefing/i.test(src)) continue;

  const lines = src.split('\n');
  lines.forEach((line, i) => {
    // Look for Leo render behind a flag
    const FLAG_PATTERNS = [
      { re: /\{.*(?:devMode|isDev|isDevMode).*&&.*<Leo/,          label: 'devMode flag' },
      { re: /\{.*(?:isBeta|betaMode|betaView).*&&.*<Leo/,         label: 'isBeta flag' },
      { re: /\{.*featureFlags?\.leo.*&&.*<Leo/i,                   label: 'featureFlags.leo flag' },
      { re: /\{.*featureFlags?\.leoEnabled.*&&.*<Leo/i,            label: 'featureFlags.leoEnabled flag' },
      { re: /\{.*showLeo.*&&.*<Leo/i,                              label: 'showLeo flag' },
      { re: /\{.*user\.modules?.*includes.*['"]leo['"].*&&.*<Leo/, label: 'module permission gate' },
    ];

    for (const { re, label } of FLAG_PATTERNS) {
      if (re.test(line)) {
        flag(
          'HIGH', 'LEO_BEHIND_FLAG', f, i + 1,
          `LeoPanel is conditionally rendered behind a ${label} on line ${i + 1}. If this flag is false in the beta view, Leo will not appear.`,
          `Check that ${label} evaluates to true in the beta view context. If Leo should always appear for global_admin users, remove the flag or ensure it passes for md@jlsyachts.com.`,
        );
      }
    }
  });
}

// ─── CHECK 4: User prop not passed to beta layout ────────────────────────────

for (const layoutFile of betaLayoutFiles) {
  const src = readFileSync(layoutFile, 'utf8');

  const hasUserProp    = /\buser\b/.test(src);
  const hasGetSession  = /getSession|getServerSession|useUser|useSession|useAuth/.test(src);
  const hasLeoRender   = /<LeoPanel|<LeoBriefing/i.test(src);

  if (hasLeoRender && !hasUserProp && !hasGetSession) {
    flag(
      'HIGH', 'USER_PROP_MISSING', layoutFile, null,
      'Beta layout renders LeoPanel but does not appear to fetch or receive a user session. LeoPanel requires UserWithClaims to call the briefing API.',
      'Ensure the beta layout fetches the session:\n' +
      '  const { data: { session } } = await supabase.auth.getSession();\n' +
      '  const user = session?.user;\n' +
      '  Then pass: <LeoPanel user={user} />'
    );
  }
}

// ─── CHECK 5: Route file not using PolarisShell ───────────────────────────────

for (const routeFile of routeFiles) {
  const src = readFileSync(routeFile, 'utf8');
  if (!/<PolarisShell|PolarisShell/.test(src) && !/import.*PolarisShell/.test(src)) {
    flag(
      'MEDIUM', 'ROUTE_MISSING_SHELL', routeFile, null,
      `Beta route file does not use PolarisShell. If Leo is rendered inside PolarisShell, it will be absent from any route that bypasses it.`,
      'Wrap the beta route content in <PolarisShell user={user} workspace={workspace}>{children}</PolarisShell>'
    );
  }
}

// ─── Output findings ──────────────────────────────────────────────────────────

console.log('\n\n' + '─'.repeat(64));
console.log(`FINDINGS: ${findings.length} issue(s) identified`);
console.log('─'.repeat(64));

if (findings.length === 0) {
  console.log('\n✓ Leo appears to be correctly wired into the beta layout.\n');
  console.log('  If it is still not showing, check:');
  console.log('  1. Browser console for errors on /api/leo/briefing');
  console.log('  2. Network tab — is the briefing API call being made?');
  console.log('  3. React DevTools — is <LeoPanel> in the component tree?');
  console.log('  4. The LeoPanel component itself for an early return on missing user prop.\n');
  process.exit(0);
}

const SEVERITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const sorted = findings.sort(
  (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
);

sorted.forEach((finding, idx) => {
  const icon = { CRITICAL: '🔴', HIGH: '🟠', MEDIUM: '🟡', LOW: '⚪' }[finding.severity];
  console.log(`\n${icon} [${finding.severity}] ${finding.type}`);
  if (finding.file) console.log(`   File: ${rel(finding.file)}${finding.line ? ` (line ${finding.line})` : ''}`);
  console.log(`   Issue: ${finding.description}`);
  console.log(`   Fix:   ${finding.fix}`);
});

// ─── Auto-fix: inject LeoPanel into beta layout ───────────────────────────────

const injectFindings = sorted.filter(f => f.autoFix?.type === 'INJECT_LEO');

if (injectFindings.length > 0 && !DRY_RUN) {
  console.log('\n' + '─'.repeat(64));
  console.log('AUTO-FIX: Injecting LeoPanel into beta layout(s)');
  console.log('─'.repeat(64));

  for (const finding of injectFindings) {
    const { file, src, insertLine } = finding.autoFix;
    let lines = src.split('\n');

    // 1. Add import if missing
    const lastImportLine = lines.reduce((last, line, i) =>
      /^import /.test(line) ? i : last, 0);

    lines.splice(lastImportLine + 1, 0, "import { LeoPanel } from '@/components/leo/LeoPanel';");

    // 2. Find insertion point — after <main or first content wrapper
    let targetLine = insertLine;
    if (!targetLine) {
      targetLine = lines.findIndex(l =>
        /<main|className=["'][^"']*content|className=["'][^"']*dashboard-body/.test(l)
      );
      targetLine = targetLine !== -1 ? targetLine + 1 : lastImportLine + 5;
    }

    // 3. Inject LeoPanel JSX with comment
    const indent = '      '; // standard 6-space indent for JSX content
    lines.splice(targetLine + 1, 0,
      `${indent}{/* Leo briefing panel — always rendered at top of content area */}`,
      `${indent}<LeoPanel user={user} />`
    );

    const newSrc = lines.join('\n');

    if (!DRY_RUN) {
      writeFileSync(file, newSrc, 'utf8');
      console.log(`\n  ✓ LeoPanel injected into ${rel(file)}`);
      console.log(`    Import added after line ${lastImportLine + 1}`);
      console.log(`    <LeoPanel user={user} /> added at line ${targetLine + 2}`);
      console.log(`\n  ⚠  Verify: ensure 'user' is in scope at the injection point.`);
      console.log(`     If the component uses a different variable name (e.g. currentUser,`);
      console.log(`     session.user), update the prop manually.`);
    } else {
      console.log(`\n  ○ Dry run — would inject into ${rel(file)}`);
    }
  }
}

// ─── Summary + commit ─────────────────────────────────────────────────────────

console.log('\n' + '─'.repeat(64));

if (!DRY_RUN && injectFindings.length > 0) {
  console.log('\nCommit as: "fix: wire LeoPanel into beta layout (ticket #196)"\n');
} else if (DRY_RUN) {
  console.log('\nDry run complete. Run without --dry-run to apply auto-fixes.\n');
} else {
  console.log('\nAll findings are manual fixes. Apply the fixes above, then restart the dev server.\n');
}

console.log('─'.repeat(64) + '\n');
