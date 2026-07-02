/**
 * Create a user account via the Supabase admin API.
 * Works even though public signups are disabled on this instance.
 * The account is created email-confirmed, so the user can sign in immediately
 * with the temporary password (or use "Forgot password" to set their own).
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/create-user.mjs \
 *     --email support@jlsyachts.com --name "Astrid" [--role user] [--password "..."]
 *
 * If --password is omitted a strong one is generated and printed.
 * Get the service role key from:
 *   Supabase Dashboard → Project Settings → API → service_role secret
 */

import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const SUPABASE_URL = "https://cqzdroabjcdyncfqwawy.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error("❌  SUPABASE_SERVICE_ROLE_KEY env var is not set.");
  console.error('    Run:  SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/create-user.mjs --email ... --name ...');
  process.exit(1);
}

// ─── Parse args ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

const email = getArg("--email");
const name = getArg("--name") ?? null;
const role = getArg("--role") ?? "user"; // user | manager | admin
const password = getArg("--password") ?? `${name ?? "User"}-${randomBytes(6).toString("base64url")}-2026!`;

if (!email) {
  console.error("❌  --email is required.");
  process.exit(1);
}
if (!["user", "manager", "admin"].includes(role)) {
  console.error(`❌  --role must be one of: user, manager, admin (got "${role}")`);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// ─── Create ────────────────────────────────────────────────────────────────
const { data, error } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: name ? { display_name: name } : undefined,
});

if (error) {
  console.error(`❌  Failed to create user: ${error.message}`);
  process.exit(1);
}

const userId = data.user.id;
console.log(`✅  Created auth user ${email}  (id: ${userId})`);

// The on_auth_user_created trigger already inserted a profile + a 'user' role.
// Only touch user_roles if a non-default role was requested.
if (role !== "user") {
  const { error: roleErr } = await supabase
    .from("user_roles")
    .update({ role })
    .eq("user_id", userId);
  if (roleErr) {
    console.error(`⚠️   User created, but failed to set role "${role}": ${roleErr.message}`);
    process.exit(1);
  }
  console.log(`✅  Set role: ${role}`);
}

console.log("");
console.log("─".repeat(50));
console.log(`  Email:     ${email}`);
console.log(`  Password:  ${password}`);
console.log(`  Role:      ${role}`);
console.log("─".repeat(50));
console.log("  Share the password securely. The user can change it via");
console.log("  \"Forgot your password?\" on the sign-in page.");
