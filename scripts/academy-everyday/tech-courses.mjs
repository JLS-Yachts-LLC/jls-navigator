// Curriculum C1 (yacht network basics), C4 (internet at sea) and C6 (UPS and power-cycling order).
// Audience: ETOs / AV-IT officers, and HoDs who want the background. Example addresses only.
import { reading, image, video, ack, quiz, hotspot, match, order, sort, lesson, section } from "../academy-cyber/course.mjs";
import { IPCONFIG_SPOTS, UPS_SPOTS } from "./tech-art.mjs";

export const NETWORK = {
  title: "Yacht network basics — IP, DHCP, DNS and VLANs",
  category: "IT and AV",
  minutes: 40,
  passMark: 80,
  refreshMonths: 24,
  summary:
    "The networking you need before the Cisco and FortiGate courses: IP addresses, subnets and gateways, how DHCP and DNS get a device online, how VLANs keep guest, crew, office, AV and bridge networks apart on the same switches, and the first checks when a device \"has no internet\".",
  files: ["n1-address-anatomy.png", "n2-vlans.png", "n3-ipconfig.png", "n4-how-a-phone-gets-online.mp4"],
  content: () => ({
    sections: [
      section("Addresses", [
        lesson("IP address, mask, gateway and DNS", [
          reading(`
            Every device on the yacht's network — phone, laptop, Apple TV, camera, access point — needs four settings to reach anything beyond itself:

            - **IP address** — its own address, e.g. \`192.168.20.57\`. On board these come from the **private ranges** (\`10.x.x.x\`, \`172.16–31.x.x\`, \`192.168.x.x\`), which never appear on the internet.
            - **Subnet mask** — which addresses are local. \`255.255.255.0\` (written **/24**) means everything from \`192.168.20.1\` to \`.254\` is "on the same network" and can be reached directly.
            - **Default gateway** — the way out for everything that isn't local. On a yacht it's almost always the **firewall**.
            - **DNS server** — turns names like *polaris.jlsyachts.com* into addresses. Often the firewall too.

            Two addresses worth recognising:

            - \`169.254.x.x\` — the device asked for an address and **nobody answered** (no DHCP). It won't reach anything.
            - \`127.0.0.1\` — "myself". Useful only for testing the device itself.
          `),
          image("n1-address-anatomy.png", "Every device needs four things to get online"),
          match("Which setting?", "Match each setting with what it does.", [
            ["IP address", "This device's own address"],
            ["Subnet mask", "Which addresses are local"],
            ["Default gateway", "Where traffic for everywhere else goes"],
            ["DNS server", "Turns names into addresses"],
          ]),
        ]),
      ]),

      section("Getting online", [
        lesson("DHCP and DNS in action", [
          reading(`
            **DHCP** hands out the four settings automatically. When a device joins the network it asks "can I have an address?", and the DHCP server (usually the firewall) replies with an IP address, mask, gateway and DNS — for a set time, the **lease**.

            **DNS** is the address book. Before your browser can open a website it asks the DNS server where that name lives.

            So when someone says "the Wi-Fi works but there's no internet", it's usually one of:

            - **no address** — a \`169.254\` address means DHCP didn't answer;
            - **no gateway** — the firewall or the link behind it is down;
            - **no DNS** — addresses work (pinging \`8.8.8.8\` succeeds) but names don't;
            - **no internet link** — Starlink / VSAT / 4G are down (next course).

            **Useful commands** (read-only, safe on any laptop):

            - Windows: \`ipconfig\` (settings), \`ipconfig /all\` (plus DHCP and DNS servers), \`ping 192.168.20.1\` (is the gateway there?), \`nslookup polaris.jlsyachts.com\` (does DNS answer?).
            - Mac: *System Settings → Network → Wi-Fi → Details*, or \`ping\` and \`nslookup\` in Terminal.
          `),
          video("n4-how-a-phone-gets-online.mp4", "Animation: how a phone gets online"),
          order("From Wi-Fi to website", "Put what happens in order.", [
            "The phone joins the Wi-Fi",
            "DHCP gives it an address, gateway and DNS server",
            "It asks DNS where the website is",
            "It sends the request to the gateway (firewall)",
            "The page comes back the same way",
          ]),
          hotspot("Find the way out", "This laptop can't reach the internet. Tap the line that shows the address you'd ping first.", "n3-ipconfig.png", IPCONFIG_SPOTS.gateway),
          quiz("Getting online", [
            ["single", "A laptop shows IPv4 address 169.254.33.10. What does it tell you?", ["It's on the guest network", "*It didn't get an address from DHCP", "Its DNS is wrong", "It's on Starlink"], "169.254.x.x is the address a device gives itself when DHCP doesn't answer. Check the Wi-Fi / cable and the DHCP server."],
            ["single", "Pinging 8.8.8.8 works, but no websites open. What's the likely problem?", ["The Wi-Fi password", "*DNS", "The subnet mask", "The internet link is down"], "Reaching an address on the internet proves the link works — it's turning names into addresses that fails."],
          ]),
        ]),
      ]),

      section("VLANs", [
        lesson("One switch, several networks", [
          reading(`
            A yacht has several networks — crew, guest, office, AV, CCTV, sometimes a separate bridge and engine network — but usually not a separate set of switches for each. **VLANs** split one physical network into several separate ones.

            - Each VLAN has a number and usually its own address range: e.g. VLAN 10 crew \`192.168.10.0/24\`, VLAN 20 guest \`192.168.20.0/24\`.
            - An **access port** on a switch belongs to **one** VLAN — the device plugged in sees only that network. Wi-Fi does the same with one **SSID per VLAN**.
            - A **trunk port** carries **many** VLANs between switches and to the firewall, each frame tagged with its VLAN number.
            - Devices in different VLANs can't talk to each other unless the **firewall** allows it. That's what keeps a guest's phone away from the office PCs and the bridge.

            **Why it matters to you:** plugging a device into the wrong port puts it on the wrong network. A camera on the crew VLAN, or a laptop on the AV VLAN, either won't work or is somewhere it shouldn't be. Port maps and labels matter — and changing a port's VLAN is a configuration change for IT (see *Cisco switch essentials*).
          `),
          image("n2-vlans.png", "One switch, several separate networks"),
          sort("Which VLAN?", "Which network should each device be on?", ["Crew", "Guest", "AV", "CCTV"], [
            ["A crew member's phone", 0],
            ["A charter guest's laptop", 1],
            ["The saloon Apple TV", 2],
            ["The deck camera by the passerelle", 3],
            ["A guest's tablet", 1],
            ["The cinema room matrix switcher", 2],
          ]),
          quiz("Final check", [
            ["truefalse", "Devices in different VLANs can talk to each other freely as long as they're on the same switch.", false, "VLANs keep them apart. Only the firewall can allow traffic between them."],
            ["single", "What does a trunk port do?", ["Connects one device to one VLAN", "*Carries several VLANs between switches or to the firewall", "Gives devices their IP address", "Blocks guests from the internet"], "Access ports carry one VLAN; trunks carry many, tagged."],
          ]),
          ack("I understand IP addresses, gateways, DHCP, DNS and VLANs well enough to do first checks, and I'll leave configuration changes to IT."),
        ]),
      ]),
    ],
  }),
};

export const INTERNET = {
  title: "Internet at sea — Starlink, VSAT, 4G/5G and failover",
  category: "IT and AV",
  minutes: 35,
  passMark: 80,
  refreshMonths: 24,
  summary:
    "How the yacht gets online: Starlink, VSAT and 4G/5G compared, why VSAT drops when the yacht turns, how the firewall fails over between links, managing data on a shared connection, and a calm checklist for when the internet goes down.",
  files: ["s1-three-links.png", "s2-vsat-blockage.png", "s3-failover.png"],
  content: () => ({
    sections: [
      section("The links", [
        lesson("Starlink, VSAT and 4G/5G", [
          reading(`
            **Starlink** uses thousands of satellites in **low Earth orbit** (around 550 km up). That makes it fast with low delay (tens of milliseconds) — calls and video feel normal. Its flat antennas need a **clear view of the sky**: masts, radar arches and tenders parked on deck can get in the way. Using it inside some countries' territorial waters needs local approval, and the service plan sets where and how it may be used — the ETO and the management company keep track of that.

            **VSAT** uses **geostationary** satellites about 36,000 km up. Every round trip takes around **600 ms**, so calls have a slight delay and some apps feel sluggish. A stabilised antenna inside a **dome** keeps pointing at one satellite as the yacht moves; it hands over between satellite beams as the yacht travels.

            **4G / 5G** comes from mobile masts on shore — fast and usually the cheapest **in port and close to the coast**, fading a few miles out. It needs local or roaming SIMs, and roaming charges can be high.

            Most yachts carry **two or three** of these, so one can take over when another drops.
          `),
          image("s1-three-links.png", "Three ways off the yacht"),
          match("Which link?", "Match each feature with the link.", [
            ["Low Earth orbit, low delay", "Starlink"],
            ["Geostationary, ~600 ms round trip", "VSAT"],
            ["Strongest in port and near the coast", "4G / 5G"],
            ["Stabilised dome that can be blocked by the mast", "VSAT"],
          ]),
        ]),
        lesson("Blockage and weather", [
          reading(`
            **VSAT blockage.** The dome has to "see" its satellite. When the yacht turns so that the mast, radar arch or funnel sits between the dome and the satellite, the signal drops until the heading changes. Yachts often have two domes on opposite sides, or Starlink as well, so the link carries on.

            **Starlink obstructions.** Anything over the antenna — a raised crane, a tender on the top deck, a new awning — causes short drop-outs. The Starlink app shows an obstruction map.

            **Weather.** Heavy rain weakens satellite signals (especially VSAT on higher frequency bands). Ice and snow on a dome or antenna do too.

            **What helps the ETO:** the **time**, the **yacht's heading and position**, what was happening (turning, anchoring, tender launch) and which link dropped. With that, problems can be matched against the logs.
          `),
          image("s2-vsat-blockage.png", "Why the link drops when the yacht turns"),
        ]),
      ]),

      section("Failover and data", [
        lesson("Failover and sharing the connection", [
          reading(`
            The **firewall** (often a FortiGate using **SD-WAN**) watches every link with **health checks** — small test packets every few seconds. When the main link stops answering it moves traffic to the next one automatically; when the main link recovers it moves back. A video call may freeze for a moment during the switch, then carry on.

            Some set-ups also **balance** traffic — e.g. guest video over Starlink, the office over VSAT — or keep the expensive link for business use only.

            **Data is shared.** Guests, crew, the office and the ship's systems all use the same links. Big downloads, phone backups and 4K streaming on one device slow everyone down; on metered plans they cost real money. Many yachts set limits per network — that's deliberate, not a fault.
          `),
          image("s3-failover.png", "The firewall picks the best working link"),
          sort("Which link would you expect?", "Which link usually carries the traffic in each case?", ["Starlink", "4G / 5G", "VSAT"], [
            ["Mid-Atlantic crossing, clear sky", 0],
            ["Alongside in a marina, Starlink switched off by local rules", 1],
            ["Starlink antenna blocked by a raised crane at sea", 2],
            ["At anchor a mile off the coast, Starlink working", 0],
          ]),
        ]),
      ]),

      section("When it goes down", [
        lesson("A calm checklist", [
          reading(`
            When "the internet is down", find out **how much** is down before touching anything:

            1. **Is it everyone, or one device?** One device → it's that device (see *Yacht network basics*).
            2. **Which link is the firewall using?** The firewall dashboard or the ETO's monitoring shows the state of each link.
            3. **Check the obvious:** heading change or blockage, a tender or crane over the antenna, heavy rain, leaving 4G range, a power cut to the terminals.
            4. **Tell people:** the bridge, the Captain, and — politely — guests if it affects them.
            5. **Restart only what's needed, in order:** the terminal of the failed link first (per its maker's procedure). Not the whole rack — see *UPS, power and the safe power-cycling order*.
            6. **Escalate** to IT support / the airtime provider with the time, position, heading, which link and what you've tried.
          `),
          order("Internet down", "Put the checklist in order.", [
            "Find out if it's everyone or one device",
            "Check which link the firewall is using",
            "Check blockage, weather, coverage and power",
            "Tell the bridge, the Captain and affected guests",
            "Restart only the failed link's terminal",
            "Escalate with time, position, heading and what you tried",
          ]),
          quiz("Final check", [
            ["single", "VSAT drops every time the yacht swings at anchor to a certain heading. What's the likely cause?", ["A faulty firewall", "*Blockage by the mast or superstructure at that heading", "Too many guests on Wi-Fi", "The 4G SIM has expired"], "Blockage depends on heading. Note the heading and time for the ETO."],
            ["truefalse", "If Starlink drops, the whole AV rack should be power-cycled to bring the internet back.", false, "Restart only the failed terminal, following its procedure — never the whole rack."],
            ["single", "Why do calls over VSAT have a slight delay?", ["The firewall slows them down", "*The satellite is about 36,000 km away", "VSAT only works at night", "The dome is too small"], "Geostationary distance adds roughly 600 ms to every round trip."],
          ]),
          ack("I understand how the yacht's internet links work and fail over, and I'll troubleshoot calmly, restart only what's needed and escalate with the right details."),
        ]),
      ]),
    ],
  }),
};

export const UPS = {
  title: "UPS, power and the safe power-cycling order",
  category: "IT and AV",
  minutes: 25,
  passMark: 80,
  refreshMonths: 24,
  summary:
    "Keep the yacht's network and AV alive through power changes: what a UPS does and how to read it, what to do on battery, generator and shore-power changeovers, and the safe order to start up and shut down the rack so everything comes back cleanly.",
  files: ["u1-ups-panel.png", "u2-startup-order.png"],
  content: () => ({
    sections: [
      section("The UPS", [
        lesson("What a UPS does", [
          reading(`
            A **UPS** (uninterruptible power supply) sits between the yacht's power and the rack. It does three jobs:

            - **Bridges short breaks** — generator changeovers, shore-power connections and blackouts — so the network and AV don't drop.
            - **Cleans the power** — smooths spikes and dips that damage equipment.
            - **Buys time** in a longer outage, so equipment can be shut down properly (some UPSs do it automatically).

            **Reading the front panel:**

            - **Online / normal** — running from the yacht's power, battery charged.
            - **On battery** — the input power has gone; it's running on its batteries. It usually **beeps** every few seconds. The display shows the **runtime** left.
            - **Replace battery** — batteries are worn out (typically every **3–5 years**, sooner in hot spaces).
            - **Overload** — too much is plugged in.

            **On battery?** Tell the engineers and the ETO — something has happened to the power. If runtime gets low and power isn't coming back, the ETO shuts things down in order rather than letting everything crash.

            **Never** switch a UPS off to stop it beeping. Use **Mute**.
          `),
          image("u1-ups-panel.png", "Read the front panel"),
          hotspot("What's happening?", "Tap what tells you this UPS has lost its input power.", "u1-ups-panel.png", UPS_SPOTS.onbattery),
          quiz("The UPS", [
            ["single", "The UPS in the rack is beeping every few seconds and shows \"On battery\". What do you do?", ["Switch the UPS off and on", "*Tell the engineers and the ETO — the input power has gone", "Unplug some equipment to make it stop", "Nothing — it's normal"], "On battery means the power feeding it has failed. Find out why, and watch the runtime."],
            ["truefalse", "UPS batteries last for the life of the UPS.", false, "They wear out — usually every 3–5 years, sooner in hot spaces. The UPS warns you with \"Replace battery\"."],
          ]),
        ]),
      ]),

      section("Power-cycling order", [
        lesson("Start up and shut down in the right order", [
          reading(`
            After a blackout, or when equipment has to be restarted, **order matters**. Each device needs the ones before it to be working, or it starts up confused — no address, no internet, AV that can't find its sources.

            **Start up from the outside in:**

            1. **Internet terminals** — Starlink, VSAT modem, 4G router.
            2. **Firewall** — wait until it's fully up.
            3. **Core switch**, then the other switches.
            4. **Wi-Fi access points and PoE devices** — cameras, phones (they get power from the switches).
            5. **Servers and storage** — NAS, CCTV recorder, servers.
            6. **AV and control** — control processor, matrix, then the sources.

            **Shut down in reverse:** AV and control first, the internet terminals last.

            **Wait for each step to finish booting** (lights steady, dashboards green) before the next — some take five to ten minutes.

            **Never** switch the whole rack off at once, and never "just pull the plug" on servers or storage — that's how data and configurations get corrupted.

            Your yacht's rack may differ: the ETO keeps the exact order in the rack documentation — follow that.
          `),
          image("u2-startup-order.png", "Start up from the outside in"),
          order("Start the rack", "Put the start-up in order.", [
            "Internet terminals (Starlink, VSAT, 4G)",
            "Firewall",
            "Core switch, then the other switches",
            "Wi-Fi access points and PoE devices",
            "Servers and storage",
            "AV and control",
          ]),
          sort("On the UPS or not?", "Which should normally be on the rack's UPS?", ["On the UPS", "Not needed on the UPS"], [
            ["Firewall", 0],
            ["Core switch", 0],
            ["CCTV recorder", 0],
            ["Starlink / VSAT terminal", 0],
            ["Crew mess kettle", 1],
            ["Cabin hair dryer", 1],
          ]),
          quiz("Final check", [
            ["single", "After a blackout, which should come up first?", ["The AV control processor", "The Wi-Fi access points", "*The internet terminals, then the firewall", "The CCTV recorder"], "Start from the outside in: everything else depends on the firewall and the links behind it."],
            ["truefalse", "To save time after a power cut, switch every device in the rack on at the same moment.", false, "Start them in order and let each finish booting, or they come up without what they need."],
          ]),
          ack("I will read the UPS correctly, report when it's on battery, never switch a UPS off to silence it, and start up and shut down the rack in the documented order."),
        ]),
      ]),
    ],
  }),
};
