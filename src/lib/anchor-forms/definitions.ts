/**
 * Anchor — Digital Forms definitions (schema-driven).
 *
 * Each form is a definition (sections + typed fields, with optional Arabic labels
 * for the bilingual DMA templates). A generic renderer fills it in-browser; on
 * completion the server generates a branded PDF from these definitions + values,
 * which can be downloaded, emailed, or sent into Anchor's e-signature flow.
 *
 * v1 forms: DMA Notice of Arrival, DMA Notice of Departure, Agency Appointment
 * Letter. (DMA CF12a permit is a follow-up; the Tariff Sheet is a reference doc.)
 */

export type FieldType =
  | "text" | "textarea" | "date" | "time" | "number" | "email" | "select";

export interface FormField {
  key: string;
  label: string;
  labelAr?: string;      // Arabic label (bilingual DMA forms)
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  options?: string[];    // for select
  full?: boolean;        // span full width in the fill UI
}

export interface FormSection {
  title?: string;
  fields: FormField[];
}

export interface FormDef {
  key: string;
  title: string;
  description: string;
  category: string;
  /** Pre-fill the email recipient when emailing the completed form. */
  emailTo?: string;
  /** Short instruction shown at the top of the form + on the PDF. */
  intro?: string;
  /** Letter-style forms: prose body with {{field}} placeholders (rendered as a
   *  letter on the PDF instead of a field table). */
  bodyTemplate?: string;
  sections: FormSection[];
}

const vesselCore: FormField[] = [
  { key: "vessel_name", label: "Vessel's Name", labelAr: "اسم الوسيلة البحرية", type: "text", required: true },
  { key: "vessel_flag", label: "Vessel's Flag", labelAr: "علم الوسيلة البحرية", type: "text", required: true },
  { key: "loa", label: "Vessel's L.O.A (m)", labelAr: "طول الوسيلة البحرية", type: "text" },
  { key: "imo", label: "IMO Number", labelAr: "رقم التسجيل", type: "text" },
  { key: "mmsi", label: "MMSI Number (AIS)", labelAr: "رقم MMSI", type: "text" },
  { key: "persons_onboard", label: "Total Persons Onboard", labelAr: "عدد الأشخاص على متنها", type: "number" },
];

const agentBlock: FormField[] = [
  { key: "agent_details", label: "Maritime Agent Details", labelAr: "بيانات الوكيل الملاحي", type: "textarea", full: true },
  { key: "contact_number", label: "Contact Number", labelAr: "رقم التواصل", type: "text" },
  { key: "email", label: "Email", labelAr: "البريد الإلكتروني", type: "email" },
];

export const ANCHOR_FORMS: FormDef[] = [
  {
    key: "dma-notice-of-arrival",
    title: "DMA — Notice of Arrival",
    description: "Notice of Arrival for vessels engaged in international voyages.",
    category: "DMA / Port Operations",
    emailTo: "sail@pcfc.ae",
    intro:
      "To be duly completed by the Approved Maritime Agent and sent at least 24 hours in advance.",
    sections: [
      {
        title: "Arrival Notification Details",
        fields: [
          ...vesselCore,
          { key: "last_port", label: "Last Port/Marina of Call", labelAr: "الميناء/المكان القادمة منه", type: "text" },
          { key: "eta_date", label: "Estimated Date of Arrival", labelAr: "تاريخ الوصول المتوقع", type: "date" },
          { key: "eta_time", label: "Estimated Time of Arrival", labelAr: "وقت الوصول المتوقع", type: "time" },
          { key: "marina_arrival", label: "Marina/Port of Arrival", labelAr: "المرسى/ميناء الوصول", type: "text" },
          { key: "berth", label: "Berth Number", labelAr: "رقم الرصيف", type: "text" },
          { key: "purpose", label: "Purpose of Entry", labelAr: "غرض الزيارة/الدخول", type: "textarea", full: true },
          { key: "duration", label: "Expected Duration of Stay", labelAr: "وقت المكوث المتوقع", type: "text" },
        ],
      },
      { title: "Maritime Agent", fields: agentBlock },
    ],
  },
  {
    key: "dma-notice-of-departure",
    title: "DMA — Notice of Departure",
    description: "Notice of Departure for vessels engaged in international voyages.",
    category: "DMA / Port Operations",
    emailTo: "sail@pcfc.ae",
    intro:
      "To be duly completed by the Approved Maritime Agent and sent at least 24 hours in advance.",
    sections: [
      {
        title: "Departure Notification Details",
        fields: [
          ...vesselCore,
          { key: "etd_date", label: "Estimated Date of Departure", labelAr: "تاريخ المغادرة المتوقع", type: "date" },
          { key: "etd_time", label: "Estimated Time of Departure", labelAr: "وقت المغادرة المتوقع", type: "time" },
          { key: "marina_departure", label: "Marina/Port of Departure", labelAr: "المرسى/ميناء المغادرة", type: "text" },
          { key: "berth", label: "Berth Number", labelAr: "رقم الرصيف", type: "text" },
          { key: "next_destination", label: "Next Destination of Call", labelAr: "الوجهة التالية", type: "text" },
        ],
      },
      { title: "Maritime Agent", fields: agentBlock },
    ],
  },
  {
    key: "agency-appointment-letter",
    title: "Agency Appointment Letter",
    description: "Authorisation appointing JLS Yachts LLC as UAE agent for a vessel.",
    category: "Agency",
    bodyTemplate:
      "{{letter_date}}\n\nThe Manager\nCc: General Directorate of Residency and Foreigners Affairs, Federal Transport Authority, & UAE Coast Guard\nUnited Arab Emirates\n\nDear Sir,\n\nM/Y “{{vessel_name}}” – IMO NO. {{imo}}\nAGENT APPOINTMENT LETTER / AUTHORIZATION LETTER\n\nWe do hereby authorize JLS Yachts LLC as our agent in the United Arab Emirates. JLS Yachts LLC will liaise, arrange and complete all necessary documentations, procedures and formalities not limited to the UAE Immigration clearances, Customs, Coast Guard formalities, Health Authority, Port Authorities, all official matters related to the Yacht with the Federal Transport Authority of the UAE, including sailing permit applications for “{{vessel_name}}”.\n\nWe hope that you would provide all necessary assistance to our agent.\n\nThank you.\n\nSincerely,\n\n{{signatory_name}}\n{{signatory_title}}",
    sections: [
      {
        title: "Letter Details",
        fields: [
          { key: "letter_date", label: "Letter Date", type: "date", required: true },
          { key: "vessel_name", label: "Vessel Name", type: "text", required: true },
          { key: "imo", label: "IMO Number", type: "text", required: true },
          { key: "signatory_name", label: "Signatory Name", type: "text", required: true },
          { key: "signatory_title", label: "Signatory Title / Position", type: "text", placeholder: "e.g. Owner's Representative" },
        ],
      },
    ],
  },
  {
    key: "pre-arrival-cruising-permit",
    title: "Pre-Arrival / Cruising Permit Information",
    description: "Full pre-arrival information pack for a visiting vessel — arrival, particulars, dimensions, comms, owner, billing and tenders/toys.",
    category: "Agency",
    emailTo: "info@jlsyachts.com",
    intro:
      "To be completed before the vessel's arrival in the UAE. Vessel fields pre-fill from the yacht record where held; voyage-specific fields are completed per visit.",
    sections: [
      {
        title: "Arrival",
        fields: [
          { key: "arrival_date", label: "Arrival Date", type: "date", required: true },
          { key: "last_port", label: "Last Port of Call", type: "text" },
          { key: "arrival_emirate", label: "Arrival Emirate", type: "text" },
          { key: "arrival_port", label: "Arrival Port", type: "text" },
        ],
      },
      {
        title: "Vessel Particulars",
        fields: [
          { key: "vessel_name", label: "Vessel Name", type: "text", required: true },
          { key: "imo", label: "IMO No.", type: "text" },
          { key: "vessel_type", label: "Vessel Type", type: "text" },
          { key: "official_no", label: "Official No.", type: "text" },
          { key: "vessel_flag", label: "Flag", type: "text" },
          { key: "port_of_registry", label: "Port of Registry", type: "text" },
        ],
      },
      {
        title: "Department Heads",
        fields: [
          { key: "captain_name", label: "Captain's Name", type: "text" },
          { key: "captain_email", label: "Captain's Email Address", type: "email" },
          { key: "purser_name", label: "Purser/Stew Name", type: "text" },
          { key: "purser_email", label: "Purser/Stew Email Address", type: "email" },
          { key: "chief_engineer_name", label: "Chief Engineer/Officer Name", type: "text" },
          { key: "chief_engineer_email", label: "Chief Engineer/Officer Email Address", type: "email" },
        ],
      },
      {
        title: "Dimensions & Specification",
        fields: [
          { key: "gross_tonnage", label: "Gross Tonnage", type: "text" },
          { key: "net_tonnage", label: "Net Tonnage", type: "text" },
          { key: "loa", label: "Length Overall (m)", type: "text" },
          { key: "beam", label: "Breadth / Beam (m)", type: "text" },
          { key: "draft", label: "Draught (m)", type: "text" },
          { key: "air_draft", label: "Air Draft (m)", type: "text" },
          { key: "max_air_draft", label: "Max Air Draft (m) Accurate", type: "text" },
          { key: "max_forward_draft", label: "Max Forward Draft (m)", type: "text" },
          { key: "max_stern_draft", label: "Max Stern Draft (m)", type: "text" },
          { key: "dead_weight", label: "Dead Weight", type: "text" },
          { key: "summer_dead_weight", label: "Summer Dead Weight", type: "text" },
          { key: "displacement", label: "Displacement (tn)", type: "text" },
          { key: "engine_power_kw", label: "Engine Main Propulsion Power (kW)", type: "text" },
          { key: "generators_power_kw", label: "Sum of All Generators Power (kW)", type: "text" },
          { key: "hull_id", label: "Hull Identification Number", type: "text" },
          { key: "engine_serial", label: "Engine Serial Number", type: "text" },
          { key: "fuel_type", label: "Fuel Type", type: "text" },
        ],
      },
      {
        title: "Radio & Communications",
        fields: [
          { key: "radio_call_sign", label: "Radio Call Sign", type: "text" },
          { key: "frequency", label: "Frequency", type: "text" },
          { key: "equipment_model", label: "Equipment Model", type: "text" },
          { key: "manufacturer", label: "Manufacturer", type: "text" },
          { key: "radio_serial", label: "Serial No.", type: "text" },
          { key: "mmsi", label: "MMSI", type: "text" },
        ],
      },
      {
        title: "Manning & Capacity",
        fields: [
          { key: "crew_count", label: "Max. No. of Crew", type: "number" },
          { key: "max_passengers", label: "Max. No. of Guests", type: "number" },
        ],
      },
      {
        title: "Owner's Details",
        fields: [
          { key: "owner_name", label: "Owner's Name", type: "text" },
          { key: "owner_nationality", label: "Owner's Nationality", type: "text" },
          { key: "owner_address", label: "Owner's Address", type: "textarea", full: true },
        ],
      },
      {
        title: "Billing Information",
        fields: [
          { key: "billing_company", label: "Company Name", type: "text" },
          { key: "billing_contact", label: "Contact Person", type: "text" },
          { key: "billing_email", label: "Email Address", type: "email" },
          { key: "billing_phone", label: "Contact No.", type: "text" },
          { key: "billing_address", label: "Billing Address", type: "textarea", full: true },
        ],
      },
      {
        title: "Lifeboats, Tenders & Other Appurtenances (incl. jet skis and vessel toys)",
        fields: [
          {
            key: "tenders",
            label: "One per line: Description | Manufacturer & Model | Length (m) | ID/Serial No. | Colour | Fuel | Year",
            type: "textarea", full: true,
            placeholder: "e.g. Tender | Williams 565 | 5.65 | WLM565-123 | Grey | Petrol | 2022",
          },
        ],
      },
    ],
  },
  {
    key: "cf12a",
    title: "DMA CF12a — Visiting Vessel Permit Application",
    description: "Application for a Foreign-Flagged Visiting Vessel Permit (PCFC / DMA).",
    category: "DMA / Port Operations",
    emailTo: "sail@pcfc.ae",
    intro:
      "Fills the authority's official bilingual CF12a form with the vessel data we hold. " +
      "The generated PDF stays fillable — tick the Permit Type, Application Type and Entry " +
      "Method boxes and complete any remaining fields before submitting.",
    sections: [
      {
        title: "Application",
        fields: [
          { key: "date_of_application", label: "Date of Application", type: "date" },
          { key: "applicant_name", label: "Applicant Name", type: "text" },
        ],
      },
      {
        title: "Marine Vessel Registration Details",
        fields: [
          { key: "vessel_name", label: "Marine Vessel Name", type: "text", required: true },
          { key: "imo", label: "License No. / (IMO) No.", type: "text" },
          { key: "vessel_type", label: "Marine Vessel Type", type: "text" },
          { key: "hull_id", label: "Hull Identification Number", type: "text" },
          { key: "vessel_flag", label: "Flag of Registration", type: "text" },
          { key: "year_build", label: "Year of Build", type: "text" },
          { key: "crew_count", label: "No. of Crew", type: "number" },
          { key: "max_passengers", label: "Maximum No. of Passengers", type: "number" },
        ],
      },
      {
        title: "Marine Vessel Details",
        fields: [
          { key: "loa", label: "Length (m)", type: "text" },
          { key: "beam", label: "Beam (m)", type: "text" },
          { key: "depth", label: "Depth (m)", type: "text" },
          { key: "draft", label: "Draft (m)", type: "text" },
          { key: "hull_material", label: "Hull Material", type: "text" },
          { key: "hull_color", label: "Hull Color", type: "text" },
          { key: "gross_tonnage", label: "Gross Tonnage", type: "text" },
        ],
      },
      {
        title: "Engine (tick Propulsion / Fuel type on the PDF)",
        fields: [
          { key: "propulsion_other", label: "Propulsion Type — Other", type: "text" },
          { key: "fuel_other", label: "Fuel Type — Other", type: "text" },
        ],
      },
      {
        title: "Owner & Contact",
        fields: [
          { key: "owner_name", label: "Owner Name", type: "text" },
          { key: "owner_nationality", label: "Owner Nationality", type: "text" },
          { key: "captain_name", label: "Captain Name", type: "text" },
          { key: "owner_mobile", label: "Mobile No.", type: "text" },
          { key: "owner_email", label: "Email", type: "email" },
        ],
      },
      {
        title: "Shipping Agent",
        fields: [
          { key: "agent_name", label: "Agent Name", type: "text" },
          { key: "agent_phone", label: "Agent Phone No.", type: "text" },
          { key: "agent_license", label: "Agent License No.", type: "text" },
        ],
      },
      {
        title: "Shipping Broker (if applicable)",
        fields: [
          { key: "broker_company", label: "Company Name", type: "text" },
          { key: "broker_code", label: "Customer Broker Code", type: "text" },
          { key: "bill_of_lading", label: "Bill of Lading No.", type: "text" },
        ],
      },
      {
        title: "Insurance",
        fields: [
          { key: "insurance_company", label: "Insurance Company", type: "text" },
          { key: "insurance_type", label: "Insurance Type", type: "text" },
          { key: "insurance_policy_no", label: "Insurance Policy No.", type: "text" },
          { key: "insurance_expiry", label: "Insurance Expiry Date", type: "date" },
        ],
      },
      {
        title: "UAE Entry / Departure",
        fields: [
          { key: "last_port", label: "Last Port Visited", type: "text" },
          { key: "entry_port", label: "Entry Port", type: "text" },
          { key: "uae_entry_date", label: "UAE Entry Date", type: "date" },
          { key: "uae_departure_date", label: "UAE Departure Date", type: "date" },
          { key: "declaration_date", label: "Declaration Date", type: "date" },
        ],
      },
    ],
  },
];

export function getFormDef(key: string): FormDef | undefined {
  return ANCHOR_FORMS.find((f) => f.key === key);
}
