# Ticket desk

Status: proposal for PLAN-1, accepted with overrides. `docs/plans/01-coordinator-decisions.md` CD-1 through CD-4 replace the chase approve gate and the “any staff user” approver. The application database is the system of record for the ticket. BrainAPI stores memories. It does not store the ticket.

This plan accepts every locked decision in `docs/plans/00-authoritative-brief.md`, including the OD-1 default. Client file bytes stay in the application database. A matter-scoped brain, if OD-1 stands, is a retrieval location resolved outside this plan. The ticket stores `file_id` and `client_matter_ref`. It does not store a brain id.

v1 intake is a ticket pasted by firm staff, plus optional file upload. Copy and download are the only export actions. Both happen after a human approval. The lifecycle has no delivery state.

Vendor marketing figures are not requirements.

## Recommendation

A ticket is one client question for one firm, one matter, and one jurisdiction. Staff confirm a topic and a risk class before anyone can ask for a draft. The topic is `policy`, `document`, or `legal_or_regulatory`. The risk class is `status_or_document_chase` or `conclusion`.

The states are `intake`, `triage`, `awaiting_facts`, `ready`, `draft_in_progress`, `in_review`, `escalated`, `approved`, and `closed`. `approved` means a named person accepted a named draft version. `closed` with reason `completed` is allowed only from `approved`. Nothing in the lifecycle sends that text to the client.

### Fields required before a draft may be requested

All of the following must hold. The request event is `ticket.draft_requested`.

| Gate | Rule |
| --- | --- |
| Firm | `firm_id` is set. |
| Origin | `origin` is `paste`. |
| Matter | `client_matter_ref` is a non-empty opaque string. |
| Ask | `ask_text` is non-empty after trimming. |
| Jurisdiction | `jurisdiction_id` is a non-empty opaque id. The value is data. The lifecycle does not embed a country. |
| Classification | `topic` and `risk_class` are set, and `classification_confirmed_at` plus `classification_confirmed_by` record a staff confirmation of the current triple: jurisdiction, topic, risk class. |
| Facts | `missing_facts_assessed_at` is set. An empty `missing_facts` list is a completed assessment. |
| Conclusion facts | When `risk_class` is `conclusion`, every fact with `material` true has `status` `resolved`. |
| Owner | `assignee_id` is a staff user of `firm_id`. |
| Disclosure | `disclosure_gate` is `cleared`. `unknown` and `blocked` refuse the request. Professional review writes this value. |
| Hold | The ticket is not `escalated`, and `open_draft_request_id` is empty. |
| State | The state is `ready`, or the state is `in_review` and the request names the current draft version in `revision_of`. |

Attachments are optional. A qualified approver is not required at request time. Qualification is checked when a conclusion is approved. The assignee is the owner of the work. The approver is recorded separately and may be the same person.

Changing jurisdiction, topic, risk class, ask text, the missing-fact assessment, or the attachment set clears `classification_confirmed_at` when the change touches the confirmed triple, marks any current draft `stale`, and withdraws a current approval. A stale or rejected version cannot be approved.

### Record fields

| Field | Meaning |
| --- | --- |
| `ticket_id` | Stable id. Reopen keeps the same id. |
| `firm_id` | Tenant. Brain mapping stays in the firm-boundary plan. |
| `origin` | `paste` in v1. |
| `client_matter_ref` | Opaque matter key for files and for a later matter brain. |
| `ask_text` | The pasted client question. |
| `jurisdiction_id` | One jurisdiction. |
| `topic` | `policy`, `document`, or `legal_or_regulatory`. |
| `risk_class` | `status_or_document_chase` or `conclusion`. |
| `classification_confirmed_by`, `classification_confirmed_at` | Staff confirmation of the current jurisdiction, topic, and risk class. |
| `missing_facts` | Each item has `id`, `text`, `material`, `status` (`open` or `resolved`), `opened_by`, `opened_at`, and `resolved_at` when resolved. |
| `missing_facts_assessed_at` | When staff last declared the list complete. |
| `attachments` | `file_id`, display name, content hash, uploading staff id, uploaded time. Bytes stay in the application database. |
| `assignee_id` | Current owner. Empty until assigned. |
| `disclosure_gate` | `unknown`, `cleared`, or `blocked`. Default `unknown`. |
| `state` | One of the nine states. |
| `resume_state` | Set only while `escalated`. |
| `open_draft_request_id` | The single in-flight request, or empty. |
| `current_draft` | `draft_id`, `version`, `content_hash`, `disposition`, `producer` (`drafter` or `staff`), `source_version_handles`, `stale`, `rejected`. Empty when no current version exists. |
| `draft_history` | Append-only versions. |
| `current_approval_id` | Points at the approval for the current version, or empty. |
| `close` | Empty, or `reason`, `closed_by`, `closed_at`, optional note, optional `related_ticket_id`. |

`disposition` is `status_update`, `supported_answer`, or `unsupported`. Grounded response chooses it for a model draft. A staff edit sets it on the new version. `source_version_handles` are an opaque list. This plan does not define how they are retrieved.

### States and transitions

| State | What is true |
| --- | --- |
| `intake` | The shell exists. The ask may still be empty. |
| `triage` | The ask is saved. The draft gate is not met, and the ticket is not a conclusion waiting on a material fact. |
| `awaiting_facts` | Classification exists, the class is `conclusion`, and at least one material fact is open. |
| `ready` | The draft gate is met. No request is in flight. No current approvable draft is waiting. |
| `draft_in_progress` | One `ticket.draft_requested` is open. |
| `in_review` | A current draft version exists and is not approved. |
| `escalated` | Draft requests, new approvals, and exports are frozen. `resume_state` remembers where to return. |
| `approved` | The current version has a live approval. Copy and download are allowed. |
| `closed` | The episode is finished. History remains. |

Allowed moves:

| From | Event | Guard | To |
| --- | --- | --- | --- |
| `intake` | `ticket.ask_set` | Ask is non-empty. | `triage` |
| `intake` | `ticket.closed` | Reason is `withdrawn` or `duplicate`. | `closed` |
| `triage` | Gate inputs saved | Conclusion, classification present, and a material fact is open. | `awaiting_facts` |
| `triage` | Gate inputs saved | The draft gate is fully met. | `ready` |
| `triage` | `ticket.escalated` | A reason from the escalation set is set. | `escalated` |
| `triage` | `ticket.closed` | Reason is `withdrawn`, `duplicate`, `declined`, or `cannot_answer`. | `closed` |
| `awaiting_facts` | Facts or class change | A material fact is still open and the class is still `conclusion`. | `awaiting_facts` |
| `awaiting_facts` | Facts or class change | The draft gate is fully met. | `ready` |
| `awaiting_facts` | Facts or class change | The draft gate is not met and the ticket is not a blocked conclusion. | `triage` |
| `awaiting_facts` | `ticket.escalated` | Reason set. | `escalated` |
| `awaiting_facts` | `ticket.closed` | Reason is `withdrawn`, `duplicate`, `declined`, or `cannot_answer`. | `closed` |
| `ready` | `ticket.draft_requested` | Draft gate met. New `request_id`. | `draft_in_progress` |
| `ready` | Gate inputs change | Gate fails as a blocked conclusion. | `awaiting_facts` |
| `ready` | Gate inputs change | Gate fails for any other reason. | `triage` |
| `ready` | `ticket.escalated` | Reason set. | `escalated` |
| `ready` | `ticket.closed` | Reason is `withdrawn`, `duplicate`, `declined`, or `cannot_answer`. | `closed` |
| `draft_in_progress` | `ticket.draft_attached` | Same `request_id`. | `in_review` |
| `draft_in_progress` | `ticket.draft_failed` | Same `request_id`. | `ready` |
| `draft_in_progress` | `ticket.draft_cancelled` | Staff cancels that `request_id`. | `ready` |
| `draft_in_progress` | `ticket.escalated` | Reason set. The open request is cancelled first. `resume_state` is `ready`. | `escalated` |
| `in_review` | `ticket.draft_edited` | Staff saves a new version. | `in_review` |
| `in_review` | `ticket.draft_rejected` | Current version is kept in history and marked rejected. | `ready` if the gate still holds, otherwise `triage` or `awaiting_facts` |
| `in_review` | `ticket.facts_requested` | The new facts leave a conclusion with an open material fact. The current draft is marked stale. | `awaiting_facts` |
| `in_review` | `ticket.facts_requested` | The class is `status_or_document_chase`. Facts are recorded. The draft stays current. | `in_review` |
| `in_review` | `ticket.draft_requested` | Revision gate met, including `revision_of`. | `draft_in_progress` |
| `in_review` | `ticket.approved` | The approve gate below is met. | `approved` |
| `in_review` | Gate inputs change | Current draft is marked stale. Approval is impossible until a new version exists. | `in_review`, or `awaiting_facts` / `triage` when the conclusion fact rule or an incomplete classification requires it |
| `in_review` | `ticket.escalated` | Reason set. | `escalated` |
| `in_review` | `ticket.closed` | Reason is `withdrawn`, `duplicate`, `declined`, or `cannot_answer`. | `closed` |
| `approved` | `ticket.exported` | Method is `copy` or `download`. The live approval matches the current version. | `approved` |
| `approved` | `ticket.draft_edited`, a new `ticket.draft_requested`, or a gate-input change | `ticket.approval_withdrawn` is written first. | `in_review`, `draft_in_progress`, `awaiting_facts`, or `triage`, matching the later event |
| `approved` | `ticket.escalated` | Reason set. The approval stays attached. Export is refused until escalation clears. | `escalated` |
| `approved` | `ticket.closed` | Reason is `completed`. | `closed` |
| `escalated` | `ticket.escalation_cleared` | Inputs are unchanged since the hold. | `resume_state` |
| `escalated` | `ticket.escalation_cleared` | Inputs changed, or the held request was cancelled. Recompute the gate. Withdraw the approval if the approved version is no longer current. | `ready`, `triage`, `awaiting_facts`, `in_review`, or `approved` |
| `escalated` | `ticket.closed` | Reason is `withdrawn`, `duplicate`, `declined`, or `cannot_answer`. | `closed` |
| `closed` | `ticket.reopened` | A staff member of the firm gives a reason. The active approval pointer is cleared. History stays. | `triage` |

`draft_in_progress` has no close transition. Staff cancel the request, then close. A second `ticket.draft_requested` is refused while `open_draft_request_id` is set. A `ticket.draft_attached` or `ticket.draft_failed` for any other `request_id` is ignored.

Close reasons:

| Reason | When |
| --- | --- |
| `completed` | Only from `approved`. The firm finished the desk episode. |
| `declined` | The firm will not answer. |
| `cannot_answer` | The firm will not issue a conclusion. |
| `duplicate` | Optional `related_ticket_id`. |
| `withdrawn` | Staff stop the episode. |

Attachment changes are refused while a request is in flight and while the ticket is `closed`. Elsewhere, an attachment change is allowed and runs the stale-draft rule.

### Approve gate

`ticket.approved` is legal only when all of the following hold:

- The state is `in_review`.
- `current_draft` exists, `stale` is false, and `rejected` is false.
- `disclosure_gate` is still `cleared`.
- The approver is a staff user of `firm_id`.
- `status_or_document_chase` is approved only with disposition `status_update` or `supported_answer`.
- `conclusion` is approved only with disposition `supported_answer`.
- `supported_answer` carries at least one `source_version_handle`.
- `unsupported` cannot be approved.
- For `conclusion`, professional review reports a qualification match between the approver and `jurisdiction_id` at approval time. A missing match refuses the transition.
- For `status_or_document_chase`, a jurisdiction qualification match is not required.

The approval binds `approval_id`, `approver_id`, `draft_id`, `version`, `content_hash`, `disposition`, `risk_class`, `jurisdiction_id`, `topic`, `source_version_handles`, the missing-fact snapshot, and the ask snapshot. The approved prose stays with that draft version in the application database.

### How the two risk classes differ

Both classes use the same states, the same disclosure gate, and the same export rule: a person approves a version, then a person may copy or download it.

| | `status_or_document_chase` | `conclusion` |
| --- | --- | --- |
| Work | What is outstanding, which document arrived, or what the client is being asked to send. | A position on a firm policy, an engagement document, or a legal or regulatory text. |
| Open missing facts | They are the subject of the reply. They do not block `ticket.draft_requested`. | An open fact marked `material` blocks `ticket.draft_requested` and holds the ticket in `awaiting_facts`. An open fact marked not material is sent along as a caveat and does not block. |
| Draft dispositions that can be approved | `status_update`, `supported_answer` | `supported_answer` only |
| `unsupported` | Reviewer rejects, asks for facts, escalates, or closes as `cannot_answer`. | Same, and the ticket still cannot be approved. |
| Approver | Any current staff user of the firm. | A staff user that professional review matches to the ticket jurisdiction at approve time. |
| Fact request after a draft | Records the facts and leaves the current draft approvable. | Marks the draft stale and moves to `awaiting_facts` when a new fact is material. |
| Completed close | Follows an approval. | Follows an approval of a `supported_answer`. |

Reclassification is a new `ticket.classified` confirmation. It withdraws a live approval. Moving from chase to conclusion recomputes the material-fact gate before another draft or approval. Moving from conclusion to chase is allowed only as a new confirmed classification, followed by a new approval under the chase rule.

A sentence that states a rule or a firm obligation needs a source handle on the draft version. That content rule belongs to the grounded-response plan. The ticket enforces the handle check by refusing `supported_answer` when the handle list is empty.

### Events the GUI, the drafter, and the approval record consume

Every event shares `event_id`, `ticket_id`, `firm_id`, a per-ticket monotonic `sequence`, `at`, `actor_type` (`staff`, `drafter`, or `system`), `actor_id`, and a payload. The log is append-only.

| Event | GUI | Drafter | Approval record |
| --- | --- | --- | --- |
| `ticket.created` | Yes | | |
| `ticket.ask_set` | Yes | | |
| `ticket.classified` | Yes | | |
| `ticket.missing_facts_assessed` | Yes | | |
| `ticket.attachment_changed` | Yes | | |
| `ticket.assigned` | Yes | | |
| `ticket.disclosure_gate_set` | Yes | | |
| `ticket.escalated` | Yes | | |
| `ticket.escalation_cleared` | Yes | | |
| `ticket.draft_requested` | Yes | Yes, and this is the only event that starts a draft | |
| `ticket.draft_attached` | Yes | | |
| `ticket.draft_failed` | Yes | | |
| `ticket.draft_cancelled` | Yes | | |
| `ticket.draft_stale` | Yes | | Yes, when it withdraws a live approval |
| `ticket.draft_edited` | Yes | | Yes |
| `ticket.draft_rejected` | Yes | | Yes |
| `ticket.facts_requested` | Yes | | Yes |
| `ticket.approved` | Yes | | Yes |
| `ticket.approval_withdrawn` | Yes | | Yes |
| `ticket.exported` | Yes | | Yes |
| `ticket.closed` | Yes | | Yes |
| `ticket.reopened` | Yes | | Yes |

The GUI consumes every event in the table so the queue and the open ticket match the record. Queue rows expose `ticket_id`, `firm_id`, `state`, `risk_class`, `topic`, `jurisdiction_id`, `assignee_id`, an ask excerpt, escalation, whether a current draft exists, and the time of the latest event. Screen layout belongs to the accountant GUI plan.

The drafter consumes `ticket.draft_requested` only. The payload snapshot is `request_id`, `ticket_id`, `firm_id`, `client_matter_ref`, `jurisdiction_id`, `topic`, `risk_class`, `ask_text`, `missing_facts`, attachment refs (`file_id`, display name, content hash), `revision_of` or empty, and `staff_instruction` or empty. The drafter returns `ticket.draft_attached` or `ticket.draft_failed` for that `request_id`. It does not approve, export, or close.

The approval record consumes the review outcomes: edit, reject, fact request, stale-with-withdrawal, approve, withdrawal, export, close, and reopen. `ticket.approved` is the approval. `ticket.exported` records that a person copied or downloaded the approved version. Export does not approve, and it does not mean the client was contacted. Close and reopen seal or unseal the episode around that history.

### Assignment and escalation

`ticket.assigned` sets `assignee_id`. An unassigned ticket can sit in `intake`, `triage`, or `awaiting_facts`. It cannot enter `ready`.

Escalation reasons are `qualification_gap`, `conflict`, `complexity`, `classification_dispute`, and `other`. `other` includes a note. `ticket.escalated` stores the reason, the actor, the time, and `resume_state`.

While escalated, `ticket.draft_requested`, `ticket.approved`, and `ticket.exported` are refused. Clearing the hold assigns the next owner and then follows the escalation-cleared rows in the transition table.

## Alternatives

A single `open` state with boolean blockers was set aside. `awaiting_facts`, `ready`, and `escalated` are the distinctions a queue must show: a conclusion waiting on a client fact, a ticket that may be drafted, and a ticket on hold.

Sending chase replies without approval was set aside. The brief locks a human approval before a client can see either class, and it locks copy or download as the v1 export.

Using a practice-management product or a BrainAPI brain as the ticket record was set aside. The brief makes the application database the system of record and makes live TaxDome, Karbon, Canopy, and DATEV sync a later seam.

Letting a conclusion with an open material fact call the drafter anyway was set aside. Staff already hold the gap in `missing_facts`. A model call would send the matter out under the disclosure gate only to paraphrase that list. A firm that wants a model-written status note reclassifies the ticket to `status_or_document_chase` and approves it under the chase rule.

Holding the draft until a jurisdiction-qualified approver is assigned was set aside. A preparer can request a draft for a qualified colleague. The qualification check binds `ticket.approved` on conclusions.

## Assumptions

- v1 actors are authenticated staff of one firm. The client does not open the desk.
- One ticket has one jurisdiction. A question that needs two jurisdictions is two tickets. Linking those tickets is out of scope.
- The primary topic is one value. Overlap between a policy and a local rule stays visible in `ask_text`, because the drafter already calls the firm memory and the jurisdiction memory.
- Staff confirm classification. v1 does not ship an automatic classifier.
- `document` means an engagement document or a client file attached to the matter.
- A general research note with no client matter is out of scope. `client_matter_ref` is required before a draft.
- The same person may request the draft and approve it, unless professional review later forbids that pair. The ticket events already store both actors.
- Close keeps the row. Retention and deletion belong to professional review.
- `disclosure_gate` and the qualification match are inputs. This plan defines where they block, not how consent or a license is proved.
- OD-1 stands. If knowledge-memory and firm-boundary reject the matter brain, the ticket fields and events stay as written. Only the retrieval side loses the matter-brain read.

## Dependencies

| Plan | What this lifecycle needs |
| --- | --- |
| Knowledge-memory | File bytes and draft prose remain in the application database. Source handles and content hashes are opaque. Matter-brain placement follows OD-1 and is not read from the ticket. |
| Grounded-response | A draft result names `request_id`, `draft_id`, `version`, `content_hash`, `disposition`, and `source_version_handles`. Failure returns `ticket.draft_failed` with a staff-readable reason. Empty or conflicting retrieval arrives as `unsupported` or as a `supported_answer` that already has handles. |
| Accountant GUI | Renders the queue and the ticket from the events above and submits only the transitions in the table. |
| Professional review | Writes `disclosure_gate`. Reports the conclusion qualification match at approve time. Stores the audit record from the events this plan marks for that record. Owns retention, consent evidence, and disclosure copy. |
| Firm-boundary | Supplies `firm_id`, staff identity, and the `jurisdiction_id` vocabulary. Resolves brains from firm, jurisdiction, and matter. The ticket never forwards a brain id. |

## Risks

The highest risk is a conclusion confirmed as `status_or_document_chase`. The chase path does not ask for a jurisdiction qualification match, so an under-qualified approval could pass. The ticket cannot read the draft and correct the class. The mitigation inside this plan is an audited reclassification that withdraws any live approval, a separate approve gate for `supported_answer`, and a visible risk class on every queue row. The remaining duty sits with the reviewer.

A second risk is approving text that no longer matches the ask, the files, or the facts. The mitigation is version binding: edits and gate-input changes emit `ticket.approval_withdrawn` or `ticket.draft_stale` before another export.

A third risk is a draft request while `disclosure_gate` is still `unknown`, which would send client material to a model without the firm’s recorded authority. The request guard treats only `cleared` as allowed. If professional review never writes the flag, every request stays refused.

A fourth risk is a `status_update` that states a rule and arrives with no source handle. The empty-handle ban applies to `supported_answer`. A mis-labeled status update depends on the grounded-response disposition and on the reviewer.

## Validation

These journeys are the oracle for the checkpoint.

**Policy conclusion.** Staff paste an ask, set a matter ref, confirm jurisdiction `DE-example`, topic `policy`, and class `conclusion`, assess missing facts as empty, assign themselves, and receive `disclosure_gate=cleared`. The ticket moves `intake` → `triage` → `ready`. `ticket.draft_requested` moves it to `draft_in_progress`. A `supported_answer` with one source handle moves it to `in_review`. A qualification match allows `ticket.approved`. `ticket.exported` with method `copy` stays in `approved`. A later `ticket.draft_edited` emits `ticket.approval_withdrawn` and returns to `in_review` before any further export. `ticket.closed` with `completed` is refused until a new approval exists.

**Document chase.** The same shell is confirmed as topic `document` and class `status_or_document_chase`, with one open material fact, “bank statement not attached.” The draft gate still passes, because the class is chase. A `status_update` can be approved by firm staff without a jurisdiction match. Export is `download`. The episode can close as `completed`. No event carries a recipient.

**Regulation conclusion blocked on facts.** Topic `legal_or_regulatory`, class `conclusion`, and an open material fact. After classification the state is `awaiting_facts`. `ticket.draft_requested` is refused. Resolving the fact and reassessing the list moves the ticket to `ready`. A result of `unsupported` reaches `in_review` and `ticket.approved` is refused. Staff may reject, escalate, or close as `cannot_answer`.

Invariants:

- Every path that reaches `ticket.exported` has a live `ticket.approved` for the same `draft_id`, `version`, and `content_hash`.
- `ticket.exported` carries `copy` or `download` and no destination.
- A conclusion with an open material fact never accepts `ticket.draft_requested`.
- `ticket.approved` on a conclusion includes a qualification match and a non-empty source-handle list.
- `completed` is reachable only from `approved`.
- Reopen keeps `ticket_id` and appends `ticket.reopened`. It does not restore the active approval pointer.
- Ignored drafter results do not change state.

## Unresolved decisions

None of these block the v1 lifecycle. The recommendation above is the v1 rule until a later plan changes it.

- Professional review may require the approver to differ from the staff member who requested the draft. The events already store both ids.
- Professional review owns how long a closed ticket is kept. This plan does not delete it on close.
- Firm-boundary owns the spelling of `jurisdiction_id`. This plan treats it as an opaque non-empty value.
- A stored secondary topic is unnecessary in v1 because both memories are always in the draft request’s scope. A later plan can add one without a new state.

## Task list

### T1. Ticket record and draft-request gate

- Description: Add the ticket record and refuse `ticket.draft_requested` unless the draft gate in this plan is fully met.
- Acceptance criteria: A request without firm, paste origin, matter ref, ask, jurisdiction, confirmed topic, confirmed risk class, assessed facts, assignee, or `disclosure_gate=cleared` is refused. A conclusion with an open material fact is refused. A chase with an open material fact is accepted once the other gate fields are present. Attachments may be absent. The record stores file refs and does not store a brain id.
- Verification: Run the policy journey up to `ready`, then drop `jurisdiction_id` and show the request is refused; restore it and show one request is accepted.
- Dependencies: None. Disclosure values are an input from professional review. OD-1 is accepted as stated.
- Files likely touched: `docs/plans/ticket-desk.md`. The repo has no application package yet. The implementing change adds the ticket record in the application database module when that module exists.
- Estimated scope: M

### T2. State machine through close

- Description: Implement the nine states, the transition table, close reasons, and the single in-flight request rule.
- Acceptance criteria: `completed` occurs only from `approved`. `draft_in_progress` cannot close. A stale or mismatched `request_id` does not move the ticket. `ticket.reopened` returns to `triage` on the same `ticket_id` and clears the active approval pointer.
- Verification: For each row in the transition table, assert the destination state. Assert a close from `draft_in_progress` is refused until cancel.
- Dependencies: T1.
- Files likely touched: `docs/plans/ticket-desk.md`. Ticket transition guards in the application ticket module.
- Estimated scope: M

### T3. Chase and conclusion guards

- Description: Apply the risk-class table to fact blocking, dispositions, reclassification, and the approve gate.
- Acceptance criteria: Chase approval allows `status_update` and `supported_answer` without a qualification match. Conclusion approval allows only `supported_answer`, requires a qualification match, and requires at least one source handle. `unsupported` cannot be approved. Reclassification withdraws a live approval. A material fact request on a conclusion marks the draft stale and moves to `awaiting_facts`.
- Verification: Approve the document-chase journey without a qualification match. Refuse approval on the blocked regulation journey’s `unsupported` draft. Reclassify the chase ticket to `conclusion` while a material fact is open and show the state becomes `awaiting_facts` with no live approval.
- Dependencies: T1, T2.
- Files likely touched: `docs/plans/ticket-desk.md`. Risk-class guards beside the transition guards.
- Estimated scope: M

### T4. Assignment and escalation

- Description: Require an assignee before `ready`, and freeze draft, approval, and export while escalated.
- Acceptance criteria: The reason set is `qualification_gap`, `conflict`, `complexity`, `classification_dispute`, and `other` with a note. Escalating `draft_in_progress` cancels the request and stores `resume_state=ready`. Clearing an unchanged hold returns to `resume_state`. Clearing a hold after a gate-input change recomputes the state. `completed` is refused while escalated.
- Verification: Escalate a `ready` ticket and show `ticket.draft_requested` is refused. Clear it and show the request is accepted. Escalate an `approved` ticket and show `ticket.exported` is refused until the hold clears.
- Dependencies: T2.
- Files likely touched: `docs/plans/ticket-desk.md`. Assignment and escalation guards in the ticket module.
- Estimated scope: S

### T5. Approval binding and export

- Description: Bind each approval to one draft version and allow copy or download only for that live approval.
- Acceptance criteria: `ticket.approved` stores the approver, version, content hash, disposition, risk class, jurisdiction, topic, source handles, missing-fact snapshot, and ask snapshot. `ticket.draft_edited` after approval writes `ticket.approval_withdrawn` before the new version is current. `ticket.exported` accepts only `copy` or `download`, echoes the approval id and content hash, and leaves the state `approved`.
- Verification: Export the policy journey after approval. Edit the approved text and show a second export is refused until a new approval. Show the export payload has no recipient.
- Dependencies: T2, T3.
- Files likely touched: `docs/plans/ticket-desk.md`. Approval and export handlers in the ticket module.
- Estimated scope: M

### T6. Event log and consumer payloads

- Description: Append the event log and publish the payloads the GUI, the drafter, and the approval record must consume.
- Acceptance criteria: The drafter receives only `ticket.draft_requested`, with the snapshot in this plan, and only after the gate has passed. The approval record receives edit, reject, fact request, stale-with-withdrawal, approve, withdrawal, export, close, and reopen. The GUI receives every event in the consumer table. Sequence numbers increase by one per ticket. A duplicate drafter result does not append a second state change.
- Verification: Replay the policy journey and list the consumer for each event. Confirm the drafter input contains no brain id and no approval.
- Dependencies: T1, T2, T3, T4, T5.
- Files likely touched: `docs/plans/ticket-desk.md`. Ticket event log in the application database module.
- Estimated scope: M

### T7. Checkpoint

- Description: Review the built lifecycle against the three validation journeys before adding the invariant suite.
- Acceptance criteria: The policy conclusion, the document chase, and the regulation conclusion match the validation section state for state. The regulation ticket accepts no draft request while its material fact is open. The chase ticket can be approved without a qualification match and still has no send path. The policy edit after approval withdraws that approval before another export. The reviewer records pass, or names the guard that failed. Later tasks wait on a pass.
- Verification: A reader compares the running transitions with the three journeys and the invariant list in Validation, using fixture staff actions only.
- Dependencies: T1, T2, T3, T4, T5, T6.
- Files likely touched: `docs/plans/ticket-desk.md`. Review notes for the checkpoint. No new product surface.
- Estimated scope: S

### T8. Invariant checks

- Description: Encode the validation invariants as repeatable checks on the ticket module.
- Acceptance criteria: The checks cover export-after-approval, version hash match, the conclusion fact gate, the conclusion qualification and source-handle gate, `completed` only from `approved`, reopen without restoring the active approval, and ignored mismatched drafter results. Each check uses a pasted ticket and, where needed, an uploaded file ref.
- Verification: The three journeys and one mismatched `request_id` run as automated checks and pass.
- Dependencies: T7.
- Files likely touched: Ticket-module checks beside the ticket module. `docs/plans/ticket-desk.md` remains the oracle.
- Estimated scope: S
