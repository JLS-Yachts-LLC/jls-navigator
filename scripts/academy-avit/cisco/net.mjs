// The example yacht network used by the Cisco and FortiGate courses (and the
// network-basics course later). Invented names, private ranges, documentation MACs.
import { C } from "../../academy-cyber/art.mjs";

export const VLANS = [
  { id: 10, name: "BUSINESS", label: "Business / office", net: "10.10.10.0/24", color: C.gold, eg: "Office PCs, printer, NAS" },
  { id: 20, name: "CREW", label: "Crew Wi-Fi", net: "10.10.20.0/24", color: C.teal, eg: "Crew phones and laptops" },
  { id: 30, name: "GUEST", label: "Guest Wi-Fi", net: "10.10.30.0/24", color: "#8f7cf0", eg: "Guests' devices" },
  { id: 40, name: "AV", label: "AV / entertainment", net: "10.10.40.0/24", color: "#e98ad0", eg: "Apple TV, Sonos, control system" },
  { id: 50, name: "CCTV", label: "CCTV", net: "10.10.50.0/24", color: C.amber, eg: "Cameras and the NVR" },
  { id: 60, name: "VOIP", label: "Phones", net: "10.10.60.0/24", color: C.green, eg: "Desk phones" },
  { id: 99, name: "MGMT", label: "Network management", net: "10.10.99.0/24", color: "#9fb0d4", eg: "Switches, Wi-Fi APs, firewall admin" },
];
export const vlan = (id) => VLANS.find((v) => v.id === id);

/** Documentation MAC (RFC 7042: 00-00-5E-00-53-00 … FF) in Cisco dotted form. */
export const mac = (n) => `0000.5e00.53${n.toString(16).padStart(2, "0")}`;
