# PLAN-4: Accountant GUI

Status: proposal, accepted with overrides. `docs/plans/01-coordinator-decisions.md` CD-3 blocks Approve on uncovered rule sentences for both risk classes. Acknowledgement does not bypass that block. Owns the staff screens only. Ticket state names stay with `ticket-desk`. Retrieval stays with `grounded-response`. Who may approve stays with `professional-review`. Authentication and tenant mapping stay with `firm-boundary`. Ingestion mechanics stay with `knowledge-memory`.

This plan binds to locked decisions 1 and 6 in `docs/plans/00-authoritative-brief.md`: the v1 inbound path is a pasted ticket plus file upload, and the only way text leaves the desk is copy or download after a recorded review. The desk does not call an email API.

## Recommendation

v1 is one staff workspace. An accountant lands on a review desk, opens one ticket, reads a sentence-level draft beside the sources that support it, and only then copies or downloads the approved text. The client has no route, no composer, and no transcript.

### Screen layout

Desktop width, at or above 1200px, is the primary layout. Three columns share one route.

```
┌──────────────────────────────────────────────────────────────────┐
│ Staff bar: firm name, reviewer name, queue filters               │
├──────────────┬───────────────────────────────┬───────────────────┤
│ Queue        │ Open ticket                   │ Sources           │
│              │ jurisdiction, risk, topic     │ search hits       │
│ rows         │ ask (read-only)               │ snippet, version  │
│              │ attachments + readiness       │ origin label      │
│              │ missing facts                 │                   │
│              │ draft sentences               │                   │
│              │ coverage summary              │                   │
│              │ Approve Edit Reject           │                   │
│              │ Request facts                 │                   │
│              │ Copy and Download             │                   │
└──────────────┴───────────────────────────────┴───────────────────┘
```

The queue is about 280px. The ticket column takes the remaining width. The source panel is about 360px. From 768px to 1199px the queue collapses into a button that opens it as a drawer, and the ticket column and source panel stack with the draft first. Below 768px the same regions stack in this order: coverage summary, ticket header, draft, actions, sources, missing facts, attachments, queue. The uncovered count and the four review actions stay on screen without a second product.

Routes, all behind the staff session:

| Route | What it shows |
| --- | --- |
| `/desk` | The workspace with the queue loaded and no ticket selected. The ticket column shows the empty state and the control that opens intake. |
| `/desk/new` | The same workspace with the intake panel in the ticket column. |
| `/desk/tickets/:ticketId` | The same workspace with that ticket selected. |

Intake is the pasted question plus one or more file uploads. It is a panel in the ticket column, with the queue still visible. Submitting it creates the ticket through the application and navigates to `/desk/tickets/:ticketId`.

There is no `/client` route and no message list. The client question is a read-only block titled with the ticket's ask, rendered as plain text.

### Queue

Each row shows:

- Matter or client label supplied by the ticket.
- The ask, truncated to two lines.
- Jurisdiction label, from ticket data.
- Risk class label, from ticket data.
- Topic label: policy, document, or legal or regulatory.
- Uncovered-sentence count when a draft exists.
- An ingestion badge when any attachment is not ready or has failed.
- The latest review-event label the ticket API supplies.

The row for the open ticket is the current item in a listbox. Filters in the staff bar are jurisdiction, risk class, and "ingestion not ready". The jurisdiction filter is built from values present on the tickets, plus All. The chrome does not name a default country.

### Open ticket

The ticket column, from top to bottom:

1. Header. Jurisdiction, risk class, and topic are text chips. A conclusion shows the extra line "A qualified person reviews this before it leaves the desk." A status or document-chase ticket shows the label "Status or document chase." Assignment and the latest review-event label sit on the same header.
2. Ask. The pasted question, read-only.
3. Attachments. File name, size, and readiness: "Preparing for search", "Ready for search", or "Search preparation failed".
4. Missing facts. A list from the ticket. Each item has the fact and whether it is still open. An empty list reads "No missing facts recorded."
5. Coverage summary. Counts of uncovered sentences and of sentences still waiting because ingestion is not ready.
6. Draft. One row per sentence.
7. Action bar. Edit, Request facts, Reject, Approve.
8. Export bar. Copy and Download, disabled until this exact text has a matching approval.

### Draft

The draft is a vertical list of sentences, not a bubble thread. Narrative sentences and rule or obligation sentences are visually distinct because the draft contract marks them. The GUI renders that mark. It does not decide which sentences are rules.

A cited sentence shows a source chip with the handle's title and origin (firm, jurisdiction, or matter). Activating the chip selects that sentence and moves the source panel to the matching hit.

### Sources

The source panel lists the hits the application already retrieved with `/retrieve/search`. The GUI keeps the API order and renders it. It does not re-rank, score, or explain retrieval.

Each hit shows the title, origin, jurisdiction, source version id, and snippet. Activating a hit opens the passage in the panel: the snippet, the version id, and the handle. Full document bodies stay out of the list until the reviewer opens that hit.

Hits group under the origin labels Firm, Jurisdiction, and Matter. The Matter group renders only when the ticket payload includes matter hits. If open decision OD-1 keeps client files out of search, those files stay in the attachment list and the Matter group is absent.

When a sentence with a handle is selected, the matching hit is highlighted. When the selected sentence has no handle, the panel shows "No source is attached to this sentence." A failed source fetch shows "Sources could not be loaded" and a retry. That error is separate from an empty hit list.

### Jurisdiction, risk class, missing facts, uncovered sentences, ingestion

All five are visible without opening a dialog.

| Signal | Where it appears | Treatment |
| --- | --- | --- |
| Jurisdiction | Queue row, ticket header, every source hit, approve dialog | Text from ticket and source data. Filterable. No country is hard-coded in the shell. |
| Risk class | Queue row, ticket header, approve dialog | Text labels for conclusion and for status or document chase. The conclusion header carries the review line above. Color may reinforce the label and is never the only signal. |
| Missing facts | Queue count, list in the ticket column, approve dialog | Open facts stay listed above the draft. Request facts adds to this list. |
| Uncovered sentences | Coverage summary, sentence row, source panel, approve dialog | Defined below. |
| Ingestion not ready | Attachment row, queue badge, coverage summary, filter | "Preparing for search" on the file. The ticket banner reads "Sources from this upload are not searchable yet." |

Uncovered-sentence treatment: a sentence the draft contract marks as a rule or a firm obligation, and that has no source handle, is its own row with a visible text label "Uncovered", a count in the coverage summary, and a source-panel empty state when selected. The summary control moves focus to the first uncovered row. The row also uses a border so the label is easy to scan. The label remains in the accessibility name.

Ingestion not ready is a different state from uncovered. While an attachment is "Preparing for search", the screen does not describe that wait as a failed search. Sentences the draft marks as not yet checked render "Not checked yet". They are omitted from the uncovered count. When preparation fails, the attachment reads "Search preparation failed" and the banner tells the reviewer that this file cannot be cited yet. Sentences that were checked and still have no handle stay "Uncovered".

The workspace refetches attachment readiness from the application while any attachment is preparing, and stops when each attachment is ready or failed. BrainAPI task polling stays with `knowledge-memory`. The screen shows the readiness phrase, not an internal task id.

### Approve, Edit, Reject, Request facts

These four actions are always visible on an open ticket. None of them opens a mail composer, a recipient field, or a send control. Each successful action waits for the application to record the event before the screen shows it as done. Approve is never optimistic.

**Edit.** Edit turns sentence rows into text fields. Save sends the new text to the application and, on success, shows the recorded edit. Cancel restores the last saved text. A sentence whose text changed loses its source chip and renders "Uncovered" until a handle is attached again or the draft contract no longer marks it as a rule. Unchanged sentences keep their handles. The reviewer can attach a handle only by choosing a hit already in the source panel. Save of an unchanged draft records nothing. Export stays disabled for the edited text until a later approval matches it.

**Request facts.** Opens the missing-facts list with a required note for the fact the reviewer needs. Confirm appends the fact and shows the recorded event label from the ticket API. The list can be copied as a staff note. That copy is labeled "Fact request" and is separate from the reply export. The action does not contact the client.

**Reject.** Opens a dialog with a required reason. Confirm records the rejection and shows the rejected label. The draft stays readable. Copy and Download stay disabled. The ticket stays in the queue.

**Approve.** Opens a dialog that shows the reviewer name, jurisdiction, risk class, the count of open missing facts, the count of uncovered rule sentences, and the source version ids that will be stored with the approval. Confirm is enabled only when the signed-in person has the capability flag from `professional-review`. If that flag is missing or still loading, Approve stays disabled and the bar reads "Approval is unavailable for this session."

For a conclusion ticket, Confirm stays disabled while any rule or obligation sentence is uncovered or not yet checked. The dialog links to the first such sentence. For a status or document-chase ticket, uncovered sentences are listed and must be acknowledged before Confirm enables. That split is the screen rule this plan recommends. `professional-review` owns the policy and can replace it. See unresolved decisions.

A successful approval stores the event for this exact text. The export bar then enables. A later edit invalidates that match. The earlier approval remains visible in the review history and does not enable export of the new text.

### Export

Copy and Download sit apart from the four review actions. Both stay disabled until the saved text matches a recorded approval. The enabled controls call the application and use the approved payload the server returns.

Copy places plain text on the clipboard: an approved stamp with reviewer, time, jurisdiction, and ticket id; the approved body; then the citation list with handles and source version ids. Download saves that same text as a `.txt` file named with the ticket id. The screen confirms either action in a status line. There is no `mailto` link.

### Component boundaries and state

| Component | Responsibility |
| --- | --- |
| `DeskShell` | Staff bar, three regions, route outlet, session gate presentation. |
| `QueueList` | Filterable listbox of tickets. |
| `IntakePanel` | Paste field, file input, submit. |
| `TicketHeader` | Jurisdiction, risk, topic, assignment, latest review label. |
| `AskBlock` | Read-only question. |
| `AttachmentList` | File readiness. |
| `MissingFacts` | Fact list and the request-facts form. |
| `CoverageSummary` | Uncovered count, not-checked count, jump control. |
| `DraftEditor` | Sentence rows, edit buffer, source chips. |
| `SourcePanel` | Ordered hits, passage view, empty and error states. |
| `ReviewActions` | Edit, Request facts, Reject, Approve, and their dialogs. |
| `ExportBar` | Copy and Download. |
| `ReviewHistory` | Recorded events already returned for the ticket, read-only. |

State ownership:

| State | Owner |
| --- | --- |
| Ticket, jurisdiction, risk class, topic, missing facts, assignment, review-event label | Application, as defined by `ticket-desk`. The screen displays them. |
| Sentences, handles, rule marks, not-yet-checked marks | Application, as defined by `grounded-response`. |
| Attachment readiness, source version ids, hit origin | Application, as defined by `knowledge-memory`. |
| `canApprove`, approval record, export stamp wording | Application, as defined by `professional-review`. |
| Staff session and firm scope | Application, as defined by `firm-boundary`. |
| Open ticket id, selected sentence, selected hit, edit buffer, open dialog, queue filters, drawer open | Browser. |

The edit buffer is the only draft text the browser holds ahead of the server. Queue filters may live in the URL query so a refresh keeps them. The selected ticket lives in the route.

### Rendering and data fetching

The desk shell and the queue can render on the server for the first load. The ticket workspace hydrates on the client because of the editor, dialogs, and readiness refresh. The browser calls same-origin application routes only. It never calls BrainAPI and never sees a PAT or a brain id.

Opening a ticket paints the header and the ask from the ticket payload first. The draft and the source panel have their own loading states, so a slow source list does not blank the question. Readiness refetch runs only while an attachment is preparing.

### Loading, empty, and error

- Queue loading: skeleton rows inside the list.
- No tickets: "No tickets in this queue" and the intake control.
- Ticket loading: skeleton in the ticket column. The queue stays usable.
- Ticket missing or forbidden: the ticket column says the ticket is unavailable. No ask and no draft are rendered.
- Draft still generating: "Draft is not ready" in the draft region. Actions that need a draft stay disabled.
- Source loading: skeleton hits.
- Save, approve, reject, or request-facts in flight: that control shows its busy label and the other review controls disable until the request finishes.
- Failed save or failed decision: the dialog or editor stays open, the buffer stays, and a plain-language error sits on that control. Export remains disabled.

### Accessibility

The queue is a listbox. Sentence rows are buttons in read mode and fields in edit mode. Dialogs trap focus and return focus to the control that opened them. Coverage changes and readiness changes announce through a status region. Uncovered, risk class, and readiness always include text. Hit snippets are plain text. The draft renders model output as text, with no HTML from the model.

### Responsive behavior

At or above 1200px, all three columns are visible. Between 768px and 1199px, a "Queue" button opens the drawer and the source panel follows the draft. Below 768px, the coverage summary and the action bar stay above the fold of the ticket. Approve on a small screen uses the same dialog as desktop. This is a desk product. Small viewports still expose every review signal.

### Performance budgets

These are planning budgets for the fixture desk, not production SLOs.

- The shell and queue skeletons are visible within one second on a local 50-ticket fixture.
- Typing in the edit buffer stays in the browser until Save.
- The source list renders snippets for the first 20 hits and offers the rest on request.
- Opening a hit fetches that passage then. The list does not download every full document.
- Readiness refetch uses the application ticket payload, not a second search, and stops when preparation finishes.

### Analytics and security

v1 records product events only if an analytics sink already exists. Payloads may include the event name, ticket id, risk class, jurisdiction id, uncovered count, and whether export was used. Payloads omit the ask, the draft, file names, snippets, client names, and missing-fact text.

The desk is usable only with a staff session. A logged-out request to a ticket URL shows the sign-in path from `firm-boundary` and no ticket body. Export uses the server's approved payload. Brain ids, PATs, and system credentials are absent from the page, the downloads, and the clipboard text.

## Alternatives

1. **Chat transcript as the ticket body.** A thread would make the model the primary object and would hide jurisdiction, coverage, and approval around bubbles. The brief forbids that as the primary layout. The question stays a single read-only block beside a sentence list.
2. **Wizard with separate pages for queue, draft, and sources.** That keeps each step simple and makes citation checking a page change. Review needs the ask, the sentence, and the hit in one look. The three-column desk is the v1 layout. The narrow-width stack is the fallback.
3. **Whole-draft textarea with citations in a footer.** Fast to build, and it loses the per-sentence uncovered label. Sentence rows are the editing model so a changed sentence can drop its handle.
4. **Block export until every ticket has zero uncovered sentences.** Strongest guard. Status replies are allowed to say what is missing, and those sentences are not rule citations. The screen blocks clean approval only for conclusion tickets that still have uncovered or unchecked rule sentences.
5. **Download as PDF or DOCX.** Closer to what a firm might attach later. v1 uses the approved `.txt` so export does not take a document engine. A richer file type can replace the extension later without changing the gate.

## Assumptions

- No frontend tree exists yet. Paths below are the proposed home and can move when an app root is chosen.
- The application returns one ticket payload the screen can render: jurisdiction, risk class, topic, ask, attachments with readiness, missing facts, sentences with handles and rule marks, ordered search hits, `canApprove`, and recorded review events. Field names are not fixed here.
- Search hits arrive already ordered. The panel displays that order.
- One ticket is open at a time.
- Chrome copy is English. Jurisdiction labels and draft text may be longer and may be another language. The layout wraps. It does not translate the law.
- Any assigned staff member may edit and request facts. Approve follows the capability flag.
- OD-1 may or may not put client uploads in a matter brain. Attachments always render from the ticket. Search hits render only when the payload includes them.
- Copy before approval is unavailable, including for a reviewer's personal notes of the draft. The fact-request copy is the one pre-approval copy, and it is labeled as a fact request.
- A human can still retype a draft outside the product. The screen's control is the export gate and the visible uncovered state.

## Dependencies

| Dependency | What the screen needs |
| --- | --- |
| `ticket-desk` | Queue and ticket records, jurisdiction, risk class, topic, missing facts, assignment, and recorded edit, reject, and request-facts events. State names are theirs. |
| `grounded-response` | Sentence list, rule or obligation marks, citation handles, not-yet-checked marks, and the wording used when retrieval is empty or conflicting. |
| `knowledge-memory` | Attachment readiness, source version ids, and hit origin. Their plan owns BrainAPI task polling. |
| `professional-review` | `canApprove`, the approval record, the history fields, and the export stamp wording. They confirm or replace the conclusion hard stop. |
| `firm-boundary` | Staff session, firm-scoped queue, and a browser that never receives a PAT or brain id. |
| Locked decision 1 | Paste-and-upload intake inside this workspace. Practice-system sync is a seam and has no screen in v1. |
| Locked decision 6 | Recorded approve, edit, and reject. Export is copy or download only. |
| OD-1 | Whether client files appear as Matter hits. The screen tolerates either outcome. |

## Risks

1. **Highest risk.** A reviewer treats unapproved text, or a conclusion that still has uncovered rule sentences, as the client reply. The export bar stays disabled until an approval matches the current text. Conclusion tickets with uncovered or unchecked rule sentences cannot be confirmed. The approved clipboard text carries the stamp and the version list so the exported words match the record.
2. **Ingestion wait read as "no such rule".** A file that is still preparing can look like an empty search. The screen uses "Preparing for search" and "Not checked yet", and it keeps those sentences out of the uncovered count.
3. **Edit leaving a stale citation.** Saving changed sentence text drops that sentence's handle and shows "Uncovered" before the next approval.
4. **Approve enabled for the wrong person.** A missing capability flag disables Approve. The control does not default to enabled.
5. **Source-panel failure marked as uncovered.** A failed hit fetch shows its own error. Coverage labels continue to come from the draft payload.
6. **Client content in analytics or in the page for a logged-out user.** Event payloads exclude ticket text. A missing session renders no ticket body.
7. **Small-screen review hiding the uncovered count.** The coverage summary stays with the actions in the stacked layout.
8. **Matter hits shown from the wrong engagement.** Hits render only from the current ticket payload. The panel does not offer a brain picker.

## Validation

A later browser pass, signed in as a staff reviewer, proves the workspace. Each check names the user action.

1. Open `/desk`. The queue, the empty ticket column, and the intake control are visible. The page has no client transcript and no send control.
2. Open `/desk/new`, paste a question, attach a file, and submit. The new row appears in the queue with its jurisdiction and risk class, and the workspace navigates to that ticket.
3. Open a second fixture whose jurisdiction id differs from the first. Both labels render from the data. Change the jurisdiction filter and see the queue narrow.
4. Open a ticket while its upload is still preparing. See "Preparing for search" on the file and "Not checked yet" on sentences that are waiting. Confirm those sentences are outside the uncovered count.
5. After the attachment is ready, select a sentence labeled "Uncovered". The source panel reads "No source is attached to this sentence." Activate the coverage summary and confirm focus moves to the first uncovered sentence.
6. Select a cited sentence. The matching hit highlights. Open the hit and read the snippet and the source version id.
7. Choose Edit, change a cited sentence, and save. That sentence drops its chip and shows "Uncovered". Copy and Download stay disabled.
8. Choose Request facts, add a fact, and confirm. The fact appears in the list. The workspace shows no recipient field and no send control.
9. Choose Reject, enter a reason, and confirm. The rejected label appears. Copy and Download stay disabled.
10. On a conclusion fixture with an uncovered rule sentence, choose Approve. Confirm stays disabled, and the dialog link moves focus to that sentence.
11. On a conclusion fixture where every rule sentence has a handle, and the session can approve, choose Approve and confirm. Copy becomes enabled. Copy, then paste into a local text target: the text includes the approved stamp, the body, and the source versions. Download saves a `.txt` of that same payload.
12. Edit the approved text and save. Copy and Download disable again. The history still shows the earlier approval.
13. Sign out and open `/desk/tickets/:ticketId`. The ticket body is absent and the sign-in path is shown.
14. Narrow the viewport below 768px, reload the open ticket, and reach the uncovered count, Approve, and the source list from the keyboard.

Automated coverage that supports that pass:

- Component tests for uncovered versus not-checked labels, the disabled export bar, and the disabled conclusion confirm.
- A route test that an unauthenticated ticket request renders no ask and no draft.
- One browser run that performs checks 5, 7, 10, and 11 in order on fixture data.

## Unresolved decisions

1. **Conclusion hard stop.** This plan disables Approve confirm on a conclusion ticket while any rule sentence is uncovered or not checked, and it requires an acknowledgement on a status ticket. `professional-review` owns that policy and may require the same hard stop for both classes, or an acknowledgement for both.
2. **Ticket state names and event labels.** The screen renders whatever labels `ticket-desk` ships. It does not define the lifecycle.
3. **OD-1.** Matter hits appear only if the ticket payload includes them. If client files never enter search, the attachment list is their only surface.
4. **Download format.** v1 is `.txt`. A later request for PDF or DOCX can change the file type after the export gate exists.
5. **Draft-not-ready behavior.** If `grounded-response` streams sentences, the screen can show them as they arrive. If it returns one payload, the draft region waits. Either fits this layout.
6. **Fact-request copy.** The fact list can be copied as a staff note. Whether that copy is itself a recorded event belongs to `professional-review`.
7. **Analytics sink.** Event names above are the allowed set. No sink is required for v1.
8. **App root and framework.** This plan does not choose them. Components above are the boundary, whatever the framework.

## Task list

### T1. Workspace shell and routes

- Description: Add the staff desk shell with the three regions, the staff bar, and the routes `/desk`, `/desk/new`, and `/desk/tickets/:ticketId`. A missing session renders the sign-in path and no ticket body.
- Acceptance criteria: A signed-in user sees the queue column, the ticket column, and the source column on a wide viewport. Ticket selection changes the route. A logged-out ticket URL shows no ask and no draft. No route presents a client transcript or a send control.
- Verification: Browser pass. Sign in, open `/desk`, and confirm the three regions. Sign out, open a ticket URL, and confirm the body is absent.
- Dependencies: `firm-boundary` session gate. Can be stubbed with a fixture session until that plan lands.
- Files likely touched: `web/src/desk/DeskShell.tsx`, `web/src/desk/routes.tsx`, `web/src/desk/RequireStaff.tsx`
- Estimated scope: M

### T2. Queue and intake

- Description: Render the queue rows and filters, and the intake panel for a pasted ask plus file upload.
- Acceptance criteria: Each row shows jurisdiction, risk class, topic, uncovered count when present, and the ingestion badge when an attachment is not ready. Filters narrow the list. Submitting intake creates a ticket and opens it. The jurisdiction filter is data-driven.
- Verification: Browser pass. Paste a question, upload a file, submit, and see the new row with its jurisdiction and risk class. Switch the jurisdiction filter and see the queue change.
- Dependencies: T1. Ticket create and list from `ticket-desk`.
- Files likely touched: `web/src/desk/QueueList.tsx`, `web/src/desk/IntakePanel.tsx`
- Estimated scope: M

### T3. Ticket header, facts, attachments, and readiness

- Description: Render the open ticket's header, ask, missing facts, and attachment readiness, including the preparing and failed banners.
- Acceptance criteria: Jurisdiction, risk class, and topic are text in the header. A conclusion shows the review line. Missing facts list above the draft. A preparing attachment shows "Preparing for search" and the ticket banner. A failed attachment shows "Search preparation failed". Readiness refreshes from the application until every attachment is ready or failed.
- Verification: Browser pass. Open a ticket whose upload is still preparing and read the preparing banner. Open a ticket with an open missing fact and see it above the draft. Open two tickets with different jurisdiction ids and read both labels.
- Dependencies: T1. Ticket payload from `ticket-desk`. Readiness values from `knowledge-memory`.
- Files likely touched: `web/src/desk/TicketHeader.tsx`, `web/src/desk/AskBlock.tsx`, `web/src/desk/AttachmentList.tsx`, `web/src/desk/MissingFacts.tsx`
- Estimated scope: M

### T4. Draft sentences, uncovered treatment, and edit

- Description: Render the draft as sentence rows with coverage labels, and save edits that drop handles on changed sentences.
- Acceptance criteria: A rule sentence with no handle shows "Uncovered" and is included in the coverage count. A sentence marked not checked shows "Not checked yet" and is excluded from that count. The summary control focuses the first uncovered sentence. Save of a changed cited sentence removes its chip and shows "Uncovered". Cancel restores the last saved text. An unchanged save records nothing.
- Verification: Browser pass. Select an uncovered sentence and read its label. Edit a cited sentence, save, and see the chip gone and Copy still disabled. Activate the coverage summary and confirm focus lands on the first uncovered sentence.
- Dependencies: T3. Draft contract from `grounded-response`. Edit event from `ticket-desk`.
- Files likely touched: `web/src/desk/DraftEditor.tsx`, `web/src/desk/CoverageSummary.tsx`
- Estimated scope: M

### T5. Source panel

- Description: Render the ordered search hits, sync selection with the draft, and show the empty and error states.
- Acceptance criteria: Hits keep API order and show title, origin, jurisdiction, version id, and snippet. Selecting a cited sentence highlights its hit. Selecting an uncovered sentence shows "No source is attached to this sentence." A failed fetch shows "Sources could not be loaded" and does not relabel sentences. Opening a hit shows that passage. The list starts with 20 snippets.
- Verification: Browser pass. Select a cited sentence and see the matching hit. Open it and read the version id. Select an uncovered sentence and read the empty state.
- Dependencies: T4. Search-hit payload from `grounded-response` and `knowledge-memory`.
- Files likely touched: `web/src/desk/SourcePanel.tsx`
- Estimated scope: M

### T6. Review actions

- Description: Add Request facts, Reject, and Approve dialogs, with the capability flag and the conclusion confirm rule.
- Acceptance criteria: Request facts adds a fact and shows no recipient or send control. Reject requires a reason, records the event, and leaves export disabled. Approve shows jurisdiction, risk, missing-fact count, uncovered count, and source versions. Confirm stays disabled when `canApprove` is absent. On a conclusion ticket, Confirm stays disabled while any rule sentence is uncovered or not checked, and the dialog can move focus to that sentence. On a status ticket, acknowledgement enables Confirm. A recorded approval matches the current text only.
- Verification: Browser pass. Submit a fact request and confirm no send control appears. Reject a ticket and see Copy disabled. On a conclusion ticket with an uncovered sentence, open Approve and see Confirm disabled. Follow the dialog link to that sentence.
- Dependencies: T4, T5. `canApprove` and approval record from `professional-review`. Event recording from `ticket-desk`.
- Files likely touched: `web/src/desk/ReviewActions.tsx`, `web/src/desk/ReviewHistory.tsx`
- Estimated scope: M

### T7. Copy and download

- Description: Enable Copy and Download only when the saved text matches a recorded approval, using the server payload.
- Acceptance criteria: Both controls are disabled before that match and after a later edit. Copy writes the stamp, the body, and the citation versions. Download saves the same text as `.txt`. The page has no email control. A failed export leaves the approval in place and shows an error on the export bar.
- Verification: Browser pass. Approve a fully cited conclusion, choose Copy, and paste it into a local text target. The paste contains the stamp and the source versions. Choose Download and open the `.txt`. Edit, save, and see both controls disable.
- Dependencies: T6. Approved payload and stamp wording from `professional-review`.
- Files likely touched: `web/src/desk/ExportBar.tsx`
- Estimated scope: S

### T8. Loading, errors, narrow viewport, and browser proof

- Description: Add the loading, empty, and error states, keep the stacked small-screen order, and run the workspace proof on fixture tickets.
- Acceptance criteria: Queue, ticket, draft, and source loading states render independently. An unavailable ticket shows no body. Below 768px the coverage summary and the four actions are reachable. The keyboard can reach the queue, the uncovered sentence, Approve, and the source list. The browser checks in Validation all pass on fixtures, including two jurisdictions and one preparing upload.
- Verification: Browser pass. Reload an open ticket below 768px and tab to the uncovered count, then to Approve, then to a source hit. Trigger a source-load failure and read "Sources could not be loaded" while sentence labels stay as they were.
- Dependencies: T1 through T7.
- Files likely touched: `web/src/desk/DeskShell.tsx`, `web/src/desk/states.tsx`, `web/src/desk/desk.browser.test.ts`
- Estimated scope: M
