# Professional review (PLAN-5)

Status: product policy for Accountant Agent Desk, accepted. `docs/plans/01-coordinator-decisions.md` CD-3 and CD-4 bind the ticket gate and the GUI to this approval rule. A firm needs its own advice before it relies on this document. The policy uses only the professional constraints and locked decisions 1, 5, and 6 in `docs/plans/00-authoritative-brief.md`, plus the IRS, TPB, ICAEW, BStBK/Haufe, Deubner, and StBK Hessen sources named there. It adds no jurisdiction those sources do not support.

v1 is a staff GUI. The model output stays a draft until a qualified person approves that exact text. Approve, edit, and reject are recorded events. Export is copy or download by a staff user. The product has no email send and no client-facing agent.

This plan owns who may approve, the audit record, the consent flag, retention, and the disclosure copy a later client-facing channel would need. Ticket states stay with ticket-desk, indexing and source versions with knowledge-memory, citation shape with grounded-response, screen layout with accountant-gui, and tenant isolation, secrets, and production access with firm-boundary.

## Recommendation

### Approval rule

Two risk classes share one rule: a named firm user approves a specific text, and that approval is the first moment the text may be copied or downloaded. The model, a service account, a shared mailbox, and the client have no approve action.

| Class | What it is | Who may approve |
| --- | --- | --- |
| Status | A document-chase or “what is still missing?” reply. It states no rule, no firm obligation, and no calculation. | An authenticated firm user with a live qualification for the ticket’s jurisdiction whose `authority_scope` is `status` or `conclusion`. |
| Conclusion | A draft that states a rule, a firm obligation, or a calculation, or that a conclusion-qualified user marks as a conclusion. This is the legal or tax judgment class. | An authenticated firm user with a live qualification for that same jurisdiction whose `authority_scope` is `conclusion`. |

The effective class is the stricter of the drafter’s label and the draft signals. Signals are `states_rule`, `states_firm_obligation`, `contains_calculation`, and `missing_or_conflict_only`. Any of the first three forces `conclusion`. A status qualification cannot approve that draft. A user may raise a status draft to `conclusion`. A user cannot lower a signaled conclusion to `status`.

`missing_or_conflict_only` stays a status draft when the text says what is missing and states no rule. That matches locked decision 5.

The approver and the ticket must carry the same `jurisdiction_id`. A conclusion source from the jurisdiction brain with a missing jurisdiction, or a jurisdiction id that differs from the ticket, blocks approval until that sentence is removed or the ticket jurisdiction is corrected. Firm-brain sources may carry an empty jurisdiction. v1 keeps one jurisdiction on a ticket. A second jurisdiction is a block, not a second silent approver.

A status approver attests: “I have reviewed this status reply. It states no rule, no firm obligation, and no calculation.” A conclusion approver attests: “I have reviewed the facts, the citations, and any calculations in this text.” The attestation is stored with the text. The IRS introductory guidelines (Issue 2026-19), TPB(GS) 55/2026, and the ICAEW complaints note are the sources for a qualified person reviewing facts, citations, and calculations before a client or a filing sees the work. The ICAEW note is also why a later complaint path has to reach a person. Those sources do not prescribe this schema. The schema is how the product records the person and the class.

Edit and reject are recorded. Any firm user who can open the ticket may edit or reject. Reject uses a reason code: `wrong_facts`, `bad_citation`, `missing_authority`, `wrong_jurisdiction`, or `other`, plus a short note. Request-more-facts is a ticket-desk state. It is not an approval and it authorizes no export.

An edit after approval writes a new text hash and ends export of the previous approval. The previous approval row stays. The next export waits for a new approval of the new text. The qualified human is the checker of the model draft. v1 does not require a second human. A human who rewrites the draft may approve it when their qualification covers the class.

A manual reply with `origin = human_composed` can be approved under the same class rule. It has no model vendor and no authority row.

### Qualification field

The field that decides the class is `authority_scope` on a qualification row for the ticket’s `jurisdiction_id`. A conclusion row also satisfies a status check. The row is the firm’s assertion. v1 does not query an IRS, TPB, ICAEW, or chamber register.

Required on every grant:

- `qualification_id`
- `firm_id`
- `user_id` of the holder
- `jurisdiction_id`
- `authority_scope`: `status` or `conclusion`
- `credential_label`: non-empty, the title the firm uses
- `granted_by_user_id`: a different user who holds `grant_review_authority`
- `grant_mode`: `principal` or `sole_principal`
- `valid_from`
- `valid_until`: empty means the firm entered no end date

`credential_reference` is optional. It stores a membership or registration number the firm already holds. An empty reference does not block approval. The product does not check the number.

Only a principal can grant. A holder cannot grant their own conclusion authority while another principal exists. A sole principal may grant their own, and `grant_mode` is `sole_principal` so the snapshot shows that. Staff cannot grant authority to themselves. Server time sets `valid_from`. A grant with `valid_until` in the past cannot be used. The session user is the approver. A user id in the request body is ignored.

### Approval record

The application database is the system of record for the approval. The matter brain is not. Rows are append-only. Server time fills every timestamp. A later change inserts a new row. `supersedes_approval_id` on the new row points at the old one. The old row is not updated.

One `approval_id` is enough for a later review to show the text, the source versions, and the person, including after the matter brain is cleared.

| Field | Purpose |
| --- | --- |
| `approval_id`, `firm_id`, `ticket_id`, `matter_id` | Identity and tenant scope |
| `ticket_jurisdiction_id` | Jurisdiction the approver had to match |
| `origin` | `model_draft` or `human_composed` |
| `risk_class`, `risk_signals` | Effective class and the signals that forced it |
| `draft_text`, `draft_text_sha256` | Model text presented for review. Empty when the origin is human. |
| `approved_text`, `approved_text_sha256` | Exact text the person approved, after any edit |
| `approver_user_id`, `approver_name_snapshot` | The person, stable if the display name later changes |
| `qualification_snapshot` | `qualification_id`, `jurisdiction_id`, `authority_scope`, `credential_label`, `credential_reference`, `granted_by_user_id`, `grant_mode`, `valid_from`, `valid_until` at approval time |
| `attestation_kind`, `attestation_text`, `attestation_accepted` | The class-specific attestation. Acceptance is required. |
| `sources` | One entry per cited handle: `handle`, `brain_id`, `source_version_id`, `content_hash`, `label`, `cited_snippet`, `jurisdiction_id` |
| `firm_brain_id`, `jurisdiction_brain_id`, `matter_brain_id` | Brains used. Matter brain may be empty. |
| `drafter_instruction_version`, `model_vendor`, `model_id` | Which drafter and model produced a model draft. Empty vendor and model when the origin is human. |
| `authority_id`, `authority_basis_snapshot` | Matter-authority row used for a model draft |
| `undertaking_id` | Present when that jurisdiction’s policy requires a confidentiality undertaking |
| `approved_at` | Server time |
| `supersedes_approval_id` | Previous approval for this ticket, if this one replaces it |

`handle` stays the opaque citation handle from grounded-response. This plan stores it and the version fields. It does not redefine citation shape.

Companion append-only `review_event` rows cover `edit`, `reject`, `approve`, `export`, `authority_recorded`, `authority_withdrawn`, and `disclosure`. An export row stores `approval_id`, `actor_user_id`, `channel` (`copy` or `download`), and `text_sha256`. Any other channel is refused. A disclosure row stores `processor_kind`, `processor_name`, `draft_version_id`, and `authority_id`. It does not store a second copy of the prompt.

Structured logs may carry `approval_id`, `event_type`, `firm_id`, `ticket_id`, and the result. They omit `approved_text`, `draft_text`, `cited_snippet`, evidence bytes, and `credential_reference`.

### Consent rule

Client matter content reaches a third-party model only when the firm has an active matter-authority row for that matter and that processor. The row is the product’s record of authority. No row means absent. A pasted ticket does not create a row. A default of absent is the starting state.

| Field | Required content |
| --- | --- |
| `authority_id`, `firm_id`, `matter_id`, `client_id`, `jurisdiction_id` | Which client matter, in which jurisdiction |
| `processor_kind` | `model` or `brain_host` |
| `processor_name` | A name on the firm’s processor allowlist |
| `basis` | `client_permission` or `firm_authority` |
| `status` | `active`, `refused`, or `withdrawn`. Absent is the lack of an active row, not a granted status. |
| `evidence_note` | Non-empty note of where the authority comes from |
| `evidence_file_id` | Required when `basis` is `client_permission`. Optional for `firm_authority`. The file lives in the application database. |
| `recorded_by_user_id`, `recorded_at` | Staff member who recorded it, server time |
| `withdrawn_at`, `withdrawn_by_user_id` | Set by a new withdrawal event. The original grant row stays. |

Jurisdiction behavior comes from a firm-confirmed `jurisdiction_review_policy` row, not from a hard-coded country branch. An unconfirmed jurisdiction cannot be used for a model call or an approval. Seed values, which the firm confirms or edits before use:

| Firm mapping | `requires_client_permission` | `requires_confidentiality_undertaking` | Source used |
| --- | --- | --- | --- |
| Australian tax-practitioner work | yes | no | TPB(GS) 55/2026: client permission before disclosure to a third party, which can include an AI tool |
| German tax-adviser work | no | yes | Deubner 2026 and BStBK FAQ 9.3 via Haufe: the external vendor needs a confidentiality undertaking, not only a processing agreement |
| US federal tax practice | no | no | IRS Issue 2026-19 is used for qualified human review. It is not used here as a consent or retention rule. |
| UK practice covered by the ICAEW note | no | no | The ICAEW note is used for a human review and a human complaints path. It is not used here as a consent or retention rule. |

The firm may turn `requires_client_permission` on for a jurisdiction whose seed value is no. The product does not force the Australian permission rule onto the US, UK, or German rows. Where the flag is yes, `basis` must be `client_permission`. A `firm_authority` row leaves the matter blocked.

Where the undertaking flag is yes, the named processor also needs an active `vendor_undertaking` with `instrument = confidentiality_undertaking` and an evidence file. A processing agreement alone does not fill that instrument. The staff member attests the instrument. The product cannot read the PDF and prove what it is.

For every jurisdiction, the processor must be on the firm allowlist. A public or consumer chat tool is not a valid allowlist entry. That ban is a product control taken from the Deubner and BStBK warning against putting client matters into public chat tools. It is applied to every matter so a US, UK, or Australian matter has no public-tool path. It is not recorded as a claim that those other sources require a German undertaking.

The same authority row gates ingest of client content to an external matter brain. `processor_kind = brain_host` names that host. A brain the firm hosts in its own tenant can be recorded as `firm_authority` with that processor named. Silent ingest with no row is blocked. Firm-boundary owns where the secret and the brain id live. This plan owns the authority flag those paths check.

When the active row is missing, refused, or withdrawn:

- The model is not called with the ticket, the attachments, client identifiers, or matter-brain passages.
- Client bytes are not ingested to an external brain.
- A model draft cannot be approved or exported.
- Staff can still read firm and jurisdiction material that contains no client matter content, and a qualified person can still approve a `human_composed` reply.

A model call writes a disclosure event only after the active-row check passes. Approval of that draft requires the same authority still active. Withdrawal freezes export of the draft, keeps the disclosure event, and inserts `authority_withdrawn`. It does not delete the evidence that a call happened. `recorded_at` is server time, so a later backdated permission does not cover an earlier call.

Permission is per processor. A vendor change needs a new allowlist entry and a new authority row. On a TPB-flagged jurisdiction that new row is `client_permission`. A firm assertion that the vendor does not train on the matter is optional and labeled unverified. Vendor marketing claims about training opt-out are not treated as measured. The assertion does not satisfy authority.

Shared use with the client is off in v1. The BStBK FAQ via Haufe requires a written role split before shared use: the client supplies facts, the firm decides. A later shared channel stays blocked until the matter holds that written reference. Staff-side model authority is not that role split.

### Retention hook

No source in the brief states a retention period for a country. This plan stores no year count and ships no “statutory” default.

`retention_policy` is one row per firm:

- `approval_record_hold`: `unset` or a duration the firm enters
- `matter_brain_clear_after`: `unset` or a duration the firm enters
- `updated_by`, `updated_at`

`unset` means hold. The product does not delete on a clock it invented. The unset state is visible to a principal. This accepts OD-1: the matter brain is cleared when the retention rule says so, and the application database remains the system of record for the ticket, the approval, and the file bytes.

Retained with the approval hold:

- Approval rows, including approved text, draft text, qualification snapshot, and cited snippets
- Edit, reject, export, authority, withdrawal, and disclosure events
- Qualification grants still referenced by an approval snapshot
- Authority rows and undertaking rows referenced by a remaining approval
- Evidence files referenced by those rows

The matter brain may be cleared on its own hook while the approval remains. Clearing the brain does not delete approval, consent, ticket, or file-byte rows. The snapshot of `source_version_id`, `content_hash`, label, and cited snippet is what a later review shows after clearance. Full-document retention beyond that snippet stays with knowledge-memory and the firm’s own copy of the source.

When the firm sets a duration and a row ages out, deletion writes a tombstone: `approval_id`, text hash, actor, server time, and reason. The tombstone keeps the fact of the decision after the client text is removed. Authority and undertaking rows referenced by an approval that is still held are kept until that approval is deleted. Rendered model prompts are not retained. The ticket, the draft output, the source snapshot, and the disclosure event are the review trail.

### Future client-facing disclosure

v1 shows this to no client. A later channel that lets a client talk to the system is blocked until the copy below is in that channel and a person at the firm is reachable. The StBK Hessen handout of 28 July 2026 states that EU AI Act transparency duties, including Article 50, apply from 2 August 2026, and that Annex III high-risk dates were deferred. This plan uses the handout for two practical duties only: the client can tell the speaker is a system, and the client can reach a person. It does not add a high-risk conformity file, and it does not state that the copy satisfies the Act.

Required elements of the later copy:

1. The speaker is a software system.
2. A person at the firm is reachable, and that person is the complaints path (ICAEW note: keep the process human).
3. The firm remains responsible for the decision.
4. Before shared use, a written role split is already stored: the client supplies facts, the firm decides (BStBK FAQ via Haufe).

Copy the firm adapts later, held in the product and disabled in v1:

“You are reading a message from a software system. This system is not a person. You can reach a person at the firm here: [firm contact]. That person handles complaints. The firm is responsible for the advice.”

Shared-use addendum, shown only when the role-split reference is on the matter:

“You supply the facts. The firm makes the decision.”

The staff export reminder, which accountant-gui presents on copy and download, is separate from client disclosure: “This copy has not been sent to the client. Sending it is your act.”

### Controls around the record

Identity. The approver is the session’s firm user id. Qualifications attach to that user. Service accounts and shared mailboxes hold no qualification.

Least privilege. Conclusion authority is granted by a principal. Status authority cannot approve a conclusion. Reject and edit are wider than approve, so a bad draft can be stopped by someone who may not sign the conclusion. An operator path cannot write an approve event.

Tenant isolation. Every row carries `firm_id`. Firm-boundary enforces the scope. This plan refuses a read or write that arrives without it.

Secrets and encryption. API keys, PATs, and brain credentials are not fields on these records. Evidence files and approved text are client content in the application database. Firm-boundary encrypts that store at rest and controls production access. A production read of approved text is client-data access and has to be attributable to a person.

Supply chain. The allowlist is the only model or brain host a matter may use. The approval snapshots `model_id` and `drafter_instruction_version`. A new model is a new authority check. Public chat tools stay off the allowlist.

Logging and incident handling. Logs carry ids and outcomes. Withdrawal, an ended undertaking, or a draft that ran without authority freezes export, keeps the disclosure event, and surfaces `review_blocked` for the principal. The response is contain and preserve, not a silent purge.

Trust boundary. The staff session and the application database are inside the firm’s control. The model vendor and an external brain host are outside it. Crossing that boundary requires the authority row. The client is outside v1 entirely.

## Alternatives

1. **One qualification class for every reply.** Every export would need `conclusion` authority. That is simpler and stricter. It is rejected as the default because the brief separates status replies from legal conclusions. A firm may turn status scope off and require conclusion authority for every class. That setting is allowed.
2. **Auto-send status replies.** The Flowagenten portal describes automatic answers to “what is still missing?” and a person for tax judgment. v1 does not take that path. Locked decision 6 and the professional constraint keep both classes on a human export of copy or download.
3. **Two-person approval of every conclusion.** The cited sources describe one qualified person reviewing the draft. Dual control is optional and default-off. A firm that wants it can require the editor and the approver to be different users.
4. **Implied authority from the engagement.** Rejected. An explicit row is required. An engagement letter can be the evidence file. Uploading it does not create the row.
5. **A fixed multi-year retention period.** Rejected. None of the cited sources states a number. A seed such as 6, 7, or 10 years would be a fabricated statutory period.
6. **Keep the audit record only in the matter brain.** Rejected. OD-1 makes the application database the system of record, and the matter brain is the store that retention clears.
7. **In-product client e-signature in v1.** Deferred. v1 is a pasted ticket plus file upload. Staff record the authority and point at a file. That file is the firm’s evidence pointer, not a signature the product verified.
8. **Live checks against professional registers.** Deferred. It would add jurisdictions’ register APIs this brief does not specify, and a failed lookup would block a person the firm already considers qualified.
9. **Require TPB-style client permission for every jurisdiction.** Rejected as the default. It would apply the Australian source to US, UK, and German matters. The firm can turn the flag on per jurisdiction.

## Assumptions

- OD-1 stands. Client uploads can live in a matter-scoped brain. The application database holds the ticket, the approval, and the file bytes. The matter brain is cleared on `matter_brain_clear_after`.
- A ticket has one `jurisdiction_id`. Country is not hard-coded. Policy flags hang off that id after the firm confirms them.
- The four seed mappings are starting rows for the firm to confirm. They are not a determination of which label fits a client.
- The qualification row is the firm’s assertion. Register verification is out of v1.
- A sole principal may self-grant conclusion authority. The snapshot records `sole_principal`.
- The ticket record remains available for as long as an approval that cites it is held.
- An external BrainAPI brain is a `brain_host` processor. A firm-hosted brain is recorded explicitly as firm-hosted.
- Neighbor plans enforce these gates at draft, ingest, screen, and tenant boundaries. This plan does not edit their files.
- Tests use synthetic fixtures. They do not use live client matters.
- The IRS, TPB, ICAEW, BStBK/Haufe, Deubner, and StBK Hessen materials are used only as the brief states them.

## Dependencies

- **Locked decisions 1, 5, and 6.** Staff GUI and copy or download export. Every rule or firm-obligation sentence carries an openable source handle, and an empty or conflicting retrieval states what is missing. Approve, edit, and reject are recorded events.
- **PLAN-1 ticket-desk.** Supplies `ticket_id`, `matter_id`, and `jurisdiction_id`. Owns request-more-facts. Must not treat that state as approval and must not add a send transition. Hosts the `review_blocked` queue state this plan raises.
- **PLAN-2 knowledge-memory.** Supplies stable `source_version_id` and `content_hash`, and the jurisdiction id of a jurisdiction-brain source. Clears the matter brain only on `matter_brain_clear_after`. Brain clearance must not delete approval rows. Ingest of client content checks the `brain_host` authority row.
- **PLAN-3 grounded-response.** Emits `states_rule`, `states_firm_obligation`, `contains_calculation`, and `missing_or_conflict_only`. Provides the citation handle and `drafter_instruction_version`. Keeps invented rules out of empty or conflicting drafts.
- **PLAN-4 accountant-gui.** Renders attestation, the blocked-authority state, copy and download, the staff reminder, and a record view of text, sources, and person. Owns pixels. Adds no send control.
- **PLAN-6 firm-boundary.** Session identity, `firm_id` enforcement, the `grant_review_authority` capability, the processor allowlist, secret placement, encryption at rest, and attributable production access. Secrets stay out of review rows.
- **OD-1**, owned with knowledge-memory and firm-boundary. This plan accepts the default.

## Risks

**Highest risk.** Client matter content is sent to a third-party model, or ingested to an external brain, when the authority row is missing, refused, or withdrawn, or when a TPB-flagged matter has only `firm_authority`. That disclosure cannot be pulled back. The control is a default of absent, a server-side check before the call, a disclosure event only after the check, and an approval block if the row is not still active. Residual: a staff member can paste ticket text into a public tool outside the product. The product cannot see that act. The allowlist and the absence of a send API shrink the in-product path. The out-of-band paste remains an accepted residual and a firm supervision issue.

| Risk | Control | Residual |
| --- | --- | --- |
| Status laundering: a conclusion is labeled status and approved by a status holder, then copied to the client | Signals force `conclusion`. Status attestation cannot be stored on a signaled draft. Export reads the approval class. | A draft that states a rule in language the signal misses can be approved as status. The conclusion attestation path is how a reviewer raises it. Missed signals are a grounded-response accuracy limit. |
| The person on the record changes after the fact | Qualification and name are snapshotted. Rows are append-only. The session user is the actor. | A compromised principal can grant a false qualification. v1 does not check a register. Grant authority is limited to principals, and the grantor is on the snapshot. |
| Cross-jurisdiction approval | `jurisdiction_id` on the qualification, the ticket, and any jurisdiction-brain source must match. Unconfirmed policy blocks the jurisdiction. | The firm can confirm a policy row with the wrong flags. Confirmation is attributed to a principal. |
| Source versions vanish when the matter brain is cleared | The approval stores version id, content hash, label, and cited snippet in the application database | The full source document may be gone. The snippet and hash remain. The firm still needs its own copy of licensed sources. |
| A later client channel ships without disclosure | v1 has no client channel. A later channel is blocked until the system-identity copy and a person-reachable path exist. Shared use is also blocked until the role-split reference exists. | The handout is not implemented as a full AI Act program. High-risk Annex III dates stay out of scope, as the handout says they were deferred. |
| Approval text leaks through logs or operator access | Logs carry ids. Operator approve is absent. Production reads are firm-boundary’s auditable access. | A bad log statement in another module can still copy text. Validation includes a check that the review module’s log fields exclude the text. |
| Bare consent checkbox | `client_permission` needs a file and a note. `firm_authority` needs a note. Server time prevents backdating. | The product does not verify that the client signed the file. The recorder is stored. |
| Undertaking is a mislabeled processing agreement | The instrument value must be `confidentiality_undertaking` when the flag is on | Staff can attest the wrong instrument. The evidence file and recorder are kept for a later firm review. |
| Indefinite retention while the hook is `unset` | `unset` is visible and means hold. Deletion happens only after the firm enters a duration, and it leaves a tombstone. | Client text stays until the firm decides. That is deliberate. It is not a hidden statutory period. |
| Out-of-band send after a proper approval | Export reminder states the product has not sent the text. The export event records who copied it. | The client can still receive a wrong paste. The record shows the text and the person. It does not show the email the product never sent. |

Unacceptable paths, which implementation must refuse rather than accept as residual: an email or portal send in v1, a model call with no active authority row, a public chat processor, a status holder approving a signaled conclusion, and a client-facing speaker with no system disclosure and no person to reach.

## Validation

Synthetic fixtures only. No live client data. No email assertion beyond the export channel set being `copy` and `download`.

1. A status draft with only `missing_or_conflict_only` is approved by a user with `authority_scope = status` for that jurisdiction. The approval row contains the approved text, the source version ids and snippets, and the approver snapshot.
2. The same user is refused when any of `states_rule`, `states_firm_obligation`, or `contains_calculation` is true. A user with `conclusion` for that jurisdiction can approve after the conclusion attestation.
3. A conclusion qualification for jurisdiction A is refused on a ticket in jurisdiction B. A jurisdiction-brain source whose jurisdiction differs from the ticket blocks approval.
4. After the grant’s `credential_label` is changed, the stored snapshot still shows the label from approval time.
5. A matter with no authority row: the model call is blocked, no disclosure event is written, and approval of a model draft is refused. A `human_composed` reply can still be approved.
6. A TPB-flagged jurisdiction with only `firm_authority` stays blocked. The same matter with an active `client_permission` row, evidence file, and allowlisted processor can draft.
7. A German-flagged jurisdiction with `firm_authority` and no confidentiality undertaking stays blocked. With an active undertaking, the model call is allowed. A public-chat processor name is refused in every jurisdiction.
8. Withdrawal after a disclosure freezes export, keeps the disclosure event, and refuses approval.
9. Edit then approve stores both hashes. A later edit makes the previous approval non-exportable and leaves the row in place.
10. Reject stores the reason and refuses export of that draft.
11. Export with channel `email` or `send` is refused. Copy and download write an export event and do not call a mail API.
12. Clearing a fixture matter brain leaves the approval text, source snapshot, and person readable from the application database.
13. Seeded retention policy contains no year count. `unset` does not delete rows.
14. Review-module log fixtures omit draft text, approved text, snippets, and credential references.
15. The future disclosure template is stored with client display disabled. A fixture that enables a client speaker without the template and a person contact is refused.

## Unresolved decisions

- **UD-PR-1. Firm retention duration.** The hook exists. The duration does not. Default is `unset` (hold). The firm enters any later duration. This plan will not fill a year from a statute the sources do not state.
- **UD-PR-2. Extra client-permission flags.** Seed is yes only for the Australian tax-practitioner mapping. Each firm decides whether to turn the flag on for its other jurisdiction ids.
- **UD-PR-3. Dual control.** Default is one qualified approver. A firm may require the editor and the approver to differ. v1 ships with that requirement off.
- **UD-PR-4. Register verification.** Out of v1. The stored field is the firm’s `credential_label` and optional `credential_reference`.
- **UD-PR-5. Sole-principal self-grant.** Allowed and flagged `sole_principal`. A later firm policy may forbid it and accept that a one-person firm cannot approve inside the product.
- **UD-PR-6. Rendered prompts.** Not retained. Reopen only if a real review cannot be reconstructed from the ticket, the draft, the source snapshot, and the disclosure event.
- **UD-PR-7. Co-approval for a second jurisdiction.** v1 blocks the approval instead. A co-approval workflow is undesigned.
- **UD-PR-8. Role-split document format.** Needed only when a client shares the system. v1 keeps shared use off.

## Task list

### T1. Matter-authority row and the absence block

Description: Add the matter-authority record and the server-side gate. Client matter content is sent to a named model, or ingested to an external brain, only when an active row names that processor. `client_permission` requires an evidence file and a note. `firm_authority` requires a note. Missing, refused, and withdrawn rows block the call, block model-draft approval, and block export. A human-composed reply can still be approved. Timestamps come from the server. The session user is the recorder.

Acceptance criteria: The fields in the consent rule exist on a firm-scoped row. No row means absent. A TPB-flagged matter with only `firm_authority` is blocked. An active `client_permission` row for an allowlisted processor permits a draft call. Withdrawal keeps the disclosure event and freezes export. A request body cannot set `recorded_at` or the recorder’s user id.

Verification: Run validation items 5, 6, and 8 on synthetic fixtures.

Dependencies: PLAN-6 for session identity, `firm_id`, and the allowlist store. PLAN-2 to call the same gate before external ingest. PLAN-3 to call it before a model draft.

Files likely touched: application-database schema for `matter_processor_authority` and `review_event` disclosure and withdrawal types, once an application exists. No file under `docs/plans` other than this plan, and no contract file, is part of this task’s planning output.

Estimated scope: M

### T2. Jurisdiction policy, allowlist, and confidentiality undertaking

Description: Add firm-confirmed jurisdiction policy and the processor allowlist. Seed the four mappings from the consent rule and leave them unused until a principal confirms them. Enforce `requires_client_permission` and `requires_confidentiality_undertaking` from that row. Store undertakings with instrument `confidentiality_undertaking` and an evidence file. Reject a public or consumer chat tool as an allowlist entry. An unconfirmed jurisdiction cannot draft or approve.

Acceptance criteria: Approval and model calls read flags from the confirmed policy row for the ticket’s jurisdiction id. German-mapped policy blocks until an undertaking is active. US-mapped and UK-mapped seeds do not invent a permission or undertaking requirement. A processor absent from the allowlist is refused. Confirmation stores the principal and the server time.

Verification: Run validation item 7, plus a fixture that an unconfirmed jurisdiction id is refused for both a model call and an approval.

Dependencies: T1. PLAN-6 owns allowlist persistence and secrets. The seed text must stay inside the sources named in the brief.

Files likely touched: application-database schema for `jurisdiction_review_policy`, `processor_allowlist`, and `vendor_undertaking`.

Estimated scope: M

### T3. Qualification grant and class authority

Description: Add the qualification record and the approve check. Status approval requires `authority_scope` of `status` or `conclusion` for the ticket jurisdiction. Conclusion approval requires `conclusion` for that jurisdiction. Required fields are jurisdiction id, authority scope, a non-empty credential label, and the granting principal. The session user is the approver. A non-sole holder cannot self-grant conclusion authority. Expired `valid_until` cannot be used. Snapshot the grant onto the approval.

Acceptance criteria: The qualification field list in the recommendation is enforced. A status holder is refused on a conclusion. A conclusion holder for another jurisdiction is refused. A later edit to the live grant does not change an existing snapshot. Service accounts cannot hold a qualification.

Verification: Run validation items 2, 3, and 4.

Dependencies: PLAN-6 for `grant_review_authority` and session identity. T5 for the signal that distinguishes the classes. T4 for the snapshot’s storage.

Files likely touched: application-database schema for `review_qualification`.

Estimated scope: M

### T4. Append-only approval and review events

Description: Add the approval record and the edit, reject, approve, and export events. One approval id returns the approved text, the source-version snapshot, and the person. Rows are insert-only. A replacement approval points at the previous id and does not update it. Export of a superseded or rejected text is refused. Logs from this module omit client text and credential references.

Acceptance criteria: The approval field table is present and firm-scoped. Cited snippet, version id, and content hash are on the row, so a review still works after matter-brain clearance. `origin`, authority id, and model id distinguish a model draft from a human-composed reply. Export events accept only `copy` and `download`.

Verification: Run validation items 1, 9, 10, 12, and 14.

Dependencies: T1 and T3 for authority id and qualification snapshot. PLAN-3 for handle, version id, content hash, and instruction version. PLAN-2 for the guarantee that version ids are stable up to snapshot time. Locked decision 5.

Files likely touched: application-database schema for `approval_record` and `review_event`.

Estimated scope: M

### T5. Risk class, attestation, and export without send

Description: Compute the effective class from the draft signals. Force `conclusion` when a rule, a firm obligation, or a calculation is present. Store the matching attestation with the approval. Allow a human to raise status to conclusion. Refuse a downgrade of a signaled conclusion. After the last edit, require a new approval before export. Copy and download are the only export channels, and only for the current approval. The staff reminder states that the product has not sent the text.

Acceptance criteria: A signaled draft cannot be stored as an approved status reply. Request-more-facts creates no approval and no export. No code path in this module calls an email API. The export reminder string is available for accountant-gui. A mismatched jurisdiction-brain source blocks conclusion approval.

Verification: Run validation items 2, 10, and 11.

Dependencies: T3 and T4. PLAN-3 for the signals. PLAN-1 so request-more-facts stays a ticket state. PLAN-4 to place the attestation, the reminder, and the copy and download controls.

Files likely touched: review policy module that classifies the draft and authorizes export. Accountant-gui consumes the results and owns the pixels.

Estimated scope: M

### T6. Retention hook and disabled client disclosure

Description: Add the firm retention policy with `approval_record_hold` and `matter_brain_clear_after`, default `unset`. Ship no year count. Brain clearance must not delete approval, authority, ticket, or file-byte rows. A later firm-entered duration deletes held text only through a tombstone. Store the future client disclosure and the shared-use addendum with client display off. Block any future client speaker unless the copy and a person contact exist, and block shared use unless the role-split reference exists.

Acceptance criteria: Schema and seed contain no retention year presented as a legal period. `unset` retains rows. A cleared matter brain leaves the approval readable. The disclosure string is the one in this plan, disabled for v1. Enabling a client speaker in a fixture without the person contact is refused.

Verification: Run validation items 12, 13, and 15.

Dependencies: T4 for the rows that must survive brain clearance. PLAN-2 to honor `matter_brain_clear_after`. OD-1.

Files likely touched: application-database schema for `retention_policy` and the disabled disclosure template.

Estimated scope: S

### T7. Policy fixture suite

Description: Add the synthetic fixture suite that locks the approval rule, the consent rule, the record shape, the retention hook, and the disabled disclosure. Cover the fifteen validation items. Use no live client data and no network call to a model vendor.

Acceptance criteria: Each validation item is an automated fixture with a pass or fail result. A fixture that expects a block fails the build if the call succeeds. The suite does not contain a send path.

Verification: Run the suite and record a pass on items 1 through 15.

Dependencies: T1 through T6.

Files likely touched: the review module’s fixture tests, beside that module when the application exists.

Estimated scope: M
