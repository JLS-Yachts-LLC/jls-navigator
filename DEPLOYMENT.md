# JLS Yachts CRM — Migration & Deployment Guide

This app is a **TanStack Start** (React 19 + Vite 7) project with a **Supabase** backend, designed to deploy on **Cloudflare Workers**. Below is everything you need to (1) move it onto your own Supabase project, (2) deploy it to Cloudflare, and (3) push the code to GitHub.

---

## 1. Get the code into GitHub

You have two options.

### Option A — From inside Lovable (easiest)
1. In the Lovable editor, click the **GitHub** button (top right) → **Connect to GitHub**.
2. Authorize the Lovable GitHub App and pick the org/account.
3. Click **Create Repository**. Lovable pushes the full codebase and keeps it in two-way sync.

### Option B — Manual upload
1. In Lovable: open the code editor → **Download codebase** (bottom of file tree) to get a ZIP.
2. Locally:
   ```bash
   unzip jls-yachts.zip && cd jls-yachts
   git init
   git add .
   git commit -m "Initial import from Lovable"
   git branch -M main
   git remote add origin git@github.com:<you>/<repo>.git
   git push -u origin main
   ```

> `.env` is git-ignored. Only `.env.example` is committed.

---

## 2. Spin up your own Supabase project

1. Go to <https://supabase.com> → **New project**. Pick a region close to your users.
2. Once it's ready, copy these from **Project Settings → API**:
   - Project URL (e.g. `https://abcd1234.supabase.co`)
   - `anon` / publishable key
   - `service_role` key (keep this secret)

### Apply the database schema

The full schema lives in `supabase/migrations/`. Use the Supabase CLI:

```bash
# one-time
npm i -g supabase

# inside the repo
supabase login
supabase link --project-ref <YOUR-PROJECT-REF>
supabase db push        # applies every file in supabase/migrations/ in order
```

This creates:
- `yachts`, `permits`, `profiles`, `user_roles` tables
- `app_role` + `permit_status` enums
- RLS policies, the `has_role()` security-definer function, and the `handle_new_user` trigger

### Create the storage bucket

In Supabase dashboard → **Storage** → **New bucket**:
- Name: `vessel-images`
- Public: **Yes**

### Auth setup

Dashboard → **Authentication → Providers**:
- **Email** is on by default. Disable "Confirm email" only if you want instant sign-in (not recommended for production).
- Add **Site URL** and **Redirect URLs** for both `http://localhost:5173` and your eventual Cloudflare URL.

---

## 3. Local development against your new Supabase

1. Copy `.env.example` → `.env` and fill in **all six** values from your project.
2. Install + run:
   ```bash
   bun install         # or: npm install
   bun run dev         # http://localhost:5173
   ```

The first user you sign up becomes a regular user. To make yourself an admin, run this in Supabase SQL editor (replace the email):

```sql
update public.user_roles
set role = 'admin'
where user_id = (select id from auth.users where email = 'you@example.com');
```

---

## 4. Deploy to Cloudflare Workers

The project is already configured for Cloudflare via `@cloudflare/vite-plugin` and `wrangler.jsonc`.

### One-time setup
```bash
npm i -g wrangler
wrangler login
```

### Set runtime secrets (server-side env vars)
These are read by TanStack server functions at runtime — they are **not** baked into the bundle.

```bash
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_PUBLISHABLE_KEY
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

The `VITE_*` variables are different — they're inlined at build time. Set them in your shell (or a CI secret store) before building:

```bash
export VITE_SUPABASE_URL="https://<ref>.supabase.co"
export VITE_SUPABASE_PUBLISHABLE_KEY="<anon-key>"
export VITE_SUPABASE_PROJECT_ID="<ref>"
```

### Build & deploy
```bash
bun run build
wrangler deploy
```

Wrangler prints the deployed URL (e.g. `https://tanstack-start-app.<account>.workers.dev`). Add that URL to Supabase → Auth → **Site URL / Redirect URLs**.

### Custom domain
In the Cloudflare dashboard → **Workers & Pages → your worker → Settings → Triggers → Custom Domains** → add `crm.yourdomain.com`. DNS is wired automatically if the zone is on Cloudflare.

### CI/CD (optional)
A minimal GitHub Action (`.github/workflows/deploy.yml`) would look like:

```yaml
name: Deploy
on: { push: { branches: [main] } }
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run build
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_PUBLISHABLE_KEY: ${{ secrets.VITE_SUPABASE_PUBLISHABLE_KEY }}
          VITE_SUPABASE_PROJECT_ID: ${{ secrets.VITE_SUPABASE_PROJECT_ID }}
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

---

## 5. Migration checklist

- [ ] Repo pushed to GitHub
- [ ] New Supabase project created
- [ ] `supabase db push` applied all migrations cleanly
- [ ] `vessel-images` storage bucket created (public)
- [ ] Auth providers + redirect URLs configured
- [ ] `.env` filled in locally and `bun run dev` works against the new project
- [ ] First user promoted to `admin`
- [ ] `wrangler secret put` run for the three server-side keys
- [ ] `wrangler deploy` succeeds and the URL serves the app
- [ ] Cloudflare URL added to Supabase Auth → Site URL

---

## File reference

| File | Purpose |
|---|---|
| `supabase/migrations/*.sql` | Source of truth for the database schema — apply with `supabase db push` |
| `supabase/config.toml` | Supabase CLI project link |
| `wrangler.jsonc` | Cloudflare Workers config |
| `.env.example` | Template for the six env vars the app needs |
| `src/integrations/supabase/client.ts` | Browser Supabase client (auto-generated, do not edit) |
| `src/integrations/supabase/client.server.ts` | Server-only admin client (auto-generated, do not edit) |
| `src/integrations/supabase/types.ts` | Generated DB types — regenerate with `supabase gen types typescript --linked > src/integrations/supabase/types.ts` |
