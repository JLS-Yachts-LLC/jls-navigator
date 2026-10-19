// "Cyber security at sea" — the JLS library course, in the Crew Academy content
// shape (src/lib/academy/content.ts). Files are referenced by name ("@01-cover.png")
// and swapped for academy_media ids by buildCourse(mediaIds) once uploaded.
//
// Aligned to: UK Cyber Essentials (Requirements for IT Infrastructure v3.3 "Danzell",
// April 2026 — the five controls) and Cyber Essentials Plus; IMO MSC-FAL.1/Circ.3/Rev.3
// (2025) and MSC.428(98); BIMCO et al. Guidelines on Cyber Security Onboard Ships v5
// (2024); NCSC "Top tips for staff". Crew awareness only — it supports, not replaces,
// the vessel's own cyber risk assessment and SMS procedures.
import { randomUUID } from "node:crypto";
import { PHISH_SPOTS, SOCIAL_SPOTS } from "./pictures.mjs";

const id = () => randomUUID().replace(/-/g, "").slice(0, 12);

export const COURSE = {
  title: "Cyber security at sea — crew awareness",
  category: "Cyber security",
  minutes: 40,
  passMark: 80,
  refreshMonths: 12,
  summary:
    "Spot scams, look after your logins, keep phones and USB sticks away from the ship's systems, and know exactly what to do when something goes wrong. Built on the UK Cyber Essentials controls and the IMO and BIMCO guidance on cyber security on board.",
};

// ── Block builders ─────────────────────────────────────────────────────────
const reading = (markdown) => ({ id: id(), type: "reading", markdown: markdown.trim().replace(/^ +/gm, "") });
const image = (file, caption) => ({ id: id(), type: "image", mediaId: `@${file}`, caption });
const video = (file, title) => ({ id: id(), type: "video", mediaId: `@${file}`, url: null, title, mustWatch: true });
const ack = (statement) => ({ id: id(), type: "acknowledge", statement });
function quiz(title, questions) {
  return {
    id: id(), type: "quiz", title,
    questions: questions.map(([kind, prompt, opts, explanation]) => {
      if (kind === "truefalse") {
        return { id: id(), kind, prompt, options: [{ id: "true", text: "True" }, { id: "false", text: "False" }], correct: [opts ? "true" : "false"], explanation };
      }
      const options = opts.map((o) => ({ id: id(), text: o.replace(/^\*/, ""), right: o.startsWith("*") }));
      return { id: id(), kind, prompt, options: options.map(({ id, text }) => ({ id, text })), correct: options.filter((o) => o.right).map((o) => o.id), explanation };
    }),
  };
}
const hotspot = (title, prompt, file, spots) => ({ id: id(), type: "hotspot", title, prompt, mediaId: `@${file}`, spots: spots.map((s) => ({ id: id(), ...s })) });
const match = (title, prompt, pairs) => ({ id: id(), type: "match", title, prompt, pairs: pairs.map(([left, right]) => ({ id: id(), left, right, rightId: id() })) });
const order = (title, prompt, steps) => ({ id: id(), type: "order", title, prompt, items: steps.map((text) => ({ id: id(), text })) });
function sort(title, prompt, buckets, items) {
  const b = buckets.map((text) => ({ id: id(), text }));
  return { id: id(), type: "sort", title, prompt, buckets: b, items: items.map(([text, i]) => ({ id: id(), text, bucketId: b[i].id })) };
}
const lesson = (title, blocks) => ({ id: id(), title, blocks });
const section = (title, lessons) => ({ id: id(), title, lessons });

// ── The course ─────────────────────────────────────────────────────────────
export function content() {
  return {
    sections: [
      section("Why it matters", [
        lesson("Cyber security on board", [
          image("01-cover.png", "Cyber security at sea"),
          reading(`
            A yacht today is a floating network. Satellite and 4G internet, guest and crew Wi-Fi, the office PCs, the AV and lighting systems, CCTV — and on the bridge and in the engine room, ECDIS, radar, engine monitoring and alarm systems. Almost all of it is connected in some way.

            That makes the ship a target. Criminals go after yachts because:

            - **Money moves through them** — provisioning, fuel, agents, crew salaries. A fake invoice or a changed bank detail can cost tens of thousands.
            - **The people on board are valuable** — owners and guests expect privacy. Their names, plans and whereabouts are worth money to criminals and to the press.
            - **Ships rely on their systems** — when IT or navigation systems fail, the ship can't trade, and safety is at risk.

            This isn't theory. In 2017 the NotPetya malware stopped one of the world's largest shipping lines for around two weeks and cost it hundreds of millions of dollars. GPS jamming and spoofing are now reported every day in parts of the Mediterranean, the Black Sea and the Gulf.

            **Most attacks start with a person** — a click on a link, a password typed into a fake page, a USB stick plugged in "just to charge a phone". That's why this course is about you, not the technology.
          `),
          reading(`
            ### What this course is based on

            - **Cyber Essentials and Cyber Essentials Plus** — the UK Government scheme that sets five basic technical controls: firewalls, secure settings, user access control, malware protection and security updates. *Plus* means an independent assessor tests that the controls really work. The current requirements (version 3.3, April 2026) make two-step sign-in (MFA) compulsory on cloud services and critical updates due within 14 days.
            - **The IMO Guidelines on maritime cyber risk management** (MSC-FAL.1/Circ.3/Rev.3, 2025). Since 2021 the IMO has expected every ship's Safety Management System to deal with cyber risk (resolution MSC.428(98)) — so cyber security is part of safety management, like fire or pollution.
            - **The Guidelines on Cyber Security Onboard Ships** (BIMCO and industry partners, version 5, 2024), which explain how that works on a real ship — including crew awareness, removable media and separating networks.

            You'll see each Cyber Essentials control turn up in the lessons, in ship's terms.
          `),
          image("02-five-controls.png", "The five Cyber Essentials controls — and what they mean on board"),
          quiz("Check your understanding", [
            ["single", "How do most cyber attacks on ships and companies start?", ["With hackers breaking through the satellite dome", "*With a person — a click, a password or a device plugged in", "With faults in the engine-room software", "With bad weather damaging the antennas"], "Most attacks rely on someone being tricked into opening the door. That's why crew awareness matters so much."],
            ["truefalse", "Under the IMO rules, cyber risk is part of the ship's Safety Management System — the same as other safety risks.", true, "Since 1 January 2021 (resolution MSC.428(98)), cyber risk must be dealt with in the SMS."],
            ["multi", "Which of these are among the five Cyber Essentials controls? Choose all that apply.", ["*Firewalls", "*Security updates", "*User access control", "Locking the bridge door", "*Malware protection"], "The five are firewalls, secure configuration, user access control, malware protection and security update management."],
          ]),
        ]),
      ]),

      section("Scams by email, message and phone", [
        lesson("Spotting a phishing email", [
          reading(`
            **Phishing** is an email that pretends to be from someone you trust — the management company, payroll, a bank, Microsoft, DHL, the Captain — to make you click a link, open an attachment, type in a password or send money.

            They are often very well made. Look for these signs:

            1. **Unexpected** — you weren't waiting for it.
            2. **Urgent or threatening** — "within 2 hours", "your salary is on hold", "your account will be closed".
            3. **The sender's address doesn't match** — the name looks right but the address after the @ is different (\`jlsyachts-crewpay.com\` is not \`jlsyachts.com\`).
            4. **A link that goes somewhere else** — on a computer, rest the mouse on it (don't click) to see the real address. On a phone, press and hold.
            5. **Attachments you didn't expect** — especially \`.zip\`, \`.html\`, \`.exe\`, or Office files that ask you to "enable content".
            6. **Asks for your password, a sign-in code, bank details or payment.**

            **Check it another way.** If an email asks you to act, contact the sender using details you already have — not the ones in the email. It's always fine to ask the Captain, your Head of Department or IT: "is this real?"
          `),
          hotspot("Find the fake", "This email says it's from JLS Crew Payroll. Tap the detail that proves it isn't.", "03-phishing-email.png", PHISH_SPOTS.sender),
          hotspot("Where does it go?", "The button says \"Confirm my bank details\". Tap the place that shows where it would really take you.", "03-phishing-email.png", PHISH_SPOTS.link),
          quiz("Phishing", [
            ["single", "The same email has an attachment called Salary_Form.html. What should you do?", ["Open it — it's only a form", "Open it on your phone instead of the laptop", "*Don't open it. Report the email and delete it", "Forward it to your crewmates to ask if it's real"], "An unexpected .html attachment is a classic way to show a fake sign-in page. Report it — and don't forward it, that spreads the risk."],
            ["truefalse", "If an email shows the right name, such as \"JLS Crew Payroll\", it must be genuine.", false, "Anyone can type any display name. Look at the actual address — and the request itself."],
            ["single", "You clicked a link and typed in your email password before realising it was fake. What now?", ["Nothing — it was only the email password", "Wait and see if anything strange happens", "*Tell the ETO, IT or your Head of Department straight away, and change the password", "Delete the email so nobody finds out"], "Speed matters: a password changed within minutes is useless to the criminal. Nobody gets into trouble for reporting."],
          ]),
        ]),
        lesson("Scams by message, phone and QR code", [
          reading(`
            Scams don't only come by email. Criminals use whatever gets past your guard:

            - **WhatsApp and text messages** — "Hi, it's the Captain, new number…". Often asks for gift cards, a quick payment or a "favour", and says they can't talk.
            - **Phone calls** — someone claiming to be IT support, the bank or the management company who needs a code, a password or remote access to a computer.
            - **Bank detail changes** — an email or letter from a supplier, agent or shipyard saying their bank details have changed. This is one of the most expensive scams in yachting. **Bank details are always checked by phone, on a number you already have, before anything is paid.**
            - **QR codes** — on posters, parking meters or in emails, leading to fake sign-in or payment pages.
            - **Fake Wi-Fi in port** — a hotspot called "Marina Free WiFi" that is really someone's laptop.

            The same rule works every time: **if it's unexpected, urgent or secret — stop, and check it another way.**
          `),
          image("04-gift-card-scam.png", "The \"Captain\" gift card scam — four red flags"),
          sort("Safe — or stop and check?", "Put each situation in the right group.", ["Fine to go ahead", "Stop and check another way"], [
            ["The Captain asks you, in person on deck, to collect a parcel from the agent", 0],
            ["A WhatsApp from a new number says it's the Captain and asks for gift cards", 1],
            ["An agent emails to say their bank account has changed for this invoice", 1],
            ["A caller from \"IT\" asks for the code that was just sent to your phone", 1],
            ["You join the crew Wi-Fi using the password from the crew mess notice", 0],
            ["A QR code in an email asks you to sign in again to keep your mailbox", 1],
            ["Your Head of Department reminds you about tomorrow's drill on the crew group", 0],
          ]),
        ]),
      ]),

      section("Passwords and sign-in", [
        lesson("Passwords, passphrases and MFA", [
          reading(`
            Cyber Essentials calls this **user access control**: everyone has their own account, only gets the access they need, and protects it properly.

            **Your own login — never shared.** Shared logins mean nobody knows who did what, and when one person leaves the password walks off with them. Don't share yours, and don't use someone else's.

            **Use three random words.** A long passphrase like \`KettleOrbitMango\` is far harder to crack than \`Serenity2026!\` — and easier to remember. Avoid names, birthdays, the boat's name, the year and keyboard patterns.

            **A different password for every account.** When one website is hacked, criminals try the same email and password everywhere else. A **password manager** remembers them all for you.

            **Turn on two-step sign-in (MFA) everywhere.** With MFA, a stolen password on its own isn't enough — the criminal also needs your phone. Cyber Essentials now makes MFA compulsory on every cloud service that offers it.

            **Never approve a sign-in you didn't start.** Criminals who already have your password sometimes send prompt after prompt, hoping you'll tap "Approve" to make them stop. Tap **Deny** and report it — it means your password is known.

            **Nobody genuine will ever ask for your password or a sign-in code** — not IT, not the Captain, not the bank.
          `),
          image("05-passphrase-mfa.png", "Three random words — plus a second step"),
          video("a2-why-mfa.mp4", "Animation: why two-step sign-in (MFA) matters"),
          quiz("Passwords and MFA", [
            ["single", "Which password is the strongest?", ["Serenity2026!", "P@ssw0rd123", "*TeapotHarbourViolin", "07891234567"], "Three random words make a long passphrase that's easy to remember and very hard to guess. The others use the boat's name, a well-known pattern or a phone number."],
            ["single", "Your phone shows a sign-in request you didn't start. What do you do?", ["Approve it so it stops", "Ignore it", "*Deny it and report it — your password may be known", "Turn your phone off"], "An unexpected request means someone has your password. Deny it, report it, and change the password."],
            ["truefalse", "It's fine to share your login with a crewmate if they're covering your watch.", false, "Never share logins. Ask for their own account or access instead — it protects you both."],
          ]),
        ]),
      ]),

      section("Devices, USB sticks and updates", [
        lesson("USB sticks, chargers and your own devices", [
          reading(`
            Cyber Essentials calls this **malware protection** — stopping harmful software getting onto the ship's computers in the first place. On a ship, USB sticks and cables are one of the main ways it gets in.

            - **Never plug anything into bridge or engine-room equipment** — ECDIS, radar, engine monitoring, alarm panels. Not a phone "just to charge", not a USB stick with a playlist. A phone plugged into a USB port is a computer talking to a computer.
            - **USB sticks from shore, agents, surveyors or contractors** go to the ETO or the responsible officer to be scanned first — even if they're from someone you trust. Chart and software updates come through the ship's approved process.
            - **Found a USB stick?** Don't plug it in to see whose it is. Hand it in.
            - **Your own phone, tablet and laptop** go on the **crew Wi-Fi only** — never on the ship's business or bridge network, and never plugged into a network socket.
            - **Lock your screen** when you walk away, and use a PIN or fingerprint on your phone.
            - **Lost a phone or laptop** with ship's email on it? Report it at once so access can be blocked.
          `),
          image("06-bridge-usb.png", "Bridge and engine-room equipment is not a charger"),
          match("Right place, right device", "Match each item with what to do with it.", [
            ["Phone with a flat battery", "Charge it in the crew mess or your cabin"],
            ["USB stick from the agent's office", "Give it to the ETO or officer to scan first"],
            ["USB stick found on the dock", "Hand it in — don't plug it in"],
            ["Your own laptop", "Crew Wi-Fi only"],
            ["Chart or ECDIS software update", "Only through the ship's approved process"],
          ]),
        ]),
        lesson("Updates and secure settings", [
          reading(`
            Two more Cyber Essentials controls are about how computers and devices are looked after.

            **Security updates.** Updates close holes that criminals already know about. Under Cyber Essentials, critical and high-risk fixes must be installed **within 14 days** — on laptops, phones, routers, firewalls and apps. Your part:

            - When your device asks to update and restart, **do it** — don't keep pressing "later".
            - Software that no longer gets updates (an old Windows version, an old phone) shouldn't be used for ship's work. Tell IT if you're stuck with one.
            - Updates to bridge and engine systems are planned by the ETO, the Captain and the maker's engineer — never done ad hoc.

            **Secure settings** (Cyber Essentials: *secure configuration*). Devices often arrive with default passwords and features nobody needs:

            - Only install apps from the official app store, and only the ones you need for work on work devices.
            - Don't change the settings of ship's systems, routers or cameras unless that's your job.
            - **Remote access** — a service engineer connecting to a ship's system from shore — must be agreed and watched by the responsible officer. Never let a caller "just connect" to a computer.
          `),
          quiz("Updates and settings", [
            ["single", "Your laptop has asked to install a security update for three days. What should you do?", ["Keep postponing — it's only a laptop", "*Save your work and let it update and restart today", "Turn off automatic updates so it stops asking", "Wait until you're back in port"], "Critical updates must go on within 14 days under Cyber Essentials — and the sooner the better."],
            ["truefalse", "A caller who says they're from the maker of the engine monitoring system can connect to it remotely, as long as they sound genuine.", false, "Remote access must be agreed in advance and supervised by the responsible officer. Check the request another way first."],
          ]),
        ]),
      ]),

      section("Networks and navigation", [
        lesson("Keeping networks apart", [
          reading(`
            Cyber Essentials starts with **firewalls** — the wall between your networks and the internet. On board, the IMO and BIMCO guidance goes a step further: the ship's networks are **kept apart from each other**.

            - **Guest Wi-Fi** — guests' phones and laptops.
            - **Crew Wi-Fi** — your own devices.
            - **Ship's business** — office PCs, email, accounts, files.
            - **Bridge and engine** — ECDIS, radar, engine monitoring, alarm systems, often CCTV and access control.

            If malware gets onto one network, the firewalls between them stop it reaching the others. The animation below shows why that matters.

            **Your part:**

            - Never plug a cable into a network socket you don't know, or plug a device into the bridge or engine networks.
            - Don't give the crew or business Wi-Fi password to guests, contractors or friends — there's a guest network for them.
            - Don't connect bridge or engine computers to Wi-Fi or a phone hotspot to "get updates".
            - On public Wi-Fi ashore, use the VPN if you've been given one, and don't sign in to ship's accounts on shared or public computers.
          `),
          image("07-networks.png", "One connection to shore — separate networks on board"),
          video("a1-one-click-whole-ship.mp4", "Animation: one click, whole ship"),
          quiz("Networks", [
            ["single", "A contractor working in the engine room asks for the Wi-Fi password. What do you give them?", ["The business network password — it's the fastest", "Your own crew Wi-Fi password", "*Nothing — send them to the officer in charge, who can give guest access if it's allowed", "The bridge network password, as they're working on ship's systems"], "Visitors only get guest access, and only through the officer in charge."],
            ["truefalse", "Keeping the bridge and engine networks separate from the crew and guest Wi-Fi stops one infected phone or laptop from reaching navigation systems.", true, "That's the whole idea of segregation — and why you must never bridge the gap with a cable, hotspot or USB stick."],
          ]),
        ]),
        lesson("Navigation systems and GPS", [
          reading(`
            Navigation depends on signals that can be interfered with.

            - **GPS jamming** drowns out the satellite signal — the position freezes, jumps or disappears.
            - **GPS spoofing** sends a fake signal — the position looks normal but is wrong, sometimes by miles, sometimes onto land or an airport. AIS positions of other ships can be faked too.

            Both are now common in parts of the Eastern Mediterranean, the Black Sea, the Red Sea and the Gulf.

            **Signs:** a sudden jump in position, speed over ground of zero while you're clearly moving, a position on land, AIS targets in impossible places, clocks that don't agree, GPS alarms.

            **What to do:**

            1. **Cross-check** — radar ranges and bearings, visual bearings, depth from the echo sounder, dead reckoning.
            2. **Tell the Officer of the Watch / Captain at once.**
            3. **Navigate on the sources you can trust** — follow the ship's procedures for GPS loss.
            4. **Log it and report it** — times, positions and what you saw help others.

            And never use bridge computers for email, browsing or personal devices — they're there to navigate.
          `),
          video("a3-gps-spoofing.mp4", "Animation: when the screen lies — GPS jamming and spoofing"),
          order("If the GPS looks wrong", "Put these actions in the right order.", [
            "Notice the GPS position doesn't make sense",
            "Cross-check with radar, visual bearings and depth",
            "Tell the Officer of the Watch / Captain",
            "Navigate on the sources you can trust",
            "Log the event and report it",
          ]),
        ]),
      ]),

      section("Privacy and social media", [
        lesson("What you share online", [
          reading(`
            Owners and guests choose yachts for their privacy. Criminals, stalkers and the press look for exactly what crew sometimes post without thinking.

            **Never share online:**

            - the **yacht's position, next port or itinerary** — especially while it's happening;
            - **who is on board** — names, faces or arrival times of owners and guests;
            - **photos of screens, passes and paperwork** — crew passes, boarding passes, passports, door codes, Wi-Fi passwords, charts or ECDIS screens;
            - anything covered by your **confidentiality agreement**.

            Check what's in the background before you post, and turn off location tags. Wait until the yacht has moved on before sharing even harmless photos — and if in doubt, don't.

            Be careful too with **messages from strangers** on crew job sites, LinkedIn and social media — "recruiters" and "journalists" sometimes fish for information about a yacht and its owner.

            Guest and crew personal information (passports, contact details, health information) is protected by data protection law. Only share it through the proper channels, and never by personal email or messaging.
          `),
          hotspot("Too much information", "This post gives away the owner's plans. Tap the part that tells a criminal when the owner will be on board.", "08-social-post.png", SOCIAL_SPOTS.schedule),
          hotspot("Look in the background", "Tap the item in the photo that should never appear online.", "08-social-post.png", SOCIAL_SPOTS.pass),
          quiz("Sharing safely", [
            ["multi", "Which of these are safe to post while the owner is on board? Choose all that apply.", ["*A photo of a sunset with no location tag, no people and no yacht name", "A selfie on the aft deck with guests in the background", "\"Owner arrives 10:00 tomorrow!\"", "A photo of the ECDIS showing tonight's route"], "Only the sunset gives nothing away. Guests, schedules and navigation screens never go online."],
          ]),
        ]),
      ]),

      section("When something goes wrong", [
        lesson("Reporting an incident", [
          reading(`
            Everyone makes mistakes — and criminals are good at what they do. What matters is **how fast** you report it. A password changed in five minutes is useless to a criminal; one changed next week isn't.

            **Report it when:**

            - you clicked a link or opened an attachment and then wondered;
            - you typed a password or a code into a page that might be fake;
            - you got a sign-in request you didn't start;
            - a computer is behaving strangely — pop-ups, files you can't open, very slow, a ransom message;
            - a phone, laptop or USB stick with ship's information is lost or stolen;
            - the GPS, AIS or another navigation or engine system is acting oddly;
            - someone asks for information or access and it doesn't feel right.

            **What to do:**

            1. **Stop.** Don't click anything else and don't try to fix it yourself.
            2. **Tell someone now** — the Officer of the Watch, your Head of Department, the ETO or the Captain. They'll involve the ship's IT support.
            3. **Leave it as it is.** Don't switch it off or delete anything — it helps find out what happened. If you're told to, turn off Wi-Fi or unplug the network cable.
            4. **Say what happened** — what you clicked or opened, when, and on which device or account.

            The ship's response and recovery plan — the last two parts of the IMO guidelines — can only start when someone speaks up. **Nobody gets into trouble for reporting.**
          `),
          image("09-report-it.png", "Report it — straight away, no blame"),
          order("You've just clicked a bad link", "Put the steps in the right order.", [
            "Stop — don't click anything else",
            "Tell the OOW, your HoD, the ETO or the Captain",
            "Leave the device as it is (Wi-Fi off only if told to)",
            "Explain what you clicked, when and on which device",
            "Change any password you typed in, when IT says so",
          ]),
        ]),
        lesson("Final check", [
          image("10-six-habits.png", "Six habits that keep the ship safe"),
          quiz("Final quiz", [
            ["single", "An email from \"the management company\" says your account will be closed unless you sign in within an hour. What's the best first step?", ["Click the link quickly so you don't lose access", "Reply asking if it's genuine", "*Check it another way — ask IT or contact the company on details you already have", "Forward it to all crew as a warning"], "Urgency is a classic sign. Never use the contact details or links in the suspicious email itself."],
            ["single", "Which of these follows the Cyber Essentials rule on user access control?", ["One shared login for all deck crew", "*Your own account, a strong passphrase and MFA", "Writing the password on the monitor so nobody forgets it", "Using the same password everywhere so it's easy to remember"], "Own account, strong unique passphrase, two-step sign-in."],
            ["truefalse", "It's safe to charge your phone from the ECDIS USB port as long as you don't open any files.", false, "Plugging in a phone connects one computer to another. Charge in the mess or your cabin."],
            ["single", "A supplier emails new bank details for an invoice you're about to pay. What must happen?", ["Pay — the email came from their usual address", "*Phone the supplier on a number you already have to confirm before anything is paid", "Reply to the email to confirm", "Pay half now and half later"], "Bank-detail change fraud is one of the most expensive scams in yachting. Their email may have been hacked, so the check must be by phone."],
            ["single", "Why are guest Wi-Fi, crew Wi-Fi, business and bridge networks kept separate?", ["To make the internet faster", "*So malware on one network can't reach the others — especially navigation and engines", "Because the IMO bans Wi-Fi on the bridge", "So guests can't see crew social media"], "Segregation, with firewalls in between, is a core control in Cyber Essentials and the IMO / BIMCO guidance."],
            ["truefalse", "If you make a mistake — like typing your password into a fake page — the best thing is to report it straight away.", true, "Fast reporting limits the damage. There's no blame for reporting."],
            ["single", "The GPS shows the yacht stationary on land while you're clearly under way. What do you do first?", ["Restart the GPS receiver yourself", "Ignore it — the GPS is usually right", "*Cross-check with radar, visual bearings and depth, and tell the OOW / Captain", "Post about it on the crew group chat"], "Never rely on a single source: cross-check, tell the OOW, and follow the ship's procedure."],
            ["multi", "Which of these should never appear in a photo you post online? Choose all that apply.", ["*Your crew pass or boarding pass", "*The ECDIS or a chart with the route", "*Guests on board", "A sunset with nothing else in the picture"], "Passes, navigation screens and guests all give away information criminals can use."],
          ]),
          ack("I have completed this course. I will check unexpected requests another way, protect my logins with strong passphrases and MFA, keep my devices off the ship's systems, share nothing about the yacht or its guests online, and report anything suspicious straight away."),
        ]),
      ]),
    ],
  };
}

/** Swap "@file" references for academy_media ids. Throws if a file is missing. */
export function buildCourse(mediaIds) {
  const c = content();
  for (const s of c.sections) for (const l of s.lessons) for (const b of l.blocks) {
    if (typeof b.mediaId === "string" && b.mediaId.startsWith("@")) {
      const idFor = mediaIds[b.mediaId.slice(1)];
      if (!idFor) throw new Error(`No uploaded file for ${b.mediaId}`);
      b.mediaId = idFor;
    }
  }
  return c;
}

export const MEDIA_FILES = [
  "01-cover.png", "02-five-controls.png", "03-phishing-email.png", "04-gift-card-scam.png", "05-passphrase-mfa.png",
  "06-bridge-usb.png", "07-networks.png", "08-social-post.png", "09-report-it.png", "10-six-habits.png",
  "a1-one-click-whole-ship.mp4", "a2-why-mfa.mp4", "a3-gps-spoofing.mp4",
];
