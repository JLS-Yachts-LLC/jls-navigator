// "Cisco switch essentials" — JLS library course for ETOs and AV/IT officers, in the
// Crew Academy content shape (src/lib/academy/content.ts).
//
// Scope: Cisco Catalyst access switches on IOS / IOS-XE (Catalyst 9200 / 9300, and the
// older 2960-X family on classic IOS). Commands and output layouts checked against
// Cisco's IOS-XE 17.x command references and configuration guides (interface and
// hardware, VLAN, PoE, port security / err-disable, CDP / LLDP, file system) — see
// the research notes in the shared notes folder for sources and what couldn't be
// confirmed. Example data only: private addresses, RFC 7042 documentation MACs,
// invented names, masked serials.
import { reading, image, video, ack, quiz, hotspot, match, order, sort, lesson, section, makeBuild } from "../blocks.mjs";
import { SPOTS, CAM_MAC } from "./pictures.mjs";

export const COURSE = {
  title: "Cisco switch essentials",
  category: "IT and AV",
  minutes: 60,
  passMark: 80,
  refreshMonths: 24,
  summary:
    "For ETOs and AV/IT officers. Get onto a Cisco Catalyst switch by console or SSH, read the show commands that tell you what's going on, find which port a device is on, restart a camera or Wi-Fi access point safely, and bring back a port the switch has shut down — and know exactly what to leave to IT.",
};

export function content() {
  return {
    sections: [
      section("Before you start", [
        lesson("What a switch does on board", [
          image("c01-cover.png", "Cisco switch essentials"),
          reading(`
            Every cable from a cabin TV, a Wi-Fi access point, a camera, an office PC or a desk phone ends up in a **switch**. Switches live in the racks: usually one main (core) switch in the main rack, and smaller ones on each deck. They are the plumbing of the yacht's network.

            Most yachts JLS and New Horizon look after use **Cisco Catalyst** switches, such as the Catalyst 9200 and 9300, or the older 2960-X. They run Cisco's operating system, **IOS** (on newer switches **IOS-XE**). The commands in this course work on all of them.

            A Catalyst switch does three jobs you'll meet in this course:

            - **Connects devices.** Each port has a light that tells you if something is connected and working.
            - **Keeps networks apart with VLANs.** Guest Wi-Fi, crew Wi-Fi, AV, CCTV and the office share the same cables and switches, but they can't see each other.
            - **Powers devices with PoE (Power over Ethernet).** Wi-Fi access points, cameras and phones get their power down the network cable, so the switch can also switch them off and on.

            ### The rule for this course

            **Look as much as you like. Change only with IT.** The *show* commands are safe: they only read. Anything that changes the switch is done with New Horizon / your IT company on the phone or by agreement, and every change is written in the IT log. A wrong command on the main switch can take the whole yacht offline, guest Wi-Fi and AV included.
          `),
          image("c02-front-panel.png", "A 24-port PoE access switch from the front: copper ports 1–24, four SFP uplinks and the USB console port. The RJ-45 console and MGMT ports are on the back."),
          hotspot("Find the console port", "You need to plug in a console cable. Tap the port it goes into.", "c02-front-panel.png", SPOTS.console),
          hotspot("Find the uplink", "This switch is connected to the main switch through a fibre uplink. Tap the uplink that's in use.", "c02-front-panel.png", SPOTS.uplink),
          quiz("Check your understanding", [
            ["single", "What does PoE mean for a Wi-Fi access point or a camera?", ["It is faster than normal Ethernet", "*It gets its power from the switch, through the network cable", "It connects without a cable", "It is on its own private network"], "Power over Ethernet: one cable carries data and power. That's why the switch can restart these devices."],
            ["truefalse", "The show commands only read information. They don't change the switch.", true, "Exactly. That's why they're the part of the switch you can use freely."],
            ["single", "Guest Wi-Fi, AV and CCTV share the same switches. What keeps them apart?", ["Different cable colours", "*VLANs — separate virtual networks on the same switches", "Each one uses a different switch brand", "Nothing — they're one network"], "VLANs split one set of switches into several separate networks. The firewall controls what may cross between them."],
          ]),
        ]),
        lesson("Getting in: console cable and SSH", [
          image("c03-connect.png", "Two ways in: a console cable straight into the switch, or SSH across the management network"),
          reading(`
            There are two ways to reach the switch's command line.

            **1. Console cable (when the network is down, or for a new switch).** Catalyst 9200 and 9300 switches have two console ports: a **USB mini-B** port on the front (labelled CONSOLE) and an **RJ-45 console** port on the back, next to the MGMT port. Use a USB mini-B cable at the front, or a USB-to-RJ-45 console cable at the back. Only one works at a time: when the USB console is in use, the RJ-45 one is off. (Older 2960-X switches have the RJ-45 console on the front.) The first time you use the USB console, Windows may need Cisco's USB console driver. Then open a terminal program (PuTTY, Tera Term, SecureCRT) on the COM port Windows gives the cable, with these settings:

            | Setting | Value |
            | --- | --- |
            | Speed | 9600 baud |
            | Data bits | 8 |
            | Parity | None |
            | Stop bits | 1 |
            | Flow control | None |

            Press **Enter** a couple of times and the prompt appears.

            **2. SSH (normal day-to-day).** From a laptop on the management network, or on the VPN, connect to the switch's management address, for example \`ssh netadmin@10.10.99.2\` in Windows Terminal, or with PuTTY. The addresses of your yacht's switches are in the network documentation (IT Glue).

            **Your login is yours.** IT gives each person their own username and password. Never share it, never use someone else's, and never write it on the rack door. Everything you do on the switch can be logged against your name.

            **Telnet** is the old, unencrypted way in. It should be switched off on every yacht switch. If a switch only answers on Telnet, tell IT.
          `),
          order("Connecting by console", "Put the steps in the right order.", [
            "Plug the console cable into the switch (USB console at the front, or RJ-45 console at the back) and your laptop",
            "Find the cable's COM port number in Windows Device Manager",
            "Open PuTTY and choose Serial on that COM port at 9600 baud",
            "Press Enter until the switch prompt appears",
            "Log in with your own username and password",
          ]),
          quiz("Getting in", [
            ["single", "The yacht's network is down and you can't reach the switch by SSH. How can you still get onto it?", ["You can't — wait for the network to come back", "*With a console cable into the switch's console port", "By Telnet instead", "By plugging into any free port and browsing to it"], "The console port works even when the network doesn't. It's the way in for emergencies and new switches."],
            ["single", "Your terminal shows nothing but strange characters on the console. What's most likely wrong?", ["The switch is broken", "*The speed setting — it should be 9600 baud, 8 data bits, no parity, 1 stop bit", "The cable is plugged in upside down", "You need to use Telnet"], "Garbled text on a console is almost always the wrong speed (baud rate)."],
            ["truefalse", "It's fine to use the ETO's login on the switch while they're on leave, as long as you're careful.", false, "Always use your own login. If you don't have one, ask IT for one."],
          ]),
        ]),
        lesson("Modes and the prompt", [
          image("c04-modes.png", "The prompt tells you which mode you're in, and what you're able to change"),
          reading(`
            The prompt tells you where you are:

            | Prompt | Mode | What it means |
            | --- | --- | --- |
            | \`SW-CORE-01>\` | User EXEC | A few basic show commands. Nothing can change. |
            | \`SW-CORE-01#\` | Privileged EXEC | All the show commands. Also restart, erase and copy, so careful. |
            | \`SW-CORE-01(config)#\` | Global configuration | Changes the whole switch, **live**. |
            | \`SW-CORE-01(config-if)#\` | Interface configuration | Changes one port, **live**. |

            - \`enable\` takes you from \`>\` to \`#\`. Depending on how IT set your login, you may arrive at \`#\` straight away.
            - \`configure terminal\` (often typed \`conf t\`) goes into configuration mode. **You should only be here when IT has agreed a change with you.**
            - \`exit\` goes back one level, and \`end\` (or **Ctrl+Z**) goes straight back to \`#\`.

            In configuration mode there's no "Are you sure?" and no Undo. A command takes effect the moment you press Enter.

            ### Tricks that make life easier

            - **\`?\` is help.** Type \`show ?\` to see everything you can show, or \`show interfaces ?\` for the next word.
            - **Short forms work** as long as they're not ambiguous: \`sh int status\` is \`show interfaces status\`, \`sh ip int br\` is \`show ip interface brief\`.
            - **Tab** completes a word.
            - **Long output stops at \`--More--\`.** Press Space for the next page, Enter for one more line, or **q** to stop. \`terminal length 0\` turns paging off for your session only, which is handy for copying output into a ticket.
            - **Filter the output** with a pipe: \`show logging | include 1/0/5\` shows only lines containing "1/0/5". \`show running-config | section interface\` shows only the interface sections, and \`| begin\` starts at the first match.
            - **Ctrl+Shift+6** stops a ping or traceroute that's taking too long.
          `),
          match("Which mode?", "Match each prompt with what you can do there.", [
            ["SW-CORE-01>", "A few basic show commands only"],
            ["SW-CORE-01#", "All show commands — and restart, erase, copy"],
            ["SW-CORE-01(config)#", "Change settings for the whole switch"],
            ["SW-CORE-01(config-if)#", "Change settings for one port"],
          ]),
          quiz("Modes", [
            ["single", "You're at SW-CORE-01(config-if)# and want to get straight back to the # prompt. What do you type?", ["exit", "*end", "quit", "logout"], "end (or Ctrl+Z) goes straight back to privileged EXEC. exit only goes up one level."],
            ["single", "A long show command has stopped with --More-- at the bottom. How do you stop the output?", ["Ctrl+C", "*Press q", "Type end", "Close the window"], "Space shows the next page, Enter one more line, q stops."],
            ["truefalse", "In configuration mode, a command only takes effect once you save the configuration.", false, "Commands work immediately on the running switch. Saving only decides whether they survive a restart."],
          ]),
        ]),
      ]),

      section("Looking without touching", [
        lesson("Every port at a glance: show interfaces status", [
          reading(`
            \`show interfaces status\` is the command you'll use most. One line per port:

            - **Port**: \`Gi1/0/5\` means GigabitEthernet, switch 1, module 0, port 5. \`Gi1/1/1\` is port 1 on the uplink module (\`Te\` for 10-gigabit).
            - **Name**: the port description IT has set (for example \`CCTV-AFT-DECK\`). Good descriptions are half the battle.
            - **Status**:
              - \`connected\`: something is plugged in and the link is up.
              - \`notconnect\`: nothing is plugged in, the device is off, or the cable is broken.
              - \`disabled\`: someone has switched the port off on purpose (\`shutdown\`).
              - \`err-disabled\`: **the switch itself shut the port down** because something broke a rule (more on this later).
            - **Vlan**: the VLAN for an access port, or \`trunk\` for a port that carries many VLANs.
            - **Duplex / Speed**: \`a-full\` / \`a-1000\` means it negotiated full duplex at 1000 Mb/s automatically. A device stuck at \`a-100\` or \`a-half\` on a gigabit cable often means a damaged cable or a bad joint.
            - **Type**: the kind of port (copper \`10/100/1000BaseTX\`, or the SFP module fitted).
          `),
          image("t01-interfaces-status.png", "show interfaces status on a deck switch"),
          hotspot("The port the switch shut down", "One camera isn't working. Tap the line that shows why.", "t01-interfaces-status.png", SPOTS.errLine),
          hotspot("The way to the main switch", "Tap the line for this switch's uplink to the main switch.", "t01-interfaces-status.png", SPOTS.trunkUplink),
          quiz("Reading the output", [
            ["single", "Gi1/0/10 (CREW-MESS-SPARE) shows notconnect. What does that tell you?", ["The switch has shut the port down", "IT has switched the port off", "*Nothing is talking on that port — unplugged, switched off, or a broken cable", "The port is on the wrong VLAN"], "notconnect means no link. Check the device is on and the cable is plugged in at both ends."],
            ["single", "Gi1/0/11 shows disabled. What does that mean?", ["*Someone has switched it off on purpose with the shutdown command", "The switch shut it down after a problem", "The port is broken", "It's waiting for a device"], "disabled = administratively shut down. Don't turn it on without asking IT why it's off."],
            ["single", "Which column tells you which network (VLAN) the office printer on Gi1/0/4 is in?", ["Name", "Status", "*Vlan", "Type"], "Gi1/0/4 is in VLAN 10, the business network."],
          ]),
        ]),
        lesson("One port in detail: show interfaces", [
          reading(`
            When one device is misbehaving, look at its port in detail: \`show interfaces gigabitEthernet 1/0/7\` (or \`sh int gi1/0/7\`).

            The lines that matter most:

            - **First line**: \`GigabitEthernet1/0/7 is up, line protocol is up (connected)\` means all is well. \`is down, line protocol is down (notconnect)\` means no link, and \`(err-disabled)\` means the switch has shut it down.
            - **Description**: what's meant to be plugged in.
            - **Duplex and speed**: \`Full-duplex, 1000Mb/s\` is what you want for a modern device.
            - **Input and output rate**: how busy the port is right now (averaged over 5 minutes).
            - **\`input errors, CRC\`**: frames that arrived damaged. A few over months is nothing. A number that keeps **climbing** while you watch points to the **cable, the patch lead or the socket**: a crushed cable, water in a deck socket, a bad termination.
            - **\`output errors\`, \`collisions\`, \`interface resets\`**: rising numbers here also mean trouble. Collisions on a modern network usually point to a duplex mismatch.

            Run the command twice, a minute apart, and compare: what matters is whether the error counters are **going up**, not how big they are. The counters count from the last restart or the last time IT cleared them ("Last clearing of "show interface" counters").
          `),
          image("t02-show-interface.png", "show interfaces for the saloon Apple TV: up, full duplex at 1000 Mb/s, but 1532 CRC errors"),
          quiz("Read the port", [
            ["single", "The Apple TV in the saloon keeps freezing. Its port shows 1532 CRC errors, and the number has gone up by 40 since you looked five minutes ago. What's the most likely cause?", ["The Apple TV needs a software update", "The switch is overloaded", "*A cabling problem — the patch lead, the wall socket or the cable", "The VLAN is wrong"], "Rising CRC errors mean damaged frames on the wire. Try a known-good patch lead first, then tell IT so the cable can be tested."],
            ["single", "What does \"GigabitEthernet1/0/7 is up, line protocol is up (connected)\" mean?", ["The port is switched off", "*The port is working — cable connected and link up", "The port has errors", "The port is a trunk"], "Up/up (connected) is the healthy state."],
            ["truefalse", "A large error count on its own proves there's a problem right now.", false, "Counters add up since the last restart or clear. Compare two readings to see if errors are still happening."],
          ]),
        ]),
        lesson("VLANs and trunks", [
          image("c05-yacht-vlans.png", "An example yacht network: every switch can carry every VLAN, and the firewall decides what can cross between them"),
          reading(`
            A **VLAN** is a separate network running on the same switches. Each has a number and a name. On our example yacht:

            | VLAN | Name | What's on it |
            | --- | --- | --- |
            | 10 | BUSINESS | Office PCs, printers, the NAS |
            | 20 | CREW | Crew Wi-Fi |
            | 30 | GUEST | Guest Wi-Fi |
            | 40 | AV | Apple TVs, Sonos, the AV control system |
            | 50 | CCTV | Cameras and the recorder (NVR) |
            | 60 | VOIP | Desk phones |
            | 99 | MGMT | The switches' and access points' own management addresses |

            Your yacht's numbers will be different: they're in the network documentation.

            Devices in different VLANs can't talk to each other unless the **firewall** allows it. That's how a guest's phone is kept away from the office PCs and the cameras. The bridge and engine-room systems normally have their own separate switches altogether.

            ### Access ports and trunk ports

            - An **access port** belongs to one VLAN. It's for a single device, which doesn't know VLANs exist.
            - A **trunk port** carries many VLANs at once, each frame tagged with its VLAN number (802.1Q). Trunks run between switches, to the firewall, and to Wi-Fi access points (which put crew and guest Wi-Fi on different VLANs).
          `),
          image("c06-access-trunk.png", "An access port carries one VLAN; a trunk carries many, tagged"),
          reading(`
            ### Seeing VLANs and trunks

            - \`show vlan brief\` lists the VLANs and which **access** ports are in each. Trunk ports aren't listed here. VLANs 1002–1005 are old built-in VLANs that every Catalyst lists. Ignore them.
            - \`show interfaces trunk\` lists the trunk ports and which VLANs each one carries.

            If a device is on the wrong VLAN, it gets an address from the wrong network (or none), and can't reach what it should. Moving it to the right VLAN is a change, so it's for IT.
          `),
          image("t03-vlan-brief.png", "show vlan brief: the CCTV VLAN has the two camera ports"),
          image("t04-interfaces-trunk.png", "show interfaces trunk: the uplink carries every VLAN; the access points only crew, guest and management"),
          sort("Which VLAN?", "Using the example yacht's VLAN plan, which VLAN should each device be on?", ["10 BUSINESS", "30 GUEST", "40 AV", "50 CCTV"], [
            ["The Captain's office PC", 0],
            ["A guest's laptop on Wi-Fi", 2 - 1],
            ["The Apple TV in the master cabin", 2],
            ["The aft-deck camera", 3],
            ["The crew office printer", 0],
            ["The Sonos amplifier in the sky lounge", 2],
            ["The NVR that records the cameras", 3],
          ]),
          quiz("VLANs and trunks", [
            ["single", "Look at the show interfaces trunk output. Which VLANs can the Wi-Fi access point on Gi1/0/1 carry?", ["All of them", "*20, 30 and 99 — crew, guest and management", "Only VLAN 1", "10 and 40"], "The 'Vlans allowed on trunk' line for Gi1/0/1 is 20,30,99."],
            ["single", "Why doesn't Gi1/1/1 appear in show vlan brief?", ["It's broken", "*It's a trunk — show vlan brief lists access ports only", "It's in VLAN 1", "It's switched off"], "Trunk ports carry many VLANs, so show vlan brief leaves them out. Use show interfaces trunk."],
            ["truefalse", "You can move a device to another VLAN yourself if you're sure it's on the wrong one.", false, "Changing a port's VLAN moves a device between networks, past the firewall's rules. Agree it with IT first."],
          ]),
        ]),
        lesson("Who is plugged in where: MAC table, CDP and LLDP", [
          reading(`
            Every network device has a **MAC address**, a hardware address printed on its label. Cisco writes it in three groups of four, \`${CAM_MAC}\`. Windows shows the same address as \`00-00-5E-00-53-21\`, and a camera's web page may show \`00:00:5e:00:53:21\`. They're all the same address.

            The switch learns which MAC address is behind which port and keeps a list: the **MAC address table**.

            - \`show mac address-table address ${CAM_MAC}\` finds one device.
            - \`show mac address-table interface gi1/0/6\` shows what's behind one port.
            - \`show mac address-table vlan 50\` lists everything in one VLAN.

            Entries are **dynamic**: the switch forgets a device that has been silent for about five minutes. If a device isn't in the table, make it send something (ping it, or power it up) and look again.

            ### Following the trail

            If the MAC address shows up on an **uplink or trunk** port, the device isn't on this switch: it's further along. Find out what's on the other end of that port with:

            - \`show cdp neighbors\`: Cisco Discovery Protocol, which shows Cisco switches, access points and phones next door, and on which port.
            - \`show lldp neighbors\`: the open standard (LLDP), which also shows other makes, such as a firewall or a non-Cisco access point. On Catalyst 9000 switches LLDP is **off by default**: it only shows anything if IT has switched it on (\`lldp run\`).

            Then log into that switch and look the MAC address up again. Repeat until it shows on a normal access port: that's where the device is plugged in.
          `),
          video("ca1-find-the-port.mp4", "Finding a device's port from its MAC address"),
          image("t05-mac-address-table.png", "The camera's MAC address is behind Gi1/0/24 on the main switch, then on Gi1/0/6 of the deck switch"),
          image("t06-cdp-lldp.png", "CDP shows SW-LOWER-02 on the main switch's Gi1/0/24. LLDP, switched on here by IT, shows the firewall and a non-Cisco access point."),
          order("Find the port", "A camera's MAC address is on its label. Put the steps to find its switch port in order.", [
            "Write down the MAC address from the device's label (or its web page)",
            "On the main switch, run show mac address-table address with that MAC",
            "Note the port it's learned on — here Gi1/0/24",
            "Run show cdp neighbors to see which switch is on the other end of Gi1/0/24",
            "Log into that switch and look the MAC address up again",
            "When it shows on a normal access port, that's the device's port — check its description",
          ]),
          quiz("MAC addresses and neighbours", [
            ["single", "On the main switch, a MAC address shows on Gi1/0/24, which is a trunk to SW-LOWER-02. Where is the device?", ["*On SW-LOWER-02, or further along — look it up again there", "Directly on Gi1/0/24 of the main switch", "On the firewall", "Nowhere — the entry is wrong"], "A MAC address learned on an uplink means the device is beyond it. Follow the trail to the next switch."],
            ["single", "You can't find a printer's MAC address in the table at all. What's the best next step?", ["Restart the switch", "*Make sure the printer is on, ping it or print a test page, then look again", "Clear the whole MAC table", "Give up — it's not on the network"], "The table forgets silent devices after about five minutes. Make the device send something."],
            ["single", "Which command would show you a FortiGate firewall connected to the switch?", ["show cdp neighbors", "*show lldp neighbors — the open standard other makes use (if IT has switched LLDP on)", "show vlan brief", "show version"], "CDP is Cisco's own protocol. Non-Cisco devices appear in LLDP, which is off by default on Catalyst 9000 until IT turns it on."],
          ]),
        ]),
        lesson("PoE, logs and the switch itself", [
          reading(`
            ### PoE: show power inline

            \`show power inline\` shows the PoE budget at the top (how many watts the switch can give, how many are used) and then a line per port:

            - **Admin** \`auto\`: PoE is allowed (the normal setting). \`off\` means IT has turned PoE off on that port.
            - **Oper** \`on\` means the port is powering a device. \`off\` means it isn't, either because nothing needs power or because the port is down. \`faulty\` or \`power-deny\` means trouble: a fault, or not enough budget left.
            - **Power**: watts in use now. **Device** is what the switch thinks is there (\`Ieee PD\` = a standard PoE device, or a Cisco phone or AP by name). **Class** is the PoE class the device asked for.

            If a new camera or access point won't power up, check the budget (\`Remaining\`) as well as the port.

            ### What happened: show logging

            The switch keeps a log of events: links going up and down, ports shut down, PoE problems, who changed the configuration. \`show logging\` shows the whole buffer (newest at the bottom). Filter it to one port with \`show logging | include 1/0/5\`. Messages to know:

            - \`%LINK-3-UPDOWN\` / \`%LINEPROTO-5-UPDOWN\`: a port went up or down.
            - \`%PM-4-ERR_DISABLE\`: the switch shut a port down, and why.
            - \`%PORT_SECURITY-2-PSECURE_VIOLATION\`: an unexpected device was plugged into a protected port.
            - \`%ILPOWER-…\`: PoE events (power granted, denied, removed).
            - \`%SYS-5-CONFIG_I: Configured from console by …\`: someone changed the configuration, and who.

            The log has a limited size and is lost when the switch restarts. Copy what matters into the ticket.

            ### The switch itself

            - \`show version\`: model, software version, serial number, **uptime** and the reason for the last restart (\`Last reload reason\`, for example \`Reload Command\` when someone restarted it). Useful after a power cut, and IT will ask for it.
            - \`show running-config\`: the configuration the switch is using now. \`show running-config interface gi1/0/5\` shows just one port.
            - \`show startup-config\`: the configuration it will load at the next restart. If the two differ, someone has made a change and not saved it.
            - \`show ip interface brief\`: the switch's own IP addresses (usually just the management VLAN).
          `),
          image("t07-power-inline.png", "show power inline: 42.6 W of 370 W in use; the camera port Gi1/0/5 is giving no power"),
          image("t08-logging.png", "The log for Gi1/0/5: a port-security violation, then the switch shut the port down"),
          image("t09-version.png", "show version (the useful lines): up 3 days, and last restarted with the reload command"),
          match("Which command shows it?", "Match what you need to know with the command that shows it.", [
            ["How many watts the cameras and APs are drawing", "show power inline"],
            ["Why a port went down at 06:52 this morning", "show logging"],
            ["When the switch last restarted, and why", "show version"],
            ["Which VLAN each access port is in", "show vlan brief"],
            ["Which switch is on the other end of an uplink", "show cdp neighbors"],
            ["Whether there are changes that haven't been saved", "show startup-config (compare with running-config)"],
          ]),
          quiz("PoE, logs and version", [
            ["single", "In the show logging picture, why did Gi1/0/5 go down?", ["The cable was unplugged", "*A port-security violation — a device with an unexpected MAC address was plugged in, so the switch err-disabled the port", "Someone typed shutdown", "The PoE budget ran out"], "PSECURE_VIOLATION, then ERR_DISABLE: psecure-violation. The switch did it to protect the network."],
            ["single", "After a power cut, IT asks if the switch restarted. Which command answers that?", ["show interfaces status", "*show version — uptime and the reason for the last restart", "show vlan brief", "show power inline"], "show version gives the uptime and the last reload reason."],
          ]),
        ]),
      ]),

      section("Small fixes, done safely", [
        lesson("Restarting a PoE device: shutdown / no shutdown", [
          reading(`
            A frozen camera or Wi-Fi access point mounted high on a mast or behind a ceiling panel can be restarted from the switch: **shutting its port down removes the PoE power**, and bringing the port back up powers the device again.

            **Agree it with IT first** (a quick call or message is enough). Make sure it's the right port, and that it's an *access* port to that one device, not an uplink. Shutting an uplink cuts off everything beyond it.

            1. Find the port and check it: \`show interfaces status\` and the description, or \`show power inline\`.
            2. Go into configuration for that port only:

            \`\`\`
            configure terminal
            interface gigabitEthernet 1/0/6
            shutdown
            \`\`\`

            3. Wait about 10 seconds. The port light goes out and the device loses power.
            4. Bring it back and leave configuration mode:

            \`\`\`
            no shutdown
            end
            \`\`\`

            5. Check: \`show power inline gigabitEthernet 1/0/6\` should show it powered again, and after a minute or two \`show interfaces status\` should show \`connected\`. Check the camera picture or the Wi-Fi.
            6. Write in the IT log what you did, when, and why.

            **You don't need to save.** \`shutdown\` and then \`no shutdown\` puts the port back exactly as it was, so the running configuration is the same as before.

            If the device doesn't come back, or the port goes \`err-disabled\`, stop and call IT.
          `),
          video("ca2-poe-reset.mp4", "Restarting a frozen camera by power-cycling its PoE port"),
          order("Power-cycle a frozen camera", "Put the steps in order.", [
            "Agree it with IT, and log the reason",
            "Check the port: description, access port, camera's VLAN — not an uplink",
            "configure terminal, then interface gigabitEthernet 1/0/6",
            "shutdown, and wait about 10 seconds",
            "no shutdown, then end",
            "Check power and link come back, and that the camera picture returns",
          ]),
          quiz("PoE resets", [
            ["single", "Which port is it NOT OK to shut down to restart a device?", ["Gi1/0/6 — CCTV-BOW, access port in VLAN 50", "Gi1/0/2 — AP-MAIN-AFT", "*Gi1/1/1 — UPLINK-SW-CORE-01, a trunk to the main switch", "Gi1/0/9 — a desk phone"], "Shutting the uplink cuts off every device on this switch, guest Wi-Fi and AV included."],
            ["truefalse", "After shutdown and no shutdown on a camera port, you must save the configuration.", false, "The port is back as it was, so there's nothing new to save."],
            ["single", "You did shutdown / no shutdown but the camera still doesn't come back after five minutes. What now?", ["Do it again ten times", "Restart the whole switch", "*Stop, note what you've seen, and call IT", "Move the camera to another port yourself"], "One clean power-cycle is the first-line fix. After that, it's IT's job."],
          ]),
        ]),
        lesson("Port security and err-disabled ports", [
          reading(`
            Sometimes the switch shuts a port down by itself and the status shows \`err-disabled\`. **The port light goes out**, just as if the cable were unplugged, so you can't tell from the rack: check \`show interfaces status\`. The switch is protecting the network. Common reasons:

            - **Port security** (\`psecure-violation\`): the port only allows a set number of devices, or specific MAC addresses. If a different device is plugged in (a replacement camera, a laptop, a travel router), the switch shuts the port down. On yachts this is used on deck and cabin sockets so nobody can plug a strange device into the network.
            - **BPDU guard** (\`bpduguard\`): someone plugged a switch into a port meant for one device.
            - **Loop detected** (\`loopback\`) or **link flapping** (\`link-flap\`): a cable looped back into the network, or a faulty cable or device.

            ### Finding out why

            - \`show interfaces status err-disabled\` lists err-disabled ports and the **reason**.
            - \`show port-security interface gi1/0/5\`: \`Port Status : Secure-shutdown\`, the violation count and the **last MAC address** that caused it.
            - \`show logging | include 1/0/5\`: when it happened.

            ### Bringing it back (with IT)

            **Fix the cause first**, or the port will shut down again straight away. Was it a genuine replacement camera? Then the old MAC address the port remembers needs replacing, which IT will either do or talk you through:

            \`\`\`
            clear port-security sticky interface gigabitEthernet 1/0/5
            configure terminal
            interface gigabitEthernet 1/0/5
            shutdown
            no shutdown
            end
            \`\`\`

            If the port uses **sticky** MAC addresses, the switch learns the new camera's address once the port comes back up. **Save the configuration** afterwards (next lesson), otherwise the switch forgets the new address at the next restart.

            If the device that triggered it was something that shouldn't be there (a personal laptop, a travel router, an unknown device), **don't bring the port back**. Unplug it, and report it as a security incident.

            Some switches are set to bring err-disabled ports back on their own after a few minutes (\`errdisable recovery\`). \`show errdisable recovery\` shows whether that's on.
          `),
          image("t10-port-security.png", "Why Gi1/0/5 is down: psecure-violation, caused by MAC address 0000.5e00.5399"),
          hotspot("Spot it on the switch", "Walking past the rack, you see the deck switch. Tap the port the switch has shut down.", "c02-front-panel.png", SPOTS.errPort),
          order("Recover an err-disabled camera port", "The aft-deck camera was replaced and its port went err-disabled. Put the recovery in order.", [
            "show interfaces status err-disabled to confirm the port and the reason",
            "show port-security interface to see the MAC address that caused it",
            "Check it's the new camera's MAC address, and agree the fix with IT",
            "Clear the old sticky address and shutdown / no shutdown the port",
            "Check the port is connected and the camera picture is back",
            "Save the configuration and note it in the IT log",
          ]),
          quiz("err-disabled", [
            ["single", "What does err-disabled mean?", ["Someone switched the port off", "*The switch shut the port down itself because something broke a rule", "The cable is unplugged", "The port is broken for good"], "err-disabled is the switch protecting the network. Find the reason before bringing it back."],
            ["single", "A crew member's travel router plugged into a cabin socket has made the port err-disabled. What do you do?", ["Bring the port back up so the cabin has internet", "*Unplug the router, leave the port down, and report it to IT as a security incident", "Turn port security off on that port", "Restart the switch"], "Port security did its job. Unknown devices don't go on the ship's network."],
            ["truefalse", "If you bring an err-disabled port back up without fixing the cause, it will usually go err-disabled again.", true, "The same rule is broken the moment the port comes up. Fix the cause first."],
          ]),
        ]),
        lesson("Saving — and why it matters", [
          reading(`
            The switch has two configurations:

            - **running-config**: what it's doing now, in memory. Every command in configuration mode changes it immediately.
            - **startup-config**: what's saved, and what the switch loads at the next restart (or after a power cut).

            Save the running configuration as the startup configuration with either:

            - \`copy running-config startup-config\` (often \`copy run start\`): press Enter to accept \`[startup-config]\`, then wait for \`[OK]\`.
            - \`write memory\` (often \`wr\`): the older command, which does the same thing and still works.

            **Not saving** a change you meant to keep means it disappears at the next power cut, often weeks later when nobody remembers what was changed.

            **Saving** a mistake makes it permanent. If you've made a mess, *don't save*. Call IT, who can compare running and startup configuration and put things right.

            Rule of thumb: save **only** when IT has agreed the change and you've checked it works. And IT keeps a backup of every switch's configuration ashore, so ask before you're tempted to "tidy up".
          `),
          image("t11-save-config.png", "Two ways to save: copy running-config startup-config, or write memory"),
          quiz("Saving", [
            ["single", "You changed a port with IT, it works, but you didn't save. What happens at the next power cut?", ["*The change is lost — the switch starts with the saved (startup) configuration", "The change is kept automatically", "The switch won't start", "The port is shut down"], "Only the startup configuration survives a restart."],
            ["single", "You typed something wrong in configuration mode and the guest Wi-Fi has stopped. What should you NOT do?", ["Tell IT straight away", "Write down exactly what you typed", "*Save the configuration", "Leave the switch as it is until IT has looked"], "Saving would make the mistake permanent. IT can compare running-config with startup-config to see what changed."],
            ["truefalse", "write memory and copy running-config startup-config do the same job.", true, "Both save the running configuration so it survives a restart."],
          ]),
        ]),
      ]),

      section("The rules, and the final check", [
        lesson("What not to do without IT", [
          image("c07-look-vs-change.png", "Look as much as you like. Change only with IT."),
          reading(`
            Some commands can take a yacht offline in a second. **Never** do these on your own, even if a forum post, a vendor or a guest's assistant says it will help:

            - \`reload\`: restarts the switch. Everything on it drops for several minutes, or doesn't come back if there's an unsaved or broken configuration.
            - \`write erase\` / \`erase startup-config\`, \`delete\` or \`format\` on flash: wipes the configuration or the software.
            - **Changing VLANs or trunks.** In particular, \`switchport trunk allowed vlan 30\` (without the word \`add\`) **replaces** the whole list on that trunk with just VLAN 30, cutting off every other VLAN.
            - **Shutting down an uplink or trunk port.**
            - **Spanning-tree** changes: they can cause a loop that stops the whole network.
            - **Passwords, users, SSH keys, SNMP, AAA**: you could lock everyone out, IT included.
            - **Software upgrades** and \`debug\` commands (debugs can overload a busy switch).
            - **Clearing counters or the MAC table** (\`clear counters\`, \`clear mac address-table\`): not dangerous, but it throws away evidence IT may need.

            ### When you call IT, have ready

            - Which switch (name and rack) and which port.
            - What's wrong, since when, and what changed.
            - The output of \`show interfaces status\`, \`show logging\` (filtered to the port) and anything else you ran. Copy it as text, or take a clear photo of the screen.
            - What you've already tried.
          `),
          sort("Safe, agreed, or IT only?", "Put each action in the right group.", ["Safe to do on your own", "Only after agreeing with IT", "IT only — never alone"], [
            ["show interfaces status", 0],
            ["show mac address-table address of a printer", 0],
            ["show logging | include 1/0/5", 0],
            ["shutdown / no shutdown on a frozen camera's access port", 1],
            ["Recovering an err-disabled port after a camera swap", 1],
            ["copy running-config startup-config after an agreed change", 1],
            ["reload", 2],
            ["switchport trunk allowed vlan 30 on an uplink", 2],
            ["write erase", 2],
            ["Changing the enable password", 2],
          ]),
        ]),
        lesson("Final check", [
          quiz("Final quiz", [
            ["single", "Which command shows every port's status, VLAN and speed on one screen?", ["show running-config", "*show interfaces status", "show version", "show vlan brief"], "show interfaces status: one line per port."],
            ["single", "A port shows err-disabled. What does that mean?", ["Someone typed shutdown on it", "*The switch shut it down because a rule was broken — check the reason", "Nothing is plugged in", "It's a trunk"], "Use show interfaces status err-disabled to see why."],
            ["single", "You're at SW-LOWER-02(config-if)#. What happens when you type shutdown and press Enter?", ["Nothing until you save", "*That port goes down immediately", "The whole switch shuts down", "You leave configuration mode"], "Commands in configuration mode take effect at once, on the port you're configuring."],
            ["single", "On the main switch a device's MAC address appears on a trunk port to another switch. Where do you look next?", ["*On the switch at the other end of that trunk (show cdp neighbors tells you which)", "In show vlan brief", "In show version", "On the firewall"], "Follow the MAC address from switch to switch until it's on an access port."],
            ["single", "What's the right way to restart a frozen PoE camera from the switch?", ["reload", "*shutdown, wait about 10 seconds, no shutdown on the camera's access port — agreed with IT", "Unplug the switch's power", "clear mac address-table"], "A PoE port bounce restarts just that device."],
            ["truefalse", "show running-config and show startup-config always show the same thing.", false, "They differ when a change hasn't been saved. Running = now, startup = after the next restart."],
            ["multi", "Which of these should you never do without IT? Choose all that apply.", ["*reload", "*write erase", "show logging", "*Changing which VLANs a trunk carries", "show cdp neighbors"], "The show commands are safe. Restarts, erasing and VLAN/trunk changes are for IT."],
            ["single", "Rising CRC errors on one port usually point to…", ["A software bug", "The wrong VLAN", "*A cable, patch lead or socket problem", "Too many devices on the switch"], "Damaged frames on the wire. Swap the patch lead, then have the cable tested."],
          ]),
          ack("I have completed this course. I will use the show commands to look and find faults, agree any change with IT before I make it, never run reload, erase or VLAN/trunk changes on my own, save only agreed changes, and log what I do."),
        ]),
      ]),
    ],
  };
}

export const buildCourse = makeBuild(content);

export const MEDIA_FILES = [
  "c01-cover.png", "c02-front-panel.png", "c03-connect.png", "c04-modes.png", "c05-yacht-vlans.png", "c06-access-trunk.png", "c07-look-vs-change.png",
  "t01-interfaces-status.png", "t02-show-interface.png", "t03-vlan-brief.png", "t04-interfaces-trunk.png", "t05-mac-address-table.png",
  "t06-cdp-lldp.png", "t07-power-inline.png", "t08-logging.png", "t09-version.png", "t10-port-security.png", "t11-save-config.png",
  "ca1-find-the-port.mp4", "ca2-poe-reset.mp4",
];
