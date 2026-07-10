# Managed Wi-Fi & Camera Systems — BOM Calculator

A multi-tenant SaaS that generates itemized hardware bills of materials,
software subscriptions, professional-services/labor estimates, and branded
**PDF / CSV exports and customer proposals** for **managed Wi-Fi** and **IP
camera** deployments (Hospitality, Senior Living, Multi-Family).

**Stack:** Next.js 16 (App Router, Turbopack) · React 19 · Tailwind v4 ·
Supabase (Auth + Postgres + Row-Level Security) · jsPDF. Deploys to Vercel.

## Two modes

- **Local mode** (no setup): single user, data in the browser. The calculator,
  catalog edits, per-project pricing, custom line items, branding, and all
  exports work with zero configuration.
- **Team mode** (Supabase configured): real accounts and multiple teams, each
  team's projects / product catalog / branding fully isolated by Row-Level
  Security. Roles: **User** (build/save projects), **Admin** (+ catalog,
  branding, invites), **Super admin** (all teams).

## Running locally

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # vitest — calculation-engine + helpers
npm run build        # production build
npm run lint
```

## Enabling team mode

See **[docs/MULTITENANT_SETUP.md](docs/MULTITENANT_SETUP.md)** for the full
walk-through. In short:

1. Create a Supabase project.
2. Run **all** migrations in `supabase/migrations/` in order
   (`0001`→`0004`), or paste **[docs/all-migrations.sql](docs/all-migrations.sql)**
   into the SQL editor.
3. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
   `SUPABASE_SERVICE_ROLE_KEY` (server-only) — in Vercel and/or `.env.local`.
4. In Supabase Auth: enable the **Email** provider and set the Site URL +
   Redirect URLs. Membership is invite-only (the app exposes no sign-up screen).
5. Promote your account to `super_admin`, then create teams and invite admins
   from the in-app console.

## Enabling the AI Assistant (optional)

Team mode only. Set `ANTHROPIC_API_KEY` (server-only) in Vercel and/or
`.env.local` to turn on the AI Assistant panel on a project's Overview tab
(status summaries, and turning pasted field/meeting notes into a reviewable
task list). Without a key, those routes return a clean 503 and the rest of
the app is unaffected.

## Architecture

- `lib/calculateBOM.js` / `lib/calculateCameraBOM.js` — pure calculation engines
  (no I/O), unit-tested under `__tests__/`.
- `lib/catalog.js` — base product catalog + `CORE_SKUS` guard; `lib/segments.js`
  groups categories into BOM segments.
- `lib/mergeProducts.js` — merges per-team `custom_products` over the base catalog.
- `lib/exportCSV.js` · `lib/exportPDF.js` · `lib/exportProposal.js` ·
  `lib/scopeOfWork.js` — exports (CSV, detailed PDF, customer proposal).
- `components/*` — calculator UI (inputs, BOM/services/summary tables, camera
  systems, product database, branding, admin console).
- `app/api/products` · `app/api/invite` · `app/api/members` — privileged route
  handlers using the service-role client; each re-checks the caller's role and
  team. `app/welcome` — invite/password-reset landing.
- `hooks/useTenant|useProjects|useProducts|useBranding` — auth/tenant resolution
  and data, with localStorage fallbacks in local mode.

> Note: catalog product descriptions retain real vendor names (e.g. "Cambium
> XV2-21X", "Uniview 4MP…") since those are the actual SKUs; the app's own
> titles are vendor-neutral.
