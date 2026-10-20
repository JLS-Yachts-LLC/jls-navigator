// Curriculum B3 (guest Wi-Fi and guest devices), B5 (printers and scanning) and B6 (phones on board).
import { reading, image, ack, quiz, hotspot, match, order, sort, lesson, section } from "../academy-cyber/course.mjs";
import { WIFI_SPOTS, NOINTERNET_SPOTS, AIRPLAY_SPOTS, PRINTER_SPOTS, PHONE_SPOTS } from "./services-art.mjs";

export const GUESTWIFI = {
  title: "Guest Wi-Fi and guest devices — first-line help",
  category: "AV and IT",
  minutes: 25,
  passMark: 80,
  refreshMonths: 24,
  summary:
    "Help guests get online and cast to their cabin TV quickly and discreetly: the guest network and its welcome page, telling a Wi-Fi problem from an internet problem, casting to the right room, guests' privacy, and when to hand over to the ETO.",
  files: ["g1-guest-network.png", "g2-wifi-list.png", "g3-no-internet.png", "g4-airplay.png"],
  content: () => ({
    sections: [
      section("The guest network", [
        lesson("What guests can reach", [
          reading(`
            Guests have their **own Wi-Fi network**, separate from crew Wi-Fi, the office and the bridge and engine systems. From it they can reach:

            - **the internet**, through the yacht's Starlink, VSAT or 4G;
            - on many yachts, **the Apple TV in their own cabin or the saloon**, so they can cast from their phone.

            They can't reach crew devices, the office PCs, the printers or anything technical — on purpose. That protects the yacht and the guests.

            Some yachts show a **welcome page** the first time a device joins (like a hotel): the guest accepts the terms, sometimes enters a code from the cabin card. If a guest "has Wi-Fi but nothing loads", the welcome page may be waiting behind the scenes — open a web browser and it usually appears.

            **Never** give a guest the crew Wi-Fi password, even if theirs "isn't working". Fix the guest connection or call the ETO.
          `),
          image("g1-guest-network.png", "What guests can — and can't — reach"),
          hotspot("Which network?", "A guest asks which Wi-Fi to join. Tap it.", "g2-wifi-list.png", WIFI_SPOTS.guest),
        ]),
      ]),

      section("Getting a guest online", [
        lesson("The guest-device checklist", [
          reading(`
            Work through this calmly — and **let the guest hold their own device** where you can. Never ask for their passcode or their account passwords.

            1. **Is Wi-Fi on, and is it the guest network?** Phones often re-join the marina Wi-Fi or another known network.
            2. **Forget and re-join.** Tap the network name → *Forget*, then join again with the guest password from the cabin card.
            3. **Welcome page.** Open a browser (Safari / Chrome) and visit any website — accept the page if it appears.
            4. **Wi-Fi or internet?** If the phone shows *Connected* or full bars but *No Internet Connection*, the Wi-Fi is fine — **the yacht's internet is down or slow**. Check another device; if it's everyone, tell the ETO / bridge and let guests know politely.
            5. **Still nothing?** Call the ETO with the guest's cabin, the device type (iPhone, Android, laptop), and what you've tried.

            **VPNs and private relay:** some guests' work laptops use a VPN that struggles on satellite links. Suggest they try their phone; leave VPN settings to the guest and the ETO.
          `),
          order("Get the guest online", "Put the checklist in order.", [
            "Check Wi-Fi is on and it's the guest network",
            "Forget the network and re-join with the cabin card password",
            "Open a browser and accept the welcome page",
            "Check whether it's the Wi-Fi or the yacht's internet",
            "Call the ETO with the cabin, device and what you've tried",
          ]),
          hotspot("Wi-Fi or internet?", "The guest says \"the Wi-Fi is broken\". Tap what shows it's actually the internet.", "g3-no-internet.png", NOINTERNET_SPOTS.sign),
        ]),
      ]),

      section("Casting and privacy", [
        lesson("Casting to the cabin TV — the right one", [
          reading(`
            On yachts set up for it, guests can show their phone or laptop on their cabin TV with **AirPlay / Screen Mirroring** (iPhone, iPad, Mac) — sometimes Chromecast for Android.

            1. Turn the cabin TV on from the **touch panel** and choose **Apple TV** as the source.
            2. On the phone: **Control Centre → Screen Mirroring** (or the AirPlay icon in an app).
            3. Choose **this room's Apple TV** — read the name carefully. Every Apple TV on board may appear in the list.

            **Choosing the wrong room shows the guest's screen on someone else's TV** — photos, messages, a business presentation. Always check the name before you tap, and stop mirroring when you leave.

            **Guests' privacy, always:**

            - Don't read their screen or messages, and look away when they type a passcode.
            - Don't install apps or change settings on a guest device without them watching and agreeing.
            - Never connect a guest's device to the crew network, and never plug guest USB sticks into the yacht's systems.
            - Anything you see stays private — the same as the rest of your confidentiality agreement.
          `),
          hotspot("Cast to the right room", "You're helping a guest in Guest Cabin 3. Tap the right Apple TV.", "g4-airplay.png", AIRPLAY_SPOTS.cabin3),
          sort("You or the ETO?", "Who should handle each of these?", ["Interior crew can do it", "Call the ETO"], [
            ["Help a guest join the guest Wi-Fi", 0],
            ["Show a guest how to mirror to their cabin Apple TV", 0],
            ["Everyone on board has lost the internet", 1],
            ["A guest's laptop VPN won't connect", 1],
            ["Forget and re-join the guest network on a phone", 0],
            ["The guest network doesn't appear at all", 1],
          ]),
          match("Symptom → likely cause", "Match each symptom with its likely cause.", [
            ["Full Wi-Fi bars but \"No Internet Connection\"", "The yacht's internet is down or slow"],
            ["Connected but every website shows a login page", "The guest welcome page needs accepting"],
            ["Phone keeps joining the marina network", "It remembers an old network — forget it"],
            ["Guest's photos appeared on the saloon TV", "Mirrored to the wrong Apple TV"],
          ]),
        ]),
      ]),

      section("Final check", [
        lesson("Final check", [
          quiz("Final quiz", [
            ["single", "A guest's phone says it's on the guest Wi-Fi but nothing loads. What do you try first?", ["Give them the crew Wi-Fi password", "*Open a browser to see if the welcome page needs accepting", "Restart the yacht's router", "Tell them the internet is down"], "A pending welcome page is the most common cause. Never hand out the crew password."],
            ["truefalse", "If the guest Wi-Fi isn't working, it's fine to let the guest use the crew Wi-Fi just for tonight.", false, "Guests stay on the guest network — it keeps them, and the yacht's systems, safe."],
            ["single", "Before tapping an Apple TV in the Screen Mirroring list, what must you check?", ["That it's the newest model", "*That it's the Apple TV in the guest's own room", "That the volume is up", "That the guest has an Apple account"], "Every Apple TV can appear in the list — the wrong one shows the guest's screen in another room."],
          ]),
          ack("I will help guests on the guest network only, check the room before casting, respect guests' privacy on their devices, and call the ETO when it's the yacht's internet or the network itself."),
        ]),
      ]),
    ],
  }),
};

export const PRINTING = {
  title: "Printers and scanning",
  category: "AV and IT",
  minutes: 15,
  passMark: 80,
  refreshMonths: 24,
  summary:
    "Print and scan on board without wasting time or leaving confidential paperwork lying around: printing from ship's laptops and phones, guest and crew documents, scanning to email, clearing a jam safely, and when to leave it to the ETO.",
  files: ["p1-printer.png"],
  content: () => ({
    sections: [
      section("Printing on board", [
        lesson("Printing and scanning", [
          reading(`
            **Ship's laptops** already have the office printer set up. **Phones and tablets** can usually print with AirPrint (iPhone) or the printer's app — but only on the network the printer is on, which is often the **office network**, not crew Wi-Fi. Ask your HoD or the ETO how it's done on your yacht.

            **Confidential paperwork** — guest lists, preference sheets, passports, crew contracts, medical forms:

            - Walk to the printer **straight away**. If the printer has a PIN or "secure print", use it.
            - Never leave papers in the tray, on top of the printer or in the recycling — **shred** what you don't need.
            - Don't print guest documents to a printer in a crew or public area.

            **Scanning:** most printers scan to **email** or to a **shared folder**. Scan to your work address, not personal email, and delete scans from the printer's memory if it keeps them.

            **Save paper and toner** — many yachts print a lot during charters. Print double-sided, and only what you need.
          `),
          sort("Leave it — or collect it now?", "What should you do with each printout?", ["Collect and file / shred straight away", "Fine to collect later"], [
            ["The charter guest list", 0],
            ["A crew member's passport copy", 0],
            ["Tomorrow's public menu for the dining table", 1],
            ["A guest's allergy and medical notes", 0],
            ["A deck cleaning checklist", 1],
          ]),
        ]),
        lesson("Clearing a jam safely", [
          reading(`
            Paper jams are the most common printer problem — and the easiest to make worse.

            1. **Read the printer's screen.** It usually tells you exactly which door or tray to open.
            2. **Open only that door or tray.** Some parts inside get **hot** — don't touch metal rollers or the fuser.
            3. **Pull the paper out slowly**, in the direction it travels, with both hands. Torn bits left inside cause the next jam.
            4. **Close everything** and let the printer restart the job.
            5. **Still jammed, an error code, or a torn piece you can't reach?** Stop and call the ETO — don't use tools, and don't take covers off.

            **Toner or ink empty?** Swap it only if your yacht keeps spares and you've been shown how. Note it in the stores list so it's re-ordered.
          `),
          image("p1-printer.png", "Read the screen before you open anything"),
          hotspot("Where's the jam?", "Tap where you'd go first to clear this jam.", "p1-printer.png", PRINTER_SPOTS.doorA),
          order("Clear a jam", "Put the steps in order.", [
            "Read the message on the printer's screen",
            "Open only the door or tray it names",
            "Pull the paper out slowly in the direction it travels",
            "Close everything and let the job restart",
            "If it's still jammed, call the ETO",
          ]),
          quiz("Final check", [
            ["truefalse", "If a jam won't clear, it's fine to remove the printer's side cover with a screwdriver.", false, "Stop and call the ETO. Taking covers off can damage the printer and some parts are hot."],
            ["single", "You've printed the guest preference sheets. When do you collect them?", ["At the end of your shift", "*Straight away", "When the Chief Stew asks", "It doesn't matter — the printer is in the office"], "Confidential paperwork is collected immediately, and never left in the tray."],
          ]),
          ack("I will collect confidential printouts straight away and shred what isn't needed, clear jams only as the printer's screen tells me, and call the ETO for anything more."),
        ]),
      ]),
    ],
  }),
};

export const PHONES = {
  title: "Phones on board — handsets, satphone and crew calling",
  category: "AV and IT",
  minutes: 15,
  passMark: 80,
  refreshMonths: 24,
  summary:
    "Use the yacht's phones properly: transferring and holding calls on the desk handsets, keeping guests' presence private, calling home over the crew Wi-Fi, the satphone for when the internet is down, and why the GMDSS radio equipment is for the bridge only.",
  files: ["ph1-desk-phone.png", "ph2-satphone-gmdss.png"],
  content: () => ({
    sections: [
      section("Handsets and calls", [
        lesson("The desk and cabin handsets", [
          reading(`
            Most yachts have an internal phone system: handsets on the bridge, in the galley, the crew mess, the cabins and the guest areas, each with an **extension number**. The list is usually by each handset or in the crew mess.

            - **Answering:** say the area and your name — *"Galley, Sam speaking."* In guest areas, a warm, simple greeting.
            - **Hold:** press **Hold**; press the flashing line to pick up again.
            - **Transfer:** press **Transfer**, dial the extension, and either hang up straight away (blind transfer) or wait to announce the caller, then hang up.
            - **Voicemail:** press **Voicemail** (or dial the voicemail number) when the screen says you have a message.

            Handsets differ between makes — the yacht's phone guide or the ETO will show you yours.

            **Guests' privacy on the phone.** Never confirm to an outside caller that a guest or the owner is on board, where the yacht is, or when guests arrive — even if the caller sounds official. Take a message and pass it to the Captain or Chief Stew.
          `),
          image("ph1-desk-phone.png", "The desk handset"),
          hotspot("Pass the call on", "A call for the Captain came to the galley. Tap the key you press first to send it to the Captain's extension.", "ph1-desk-phone.png", PHONE_SPOTS.transfer),
          quiz("Calls", [
            ["single", "An outside caller says they're a journalist and asks if the owner is on board this week. What do you say?", ["\"Yes, until Friday\"", "\"No, they're not\"", "*\"I can't help with that — can I take your name and number for the Captain?\"", "Hang up straight away"], "Never confirm or deny who's on board. Take a message and pass it on."],
          ]),
        ]),
      ]),

      section("Calling home and when the internet is down", [
        lesson("Crew calling, satphone and GMDSS", [
          reading(`
            **Calling home.** Most crew call friends and family with WhatsApp, FaceTime or similar **over the crew Wi-Fi**. On a busy satellite link, voice calls work better than video — turn the camera off if the call keeps freezing.

            **The satellite phone** works when Starlink, VSAT and 4G don't. It's for the ship's business and emergencies — not personal calls — and it's expensive per minute. It needs the antenna up and a clear view of the sky, outside. Know where it's kept, keep it charged, and follow the dialling instructions on its label.

            **GMDSS equipment** — the VHF / MF / HF DSC radios, satellite distress terminals and EPIRBs — is the yacht's safety and distress radio system, operated by the **certified officers on the bridge**. Never press a red **DISTRESS** button or test an EPIRB: a false alert starts a real search and rescue. If you set one off by accident, **tell the Officer of the Watch immediately** so they can cancel it properly.
          `),
          image("ph2-satphone-gmdss.png", "Satphone and GMDSS"),
          match("Which one?", "Match each situation with the right phone or radio.", [
            ["A video call home on your evening off", "WhatsApp or FaceTime over crew Wi-Fi"],
            ["Starlink, VSAT and 4G are all down and the office must be told", "The satellite phone"],
            ["A man overboard / distress situation", "GMDSS — the bridge officers"],
            ["Pass a guest's request from the saloon to the galley", "The internal handset (extension)"],
          ]),
          quiz("Final check", [
            ["truefalse", "If you accidentally press a distress button, the best thing is to say nothing and hope it didn't send.", false, "Tell the Officer of the Watch straight away — false alerts must be cancelled properly."],
            ["single", "When should you use the satellite phone for personal calls?", ["Whenever the Wi-Fi is slow", "On your birthday", "*Not at all — only for ship's business and emergencies", "At night when it's cheaper"], "It's for the ship's business and emergencies. Personal calls go over the crew Wi-Fi."],
          ]),
          ack("I will use the handsets properly and never confirm guests' details to callers, call home over the crew Wi-Fi, use the satphone only for ship's business and emergencies, and never touch the GMDSS distress equipment."),
        ]),
      ]),
    ],
  }),
};
