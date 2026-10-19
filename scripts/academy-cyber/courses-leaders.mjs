// The officers / HoDs and Captains cyber courses — same building blocks as course.mjs.
// Crew take "Cyber security at sea — crew awareness" first; these build on it.
import { reading, image, doc, ack, quiz, hotspot, match, order, sort, lesson, section } from "./course.mjs";
import { MEDIA_LOG_SPOTS } from "./pictures-leaders.mjs";

const SUMMARY_TAIL = " Take \"Cyber security at sea — crew awareness\" first.";

export const OFFICERS = {
  title: "Cyber security for officers and Heads of Department",
  category: "Cyber security",
  minutes: 35,
  passMark: 80,
  refreshMonths: 12,
  summary:
    "What officers and HoDs do to keep the ship cyber-safe day to day: joiners and leavers, USB sticks and contractors, remote access, the first response when a crew member reports something, and the monthly checks and drills that keep it working. Includes a removable media log, contractor checklist and incident report form to print." + SUMMARY_TAIL,
  files: ["o1-officer-role.png", "o2-media-log.png", "o3-incident-flow.png", "o4-monthly-checks.png", "p2-pocket-cards.pdf", "p3-removable-media-log.pdf", "p4-contractor-checklist.pdf", "p5-incident-report.pdf"],
  content: () => ({
    sections: [
      section("Your role", [
        lesson("What's expected of officers", [
          reading(`
            The crew course teaches everyone the habits. Officers and Heads of Department make them **happen** in their department — and are the first person a crew member goes to when something looks wrong.

            Under the ISM Code, cyber risk is managed in the ship's Safety Management System, with the Captain responsible on board. The IMO guidelines organise that work in five steps — **Identify, Protect, Detect, Respond and Recover** — and each has a part for you:

            - **Identify** — know what's in your department: the laptops, tablets and systems, the accounts, who has access to what.
            - **Protect** — accounts for joiners and removed for leavers; USB sticks scanned; contractors supervised; remote access controlled.
            - **Detect** — crew who know what looks wrong, and feel safe telling you straight away.
            - **Respond** — the first few minutes: contain it, escalate it, keep the evidence.
            - **Recover** — get back to work with IT support, write it up, and drill it so next time is faster.

            None of this needs to be technical. It's the same as safety: follow the procedure, supervise, report, and lead by example — your own account, MFA on, no shared passwords.
          `),
          image("o1-officer-role.png", "Your part in each step"),
          quiz("Your role", [
            ["single", "A new deckhand asks you who they should tell if they click a strange link. What's the best answer?", ["\"Don't worry, the firewall stops everything\"", "*\"Me or the OOW, straight away — nobody gets in trouble for reporting\"", "\"Email IT support and wait for a reply\"", "\"Just delete the email\""], "Fast, no-blame reporting to someone on board is what limits the damage. You are part of that chain."],
            ["truefalse", "Cyber risk on board is the IT company's job, not the officers'.", false, "IT support helps, but under the ISM Code cyber risk is managed in the SMS — so officers and HoDs carry it out in their departments."],
          ]),
        ]),
      ]),

      section("Joiners, leavers and accounts", [
        lesson("Joiners and leavers", [
          reading(`
            Cyber Essentials' **user access control** comes down to one rule: *everyone has their own account, with only the access they need, and it's removed the day they leave.* Crew change is when that most often goes wrong.

            **When someone joins**

            - Ask IT support for their accounts **before** they arrive — their own email and logins, never a leaver's.
            - Make sure MFA is set up on day one.
            - Enrol them in "Cyber security at sea — crew awareness" in Crew Academy and give them the pocket card with your vessel's contacts.
            - Admin rights only for the people who manage systems (usually the ETO) — not "to make things easier".

            **When someone leaves — the same day**

            - Tell IT support so their accounts are **disabled** (not just the password changed).
            - Collect ship's laptops, phones, tablets, keys, cards and passes.
            - Change any **shared** passwords they knew — crew Wi-Fi, door codes, shared bridge or office logins.
            - Remove them from crew messaging groups that carry ship's information.

            Shared logins on watch-station PCs (bridge, engine control room) sometimes can't be avoided. Keep them to a minimum, write down who knows them, and change them at every crew change.
          `),
          order("Someone signs off today", "Put the leaver's steps in the best order.", [
            "Tell IT support the sign-off date in advance",
            "On the day: IT disables their accounts",
            "Collect ship's devices, keys and passes",
            "Change the shared passwords and door codes they knew",
            "Remove them from crew groups with ship's information",
          ]),
          sort("Admin rights?", "Who should have administrator rights on ship's computers?", ["Yes — they manage systems", "No — a normal account is enough"], [
            ["The ETO", 0],
            ["The IT support company's engineers", 0],
            ["The Chief Stew, to install a provisioning app", 1],
            ["A deckhand who \"knows computers\"", 1],
            ["The Purser, to use the accounts system", 1],
            ["A guest's assistant using the office printer", 1],
          ]),
        ]),
      ]),

      section("USB sticks, contractors and remote access", [
        lesson("Removable media", [
          reading(`
            USB sticks, memory cards and external drives are one of the main ways malware reaches a ship — especially its bridge and engine systems, which are rarely connected to the internet but often take updates by USB.

            **The procedure on board:**

            1. A **scanning PC** — a stand-alone computer with up-to-date anti-malware, not connected to the ship's networks — checks every stick before it's used anywhere else.
            2. Every stick is written in the **removable media log**: date, what it is, where it came from, who scanned it, what it was used on.
            3. **Bridge and engine equipment** only takes approved updates (charts, software from the maker), scanned first and loaded by the responsible officer.
            4. Guests' and visitors' sticks never go into ship's equipment. Music and films for the AV system go through the ETO / AV-IT officer.
            5. Found sticks are handed in, not tried.

            The log is reviewed weekly by the ETO or Chief Officer. Print the template below for your vessel.
          `),
          hotspot("Check the log", "One entry in this log breaks the rules. Tap it.", "o2-media-log.png", MEDIA_LOG_SPOTS.bad),
          doc("p3-removable-media-log.pdf", "Removable media log — template to print"),
          quiz("Removable media", [
            ["single", "What was wrong with the 15 October entry?", ["The stick was too big", "*It wasn't scanned, and it was used on the AV system and the ECDIS", "Guests may not bring music", "It wasn't signed by the Captain"], "Unscanned media from outside — on the navigation system of all places. That's exactly how malware reaches the bridge."],
            ["truefalse", "An ECDIS chart update from the official supplier can be loaded without scanning, because it's from a trusted source.", false, "Trusted sources get compromised too. Everything is scanned first, then loaded by the responsible officer."],
          ]),
        ]),
        lesson("Contractors and remote access", [
          reading(`
            Contractors and service engineers need access to do their job — AV, IT, engines, navigation, stabilisers. That access is also a common way in for attackers, through the engineer's own laptop or remote-access tool.

            **On board**

            - Agree the visit in advance: who, which systems, when.
            - Supervise them while they work on ship's systems.
            - Their laptop goes on the **guest network** unless it has to connect to a system — then it's scanned and agreed first.
            - Nothing left behind: no new accounts, remote tools or "temporary" cables without IT's agreement.

            **Remote access from shore**

            - Booked for a set time, with MFA, and **opened from our side** — not a permanent connection that's always on.
            - Watched while connected, disconnected and disabled afterwards.
            - Logged: who, when, what changed.

            **Never** let a caller "just connect" because they say they're from the maker. Check it another way first — with the Captain, the company or IT support.
          `),
          match("Right response", "Match each request with the right response.", [
            ["The AV engineer wants the crew Wi-Fi password for their laptop", "Guest network — and only via the officer in charge"],
            ["The engine maker emails asking to connect remotely tonight", "Check it by phone first, then book a supervised session"],
            ["A surveyor hands you a USB stick with their report", "Scan it at the scanning PC and log it"],
            ["The IT engineer has finished installing a new switch", "Check nothing was left behind, then sign the checklist"],
          ]),
          doc("p4-contractor-checklist.pdf", "Contractors and remote access — checklist to print"),
        ]),
      ]),

      section("First response", [
        lesson("When a crew member reports something", [
          reading(`
            The first few minutes decide how bad an incident gets. You don't need to be technical — you need to be calm, quick and methodical.

            1. **Listen.** What happened, when, which device or account? Thank them for reporting — that's what you want everyone to do.
            2. **Contain.** Pull the network cable or turn Wi-Fi off on the device. **Don't switch it off** — what's in memory helps IT. If a password was typed into a fake page, get IT to reset it and sign the account out everywhere. If a payment might be involved, call the bank at once.
            3. **Escalate.** Tell the Captain, then the company and IT support. Say clearly if **personal data** (guest or crew) or **navigation / engine systems** are involved.
            4. **Keep evidence.** Photos of the screen, the time, the email itself. Delete nothing.
            5. **Recover and learn.** IT restores from backups. Fill in the incident report, brief the crew on what happened (without blame), and use it in the next drill.

            **Personal data?** If guest or crew information may have been seen by someone it shouldn't have, tell the company's data protection lead straight away — there are legal deadlines for reporting breaches (72 hours under UK and EU GDPR).

            **Navigation?** For GPS, AIS or ECDIS problems, the bridge follows the ship's navigation procedures first — cross-check, then report.
          `),
          image("o3-incident-flow.png", "First response — five steps"),
          order("Ransom note on the office PC", "The office PC shows a ransom note. Put your first actions in order.", [
            "Unplug its network cable — don't switch it off",
            "Tell the Captain",
            "Call IT support and the company",
            "Photograph the screen and note the time",
            "Check whether other PCs show the same — and isolate them too",
          ]),
          quiz("Scenarios", [
            ["single", "A stewardess says they typed their email password into a page that \"looked like Microsoft\" an hour ago. What first?", ["Ask them to keep an eye on their inbox", "*Get IT to reset the password and sign them out everywhere, and check their mailbox rules", "Tell them to change it next time they log in", "Nothing — MFA will protect them"], "Act now: reset, sign out everywhere, and check for mail-forwarding rules criminals often add. MFA helps but some fake pages capture codes too."],
            ["single", "A crew member lost a ship's laptop ashore. What matters most first?", ["*Report it so IT can block its accounts and, if possible, wipe it", "Wait a day in case it turns up", "Buy a replacement", "Change the crew Wi-Fi password"], "Speed again: blocking accounts and remote wipe protect the data on it. Note what data it held — guest information may make it a data breach."],
            ["truefalse", "If a computer seems infected, switching it off straight away is the best first step.", false, "Disconnect it from the network instead and leave it on — that stops the spread and keeps evidence IT may need."],
          ]),
          doc("p5-incident-report.pdf", "Cyber incident report — fillable form"),
        ]),
      ]),

      section("Keeping it alive", [
        lesson("Monthly checks and drills", [
          reading(`
            Controls quietly decay: an update gets postponed, a leaver's account stays open, a backup stops running. A short monthly check catches it.

            **Monthly (ETO / Chief Officer, ten minutes):**

            - Updates installed on every ship's laptop and PC — critical ones within 14 days.
            - Backups ran — and one file was actually restored as a test.
            - Leavers' accounts disabled; joiners have accounts, MFA and the crew course done.
            - Crew Wi-Fi password changed after crew changes.
            - Removable media log checked — it should have been reviewed every week.
            - Anti-malware up to date on the scanning PC.

            **Drills — at least twice a year.** A cyber drill can be a 30-minute tabletop in the mess: read out a scenario, and walk through who does what. Ideas: ransomware on the office PC mid-charter; GPS spoofed on approach; a fake payroll email reaching all crew. Record it like any other drill, and fix what didn't work.

            **Crew Academy helps here:** your vessel's Reports tab shows who has and hasn't finished the crew course — use it before an audit or charter season.
          `),
          image("o4-monthly-checks.png", "Monthly checks and twice-yearly drills"),
          sort("How often?", "Put each task in the right group.", ["Every month", "Every crew change", "At least twice a year"], [
            ["Check updates are installed on ship's laptops", 0],
            ["Test-restore a file from backup", 0],
            ["Change the crew Wi-Fi password", 1],
            ["Disable leavers' accounts", 1],
            ["Run a cyber drill", 2],
            ["Check anti-malware is up to date on the scanning PC", 0],
          ]),
          doc("p2-pocket-cards.pdf", "Pocket cards for your crew — fill in your vessel's contacts, print and cut"),
          ack("I understand my part as an officer / Head of Department: managing joiners and leavers, removable media, contractors and remote access, responding quickly when something is reported, and keeping the monthly checks and drills going."),
        ]),
      ]),
    ],
  }),
};

export const CAPTAINS = {
  title: "Cyber security for Captains",
  category: "Cyber security",
  minutes: 30,
  passMark: 80,
  refreshMonths: 12,
  summary:
    "Cyber security from the Captain's chair: how it fits the Safety Management System and what an auditor will ask for, what Cyber Essentials Plus means for the vessel, contingency plans for losing GPS or communications, ransomware, payment fraud and data breaches, and leading a no-blame reporting culture. Includes a fillable contingency plan template." + SUMMARY_TAIL,
  files: ["c1-sms-audit.png", "c2-ce-plus-year.png", "c3-contingency.png", "p6-contingency-plan.pdf", "p1-crew-mess-poster.pdf"],
  content: () => ({
    sections: [
      section("Cyber in the Safety Management System", [
        lesson("What the rules expect", [
          reading(`
            Since 1 January 2021, IMO resolution **MSC.428(98)** has expected cyber risks to be "appropriately addressed" in the Safety Management System of every ship under the ISM Code — and cyber has been part of document of compliance audits since. For yachts outside the ISM Code, flag states, charter contracts, insurers and management companies increasingly expect the same.

            The IMO's guidance on how to do it is **MSC-FAL.1/Circ.3/Rev.3** (2025). The industry's practical version is the **Guidelines on Cyber Security Onboard Ships** (BIMCO and partners, v5, 2024). For new-build ships contracted from 1 July 2024, the classification societies' **IACS UR E26 and E27** add cyber-resilience requirements for the ship's systems themselves — whether and how they apply to a particular yacht depends on its class, so ask the management company.

            **What an auditor will ask to see:**

            - a **cyber risk assessment**, kept current — reviewed whenever systems, networks or suppliers change;
            - an **inventory** of IT and OT: hardware, software, networks and remote connections;
            - **roles**: who is responsible on board and ashore, and who IT support is;
            - **procedures**: accounts, removable media, contractors and remote access, backups;
            - **training records** — Crew Academy completions are your evidence;
            - **response and recovery**: the incident plan, contingency plans, drills and their reports.
          `),
          image("c1-sms-audit.png", "What an auditor will ask to see"),
          quiz("The rules", [
            ["truefalse", "Under the ISM Code, cyber risk must be addressed in the Safety Management System.", true, "IMO resolution MSC.428(98), in force for DOC audits since 1 January 2021."],
            ["multi", "Which of these would an auditor reasonably ask to see? Choose all that apply.", ["*A current cyber risk assessment", "*Crew cyber training records", "*An inventory of IT and OT systems", "The crew's personal social media passwords", "*Records of cyber drills"], "Risk assessment, inventory, procedures, training records and drills are the core evidence. Personal passwords are never shared — with anyone."],
          ]),
        ]),
      ]),

      section("Cyber Essentials Plus and the vessel", [
        lesson("What the certificate means for you", [
          reading(`
            **Cyber Essentials** is the UK Government scheme behind the five controls in the crew course. **Cyber Essentials Plus** adds an independent technical audit. The current requirements (v3.3, from April 2026) are stricter: **MFA must be on** for every cloud service that offers it, **critical and high-risk updates within 14 days** are pass-or-fail, and any cloud service that holds company data is in scope.

            **How the year works**

            1. **Scope** — the company decides what's covered: usually company and vessel IT, cloud services such as Microsoft 365, and any device that reaches company data — including crew's own phones if they get ship's email.
            2. **Self-assessment** — questions answered and signed off by a senior person.
            3. **External scan** — the assessor scans what faces the internet.
            4. **Device tests** — the assessor (not you) picks sample laptops, phones and servers and checks patches, malware protection, email and browser settings and MFA.
            5. **Certificate** — valid 12 months, with no grace period.

            **Your part as Captain:** keep updates going on (don't let "we're at sea" become "we never patch"), report old devices that can't be updated, plan the device tests around the itinerary and connectivity, and make sure leavers' accounts are closed — the assessor will look.

            Bridge and engine systems (OT) are normally handled under the SMS and class rather than Cyber Essentials — but they must be kept separate from the networks that are in scope.
          `),
          image("c2-ce-plus-year.png", "How the Cyber Essentials Plus year works"),
          sort("Where does it sit?", "Put each system where it's usually managed.", ["Usually in Cyber Essentials scope", "Usually under the SMS / class (OT)"], [
            ["Office laptops", 0],
            ["Microsoft 365 email and files", 0],
            ["The firewall / router to shore", 0],
            ["Crew's own phones that get ship's email", 0],
            ["ECDIS", 1],
            ["Engine monitoring and alarm system", 1],
            ["Radar", 1],
          ]),
        ]),
      ]),

      section("Contingency plans", [
        lesson("Plan for it before it happens", [
          reading(`
            Every contingency plan answers the same questions: **what are the signs, what are the first actions, who leads, who do we call, and how do we keep working?** Write them down with your officers, keep printed copies on the bridge and in the office (they're no use on a laptop that's been encrypted), and drill at least one a year.

            **Loss of GPS / position** — cross-checks (radar, visual, depth, DR), the GPS-loss procedure, backup or paper charts, report to the company and, where required, to coastal authorities.

            **Loss of communications** — Starlink, VSAT and 4G all down: satellite phone, GMDSS, an agreed call-in schedule with the company, printed contact lists.

            **Ransomware / IT outage** — mid-charter is the worst time. Offline copies of the crew list, port papers, guest preferences and supplier contacts; a paper way to provision and pay; who calls IT support and the company.

            **Payment fraud** — bank-detail changes always confirmed by phone on a known number; two people approve payments; who to call at the bank to stop a transfer.

            **Data breach** — guest or crew data exposed: tell the company and its data protection lead at once (UK / EU GDPR deadline: 72 hours), keep evidence, and agree who speaks to the guests.
          `),
          image("c3-contingency.png", "Five things to plan for"),
          match("First move", "Match each situation with the first move.", [
            ["ECDIS shows the yacht inland on approach", "Cross-check with radar and visual, use the GPS-loss procedure"],
            ["Ransom note on the office PC during a charter", "Isolate it, call IT and the company, switch to paper"],
            ["A supplier asks to change bank details before a big invoice", "Call the supplier on a known number before paying"],
            ["The guest list was emailed to the wrong address", "Tell the company's data protection lead straight away"],
            ["Starlink, VSAT and 4G are all down", "Sat phone / GMDSS and the agreed call-in schedule"],
          ]),
          doc("p6-contingency-plan.pdf", "Cyber contingency plans — fillable template"),
        ]),
      ]),

      section("Leading the culture", [
        lesson("What crew take from the Captain", [
          reading(`
            Crew follow what the Captain does, not what the procedure says.

            - **No blame for reporting.** Say it at muster and mean it. The crew member who reports a click in two minutes saves the ship; the one who hides it for two days doesn't.
            - **Lead by example.** Your own account, MFA on, no shared passwords, no "just this once" USB stick on the bridge.
            - **Make time for it.** Crew course done before charter season; officers' course for HoDs; a drill twice a year; ten minutes of monthly checks.
            - **Use the evidence.** Crew Academy's Reports tab shows who has finished; the removable media log, checklists and incident reports are your audit trail.
            - **Know your IT support.** Questions worth asking them: How fast do you respond at sea? How are our backups tested? Who can connect to our systems remotely, and how is it controlled? Which of our devices can't be updated? Are we ready for the next Cyber Essentials Plus audit?

            Put the crew mess poster up, with your vessel's contacts filled in.
          `),
          doc("p1-crew-mess-poster.pdf", "Crew mess poster — fill in your contacts and print"),
          quiz("Final check", [
            ["single", "A deckhand admits they plugged a guest's USB stick into the saloon AV system yesterday. The best response is:", ["A formal warning, so others learn", "*Thank them for reporting, have the AV system checked, and remind the crew why", "Ignore it — the AV system isn't important", "Ban all USB sticks from the yacht"], "No-blame reporting is what makes crew speak up quickly. Deal with the risk, then use it as a lesson."],
            ["single", "Where should contingency plans be kept?", ["Only on the office PC", "*Printed on the bridge and in the office, as well as electronically", "In the Captain's email", "With the IT company only"], "In a ransomware attack or IT outage, an electronic-only plan may be unreadable."],
            ["truefalse", "A Cyber Essentials Plus certificate lasts 12 months and must be renewed before it expires.", true, "There's no grace period — plan the renewal and the device tests around the yacht's programme."],
            ["single", "A supplier's email asks for payment to new bank details. Who should confirm the change?", ["Whoever receives the email", "*Someone who phones the supplier on a number already on file, before any payment", "The bank, after the payment", "Nobody, if the email came from the usual address"], "The supplier's mailbox may itself be hacked, so the check must be by phone on a known number."],
          ]),
          ack("As Captain I will make sure cyber risk is managed in our SMS: current risk assessment and inventory, procedures followed, crew trained, contingency plans written and drilled, and a no-blame reporting culture on board."),
        ]),
      ]),
    ],
  }),
};
