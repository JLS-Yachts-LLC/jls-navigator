/**
 * Training-room tablet — what may reach a shared screen, and how a sign-in is
 * matched to a student. The calendar is typed by hand and mixes course entries
 * with lists of students' first names; only the courses may ever show.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDays, buildCalendar, categoryLabel, cleanUrl, courseKeys, dubaiToday, firstName, isCalendarEvent,
  isSessionEvent, matchStudent, mobileKey, nameKey, normaliseKioskSettings, validateSignIn,
  type CalendarRow, type StudentRow,
} from "../training-kiosk";

const courses = courseKeys([
  "RYA PWC", "RYA Powerboat Intermediate", "SRC/VHF (Short Range Certificate / VHF Radio):", "RYA First Aid",
]);
const ev = (title: string, category: string | null, over: Partial<CalendarRow> = {}): CalendarRow => ({
  id: Math.random().toString(36).slice(2), event_date: "2026-10-19", title, time_of_day: "0900-1700", category, ...over,
});

test("course and exam entries are sessions; lists of students' names never are", () => {
  assert.equal(isSessionEvent(ev("Intermediate", "Class"), courses), true);
  assert.equal(isSessionEvent(ev("PB2", "Exam"), courses), true);
  assert.equal(isSessionEvent(ev("RYA PWC", null), courses), true, "uncategorised but plainly a course");
  assert.equal(isSessionEvent(ev("SRC/VHF (Short Range Certificate / VHF Radio)", null), courses), true);
  assert.equal(isSessionEvent(ev("Nausad, Ali, Arif", null), courses), false);
  assert.equal(isSessionEvent(ev("MY ORKA Crew - Ryann, James, Vito, Blair", null), courses), false);
  assert.equal(isSessionEvent(ev("Jerry, Joshua", null), courses), false);
  assert.equal(isSessionEvent(ev("Staff meeting", "Meeting"), courses), false);
  assert.equal(isSessionEvent(ev("RYA PWC", "Other"), courses), false, "a set category other than Class/Exam wins");
});

test("closed days show on the calendar but can't be signed in to", () => {
  const h = ev("National Day", "Holiday");
  assert.equal(isSessionEvent(h, courses), false);
  assert.equal(isCalendarEvent(h, courses), true);
  assert.equal(categoryLabel("Holiday"), "Closed");
  assert.equal(categoryLabel("class"), "Class");
  assert.equal(categoryLabel(null), null);
});

test("the calendar is grouped by day, in range, with names and meetings left out", () => {
  const rows = [
    ev("Advanced", "Class", { event_date: "2026-10-21", time_of_day: "1400-2000" }),
    ev("Nausad, Ali, Arif", null, { event_date: "2026-10-21", time_of_day: null }),
    ev("Advanced", "Exam", { event_date: "2026-10-22" }),
    ev("RYA PWC", null, { event_date: "2026-10-21", time_of_day: "0900-1600" }),
    ev("Old class", "Class", { event_date: "2026-10-01" }),
    ev("Far away", "Class", { event_date: "2027-01-01" }),
    ev("Team meeting", "Meeting", { event_date: "2026-10-21" }),
  ];
  const cal = buildCalendar(rows, courses, "2026-10-19", "2026-11-30");
  assert.deepEqual(cal.map((d) => d.date), ["2026-10-21", "2026-10-22"]);
  assert.deepEqual(cal[0].events.map((e) => e.title), ["RYA PWC", "Advanced"], "time order within a day");
  assert.equal(JSON.stringify(cal).includes("Nausad"), false);
  assert.equal(JSON.stringify(cal).includes("meeting"), false);
});

test("names are matched without case, accents, punctuation or extra spaces", () => {
  assert.equal(nameKey("  Zoë   O'Neil "), "zoe oneil");
  assert.equal(nameKey("ALI KHAN"), nameKey("ali khan"));
  assert.equal(nameKey("Jean-Luc Picard"), "jean luc picard");
  assert.equal(firstName("  ali   khan "), "ali");
});

test("UAE mobiles match however they're typed", () => {
  const k = mobileKey("050 123 4567");
  assert.equal(k, "501234567");
  assert.equal(mobileKey("+971 50 123 4567"), k);
  assert.equal(mobileKey("00971501234567"), k);
});

test("a sign-in needs a name and a mobile number", () => {
  assert.deepEqual(validateSignIn({ name: "Ali Khan", mobile: "050 123 4567" }), { name: "Ali Khan", mobile: "050 123 4567" });
  assert.ok("error" in validateSignIn({ name: " ", mobile: "0501234567" }));
  assert.ok("error" in validateSignIn({ name: "A", mobile: "0501234567" }));
  assert.ok("error" in validateSignIn({ name: "Ali Khan", mobile: "12345" }));
  assert.ok("error" in validateSignIn({ name: "Ali Khan" }));
});

const students: StudentRow[] = [
  { id: "s1", full_name: "Ali Khan", mobile: "+971501234567", enrollment_status: "Enrolled" },
  { id: "s2", full_name: "Ali Khan", mobile: "0559876543", enrollment_status: "Enrolled" },
  { id: "s3", full_name: "Violeta Ruiz", mobile: null, enrollment_status: "New Student" },
  { id: "s4", full_name: "Old Booking", mobile: "0521112222", enrollment_status: "Cancelled" },
];

test("a sign-in is linked by mobile first, even when two students share a name", () => {
  assert.deepEqual(matchStudent("ali khan", "050 123 4567", students), { id: "s1", method: "mobile" });
});

test("by full name only when exactly one student has it", () => {
  assert.deepEqual(matchStudent("violeta  ruiz", "0500000000", students), { id: "s3", method: "name" });
  assert.equal(matchStudent("Ali Khan", "0500000000", students), null, "two Ali Khans — staff decide");
  assert.equal(matchStudent("Someone New", "0500000000", students), null);
});

test("cancelled students are never matched", () => {
  assert.equal(matchStudent("Old Booking", "0521112222", students), null);
});

test("settings keep only an https review link and a short title", () => {
  assert.deepEqual(normaliseKioskSettings({ reviewUrl: " https://g.page/r/abc/review ", title: " Training room " }),
    { reviewUrl: "https://g.page/r/abc/review", title: "Training room" });
  assert.deepEqual(normaliseKioskSettings({ reviewUrl: "http://example.com", title: "" }), {});
  assert.deepEqual(normaliseKioskSettings({ reviewUrl: "javascript:alert(1)" }), {});
  assert.deepEqual(normaliseKioskSettings(null), {});
  assert.equal(cleanUrl("not a url"), null);
});

test("today is the UAE date, whatever the tablet's clock zone", () => {
  // 21:30 UTC on 18 Oct is already 01:30 on 19 Oct in Dubai.
  assert.equal(dubaiToday(new Date("2026-10-18T21:30:00Z")), "2026-10-19");
  assert.equal(addDays("2026-10-30", 3), "2026-11-02");
});
