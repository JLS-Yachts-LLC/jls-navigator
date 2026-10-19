# Polaris — Crew Academy (training module) — PLAN

Status: **Phases 1 and 2 done and live, 19 Oct 2026** — see "what was built" below.
Decisions taken and still open are at the bottom.

## Phase 2 — what was built (19 Oct 2026)

- **Content model** `src/lib/academy/content.ts` (+ tests): sections → lessons → blocks (reading
  markdown, video MP4 or YouTube/Vimeo link, PDF, picture, quiz single/multi/true-false,
  acknowledge); `normalizeContent` (server-side cleaning), `publishProblems`, `forLearner` (strips
  answer keys + explanations), `gradeQuiz` (all-or-nothing per question), `courseOutcome`
  (complete when every block is done; a quiz is done once passed, retries allowed; video needs 90%
  of the furthest point reached; score = average of quiz scores).
- **Storage:** private bucket `academy-media` (no storage policies; signed upload URLs from
  `/api/academy-admin`, signed read URLs — 15 min, 4 h for video). Bucket allows 500 MB but the
  **project-wide Supabase limit is 50 MB** and wins; `MAX_UPLOAD_BYTES` in `academy.server.ts`
  matches it — raise both together.
- **JLS staff:** `/academy-admin` (Services → "Crew Academy", flag `crew-academy`, stage dev until
  released; module `academy` View/Create/Edit). Course list, creator (details, sections/lessons/
  blocks with up/down reordering, uploads, quiz editor), Preview (real player, local marking),
  Publish (new immutable version), Vessels (offer to all or chosen), Archive/Restore.
  API `/api/academy-admin` — JLS courses only, no learner data.
- **Vessels:** portal module `academy` (Settings → Manage Users → Client Portal: third switch,
  "Academy"), portal section "Crew Academy" with Crew (invite from crew list or by email, resend,
  remove/restore — records stay) and Courses (enrol with due date / required, cancel, per-person
  status). `canManageAcademy()` = everyone but Owner, Representative, Chef; preview read-only.
  API `/api/portal/academy`. Invite = new login with a set-password link, or a sign-in link for
  someone who already has one; follows CLIENT_EMAIL_ENABLED and hands back a copyable link.
- **Crew:** `/academy` course cards open the player (`course-player.tsx`): lesson list, progress
  bar, blocks, quiz retry, sign-off, completion banner. API `/api/academy` ops course / media /
  viewed / video / answer / acknowledge; the version is pinned on first open. A failed quiz shows
  which questions were wrong but not the right answers; a pass shows answers + explanations.
- **Verified live (build a971f02)** with a throwaway learner + course on AQUILA (deleted after):
  course content arrives with no answer keys or explanations; a wrong answer scores 50% and shows
  no right answers; the retry passes and shows them; the sign-off completes the course (status
  completed, score 100, refresher expiry +12 months, attempts and activity recorded); another
  enrolment id, a file not in the course, `/api/academy-admin` and `/api/portal/academy` are all
  refused to the learner. NOT click-tested in a browser: the course creator and the portal section.
- **Not yet:** groups and group enrolment, a vessel's own courses, reports, drag-and-drop blocks,
  certificates, reminders (Phases 3–5). Nothing has been tried by a real vessel yet.

## Phase 1 — what was built (19 Oct 2026)

- Migration `20261019120000_crew_academy_foundation.sql` (applied live): all `academy_*` tables
  from §4, `is_portal_learner()`, `is_portal_captain()` / `assert_not_portal_captain()` widened to
  learners, auth triggers stand down for `portal = 'learner'`, every academy table closed with a
  restrictive `portal_captain_denied` and **no permissive policy** (all access via `/api/academy*`),
  `yacht_portal_modules.module` accepts `'academy'`, `modules` row `academy` ("Crew Academy").
- Code guards refuse learners: `requireAccess`, `requireAdminAccess`, `isOutsideLogin`, staff
  invite (`/api/admin/users`) refuses an active learner email. Learner logins are sent to
  `/academy` from the staff app, `/portal` and `/guest` (a vessel manager who is also a learner
  lands on `/portal`).
- `src/lib/academy/academy-auth.server.ts` → `resolveLearner()`; `/api/academy?op=home`;
  `/api/academy/forgot-password`; page `/academy` (sign in, set/reset password, My courses list).
- **Verified:** isolation sweep as a throwaway learner — 0 rows in every real table (only
  `portal_directory`'s 7 support contacts, the public `vessel-images` bucket and empty zero-count
  views are visible, same as guests); writes refused; RPC guard raises; no staff rows created.
  Live with a real learner token on polaris.jlsyachts.com: `/api/academy` 200 (own vessel),
  `/api/admin/users` + `/api/admin/portal-users` 403 "Crew training logins cannot access staff
  areas", `/api/admin/guests`, `/api/guest`, `/api/guest-shares`, `/api/portal/*` all 403; direct
  table reads return `[]`. Test login deleted afterwards.
- (Phase 1 left the portal module, the media bucket and invites for Phase 2 — all done above.)

## 1. What it is

An online training platform for yacht crew, inside the Client Portal.

- **JLS Yachts** writes and looks after a library of courses and makes them available to vessels.
- **Each vessel** can also write its own courses with the same course creator (their SOPs, their
  boat, their way of doing a guest turnaround).
- Courses mix **video, reading, documents and interactive checks**: quizzes, drag-and-drop matching,
  putting steps in order, sorting items into groups, "I have read and understood" sign-offs.
- Crew are put in **groups by department** (Interior, Deck, Engineering, Galley, Bridge) and courses
  are **enrolled to a group or to individuals**.
- Crew get **one invite**, register once, and from then on see **only their training**. A crew
  login can never see anything else in the portal or in Polaris.

### Naming

Polaris already has `training_*` tables. They belong to **JLS's own training school** (classroom
courses, classes, students and instructors, synced from Monday) and to crew certificates. To keep
the two apart, the new module is called **Crew Academy** and its tables use the prefix
**`academy_`**. The one deliberate link: finishing an Academy course can write a certificate into
`training_certifications`, so it shows on the vessel's Crew rota & certificates screen.

## 2. Who uses it

| Who | Where | Can do |
| --- | --- | --- |
| JLS staff with the `academy` module | Polaris → Academy | Write JLS courses, publish them to all vessels or chosen ones, review anything a vessel or crew member has shared with JLS |
| Vessel managers (captain_accounts with a training-manager position) | Portal → Crew Academy | Invite crew, run groups, enrol, write the vessel's own courses, see the vessel's reports |
| Crew (learners) | `/academy` | Take the courses enrolled to them, see their own results and certificates. Nothing else |

Proposed vessel managers by position: Captain, Relief Captain, Chief Officer, Chief Engineer, Purser
— plus Chief Stewardess for the Interior group only (see decisions). Owner / Representative see the
reports but don't run the training.

## 3. Permissions — the important part

A crew login must reach the training module and nothing else. The portal already has a proven
pattern for this (Guest accounts, Oct 2026), so we reuse it rather than invent a new one.

1. **New account type: learner.** Table `academy_learners` (one row per person **per vessel**:
   `user_id`, `yacht_id`, email, name, optional `crew_member_id`, active, invited/last-seen). New auth users are tagged
   `raw_user_meta_data.portal = 'learner'`, and the `handle_new_user` / `handle_new_auth_user`
   triggers stand down for it (same as `captain` and `guest`), so a learner is never born as staff.
2. **Fenced out of everything by the database.** `is_portal_captain()` and
   `assert_not_portal_captain()` are widened to return true for active learners too (this is how
   guests were fenced). Every restrictive `portal_captain_denied` / `portal_captain_block` policy
   and every guarded RPC then refuses learners automatically. Because a learner is not in
   `captain_accounts`, `captain_yacht_ids()` returns nothing for them, so even the tables the
   captain portal can read (yachts, crew, permits, visas) return 0 rows.
3. **No table is opened to learners.** All Academy data reaches a learner through
   `/api/academy/*` routes that use the service role and resolve the caller with a
   `resolveLearner(request)` helper (Bearer JWT → active `academy_learners` row → their
   enrolments). Every Academy table gets the default-deny restrictive fence. The rule from the
   2026-09 audit applies: an RLS fence never protects a service-role endpoint, so every route checks
   the learner and the enrolment in code.
4. **Answers never reach the browser before they're submitted.** Correct answers live in the course
   version on the server; the player gets the questions only, submits, and the server marks it.
5. **Staff guards refuse learners.** `requireAdminAccess` and `requireAccess` reject an active
   learner (as they already reject captains and guests); `/portal` refuses a learner-only login;
   `app-layout` sends learner logins to `/academy`.
6. **A person who is both** a vessel manager (captain_accounts) and a learner uses one login: the
   portal shows a "My training" section for them as well.
7. **Proof, not assumption.** Before go-live, run the same isolation sweep used in Sept/Oct 2026: a
   throwaway learner, `set local role authenticated` + their JWT claims, count every public table and
   storage bucket, expect 0 everywhere, then roll back. Plus live checks that `/api/admin/*`,
   `/api/portal/*` and `/api/guest` return 403 to a learner token.

Note: the name `is_portal_captain()` now really means "outside login". Re-applying an old captain
migration that recreates it would silently drop guests *and* learners from the fence — the
migration must keep all three.

## 4. Data model (draft)

**Courses and content**

- `academy_courses` — id, `owner_type` (`jls` | `vessel`), `yacht_id` (null for JLS), title,
  summary, cover image, category, estimated minutes, pass mark, `refresh_months` (re-take interval,
  null = once), status (`draft` | `published` | `archived`), `current_version_id`.
- `academy_course_versions` — an immutable snapshot of the course content when published:
  `content jsonb` (sections → lessons → blocks), answer keys held here. Enrolments pin the version
  they started, so editing a live course never changes what someone already passed, and every
  result can be traced to exactly the material they saw.
- `academy_course_availability` — which vessels a JLS course is offered to (`all` or a list).
- `academy_media` — uploaded files (PDFs, images, video references) in a private bucket
  `academy-media`, served by short-lived signed URLs.

**Block types** (each a JSON object with a `type`):

| Block | Notes |
| --- | --- |
| `video` | Hosted video with watched-% tracking; optional "must watch to continue" |
| `reading` | Rich text with images |
| `document` | PDF shown inline (existing guest file-viewer pattern) |
| `quiz` | Single choice, multiple choice, true/false; shuffle; attempts limit; explanation shown after |
| `match` | Drag each item onto its partner (e.g. extinguisher type → fire class) |
| `order` | Drag steps into the right order (e.g. man-overboard procedure) |
| `sort` | Drag items into buckets (e.g. which cleaning product for which surface) |
| `hotspot` | Tap the right spot on a picture (later phase) |
| `acknowledge` | "I have read and understood" with name and time recorded |

Drag-and-drop must work on a phone with a finger, and each one also works by tapping (tap an item,
tap where it goes) for accessibility and for poor touch screens.

**People and groups**

- `academy_learners` — the person on **one vessel** (see §3). **Records stay with the vessel**
  (decided): when someone moves yacht, their row on the old vessel is deactivated and the old vessel
  keeps their history; the new vessel invites them again and they start fresh there. The same email
  and login can be reused, but they only ever see their active vessel's training.

**Sharing with JLS** (decided: private to the vessel unless shared)

- A vessel's own courses, its crew's results and its reports are private to the vessel. JLS staff
  see none of it by default, including results on JLS courses taken on that vessel.
- `academy_jls_shares` — something shared with JLS for review: a course (shared by a vessel
  manager, e.g. "please check our SOP course"), a crew member's results (shared by the vessel or by
  the crew member themselves), or a single course result/certificate. It records who shared, when,
  and a revoke time (kept for history). Sharing is a tick box / "Share with JLS" button on the
  course, the person and the result.
- JLS still sees what it needs to run its own library: which vessels a JLS course is offered to and
  switched on for. No names or scores unless shared.
- `academy_groups` — per vessel; seeded with Interior, Deck, Engineering, Galley, Bridge; vessels
  can add their own. `academy_group_members`.
  (Note: `crew_members.department` is blank for 458 of 466 current crew, so groups can't be filled
  automatically from it. The group screen can write the department back to the crew record as it
  goes.)

**Enrolment and progress**

- `academy_enrolment_rules` — course → group or learner, mandatory flag, due date or "due N days
  after joining", made by whom. A **group** rule is live: someone who joins the group later is
  enrolled automatically.
- `academy_enrolments` — one row per learner per course: status (`not_started` | `in_progress` |
  `completed` | `failed` | `expired` | `cancelled`), due date, version pinned, score, completed at,
  certificate.
- `academy_progress` — per lesson/block: viewed, video %, attempts, score.
- `academy_attempts` — each quiz/interactive submission with the answers given (for the vessel's
  question analysis).
- `academy_certificates` — PDF in the private bucket, number, issued/expiry; optional row in
  `training_certifications` against the crew member.

## 5. Screens

**Crew — `/academy`** (own small shell, phone-first, installable like the portal app)
- My courses: to do (overdue first), in progress, done; due dates.
- Course player: one lesson at a time, progress bar, resume where you left off.
- My certificates: download.

**Vessel managers — Portal → Crew Academy** (a new portal module switched on per vessel in
Settings → Manage Users → Client Portal, alongside Core and On board)
- Crew: invite (single, or pick from the vessel's crew list which already has emails for about half
  the crew), resend, deactivate, see last seen.
- Groups: departments and members.
- Courses: JLS library (offered to this vessel) + the vessel's own courses; enrol to group/person.
- Course creator: sections → lessons → blocks, drag to reorder, preview as a crew member, publish.
- Reports: by course and by person; overdue list; which quiz questions people get wrong; export.
- Feeds the portal Alerts / Today's brief ("3 crew overdue on mandatory training") and the
  compliance calendar (certificate expiries).

**JLS staff — Polaris → Academy**
- The same course creator for JLS courses, plus "Offer to vessels".
- "Shared with JLS" inbox: courses, results and certificates vessels or crew have shared for
  review.
- Uses a new `academy` entry in `modules` (view / create / edit), like `guest_access`.

## 6. Video and offline

- **Decided: MP4 in Supabase storage**, in the private `academy-media` bucket, played with the
  browser's own video player from a short-lived signed URL (Supabase serves byte ranges, so
  seeking works). Watch progress is tracked by the player page and saved to `academy_progress`.
- Because there is only one quality, keep files small for VSAT/Starlink: the creator asks for 720p
  H.264 MP4 and shows the file size; set a bucket size limit (e.g. 500 MB per file) and warn above
  ~150 MB. If weak connections become a real complaint, Cloudflare Stream can be added later
  without changing the course format (the block just points at a different source).
- YouTube/Vimeo links allowed for public material that doesn't need protecting.
- Later: download a course to the phone for offline use (the portal app's service worker already
  caches data); results upload when back online.

## 7. Messages to crew

- The invite is sent by a person pressing Invite, so it is not an automatic message — but it goes
  to an outside address, so it follows `CLIENT_EMAIL_ENABLED` and returns a copyable link when
  sending is off (as guest invites do). A QR code to put up in the crew mess is a cheap extra.
- Enrolment notices and due/overdue reminders **are** automatic, so they obey the vessel's
  "Automatic messages" switch — nothing goes to crew unless it's on.
- Email links last 24 h (`mailer_otp_exp` = 86400 already).

## 8. Phases

1. **Foundation** — learner account type + fence + isolation sweep; tables; `/api/academy` auth
   helper; staff Academy module permission.
2. **Learn** — JLS course creator (reading, PDF, video, single/multi-choice quiz, acknowledge);
   publish + offer to vessels; invite crew; enrol individuals; `/academy` player with progress and
   completion.
3. **Vessels** — Crew Academy portal module: crew list, groups, group enrolment (live), the
   vessel's own courses with the same creator, vessel reports, alerts/brief tie-in.
4. **Interactive + certificates** — match / order / sort (phone drag + tap), hotspot; certificate
   PDF (JLS- or vessel-branded); refresher re-enrolment; `training_certifications` link;
   question analysis.
5. **Extras** — reminders (gated), offline courses, AI help to draft quiz questions from a
   reading/PDF (staff review before publishing; reuses the guide-import pipeline), SCORM import if
   bought-in content needs it.

New dependencies to expect: a rich-text editor for reading blocks (e.g. Tiptap) and `@dnd-kit`
for the creator and the drag-and-drop blocks. Neither is in the repo today.

## 9. Decisions

Taken (Matt, 19 Oct 2026):

1. **Records stay with the vessel.** A crew member who moves yacht starts fresh on the new one;
   the old vessel keeps their history.
2. **Private to the vessel**, unless the vessel or the crew member ticks a box / shares it with JLS
   for review (`academy_jls_shares`).
3. **Its own portal module**, switched on per vessel next to Core and On board.
4. **Video: MP4 in Supabase storage** (private bucket, signed URLs). Cloudflare Stream only if weak
   connections become a problem.

Still open:

5. Can a vessel **copy and adapt** a JLS course, or only use it as published?
6. **MFA** for crew logins? (Captains need it; guests don't.) Built without MFA for now (the
   recommendation) — Matt hasn't confirmed; easy to add later.
7. Do we need to import **bought-in courses (SCORM)**?
8. Should the Chief Stewardess / Chief Engineer manage only their own department's training?
9. Does JLS see **anything** about JLS-course uptake without a share (e.g. counts per vessel, no
   names)? Current plan: no, only which vessels have the course switched on.
