# Training & Certifications Module (Resources > Training)

A lightweight LMS and certification tracker built as an extension of the
Resources module. Courses are **ordered references to content that already
exists** — Knowledge Base documents, Resource Library entries, and external
URLs — never copies. Built July 2026 across migrations/UI phases; the whole
module lives behind the existing `resources` module toggle.

## Architecture overview

- **Frontend**: Next.js App Router client pages in `app/resources/training/`,
  components in `components/training/`, data hooks in `hooks/useTraining.js`
  (learner), `hooks/useTrainingAdmin.js` (admin), and
  `hooks/useTrainingReminders.js` (reminder sweep, mounted in `OSShell`).
- **Shared logic**: `lib/training.js` — progress %, status derivation,
  overdue checks, certification status/milestones, assignment resolution.
  Pure functions; unit-tested in `__tests__/training.test.js`.
- **Database**: migration `supabase/migrations/0058_training.sql`. No server
  API routes — the browser talks to Supabase directly under RLS, like every
  other module.

## Data model (5 tables, all company-scoped)

- `training_courses` — title/description/category, status
  `draft → published → archived`. Only published courses can be assigned.
- `training_course_items` — ordered references; CHECK constraint enforces
  exactly one of `kb_document_id` / `resource_id` / `external_url` matching
  `item_type`. Referenced KB docs/resources cascade-delete their items (the
  Resources and Knowledge pages warn when deleting content used in courses).
- `training_assignments` — one row per (course, user), enforced by a UNIQUE
  constraint; stores source (`individual`/`role`/`everyone`), assigner, due
  date, status (`not_started`/`in_progress`/`completed` — **overdue is always
  computed from `due_date`, never stored**), and manual-completion stamps
  (`completed_by`, `completion_note`).
- `training_item_completions` — one row per completed item per assignment
  (UNIQUE). Inserting/deleting fires the `training_recalc_assignment`
  SECURITY DEFINER trigger, which recomputes the parent assignment's
  status/started_at/completed_at **server-side**.
- `training_certifications` — per-employee certs; `expiry_date IS NULL`
  means non-expiring; proof documents live in the existing private
  `entity-attachments` bucket under `<company_id>/training-proof/…`.

## Tenant isolation & authorization

Standard house RLS (`company_id = current_user_company()` + super_admin),
with **deliberately stricter writes** than most tables (approved deviation):

- Courses, items, assignments, certifications: **write = company_admin only**.
- Item completions: **insert only for `user_id = auth.uid()`** on the user's
  own assignment; learners have *no* write path to assignment status — only
  the DB trigger updates it. Admin manual-complete/reopen write the
  assignment directly under the admin policy and are activity-logged.
- Certifications: employees can read **their own only**; admins read all.
- The 0049 `viewer_write_block` trigger is attached to all five tables.
- Integration coverage: `__tests__/tenantIsolation.test.js` ("training:"
  cases) proves cross-tenant blindness, member-write rejection, forged/
  duplicate completion rejection, and that learners can't set their own
  assignment status.

## Notifications & scheduling

In-app only (`notifications` table via `lib/notify.js`) — the app has no
email system. Two delivery paths:

1. **Event-driven** (in `useTrainingAdmin`): new-assignment ping per
   assignee, due-date-change ping. Skips the acting admin, best-effort.
2. **Reminder sweep** (`useTrainingReminders`, mounted in `OSShell`): the
   approved no-new-infrastructure scheduler. Once per browser session per
   user it checks (a) the user's own overdue assignments, (b) the user's
   cert milestones, and (c) for admins, every team member's cert milestones,
   then inserts any missing notifications.
   - **Milestones**: 90/60/30/0 days before expiry. Only the *most urgent
     unsent* milestone fires (`nextCertMilestone`), so a cert first seen at
     20 days out sends one 30-day reminder, not a 90+60+30 burst.
   - **Dedup**: the verb encodes the milestone
     (`training.cert_expiry_90` … `_0`, `training.overdue`); before insert,
     existing `(user, verb, entity_id)` triples are skipped. This design is
     idempotent, so the same logic can later move to a Vercel-cron API route
     unchanged if guaranteed daily delivery is ever wanted.
   - Trade-off: reminders arrive when someone next opens the app, not at a
     fixed hour.

## Setup

1. **Migration**: apply `supabase/migrations/0058_training.sql` (same
   process as prior migrations). Requires 0049 (`block_viewer_writes`) and
   0056 (`entity-attachments` bucket) to already be applied — both are.
2. **Seed (dev/staging only)**: paste `docs/seed_training_demo.sql` into the
   SQL editor. Creates 2 "Demo:"-prefixed courses, mixed-state assignments
   across existing users, and 5 certifications covering every status.
   Cleanup queries are at the bottom of the file. Never run in production.
3. **Tests**: `npm test` runs the unit suite (`training.test.js`, 42 cases).
   The isolation suite runs only when staging env vars are present:
   `npx vitest run __tests__/tenantIsolation.test.js` with
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY` set to a **staging** project.

## Screens

- `/resources/training` — tabs: My Training, My Certifications (everyone);
  Courses, Assignments, Certifications, Dashboard (admins). Mobile-first
  cards for learners; tables with `overflow-x-auto` for admin screens.
- `/resources/training/[assignmentId]` — learner course detail; KB items
  open via `/knowledge?doc=<id>` deep link, resource items via signed URL,
  external URLs in a new `noopener` tab (http/https only).
- Dashboard sections (completion, overdue, cert expirations) export the
  currently filtered rows as CSV via `exportRowsCSV`.

## Behavior decisions

- Editing a published course with active assignments is allowed with a
  warning; progress is always derived from the course's *current* items, so
  adding items reopens progress and removing items (cascade-deleting their
  completions) recalculates it.
- Re-assigning a completed course is a no-op (shown as "skipped" in the
  assign preview); use **Reopen** on the assignment instead.
- Deleting a resource/KB doc used in courses warns with the course count.
- Assignment of new members joining a role later is **not** automatic
  (out of scope v1) — re-run the assign flow; duplicates are skipped.

## Known limitations

- Reminders are login-triggered (see trade-off above); no email delivery.
- No manager tier / teams / departments — the app has no such org
  structures. Sources recorded as individual/role/everyone for forward
  compatibility.
- Dashboard aggregates compute client-side from the company dataset —
  fine for SMB scale; indexes exist if server-side aggregation is needed.
- Storage-level proof access is company-wide (matches the
  entity-attachments bucket's existing model) even though certification
  *rows* are owner/admin-only; paths are unguessable UUIDs.

## Recommended future enhancements

Vercel-cron reminder delivery · auto-assign on member join (via an
automations trigger) · optional course items · recurring/renewal training ·
manager tier if org structure ever lands · cert-request flow where employees
submit proofs for admin approval.
