/**
 * Maritime Declaration of Health (SD-0064): the form's fields and questions,
 * shared by the portal screen, /api/portal/health-declaration, the PDF and the
 * staff view so all of them agree. It follows Abu Dhabi Ports' own form (the
 * WHO / IHR 2005 Annex 8 model declaration), which the master completes before
 * every Abu Dhabi arrival and sends back to the JLS Abu Dhabi agency team at
 * least five working days ahead.
 */

export type HealthField = {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "yesno";
  group: "voyage" | "ship" | "sanitation";
  /** Voyage details are new every time; the ship's carry over from the last declaration. */
  trip?: boolean;
};

export const HEALTH_FIELDS: HealthField[] = [
  { key: "arrival_date", label: "Abu Dhabi arrival date", type: "date", group: "voyage", trip: true },
  { key: "port_of_arrival", label: "Port of arrival (submitted at)", type: "text", group: "voyage", trip: true },
  { key: "arriving_from", label: "Arriving from", type: "text", group: "voyage", trip: true },
  { key: "sailing_to", label: "Sailing to", type: "text", group: "voyage", trip: true },
  { key: "crew_count", label: "Number of crew", type: "number", group: "voyage", trip: true },
  { key: "passenger_count", label: "Number of passengers", type: "number", group: "voyage", trip: true },

  { key: "ship_name", label: "Name of ship", type: "text", group: "ship" },
  { key: "imo_no", label: "Registration / IMO no.", type: "text", group: "ship" },
  { key: "flag", label: "Flag of vessel", type: "text", group: "ship" },
  { key: "master_name", label: "Master's name", type: "text", group: "ship" },
  { key: "gross_tonnage", label: "Gross tonnage (sea-going vessel)", type: "text", group: "ship" },
  { key: "inland_tonnage", label: "Tonnage (inland vessel)", type: "text", group: "ship" },
  { key: "surgeon_name", label: "Ship's surgeon (if carried)", type: "text", group: "ship" },

  { key: "sanitation_cert_carried", label: "Valid Ship Sanitation Control / Exemption Certificate carried on board?", type: "yesno", group: "sanitation" },
  { key: "sanitation_cert_issued_at", label: "Certificate issued at", type: "text", group: "sanitation" },
  { key: "sanitation_cert_date", label: "Certificate date", type: "date", group: "sanitation" },
  { key: "reinspection_required", label: "Re-inspection required?", type: "yesno", group: "sanitation", trip: true },
  { key: "visited_affected_area", label: "Has the ship / vessel visited an affected area identified by the World Health Organization?", type: "yesno", group: "sanitation", trip: true },
  { key: "affected_area_port", label: "Port visited", type: "text", group: "sanitation", trip: true },
  { key: "affected_area_date", label: "Date of visit", type: "date", group: "sanitation", trip: true },
];

export const HEALTH_REQUIRED = [
  "arrival_date", "port_of_arrival", "arriving_from", "ship_name", "flag", "master_name", "crew_count", "passenger_count",
  "sanitation_cert_carried", "visited_affected_area",
];

export const fieldLabel = (key: string) => HEALTH_FIELDS.find((f) => f.key === key)?.label ?? key;

/**
 * The health questions, worded as on the Abu Dhabi form. Every yes needs an
 * entry in the schedule (`<key>_details`); `count` also asks for a number.
 */
export type HealthQuestion = { key: string; text: string; count?: { key: string; label: string }; hint: string };

export const HEALTH_QUESTIONS: HealthQuestion[] = [
  { key: "q_death", text: "Has any person died on board during the voyage otherwise than as a result of accident?", count: { key: "deaths_count", label: "Total no. of deaths" },
    hint: "For each person: name, rank / class, age, sex, nationality, cause and date of death." },
  { key: "q_infectious", text: "Is there on board or has there been during the international voyage any case of disease which you suspect to be of an infectious nature?",
    hint: "For each case: name, rank / class, age, sex, nationality, port and date joined, nature of illness, date of onset, treatment given." },
  { key: "q_ill_passengers", text: "Has the total number of ill passengers during the voyage been greater than normal / expected?", count: { key: "ill_count", label: "How many ill persons?" },
    hint: "What the illness is, when it started and how it is being managed." },
  { key: "q_ill_now", text: "Is there any ill person on board now?",
    hint: "For each person: name, rank / class, age, sex, nationality, nature of illness, date of onset, treatment given." },
  { key: "q_medical", text: "Was a medical practitioner consulted?",
    hint: "Who was consulted, when and where, and the medical treatment or advice provided." },
  { key: "q_condition", text: "Are you aware of any condition on board which may lead to infection or spread of disease?",
    hint: "Describe the condition." },
  { key: "q_sanitary", text: "Has any sanitary measure (e.g. quarantine, isolation, disinfection or decontamination) been applied on board?",
    hint: "Type of measure, where and when it was applied." },
  { key: "q_stowaways", text: "Have any stowaways been found on board?",
    hint: "Where did they join the ship / vessel (if known)?" },
  { key: "q_animal", text: "Is there a sick animal or pet on board?",
    hint: "The animal, its illness and how it is being cared for." },
];

export const detailsKey = (q: HealthQuestion) => `${q.key}_details`;

/** Every key the answers object may hold — anything else is dropped by the API. */
export const ANSWER_KEYS = new Set(
  HEALTH_QUESTIONS.flatMap((q) => [q.key, detailsKey(q), ...(q.count ? [q.count.key] : [])]),
);

export const SYMPTOMS_NOTE =
  "In the absence of a surgeon, the master should regard the following symptoms as grounds for suspecting the existence of a disease of an infectious nature: " +
  "(a) fever, persisting for several days or accompanied by (i) prostration; (ii) decreased consciousness; (iii) glandular swelling; (iv) jaundice; (v) cough or shortness of breath; (vi) unusual bleeding; or (vii) paralysis; " +
  "(b) with or without fever: (i) any acute skin rash or eruption; (ii) severe vomiting (other than sea sickness); (iii) severe diarrhoea; or (iv) recurrent convulsions.";

export const DECLARATION_TEXT =
  "I hereby declare that the particulars and answers to the questions given in this Declaration of Health (including the schedule) are true and correct to the best of my knowledge and belief.";

export type PortOfCall = { port: string; departed: string };
export type JoinedPerson = { name: string; joined_from: string[] };
export type HealthAnswers = Record<string, string | number | null>;

export const MAX_PORTS = 15;
export const MAX_JOINERS = 40;

/**
 * The date the declaration must reach JLS by: five working days before the
 * arrival date (yyyy-mm-dd in, yyyy-mm-dd out). Working days are Monday to
 * Friday, less UAE public holidays (from uae_public_holidays — the same list the
 * visa expiry flags count with).
 */
export function healthDueDate(arrival: string | null | undefined, holidays: Iterable<string> = [], workingDays = 5): string | null {
  if (!arrival || !/^\d{4}-\d{2}-\d{2}$/.test(arrival)) return null;
  const d = new Date(`${arrival}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const off = new Set(holidays);
  let left = workingDays;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() - 1);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6 && !off.has(d.toISOString().slice(0, 10))) left--;
  }
  return d.toISOString().slice(0, 10);
}

/** Today's date in the UAE (yyyy-mm-dd), which is what "late" is judged against. */
export function uaeToday(now = new Date()): string {
  return new Date(now.getTime() + 4 * 3600_000).toISOString().slice(0, 10);
}

/** Every question answered yes or no, with a count and details where a yes needs them. */
export function missingAnswers(answers: HealthAnswers): string[] {
  const out: string[] = [];
  HEALTH_QUESTIONS.forEach((q, i) => {
    const a = answers[q.key];
    if (a !== "yes" && a !== "no") { out.push(`question ${i + 1}`); return; }
    if (a !== "yes") return;
    if (q.count && (answers[q.count.key] == null || answers[q.count.key] === "")) out.push(`question ${i + 1} (${q.count.label.replace(/\?$/, "").toLowerCase()})`);
    if (!String(answers[detailsKey(q)] ?? "").trim()) out.push(`question ${i + 1} details`);
  });
  return out;
}

/** What still has to be filled in before the declaration can be sent (labels, for the screen and the API). */
export function missingForSubmit(form: Record<string, any>): string[] {
  const out = HEALTH_REQUIRED.filter((k) => form[k] == null || String(form[k]).trim() === "").map(fieldLabel);
  if (form.visited_affected_area === "yes") {
    if (!String(form.affected_area_port ?? "").trim()) out.push("Affected area port visited");
    if (!form.affected_area_date) out.push("Affected area date of visit");
  }
  if (form.sanitation_cert_carried === "yes" && !String(form.sanitation_cert_issued_at ?? "").trim()) out.push("Certificate issued at");
  return [...out, ...missingAnswers((form.answers ?? {}) as HealthAnswers)];
}
