-- Strip the mail gateway's "Unverified Sender" banner out of tickets raised from email.
--
-- The inbound poller was meant to drop this banner and never did: its pattern was
-- anchored to the start of the line, while the gateway prefixes the banner with a
-- warning emoji and a label. So the phishing warning became the opening line of
-- every externally-raised ticket (SD-0031, SD-0034, SD-0035, SD-0038, SD-0056,
-- SD-0057) and was mirrored to New Horizon, where it reads as if Polaris had
-- flagged the ticket itself — a Q-SYS maintenance notice arrived there carrying
-- both a green "Trusted Sender" badge and a red phishing warning.
--
-- The code fix is in src/lib/ticket-mail-inbound.server.ts (GATEWAY_BANNER +
-- stripBanner, covered by src/lib/__tests__/ticket-mail-inbound.test.ts). This
-- clears the rows already stored. Applied to production on 16 Oct 2026:
-- 6 tickets and 14 messages, ~205 characters each, no residue.
--
-- Non-greedy and newline-tolerant on purpose: the banner is occasionally wrapped
-- onto two lines, and a body may carry more than one copy once a thread is quoted
-- back. Only the banner's own sentences are removed — anything the gateway ran
-- onto the same line is kept.

update it_tickets
set description = regexp_replace(
      description,
      '(⚠️[[:space:]]*)?Unverified Sender:.*?trust the content\.[[:space:]]*', '', 'g')
where description ilike '%Unverified Sender%';

update it_ticket_messages
set body = regexp_replace(
      body,
      '(⚠️[[:space:]]*)?Unverified Sender:.*?trust the content\.[[:space:]]*', '', 'g')
where body ilike '%Unverified Sender%';
