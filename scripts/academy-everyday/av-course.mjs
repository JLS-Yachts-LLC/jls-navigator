// "AV first-line troubleshooting — guest areas" (curriculum B4). Crew-level steps only:
// the panel, the TV, restarting a single source. Anything in the rack is the ETO's.
import { reading, image, video, ack, quiz, hotspot, match, order, sort, lesson, section } from "../academy-cyber/course.mjs";
import { PANEL_SPOTS, REMOTE_SPOTS } from "./av-art.mjs";

export const AV = {
  title: "AV first-line troubleshooting — guest areas",
  category: "AV and IT",
  minutes: 30,
  passMark: 80,
  refreshMonths: 24,
  summary:
    "Fix the everyday AV problems guests notice — no picture, wrong channel, no sound, a frozen Apple TV or music in the wrong room — quickly and safely, using the touch panel, the remote and the \"reboot ladder\". And know exactly when to stop and call the ETO.",
  files: ["av1-signal-path.png", "av2-touch-panel.png", "av3-remote.png", "av4-reboot-ladder.png", "av5-where-the-picture-goes.mp4"],
  content: () => ({
    sections: [
      section("How it works", [
        lesson("From the rack to the cabin TV", [
          reading(`
            On a yacht, the TV in a cabin or the saloon usually isn't connected to anything in the room. Everything lives in the **AV rack** — a cupboard of equipment the ETO looks after:

            - the **sources**: Apple TV, the movie server (often Kaleidescape), satellite TV boxes, the music streamer (often Sonos);
            - the **matrix**, which sends any source to any room;
            - the **control processor** (Crestron, Savant, Control4 or similar), the brain that turns things on and off when you press the touch panel.

            The picture travels from the rack down a network cable (called **HDBaseT**) to a small **receiver** behind the TV.

            That's why the TV's own remote often makes things worse: the touch panel or the yacht's remote is in charge. **Always start from the panel.**
          `),
          image("av1-signal-path.png", "From the rack to the cabin TV"),
          video("av5-where-the-picture-goes.mp4", "Animation: where the picture goes — and where it gets stuck"),
          quiz("How it works", [
            ["single", "Where is the Apple TV that plays in the master cabin, usually?", ["Behind the cabin TV", "*In the AV rack, sent to the cabin through the matrix", "In the guest's luggage", "In the wheelhouse"], "Sources sit in the rack. The matrix sends them to whichever room asks for them."],
            ["truefalse", "The TV's own remote is the best way to change what's on a cabin TV.", false, "The touch panel or the yacht's remote tells the control processor what to do. Using the TV remote can put the TV on the wrong input."],
          ]),
        ]),
      ]),

      section("The touch panel and remote", [
        lesson("Using the touch panel", [
          reading(`
            Every guest area has a **touch panel** on the wall or a handheld remote / tablet. They look different from yacht to yacht, but they all do the same few things:

            - **Room** — which room you're controlling. The most common "fault" is a panel controlling a different room.
            - **Sources** — Apple TV, Movies, TV, Music. Pressing one turns the system on and sends that source to the room.
            - **Volume and mute** — the panel's volume, not the TV's.
            - **Room off** — turns the room's AV off properly, in the right order.
            - Often **Lights** and **Blinds** too.

            If a guest says "the TV doesn't work", look at the panel first: right room? right source? volume up and not muted?
          `),
          image("av2-touch-panel.png", "A typical touch panel"),
          hotspot("Watch Apple TV", "A guest wants to watch Apple TV in this room. Tap what you'd press.", "av2-touch-panel.png", PANEL_SPOTS.appletv),
          hotspot("Everything off", "Turn all the AV in this room off, the proper way. Tap it.", "av2-touch-panel.png", PANEL_SPOTS.roomoff),
          hotspot("Wrong room?", "The panel is showing another room's controls. Tap where you'd change it.", "av2-touch-panel.png", PANEL_SPOTS.rooms),
        ]),
      ]),

      section("The reboot ladder", [
        lesson("Start at the bottom, stop when it works", [
          reading(`
            Most AV problems are fixed by the first two steps. Work up the ladder one step at a time and **stop as soon as it works**:

            1. **Check the panel.** Right room, right source, volume up, not muted.
            2. **Room off, then on.** Press *Room off* on the panel, wait about **30 seconds**, then choose the source again. This resets the TV, the input and the audio in the right order.
            3. **Restart the source** — only the one that's stuck. For an Apple TV, restart it from its own menu or remote (next lesson). Not the TV, not the rack.
            4. **Call the ETO** — with the room, the source, what you see or hear, and what you've already tried.

            **Never** unplug or switch off anything in the AV rack, the control processor, network switches, or the receiver box behind a TV. Restarting the wrong box can take down every room on the yacht, and some take ten minutes to come back.
          `),
          image("av4-reboot-ladder.png", "The reboot ladder"),
          order("Climb the ladder", "Put the steps in the right order.", [
            "Check the room, source, volume and mute on the panel",
            "Room off on the panel, wait 30 seconds, choose the source again",
            "Restart only the source that's stuck",
            "Call the ETO with the room, source and what you've tried",
          ]),
          sort("Who does it?", "Who should do each of these?", ["Interior crew can do it", "ETO only"], [
            ["Press Room off and back on from the touch panel", 0],
            ["Restart the Apple TV from its Settings menu", 0],
            ["Re-select the room on the touch panel", 0],
            ["Unplug the matrix in the AV rack", 1],
            ["Reboot the control processor", 1],
            ["Power-cycle the network switch in the rack", 1],
            ["Re-plug the box behind the TV", 1],
          ]),
        ]),
      ]),

      section("Common fixes", [
        lesson("TV, Apple TV, movies and music", [
          reading(`
            ### "No signal" or the wrong picture
            The TV is on but showing "No signal", a black screen or another input. It's almost always the input or the routing, not the TV. Use the panel: **choose the source again**; if that doesn't do it, **Room off, wait, on**. Avoid the TV's own *Input/Source* button unless the ETO has shown you which input that TV uses.

            ### Apple TV frozen or an app won't load
            First go back to the Home screen and try again. If the Apple TV itself is stuck, **restart it**: on the Apple TV, *Settings → System → Restart*; or on the Siri Remote, **press and hold Back and the TV / Control Centre button together** until the light on the Apple TV flashes, then let go. Apps that need the internet won't work if the yacht's internet is down — check another device.

            ### Movies (Kaleidescape or similar)
            Use the panel's *Movies* source and the yacht's remote. If a film won't start or the menu is frozen, try Room off/on. The movie server is in the rack — **ETO only** for anything beyond that.

            ### Music in the wrong room, or no music
            Music systems (often Sonos) group rooms together. Check in the panel or the app which rooms are grouped, and **ungroup or regroup** them there. A portable speaker in a cabin can be switched off and on; speakers driven from the rack can't — that's the ETO.

            ### Sound but no picture, or picture but no sound
            Check the panel's volume and mute first. Then Room off/on. If a soundbar or amplifier is involved, it's usually controlled by the panel too — don't use its own buttons.
          `),
          image("av3-remote.png", "Restarting an Apple TV from the remote"),
          hotspot("Restart the Apple TV", "To restart, you hold Back and one other button together. Tap the other button.", "av3-remote.png", REMOTE_SPOTS.tv),
          match("First step", "Match each problem with the best first step.", [
            ["Cabin TV shows \"No signal\"", "Choose the source again on the panel"],
            ["Netflix frozen on the Apple TV", "Back to Home, then restart the Apple TV"],
            ["Music playing in the wrong cabin", "Ungroup the rooms in the panel or music app"],
            ["Nothing happens when you press the panel", "Check the panel is controlling the right room"],
            ["Every room has lost its picture", "Call the ETO straight away"],
          ]),
        ]),
      ]),

      section("Calling the ETO", [
        lesson("A good call-out", [
          reading(`
            When the ladder doesn't fix it, call the ETO (or the AV/IT officer) — and give them what they need to fix it fast, often without walking to the room first:

            - **Where:** which room or area.
            - **What:** which source (Apple TV, Movies, TV, Music) and exactly what you see or hear — "No signal", a frozen logo, sound but no picture, an error message (take a photo).
            - **What you tried:** "Room off and on twice, restarted the Apple TV."
            - **Who's affected:** one cabin, or the whole yacht? Are guests waiting?

            If **every room** has lost picture or sound, or the touch panels all stopped responding at once, don't try anything — that's the rack, the network or the control processor. Call the ETO straight away.
          `),
          quiz("Final check", [
            ["single", "A guest says the saloon TV has no picture. What's the first thing you check?", ["The cables behind the TV", "*The touch panel: right room, right source, volume and mute", "The AV rack", "Whether the Wi-Fi is working"], "Start at the bottom of the ladder: most problems are the panel controlling another room or the wrong source."],
            ["single", "Room off and on didn't fix a frozen Apple TV in the master cabin. What next?", ["Unplug the Apple TV in the rack", "Turn the cabin TV off at the wall", "*Restart the Apple TV from its menu or by holding Back + TV on the remote", "Reboot the control processor"], "Restart only the stuck source — from the device's own menu or remote, never by unplugging things in the rack."],
            ["truefalse", "It's fine to switch the AV rack off and on if several rooms have problems.", false, "Never. Several rooms failing at once is a job for the ETO — restarting the rack can take everything down for a long time."],
            ["multi", "What should you tell the ETO when you call? Choose all that apply.", ["*Which room", "*Which source and what you see or hear", "*What you've already tried", "The guest's cabin number for room service"], "Room, source, symptom and what you've tried — that's usually enough for the ETO to know where to look."],
          ]),
          ack("I will use the touch panel and the reboot ladder for guest AV problems, restart only the source that's stuck, never touch the AV rack, and call the ETO with the room, source, symptom and what I've tried."),
        ]),
      ]),
    ],
  }),
};
