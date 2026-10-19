// "FortiGate essentials" — JLS library course for ETOs and AV/IT officers, in the Crew
// Academy content shape (src/lib/academy/content.ts).
//
// Scope: FortiGate desktop and small rack models on FortiOS 7.4 / 7.6. Menu names, CLI
// syntax and output layouts checked against Fortinet's 7.4.x / 7.6.x Administration
// Guides, the CLI Reference, the 7.6 release notes and Fortinet's technical tips (see the
// research notes in the shared notes folder for sources and what couldn't be confirmed).
// Example data only: private, CGNAT (100.64.0.0/10) and documentation addresses,
// invented names, masked serials and build numbers.
import { reading, image, video, ack, quiz, hotspot, match, order, sort, lesson, section, makeBuild } from "../blocks.mjs";
import { SPOTS } from "./pictures.mjs";

export const COURSE = {
  title: "FortiGate essentials",
  category: "IT and AV",
  minutes: 60,
  passMark: 80,
  refreshMonths: 24,
  summary:
    "For ETOs and AV/IT officers. Find your way around a FortiGate firewall on FortiOS 7.4 / 7.6: interfaces and VLANs, how firewall policies decide what's allowed, the Starlink / 4G failover, VPN status and logs, and the read-only commands that show why something is blocked — with clear rules on what you must leave to IT.",
};

export function content() {
  return {
    sections: [
      section("Meet the FortiGate", [
        lesson("What the firewall does on board", [
          image("f01-cover.png", "FortiGate essentials"),
          reading(`
            The **FortiGate** is the yacht's firewall. Every connection to the outside world goes through it (Starlink, VSAT, 4G/5G), and so does traffic between the networks on board. It decides, connection by connection, what's allowed.

            On a typical yacht it does all of this:

            - **Keeps the networks apart.** Guest Wi-Fi, crew Wi-Fi, the office, AV, CCTV and phones are separate VLANs. The FortiGate is the gateway for each one, and only its **firewall policies** let traffic cross between them or out to the internet.
            - **Shares the internet links** with **SD-WAN**: it watches Starlink, VSAT and 4G and moves traffic to whichever link is working.
            - **Hands out addresses** (DHCP) on each network.
            - **Connects to shore** with VPN tunnels to the management office and IT.
            - **Logs** what it allowed and what it blocked, and can filter web traffic, block malware and spot attacks.

            ### The rule for this course

            **Look as much as you like. Change only with IT.** Looking at the dashboard, the logs and the read-only commands is safe. Every change (a policy, an interface, a VPN, the firmware) is made by IT or agreed with IT first, because the firewall is the one box that can cut the whole yacht off from shore, or open the guest network onto the bridge.
          `),
          image("f03-where-it-sits.png", "Where the FortiGate sits: internet links on one side, a VLAN interface for each network on board on the other"),
          image("f02-ports.png", "The ports on a small desktop FortiGate"),
          hotspot("Find the Starlink port", "Starlink is plugged into the first WAN port. Tap it.", "f02-ports.png", SPOTS.wan1),
          hotspot("Find the console port", "The network is down and IT asks you to plug in a console cable. Tap the port.", "f02-ports.png", SPOTS.console),
          quiz("Check your understanding", [
            ["single", "A guest's phone on guest Wi-Fi tries to open the CCTV recorder. What decides whether that's allowed?", ["The Wi-Fi access point", "The guest's phone settings", "*The FortiGate's firewall policies", "The switch"], "Traffic between VLANs goes through the firewall, and only a policy can allow it."],
            ["single", "What does SD-WAN do on a yacht?", ["Speeds up the Wi-Fi", "*Uses the internet links (Starlink, VSAT, 4G) and moves traffic to the one that's working", "Encrypts guest traffic", "Connects the AV system"], "SD-WAN watches each link with health checks and steers traffic accordingly."],
            ["truefalse", "Looking at the dashboard and logs can't change how the firewall behaves.", true, "Reading is safe. Changes are for IT."],
          ]),
        ]),
        lesson("Getting in, and the dashboard", [
          reading(`
            ### Three ways in

            1. **The web GUI**: in a browser on the management network (or VPN), go to the firewall's management address, for example \`https://10.10.99.1\`. This is where you'll spend most of your time.
            2. **The CLI** (command line): the **>_** button at the top right of the GUI opens a CLI console in the browser. Or connect with **SSH** to the same address.
            3. **The console port**: an RJ-45 console cable for when nothing else works (9600 baud, 8 data bits, no parity, 1 stop bit), but only when IT asks you to.

            ### Your own admin account

            - Use **your own** login, ideally with two-step sign-in (MFA). Never share it, and never use the built-in \`admin\` account for day-to-day work.
            - IT may give you a **read-only** profile: you can see everything but change nothing. That's normal and intended.
            - Admin access (HTTPS, SSH) should only be switched on for the management network, and each admin account should be limited to **trusted hosts**. If you ever find the login page reachable from the internet, tell IT straight away.

            ### Dashboard › Status

            The first screen shows the **System Information** (hostname, serial number, **firmware version**, uptime), **CPU**, **memory**, **sessions** (how many connections are open now) and the **licenses**: FortiCare support, firmware updates, and the security services such as IPS and web filtering.

            The GUI menus down the left: **Dashboard** (status, and **FortiView**: who's using what), **Network** (interfaces, routing, SD-WAN, DNS), **Policy & Objects** (firewall policies, addresses, services), **Security Profiles**, **VPN**, **User & Authentication**, **WiFi & Switch Controller**, **System** (admins, firmware, settings), **Security Fabric** and **Log & Report**.
          `),
          image("g01-dashboard.png", "Dashboard › Status: system information, CPU, memory, sessions and licences"),
          hotspot("Which firmware?", "IT asks which FortiOS version the firewall is running. Tap where it shows.", "g01-dashboard.png", SPOTS.firmware),
          hotspot("Has it restarted?", "After a power cut, IT asks whether the firewall restarted. Tap the line that tells you.", "g01-dashboard.png", SPOTS.uptime),
          match("Where would you look?", "Match what you need with the GUI menu it's in.", [
            ["The list of firewall policies", "Policy & Objects"],
            ["The Starlink and 4G link status", "Network › SD-WAN"],
            ["Why a connection was blocked", "Log & Report"],
            ["Which devices use the most data right now", "Dashboard › FortiView"],
            ["The VPN tunnels to shore", "VPN (and the dashboard's VPN widget)"],
            ["The firmware version and uptime", "Dashboard › Status"],
          ]),
          quiz("Getting in", [
            ["single", "Which account should you use to look at the firewall?", ["The built-in admin account", "The Captain's account", "*Your own account, set up by IT (often read-only), with MFA", "Any account, as long as you only look"], "Your own account means everything you do is traceable, and read-only means you can't break anything by accident."],
            ["single", "Where do you find the CLI without an SSH program?", ["You can't", "*The >_ CLI console button at the top right of the GUI", "System › Settings", "Log & Report"], "The CLI console opens in the browser, logged in as you."],
          ]),
        ]),
      ]),

      section("How traffic is allowed", [
        lesson("Interfaces, VLANs and zones", [
          reading(`
            **Network › Interfaces** lists every interface the firewall has:

            - **Physical ports**: \`wan1\`, \`wan2\`, \`dmz\`, \`internal1\`–\`internal5\`, \`a\`, \`b\` on a 60F (other models name them \`port1\`, \`port2\` …). On our example yacht, **wan1 is Starlink**, **wan2 is the 4G router**, and **internal5** is the trunk cable to the main switch.
            - **VLAN interfaces**: one per network, on top of the trunk port: \`BUSINESS\` (VLAN 10), \`CREW\` (20), \`GUEST\` (30) and so on. Each has the network's **gateway address** (for example \`10.10.20.1\` for crew Wi-Fi) and usually runs its **DHCP server**.
            - **Hardware switch**: on small models, several ports joined into one LAN interface (called \`internal\` on a 60F, \`lan\` on a 40F).
            - **Zones**: a group of interfaces that share the same policies. The **SD-WAN zone** (\`Internet\` on our yacht) holds wan1 and wan2, so a policy that sends crew traffic to "Internet" works whichever link is up.

            The **Status** column shows if an interface is up. The **Administrative Access** column shows how the firewall itself can be managed through it (PING, HTTPS, SSH). HTTPS and SSH belong on the management network only, **never on a WAN port**.

            If the Starlink port shows **Down**, check the cable and the Starlink router before anything else.
          `),
          image("g02-interfaces.png", "Network › Interfaces: the two internet links, the trunk to the main switch, and a VLAN interface for each network"),
          quiz("Interfaces", [
            ["single", "A crew member's phone shows its gateway as 10.10.20.1. What is that address?", ["The Starlink router", "The crew Wi-Fi access point", "*The FortiGate's CREW VLAN interface", "The main switch"], "Every VLAN's gateway is the firewall's interface on that VLAN."],
            ["single", "Why is HTTPS admin access switched on for MGMT but not for wan1?", ["wan1 is too slow", "*So the firewall's login page can't be reached from the internet", "Starlink doesn't support HTTPS", "It's a licensing rule"], "Management from the internet side is a classic way firewalls get attacked."],
            ["truefalse", "A policy to the SD-WAN zone \"Internet\" keeps working when Starlink fails and the 4G takes over.", true, "That's what the zone is for: the policy doesn't care which member link carries the traffic."],
          ]),
        ]),
        lesson("Firewall policies: top to bottom, first match wins", [
          reading(`
            A **firewall policy** says: traffic **from** this interface, **to** that interface, from these **source** addresses, to these **destination** addresses, using these **services**, at this **schedule**, gets this **action**: **ACCEPT** or **DENY**. (Accept policies usually also have NAT on, and security profiles.)

            The rules every ETO must know:

            1. **Policies are checked from the top of the list down.** The \`#\` (sequence) column is the order. The **ID** is just the policy's permanent number, and it doesn't change when a policy is moved.
            2. **The first policy that matches wins**, and nothing below it is checked. So a specific rule (block one laptop) must sit **above** a general one (allow all crew).
            3. **Anything that matches nothing hits the Implicit Deny**, policy **0**, always last. It's dropped.
            4. **The Implicit Deny doesn't log by default.** Traffic it drops won't show in the logs unless IT has switched logging on for it.

            The **Policy Match** button above the list (called *Policy Lookup* before 7.4) lets you enter a source, destination and port and shows which policy would catch it. It's read-only and very handy.

            The list can be shown in **Interface Pair View** (grouped by from/to) or **By Sequence**. To see the true order, use By Sequence.
          `),
          image("g03-policy-list.png", "Policy & Objects › Firewall Policy, by sequence"),
          video("fa1-policy-order.mp4", "Top to bottom, first match wins: three connections walk down the policy list"),
          quiz("Which policy catches it?", [
            ["single", "A crew phone (10.10.20.15, on CREW) opens a website. Which policy handles it?", ["#1 Business-to-Internet", "#2 Block-Lost-Laptop", "*#3 Crew-to-Internet (ID 3)", "The Implicit Deny"], "#1 is for BUSINESS, and #2 is only for the lost laptop's address. #3 is the first that matches."],
            ["single", "The lost crew laptop (the address in Lost-Laptop) tries to reach the internet. What happens?", ["It's allowed by Crew-to-Internet", "*It's blocked by #2 Block-Lost-Laptop", "It's blocked by the Implicit Deny", "It goes out on 4G"], "#2 matches first, so the laptop is denied and #3 is never checked."],
            ["single", "A guest phone tries to open the CCTV recorder. Which policy decides?", ["#4 Guest-to-Internet", "#5 Office-view-CCTV", "*The Implicit Deny (policy 0) — nothing above matches", "None — it's allowed"], "#4 only goes to the internet, and #5 is only from BUSINESS. Nothing matches, so the Implicit Deny drops it."],
            ["single", "Someone drags Block-Lost-Laptop below Crew-to-Internet. What happens to the lost laptop?", ["Still blocked", "*It gets internet — Crew-to-Internet now matches first", "It's blocked by the Implicit Deny", "Nothing changes, because the IDs stay the same"], "The order (#), not the ID, decides. That's why moving policies is a change for IT."],
          ]),
          order("Get the order right", "Put these three policies in the order that blocks the lost laptop but lets the rest of the crew online.", [
            "Block-Lost-Laptop — CREW → Internet, source Lost-Laptop, DENY",
            "Crew-to-Internet — CREW → Internet, source all, ACCEPT",
            "Implicit Deny — anything else, DENY",
          ]),
        ]),
        lesson("Addresses, services, NAT and DHCP", [
          reading(`
            Policies are built from **objects** in **Policy & Objects**:

            - **Addresses**: a device or range with a name (\`NVR\` = 10.10.50.10, \`Lost-Laptop\` = one MAC or IP address). **Address groups** bundle several.
            - **Services**: protocols and ports (\`HTTPS\` = TCP 443, \`DNS\` = UDP/TCP 53). \`ALL\` means everything.
            - **Schedules**: \`always\`, or times (for example, crew gaming blocked during charter hours).
            - **Virtual IPs (VIPs)**: let something from outside reach a device inside. Rarely used on yachts, because remote access goes over the VPN.

            ### NAT

            Devices on board have private addresses (10.x). To reach the internet, the FortiGate swaps them for its own WAN address: **source NAT**, the **NAT** column in the policy list, set to "use outgoing interface address". Every crew and guest connection leaves the yacht with the firewall's address.

            **Starlink note:** on most plans Starlink gives the yacht a **carrier-grade NAT** address (in \`100.64.0.0/10\`), shared and not reachable from the internet. That's why shore IT reaches the yacht through a VPN that the FortiGate dials *out*, never by connecting *in*.

            ### DHCP

            Each VLAN interface usually runs its own **DHCP server** (set inside the interface: Network › Interfaces › edit). To see who has an address, use **Dashboard › Network › DHCP** in the GUI, or \`execute dhcp lease-list\` in the CLI. Both are read-only. If a device gets **no** address, or a \`169.254.x.x\` one, it isn't getting DHCP: check the VLAN, the cable and the access point, then call IT.
          `),
          image("t04-show-policy.png", "show firewall policy 3: the same policy in the CLI (only settings that differ from the defaults are shown)"),
          match("What does each object mean?", "Match each word with its meaning.", [
            ["Address", "A named device or range, such as NVR = 10.10.50.10"],
            ["Service", "A protocol and port, such as HTTPS = TCP 443"],
            ["Schedule", "When a policy applies"],
            ["NAT", "Swapping inside addresses for the firewall's WAN address"],
            ["Virtual IP", "Letting the outside reach a device inside"],
            ["DHCP server", "Hands out addresses on a VLAN"],
          ]),
          quiz("Objects and NAT", [
            ["single", "A guest laptop shows the address 169.254.12.7. What does that tell you?", ["It's on the guest network", "*It hasn't got an address from DHCP", "It's on the crew network", "It's connected to Starlink directly"], "169.254.x.x is the address a device gives itself when no DHCP server answers."],
            ["single", "Why can't shore IT simply connect in to the yacht over Starlink?", ["Starlink blocks all IT traffic", "*Starlink usually gives a shared carrier-grade NAT address that can't be reached from outside, so the FortiGate dials a VPN out instead", "The firewall has no WAN port", "Because of the Implicit Deny on the bridge"], "CGNAT addresses (100.64.0.0/10) aren't reachable from the internet. VPNs started from the yacht still work."],
          ]),
        ]),
      ]),

      section("Internet links, VPNs and logs", [
        lesson("SD-WAN: Starlink, VSAT and 4G failover", [
          reading(`
            The internet links are **members** of an **SD-WAN zone**. Three parts work together:

            - **Performance SLAs** (health checks): every half second or so the FortiGate pings (or sends HTTP to) a couple of reliable servers out of **each** link and measures **latency**, **jitter** and **packet loss**. A link that stops answering is marked **dead**. One that's too slow fails its **SLA target**.
            - **SD-WAN rules**: which link each kind of traffic should prefer. For example, guest streaming prefers Starlink, the bridge's weather and chart updates use whichever link meets the SLA, and crew traffic stays off expensive VSAT.
            - **Routes**: when a link is marked dead, the FortiGate takes its route out of the routing table, so traffic flows out of the links that are alive. When the link recovers, it's put back.

            **Network › SD-WAN** shows each member's state and the Performance SLA graphs. In the CLI, \`diagnose sys sdwan health-check\` shows each member's state, loss, latency and jitter, and \`diagnose sys sdwan member\` lists the members and their gateways. Both are read-only.

            ### When "the internet is down"

            1. Look at **SD-WAN** first: which link is dead or failing its SLA?
            2. Starlink dead? Check the **Starlink app** (obstructions, outages, the dish's power) before calling anyone. 4G dead? Check the SIM's data and the coverage.
            3. All links alive but users still can't browse? Then it's probably DNS, DHCP or a policy. Ping from the firewall (later lesson) and call IT.

            During a failover, existing connections may drop and reconnect (video calls, VPNs), and **4G and VSAT cost money per gigabyte**. Tell the Captain if the yacht is running on a metered link.
          `),
          image("g04-sdwan-sla.png", "Network › SD-WAN › Performance SLAs: Starlink dead, 4G alive and meeting the SLA"),
          video("fa2-sdwan-failover.mp4", "SD-WAN failover from Starlink to 4G, and back"),
          image("t10-sdwan-health.png", "The same thing in the CLI: diagnose sys sdwan health-check"),
          image("t03-routing-table.png", "get router info routing-table all — two default routes, one per internet link, while both are healthy"),
          hotspot("The way out", "Tap the line in the routing table that shows how traffic leaves the yacht for the internet.", "t03-routing-table.png", SPOTS.defaultRoute),
          quiz("SD-WAN", [
            ["single", "Guests say \"the internet is slow\". SD-WAN shows Starlink dead and 4G alive. What's going on?", ["The guest Wi-Fi is broken", "*The yacht has failed over to 4G — check the Starlink app for obstructions or an outage", "The FortiGate needs restarting", "The DNS server is down"], "The firewall did its job. Now find out why Starlink is down."],
            ["single", "In the health-check output, which value tells you a link has stopped answering completely?", ["latency(61.408)", "jitter(8.217)", "*state(dead), packet-loss(100.000%)", "sla_map=0x1"], "Dead with 100% loss means no replies at all on that link."],
            ["truefalse", "When a link is marked dead, the FortiGate keeps sending traffic out of it until someone changes the configuration.", false, "Its route is withdrawn and traffic moves to the links that are alive. Usually it moves back automatically when the link recovers."],
          ]),
        ]),
        lesson("VPN tunnels to shore", [
          reading(`
            The yacht's FortiGate usually keeps **IPsec VPN tunnels** to shore, for example to the management company's office and to IT support. Through them, shore staff reach the yacht's systems and IT can manage the firewall.

            - **VPN › IPsec Tunnels** in the GUI (or the VPN widget on the dashboard) shows each tunnel as **up** (green) or **down**.
            - \`get vpn ipsec tunnel summary\` lists each tunnel: \`selectors(total,up): 1/1\` means it's up. \`1/0\` means it's down. The \`rx\` / \`tx\` counters show whether traffic is flowing.
            - \`diagnose vpn ike gateway list name NH-Support\` shows the negotiation: \`status: established\` is good, while \`connecting\` means it can't complete. Both commands are read-only.

            A tunnel that's down usually means the internet link is down (check SD-WAN), the other end is down, or something changed (an address, a key). **Don't try to fix tunnel settings**: tell IT which tunnel, since when, and what you saw.

            ### Remote access for crew and IT (SSL VPN is going away)

            FortiOS has moved remote-access VPN from **SSL VPN** to **IPsec** (it can run over TCP 443 too). From **7.6.3**, SSL VPN tunnel mode is replaced by IPsec on all models, and on small models such as the **40F, 60F and 90G** SSL VPN isn't available on 7.6 at all. If someone asks for "the SSL VPN" on a yacht running 7.6, it's a question for IT. And a firmware upgrade that would remove a VPN people depend on is planned by IT, never done on the spot.
          `),
          image("t09-vpn.png", "One tunnel up (selectors 1/1), one down (1/0): its IKE gateway is stuck at 'connecting'"),
          quiz("VPN", [
            ["single", "'NH-Support' shows selectors(total,up): 1/0. What does that mean?", ["*The tunnel is down — no traffic can pass", "The tunnel is up with one selector", "The tunnel is half up and still working", "There's no tunnel by that name"], "1 selector configured, 0 up: the tunnel isn't passing traffic."],
            ["single", "The shore office tunnel is down. What's the best first check?", ["Change the tunnel's pre-shared key", "*Check SD-WAN: is the internet link the tunnel uses alive?", "Restart the FortiGate", "Delete and recreate the tunnel"], "No internet link, no tunnel. Look before you touch anything, and leave the tunnel settings to IT."],
          ]),
        ]),
        lesson("Logs and FortiView", [
          reading(`
            ### Log & Report

            - **Forward Traffic**: every connection that passed through the firewall and was logged: time, source, destination, service, **result** (accept / deny) and the **policy** that decided it. Click **Add Filter** (or the filter box) to narrow down by source address, destination or policy. When a device "can't reach" something, filter on its address and look at the result and the policy.
            - **System Events**: admin logins, configuration changes, interface and SD-WAN changes, VPN events. After a problem, check here: "what changed?".
            - **Security Events**: what the security profiles blocked (viruses, attacks, blocked websites).

            Remember: drops by the **Implicit Deny** are **not logged by default**. If you can't see anything for a device, it doesn't prove nothing was blocked. Use **Policy Match**, or ask IT.

            ### FortiView (under Dashboard)

            **FortiView Sources / Destinations / Applications / Websites / Sessions** shows who is using what right now, or over the last hour or day. Useful for "the internet is slow": often one device is downloading updates or streaming, and you'll see it at the top.

            All of this is read-only. Logs on small models are often kept only briefly (no hard disk) or sent to FortiAnalyzer / FortiCloud. Screenshot or export what matters for the ticket.
          `),
          image("g05-forward-traffic.png", "Log & Report › Forward Traffic filtered on one address: the lost laptop being denied by policy 11"),
          quiz("Logs", [
            ["single", "A crew laptop at 10.10.20.66 \"can't get online\". In Forward Traffic, filtered on its address, every line says Deny by Block-Lost-Laptop (11). What does that tell you?", ["The internet is down", "*It's the laptop that was reported lost, and it's blocked on purpose — tell the Captain and IT", "The Wi-Fi is broken", "The policy is faulty"], "The log tells you exactly why: a deliberate block. Don't work around it."],
            ["single", "You find no log entries at all for a guest device that can't reach the CCTV recorder. Why might that be?", ["*It's hitting the Implicit Deny, which doesn't log by default", "It must be allowed", "The firewall is broken", "Logs only show allowed traffic"], "Policy 0 drops quietly unless IT has switched on logging for it."],
          ]),
        ]),
      ]),

      section("The command line", [
        lesson("The read-only commands", [
          reading(`
            The FortiGate CLI has five kinds of command. Learn which is which:

            | Starts with | What it does | Safe? |
            | --- | --- | --- |
            | \`get\` | Shows status and settings | Yes, read-only |
            | \`show\` | Shows configuration (only what differs from the defaults; \`show full-configuration\` shows everything) | Yes, read-only |
            | \`diagnose\` | Diagnostics and troubleshooting tools | **Mostly**, but some clear or change things |
            | \`execute\` | Actions: ping, backup, reboot, factory reset | **Some are dangerous** |
            | \`config\` … \`set\` … \`end\` | **Changes the configuration** | **No: IT only** |

            The prompt is the hostname followed by \` # \`, for example \`FGT-YACHT-01 # \`. Inside \`config\` the prompt changes, for example \`FGT-YACHT-01 (policy) # \`. If you ever find yourself there by mistake, type \`abort\` and press Enter to leave **without** saving. Typing \`end\` would save what you've typed.

            Press **?** for help at any point, and **Tab** to complete a word. Long output stops at \`--More--\`: press Space for more, or **q** to stop.

            ### The four everyday read-only commands

            - \`get system status\`: firmware version, serial number, hostname, operation mode, HA mode, system time, last reboot reason.
            - \`get system interface physical\`: each port's mode, address, **status up/down** and speed / duplex.
            - \`get system performance status\`: CPU, **memory**, network usage, sessions and **uptime**. If memory stays near 90%, the FortiGate can go into *conserve mode* and stop accepting new connections, so tell IT.
            - \`get router info routing-table all\`: the routes. \`S*\` 0.0.0.0/0 is the default route (the way to the internet), one per internet link. \`C\` lines are the networks directly connected to the firewall.
          `),
          image("t01-system-status.png", "get system status"),
          image("t02-interface-physical.png", "get system interface physical: wan1 (Starlink) is up at 1000 Mb/s full duplex"),
          image("t11-performance.png", "get system performance status: CPU mostly idle, memory at 48%"),
          match("Which command shows it?", "Match what you need with the read-only command that shows it.", [
            ["The FortiOS version and serial number", "get system status"],
            ["Whether wan1 has link, and at what speed", "get system interface physical"],
            ["Memory use and uptime", "get system performance status"],
            ["The default routes out to the internet", "get router info routing-table all"],
            ["How the policy with ID 3 is set up", "show firewall policy 3"],
            ["Whether each internet link is alive", "diagnose sys sdwan health-check"],
          ]),
          quiz("CLI basics", [
            ["single", "Which of these changes the firewall?", ["get system status", "show firewall policy", "*config firewall policy … set … end", "get router info routing-table all"], "config / set / end is how configuration is changed, and it's IT only."],
            ["single", "You've typed config system interface by mistake. How do you get out without changing anything?", ["end", "*abort", "exit, then save", "Close the window and hope"], "abort leaves without saving. end saves."],
          ]),
        ]),
        lesson("Tracing traffic: sessions, sniffer and debug flow", [
          reading(`
            When a device can't reach something and the logs don't say why, IT may ask you to run one of these. **Always use a filter**, and **always clean up** afterwards.

            ### The session table

            Every connection through the firewall is a **session**.

            \`\`\`
            diagnose sys session filter clear
            diagnose sys session filter src 10.10.20.15
            diagnose sys session filter dport 443
            diagnose sys session list
            \`\`\`

            Each entry shows the protocol, how long it has run, the NAT (\`act=snat 10.10.20.15:49397->203.0.113.10:443(100.64.0.10:49397)\`: the crew phone's connection leaving with the firewall's Starlink address) and \`policy_id=3\`, the policy that allowed it.

            ⚠️ **Never run \`diagnose sys session clear\` without a filter.** It **clears every session on the firewall**: everyone's calls, VPNs and downloads drop at once. Clearing sessions is for IT.

            ### The packet sniffer

            \`diagnose sniffer packet any 'host 8.8.8.8 and icmp' 4 4 l\` shows packets matching the filter (in single quotes) on any interface, at verbose level 4 (with interface names), stopping after **4** packets, with local time. Without a count it runs until you press **Ctrl+C**. Leave the filter out on a busy firewall and the screen floods.

            ### Debug flow: why was it dropped?

            Debug flow shows the firewall's decisions for each packet: route found, which policy, NAT, and the reason for a drop.

            \`\`\`
            diagnose debug flow filter clear
            diagnose debug flow filter addr 10.10.50.10
            diagnose debug flow show function-name enable
            diagnose debug flow trace start 5
            diagnose debug enable
            \`\`\`

            Then make the device try again. When you're done, **always** stop it:

            \`\`\`
            diagnose debug disable
            diagnose debug reset
            \`\`\`

            \`Allowed by Policy-3\` means accepted. \`Denied by forward policy check (policy 0)\` means no policy matched, so the Implicit Deny dropped it. It's a missing policy, not a fault, and adding one is a decision for IT.
          `),
          image("t05-session-list.png", "The session table, filtered to one crew phone: NAT out of Starlink, allowed by policy 3"),
          image("t06-sniffer.png", "The sniffer: a ping from a crew phone going out of wan1 and the reply coming back"),
          image("t07-debug-flow.png", "Debug flow: a guest phone trying to reach the CCTV recorder is dropped by policy 0"),
          order("Run a debug flow properly", "Put the steps in order.", [
            "diagnose debug flow filter clear",
            "diagnose debug flow filter addr (the device's address)",
            "diagnose debug flow show function-name enable",
            "diagnose debug flow trace start 5",
            "diagnose debug enable, then make the device try again",
            "diagnose debug disable, then diagnose debug reset",
          ]),
          quiz("Tracing", [
            ["single", "What happens if you type diagnose sys session clear with no filter?", ["Nothing — it needs a filter", "*Every session on the firewall is cleared — everyone's connections drop", "Only your own SSH session is cleared", "It clears the log"], "It's one of the most disruptive commands there is. Clearing sessions is for IT."],
            ["single", "Debug flow says: Denied by forward policy check (policy 0). What does it mean?", ["The firewall is faulty", "*No policy matches this traffic, so the Implicit Deny dropped it", "Policy 0 needs to be deleted", "The route is missing"], "It's working as designed. Whether to allow it is IT's decision."],
            ["truefalse", "When you've finished with debug flow, you should run diagnose debug disable and diagnose debug reset.", true, "Debugs left running use CPU and fill the screen. Always clean up."],
          ]),
        ]),
        lesson("Ping, traceroute and backups", [
          reading(`
            ### Ping and traceroute from the firewall

            - \`execute ping 8.8.8.8\` checks the firewall itself can reach the internet. \`5 packets transmitted, 5 packets received, 0% packet loss\` is what you want.
            - \`execute traceroute 8.8.8.8\` shows the path, hop by hop.
            - By default the ping leaves from the outgoing interface's address. To test from inside a VLAN, set the source first: \`execute ping-options source 10.10.20.1\`, then ping, then \`execute ping-options reset\`. The option only lasts for your session.

            If the firewall can ping out but devices can't browse, the internet link is fine. Look at DHCP, DNS and policies.

            ### Backups

            IT backs up the configuration (often automatically, to FortiManager or the cloud). If IT asks you for a manual backup:

            - **GUI:** click your **user name at the top right › Configuration › Backup**, choose **Local PC** (or USB Disk), and normally tick **Encryption** with a password IT gives you. An encrypted backup **can't be restored without its password**.
            - **CLI:** \`execute backup config usb <file name>\` (to a USB stick in the firewall), or to a TFTP / FTP / SFTP server.

            A backup file contains the firewall's secrets (VPN keys, admin accounts). **Treat it like a password**: never email it, never leave it on a crew laptop or a USB stick in a drawer. Hand it to IT and delete your copy.

            **Restore** (from the same menu) replaces the whole configuration and restarts the firewall. That's IT only.
          `),
          image("t08-ping.png", "execute ping: 0% loss to the internet; then a ping from the CREW interface to the CCTV recorder"),
          image("g06-backup.png", "User menu › Configuration › Backup: to the local PC, encrypted"),
          quiz("Ping and backups", [
            ["single", "The firewall pings 8.8.8.8 with 0% loss, but crew devices can't open websites. Where's the problem likely to be?", ["The Starlink link", "*Inside the yacht: DHCP, DNS, the crew VLAN or a policy", "The 4G router", "The ping command"], "The link out works. The fault is between the devices and the firewall, or in how they're allowed out."],
            ["single", "IT asked for a configuration backup. What do you do with the file?", ["Email it to IT", "Keep it on the crew mess PC for next time", "*Pass it to IT securely, as agreed, and delete your copy", "Print it"], "A backup holds VPN keys and admin accounts. Handle it like a password."],
          ]),
        ]),
      ]),

      section("The rules, and the final check", [
        lesson("Read-only vs changes", [
          image("f04-read-vs-change.png", "Read-only, careful, and IT only"),
          reading(`
            **Never do these without IT**, however urgent it feels and whoever asks (a vendor, a guest's assistant, a forum post):

            - Any \`config\` change: policies, interfaces, VLANs, NAT, VIPs, routes, SD-WAN, VPNs, DHCP, admin accounts, security profiles.
            - **Moving policies** in the list: it changes which one matches first.
            - \`diagnose sys session clear\`, which drops connections.
            - \`execute reboot\` / \`execute shutdown\`: the whole yacht goes offline. A reboot of a small FortiGate takes minutes.
            - \`execute factory-reset\`: wipes everything.
            - **Firmware upgrades.** They need planning: they can remove features (SSL VPN on 7.6), and since 7.4, moving to a new version needs the right licence.
            - Turning off a security profile "to make something work".

            ### When you call IT, have ready

            - What's wrong, for whom (which device, its IP address and VLAN), since when, and what changed.
            - SD-WAN state, the dashboard (CPU / memory), and any log lines or command output. Copy text, or take clear screenshots.
            - What you've already checked.
          `),
          sort("Safe, careful, or IT only?", "Put each one in the right group.", ["Read-only — safe on your own", "Careful — only when IT asks", "Changes — IT only"], [
            ["get system status", 0],
            ["Looking at Log & Report › Forward Traffic", 0],
            ["diagnose sys sdwan health-check", 0],
            ["execute ping 8.8.8.8", 0],
            ["diagnose debug flow with a filter, then disable and reset", 1],
            ["execute backup config usb", 1],
            ["diagnose sniffer packet with a filter and a count", 1],
            ["diagnose sys session clear", 2],
            ["Moving a policy higher in the list", 2],
            ["execute reboot", 2],
            ["Upgrading the firmware", 2],
          ]),
        ]),
        lesson("Final check", [
          quiz("Final quiz", [
            ["single", "How are firewall policies checked?", ["By ID, lowest first", "All at once, the strictest wins", "*Top to bottom in sequence; the first match wins", "Bottom to top"], "Order matters. The ID is just a label."],
            ["single", "What happens to traffic that matches no policy?", ["It's allowed", "It goes to the Starlink link", "*The Implicit Deny (policy 0) drops it — and doesn't log it by default", "It's queued until a policy is added"], "Policy 0 is always last."],
            ["single", "Starlink is down. Where do you look first on the FortiGate?", ["Policy & Objects", "*Network › SD-WAN (or diagnose sys sdwan health-check)", "System › Firmware", "User & Authentication"], "SD-WAN shows each link's state, loss and latency."],
            ["single", "Which command is NOT safe to run on your own?", ["get system performance status", "show firewall policy 3", "*diagnose sys session clear", "get vpn ipsec tunnel summary"], "It clears sessions, without a filter every session on the box."],
            ["single", "You're inside config by mistake. How do you leave without saving?", ["end", "*abort", "next", "exit twice"], "abort discards. end saves."],
            ["truefalse", "A FortiGate backup file can be emailed around, because it's only settings.", false, "It contains secrets (VPN keys, admin accounts). Treat it like a password."],
            ["single", "A tunnel shows selectors(total,up): 1/0. What does that mean?", ["*It's down", "It's up", "It's being created", "It has no selectors configured"], "0 of 1 selectors up: no traffic passes."],
            ["multi", "Which of these must be left to IT? Choose all that apply.", ["*Moving a policy up the list", "Reading Forward Traffic logs", "*A firmware upgrade", "*execute factory-reset", "get system status"], "Reading is safe. Anything that changes order, firmware or configuration is IT's job."],
          ]),
          ack("I have completed this course. I will use the dashboard, logs and read-only commands to find faults, run diagnostics only with a filter and clean up afterwards, never change policies, interfaces, VPNs or firmware without IT, never clear sessions or reboot the firewall on my own, and handle configuration backups like passwords."),
        ]),
      ]),
    ],
  };
}

export const buildCourse = makeBuild(content);

export const MEDIA_FILES = [
  "f01-cover.png", "f02-ports.png", "f03-where-it-sits.png", "f04-read-vs-change.png",
  "g01-dashboard.png", "g02-interfaces.png", "g03-policy-list.png", "g04-sdwan-sla.png", "g05-forward-traffic.png", "g06-backup.png",
  "t01-system-status.png", "t02-interface-physical.png", "t03-routing-table.png", "t04-show-policy.png", "t05-session-list.png",
  "t06-sniffer.png", "t07-debug-flow.png", "t08-ping.png", "t09-vpn.png", "t10-sdwan-health.png", "t11-performance.png",
  "fa1-policy-order.mp4", "fa2-sdwan-failover.mp4",
];
