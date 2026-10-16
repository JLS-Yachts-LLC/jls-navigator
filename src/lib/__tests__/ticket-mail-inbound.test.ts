/**
 * The email → ticket pipeline, pinned against the bodies we actually received.
 *
 * Every case here is a regression from a real ticket. The gateway banner patterns
 * had never matched our gateway's actual wording, so the phishing warning was
 * stored as the opening line of every externally-raised ticket and mirrored to
 * New Horizon — where it reads as if Polaris itself had flagged the ticket.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractReplyText, extractForwardedText, shouldNotRaiseTicket } from "../ticket-mail-inbound.server";

/** Verbatim, emoji and all, as the JLS mail gateway inserts it. */
const BANNER =
  "⚠️ Unverified Sender: This email originated from outside the organization and could be a phishing attempt. " +
  "Do not click links or download attachments unless you recognize the sender and trust the content.";

test("the gateway's unverified-sender banner is stripped from a reply", () => {
  const out = extractReplyText(`${BANNER}\n\nDear Matthew,\n\nWe will proceed with creating the new ticket.`);
  assert.ok(!out.includes("Unverified Sender"), out);
  assert.ok(!out.includes("phishing"), out);
  assert.match(out, /^Dear Matthew,/);
});

test("the banner is stripped when the message starts on the very next line", () => {
  // SD-0034 / SD-0038 arrived with no blank line after the banner.
  const out = extractReplyText(`${BANNER}\nDear Matthew,\n\nFollowing our troubleshooting session.`);
  assert.ok(!out.includes("Unverified Sender"), out);
  assert.match(out, /^Dear Matthew,/);
});

test("a banner wrapped onto two lines is stripped whole", () => {
  const wrapped =
    "⚠️ Unverified Sender: This email originated from outside the organization and could be a phishing attempt.\n" +
    "Do not click links or download attachments unless you recognize the sender.\n\nThe portal is down.";
  const out = extractReplyText(wrapped);
  assert.ok(!out.includes("Unverified Sender"), out);
  assert.ok(!out.includes("Do not click links"), out);
  assert.match(out, /^The portal is down\./);
});

test("stripping the banner never empties the ticket", () => {
  // The banner shares a line with the message when a gateway omits the break.
  const out = extractReplyText(`${BANNER} The licensing portal is offline.`);
  assert.ok(out.trim().length > 0, "body must not come back empty");
});

test("paragraph breaks in the body survive — the mirror relies on them", () => {
  const body = `${BANNER}\n\nPlan for downtime\n\nNotice of downtime\n\nThank you for being a valued Q-SYS customer.`;
  const out = extractForwardedText(body);
  assert.ok(!out.includes("Unverified Sender"), out);
  assert.match(out, /Plan for downtime\n\nNotice of downtime/);
});

test("a forwarded original keeps its content and loses the banner", () => {
  const mail = [
    BANNER,
    "",
    "Hi team, please see below.",
    "",
    "From: Marco Alberti <support@omniaccess.com>",
    "Sent: 30 September 2026 07:24",
    "Subject: VSAT Offline",
    "",
    "The terminal has been offline since 06:00.",
  ].join("\n");
  const out = extractForwardedText(mail);
  assert.ok(!out.includes("Unverified Sender"), out);
  assert.match(out, /Hi team, please see below\./);
  assert.match(out, /The terminal has been offline since 06:00\./);
});

// ─── Which mail deserves a ticket ─────────────────────────────────────────────

test("vendor broadcasts do not raise a ticket", () => {
  // Both raised tickets, and mirrors, on 15 Oct 2026.
  assert.equal(
    shouldNotRaiseTicket("communications@qsc.com", "Q-SYS maintenance notice: subscription and license management", {}),
    "automated",
  );
  assert.equal(
    shouldNotRaiseTicket("quarantine@messaging.microsoft.com", "Microsoft 365 security: You have messages in quarantine", {}),
    "automated",
  );
});

test("a vendor notice is suppressed on its subject even from an ordinary address", () => {
  assert.equal(shouldNotRaiseTicket("team@vendor.com", "Scheduled maintenance 17 October", {}), "automated");
});

test("a colleague is never suppressed by the vendor rules", () => {
  // A captain asking the desk to book a maintenance window is asking for help.
  assert.equal(shouldNotRaiseTicket("h.ackermann@jlsyachts.com", "Maintenance window for the bridge PC?", {}), null);
  assert.equal(shouldNotRaiseTicket("notifications@jlsyachts.com", "Scheduled maintenance question", {}), null);
});

test("real vendor support mail still raises a ticket", () => {
  assert.equal(shouldNotRaiseTicket("support@omniaccess.com", "MY Plvs Vltra - 10371 - VSAT Offline", {}), null);
});

test("no-reply senders and automated subjects are still suppressed", () => {
  assert.equal(shouldNotRaiseTicket("defender-noreply@microsoft.com", "New vulnerabilities notification", {}), "automated");
  assert.equal(shouldNotRaiseTicket("someone@vendor.com", "Automatic reply: out of office", {}), "automated");
  assert.equal(shouldNotRaiseTicket("someone@vendor.com", "A real problem", { "list-unsubscribe": "<mailto:x>" }), "automated");
});
