/**
 * Email sending — now via Microsoft Graph (we moved off AWS SES).
 *
 * This module keeps its name and `sendEmail` signature so existing callers
 * (permits, visa exports, feedback, ShipSync, etc.) are unchanged; under the hood
 * it sends through Graph (/users/{sender}/sendMail) using the same app
 * registration as the SharePoint integration (Mail.Send permission required).
 * Sender defaults to MAIL_SENDER / the ticket sender (itsupport@jlsyachts.com).
 */
import { sendGraphEmail } from "@/lib/graph-mail.server";

export interface SendEmailOptions {
  to: string[];
  cc?: string[];
  subject: string;
  html: string;
  text: string;
  /** Optional sender mailbox override (must be accessible to the Graph app). */
  from?: string;
}

export async function sendEmail(opts: SendEmailOptions): Promise<void> {
  await sendGraphEmail({
    to: opts.to,
    cc: opts.cc,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
    from: opts.from,
  });
}
