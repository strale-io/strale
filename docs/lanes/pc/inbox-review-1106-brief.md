Intent: PC job: read-only review of the petter@strale.io mailbox through Claude in Chrome, plus two reply drafts.

# PC job: Strale inbox review (read and draft only)

**Requester:** the Strale orchestrator (session_01CR5YPsTtEwE3tRQtvTzerw). Petter asked for this himself on 2026-11-06:

> read my strale.io inbox and junk folder with a PC job through Claude in Chrome on outlook.office.com: read and draft only, never send or delete.

## Hard rules

- **Never** send, forward, delete, move, archive, flag or mark as read or unread.
- The only write allowed is **saving a draft**.
- Do not open attachments, and do not follow links inside emails.
- Ask Petter nothing.
- **The report must not go on the PR. The repository is public.** The PR comment carries only the line in Step 4. The full report is your final message in this session, which the orchestrator reads itself.

## Steps

### 1. Open the mailbox

Load the Claude in Chrome tools with ToolSearch `+claude-in-chrome`. Open a NEW tab on https://outlook.office.com/mail/ and confirm that the signed-in account is petter@strale.io. If it is not, or if you are not signed in, report that and end. Never sign in yourself.

### 2. Read

In **Inbox** and in **Junk Email**, read the messages received since 6 November 2026, 12:00 Swedish time. An earlier review covered everything before that. Use the message list and the reading pane.

Look for:
- replies on our open threads in `docs/company/OUTBOX.yaml` (run `git show origin/main:docs/company/OUTBOX.yaml`);
- customers or people who signed up;
- billing, security, abuse or legal mail;
- anything that asks Strale for an answer.

### 3. Save two drafts, as replies in the existing threads

Each draft comes from petter@strale.io and is signed "Petter Lindström, Strale". Save each as a draft only.

**a. probe402** (thread "Strale quotes a price and then refuses the paid call", to Zach):

> Hi Zach, thanks for the test results. For aml-risk-score and ens-resolve, our paid-call challenge carried no example input, and the error body of a rejected call suggested placeholder values such as "example_name" that those tools correctly refuse. Both now publish a real example input (vitalik.eth for ens-resolve, and a fictional company with country SE for aml-risk-score; country-tax-rates already published US), and a rejected call no longer suggests invented values. This is live since 6 November, 15:05 Swedish time, so a re-run should go through.

**b. HMRC** (thread with support ref 2026-CNS433, to softwaredevelopersupport@service.hmrc.gov.uk):

> Hello, a short follow-up on our production credentials request, support reference 2026-CNS433, sent on 27 October. Could you tell us its status, and whether the planned deletion of our sandbox application affects it?

If a thread cannot be found, do not draft that reply. Say so in the report.

### 4. Report

- **On the PR**, post one comment that starts with `To orchestrator:`. It holds only: the number of messages read in Inbox and in Junk, how many drafts were saved, and "full report in the session". No names, subjects or addresses.
- **As your final message in this session**, give at most 25 lines. For each item that needs a reaction: the date in Swedish time, the sender organisation, the subject, a one-line gist, and what it needs (reply, Petter decision, fix). Then one line on what needs nothing, and one line on anything in Junk that belongs in Inbox.
- Never paste email bodies, phone numbers, or any password, code or token. If a mail contains one, write only "contains a credential".

Close the tab you opened, then end. Edit, commit and push nothing.
