/**
 * Maritime Declaration of Health (SD-0064) — the form's fields and questions,
 * shared by the portal screen, /api/portal/health-declaration and the PDF so all
 * three agree. It follows Abu Dhabi Ports' own form (the WHO / IHR 2005 model
 * declaration), which the master completes before every Abu Dhabi arrival and
 * sends back to JLS at least five working days ahead.
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
  { key: "port_of_arrival", label: "Port of arrival", type: "text", group: "voyage", trip: true },
  { key: "arriving_from", label: "Arriving from", type: "text", group: "voyage", trip: true },
  { key: "sailing_to", label: "Sailing to", type: "text", group: "voyage", trip: true },
  { key: "crew_count", label: "Crew on board", type: "number", group: "voyage", trip: true },
  { key: "passenger_count", label: "Passengers on board", type: "number", group: "voyage", trip: true },

  { key: "ship_name", label: "Name of ship", type: "text", group: "ship" },
  { key: "imo_no", label: "Registration / IMO no.", type: "text", group: "ship" },
  { key: "flag", label: "Flag (nationality)", type: "text", group: "ship" },
  { key: "master_name", label: "Master's name", type: "text", group: "ship" },
  { key: "gross_tonnage", label: "Gross tonnage", type: "text", group: "ship" },
  { key: "surgeon_name", label: "Ship's surgeon (if carried)", type: "text", group: "ship" },

  { key: "sanitation_cert_carried", label: "Valid Ship Sanitation Control (Exemption) Certificate on board?", type: "yesno", group: "sanitation" },
  { key: "sanitation_cert_issued_at", label: "Certificate issued at", type: "text", group: "sanitation" },
  { key: "sanitation_cert_date", label: "Certificate date", type: "date", group: "sanitation" },
  { key: "reinspection_required", label: "Re-inspection required?", type: "yesno", group: "sanitation", trip: true },
  { key: "visited_affected_area", label: "Has the ship visited an area affected according to the World Health Organization?", type: "yesno", group: "sanitation", trip: true },
  { key: "affected_area_port", label: "Affected area — port", type: "text", group: "sanitation", trip: true },
  { key: "affected_area_date", label: "Affected area — date of visit", type: "date", group: "sanitation", trip: true },
];

export const HEALTH_REQUIRED = [
  "arrival_date", "port_of_arrival", "arriving_from", "ship_name", "master_name", "crew_count", "passenger_count",
];

/**
 * The form's health questions, worded as on the Abu Dhabi form. `count` asks
 * for a number when answered yes; `particulars` means a yes needs details in
 * the schedule.
 */
export type HealthQuestion = { key: string; text: string; count?: { key: string; label: string }; particulars?: boolean; where?: string };

export const HEALTH_QUESTIONS: HealthQuestion[] = [
  { key: "q_death", text: "Has any person died on board during the voyage otherwise than as a result of accident?", count: { key: "deaths_count", label: "Total no. of deaths" }, particulars: true },
  { key: "q_infectious", text: "Is there on board or has there been during the international voyage any case of disease which you suspect to be of an infectious nature?", particulars: true },
  { key: "q_ill_passengers", text: "Has the total number of ill passengers during the voyage been greater than normal/expected?", count: { key: "ill_count", label: "How many ill persons?" } },
  { key: "q_ill_now", text: "Is there any ill person on board?", particulars: true },
  { key: "q_medical", text: "Was a medical practitioner consulted?", particulars: true },
  { key: "q_condition", text: "Are you aware of any condition on board which may lead to infection or spread of disease?", particulars: true },
  { key: "q_sanitary", text: "Has a sanitary measure (e.g. quarantine, isolation, disinfection or decontamination) been applied on board?", particulars: true },
  { key: "q_stowaways", text: "Have any stowaways been found on board?", where: "stowaways_joined" },
  { key: "q_animal", text: "Is there a sick animal or pet on board?", particulars: true },
];

export const SYMPTOMS_NOTE =
  "In the absence of a surgeon, the master should regard the following symptoms as grounds for suspecting the existence of a disease of an infectious nature: " +
  "fever, persisting for several days or accompanied by (i) prostration; (ii) decreased consciousness; (iii) glandular swelling; (iv) jaundice; (v) cough or shortness of breath; (vi) unusual bleeding or (vii) paralysis; " +
  "with or without fever: (i) any skin rash or eruption; (ii) severe vomiting (other than sea sickness); (iii) severe diarrhoea; or (iv) recurrent convulsions.";

export const DECLARATION_TEXT =
  "I hereby declare that the particulars and answers to the questions given in this Declaration of Health (including the schedule) are true and correct to the best of my knowledge and belief.";

export type PortOfCall = { port: string; departed: string };
export type JoinedPerson = { name: string; joined_from: string[] };
export type HealthAnswers = Record<string, string | number | null>;

/** Days Abu Dhabi's offices are open: Monday to Friday (the UAE weekend is Saturday–Sunday). */
const isWorkingDay = (d: Date) => d.getUTCDay() !== 0 && d.getUTCDay() !== 6;

/**
 * The date the declaration must reach JLS by: five working days before the
 * arrival date (yyyy-mm-dd in, yyyy-mm-dd out). Public holidays aren't counted
 * out — the team can still chase a little earlier around Eid.
 */
export function healthDueDate(arrival: string, workingDays = 5): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(arrival)) return null;
  const d = new Date(`${arrival}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  let left = workingDays;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() - 1);
    if (isWorkingDay(d)) left--;
  }
  return d.toISOString().slice(0, 10);
}

/** Today's date in the UAE (yyyy-mm-dd), which is what "late" is judged against. */
export function uaeToday(now = new Date()): string {
  return new Date(now.getTime() + 4 * 3600_000).toISOString().slice(0, 10);
}

/** Is a declaration sent on `sentOn` (yyyy-mm-dd) late for this arrival? */
export function isLate(arrival: string | null | undefined, sentOn: string): boolean {
  const due = arrival ? healthDueDate(arrival) : null;
  return !!due && sentOn > due;
}

/** Every question answered yes or no, with a count where a yes asks for one. */
export function missingAnswers(answers: HealthAnswers): string[] {
  const out: string[] = [];
  HEALTH_QUESTIONS.forEach((q, i) => {
    const a = answers[q.key];
    if (a !== "yes" && a !== "no") out.push(`question ${i + 1}`);
    else if (a === "yes" && q.count && (answers[q.count.key] == null || answers[q.count.key] === "")) out.push(q.count.label.replace(/\?$/, ""));
  });
  return out;
}

/** Any yes that the schedule needs particulars for. */
export const needsParticulars = (answers: HealthAnswers) =>
  HEALTH_QUESTIONS.some((q) => q.particulars && answers[q.key] === "yes");
