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
