// "Microsoft 365 essentials" (curriculum B2) and "Crew IT on board" (B1, induction).
import { reading, image, video, ack, quiz, hotspot, match, order, sort, lesson, section } from "../academy-cyber/course.mjs";
import { SYNC_SPOTS, SHARE_SPOTS } from "./m365-art.mjs";
import { TICKET_SPOTS } from "./crewit-art.mjs";

export const M365 = {
  title: "Microsoft 365 essentials — sign-in, Outlook, Teams and OneDrive",
  category: "AV and IT",
  minutes: 35,
  passMark: 80,
  refreshMonths: 24,
  summary:
    "Everyday Microsoft 365 for crew with a work account: setting up the Authenticator app and signing in safely, Outlook and shared mailboxes, Teams chats and channels, saving and sharing files with OneDrive and SharePoint, and fixing the common sync problems — all with the satellite link in mind.",
  // a2-why-mfa.mp4 is the animation made for the cyber course, uploaded again for this course.
  files: ["m1-number-match.png", "m2-sync-icons.png", "m3-share-dialog.png", "m4-which-app.png", "a2-why-mfa.mp4"],
  content: () => ({
    sections: [
      section("Signing in safely", [
        lesson("The Authenticator app and number matching", [
          reading(`
            Your work account is protected by **two-step sign-in (MFA)**: your password, plus a check on your phone with the **Microsoft Authenticator** app.

            **Setting it up** (IT may do this with you on your first day):

            1. Install **Microsoft Authenticator** on your phone from the App Store or Google Play.
            2. On a computer, go to **aka.ms/mfasetup** and sign in with your work account.
            3. Choose **Add sign-in method → Authenticator app**, and follow the steps.
            4. In the app, tap **+ → Work or school account → Scan QR code**, and scan the code on the screen.
            5. Approve the test request. Done.

            **Signing in.** When you sign in, the computer shows a **number**. The app asks you to type it in. That's *number matching* — it proves the request is yours.

            - **No number in front of you? You didn't start it.** Tap **"No, it's not me"** and tell IT — someone has your password.
            - Never read a code or number to anyone over the phone or in a message. Nobody genuine will ask.
            - **New phone?** Set Authenticator up on the new one *before* you wipe or hand in the old one — or ask IT to help. Otherwise you'll be locked out at sea.
          `),
          image("m1-number-match.png", "Number matching: type the number you see"),
          video("a2-why-mfa.mp4", "Animation: why two-step sign-in (MFA) matters"),
          order("Set up Authenticator", "Put the set-up steps in order.", [
            "Install Microsoft Authenticator on your phone",
            "Go to aka.ms/mfasetup on a computer and sign in",
            "Add sign-in method → Authenticator app",
            "Scan the QR code with the app",
            "Approve the test request",
          ]),
          quiz("Signing in", [
            ["single", "At 02:00 your phone asks you to enter a number to sign in. You're in bed. What do you do?", ["Type any number to make it stop", "Ignore it", "*Tap \"No, it's not me\" and tell IT in the morning (or now, if it keeps happening)", "Turn off notifications"], "You didn't start it, so someone else has your password. Deny it and report it so IT can change the password."],
            ["truefalse", "You should move Authenticator to a new phone before getting rid of the old one.", true, "Otherwise you'll have no way to approve sign-ins — and getting unlocked from a yacht at sea is slow."],
          ]),
        ]),
      ]),

      section("Outlook", [
        lesson("Email that works at sea", [
          reading(`
            **Shared mailboxes.** Many yachts use shared addresses — *interior@*, *chiefstew@*, *captain@* — so emails don't get lost at crew change. They appear in Outlook under your own mailbox. Reply **from the shared address** (choose it in the *From* box) so the conversation stays with the role, not with you.

            **Links, not attachments.** A 25 MB attachment can tie up the satellite link for everyone. Save the file in OneDrive or SharePoint and **share a link** instead — the person always sees the latest version too.

            **Calendars.** Share your calendar with your HoD rather than sending it as a picture. Shared calendars (e.g. the charter or maintenance calendar) appear under *Other calendars*.

            **Out of office.** Set it when you go on leave — say who to contact instead (a role or shared mailbox, not a personal mobile).

            **Suspicious email?** Use Outlook's **Report** button (or ask IT which one to use) rather than forwarding it around. Then delete it.
          `),
          match("Which way?", "Match each job with the best way to do it.", [
            ["Send the 40 MB charter photo album to the office", "Share a OneDrive link"],
            ["Answer a supplier who emailed interior@", "Reply from the shared mailbox"],
            ["A strange invoice email arrives", "Use the Report button, then delete it"],
            ["Going on leave for six weeks", "Set an out-of-office pointing to a role"],
          ]),
        ]),
      ]),

      section("Teams", [
        lesson("Chats, channels and calls", [
          reading(`
            - **Chat** — one person or a small group, for quick questions. Like messaging, but it stays in the company.
            - **Channels** — a team's conversations by topic (e.g. *Interior → Provisioning*). Everyone in the team can see them, so knowledge isn't lost at crew change. Use **@name** to get someone's attention.
            - **Files** in a channel live in **SharePoint** — they're shared with the whole team.

            **Calls on a satellite link.** Teams works over Starlink and 4G. On a weak link, **turn your camera off** — audio uses a fraction of the data. Use headphones in shared spaces. Close Teams on a second device you're not using; it keeps syncing.

            Teams is for work. Guest names, preferences and plans are confidential — keep them in the right channel, never in personal messaging apps.
          `),
          image("m4-which-app.png", "Which app for what"),
          sort("Where does it go?", "Put each item where it belongs.", ["Teams chat", "Teams channel", "Outlook email"], [
            ["\"Can you cover my watch at 14:00?\" to one crewmate", 0],
            ["Updated provisioning list for the whole interior team", 1],
            ["Order confirmation to an outside supplier", 2],
            ["Reply to a guest's charter broker", 2],
            ["Weekly deck maintenance notes for the deck team", 1],
            ["Quick question to your HoD", 0],
          ]),
        ]),
      ]),

      section("OneDrive and SharePoint", [
        lesson("Saving, sharing and syncing", [
          reading(`
            **Save to OneDrive, not just the laptop.** Files saved only on a laptop are lost if it's stolen, dropped overboard or replaced. OneDrive keeps them in the cloud and on the laptop. Shared department files go in **SharePoint** (the *Files* tab of a Teams channel).

            **The sync icons** next to each file tell you where it is:

            - **Cloud** — online only; it downloads when you open it (needs internet).
            - **Green tick (outline)** — on this device.
            - **Green tick (solid)** — always kept on this device, even offline. Right-click → *Always keep on this device* for files you need at sea.
            - **Blue arrows** — syncing.
            - **Red X** — it **can't sync** and needs attention.

            **Fixing a red X.** Click the OneDrive cloud icon by the clock to see why. Common causes: you're signed out, the laptop is out of space, the file is open somewhere else, or a file name has characters OneDrive won't accept. Fix the cause, or *Pause* and *Resume* syncing. Still stuck? Tell IT — and **don't delete and re-create** the folder.

            **Sharing.** Share with **specific people** — not *Anyone with the link*, which works for whoever the link is forwarded to. Guest information never goes in an *Anyone* link.
          `),
          image("m2-sync-icons.png", "OneDrive sync icons"),
          hotspot("Needs attention", "One of these files hasn't been saved to the cloud. Tap it.", "m2-sync-icons.png", SYNC_SPOTS.error),
          hotspot("Share it safely", "You're sending the provisioning list to the yacht's agent. Tap the safest sharing option.", "m3-share-dialog.png", SHARE_SPOTS.specific),
          quiz("Files", [
            ["single", "You need the guest preference sheet during a passage with no internet. What do you do before leaving port?", ["Email it to yourself", "*Set it to \"Always keep on this device\" in OneDrive", "Print it and delete it", "Copy it to a USB stick"], "\"Always keep on this device\" keeps it available offline and still syncs changes when you're back online."],
            ["truefalse", "\"Anyone with the link\" is fine for guest information as long as you only send it to one person.", false, "Links get forwarded. Use \"Specific people\" for anything confidential."],
          ]),
        ]),
      ]),

      section("Final check", [
        lesson("Final check", [
          quiz("Final quiz", [
            ["single", "Where should you save the interior team's shared inventory spreadsheet?", ["On your laptop's desktop", "*In the interior team's SharePoint / Teams channel files", "In your personal email", "On a USB stick in the pantry"], "Shared files go where the whole team can reach them — and where they survive crew changes."],
            ["single", "A Teams call keeps breaking up on the satellite link. What helps most?", ["Turn on HD video", "*Turn your camera off", "Call on WhatsApp instead", "Restart the router"], "Video uses far more data than audio — switching it off usually fixes it."],
            ["single", "Your phone asks for a sign-in number but you're not signing in to anything. What does it mean?", ["Microsoft is testing your phone", "*Someone has your password and is trying to sign in", "Your Authenticator app needs updating", "Nothing — it happens at random"], "Deny it and tell IT: the password needs changing."],
            ["truefalse", "To send a big file to the office, share a OneDrive link instead of attaching it.", true, "It saves the satellite link for everyone and the office always gets the latest version."],
          ]),
          ack("I will keep my sign-in safe with the Authenticator app, deny any request I didn't start, save work files in OneDrive or SharePoint, share with specific people, and send links instead of big attachments."),
        ]),
      ]),
    ],
  }),
};

export const CREWIT = {
  title: "Crew IT on board — Wi-Fi, internet and getting help",
  category: "AV and IT",
  minutes: 20,
  passMark: 80,
  refreshMonths: 24,
  summary:
    "The IT induction for every new crew member: which Wi-Fi is yours, sharing the satellite connection fairly, looking after your own devices, and how to ask for help so it gets fixed fast.",
  files: ["i1-which-network.png", "i2-data-use.png", "i3-good-request.png"],
  content: () => ({
    sections: [
      section("Getting connected", [
        lesson("Which Wi-Fi is yours", [
          reading(`
            Welcome aboard. A yacht has several Wi-Fi networks, kept apart on purpose:

            - **Crew Wi-Fi** — yours, for your phone, tablet and laptop. Get the password from the crew mess notice or your Head of Department.
            - **Guest Wi-Fi** — for guests only. Don't join it, and never give a guest the crew password instead.
            - **Ship's office network** — for the ship's laptops, set up by IT. Not for personal devices.
            - **Bridge and engine networks** — navigation and engine systems. Never connect anything personal, and never plug anything into their sockets or USB ports — not even to charge.

            Network names are different on every yacht, so ask if you're not sure which one is the crew network.

            Don't share the crew password with visitors, contractors or friends ashore — the officer in charge can give them guest access if it's allowed.
          `),
          image("i1-which-network.png", "Which network is yours?"),
          sort("Which network?", "Where should each device connect?", ["Crew Wi-Fi", "Guest Wi-Fi", "Don't connect it at all"], [
            ["Your own phone", 0],
            ["Your personal laptop", 0],
            ["A guest's tablet", 1],
            ["A guest's laptop", 1],
            ["Your phone, to charge from the ECDIS USB port", 2],
            ["A contractor's laptop, into a bridge network socket", 2],
          ]),
        ]),
        lesson("Sharing the connection", [
          reading(`
            At sea the yacht's internet comes from **Starlink, VSAT or 4G**, and it's shared by everyone on board — guests, crew and the ship's own systems. During a charter, **guests come first**. Some yachts give crew a data allowance; others ask for fair use.

            **Heavy on the link:** HD and 4K streaming, automatic phone and photo backups, game and app updates, big downloads.

            **Kind to everyone:** download shows and updates in port or overnight, lower the video quality at sea, back up photos in port, close apps you're not using, and ask before a big download.

            **Not allowed** unless the Captain or IT says otherwise: **torrents / file sharing**, and **personal VPNs** (they can break the ship's protections and its data rules).

            Your use of the crew network should follow the yacht's IT and internet rules — ask your HoD for them if you haven't seen them.
          `),
          image("i2-data-use.png", "One connection, shared by everyone on board"),
          quiz("Sharing the connection", [
            ["single", "It's a charter evening and the internet is slow. Which of these should wait until you're in port?", ["Sending a text to a friend", "*Backing up 2,000 photos to the cloud", "Checking the crew rota in Teams", "Reading an email"], "Big backups and downloads eat the shared link. Do them in port or overnight."],
            ["truefalse", "Using a personal VPN on the crew Wi-Fi is fine as long as it's a paid one.", false, "Personal VPNs aren't allowed unless the Captain or IT says so — they bypass the ship's protections."],
          ]),
        ]),
      ]),

      section("Your devices", [
        lesson("Looking after your phone and laptop", [
          reading(`
            - **Lock it**: PIN, fingerprint or face on your phone; a password on your laptop.
            - **Update it**: install updates when asked — in port if they're big.
            - **Only official app stores.** No "free" cracked apps or films — they're a common way malware gets on board.
            - **Charge in the crew mess or your cabin**, never from bridge or engine equipment.
            - **Lost or stolen** with work email on it? Tell your HoD and IT straight away so access can be blocked.
            - **Ship's laptops and phones** belong to the yacht: work only, no personal accounts, handed back at sign-off.

            Take the course **"Cyber security at sea — crew awareness"** too — it covers scams, passwords and USB sticks in more detail.
          `),
        ]),
      ]),

      section("Getting help", [
        lesson("Asking for help so it gets fixed fast", [
          reading(`
            **Who to ask:**

            - **Your Head of Department** — first stop for passwords, which network to use, and anything you're unsure of.
            - **The ETO / AV-IT officer** — Wi-Fi, AV, printers, ship's laptops, anything technical on board.
            - **IT support ashore** — through the yacht's IT request route (your HoD or ETO will show you). They can fix accounts and email remotely.
            - **Something suspicious** — an odd email, a sign-in request you didn't start, a lost phone: tell someone **straight away**. No blame.

            **A good request** says:

            1. **What** — the problem in one line ("Crew Wi-Fi drops every 10 minutes").
            2. **Where** — which room, deck or device.
            3. **When** — since when, and how often.
            4. **What you've tried** — restarted, forgot the network, another device.
            5. **A photo or screenshot** of any error, and how to reach you.

            A request like that can often be fixed without anyone walking to your cabin.
          `),
          hotspot("Which one gets fixed first?", "Two crew members report the same problem. Tap the request IT can act on straight away.", "i3-good-request.png", TICKET_SPOTS.good),
          match("Who to ask", "Match each problem with who to ask first.", [
            ["You don't know the crew Wi-Fi password", "Your Head of Department"],
            ["The crew mess TV has no picture after Room off/on", "The ETO / AV-IT officer"],
            ["You're locked out of your work email", "IT support (via your HoD or ETO)"],
            ["A sign-in request you didn't start", "Tell IT / your HoD straight away"],
          ]),
          order("Raise a good request", "Put the parts of a good request in order.", [
            "What's wrong, in one line",
            "Where — room, deck or device",
            "Since when, and how often",
            "What you've already tried",
            "A photo or screenshot, and how to reach you",
          ]),
          quiz("Final check", [
            ["single", "Which network should your personal phone use?", ["Guest Wi-Fi — it's faster", "*Crew Wi-Fi", "The ship's office network", "Any network with a strong signal"], "The crew network is yours. Guest and office networks are for other people and devices."],
            ["truefalse", "If the internet is slow, it's fine to plug your laptop into a network socket on the bridge.", false, "Never connect anything personal to bridge or engine networks."],
          ]),
          ack("I will use the crew Wi-Fi only, share the connection fairly, keep my devices locked and updated, and ask for help with a clear request — and report anything suspicious straight away."),
        ]),
      ]),
    ],
  }),
};
