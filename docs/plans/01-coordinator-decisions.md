# Coordinator decisions

Status: accepted with the overrides below. The six plan files stay the proposals. Where this file names a paragraph, this file wins.

OD-1 is accepted by both owners. Client uploads are indexed in a matter-scoped brain. The application database keeps the ticket, the approval, and the file bytes.

## CD-1. Shared names

- Ticket risk class is `status_or_document_chase` or `conclusion`. The draft copies that field unchanged. The short value `status` is not a stored enum.
- `matter_id` is the internal id used for the matter-brain binding. The ticket stores it. A practice-system label is `external_matter_ref`. Handoff field `matter_ref` maps onto that label.
- One stored generation is one row. `draft_id` identifies that row. `revision` is the monotonic integer per ticket. Ticket `version` means `revision`. Approval binds `draft_id`, `revision`, and `content_hash`.

## CD-2. Outcome to ticket disposition

| Draft `outcome` | Ticket event | `disposition` | Approvable |
| --- | --- | --- | --- |
| `ready`, and no rule, obligation, calculation, or conclusion sentence | `ticket.draft_attached` | `status_update` | Only if the ticket class is `status_or_document_chase` and CD-3 passes |
| `ready`, with at least one cited rule, obligation, or conclusion | `ticket.draft_attached` | `supported_answer` | Only under CD-3 |
| `unsupported` or `conflict` | `ticket.draft_attached` | `unsupported` | No. `conflict` may also escalate with reason `conflict` |
| `failed` | `ticket.draft_failed` | none | No |
| `partial` because matter ingest is still running, on a conclusion ticket | `ticket.draft_failed` | none | No |
| `partial` on a chase ticket, ticket facts only | `ticket.draft_attached` | `status_update` | Only under CD-3 |

`ticket.draft_attached` for `unsupported` still lands in `in_review` so staff can reject, escalate, or close `cannot_answer`. It cannot be approved. That keeps the ticket-desk transition and the grounded-response refusal.

## CD-3. Effective class beats the ticket label

professional-review’s stricter class is the approve rule. ticket-desk’s “any staff user” approver, and its chase path that approves `supported_answer` without a jurisdiction qualification, are withdrawn.

- Signals, derived by the drafter from sentences: `states_rule` (kind `retrieved_rule` or `conclusion`), `states_firm_obligation`, `contains_calculation` (boolean on a sentence), `missing_or_conflict_only`.
- Any of the first three forces effective class `conclusion`.
- A chase ticket whose draft is only `status_update` with `missing_or_conflict_only` can be approved by a live qualification of scope `status` or `conclusion` for that `jurisdiction_id`.
- A signaled conclusion can be approved only by scope `conclusion` for that jurisdiction, only when disposition is `supported_answer`, and only when every rule, obligation, and calculation sentence has a citation handle whose `version_status` is `resolved`.
- Uncovered rule sentences block Approve for both classes. The GUI does not offer an acknowledgement that bypasses this. Acknowledgement is only for open missing facts on a chase ticket.
- A status qualification cannot approve a signaled conclusion. Reclassification withdraws a live approval.

## CD-4. Disclosure gate

`disclosure_gate = cleared` only when professional-review has an active matter-authority row for the processor, including `client_permission` or the confidentiality undertaking when that jurisdiction’s confirmed policy requires it. `blocked` means refused, withdrawn, or policy unmet. `unknown` means no row. The ticket stores the gate. It does not store the evidence file.

A fact-list copy in the GUI is not `ticket.exported`.

## CD-5. Citation snapshot

The handle string is `brain:{brain_id}:chunk:{chunk_id}`. The approval row also stores `source_key`, `version`, `content_hash`, `authority_level`, and `jurisdiction_id` from the catalog. A rule sentence with `version_status = unresolved` is uncovered for approval purposes. UD-G3 is closed in that direction.

New drafts drop any hit the catalog does not mark current. If the deployed BrainAPI build has no `include_history` flag, the adapter still drops those hits. The flag is not the control.

## CD-6. Brains and removal

Jurisdiction brains are per firm: binding key `(firm_id, jurisdiction_id)`. There is no brain shared across firms. UD-FB-2 is closed.

Matter removal uses `DELETE /system/brains/{brain_id}` on the operator path, so the id and the PAT go with the data. `POST .../clear` is only the retry when delete reports the brain is already gone but data remains. UD-FB-1 is closed. professional-review still owns when the signal fires. Approval rows and file bytes stay until the firm’s own hold says otherwise. `unset` means hold.

## What was accepted unchanged

- Nine ticket states, paste intake, no send, copy or download only after approval.
- Firm brain, jurisdiction brain, matter brain, and the catalog as the current-version authority.
- Context for the draft, search for the source panel, graph or MCP only for a relationship or history question.
- One staff route with queue, ticket, and sources. No client route.
- Operator control is the only runtime that may use the system PAT. `TenantBrainGate` runs before `X-Brain-ID` is set.
- `PracticeTicketHandoff` is named and not built.
- No statutory retention number.

## Implementation order

1. firm-boundary bindings and the gate, together with the professional-review authority row. Nothing else may call a model or BrainAPI.
2. knowledge-memory catalog and the current-version adapter.
3. ticket-desk record and state machine, using CD-1 through CD-4.
4. grounded-response revision and the two fixtures (known passage, empty corpus).
5. accountant-gui on fixture data, then a browser pass of the uncovered-sentence and approve-disabled paths.
6. Checkpoint: the three ticket journeys, the two draft fixtures, and a two-firm brain isolation test, before any customer document is ingested.
