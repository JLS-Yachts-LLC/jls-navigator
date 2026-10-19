# Polaris — Crew Academy (training module) — PLAN

Status: **planning, nothing built** (19 Oct 2026). Open decisions are at the bottom.

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
| JLS staff with the `academy` module | Polaris → Academy | Write JLS courses, publish them to all vessels or chosen ones, see fleet-wide reports for JLS courses |
| Vessel managers (captain_accounts with a training-manager position) | Portal → Crew Academy | Invite crew, run groups, enrol, write the vessel's own courses, see the vessel's reports |
| Crew (learners) | `/academy` | Take the courses enrolled to them, see their own results and certificates. Nothing else |

Proposed vessel managers by position: Captain, Relief Captain, Chief Officer, Chief Engineer, Purser
— plus Chief Stewardess for the Interior group only (see decisions). Owner / Representative see the
reports but don't run the training.

## 3. Permissions — the important part

A crew login must reach the training module and nothing else. The portal already has a proven
pattern for this (Guest accounts, Oct 2026), so we reuse it rather than invent a new one.

1. **New account type: learner.** Table `academy_learners` (one row per person: `user_id`, email,
   name, optional `crew_member_id`, active, invited/last-seen). New auth users are tagged
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

- `academy_learners` — the person (see §3). A learner can belong to more than one vessel over their
  career: `academy_learner_vessels` (learner, yacht, active, joined/left).
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
- Fleet view: uptake and completion of JLS courses per vessel.
- Uses a new `academy` entry in `modules` (view / create / edit), like `guest_access`.

## 6. Video and offline

- Recommend **Cloudflare Stream** for video: we already run on Cloudflare, it does adaptive quality
  (matters on VSAT/Starlink), signed per-viewer URLs, and its player reports watch progress. Cost is
  per minute stored + delivered. Alternative: plain MP4 in Supabase storage (cheaper to start, poor
  on weak connections, no adaptive quality).
- YouTube/Vimeo links allowed for public material JLS doesn't need to protect.
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

New dependencies to expect: a rich-text editor for reading blocks (e.g. Tiptap), `@dnd-kit` for
the creator and the drag-and-drop blocks, and the Cloudflare Stream player. None are in the repo
today.

## 9. Open decisions

1. Do crew training records follow the **person** when they move to another yacht (JLS courses at
   least), or stay with the vessel?
2. Can JLS staff see a **vessel's own courses and results**, or are they private to the vessel like
   the rest of "On board"?
3. Can a vessel **copy and adapt** a JLS course, or only use it as published?
4. Is Crew Academy **charged** separately (its own switchable portal module) or part of On board?
5. **MFA** for crew logins? (Captains need it; guests don't.) Recommendation: no MFA for crew.
6. Video hosting: Cloudflare Stream (recommended) or plain storage?
7. Do we need to import **bought-in courses (SCORM)**?
8. Should the Chief Stewardess / Chief Engineer manage their own department's training only?
