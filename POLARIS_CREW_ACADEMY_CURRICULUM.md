# Crew Academy — AV/IT and security curriculum (proposal)

19 Oct 2026. This is the proposed JLS library for Crew Academy beyond the first cyber course, plus specs for
exercise types the player doesn't have yet. It goes with the module plan in `POLARIS_CREW_ACADEMY.md`.

**Status:** courses 1 (built 19 Oct) and T2, T3 (built 19 Oct, below) are **drafts** in the JLS library, not
offered to any vessel. Everything else is a proposal for Matt to pick from — **nothing else gets built until
Matt has chosen from the shortlist (§2).**

House rules for every course: written for crew, not engineers. Plain English, short lessons (5–10 min). A
picture or animation in every lesson. An exercise in every lesson. Vendor commands checked against the vendor's
current docs. Documentation IP ranges only (RFC 1918 / RFC 5737), invented names and serials. Each course tells
crew what they may do alone and when to stop and call IT. That boundary is the most important thing they learn.

How courses are made: generator scripts in `scripts/academy-<course>/`. The drawing kit is shared
(`scripts/academy-cyber/art.mjs`). Pictures are SVG drawn to PNG with sharp. Animations are SVG frames piped
into ffmpeg (silent, captioned). `check.ts` runs the app's own `normalizeContent` / `publishProblems` /
`forLearner` rules. Upload is through the course creator; content is written by SQL.

---

## 1. The library

Audience key: **All** = all crew · **Interior** = interior / guest-facing crew · **HoD** = heads of department ·
**ETO** = ETOs and AV/IT officers · **Capt** = Captain (and DPA / CSO ashore).

### Track A — Security

| # | Course | Audience | Length | Status |
|---|---|---|---|---|
| A1 | Cyber security at sea — crew awareness | All | 40 min | **Draft built** |
| A2 | Cyber risk for Captains and HoDs | Capt, HoD | 45 min | Proposed |
| A3 | Cyber incident response — the first hour | ETO, HoD, Capt | 35 min | Proposed |
| A4 | Guest privacy and data on board | All (Interior focus) | 20 min | Proposed |
| A5 | Remote access, vendors and USB on board | ETO, HoD | 20 min | Proposed |

**A2 Cyber risk for Captains and HoDs.** *Outcomes:* explain what the IMO guidance (MSC-FAL.1/Circ.3/Rev.3)
and MSC.428(98) mean for the SMS. Know what Cyber Essentials / Plus certify and what they don't. Know what IACS
UR E26/E27 require for new builds. Own the vessel cyber risk assessment, the asset list, the access list and
the incident plan. Run a cyber drill. Check suppliers and remote access. *Exercises:* sort (who owns what:
Captain / ETO / management company / shore IT), order (the steps of a risk assessment), match (Cyber Essentials
control ↔ on-board example), quiz (audit questions a flag/class surveyor would ask). *Pictures:* "the yacht as
a network" with OT and IT zones, a risk-matrix picture, the five-control picture reused from A1. *Animation:*
"a bank-detail fraud in six emails" (the expensive one).

**A3 Cyber incident response — the first hour.** *Outcomes:* recognise an incident (ransomware note, an
account taken over, fraud, GPS spoofing, a lost laptop). Isolate without destroying evidence (pull the
network cable, don't power off). Know who to call and in what order. Keep a timeline. Know when the DPA, the
insurer, the flag and data protection come in. *Exercises:* order (the first-hour checklist), sort ("do now" /
"leave for IT" / "never"), branching scenario (see §3, S3, which would be the ideal format), hotspot (tap the
cable to pull on a rack picture). *Pictures:* ransomware screen on a crew laptop, the call tree, a timeline
sheet. *Animation:* the contain → report → recover flow.

**A4 Guest privacy and data on board.** *Outcomes:* treat guest lists, passports, itineraries and photos as
confidential. Follow the NDA. Know the GDPR / UAE PDPL basics. Share files safely (no WhatsApp for passports).
Keep guests off social media. *Exercises:* sort (OK to share / never), hotspot (what's wrong in this photo),
quiz. *Pictures:* a guest-list printout left in the crew mess, a social post with a give-away.

**A5 Remote access, vendors and USB.** *Outcomes:* only approved remote tools. A vendor session needs a named
person, a time and a log. Scan vendor laptops and USB sticks before use. Remove access afterwards. *Exercises:*
order (letting a vendor connect), sort (allowed / ask IT / never). *Pictures:* a vendor laptop on the engine
network with the right and wrong paths drawn on.

### Track B — Everyday crew IT and AV

| # | Course | Audience | Length | Status |
|---|---|---|---|---|
| B1 | Crew IT on board — Wi-Fi, internet and getting help | All (induction) | 20 min | Proposed |
| B2 | Microsoft 365 essentials — Outlook, Teams, OneDrive, sign-in | All with a work account | 35 min | Proposed |
| B3 | Guest Wi-Fi and guest devices — first-line support | Interior, HoD | 25 min | Proposed |
| B4 | AV first-line troubleshooting — guest areas | Interior, ETO | 30 min | Proposed |
| B5 | Printers and scanning | All | 15 min | Proposed |
| B6 | Phones on board — VoIP handsets, satphones, crew calling | All | 15 min | Proposed |

**B1 Crew IT on board.** Induction course for every new joiner. *Outcomes:* join the right Wi-Fi (crew, not
guest). Understand the data allowance and why Starlink isn't unlimited. No VPNs or torrents on the ship's
connection unless allowed. Raise an IT request properly (what, where, when, a photo). *Exercises:* sort (crew
network / guest network / don't connect), match (problem → who to ask), order (raising a good ticket).
*Pictures:* a "which network" poster, a good vs bad ticket.

**B2 Microsoft 365 essentials.** *Outcomes:* set up Microsoft Authenticator and number matching. Tell a real
sign-in prompt from a fake one (MFA fatigue). Use Outlook (shared mailboxes, calendars, attachments over links).
Use Teams (chats vs channels, calls on a satellite link). Use OneDrive / SharePoint (save to OneDrive not the
desktop, share with people not "anyone"). Fix sync. *Exercises:* hotspot (tap the sync-error icon / the share
button), sort (OneDrive / SharePoint / neither), order (setting up Authenticator), quiz. *Pictures:* drawn
Outlook / Teams / OneDrive screens (generic, no Microsoft logos). *Animation:* "MFA fatigue — why you never
approve a prompt you didn't start."

**B3 Guest Wi-Fi and guest devices.** *Outcomes:* get a guest's phone, laptop or tablet on the guest network
(including the captive portal). Cast to a cabin TV the supported way (AirPlay / Chromecast where the AV system
allows it). Know why guests can't see crew printers. Spot when it's the internet and not the Wi-Fi. Escalate
with the right details. *Exercises:* order (the guest-device checklist), sort (fix it yourself / call the ETO),
match (symptom → likely cause). *Pictures:* the guest-network map, phone screens with the Wi-Fi settings.

**B4 AV first-line troubleshooting.** *Outcomes:* the "reboot ladder" — source, then display, then the control
system, and only the right things. Use the Crestron / Savant / Control4 touch panel and remote. Fix TV input /
HDMI-CEC problems. Apple TV restarts. Sonos regroup and app. Kaleidescape playback. Know never to unplug the
control processor or the AV rack without the ETO. *Exercises:* hotspot (tap the input button, tap the Apple TV
reset), order (the reboot ladder), sort (interior can do / ETO only), match (symptom → first step).
*Pictures:* a drawn touch panel, a TV back panel, a cabin AV signal path (source → matrix → HDBaseT → TV).
*Animation:* "Where the picture goes", a signal travelling from the Apple TV through the matrix to the cabin TV
and stopping at each fault point.

**B5 Printers and scanning.** Add the printer, print from a phone, scan to email / folder, clear a jam, swap
toner, and when not to touch it. *Exercises:* order, hotspot.

**B6 Phones on board.** VoIP handset basics (transfer, hold, voicemail), crew calling apps on Starlink, the
satphone for emergencies (and why it's not for personal calls), GMDSS kept separate. *Exercises:* match, quiz.

### Track C — Technical (ETO / AV-IT officers)

| # | Course | Audience | Length | Status |
|---|---|---|---|---|
| C1 | Yacht network basics — IP, DHCP, DNS, VLANs | ETO (and keen HoDs) | 45 min | Proposed — **prerequisite for C2/C3** |
| C2 | **Cisco switch essentials (IOS / IOS-XE, Catalyst)** | ETO | 60 min | **Draft built** |
| C3 | **FortiGate essentials (FortiOS 7.x)** | ETO | 60 min | **Draft built** |
| C4 | Internet at sea — Starlink, VSAT, 4G/5G and failover | ETO, Capt | 40 min | Proposed |
| C5 | Yacht Wi-Fi — access points, roaming, PoE, steel hulls | ETO | 35 min | Proposed |
| C6 | UPS, power and the safe power-cycling order | ETO (short All version) | 25 min | Proposed |
| C7 | Structured cabling, racks and labelling | ETO | 30 min | Proposed |
| C8 | Backups and restores — 3-2-1, NAS, Microsoft 365 | ETO | 30 min | Proposed |
| C9 | AV systems for ETOs — HDMI, HDBaseT, HDCP/EDID, matrices, AV-over-IP, control | ETO (AV/IT) | 50 min | Proposed |
| C10 | CCTV and NVRs | ETO | 25 min | Proposed |
| C11 | Bridge and engine networks (OT) — keeping them safe | ETO, Capt | 35 min | Proposed |
| C12 | Working with shore IT — good tickets, evidence, handover | ETO | 15 min | Proposed |

**C1 Yacht network basics.** *Outcomes:* read an IP address, subnet mask and gateway. Know what DHCP and DNS do
and how each one fails ("connected, no internet"). Know what a VLAN is and the usual yacht VLANs (crew, guest,
business/office, AV, CCTV, bridge/engine (OT), management). Understand why the firewall sits between them.
Ping and ipconfig from a laptop. *Exercises:* match (term → plain meaning), sort (which VLAN does this device
belong on), quiz (read the ipconfig output). Hotspot: tap the device with the wrong gateway on a network
diagram. *Pictures:* the yacht VLAN map (shared with C2), ipconfig screens, "the post room" DNS analogy.
*Animation:* a phone joining Wi-Fi, getting a DHCP lease, asking DNS and reaching the internet.

**C4 Internet at sea.** *Outcomes:* how Starlink, VSAT and 4G/5G differ (latency, coverage, cost,
obstruction, regional licensing). How failover and SD-WAN choose a link (health checks: latency / loss / jitter).
Reading the Starlink app (obstructions, outages). Bandwidth management for guests vs crew. When to call the
provider vs IT. *Exercises:* sort (symptom → which link is at fault), order (failover sequence), match.
*Pictures:* coverage and latency comparison, a dish-obstruction picture. *Animation:* the link failing over
from Starlink to 4G and back (reuses the C3 SD-WAN drawing).

**C5 Yacht Wi-Fi.** Channel planning in a steel and glass hull, 2.4 / 5 / 6 GHz, AP placement, roaming between
decks, PoE budgets, controller basics (UniFi / Ruckus / Meraki), guest isolation. *Exercises:* hotspot (where
to put the AP on a deck plan), sort, quiz.

**C6 UPS and power.** Reading a UPS front panel (on battery, overload, battery fault). The power-down and
power-up order (firewall → core switch → edge switches / PoE → servers / NAS → AV processors → endpoints) and
why it matters. Shore power changeover. Battery testing. *Exercises:* order (power-up sequence), hotspot (UPS
alarm light), sort. *Animation:* the right and wrong power-up order.

**C7 Cabling, racks and labelling.** Cat6/6A, fibre (SM/MM, LC), patch panels, cable management, the labelling
scheme (rack / panel / port ↔ deck / cabin / outlet), keeping the network drawings up to date (and IT Glue).
*Exercises:* match (connector photo → name), hotspot (tap the wrongly patched cable), order.

**C8 Backups and restores.** What's backed up and what isn't (Microsoft 365 is *not* backed up by
Microsoft). 3-2-1, the NAS, cloud copies, testing a restore, ransomware-proof (immutable) copies.
*Exercises:* sort (backed up / not), order (test-restore steps).

**C9 AV systems for ETOs.** The signal chain. HDMI versions and cables. HDBaseT extenders. HDCP errors and EDID
handshakes. Video matrices and AV-over-IP (Crestron NVX, Just Add Power, etc.) and the multicast/IGMP they need
on the switch. Control processors and their IP / programming, audio DSP and amplifiers. A fault-finding
method. *Exercises:* order (fault-finding on a black screen), match (error → cause), hotspot (tap the failing
link in the signal chain).

**C10 CCTV and NVRs.** PoE cameras, the NVR, retention, remote viewing done safely, never on the guest
network, privacy notices. *Exercises:* sort, quiz.

**C11 Bridge and engine networks (OT).** What's on them (ECDIS, radar, AMS, IAS, PMS, dynamic positioning). Why
they're segregated. Vendor remote access. UR E26/E27 for new builds. What an ETO may and may not change.
*Exercises:* sort (IT / OT), hotspot (tap the bad connection on the bridge diagram).

**C12 Working with shore IT.** The perfect ticket: what, where, since when, what changed, photos, model and
serial, outputs. *Exercises:* sort (useful / not useful info), order.

---

## 2. Shortlist — what to build next, and why

Built 19 Oct: **A1** (cyber awareness), **C2** (Cisco), **C3** (FortiGate).

Proposed order:

1. **C1 Yacht network basics.** C2 and C3 assume it. Without it, the switch and firewall courses are a wall
   for anyone who isn't already a network person. It's cheap: much of the art (VLAN map) already exists from C2.
2. **A2 Cyber risk for Captains and HoDs.** The compliance driver. Flag and class ask about cyber under the
   ISM/SMS since 2021, and owners ask about Cyber Essentials. It pairs with A1 to give a complete cyber
   package to offer vessels.
3. **B4 AV first-line troubleshooting.** The most-used guest-facing systems, and the problems interior crew
   meet every charter. Good first-line skills save ETO call-outs and shore tickets.
4. **B2 Microsoft 365 essentials.** On the New Horizon desk, mailbox / Outlook / sign-in requests are the
   biggest category for yacht clients, by keyword count over the last 24 months. Teaching sign-in and MFA
   also backs up A1.
5. **C4 Internet at sea.** Every ETO lives with Starlink + 4G failover, and C3's SD-WAN lesson leads straight
   into it.
6. **A3 Incident response.** Best built after §3's branching-scenario block exists (S3), because it's the
   ideal format.
7. **C6 UPS and power-cycling order.** Short, and stops a lot of self-inflicted outages after power cuts.

Then B1 (induction), B3, C9, C5, the rest as demand shows.

---

## 3. Exercise types the player can't do yet — specs

These are for the course-builder and course-player sessions to pick up. Each fits the existing content model
(a new `BlockType` in `src/lib/academy/content.ts`, cleaned in `normalizeContent`, checked in
`publishProblems`, stripped in `blockForLearner`, marked in `gradeBlock`). Answer keys stay server-side, as now.

### S1 — Simulated command line (`terminal`)

*Why:* C2 and C3 teach commands, and crew learn them best by typing them. Today the courses use pictures of
terminals plus match / quiz.

*Authoring:* a block has a prompt string (`SW-CORE-01#`), an optional intro text, and a list of **steps**. Each
step has: the task ("Find which port the camera is on"), one or more accepted commands (normalised:
case-folded, repeated spaces collapsed, with an optional list of accepted abbreviations such as
`sh int status`, `sh mac add`), the canned output shown when right, an optional new prompt after the step
(`SW-CORE-01(config-if)#`), a hint shown after two wrong tries, and canned replies for common mistakes (e.g.
`% Invalid input detected at '^' marker.` or a "this would change the switch, try a show command" nudge).
Optionally a free-play list of commands with canned output that aren't steps, so crew can explore.

*Player:* a monospaced dark panel with a blinking prompt and an input line. Enter sends the command. Up-arrow
recalls the last command. `?` shows the step hint. Output types out quickly (no fake slowness over 300 ms).
Works on a phone keyboard (no reliance on Tab completion, but Tab can complete the first accepted command).

*Marking:* each step counts as passed when an accepted command is entered. Steps passed on the first try, or
after the hint, could be scored differently later. Start simple: the block is complete when every step is done,
with a score of the share of steps done without the hint. Accepted commands are the answer key: they're stripped
for learners, and the server checks each entry (one round trip per command, or the whole transcript at the end
if offline matters more).

*Learner copy:* steps with task text only. Canned output is returned by the server on a correct entry. If
offline matters, canned outputs can ship with the content because they aren't secret, but the accepted commands
must not.

### S2 — Click-through GUI walkthrough (`walkthrough`)

*Why:* FortiGate GUI, Microsoft 365 screens, AV touch panels, the Starlink app. Crew need to know *where to
click*, in order.

*Authoring:* a sequence of **frames**. Each frame is a picture (academy_media id), an instruction ("Open the
firewall policy list"), one or more hit areas (the same circle spots as `hotspot`, or rectangles, since GUIs
are rectangular), and an optional note shown after the click ("The policy list is read top to bottom").
Mode: *guided* (the hit area pulses, so it's for teaching) or *test* (no highlight, marked).

*Player:* shows frame 1. A tap inside the hit area moves to the next frame. A miss shows "Not quite" and, after
two misses, highlights the area. Progress dots along the bottom.

*Marking:* guided mode is complete when finished (like a reading block). Test mode scores the share of frames
right first time. Hit areas are stripped for learners in test mode, and each tap is checked server-side, as
hotspot taps are now.

*Note for the hotspot block meanwhile:* rectangle spots (`{ x, y, w, h }`) would help ordinary hotspots on
screenshots too.

### S3 — Branching scenario (`scenario`)

*Why:* incident response (A3), guest-facing support (B3), "the internet is down mid-charter" (C4). These are
decisions under pressure, where the consequence teaches more than the right answer.

*Authoring:* a graph of **nodes**. Each node has text (markdown), an optional picture, and 2–4 **choices**.
Each choice has a label, a next node and a feedback line ("Pulling the plug on the server destroyed the
evidence…"). End nodes carry an outcome (good / recoverable / bad) and a debrief. The author marks the best
path. `publishProblems` checks every node is reachable, every path ends, and there are no loops without an exit.

*Player:* a story card with choices as buttons. A short consequence line after each choice. The end shows the
path taken next to the best path.

*Marking:* complete on reaching any end node. The score is 100 on the best path, scaled down by the number of
poor choices, and needs the pass mark to count (so it can be retried, as quizzes are now). The node graph isn't
secret, but the "best" flags and outcome grades are stripped for learners and the server marks the path.

### S4 — Label the diagram (`label`)

*Why:* "drag the names onto the parts": switch front panels, rack layouts, the AV signal chain, a UPS display.
Today it's one hotspot per question.

*Authoring:* a picture plus a list of targets (spot circles or rects) each with its correct label, plus
distractor labels. *Player:* drag (or tap-label then tap-target on phones) each label onto the picture.
*Marking:* partial credit per target, like `match`.

### S5 — Read the output, tap the line (hotspot variant)

*Why:* a lot of C2/C3 is "which line in this output tells you X". Hotspot on a picture of the output works
(and is what the C2/C3 courses use now), but a native version would be accessible, searchable and easy to edit.

*Authoring:* monospace text (the output) and the right line number(s). *Player:* renders the text as lines
and the learner taps a line. *Marking:* right / wrong, explanation after. Cheap to build. It is really a quiz
whose options are the lines of the text.

### S6 — Smaller additions

- **Rectangle hotspots** (see S2) and **more than one right place, all needed** ("tap both uplinks").
- **Image zoom** in the player for big terminal / screenshot pictures on phones (pinch / tap-to-enlarge).
- **Code / output block in reading markdown** that keeps a monospace layout on a phone (scrolls sideways
  instead of wrapping). C2 and C3 lean on fenced code blocks.
- **Prerequisites** between courses (C1 before C2/C3) in the catalogue.
