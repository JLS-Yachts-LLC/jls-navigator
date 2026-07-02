/**
 * Deploy guard — blocks `npm run deploy` when this checkout is BEHIND origin/main.
 *
 * Two Claude Code sessions (and humans) deploy this worker. A deploy from a
 * stale checkout silently wipes the other stream's pushed work off live
 * (last-writer-wins). This makes that impossible: pull/rebase first, then deploy.
 * Unpushed local commits are fine — only being behind the remote is blocked.
 */
import { execSync } from 'node:child_process'

const run = (cmd) => execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

try {
  run('git fetch origin main --quiet')
} catch {
  console.warn('[deploy-guard] could not fetch origin (offline?) — proceeding without the check')
  process.exit(0)
}

let behind = 0
try {
  behind = Number(run('git rev-list --count HEAD..origin/main') || '0')
} catch {
  process.exit(0)
}

if (behind > 0) {
  console.error('')
  console.error(`✋ DEPLOY BLOCKED — this checkout is ${behind} commit(s) behind origin/main.`)
  console.error('   Deploying now would remove already-pushed work from the live worker.')
  console.error('')
  console.error('   Fix:  git pull --rebase origin main   →  npm run deploy')
  console.error('')
  process.exit(1)
}

console.log('[deploy-guard] up to date with origin/main ✓')
