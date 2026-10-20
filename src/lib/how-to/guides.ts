/**
 * How-to Guides — step-by-step help for each Polaris screen, with screenshots.
 *
 * One source for three places: the top-bar "?" help panel (guides for the page
 * you're on), the How-to Guides section (/how-to) and the PDF export
 * (guide-pdf.ts — in-app "Download PDF" and `node scripts/build-how-to-pdfs.ts`).
 *
 * Screenshots live in public/how-to/ and were captured from the live New View at
 * 1568×710. `highlights` are boxes in those image pixels, drawn as a gold outline
 * over the picture to show where to click.
 *
 * Keep this file free of `@/` imports and non-erasable TypeScript (enums etc.) —
 * the PDF build script loads it directly with Node.
 */

export interface GuideBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GuideImage {
  /** Path under /public, e.g. "/how-to/crew-list.jpg". */
  src: string;
  alt: string;
  highlights?: GuideBox[];
  /** Pixel height when it isn't SHOT_H (the browser window height changed between captures). */
  h?: number;
}

export interface GuideStep {
  title: string;
  /** Plain text; wrap words in **double asterisks** to show them in bold. */
  text: string;
  bullets?: string[];
  image?: GuideImage;
  tip?: string;
}

export interface HowToGuide {
  id: string;
  title: string;
  summary: string;
  /** Sidebar group the guide belongs to (also the PDF bundle name). */
  section: string;
  /** Nav screen keys (shell.tsx NAV_GROUPS `screen`) this guide helps with. */
  screens: string[];
  minutes: number;
  steps: GuideStep[];
}

/** Pixel size every screenshot was captured at. */
export const SHOT_W = 1568;
export const SHOT_H = 710;

const img = (name: string, alt: string, highlights?: GuideBox[]): GuideImage => ({
  src: `/how-to/${name}.jpg`,
  alt,
  highlights,
});
/** Screenshots captured at 1568×750 (Services batch 2 onwards). */
const img750 = (name: string, alt: string, highlights?: GuideBox[]): GuideImage => ({ ...img(name, alt, highlights), h: 750 });

export const HOW_TO_GUIDES: HowToGuide[] = [
  // ── Dashboard ─────────────────────────────────────────────────────────────
  {
    id: "dashboard-overview",
    title: "Use the Dashboard",
    summary: "Read the fleet picture at a glance, get Leo's briefing and jump to the alerts that need you.",
    section: "Operations",
    screens: ["dashboard"],
    minutes: 3,
    steps: [
      {
        title: "Open the Dashboard",
        text: "Click **Dashboard** at the top of the Operations menu. It is also where Polaris opens after you sign in.",
        image: img("dashboard", "The Polaris Dashboard", [{ x: 10, y: 104, w: 143, h: 34 }]),
      },
      {
        title: "Get Leo's briefing",
        text: "Click **Generate briefing** in the Leo panel. Leo reads your tasks, alerts and fleet data and writes a short briefing, followed by three insight cards: Lean Signal, Ops Health and Attention.",
        image: img("dashboard", "The Leo panel with the Generate briefing button", [{ x: 190, y: 161, w: 140, h: 37 }]),
        tip: "The briefing is only generated when you ask for it, so opening the Dashboard stays fast.",
      },
      {
        title: "Read the fleet status cards",
        text: "The row of cards under **Fleet status — All vessels** counts crew across every vessel:",
        bullets: [
          "**Crew onboard** — crew currently assigned to a vessel.",
          "**Active visas** — crew holding a valid visa.",
          "**Expiring** — visas that run out within 30 days.",
          "**Expired** — visas already past their expiry date.",
          "**No visa** — crew with no visa on record.",
        ],
        image: img("dashboard", "Fleet status cards", [{ x: 177, y: 238, w: 1378, h: 98 }]),
      },
      {
        title: "Act on compliance alerts",
        text: "**Compliance alerts** lists the most urgent expired or expiring visas, with the vessel, visa type and how many days overdue. **Fleet status** on the right shows a traffic light per vessel — red means at least one crew member's visa has expired. Click a vessel to open its visa report.",
        image: img("dashboard", "Compliance alerts and fleet status", [
          { x: 177, y: 350, w: 684, h: 360 },
          { x: 871, y: 350, w: 684, h: 360 },
        ]),
      },
      {
        title: "Open the visa reports",
        text: "Click **Visa reports** (top right) to see the full visa picture for one vessel or the whole fleet, and to export or send it.",
        image: img("dashboard", "The Visa reports button", [{ x: 1448, y: 57, w: 107, h: 38 }]),
      },
    ],
  },

  // ── Vessels ───────────────────────────────────────────────────────────────
  {
    id: "vessels-find",
    title: "Find and filter vessels",
    summary: "Search the Yacht Registry, filter by status, switch layouts and export the list.",
    section: "Operations",
    screens: ["vessels"],
    minutes: 3,
    steps: [
      {
        title: "Open the Yacht Registry",
        text: "Click **Vessels** in the Operations menu. The **Vessel Overview** tab shows the Yacht Registry: every active yacht with its flag, IMO number, owner, status and berth.",
        image: img("vessels-registry", "The Yacht Registry", [{ x: 190, y: 55, w: 130, h: 33 }]),
      },
      {
        title: "Search and filter",
        text: "Type a name in **Search all yachts…**. Click a stat card (**Total Vessels**, **In Country**, **Departed**, **Change Agency**) or a status chip under it to narrow the list. The live AIS chips (**Under way / at sea**, **Moored / berthed**, …) filter by where the yacht actually is right now.",
        image: img("vessels-registry", "Search box, stat cards and filter chips", [
          { x: 450, y: 101, w: 184, h: 28 },
          { x: 192, y: 152, w: 1347, h: 67 },
          { x: 192, y: 226, w: 850, h: 22 },
        ]),
      },
      {
        title: "Show only your vessels",
        text: "Click **My vessels** to see only the yachts where you are the responsible agent. Click **Archived** to see yachts that have left the fleet; **Active** brings you back.",
        image: img("vessels-registry", "My vessels and Active / Archived toggle", [{ x: 640, y: 101, w: 255, h: 28 }]),
      },
      {
        title: "Change the layout and columns",
        text: "Pick a sort order from the dropdown, then choose **List**, **Cards** or **Small**. Under **Views** you can switch between the built-in views (Default, Compact, Operations), tick the columns you want and **Save current as…** your own view. The ‹ › arrows step through your saved views.",
        image: img("vessels-registry", "Sort, layout and Views controls", [
          { x: 900, y: 101, w: 284, h: 28 },
          { x: 1373, y: 101, w: 72, h: 28 },
        ]),
      },
      {
        title: "Export to Excel",
        text: "Click **Export**. Choose **Columns on screen** or **All fields**, then export **All yachts & statuses** or the **Current list only** (keeps your filters and sort). The file opens in Excel.",
        image: img("vessels-registry", "The Export button", [{ x: 1294, y: 101, w: 74, h: 28 }]),
      },
      {
        title: "Quick changes from the list",
        text: "In List view you can change a yacht without opening it: click its **Status** pill to pick a new status (In Country, Departed, Change Agency, …) or click the **Agent** cell to assign the responsible agent.",
        image: img("vessels-registry", "Status column in the list", [{ x: 1316, y: 255, w: 90, h: 440 }]),
      },
    ],
  },
  {
    id: "vessels-add",
    title: "Add a new yacht",
    summary: "Create a yacht in the registry, with its details, image and responsible agent.",
    section: "Operations",
    screens: ["vessels"],
    minutes: 4,
    steps: [
      {
        title: "Click Add Yacht",
        text: "In **Vessels → Vessel Overview**, click **Add Yacht** at the top right of the Yacht Registry.",
        image: img("vessels-registry", "The Add Yacht button", [{ x: 1449, y: 101, w: 90, h: 28 }]),
        tip: "Add Yacht only appears if you have permission to create vessels. Ask an admin if you can't see it.",
      },
      {
        title: "Fill in the identity",
        text: "Only **Vessel Name** is required — everything else can be added later. Fill in what you have: **Vessel Type**, **Flag**, **IMO No.**, **Official No.** and **Port of Registry**.",
        image: img("vessels-add-identity", "Add Yacht form — identity section", [{ x: 446, y: 451, w: 840, h: 168 }]),
      },
      {
        title: "Add an image and responsible agent",
        text: "Click **Upload image** to add a photo of the yacht. Under **Responsible Agent**, choose the Agency team member who looks after this vessel's permits and documents — they get the permit expiry reminders.",
        image: img("vessels-add-identity", "Vessel image and responsible agent", [
          { x: 686, y: 209, w: 110, h: 32 },
          { x: 463, y: 384, w: 316, h: 30 },
        ]),
      },
      {
        title: "Complete the other sections",
        text: "Scroll down for the remaining sections:",
        bullets: [
          "**Build** and **Dimensions** — built year, builder, tonnage, LOA, breadth, draught, air draft.",
          "**Communications** — radio call sign, MMSI and equipment.",
          "**Capacity** — max crew and max guests.",
          "**Owner** and **Contact** — owner, company, contact person, email, billing address and SharePoint folder link.",
          "**Operations** — status, berth, ETA / ETD, location and cruising permit expiry.",
        ],
        image: img("vessels-add-operations", "Contact and Operations sections", [{ x: 446, y: 391, w: 840, h: 287 }]),
      },
      {
        title: "Save the yacht",
        text: "Click **Save Yacht** (top right). Polaris creates the yacht, makes its SharePoint folder automatically and opens the new vessel page.",
        image: img("vessels-add-identity", "The Save Yacht button", [{ x: 1437, y: 62, w: 98, h: 31 }]),
        tip: "Changed your mind? Click Back — nothing is saved until you press Save Yacht.",
      },
    ],
  },
  {
    id: "vessels-edit",
    title: "Edit a yacht",
    summary: "Update a yacht's details, assign agents, and archive or restore it.",
    section: "Operations",
    screens: ["vessels"],
    minutes: 3,
    steps: [
      {
        title: "Open the yacht",
        text: "In the Yacht Registry, click the yacht's name. Its page opens with the **Details** tab showing permit expiries on the left and the yacht's information on the right.",
        image: img("vessels-detail", "A vessel's Details tab", [{ x: 197, y: 166, w: 433, h: 30 }]),
      },
      {
        title: "Click Edit",
        text: "Click **Edit** in the header. The information panels turn into editable fields.",
        image: img("vessels-detail", "The Edit button", [{ x: 1186, y: 112, w: 59, h: 28 }]),
      },
      {
        title: "Change the details and save",
        text: "Update any field — only **Vessel name** must stay filled in. Click **Save** to keep your changes, or **Cancel** to throw them away.",
        image: img("vessels-edit", "Editing a vessel", [
          { x: 732, y: 281, w: 589, h: 29 },
          { x: 1398, y: 111, w: 138, h: 30 },
        ]),
      },
      {
        title: "Assign the responsible agents",
        text: "Further down the left column, **Responsible agents** shows who keeps this vessel's permits current. Click **Add an agent** to assign someone — each agent gets reminders 60, 30 and 7 days before their permits expire, and on the day.",
        image: img("vessels-agents", "Responsible agents panel", [{ x: 394, y: 236, w: 301, h: 142 }]),
      },
      {
        title: "Archive or restore",
        text: "When a yacht leaves the fleet, click **Archive** in the header and confirm. It moves to the **Archived** list in the registry, keeping all its history. Open it from there and click **Restore** to bring it back.",
        image: img("vessels-detail", "Archive button", [{ x: 1379, y: 112, w: 77, h: 28 }]),
        tip: "Use Archive rather than Delete for a yacht that has simply left — Delete removes the yacht from Polaris.",
      },
    ],
  },
  {
    id: "vessels-records",
    title: "Vessel documents & permits",
    summary: "Upload and share a yacht's documents, and see every permit it holds.",
    section: "Operations",
    screens: ["vessels"],
    minutes: 3,
    steps: [
      {
        title: "Open the Documents tab",
        text: "On the yacht's page, click **Documents**. You see every file in the yacht's SharePoint folder alongside anything uploaded in Polaris.",
        image: img("vessels-documents", "The Documents tab", [{ x: 254, y: 166, w: 75, h: 30 }]),
      },
      {
        title: "Upload, organise and share",
        text: "Use the buttons above the list:",
        bullets: [
          "**Upload** — add a file from your computer.",
          "**New folder** — make a folder to group files.",
          "**Share** — send a secure link to the yacht or another contact.",
          "**Sync both ways** — copy SharePoint-only files into Polaris and Polaris files to SharePoint.",
          "**Open** on any row opens the file; **Release** shares that one file.",
        ],
        image: img("vessels-documents", "Document actions", [{ x: 621, y: 255, w: 596, h: 26 }]),
      },
      {
        title: "Check the yacht's permits",
        text: "Click **Permits** to see every permit for this yacht — type, number, holder, issuing authority, issue and expiry dates and status. Expiry dates show the days left.",
        image: img("vessels-permits", "The vessel Permits tab", [{ x: 381, y: 166, w: 57, h: 30 }]),
        tip: "To add or change a permit, use Operations → Permits. See the guide \"Add a new permit\".",
      },
      {
        title: "Other tabs",
        text: "**Crew** lists everyone assigned to the yacht, **Visas** their visa status, **Finance** the yacht's invoices, and **Activity Log** every change and email sent for this yacht.",
        image: img("vessels-permits", "Vessel tabs", [{ x: 197, y: 166, w: 433, h: 30 }]),
      },
    ],
  },

  // ── Crew ──────────────────────────────────────────────────────────────────
  {
    id: "crew-find",
    title: "Find a crew member",
    summary: "Search and filter the Crew List and open a crew profile.",
    section: "Operations",
    screens: ["crew"],
    minutes: 2,
    steps: [
      {
        title: "Open the Crew List",
        text: "Click **Crew** in the Operations menu. The Crew List shows every crew member with their vessel, rank, passport and status.",
        image: img("crew-list", "The Crew List", [{ x: 10, y: 176, w: 143, h: 34 }]),
      },
      {
        title: "Search and filter",
        text: "Type a name in **Search crew…**, then narrow the list with **All Vessels** and **All Status**. The counts under the title (**Active**, **On Leave**, **Off-Signed**, **Inactive**) are filters too — click one to show only those crew.",
        image: img("crew-list", "Search and filters", [
          { x: 741, y: 69, w: 450, h: 30 },
          { x: 195, y: 120, w: 312, h: 20 },
        ]),
      },
      {
        title: "Change the layout",
        text: "Use the three layout icons to switch between the table, a grid and cards.",
        image: img("crew-list", "Layout toggle", [{ x: 1199, y: 69, w: 84, h: 30 }]),
      },
      {
        title: "Open a profile",
        text: "Click a crew member's name, or the profile icon under **Actions**. The profile shows their details, travel documents, passports, visa applications, sign on / sign off timeline and documents.",
        image: img("crew-profile", "A crew profile"),
      },
    ],
  },
  {
    id: "crew-add",
    title: "Add a crew member",
    summary: "Create a crew record by hand or import a list from a CSV file.",
    section: "Operations",
    screens: ["crew"],
    minutes: 3,
    steps: [
      {
        title: "Search first",
        text: "Before adding someone, search the Crew List for their name to make sure they aren't already in Polaris. Duplicates split a person's visa and sign-on history across two records.",
        image: img("crew-list", "Search crew", [{ x: 741, y: 69, w: 184, h: 30 }]),
        tip: "Found a duplicate already? Reports → Duplicate Crew lets you merge them.",
      },
      {
        title: "Click Add Crew Member",
        text: "Click **Add Crew Member** at the top right of the Crew List.",
        image: img("crew-list", "Add Crew Member button", [{ x: 1397, y: 69, w: 138, h: 30 }]),
      },
      {
        title: "Fill in the form",
        text: "**First Name** and **Last Name** are required. Then add what you have:",
        bullets: [
          "**Vessel**, **Rank / Position** and **Department**.",
          "**Nationality**, **Email** and **Phone** (choose the country code first).",
          "**Passport Number** and **Passport Expiry**.",
          "**Status** — Active for crew currently working.",
        ],
        image: img("crew-add", "The Add Crew Member form", [{ x: 529, y: 230, w: 510, h: 42 }]),
      },
      {
        title: "Save",
        text: "Click **Add Crew Member**. The new crew member appears in the list straight away. Open their profile and click **Edit** to add date of birth and other personal details.",
        image: img("crew-add", "Add Crew Member button in the form", [{ x: 916, y: 488, w: 123, h: 30 }]),
      },
      {
        title: "Adding many crew at once",
        text: "Click **Import CSV**, then **Template** to download a spreadsheet with the right columns (First Name, Last Name, Nationality, Rank, Passport Number, Date of Birth, …). Fill it in, choose it with **Choose CSV file** and click **Import**.",
        image: img("crew-list", "Import CSV button", [{ x: 1291, y: 69, w: 98, h: 30 }]),
        tip: "The import doesn't check for duplicates — remove anyone already in Polaris from the file first.",
      },
    ],
  },
  {
    id: "crew-edit",
    title: "Edit a crew member",
    summary: "Update a crew member's vessel, rank, passport and personal details, or remove them.",
    section: "Operations",
    screens: ["crew"],
    minutes: 3,
    steps: [
      {
        title: "Quick edit from the list",
        text: "In the Crew List, click the pencil under **Actions**. **Edit Crew Member** opens with the same fields as when they were added — vessel, rank, department, nationality, contact details, passport and status. Click **Save Changes**.",
        image: img("crew-list", "The pencil (edit) icon", [{ x: 1418, y: 396, w: 24, h: 26 }]),
        tip: "Moving someone to another vessel or marking them Off-Signed is done here, through Vessel and Status.",
      },
      {
        title: "Edit personal details on the profile",
        text: "Open the crew member's profile and click **Edit** (top right).",
        image: img("crew-profile", "The profile Edit button", [{ x: 1476, y: 69, w: 59, h: 29 }]),
      },
      {
        title: "Update and save",
        text: "**Edit personal details** holds the fuller record used on visa forms: date of birth, gender, nationality, place and country of birth, marital status, parents' names, occupation, religion, contact details and address. Click **Save**.",
        image: img("crew-edit", "Edit personal details", [{ x: 989, y: 574, w: 51, h: 30 }]),
      },
      {
        title: "Remove a crew member",
        text: "Click the bin under **Actions** and confirm **Remove crew member?**. The record goes to the Recycle Bin for 90 days, so it can be restored if removed by mistake.",
        image: img("crew-list", "The bin (remove) icon", [{ x: 1444, y: 396, w: 24, h: 26 }]),
      },
    ],
  },

  // ── Compliance ────────────────────────────────────────────────────────────
  {
    id: "compliance-overview",
    title: "Check visa compliance",
    summary: "See which crew hold a valid visa, who is at risk and who is in breach — fleet-wide or per vessel.",
    section: "Operations",
    screens: ["compliance"],
    minutes: 2,
    steps: [
      {
        title: "Open Compliance",
        text: "Click **Compliance** in the Operations menu. It opens on **Global** — every vessel together.",
        image: img("compliance", "The Compliance screen", [{ x: 10, y: 212, w: 143, h: 34 }]),
      },
      {
        title: "Pick a vessel",
        text: "Choose a yacht from **Choose a vessel…** to see just its crew. Click **Global** to go back to the whole fleet.",
        image: img("compliance", "Global and vessel picker", [{ x: 177, y: 113, w: 255, h: 31 }]),
      },
      {
        title: "Read the score and cards",
        text: "**Compliance score** is the share of crew with a valid visa. The cards split everyone into:",
        bullets: [
          "**Compliant** — valid visa.",
          "**At risk** — visa expiring within 30 days.",
          "**Breach** — visa already expired.",
          "**No visa** — no visa on record.",
        ],
        image: img("compliance", "Compliance score and status cards", [{ x: 177, y: 178, w: 1378, h: 215 }]),
      },
      {
        title: "Work the lists",
        text: "**Breaches — expired** lists the crew in breach with how many days overdue; **At risk — expiring soon** lists those about to expire. Start renewals from Services → Immigration.",
        image: img("compliance", "Breach and at-risk lists", [
          { x: 177, y: 406, w: 684, h: 304 },
          { x: 871, y: 406, w: 684, h: 304 },
        ]),
      },
    ],
  },

  // ── Permits ───────────────────────────────────────────────────────────────
  {
    id: "permits-command-centre",
    title: "Track permits in the Command Centre",
    summary: "See every permit across the fleet and catch the ones that are expired or about to expire.",
    section: "Operations",
    screens: ["permits"],
    minutes: 2,
    steps: [
      {
        title: "Open Permits",
        text: "Click **Permits** in the Operations menu. The **Command Centre** tab opens first; the other tabs hold each permit type (Exit & Entry, Sanitation, Cruising, Gate Pass, TDRA, Navigation License, DMA, Abu Dhabi).",
        image: img("permits-command-centre", "The Permit Command Centre", [{ x: 190, y: 55, w: 1235, h: 33 }]),
      },
      {
        title: "Use the status cards",
        text: "Click a card to filter the list: **Overdue** (already expired), **Critical** (7 days or less), **Expiring Soon** (8–30 days) and **No Expiry Set** (needs a date). The red banner counts everything urgent.",
        image: img("permits-command-centre", "Permit status cards", [
          { x: 197, y: 163, w: 1338, h: 78 },
          { x: 1277, y: 104, w: 260, h: 30 },
        ]),
      },
      {
        title: "Search and filter",
        text: "Search by permit number, holder or vessel, or pick from **All vessels** and **All permit types**. Each row shows the time left; click **View** to open the permit on its own tab.",
        image: img("permits-command-centre", "Search and filters", [{ x: 197, y: 263, w: 650, h: 28 }]),
      },
    ],
  },
  {
    id: "permits-add",
    title: "Add a new permit",
    summary: "Record a gate pass, navigation licence or any other permit and email it to the yacht.",
    section: "Operations",
    screens: ["permits", "vessels"],
    minutes: 4,
    steps: [
      {
        title: "Open the permit type's tab",
        text: "In **Permits**, click the tab for the kind of permit — for example **Gate Pass** or **Navigation License**. Each tab lists that type with Total, Active, Expiring and Expired counts.",
        image: img("permits-gate-pass-list", "The Gate Pass tab", [{ x: 941, y: 55, w: 94, h: 33 }]),
      },
      {
        title: "Click New permit",
        text: "Click **New permit** at the top right. Each permit type has its own form with the fields that permit needs.",
        image: img("permits-gate-pass-list", "The New permit button", [{ x: 1435, y: 104, w: 101, h: 30 }]),
      },
      {
        title: "Example — Gate Pass",
        text: "Enter the **Visitor Name** and **Visitor Email**, the **Purpose of Visit**, the **Access Zone / Gate**, the associated **Yacht**, the **Entry Date** and **Expiry / Exit Date**, the **Pass Type**, the **Quotation / Ref Number** and the **Status**. Use **Attach file** to add the pass itself.",
        image: img("permits-gate-pass-new", "New Gate Pass form", [{ x: 529, y: 498, w: 510, h: 73 }]),
      },
      {
        title: "Example — Navigation License",
        text: "Choose the **Boat Name**, then fill in the dates, **Client Name/Purser**, **Email**, **Authority**, **Permit Number**, **License No.** and **Status**. Drop the licence and any supporting documents into **Attachments for Client**.",
        image: img("permits-nav-license-new", "New Navigation License form", [{ x: 960, y: 190, w: 171, h: 312 }]),
      },
      {
        title: "Save, or email and save",
        text: "Click **Save only** / **Create Gate Pass** to record the permit, or **Email Pass & Save** / **Email & Save** to also email it, with its attachments, to the client.",
        image: img("permits-nav-license-new", "Save and email buttons", [{ x: 895, y: 535, w: 237, h: 32 }]),
        tip: "Set the Expiry Date — permits without one show under \"No Expiry Set\" and get no reminders.",
      },
    ],
  },
  {
    id: "permits-edit",
    title: "Edit or renew a permit",
    summary: "Correct a permit, update its dates when it is renewed, resend it or delete it.",
    section: "Operations",
    screens: ["permits"],
    minutes: 2,
    steps: [
      {
        title: "Find the permit",
        text: "Open the permit type's tab and search by permit number, yacht or holder, or filter by status. From the Command Centre, click **View** on any row to jump straight to it.",
        image: img("permits-gate-pass-list", "Permit list with search and filters", [{ x: 963, y: 104, w: 465, h: 30 }]),
      },
      {
        title: "Edit",
        text: "Click the pencil at the end of the row. The same form opens with the permit's details — change what you need and save.",
        image: img("permits-nav-license-new", "Permit list with the pencil (edit) column", [{ x: 1520, y: 275, w: 40, h: 425 }]),
      },
      {
        title: "Renewing a permit",
        text: "When a permit is renewed, open it with the pencil and update the **Issue Date**, **Expiry Date**, permit number and **Status** (set it to Active). Attach the new document. The expiry reminders restart from the new date.",
        tip: "Prefer to keep the old permit for the record? Add the renewal as a new permit instead and set the old one to Expired.",
      },
      {
        title: "Resend or delete",
        text: "Use **Send** / **Resend** on the row to email the permit to the client again. The bin deletes a permit entered by mistake (you'll be asked to confirm).",
      },
    ],
  },
  {
    id: "permits-inbox",
    title: "File permits from the Permit Inbox",
    summary: "Check permits that arrive by email, file them to the vessel and send them to the yacht.",
    section: "Operations",
    screens: ["permits"],
    minutes: 4,
    steps: [
      {
        title: "Open the Inbox",
        text: "In **Permits**, click **Inbox**. The badge shows how many permits are waiting. Polaris watches the permit mailboxes shown at the top and reads every permit PDF that arrives. Click **Check now** to look for new mail immediately, or **Upload a permit** to add a PDF yourself.",
        image: img("permits-inbox", "The Permit Inbox", [
          { x: 329, y: 55, w: 95, h: 33 },
          { x: 1305, y: 100, w: 238, h: 29 },
        ]),
      },
      {
        title: "Pick a permit to review",
        text: "**To review** lists each permit with the vessel, permit type, number and who sent it. Click one to see the PDF and the details Polaris read from it.",
        image: img("permits-inbox", "Permits waiting for review", [{ x: 177, y: 175, w: 262, h: 520 }]),
      },
      {
        title: "Check the details",
        text: "On the right, check the **Vessel** (Polaris suggests one and tells you why), **Permit type**, **Phase**, **Permit number**, **Issued** and **Expires** dates and **Port**. Under **In Polaris** choose **Add as a new permit** or the existing permit it updates.",
        image: img("permits-inbox", "Review panel", [{ x: 1230, y: 190, w: 312, h: 505 }]),
      },
      {
        title: "File it, and send it to the yacht",
        text: "Leave **Copy the PDF to the vessel's SharePoint folder** ticked and check the folder. Check the **Yacht email** (taken from the previous permit; separate several with commas). Then click:",
        bullets: [
          "**Confirm & file** — save it in Polaris and SharePoint.",
          "**Confirm, file & send to yacht** — also email it to the yacht as a secure link.",
          "**Not a permit** or **Reject** — clear it from the list.",
        ],
        image: img("permits-inbox-actions", "Filing buttons", [{ x: 1240, y: 572, w: 200, h: 100 }]),
      },
      {
        title: "Send a filed permit later",
        text: "Open the **Filed** sub-tab to see everything already filed. Use **Send to yacht** (or **Send again**) on any of them. Every permit email is recorded in the vessel's Activity Log.",
        image: img("permits-inbox", "Filed sub-tab", [{ x: 259, y: 145, w: 48, h: 25 }]),
      },
    ],
  },

  // ── Wall Displays ─────────────────────────────────────────────────────────
  {
    id: "wall-displays",
    title: "Pair an office TV (Wall Displays)",
    summary: "Put the Port Operations board on an office screen and choose what it shows.",
    section: "Operations",
    screens: ["route-wall-displays"],
    minutes: 3,
    steps: [
      {
        title: "Open /wall on the TV",
        text: "On the TV's browser, open **polaris.jlsyachts.com/wall**. The screen shows a pairing code. Nothing confidential is ever shown on the board — crew movements are counts only, no names.",
        image: img("wall-displays", "Wall Displays page", [{ x: 456, y: 122, w: 176, h: 18 }]),
      },
      {
        title: "Enter the code and a name",
        text: "In Polaris, open **Operations → Wall Displays**. Under **Pair a screen**, type the **Code on the screen** and give the screen a **Name**, e.g. \"Port Ops office TV\".",
        image: img("wall-displays", "Pair a screen form", [{ x: 472, y: 200, w: 788, h: 62 }]),
      },
      {
        title: "Choose what to show",
        text: "Under **Show on this screen**, click panels on or off: Vessels in country, Arriving, Departures, Live map, Crew movements, Bunker deliveries, Cruising permits expiring and Weather & sea. Tick **Interactive** to let people tap a boat for its details — the board resets itself after 2 minutes untouched.",
        image: img("wall-displays", "Panels and interactive option", [{ x: 472, y: 272, w: 680, h: 120 }]),
      },
      {
        title: "Pair it",
        text: "Click **Pair screen**. Within a few seconds the TV switches to the live board, and it remembers it's paired from then on.",
        image: img("wall-displays", "Pair screen button", [{ x: 472, y: 405, w: 86, h: 32 }]),
      },
      {
        title: "Change or unpair a screen",
        text: "**Paired screens** lists every TV with whether it's online. Rename it, change its panels or the Interactive option, then click **Save**. **Unpair** sends the TV back to showing a pairing code.",
        image: img("wall-displays", "Paired screens", [{ x: 473, y: 514, w: 786, h: 167 }]),
      },
    ],
  },

  // ══ Services ══════════════════════════════════════════════════════════════

  // ── Immigration ───────────────────────────────────────────────────────────
  {
    id: "visa-new-application",
    title: "Start a new visa application",
    summary: "Apply for a crew visa step by step — country, crew member, passport, details and submit.",
    section: "Services",
    screens: ["immigration"],
    minutes: 6,
    steps: [
      {
        title: "Click New Application",
        text: "Open **Immigration**, stay on the **Visa** tab and click **New Application**.",
        image: img("visa-list", "Visa Applications list", [{ x: 1410, y: 169, w: 126, h: 31 }]),
      },
      {
        title: "Choose the country",
        text: "Pick the destination country — **UAE** is selected for you. Click a card once to select it, then click it again (or double-click) to continue. The bar at the top shows which step you're on.",
        image: img("visa-new-country", "Select Destination Country", [
          { x: 203, y: 332, w: 437, h: 47 },
          { x: 177, y: 158, w: 1378, h: 82 },
        ]),
        tip: "Progress saves automatically. Click Save & exit to finish later — the application waits in the list as a Draft, with Resume next to it.",
      },
      {
        title: "Find the crew member",
        text: "Type the **Full Name (as per passport)** and, if you have it, the **Date of Birth**, then click **Search**. Polaris matches on name and date of birth so the same person is never added twice.",
        image: img("visa-new-crew", "Search existing crew", [
          { x: 220, y: 374, w: 1292, h: 52 },
          { x: 220, y: 439, w: 72, h: 31 },
        ]),
      },
      {
        title: "Use a profile or create a new one",
        text: "Click **Use profile** next to the right person. If nobody matches, click **None of these — create new** and fill in **First Name**, **Last Name** and **Date of Birth** (all required), then **Save crew member**. Click **Continue**.",
        image: img("visa-new-crew", "Matching crew profiles", [{ x: 1416, y: 561, w: 82, h: 28 }]),
        tip: "If the crew member already has an open application, Polaris tells you and links to it — open that one instead of starting another.",
      },
      {
        title: "Choose or add the passport",
        text: "**Passport Details** lists the passports on file — click **Select** on the one for this application (always choose; Polaris never picks for you). No passport yet, or a second nationality? Click **Add Passport** / **Add another passport**:",
        bullets: [
          "Upload the **Passport Inside Pages** — Polaris reads the details from the scan for you to check.",
          "Add the **Passport Cover** and **Headshot Photo** (both required) and the **Seaman's Book** (or tick No Seaman's book).",
          "Tick every item in the **Passport Checklist** and the confirmation, then **Save Passport**.",
        ],
      },
      {
        title: "Fill in the country details",
        text: "The **Application Details** step shows the fields this country needs — required ones are marked with *. The vessel name is filled in for you. Crew without a seaman's book can use **Generate verification letter**. Click **Continue**.",
      },
      {
        title: "Review and submit",
        text: "**Review & Submit** shows everything on one page — use **✎ Edit** to fix personal details, **Copy details** or **Download CSV** if you need them elsewhere. Click **Submit Application**. It appears in the list as **Submitted**.",
        tip: "UAE visas must be approved before the crew member travels — allow at least 1–2 working days.",
      },
    ],
  },
  {
    id: "visa-manage",
    title: "Track and update visa applications",
    summary: "Find an application, change its status, attach the issued visa and send it to the vessel.",
    section: "Services",
    screens: ["immigration"],
    minutes: 4,
    steps: [
      {
        title: "Filter the list",
        text: "On **Immigration → Visa**, click a status chip (**Draft**, **Pending Docs**, **Submitted**, **Approved**, …) to filter, and narrow further with the search box, **All Vessels**, **All Years**, **Active / Expired / All** and the **From / To** dates. **Current** shows open applications; **All history** shows every one.",
        image: img("visa-list", "Status chips and filters", [
          { x: 197, y: 226, w: 664, h: 31 },
          { x: 197, y: 268, w: 1056, h: 32 },
        ]),
      },
      {
        title: "Check the compliance alerts",
        text: "The red banner at the top and **N compliance alerts require attention** list crew whose visa has expired or whose activation window has passed. Click **▼ Show** to see them.",
        image: img("visa-list", "Compliance alerts", [
          { x: 197, y: 107, w: 1338, h: 39 },
          { x: 197, y: 314, w: 1338, h: 35 },
        ]),
      },
      {
        title: "Open an application",
        text: "Click **View** on a row (or the row itself). **Edit** opens the application's details for correction; drafts show **Resume** instead.",
        image: img("visa-list", "View and Edit", [{ x: 1440, y: 420, w: 86, h: 30 }]),
      },
      {
        title: "Change the status",
        text: "Under **Update Status**, click the new status — **→ Submitted**, **→ In Review**, **→ On Board**, **→ Signed Off**, **→ Cancelled**, … and confirm. Cancelling asks for the cancellation date. Every change is kept in **Status History**.",
        image: img("visa-detail", "Update Status panel", [{ x: 629, y: 170, w: 199, h: 133 }]),
      },
      {
        title: "Attach the issued visa",
        text: "When the visa is granted, drag the PDF onto **Issued Visa** (or click it). Polaris files it, checks the name matches and marks the application **Approved**. Use **Replace** if you attached the wrong file.",
        image: img("visa-detail", "Issued Visa panel", [{ x: 629, y: 320, w: 199, h: 109 }]),
      },
      {
        title: "Send it to the vessel",
        text: "Click **Send to Vessel**, enter the captain's email and send — the vessel receives the visa straight away. **Edit Passport** corrects the passport used on this application.",
        image: img("visa-detail", "Send to Vessel button", [{ x: 1167, y: 104, w: 113, h: 29 }]),
      },
      {
        title: "Reports and bulk updates",
        text: "**Reports** opens the visa reports. Choose a vessel to enable **⬇ CSV** and **⬇ PDF** exports. Tick several rows to cancel visas or set arrival, sign-on or sign-off dates for all of them at once.",
        image: img("visa-list", "Reports and export buttons", [
          { x: 1184, y: 169, w: 82, h: 31 },
          { x: 1355, y: 268, w: 181, h: 32 },
        ]),
      },
    ],
  },
  {
    id: "sign-on-off",
    title: "Record a sign on or sign off",
    summary: "Log crew joining or leaving a vessel, with flights and transport, and the immigration crew lists.",
    section: "Services",
    screens: ["immigration"],
    minutes: 3,
    steps: [
      {
        title: "Open Sign On / Off",
        text: "Open **Immigration** and click the **Sign On / Off** tab. Every movement is listed with the crew member, vessel, date, port and whether the immigration crew list has been done (**DXB list** / **AUH**).",
        image: img("signonoff-list", "Sign On / Sign Off list", [{ x: 262, y: 55, w: 116, h: 33 }]),
      },
      {
        title: "Click Record Event",
        text: "Click **Record Event** (top right). Use the search and the **All Yachts**, **All Events** and immigration filters to find existing movements.",
        image: img("signonoff-list", "Record Event and filters", [
          { x: 1427, y: 104, w: 108, h: 31 },
          { x: 402, y: 104, w: 616, h: 31 },
        ]),
      },
      {
        title: "Choose the event and crew",
        text: "Pick **Sign On** or **Sign Off**, choose the **Vessel** to narrow the list, then tick one or more **Crew Members** — everyone ticked gets the same event.",
        image: img("signonoff-record", "Event type and crew members", [
          { x: 594, y: 117, w: 380, h: 33 },
          { x: 594, y: 215, w: 380, h: 196 },
        ]),
      },
      {
        title: "Add the date, port and flight",
        text: "Set the **Date** (required) and **Port**. Under **Flight & logistics** add the airline, flight number, airports and times, the driver, the crew contact and whether a **Pickup** is needed. Click **Sign On** / **Sign Off** to save.",
        image: img("signonoff-record", "Date, port and flight details", [{ x: 594, y: 421, w: 380, h: 245 }]),
      },
      {
        title: "Immigration crew lists",
        text: "Use **Dubai Imm.** or **AUH Imm.** to record the crew list submitted to Dubai or Abu Dhabi immigration for a vessel and date (Dubai needs the crew list file). The row then shows **DXB list** / **AUH done**.",
        image: img("signonoff-list", "Dubai and AUH immigration buttons", [{ x: 1025, y: 104, w: 198, h: 31 }]),
      },
      {
        title: "Edit, copy or delete",
        text: "Each row has icons to duplicate, edit or delete the event. Tick rows to **Generate report** as a CSV.",
        image: img("signonoff-list", "Row actions", [{ x: 1448, y: 208, w: 74, h: 28 }]),
      },
    ],
  },
  {
    id: "seaport-request",
    title: "Raise and complete a seaport immigration request",
    summary: "Send our Port & Agency Team a vessel's weekly sign-ons and sign-offs, then track them to completion.",
    section: "Services",
    screens: ["route-seaport"],
    minutes: 4,
    steps: [
      {
        title: "Click New Request",
        text: "Open **Seaport Immigration** and click **New Request**. The page lists every request with its vessel, week, crew count, status and SLA.",
        image: img("seaport-queue", "Seaport Immigration", [{ x: 1431, y: 70, w: 104, h: 28 }]),
      },
      {
        title: "Choose the vessel and week",
        text: "Select the **Vessel** and the **Week / date covered**, and add any **Notes**.",
        image: img("seaport-new", "Vessel and week", [{ x: 393, y: 134, w: 946, h: 48 }]),
      },
      {
        title: "Add arrivals and departures",
        text: "Under **Arrivals (Sign On)** and **Departures (Sign Off)**, fill one row per crew member: name, date, time, flight number and contact. Tick **Pickup** if they need transport. Click **Add row** for more (up to 15 each); the bin removes a row.",
        image: img("seaport-new", "Arrivals and departures", [
          { x: 393, y: 198, w: 946, h: 207 },
          { x: 393, y: 421, w: 946, h: 208 },
        ]),
      },
      {
        title: "Submit",
        text: "Click **Submit**. The request opens on its own page with its status and a 4-hour SLA timer, and appears in the Seaport Immigration list for our Port & Agency Team.",
        image: img("seaport-new", "Submit button", [{ x: 1452, y: 70, w: 84, h: 28 }]),
      },
      {
        title: "Work the request (Port & Agency Team)",
        text: "On the request page click **Acknowledge**, then mark each crew row **Done** or **No-show** as it's completed. When every row is finished, click **Mark complete**, then **Send report** to email the completion report to whoever raised it.",
        tip: "The SLA bar turns amber at 75% of the 4 hours and red once it's overdue.",
      },
    ],
  },

  // ── Logistics ─────────────────────────────────────────────────────────────
  {
    id: "logistics-overview",
    title: "Find your way around Logistics",
    summary: "What each Logistics (ShipSync) tab is for, and the overview of what's coming in and going out.",
    section: "Services",
    screens: ["logistics"],
    minutes: 3,
    steps: [
      {
        title: "Open Logistics",
        text: "Click **Logistics** under Services. **Overview** shows imports on the way, transit shipments, open exports, parcels waiting to go out and parcels out for delivery — with tables of what's due and anything missing an ETA or ETD.",
        image: img("logistics-overview", "Logistics overview", [{ x: 197, y: 211, w: 1331, h: 93 }]),
      },
      {
        title: "The tabs",
        text: "Use the tabs across the top:",
        bullets: [
          "**Local Packages** — parcels received in the office and their delivery.",
          "**Import** / **Export** / **EDAS** / **Gate Pass** — shipment boards for each kind of job.",
          "**Routing** and **Dispatched** — plan delivery runs and their delivery notes.",
          "**Warehouse** — storage, shelves and warehouse requests.",
          "**Locations**, **Drivers**, **Van Tracking**, **Printers** — set-up and live van positions.",
          "**Dashboard** — charts and working detail.",
        ],
        image: img("logistics-overview", "Logistics tabs", [{ x: 190, y: 90, w: 1340, h: 30 }]),
      },
      {
        title: "Mobile and driver apps",
        text: "**Logistics app**, **Logistics mobile** and **Driver app** open the phone-friendly apps in a new tab — for checking parcels in on a phone, or for drivers to see and complete their deliveries.",
        image: img("logistics-overview", "App buttons", [{ x: 1218, y: 57, w: 318, h: 29 }]),
      },
    ],
  },
  {
    id: "logistics-check-in",
    title: "Check in a package",
    summary: "Book a parcel into the office so it can be stored and delivered to the yacht.",
    section: "Services",
    screens: ["logistics"],
    minutes: 3,
    steps: [
      {
        title: "Open Local Packages",
        text: "In **Logistics**, click **Local Packages**. The pills split parcels into **In the office**, **Assigned** (on a route) and **Delivered**. Search by barcode, boat, delivery note, invoice or receiver — press **/** to jump to the search box.",
        image: img("logistics-packages", "Local Packages", [
          { x: 197, y: 128, w: 351, h: 31 },
          { x: 197, y: 193, w: 236, h: 31 },
        ]),
      },
      {
        title: "Click Check in package",
        text: "Click **Check in package** (top right).",
        image: img("logistics-packages", "Check in package button", [{ x: 1327, y: 193, w: 128, h: 31 }]),
      },
      {
        title: "Scan and fill in the details",
        text: "Scan or type the **Barcode / AWB** (or use **Scan** with the camera) and enter the **Boat / vessel** — one of the two is required. Add the receiver, courier, number of packages, priority, warehouse zone and a description. **Add photo** keeps a picture of the parcel as received.",
        image: img("logistics-checkin", "Check in package form", [{ x: 529, y: 108, w: 511, h: 50 }]),
      },
      {
        title: "Check it in",
        text: "Click **Check in**. The parcel appears under **In the office**, ready to be routed to a driver.",
        image: img("logistics-checkin", "Check in button", [{ x: 968, y: 606, w: 72, h: 30 }]),
        tip: "Changes made directly in the table save straight away. Tick several parcels and use Update selected to change their status or invoice number in one go.",
      },
    ],
  },
  {
    id: "logistics-route",
    title: "Route and dispatch deliveries",
    summary: "Put waiting parcels on a route, choose the driver and van, and dispatch the run.",
    section: "Services",
    screens: ["logistics"],
    minutes: 3,
    steps: [
      {
        title: "Open Routing",
        text: "In **Logistics**, click **Routing**. **To route** shows how many parcels are waiting; pick the delivery date. The **Delivery calendar** on the right shows which boats get a regular delivery on each day.",
        image: img("logistics-routing", "Routing", [
          { x: 197, y: 135, w: 365, h: 28 },
          { x: 1190, y: 135, w: 346, h: 393 },
        ]),
      },
      {
        title: "Add clients to the route",
        text: "Click **Add client to this route…** and choose a boat — its waiting parcels are added. **Scan** adds individual parcels with the scanner; **Add route** starts a second run.",
        image: img("logistics-routing", "Add client and scan", [
          { x: 211, y: 228, w: 237, h: 26 },
          { x: 733, y: 182, w: 64, h: 28 },
          { x: 1084, y: 135, w: 90, h: 28 },
        ]),
      },
      {
        title: "Choose the driver and van, then dispatch",
        text: "Pick the driver in **Choose driver…** and the vehicle in **Choose van…**. **Dispatch** becomes available once a driver, van and parcels are set — click it to send the run to the driver's app.",
        image: img("logistics-routing", "Driver, van and Dispatch", [{ x: 803, y: 182, w: 358, h: 28 }]),
      },
      {
        title: "Follow up in Dispatched",
        text: "The **Dispatched** tab holds each run's delivery note. From there you can change the driver, print the pre-delivery or delivery note, and email the pre-delivery note or proof of delivery to the client.",
        image: img("logistics-routing", "Dispatched tab", [{ x: 848, y: 90, w: 85, h: 30 }]),
      },
    ],
  },
  {
    id: "logistics-warehouse",
    title: "Store items in the warehouse",
    summary: "Check warehouse capacity and register client or internal items into storage.",
    section: "Services",
    screens: ["logistics"],
    minutes: 3,
    steps: [
      {
        title: "Open the Warehouse",
        text: "In **Logistics**, click **Warehouse**. **Shelf Dashboard** shows total, occupied and available space, how full each zone is, and who is using the storage.",
        image: img("logistics-warehouse", "Warehouse capacity", [{ x: 197, y: 184, w: 1338, h: 243 }]),
      },
      {
        title: "Register new storage",
        text: "Click **New Storage** and choose **Client** (a yacht's items) or **Internal** (a JLS department's documents or assets).",
        image: img("logistics-new-storage", "New Storage", [
          { x: 635, y: 140, w: 98, h: 26 },
          { x: 502, y: 184, w: 144, h: 32 },
        ]),
      },
      {
        title: "Fill in the item",
        text: "For a client, **Client Name** and **Description** are required. Add the dimensions and weight (the CBM is worked out for you), the charges, date stored and due date, and the **Zone**, **Bay** and **Shelf** it's going on. Attach the packing list, then click **Register storage**.",
        image: img("logistics-new-storage", "Storage form", [{ x: 516, y: 252, w: 701, h: 129 }]),
      },
      {
        title: "Find and request items",
        text: "**Search** and **Inventory List** find what's stored where; **Zone & Storage Status** shows each zone. **Requests** is where the team raise incoming, picking and dispatch requests for the warehouse.",
        image: img("logistics-warehouse", "Warehouse sub-tabs", [{ x: 197, y: 136, w: 621, h: 35 }]),
      },
    ],
  },

  // ── Crew Care ─────────────────────────────────────────────────────────────
  {
    id: "crewcare-job-card",
    title: "Raise and handle a Crew Care job card",
    summary: "Request transport or crew logistics, and take a job card through to a trip.",
    section: "Services",
    screens: ["route-crew-cab"],
    minutes: 3,
    steps: [
      {
        title: "Open Crew Care",
        text: "Click **Crew Care**. **Job Cards** lists requests for the Crew Care team — from captains in the Client Portal and from staff. Switch between **Open**, **Completed & cancelled** and **All**, or search.",
        image: img("crewcare-jobs", "Job Cards", [{ x: 197, y: 163, w: 238, h: 25 }]),
      },
      {
        title: "Click New job card",
        text: "Click **New job card**.",
        image: img("crewcare-jobs", "New job card button", [{ x: 1415, y: 113, w: 120, h: 30 }]),
      },
      {
        title: "Describe the job",
        text: "Choose the **Type** (Transfer, Driver needed, Airport run, …) and **Priority**, and write a **Summary** (required), e.g. \"Driver for 2 crew to DXB\". Add who asked, the vessel, pick-up and drop-off, date & time, passengers and any details. Click **Raise job card** — the Crew Care team is notified.",
        image: img("crewcare-new-job", "New job card form", [
          { x: 594, y: 228, w: 380, h: 45 },
          { x: 850, y: 532, w: 124, h: 31 },
        ]),
      },
      {
        title: "Handle the job",
        text: "Open a job card to set its **Status** and **Assigned to** (assigning someone marks it Acknowledged). Click **Create trip** to turn it into a trip — then assign the driver and vehicle in **Trips**. Finish with **Mark completed**.",
        tip: "Notifications chooses who is emailed or messaged in Teams when a new job card comes in.",
      },
    ],
  },
  {
    id: "crewcare-trips",
    title: "Book a trip and assign a driver",
    summary: "Create transport trips — airport runs, crew changes, staff shuttles — and assign drivers and vehicles.",
    section: "Services",
    screens: ["route-crew-cab"],
    minutes: 3,
    steps: [
      {
        title: "Open Trips",
        text: "In **Crew Care**, click **Trips**. Filter by type with the chips — Arrival Transport, Departure Transport, Crew Pickup, Airport Transfer, Seaport Crew Change, **Staff Shuttle** and more — or search.",
        image: img("crewcare-trips", "Trips list", [{ x: 190, y: 131, w: 812, h: 27 }]),
      },
      {
        title: "Click New Trip",
        text: "Click **New Trip**.",
        image: img("crewcare-trips", "New Trip button", [{ x: 1451, y: 97, w: 88, h: 29 }]),
      },
      {
        title: "Fill in the trip",
        text: "Choose the **Trip Type** and **Status**, the **Passenger Name** and **Yacht**, then the **Driver** and **Vehicle**. Add the **Flight Number** for airport pickups, the **Pickup** and **Drop-off Location** (saved locations or any address) and the times. The route shows on the map.",
        image: img("crewcare-new-trip", "New Trip form", [
          { x: 433, y: 240, w: 466, h: 45 },
          { x: 433, y: 348, w: 466, h: 100 },
        ]),
      },
      {
        title: "Create the trip",
        text: "Click **Create Trip**.",
        image: img("crewcare-new-trip", "Create Trip button", [{ x: 1058, y: 617, w: 78, h: 26 }]),
        tip: "In the Trips table you can click any cell to change it — Enter or Tab saves it straight away. Add trip at top adds a blank row.",
      },
    ],
  },

  // ── Compass Card ──────────────────────────────────────────────────────────
  {
    id: "compass-card",
    title: "Handle Compass Card sign-ups and offers",
    summary: "See new app sign-ups, vendor requests and offers, and open them in the Compass Card admin portal.",
    section: "Services",
    screens: ["route-compass-card"],
    minutes: 2,
    steps: [
      {
        title: "Open Compass Card",
        text: "Click **Compass Card**. The cards count app sign-ups, vendor requests and offers in the last 7 days, and the list shows each one with its status (Pending, Approved, …).",
        image: img("compass-card", "Compass Card", [{ x: 197, y: 127, w: 1338, h: 70 }]),
      },
      {
        title: "Filter",
        text: "Click **Sign-ups**, **Vendors** or **Offers**, or search by name, email or offer.",
        image: img("compass-card", "Filters", [
          { x: 197, y: 209, w: 235, h: 27 },
          { x: 1325, y: 209, w: 210, h: 27 },
        ]),
      },
      {
        title: "Approve in the admin portal",
        text: "Click an item to see its details, then **Open in Compass Card admin** to approve or reject it there. Polaris shows the activity; the decision is made in the Compass Card portal.",
      },
      {
        title: "Get notified",
        text: "**Notifications** chooses who hears about new sign-ups and about vendors and offers, and whether they're emailed too.",
        image: img("compass-card", "Notifications button", [{ x: 1419, y: 77, w: 116, h: 30 }]),
      },
    ],
  },

  // ── Agency ────────────────────────────────────────────────────────────────
  {
    id: "agency-contacts",
    title: "Manage Agency Network contacts",
    summary: "Keep the directory of owners, captains, agents, suppliers, marinas and authorities up to date.",
    section: "Services",
    screens: ["route-agency"],
    minutes: 2,
    steps: [
      {
        title: "Open Agency",
        text: "Click **Agency**. **Agency Network** lists every contact with their type, organisation, email and country. Search, filter by type with **All Status**, sort, or click a type count (Owner, Captain, Agent, …) under the title.",
        image: img("agency-list", "Agency Network", [
          { x: 862, y: 69, w: 481, h: 30 },
          { x: 197, y: 120, w: 505, h: 20 },
        ]),
      },
      {
        title: "Add a contact",
        text: "Click **Add Contact**. **Name** is required; add the **Type**, **Organisation**, **Vessel**, email, phone, country, region and notes, then click **Add Contact**.",
        image: img("agency-add", "Add Contact form", [
          { x: 529, y: 205, w: 511, h: 44 },
          { x: 949, y: 513, w: 91, h: 31 },
        ]),
      },
      {
        title: "Edit, remove or export",
        text: "Use the pencil on a row to edit it and the bin to remove it (you'll be asked to confirm). **Export** downloads the list.",
        image: img("agency-list", "Row actions and Export", [
          { x: 1462, y: 200, w: 52, h: 26 },
          { x: 1351, y: 69, w: 72, h: 30 },
        ]),
      },
    ],
  },

  // ── Provisioning ──────────────────────────────────────────────────────────
  {
    id: "provisioning-orders",
    title: "Log and track a provisioning order",
    summary: "Record food, beverage, interior, floral and event requests for a yacht and follow them to delivery.",
    section: "Services",
    screens: ["route-provisioning"],
    minutes: 2,
    steps: [
      {
        title: "Open Provisioning",
        text: "Click **Provisioning**. **Superyacht Provisioning** lists every order. The strip under the title counts orders by status — **Requested**, **Sourcing**, **Confirmed**, **Delivered** — click one to filter.",
        image: img750("provisioning-list", "Superyacht Provisioning", [{ x: 197, y: 120, w: 314, h: 20 }]),
      },
      {
        title: "Click Add Order",
        text: "Click **Add Order** (top right, or in the middle of the page when the list is empty).",
        image: img750("provisioning-list", "Add Order button", [{ x: 1438, y: 70, w: 98, h: 29 }]),
      },
      {
        title: "Fill in the order",
        text: "Only **Description** is required. Add the **Vessel**, **Category** (food, beverage, interior, floral, special, event), who **Requested** it, the **Status**, **Delivery Date**, **Amount (AED)** and any notes. Click **Add Order**.",
        image: img750("provisioning-add", "Add Order form", [
          { x: 529, y: 224, w: 511, h: 45 },
          { x: 957, y: 534, w: 83, h: 30 },
        ]),
      },
      {
        title: "Update, find and export",
        text: "Click the pencil on an order to change its status as it moves from Requested to Delivered, then **Save Changes**. Search, filter by **All Status** / **All Category**, sort by delivery date, or **Export** the list to Excel.",
        image: img750("provisioning-list", "Search, filters and export", [{ x: 730, y: 70, w: 702, h: 29 }]),
      },
    ],
  },

  // ── Waypoint Chandlery ────────────────────────────────────────────────────
  {
    id: "waypoint-suppliers",
    title: "Manage chandlery suppliers",
    summary: "Add and update Waypoint's suppliers, and keep them in step with Lightspeed and QuickBooks.",
    section: "Services",
    screens: ["route-waypoint"],
    minutes: 2,
    steps: [
      {
        title: "Open Waypoint Chandlery",
        text: "Click **Waypoint Chandlery**. **Suppliers** lists every supplier with category, contact, email, country and status (**Active**, **Preferred**, **Inactive**). Search or filter by status and category.",
        image: img750("waypoint-list", "Suppliers list", [{ x: 414, y: 70, w: 621, h: 29 }]),
      },
      {
        title: "Add a supplier",
        text: "Click **Add Supplier**. Only **Supplier Name** is required; add the category, contact name, email, phone, country, status and notes, then click **Add Supplier**.",
        image: img750("waypoint-add", "Add Supplier form", [
          { x: 529, y: 224, w: 251, h: 45 },
          { x: 945, y: 534, w: 95, h: 30 },
        ]),
      },
      {
        title: "Edit or remove",
        text: "Use the pencil on a row to edit a supplier (for example to mark them Preferred), or the bin to remove them. **Export** downloads the list.",
        image: img750("waypoint-list", "Row actions", [{ x: 1462, y: 200, w: 52, h: 26 }]),
      },
      {
        title: "Lightspeed and QuickBooks",
        text: "**Sync from Lightspeed** brings the supplier list across from the Lightspeed till system straight away. **SKU → QuickBooks** opens a panel for creating QuickBooks items from Lightspeed products.",
        image: img750("waypoint-list", "Sync buttons", [{ x: 1042, y: 70, w: 297, h: 29 }]),
        tip: "Sync from Lightspeed runs as soon as you click it — no confirmation.",
      },
    ],
  },

  // ── Yacht Shipments ───────────────────────────────────────────────────────
  {
    id: "yacht-shipments",
    title: "Track yacht shipments",
    summary: "Follow yachts being shipped in and out — from new lead to complete — on the shipments board.",
    section: "Services",
    screens: ["route-yacht-shipments"],
    minutes: 3,
    steps: [
      {
        title: "Open Yacht Shipments",
        text: "Click **Yacht Shipments**. Choose **Import**, **Export** or **Tracking** (live positions). The board groups shipments by status: **New Lead**, **In Progress**, **On Hold**, **Complete**, **Cancelled**.",
        image: img750("yacht-shipments", "Yacht Shipments board", [
          { x: 197, y: 124, w: 174, h: 30 },
          { x: 210, y: 210, w: 178, h: 23 },
        ]),
      },
      {
        title: "Filter the board",
        text: "Search by yacht, and filter by status, arrival port and ETA (next 30 days, this month, passed, no ETA). On Export the filters use departure port and loading date.",
        image: img750("yacht-shipments", "Search and filters", [{ x: 384, y: 124, w: 585, h: 30 }]),
      },
      {
        title: "Add a shipment",
        text: "Under the right status group, click **Add yacht name**, type the yacht's name or model and press **Add**. Then fill in its row — LOA, ETA, port of loading, arrival port, customs option, remarks and quotation.",
        image: img750("yacht-shipments", "Add yacht name", [{ x: 230, y: 506, w: 110, h: 21 }]),
      },
      {
        title: "Update a shipment",
        text: "Click any cell to change it. Click the **Status** pill to move the shipment to another group, e.g. from New Lead to In Progress.",
        image: img750("yacht-shipments", "Status column", [{ x: 489, y: 240, w: 105, h: 260 }]),
        tip: "Changes save as soon as you press Enter or click away, and the bin deletes a row without asking — take care.",
      },
    ],
  },

  // ── Training ──────────────────────────────────────────────────────────────
  {
    id: "training-documents",
    title: "Find and add training documents",
    summary: "Browse, upload and share the Training Institute's document library.",
    section: "Services",
    screens: ["training"],
    minutes: 2,
    steps: [
      {
        title: "Open Training",
        text: "Click **Training**. **Training documents** shows the folders — permits and licences, assessments, instructors, inspections, quotations and student files. Pick a vessel at the top right to see one vessel's documents.",
        image: img750("training-documents", "Training documents", [{ x: 1367, y: 61, w: 189, h: 31 }]),
      },
      {
        title: "Search or open a folder",
        text: "Type in **Search documents by name…**, or click a folder to open it. The path above the list takes you back up.",
        image: img750("training-documents", "Search documents", [{ x: 1098, y: 189, w: 210, h: 30 }]),
      },
      {
        title: "Add documents and folders",
        text: "Click **Add document** and choose files — they upload straight away (you can also drag files onto the list). **Add folder** makes a new empty folder or uploads a whole folder from your computer.",
        image: img750("training-documents", "Add document and Add folder", [{ x: 1314, y: 189, w: 228, h: 30 }]),
      },
      {
        title: "Share, rename or move",
        text: "Use the **⋯** menu on a document or folder (or right-click it) to **Share with guests…**, **Rename**, **Move to folder…**, **Download**, **Duplicate** or **Remove** it.",
      },
    ],
  },
  {
    id: "training-institute",
    title: "Run the Training Institute",
    summary: "Manage instructors, students, courses and classes, and record certifications.",
    section: "Services",
    screens: ["route-training"],
    minutes: 4,
    steps: [
      {
        title: "Open Training Institute",
        text: "Click **Training Institute**. The tabs cover **Instructors**, **Students**, **Courses**, **Classes**, **Calendar**, **Attendance**, **Tablet** (the training-room sign-in tablet), **Records** and **Certifications**.",
        image: img750("institute-instructors", "JLS Training Institute", [{ x: 197, y: 124, w: 728, h: 34 }]),
      },
      {
        title: "Keep instructors' documents in date",
        text: "**Instructors** shows each instructor's Emirates ID, passport, labour card, residence visa, driving licence and seaman's card expiry dates. Dates in red have expired or are about to.",
        image: img750("institute-instructors", "Instructor expiry dates", [{ x: 360, y: 228, w: 640, h: 96 }]),
      },
      {
        title: "Enrol a student",
        text: "On **Students**, click **Add** at the bottom of the list, type the student's name and press **Add**. Then fill in their row — mobile, email, birthday, payment status and amount, class, instructor and **Enrollment Status**. The paperclip attaches their files.",
        image: img750("institute-students", "Students", [
          { x: 197, y: 183, w: 237, h: 30 },
          { x: 870, y: 228, w: 108, h: 492 },
        ]),
        tip: "These boards save as you type, and the bin deletes a row without asking. Sync from Monday pulls the latest from Monday.com.",
      },
      {
        title: "Set up classes",
        text: "On **Classes**, add a class the same way and set its instructor, **Status** (In Progress, On Hold, Pending Approval, Complete), course, start and end dates and students. **Calendar** holds events; **Attendance** shows who signed in on the tablet.",
        image: img750("institute-classes", "Classes", [{ x: 489, y: 228, w: 112, h: 492 }]),
      },
      {
        title: "Record a certification",
        text: "On **Certifications** (or **Records** for training records), click **Add Certification**. Choose the crew member, the certificate, its type (STCW, Medical, Safety, Flag State, Other), issuing body, issue and expiry dates, and attach the certificate file. Polaris warns when certificates are expiring.",
        image: img750("institute-certifications", "Certifications", [
          { x: 1405, y: 69, w: 131, h: 30 },
          { x: 393, y: 183, w: 946, h: 91 },
        ]),
      },
    ],
  },
  {
    id: "crew-academy",
    title: "Publish a Crew Academy course",
    summary: "Build an online course for yacht crew, publish it and offer it to vessels.",
    section: "Services",
    screens: ["route-academy-admin"],
    minutes: 4,
    steps: [
      {
        title: "Open Crew Academy",
        text: "Click **Crew Academy**. **JLS courses** lists every course with its category, version, which vessels it's offered to and whether it's **Draft** or **Published**. **Shared with JLS** shows vessels' own courses and crew training records shared with us.",
        image: img750("academy-library", "Course library", [{ x: 465, y: 152, w: 179, h: 30 }]),
      },
      {
        title: "Create or open a course",
        text: "Click **New course**, type its title and the editor opens. Or click an existing course to edit it.",
        image: img750("academy-library", "New course button", [{ x: 1163, y: 72, w: 104, h: 30 }]),
      },
      {
        title: "Build the lessons",
        text: "The outline on the left holds sections and lessons — **Add lesson**, or use the **⋯** menus to rename, move or delete. In a lesson, **Add block** inserts text, video, PDF, picture, a quiz, an acknowledgement or exercises. **Course details & files** sets the summary, minutes to complete, pass mark and refresher period.",
        image: img750("academy-editor", "Course editor", [
          { x: 187, y: 112, w: 226, h: 26 },
          { x: 638, y: 388, w: 702, h: 41 },
        ]),
        tip: "The editor saves on its own — the top bar shows Saved. Preview shows the course as crew will see it.",
      },
      {
        title: "Publish",
        text: "Click **Publish** (or **Publish new version** for a course already out) and confirm. If anything still needs fixing, the button lists it first.",
        image: img750("academy-editor", "Publish button", [{ x: 1371, y: 62, w: 139, h: 28 }]),
      },
      {
        title: "Offer it to vessels",
        text: "Open the **⋯** menu (top right) → **Vessels**, then tick **Every vessel** or choose particular vessels, and **Save**. Each vessel then enrols its own crew from the Client Portal.",
        image: img750("academy-editor", "More menu", [{ x: 1515, y: 62, w: 28, h: 28 }]),
      },
    ],
  },

  // ── Yacht IT Solutions ────────────────────────────────────────────────────
  {
    id: "yacht-it-tickets",
    title: "Raise and handle an IT ticket",
    summary: "Log an IT issue in the Service Desk, reply to the requester and resolve it.",
    section: "Services",
    screens: ["yacht-it"],
    minutes: 3,
    steps: [
      {
        title: "Open the Service Desk",
        text: "Click **Yacht IT Solutions**. **Service Desk** lists every ticket. The strip counts **Open**, **In Progress**, **Waiting**, **Resolved** and **Closed** tickets, and the dropdowns filter by queue, priority, category and vessel.",
        image: img750("yacht-it-desk", "Service Desk", [
          { x: 197, y: 160, w: 407, h: 20 },
          { x: 1042, y: 157, w: 494, h: 27 },
        ]),
      },
      {
        title: "Click New Ticket",
        text: "Click **New Ticket**. **Check email** pulls in any replies sent to the IT support mailbox.",
        image: img750("yacht-it-desk", "New Ticket button", [{ x: 1438, y: 104, w: 98, h: 30 }]),
      },
      {
        title: "Describe the issue",
        text: "Enter a **Subject** (required) and a **Description**. Choose the **Vessel**, **Queue**, **Category** and **Priority**, assign it if you know who'll take it, and add who it's for and their email so they get updates. Click **Create Ticket** — the requester gets an acknowledgement email.",
        image: img750("yacht-it-new-ticket", "New Ticket form", [
          { x: 529, y: 189, w: 511, h: 45 },
          { x: 947, y: 568, w: 93, h: 31 },
        ]),
      },
      {
        title: "Work the ticket",
        text: "Click a ticket to open it. Change **Status**, **Priority**, **Assigned to** and the other fields on the right — they save immediately. Write to the requester under **Reply** (**Send reply**), or keep a note for the team under **Internal note**.",
      },
      {
        title: "Resolve it",
        text: "Use **Send & complete** to send your last reply and mark the ticket **Resolved** in one go, or set Status to Resolved. The requester is emailed either way. Fill in **Resolution** and **Save details** for the record.",
      },
    ],
  },

  // ── Anchor ────────────────────────────────────────────────────────────────
  {
    id: "anchor-send-document",
    title: "Send a document for signature (Anchor)",
    summary: "Upload a PDF, send it for e-signature and follow it until it's signed.",
    section: "Services",
    screens: ["anchor"],
    minutes: 3,
    steps: [
      {
        title: "Open Anchor",
        text: "Click **Anchor**. **Documents** lists everything sent for signature, with the signer, status, and sent and signed dates. The strip filters by **Sent**, **Viewed**, **Signed**, **Voided** and more.",
        image: img750("anchor-documents", "Anchor documents", [{ x: 197, y: 156, w: 246, h: 18 }]),
      },
      {
        title: "Click New Document",
        text: "Click **New Document**. (To start from a ready-made document, use the **Templates** tab and click **Use** on a template instead.)",
        image: img750("anchor-documents", "New Document button", [{ x: 1416, y: 104, w: 120, h: 30 }]),
      },
      {
        title: "Fill in the details",
        text: "Enter the **Document title**, **Signer name** and **Signer email** (all required), an optional message, and choose the **Document (PDF)**. Under **Signature placement** pick the page and corner where the signature goes.",
        image: img750("anchor-new-document", "New Document form", [
          { x: 568, y: 210, w: 432, h: 100 },
          { x: 568, y: 417, w: 432, h: 38 },
        ]),
      },
      {
        title: "Save as draft or send",
        text: "**Save draft** keeps it without sending. **Send for signature** emails the signer a secure link straight away (if a company signatory has to approve first, it waits for them).",
        image: img750("anchor-new-document", "Save draft and Send for signature", [{ x: 758, y: 545, w: 243, h: 32 }]),
      },
      {
        title: "Track it",
        text: "Click the document's Ref or title to see its **Audit trail** — sent, viewed and signed. From there you can **Copy link**, **Resend**, **Void** it, and download the original or signed PDF. **Resend** on the list emails the signer again.",
        image: img750("anchor-documents", "Resend button", [{ x: 1444, y: 238, w: 78, h: 27 }]),
      },
    ],
  },

  // ── Crew Placement ────────────────────────────────────────────────────────
  {
    id: "crew-placement",
    title: "Manage placed crew and payroll",
    summary: "Add managed crew, post vacancies, track certificates, contracts, leave and payroll.",
    section: "Services",
    screens: ["crew-placement"],
    minutes: 4,
    steps: [
      {
        title: "Open Crew Placement",
        text: "Click **Crew Placement**. The cards count **Managed Crew**, **Onboard**, **Certs Expiring (60d)** and **Active Contracts**. The tabs run from **Roster** through **Payroll** to the recruitment tabs (**Candidates**, **Pipeline**, **Recruitment Dashboard**).",
        image: img750("crew-placement", "Crew Placement & Payroll", [
          { x: 197, y: 123, w: 1338, h: 66 },
          { x: 197, y: 201, w: 1094, h: 33 },
        ]),
      },
      {
        title: "Add a crew member",
        text: "On **Roster**, click **Add Crew**. Only **Full name** is required; add rank, contact details, nationality, start date, department, vessel, rotation (e.g. 2:2) and salary, then **Save**. Switch between **Ship View** (grouped by vessel) and **List**.",
        image: img750("crew-placement", "Add Crew and view toggle", [
          { x: 518, y: 253, w: 229, h: 28 },
        ]),
      },
      {
        title: "Keep records up to date",
        text: "Click a crew member to open their profile and add documents, certifications, contracts, payslips and bank accounts. Or use the tabs:",
        bullets: [
          "**Certifications** — **Add Certificate** with its number, issuer and expiry.",
          "**Contracts** — **New Contract** walks through salary, trial & notice, travel and review, then **Create contract**; **PDF** produces the contract.",
          "**Leave & Rotation** — **Schedule Leave** for a crew member.",
          "**Vacancies & Pool** — **Post Vacancy** for an open role.",
        ],
      },
      {
        title: "Run payroll",
        text: "On **Payroll**, **New Payslip** adds one payslip; **Run Payroll** creates payslips for every eligible crew member for a month; **Final Pay** works out a leaver's final pay and marks them inactive.",
        tip: "Run Payroll and Final Pay take effect as soon as you confirm them — check the month and the crew member first.",
      },
    ],
  },

  // ── Finance ───────────────────────────────────────────────────────────────
  {
    id: "finance-overview",
    title: "Check invoices and what's outstanding",
    summary: "See invoiced, received, outstanding and overdue totals, and find any invoice, pro-forma or quotation.",
    section: "Services",
    screens: ["finance"],
    minutes: 2,
    steps: [
      {
        title: "Open Finance",
        text: "Click **Finance**. Choose the company at the top right — **JLS Yachts** or **Waypoint**. The **Dashboard** shows the year's **Invoiced**, **Received**, **Outstanding** and **Overdue** totals, the paid / unpaid breakdown, top clients by outstanding and recent payments.",
        image: img750("finance-dashboard", "Finance dashboard", [
          { x: 1390, y: 68, w: 146, h: 30 },
          { x: 197, y: 223, w: 1338, h: 82 },
        ]),
      },
      {
        title: "Find an invoice",
        text: "Open **Invoices**, **Pro-Forma** or **Quotations** and search by number, customer or vessel, or filter by vessel and status. The PDF icon opens the QuickBooks copy.",
        image: img750("finance-dashboard", "Finance tabs", [{ x: 197, y: 133, w: 672, h: 31 }]),
      },
      {
        title: "Refresh from QuickBooks",
        text: "Finance mirrors QuickBooks. Use **Sync** in the header to pull in the latest invoices and payments.",
      },
    ],
  },
  {
    id: "finance-invoice-tracker",
    title: "Make sure work gets invoiced (Invoice Tracker)",
    summary: "Go through each department's billable work and mark it as needing an invoice, invoiced or not billable.",
    section: "Services",
    screens: ["finance"],
    minutes: 3,
    steps: [
      {
        title: "Open the Invoice Tracker",
        text: "In **Finance**, click **Invoice Tracker** and pick a department — **Crew Care**, **ShipSync**, **Yacht IT**, **Procurement**, **Visas** or **Orbit**. The cards count work **Pending Review**, **Needs Invoice**, **Invoiced** and **Not Billable**.",
        image: img750("finance-tracker", "Invoice Tracker", [
          { x: 274, y: 180, w: 479, h: 28 },
          { x: 197, y: 249, w: 1338, h: 57 },
        ]),
      },
      {
        title: "Filter the list",
        text: "Search, and filter by yacht, billing status and type. **Export** downloads the list for Excel.",
        image: img750("finance-tracker", "Search, filters and export", [{ x: 197, y: 318, w: 1338, h: 29 }]),
      },
      {
        title: "Set the billing status",
        text: "Use the icons under **Actions** on each row: **Mark as Needs Invoice**, **Mark as Invoiced** (enter the invoice ref and amount, then **Save**) or **Mark as Not Billable**. **Reset to Pending Review** undoes it.",
        image: img750("finance-tracker", "Row action icons", [{ x: 1444, y: 420, w: 62, h: 26 }]),
        tip: "Needs Invoice, Not Billable and Reset save as soon as you click. On Visas, Generate Invoice creates a real invoice in QuickBooks.",
      },
    ],
  },

  // ── Port Calls ────────────────────────────────────────────────────────────
  {
    id: "port-calls",
    title: "Open a port call (inward clearance)",
    summary: "Create a port call for an arriving yacht and work through its inward clearance steps.",
    section: "Services",
    screens: ["port-calls"],
    minutes: 3,
    steps: [
      {
        title: "Open Port Calls",
        text: "Click **Port Calls**. **Arrivals — Inward Clearance** lists active port calls with the vessel, ETA, status, office and how many clearance steps are done.",
        image: img750("port-calls", "Port Calls", [{ x: 1428, y: 69, w: 111, h: 36 }]),
      },
      {
        title: "Create the port call",
        text: "Click **New Port Call**. Choose the **Vessel** and **Destination Country** (UAE by default) — both required — and add the ETA, ETD and the office and agent handling it. Click **Create Port Call**; Polaris also sets up the pre-arrival document checklist.",
      },
      {
        title: "Work the clearance",
        text: "Open the port call and click **Start Inward Clearance**. Click **Start** and **Complete** on each step as it's done, and set each pre-arrival document to **Valid**, **Invalid** or **Expired** as you check it.",
        tip: "Step buttons and document statuses save as soon as you click them.",
      },
    ],
  },

  // ── Warehouse Requests ────────────────────────────────────────────────────
  {
    id: "warehouse-requests",
    title: "Ask the Warehouse for an incoming, picking or dispatch",
    summary: "Raise a request to the Warehouse with the items and documents, and follow it to completion.",
    section: "Services",
    screens: ["route-warehouse-requests"],
    minutes: 3,
    steps: [
      {
        title: "Choose the type of request",
        text: "Click **Warehouse Requests**, then **New incoming shipment** (something arriving), **New picking request** (items to prepare) or **New dispatch request** (items to deliver to a yacht).",
        image: img750("warehouse-requests", "Request buttons", [{ x: 413, y: 136, w: 541, h: 30 }]),
      },
      {
        title: "Fill in the request",
        text: "Add the yacht or project reference, any delivery order reference and the date — ETA for incoming, needed-by for picking, delivery date for dispatch (dispatch also needs the berth and recipient). List each item with a description and quantity; tick **Large crate or oversized cargo** to give dimensions and weight.",
        image: img750("warehouse-new", "New incoming shipment form", [
          { x: 489, y: 118, w: 590, h: 100 },
          { x: 489, y: 232, w: 590, h: 205 },
        ]),
      },
      {
        title: "Attach and send",
        text: "Tick **This is urgent** if it is (and say why and by when). **Attach documents** and **Attach photos** — delivery order, packing list, invoice. Click **Send to the Warehouse**; the Warehouse and Logistics are emailed.",
        image: img750("warehouse-new", "Attachments and send", [
          { x: 489, y: 617, w: 246, h: 29 },
          { x: 934, y: 690, w: 145, h: 24 },
        ]),
      },
      {
        title: "Follow it up",
        text: "Use **Open**, **Mine** and **All**, the type filter and search to find requests. Open one to see its progress and add comments — comments and status changes are emailed to the Warehouse, Logistics and you.",
        image: img750("warehouse-requests", "Filters", [{ x: 413, y: 180, w: 528, h: 31 }]),
      },
    ],
  },

  // ── Bunkering ─────────────────────────────────────────────────────────────
  {
    id: "bunkering",
    title: "Log and manage a bunkering enquiry",
    summary: "Record a yacht's fuel request, get supplier quotes, the vessel's approval and the delivery.",
    section: "Services",
    screens: ["route-bunkering"],
    minutes: 4,
    steps: [
      {
        title: "Click New bunkering enquiry",
        text: "Click **Bunkering**, then **New bunkering enquiry**. Use **Open / Mine / All**, the status filter and search to find existing enquiries.",
        image: img750("bunkering-list", "Bunkering enquiries", [
          { x: 413, y: 138, w: 183, h: 30 },
          { x: 602, y: 138, w: 482, h: 30 },
        ]),
      },
      {
        title: "Vessel and fuel details",
        text: "Under **Vessel details**, start typing the **Yacht name** and choose it from the list so the vessel sees it in their Client Portal. Add the captain or chief engineer and a phone or email. Under **Bunkering requirements** give the port, preferred date, **Fuel type / grade**, quantity and unit — these are required.",
        image: img750("bunkering-new", "Vessel details and requirements", [
          { x: 489, y: 115, w: 290, h: 32 },
          { x: 489, y: 380, w: 590, h: 262 },
        ]),
      },
      {
        title: "Delivery and confirmation",
        text: "Add the delivery method, fuel remaining and tank capacity, and whether the yacht sails out of the UAE afterwards (this decides VAT). The **Vessel's confirmation** can be signed now or recorded later — the enquiry can't go to suppliers until it is. Click **Log the enquiry**; the Agency team is emailed.",
      },
      {
        title: "Quotes, approval and delivery",
        text: "Open the enquiry and move it along: **Enquiries sent to suppliers**, **Add a quotation**, **Sent to the vessel to approve**, **Approve** (record who approved), then **Mark delivered**. The pre-filled declaration and Bunker Delivery Note open as PDFs.",
        tip: "Status changes and comments on an enquiry are emailed to the team.",
      },
    ],
  },

  // ── Procurement ───────────────────────────────────────────────────────────
  {
    id: "procurement",
    title: "Record a procurement request",
    summary: "Log purchases for a yacht and follow them from requested to ordered to received.",
    section: "Services",
    screens: ["route-procurement"],
    minutes: 2,
    steps: [
      {
        title: "Open Procurement",
        text: "Click **Procurement**. The cards show the number of requests that are **Requested**, **Ordered** and **Received**, and the total value. Filter by yacht, vendor, status, category and year.",
        image: img750("procurement", "Procurement", [
          { x: 193, y: 95, w: 1345, h: 73 },
          { x: 193, y: 177, w: 651, h: 25 },
        ]),
      },
      {
        title: "Add a request",
        text: "Click **New Request**. **Yacht**, **Vendor** and **Description** are required; add the category, quantity, currency and unit price, invoice ref and dates, then **Create Request**. You can also click **Add item** at the bottom of the table to type a row in directly.",
        image: img750("procurement", "New Request and Add item", [
          { x: 1435, y: 61, w: 104, h: 27 },
          { x: 197, y: 279, w: 69, h: 20 },
        ]),
      },
      {
        title: "Update and export",
        text: "Click any cell to change it — for example set **Status** to Ordered, then Received. **Export CSV** downloads the list.",
        tip: "Table edits save when you press Enter or click away. Delete removes a request permanently.",
      },
    ],
  },

  // ── Small Boat Registration ───────────────────────────────────────────────
  {
    id: "small-boat-registration",
    title: "Register a small boat",
    summary: "Track small-boat registrations and renewals with DMA and other authorities.",
    section: "Services",
    screens: ["route-small-boat-registration"],
    minutes: 3,
    steps: [
      {
        title: "Open Small Boat Registration",
        text: "Click **Small Boat Registration**. The cards count **Total Boats**, **Registered**, **In Progress** and **Expiring Soon**. Filter by status and authority, or search.",
        image: img750("smallboat-list", "Small Boat Registration", [
          { x: 197, y: 119, w: 1338, h: 57 },
          { x: 197, y: 184, w: 228, h: 25 },
        ]),
      },
      {
        title: "Click Register Boat",
        text: "Click **Register Boat**.",
        image: img750("smallboat-list", "Register Boat button", [{ x: 1430, y: 74, w: 106, h: 28 }]),
      },
      {
        title: "Fill in the tabs",
        text: "Only **Boat Name** is required. Work through the tabs:",
        bullets: [
          "**Basic Info** — status, boat type, authority, registration type, length and client email.",
          "**Dates** — registration start and end, document submission and inspection.",
          "**Commercial** — quotation number, PRO, licence, receipts and portal login.",
          "**Documents** — tick off the 18 required documents and upload them.",
          "**Other** — SharePoint folder link and notes.",
        ],
        image: img750("smallboat-new", "Register New Small Boat", [
          { x: 491, y: 173, w: 588, h: 29 },
          { x: 493, y: 224, w: 583, h: 45 },
        ]),
      },
      {
        title: "Save",
        text: "Click **Register Boat**. Polaris saves it and creates the boat's SharePoint folder if there isn't one. Use the pencil on a row to update its status as the registration progresses.",
        image: img750("smallboat-new", "Register Boat button", [{ x: 985, y: 577, w: 94, h: 29 }]),
      },
    ],
  },

  // ── Berth Billing ─────────────────────────────────────────────────────────
  {
    id: "berth-billing",
    title: "Assign a berth and bill for it",
    summary: "Record a yacht on a marina berth, then raise and track its invoices.",
    section: "Services",
    screens: ["berth-billing"],
    minutes: 3,
    steps: [
      {
        title: "Open Berth Billing",
        text: "Click **Berth Billing**. The cards show occupied berths, revenue, outstanding balance and unbilled occupancies. Filter with **All**, **Not Yet Invoiced** and **Overdue (30d+)**; **Export CSV** downloads what's shown.",
        image: img750("berth-billing", "Marina Berth Billing", [
          { x: 193, y: 129, w: 1345, h: 78 },
          { x: 193, y: 227, w: 245, h: 28 },
        ]),
      },
      {
        title: "Assign a berth",
        text: "Click **Assign Berth**. Choose the **Marina** and **Berth** (only free berths are offered), the **Vessel**, the **Client** billed, the **Arrival** date, and daily or monthly billing with its rate. Click **Assign Berth**.",
        image: img750("berth-billing", "Assign Berth button", [{ x: 1430, y: 72, w: 109, h: 37 }]),
      },
      {
        title: "Invoice and departure",
        text: "Open the occupancy to see its billing lines. **Generate Draft Invoice** raises an invoice, then move it along with **Mark Pending Approval**, **Mark Approved**, **Mark Sent** and **Mark Paid**. When the yacht leaves, click **Record Departure**.",
        tip: "These buttons take effect immediately, with no confirmation.",
      },
    ],
  },

  // ── Orbit ─────────────────────────────────────────────────────────────────
  {
    id: "orbit-service-request",
    title: "Raise and approve an Orbit service request",
    summary: "Request a technical, marina or fuel service, collect quotes and take them through approval.",
    section: "Services",
    screens: ["orbit"],
    minutes: 3,
    steps: [
      {
        title: "Open Orbit",
        text: "Click **Orbit**. **Service Requests** shows how many requests are awaiting quote, awaiting approval, scheduled, in progress, completed or cancelled — click a card to filter. Other tabs hold **Projects**, **Approvals**, **Defects & Repairs**, **Planned Maintenance** and **Small Boats**.",
        image: img750("orbit", "Orbit service requests", [{ x: 197, y: 167, w: 1338, h: 66 }]),
      },
      {
        title: "Raise a request",
        text: "Click a tile under **Raise a request** — Technical Service, Marina Support, Equipment Rental, Waste Collection, Fuel, Gas Refill — or **New Request**. **Emergency Assistance** goes straight to In Progress.",
        image: img750("orbit", "Raise a request tiles", [
          { x: 197, y: 268, w: 1338, h: 59 },
          { x: 1428, y: 104, w: 108, h: 30 },
        ]),
      },
      {
        title: "Describe it",
        text: "Give it a **Title** (required), the vessel, category, request type, urgency, location, preferred date and a description. Click **Submit request**. (Fuel opens a bunkering form with location, fuel grade and quantities, sent as an **RFQ**.)",
        image: img750("orbit-new", "New Service Request form", [
          { x: 594, y: 216, w: 381, h: 46 },
          { x: 872, y: 541, w: 103, h: 30 },
        ]),
      },
      {
        title: "Quotes and approval",
        text: "Open the request and **Add quote** for each supplier. **Accept** the chosen quote — it goes to the **Approvals** desk (or is approved automatically if under the captain's limit), where each stage is approved or rejected. Then move the request through Scheduled, In Progress and Completed.",
      },
    ],
  },
  {
    id: "orbit2-projects",
    title: "Log an Orbit 2 project or bunkering job",
    summary: "Record vessel service jobs and bunkering for managed boats and track them to invoicing.",
    section: "Services",
    screens: ["orbit2"],
    minutes: 3,
    steps: [
      {
        title: "Open Orbit 2",
        text: "Click **Orbit 2**. **Dashboard** shows the project mix, completion rate, per-client status, a calendar and team management. **Export to Excel** downloads the records; **Mobile App** opens the field app.",
        image: img750("orbit2-dashboard", "Orbit 2 dashboard", [
          { x: 197, y: 132, w: 304, h: 29 },
          { x: 1305, y: 189, w: 231, h: 30 },
        ]),
      },
      {
        title: "Find projects",
        text: "Click **Project**, then **Project List**, **Bunkering**, **Internal Request** or **EHS NOC Record**. Switch between **All**, **To Be Invoiced** and **Invoiced**, or search.",
        image: img750("orbit2-projects", "Project tabs and views", [
          { x: 197, y: 176, w: 386, h: 27 },
          { x: 193, y: 214, w: 318, h: 29 },
        ]),
      },
      {
        title: "Add a project",
        text: "Click **New Project** (or **New Bunkering**). The form opens on the right — **Boat / Client Name** is required; add the service category, requestor, task, contact, schedule, location, supplier, quote and team. Click **Submit** — the Task ID is created then.",
        image: img750("orbit2-projects", "New Project button", [{ x: 1435, y: 258, w: 104, h: 30 }]),
      },
      {
        title: "Update the status",
        text: "Change a job's **Status** in the table as it moves from quote to approved to complete and invoiced. Open a job to add remarks, team comments, quotes, invoices and photos.",
        image: img750("orbit2-projects", "Status column", [{ x: 355, y: 335, w: 146, h: 405 }]),
        tip: "The Status dropdown in the table saves straight away. Notify client / Send request form emails or WhatsApps the client — use it deliberately.",
      },
    ],
  },

  // ── Client Requests ───────────────────────────────────────────────────────
  {
    id: "client-requests",
    title: "Respond to Client Portal requests",
    summary: "Triage requests captains raise in the Client Portal, reply to them and keep their status current.",
    section: "Services",
    screens: ["client-requests"],
    minutes: 2,
    steps: [
      {
        title: "Open Client Requests",
        text: "Click **Client Requests**. Every request a captain raises in the Client Portal appears here with its yacht, category, priority and needed-by date. Filter with **Open**, **All** or a status.",
        image: img750("client-requests", "Client Requests", [{ x: 197, y: 163, w: 518, h: 25 }]),
      },
      {
        title: "Reply in the thread",
        text: "Click **Thread** to open the conversation with the captain, type in **Reply to the captain…** and **Send**. The captain gets it straight away, with a notification on their phone.",
        image: img750("client-requests", "Thread links", [{ x: 1486, y: 233, w: 42, h: 66 }]),
      },
      {
        title: "Update the status",
        text: "Change the **Status** dropdown — **Acknowledged**, **In progress**, **Completed** or **Cancelled**. The captain is notified of each change.",
        image: img750("client-requests", "Status dropdowns", [{ x: 1263, y: 233, w: 111, h: 66 }]),
      },
      {
        title: "Live chat and the directory",
        text: "**Live Chat** holds instant messages from clients. **Edit directory** changes the department contacts captains see (and can click to call) in their portal.",
        image: img750("client-requests", "Live Chat and Edit directory", [
          { x: 262, y: 55, w: 76, h: 33 },
          { x: 1344, y: 106, w: 109, h: 29 },
        ]),
      },
    ],
  },

  // ══ Communications ════════════════════════════════════════════════════════
  {
    id: "whatsapp-inbox",
    title: "Reply to clients on WhatsApp",
    summary: "Answer WhatsApp messages from clients, assign conversations and start a new one.",
    section: "Communications",
    screens: ["whatsapp"],
    minutes: 3,
    steps: [
      {
        title: "Open the Inbox",
        text: "Click **WhatsApp**. **Inbox** (with its unread count) shows conversations from clients who have opted in. Choose a number in **All my numbers**, search, or filter with **Open**, **Mine**, **Unassigned** and **Closed**.",
        image: img750("wa-inbox", "WhatsApp inbox", [
          { x: 197, y: 133, w: 85, h: 30 },
          { x: 207, y: 186, w: 244, h: 105 },
        ]),
      },
      {
        title: "Reply",
        text: "Click a conversation, type your reply and press **Send** (or Enter). Type **/** or use the lightning button for quick replies; the paperclip attaches a file. **Assign** gives the conversation to a colleague and **Close** files it away.",
        tip: "Your message goes to the client the moment you press Send or Enter.",
      },
      {
        title: "When the 24-hour window has closed",
        text: "WhatsApp only allows free-text replies within 24 hours of the client's last message. After that, choose an approved template, fill in its values and click **Send template**.",
      },
      {
        title: "Message someone new",
        text: "Click the new-message button next to the search box, find the contact (or add them with their number including the country code) and start the conversation.",
        image: img750("wa-inbox", "New message button", [{ x: 421, y: 220, w: 30, h: 27 }]),
      },
    ],
  },
  {
    id: "whatsapp-broadcast",
    title: "Send a WhatsApp broadcast",
    summary: "Build a broadcast list of opted-in contacts and send them an approved template message.",
    section: "Communications",
    screens: ["whatsapp"],
    minutes: 4,
    steps: [
      {
        title: "Make sure contacts have opted in",
        text: "On **Contacts**, add people with **Add contact** and record their consent (the shield icon → **Record consent**, saying how they agreed). Only contacts who have opted in are messaged — opt-outs are respected automatically.",
      },
      {
        title: "Create a list",
        text: "On **Lists**, click **New list**, give it a name, then **Add members** — tick **Opted in only** and choose the contacts. Each person gets the message privately; it isn't a group chat.",
        image: img750("wa-lists", "Broadcast lists", [
          { x: 197, y: 176, w: 214, h: 28 },
          { x: 1343, y: 177, w: 110, h: 27 },
        ]),
      },
      {
        title: "Choose an approved template",
        text: "Broadcasts must use a template Meta has approved. On **Templates**, **New template** creates one (name, message, optional header, footer and buttons) — save it as a draft, then **Submit to Meta** for review.",
      },
      {
        title: "Create the send",
        text: "On **Sends**, click **New send**. Name it and choose the **List**, the **Template** and any values or files it needs, then **Save draft**. Nothing goes out yet — you see who it will reach first.",
        image: img750("wa-sends", "Sends", [{ x: 1447, y: 177, w: 89, h: 27 }]),
      },
      {
        title: "Send and check the results",
        text: "Open the draft and click **Send to N**, then confirm — this can't be recalled. The **Sends** list then shows how many were sent, read, failed or skipped, and **Download list** saves the responses.",
        image: img750("wa-sends", "Send results", [{ x: 1104, y: 245, w: 277, h: 475 }]),
      },
    ],
  },
  {
    id: "reviews",
    title: "Read and reply to Google reviews",
    summary: "See Google reviews for each JLS brand and reply to them from Polaris.",
    section: "Communications",
    screens: ["reviews"],
    minutes: 2,
    steps: [
      {
        title: "Open Reviews",
        text: "Click **Reviews**. The **Inbox** lists reviews for JLS Yacht Training Institute, JLS Yachts and Superyacht ME. **Summary** shows each brand's average rating and how many need a reply.",
        image: img750("reviews", "Reviews", [{ x: 197, y: 132, w: 224, h: 32 }]),
        tip: "Reviews appear once an admin has connected the Google account under Setup — until then you'll see \"Waiting for Google setup\".",
      },
      {
        title: "Find the ones to answer",
        text: "Filter by brand and stars, sort by newest, oldest or lowest rating, and tick **Needs reply** to see only unanswered reviews.",
        image: img750("reviews", "Review filters", [{ x: 197, y: 251, w: 463, h: 31 }]),
      },
      {
        title: "Reply",
        text: "Click **Reply** on a review and write your answer — **Draft with AI** can suggest one. Click **Post reply**, then **Post on Google** to confirm. Replies are public; you can **Edit reply** or **Remove reply** later.",
      },
    ],
  },

  // ══ Reports ═══════════════════════════════════════════════════════════════
  {
    id: "visa-reports",
    title: "Produce and send a visa report",
    summary: "See every crew member's visa status for one vessel or the fleet, and send the report to the vessel.",
    section: "Reports",
    screens: ["visa-reports"],
    minutes: 2,
    steps: [
      {
        title: "Choose the vessel",
        text: "Click **Visa Reports** and pick a vessel in **Vessel** (or leave **All vessels (fleet-wide)**). The cards count total crew and active, expiring and expired visas, with lists of who has expired and who expires within 30 days.",
        image: img750("visa-reports", "Visa Reports", [
          { x: 177, y: 135, w: 313, h: 35 },
          { x: 177, y: 183, w: 1378, h: 77 },
        ]),
      },
      {
        title: "Generate the report",
        text: "Click **Generate report**. It's added to **Report history** at the bottom of the page.",
        image: img750("visa-reports", "Generate report", [{ x: 1304, y: 58, w: 125, h: 37 }]),
      },
      {
        title: "Send it to the vessel",
        text: "Click **Send to vessel**, check the email address and **Confirm & send**. If the vessel has nobody to send to, set its recipients up in **Reports → Automated Reports** first.",
        image: img750("visa-reports", "Send to vessel", [{ x: 1436, y: 58, w: 119, h: 37 }]),
      },
    ],
  },
  {
    id: "soso-reports",
    title: "Check crew movements (Sign On/Off report)",
    summary: "See who is on board and the latest sign-ons and sign-offs, for a vessel or the fleet.",
    section: "Reports",
    screens: ["soso-reports"],
    minutes: 1,
    steps: [
      {
        title: "Open the report",
        text: "Click **Sign On/Off** under Reports and pick a vessel at the top right (or **All vessels**). The cards show **Onboard now**, **Sign-ons (7d)**, **Sign-offs (7d)** and **Upcoming**, with the latest sign-ons and sign-offs listed below.",
        image: img750("soso-reports", "Sign-On/Off Reports", [
          { x: 1367, y: 61, w: 189, h: 31 },
          { x: 177, y: 134, w: 1378, h: 78 },
        ]),
        tip: "To record a movement, use Immigration → Sign On / Off. See \"Record a sign on or sign off\".",
      },
    ],
  },
  {
    id: "automated-reports",
    title: "Schedule reports to a vessel",
    summary: "Opt a vessel in to automatic emailed reports, choose who receives them and when.",
    section: "Reports",
    screens: ["vessel-report-automations"],
    minutes: 4,
    steps: [
      {
        title: "Open Automated Reports",
        text: "Click **Automated Reports**. **All vessels** shows each vessel that's set up and whether each report — Visa status, Sign On / Sign Off, Statement of account, Crew on board, Document & permit expiries, Weekly / monthly — is on or off. Nothing goes to a vessel that isn't set up and switched on here.",
        image: img750("report-automations", "Automated Reports", [
          { x: 197, y: 339, w: 272, h: 32 },
          { x: 197, y: 426, w: 1338, h: 79 },
        ]),
      },
      {
        title: "Set up a vessel",
        text: "Switch to **All vessels** in the filter, find the vessel and click **Set up** (or **Configure** if it's already set up). To opt several at once, tick them and use **Opt in to …**.",
        image: img750("report-automations", "Configure button", [{ x: 1452, y: 460, w: 74, h: 27 }]),
      },
      {
        title: "Choose recipients and timing",
        text: "For each report, add the email addresses under **By email — send to** (press Enter after each), an optional **Copy (CC)**, and **When (Dubai time)** — day and time. Tick **By WhatsApp** to send the PDF to the vessel's WhatsApp contacts too.",
        image: img750("report-automations-config", "Report settings", [{ x: 379, y: 140, w: 812, h: 74 }]),
      },
      {
        title: "Check it, then switch it on",
        text: "**Preview** and **PDF** show what the report looks like; **Send test to me** emails it to you. When it's right, turn on **Switched off → Sending**. **Client can manage in their portal** lets the captain change recipients themselves.",
        image: img750("report-automations-config", "Preview, test and switch", [
          { x: 379, y: 221, w: 270, h: 29 },
          { x: 975, y: 92, w: 216, h: 40 },
        ]),
        tip: "Send now emails the client straight away, after a confirmation. The fleet-wide weekly operations report is set up separately, under Settings → Automations.",
      },
    ],
  },
  {
    id: "crew-documents",
    title: "Check crew documents for expiry",
    summary: "See which crew documents are valid, expiring within 90 days or expired, by vessel.",
    section: "Reports",
    screens: ["documents"],
    minutes: 1,
    steps: [
      {
        title: "Open Crew Documents",
        text: "Click **Crew Documents** and pick a vessel at the top right. The cards count documents that are **Valid**, **Expiring** (within 90 days) and **Expired**, and the list shows each crew member's document with its expiry date.",
        image: img750("crew-documents", "Crew Documents", [
          { x: 1367, y: 61, w: 189, h: 31 },
          { x: 177, y: 134, w: 1378, h: 98 },
        ]),
        tip: "Documents are added on each crew member's profile (Crew → open the profile).",
      },
    ],
  },
  {
    id: "document-links",
    title: "Track and revoke document links",
    summary: "See every secure document link sent to clients, who opened it, and revoke one if needed.",
    section: "Reports",
    screens: ["route-document-links"],
    minutes: 2,
    steps: [
      {
        title: "Open Document Links",
        text: "Click **Document Links**. Every secure link sent to a client — permits, visas, reports — is listed with the vessel, recipient, sent and expiry dates, how many times it was opened and its status. Search, or filter by **Not opened**, **Opened**, **Expired** or **Revoked**.",
        image: img750("document-links", "Document Links", [{ x: 1159, y: 69, w: 377, h: 30 }]),
      },
      {
        title: "See who opened it",
        text: "Click the arrow at the start of a row to see each time the link was viewed or downloaded, with the date and time.",
        image: img750("document-links", "Expand a row", [{ x: 199, y: 165, w: 24, h: 40 }]),
      },
      {
        title: "Copy or revoke",
        text: "**Copy** puts the link on your clipboard to resend. **Revoke** stops the link working (you'll be asked to confirm) — use it if a document went to the wrong person. A revoked link can be **Restored**.",
        image: img750("document-links", "Copy and Revoke", [{ x: 1408, y: 170, w: 112, h: 28 }]),
      },
    ],
  },
  {
    id: "spreadsheet-sync",
    title: "Sync visas from the Crew Visa Tracker",
    summary: "Bring visa records in line with the SharePoint Crew Visa Tracker spreadsheet.",
    section: "Reports",
    screens: ["route-visa-sync"],
    minutes: 2,
    steps: [
      {
        title: "Run a dry run first",
        text: "Click **Spreadsheet Sync**, then **Dry run (preview)**. Polaris reads every vessel's sheet in the SharePoint **Crew Visa Tracker** and shows what would change — vessels, rows, matched, updated, created and unchanged, with sample changes — without writing anything.",
        image: img750("spreadsheet-sync", "Visa Spreadsheet Sync", [
          { x: 472, y: 167, w: 118, h: 34 },
          { x: 472, y: 214, w: 616, h: 63 },
        ]),
      },
      {
        title: "Apply",
        text: "If the preview looks right, click **Apply to app** and confirm. Leave **Create crew missing from the app** ticked to add crew who are in the spreadsheet but not yet in Polaris.",
        image: img750("spreadsheet-sync", "Apply to app", [{ x: 597, y: 167, w: 295, h: 34 }]),
        tip: "On this sync the spreadsheet wins — it overwrites visa statuses and dates in Polaris. Always dry-run first.",
      },
    ],
  },
  {
    id: "duplicate-crew",
    title: "Merge duplicate crew records",
    summary: "Find the same person recorded twice and merge them into one profile.",
    section: "Reports",
    screens: ["route-crew-duplicates"],
    minutes: 3,
    steps: [
      {
        title: "Open Duplicate Crew",
        text: "Click **Duplicate Crew**. **Crew records** lists pairs that look like the same person — similar names on the same vessel, or the same passport number. **SharePoint folders** finds split document folders, and **Missing details** lists crew without a passport number or date of birth.",
        image: img750("duplicate-crew", "Duplicate Crew & Folders", [{ x: 197, y: 143, w: 430, h: 28 }]),
      },
      {
        title: "Check it's really the same person",
        text: "Compare the dates of birth and passport numbers — click **Open** to see each full profile. Dates one day apart are usually an old spreadsheet error rather than two people.",
        image: img750("duplicate-crew", "Warning about dates", [{ x: 211, y: 314, w: 1311, h: 27 }]),
      },
      {
        title: "Keep one and merge",
        text: "Click **Keep this one** on the record to keep. The dialog shows how many visas, passports, documents and events will move across. Click **Merge records** to move them and remove the empty duplicate.",
        image: img750("duplicate-crew", "Keep this one", [{ x: 1441, y: 243, w: 81, h: 26 }]),
        tip: "Merging can't be undone. If the passport numbers genuinely differ, they're probably two different people — leave them.",
      },
    ],
  },
];

export function guideById(id: string): HowToGuide | undefined {
  return HOW_TO_GUIDES.find((g) => g.id === id);
}

/** Guides that help with a nav screen key — the top-bar "?" panel's list. */
export function guidesForScreen(screen: string): HowToGuide[] {
  return HOW_TO_GUIDES.filter((g) => g.screens.includes(screen));
}

/** Pages that aren't nav items themselves but belong to one (detail / add pages). */
const PATH_SCREENS: [prefix: string, screen: string][] = [
  ["/yachts", "vessels"],
  ["/crew-immigration/crew", "crew"],
  ["/permits", "permits"],
  ["/wall-displays", "route-wall-displays"],
  // The Crew Care nav item opens /crew-cab/jobs; its other tabs (Trips, …) live beside it.
  ["/crew-cab", "route-crew-cab"],
  ["/it-tickets", "yacht-it"],
];

/** The help screen for the current page: the active nav screen, else a path match. */
export function helpScreenFor(activeScreen: string, pathname: string): string {
  if (activeScreen) return activeScreen;
  return PATH_SCREENS.find(([p]) => pathname.startsWith(p))?.[1] ?? "";
}

export function guidePdfName(g: HowToGuide): string {
  return `Polaris - ${g.title.replace(/[^\w\s&()-]/g, "").trim()}.pdf`;
}

/** Guides grouped by section, in the order they're listed above. */
export function guidesBySection(): { section: string; guides: HowToGuide[] }[] {
  const out: { section: string; guides: HowToGuide[] }[] = [];
  for (const g of HOW_TO_GUIDES) {
    let s = out.find((x) => x.section === g.section);
    if (!s) out.push((s = { section: g.section, guides: [] }));
    s.guides.push(g);
  }
  return out;
}
