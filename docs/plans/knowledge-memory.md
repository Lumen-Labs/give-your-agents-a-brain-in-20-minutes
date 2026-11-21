# PLAN-2: Knowledge memory

Status: planning proposal for Accountant Agent Desk, accepted with overrides. `docs/plans/01-coordinator-decisions.md` CD-5 and CD-6 close the current-hit rule and matter-brain deletion. This file does not authorize ingestion of customer material.

BrainAPI v2 is the retrieval index. The application database is the system of record for tickets, approvals, file bytes, and which source version is current. Customer material uses an authenticated brain. The anonymous demo and the Docs MCP stay on public documentation only.

## Recommendation

Accept OD-1. A client upload lives in a matter-scoped brain. The application database remains the system of record for the ticket, the approval, and the file bytes.

The matter brain is the confidentiality boundary. The firm brain holds policies, engagement templates, playbooks, and approved answer patterns after client identifiers are removed. The jurisdiction brain holds regulation text the firm is allowed to store, one brain per jurisdiction id. A client file does not go into either shared brain. Search filters and personalization are not authorization, so a metadata flag inside a shared brain is not a substitute for this split.

### What lives where

| Material | Brain | System of record |
| --- | --- | --- |
| Firm policy, engagement template, playbook, redacted approved pattern | Firm brain, one per firm | Catalog row, version row, and original bytes in the application database |
| Statute, regulation, or agency guidance the firm is allowed to store | Jurisdiction brain for that jurisdiction id | Same catalog and bytes. No publisher crawl |
| Signed engagement and other client uploads for one matter | Matter brain created for that engagement | Ticket, approval, and file bytes in the application database |
| Ticket state, approver, consent, qualifications | None | Application database only |
| Brain access tokens | None | Operator secret store. See firm-boundary |

BrainAPI does not store the only copy of an approval or of a file. Passages and triples are a derived index that can be rebuilt from the catalog and the stored bytes.

### Brain identity

Every data call sends `X-Brain-ID` and a brain-scoped PAT. Application requests do not use the system PAT, do not call `/system/*`, and do not use the `system` brain. Production leaves automatic brain creation off. firm-boundary creates brains and validates the tenant-to-brain map before the application forwards an id.

Brain ids are alphanumeric and start with a letter. Required classes:

- Firm: one brain for the firm.
- Jurisdiction: one brain per jurisdiction id the firm has enabled, not one brain per country-and-topic pair.
- Matter: one brain per engagement, created when the first client file is accepted.

Versions of one source stay in the same brain. A source does not move. A different jurisdiction is a different source in that jurisdiction's brain.

### OD-1 deletion rule

professional-review decides when a matter expires. This plan only defines the memory effect.

1. Stop in-flight ingests for that matter brain.
2. The operator path calls `POST /system/brains/{brain_id}/clear` with the system PAT. Clear removes the brain's data and keeps the id and its brain-scoped PAT.
3. Use `DELETE /system/brains/{brain_id}` only when that matter id will never be reused.
4. A 409 means another lifecycle operation is running; retry the same call after it finishes. A 503 `BRAIN_CLEANUP_FAILED` is retried after the named backends recover.
5. The application marks the matter brain cleared only after that call succeeds.
6. The clear does not delete the ticket, the approval events, the citation snapshots, or the file bytes. Those follow the firm's record retention, which may be longer than the retrieval window.
7. A matter expiry never clears the firm brain or a jurisdiction brain.

### Source identity, version, jurisdiction, and authority

The catalog is relational data in the application database.

`source_key` is immutable, unique per firm, and matches `^[a-z][a-z0-9]{7,40}$`. It is assigned at registration and never reused. It is the `source_key` passed to product MCP `list_source_versions`, and it is the entity uuid used for deterministic triples. The key identifies the logical document, not a version and not a brain.

`version` is a positive integer assigned by the application, starting at 1. A new version is created when a person publishes a new body, not merely because a worker retries. The same `content_hash` as the current version does not create another version and does not call ingest again. `content_hash` is the SHA-256 of the stored bytes.

Version status is one of `draft`, `ingesting`, `current`, `superseded`, `failed`, or `withdrawn`. At most one row per `source_key` is `current`. `effective_from` and `effective_to` are dates on the version. A row is citable for a new draft only when it is `current` and its window contains the draft's as-of date.

`jurisdiction_id` is the same opaque id used on tickets and reviewer qualifications. It is null only for firm-wide material in the firm brain. A jurisdiction brain accepts a source only when `jurisdiction_id` equals that brain's id. A firm-brain policy may name one jurisdiction; the retrieval adapter then keeps firm-wide rows and rows for the ticket's jurisdiction, and drops every other jurisdiction. That filter is in addition to brain separation, not instead of it.

`authority_level` is a label on the source, stored for the reviewer and the citation handle. It does not silently pick a winner when two current sources conflict. The draft contract owned by grounded-response surfaces the conflict.

| Level | Meaning | Brain |
| --- | --- | --- |
| `statute` | Primary legislation the firm is allowed to store | Jurisdiction |
| `regulation` | Binding secondary rules the firm is allowed to store | Jurisdiction |
| `agency_guidance` | Official guidance, stored only when the firm may keep a copy | Jurisdiction |
| `firm_policy` | Internal obligation | Firm |
| `engagement_template` | Firm template, not a signed client letter | Firm |
| `playbook` | Internal procedure | Firm |
| `approved_pattern` | Prior approved wording with client identifiers removed | Firm |
| `client_document` | Facts or terms supplied for one matter, including a signed engagement | Matter |

`client_document` never supplies a rule to any other matter. `approved_pattern` is not authority for a new legal conclusion.

Citation handle, copied onto the approval event:

`brain_id`, `source_key`, `version`, `content_hash`, `authority_level`, `jurisdiction_id`, and the passage or chunk id when retrieval returns one.

The handle plus the stored bytes is enough to show what was approved after a matter brain is cleared or a firm index is rebuilt.

### Ingest endpoints and task polling

v1 does not call `POST /ingest/url`. URL ingest is one public `https` page, and it is not a license to crawl Checkpoint, DATEV, Haufe, NWB, or any other publisher. Regulations enter only as text or files the firm already has the right to store.

| Input | Endpoint | Rule |
| --- | --- | --- |
| Policy, template, playbook, redacted pattern, or regulation already in text or Markdown | `POST /ingest/` | Literal wording. Send `skip_enrichment: true` so the passage is not rewritten. Include `meta_keys` for `source_key`, `version`, `jurisdiction_id`, and `authority_level`. Optional `Task-Identifier` is `t` plus the version token. |
| PDF or other accepted file (pdf, doc, docx, xls, xlsx, txt, csv, json, jpg, png) | `POST /ingest/file` | One file per request. Multipart field `file`, brain selected with `X-Brain-ID`. This endpoint mints a new task id and does not document `Task-Identifier`, `meta_keys`, or `skip_enrichment`. |
| Known triples | `POST /ingest/structured` | `mode: "deterministic"`. Direct edges for stable facts. Event plus `event_obj` together only when the fact needs a time, including supersession. |

Known triples, written after the passage task reaches `completed`:

- The source entity `HAS` its jurisdiction, authority level, and version.
- A policy or regulation entity uses a stable uuid equal to `source_key`.
- Search passages that the application controls begin with `DOCID {source_key}.` so a hit can map to that entity. File OCR does not reliably carry that marker; the structured entity is still written, and the synthetic fixture below decides how a PDF hit is bound.

Text that should stay literal, including policies and regulations, uses `skip_enrichment: true`. Jurisdiction, authority, and supersession are then added with deterministic triples rather than by extraction. Approved patterns also use `skip_enrichment: true` so a missed identifier is less likely to become a graph entity.

Polling, always with the same brain-scoped PAT and the same `X-Brain-ID` used at submit:

1. Persist the version row as `ingesting` and store `task_id` from the 202 body before anything else reads the brain. File and structured calls always mint a new id, so the body is the correlation key. A text `Task-Identifier` is only a second handle.
2. `GET /tasks/{task_id}` until `status` is terminal: `completed`, `failed`, `partial_failed`, `cancelled`, or `rollback_failed`.
3. `completed` is the only status that may make a version `current`.
4. `failed`, `partial_failed`, `cancelled`, and `rollback_failed` mark the version `failed`. The previous `current` row stays current.
5. HTTP 404 means the task is unknown. Stop. Do not treat it as pending and do not invent a success.
6. HTTP 503 on submit means the queue is unavailable. Retry the same version with backoff. Do not allocate another version.
7. HTTP 401 stops the job. Do not retry it with the system PAT.
8. Do not call `/retrieve/context` or `/retrieve/search` for that version until the task is `completed`.

`partial_failed` is not published. If the task still lists `rollback` in `cancellation_modes`, the application asks for rollback and keeps polling through `cancelling` until `cancelled` or `rollback_failed`. Rollback discards that run and leaves earlier imports in place.

### How a superseded source leaves new drafts

Publishing version n+1 does not delete version n and does not update approval rows.

1. Ingest n+1 into the same brain under the same `source_key`.
2. When its task is `completed`, one database transaction marks n `superseded` and n+1 `current`, provided n+1 is inside its effective window. Until that commit, drafts still cite n.
3. Write a deterministic supersession event: version n `SUPERSEDED_BY` version n+1, with `happened_at`. On relationships this application created for version n, set `invalid_at` or `deprecated` through `PUT /model/relationship` so `traverse_graph` lists them under `invalidated`. Graph is not the default draft path. This keeps the escalation path from presenting a dead rule as live.
4. New drafts call `POST /retrieve/context` with `include_history: false`. Omitting the field is not allowed. The default can pull prior copies when the question resembles a history question, and a missing embedding stays on the current copy only by fallback, not by an explicit product choice.
5. The source panel calls `POST /retrieve/search`. The retrieval adapter then drops any hit whose `source_key` and `version` are not the current effective row. Search extras are a further equality filter only if the fixture proves those fields round-trip onto hits. They are not the authority boundary.
6. An audit or "what changed" view may call `list_source_versions` with `source_key`, or context with `include_history: true`. Those reads are not the draft path. Superseded passages come back labeled `[superseded]` and are not citable as current.
7. The approval event already stores the approved text and the citation handles, including `version` and `content_hash`. Supersession does not rewrite that event. Clearing a matter brain does not rewrite it. The original bytes remain in the application database under the firm's record retention.

A withdrawn policy with no successor is `withdrawn`, not deleted. New drafts do not cite it. Old approvals still point at its version and hash.

If the fixture shows that a second ingest does not become a previous copy, and that old passages still rank, the adapter rule in step 5 is mandatory before any customer publish. Prior copies stay in the brain for audit. They do not become current in the catalog, and the draft never receives them from the adapter.

## Alternatives

### Reject OD-1 and keep client files out of BrainAPI

Client bytes and extracted text would stay in the application database. The draft would receive that text inside the model call, with no matter brain. Deletion rule: delete the extracted working copy when the ticket reaches a terminal state; keep the original bytes and the approval snapshot for the record-retention period.

Not chosen. Locked decision 4 expects a matter brain when OD-1 lands there, and a client PDF needs the same citation handle as a policy. Putting the extracted text only in the prompt also drops it from the stable `/retrieve/search` panel. The matter brain isolates that text from every other client without making BrainAPI the system of record.

### One firm brain, with metadata separating jurisdiction and matter

Not chosen. A brain is the data boundary. Search `extras` run after candidate retrieval, and personalization is explicitly not authorization. A missed filter would place one client's document, or another jurisdiction's rule, into a draft.

### Delete the old passage as soon as n+1 completes

Not chosen as the default. `list_source_versions` and `include_history: true` exist so a prior copy can be read, and an approval may need that copy opened again. The approval snapshot and the file bytes already protect the record if a later retention clear removes the brain. Immediate delete remains a fallback only if the fixture shows old passages cannot be kept out of default retrieval any other way. That fallback still would not delete approval rows or file bytes.

### Crawl or URL-ingest a research publisher

Rejected. Out of scope for v1, including public legislation sites. A later single public `https` URL still needs a license decision and is not a crawl.

## Assumptions

- The deployed BrainAPI is v2 and includes the documented 2.20.1-dev.9 read behavior: `include_history` on `POST /retrieve/context`, `list_source_versions`, and `invalid_at` or `deprecated` on `traverse_graph`. The public release notes inspected for this plan stop at 2.20.1-dev.5, so the fixture confirms the deployed build before customer use.
- Search is enabled with PostgreSQL. With `SEARCH_ENABLED` off, `/retrieve/search` returns 404. Context can still return passages.
- The firm supplies each regulation file. Nothing in this plan fetches Checkpoint, DATEV LEXinform, Haufe, NWB, juris, or another licensed corpus.
- Jurisdiction is data. The first build does not hard-code a country list inside the memory model.
- professional-review owns the retention clock, who may publish a source, and the consent flag. This plan owns the clear effect and the citation fields the approval must freeze.
- Application-database backups are the professional record. BrainAPI is rebuildable by re-ingesting `current` versions, then any older version an approval still cites, from stored bytes.
- Automatic brain creation and default-brain fallback are off in production.
- One BrainAPI deployment may host many firms. Isolation is the brain id plus the tenant map, not a shared `default` brain.
- File ingest's public contract is multipart file plus brain scope. It does not document a source-version field. The catalog, not the file parser, decides which version is current.
- Redaction of approved patterns happens in the application before `POST /ingest/`. The firm brain is not a cleanup tool for client names.

## Dependencies

- firm-boundary: create and map firm, jurisdiction, and matter brains; store brain-scoped PATs; perform clear and delete on the operator path; reject a request whose `X-Brain-ID` is not in the caller's tenant map. Application ingest and retrieve code never receives the system PAT.
- professional-review: retention event that triggers a matter clear; approval event that stores the citation handle and the approved text; rule for who may publish or withdraw a source.
- ticket-desk: a ticket carries `jurisdiction_id` and, once a matter exists, the matter id. This plan does not define ticket states.
- grounded-response: draft retrieval uses `POST /retrieve/context` with `include_history: false` on the firm brain, the ticket's jurisdiction brain, and the matter brain when OD-1 applies. It cites only handles the adapter marks current. Empty and conflicting retrieval stays that plan's contract.
- accountant-gui: the source list renders `/retrieve/search` hits after the adapter filter. It opens file bytes from the application database, not from a BrainAPI backup.
- Deployment: PostgreSQL and `SEARCH_ENABLED=true` before the source panel is relied on.

## Risks

- A new draft cites a superseded policy or regulation. This is the highest risk. It happens if `include_history` is omitted, or if a second ingest leaves the old passage ranked and the adapter does not drop non-current versions. The explicit flag and the catalog filter are both required. The fixture blocks customer publish until the write-side behavior is known.
- A client upload is ingested into the firm or jurisdiction brain. Preflight rejects `client_document` unless the resolved brain class is `matter`. Approved patterns without a completed redaction check are rejected.
- A jurisdiction file is written to the wrong brain. Preflight compares `jurisdiction_id` to the brain map and refuses the ingest on mismatch.
- `partial_failed` file ingest leaves some pages searchable while the version is not `current`. Those pages must not match a current handle. Rollback is requested when the task still allows it.
- File ingest may enrich and invent relationships. The default draft does not use the graph. Deterministic triples are the only edges the product treats as asserted. Unconfirmed extracted edges are ignored by the adapter.
- A matter clear succeeds in BrainAPI and the application still offers the brain, or the reverse. The cleared flag flips only after a successful system call, which only the operator path performs.
- Rebuilding the index from bytes reproduces passages, not a promise that chunk ids stay stable. Approval snapshots keep `content_hash` and the quoted span so the record does not depend on a chunk id surviving a rebuild.
- `list_source_versions` returns no versions when its query embedding fails. Audit reads pass `source_key` rather than a free-text query.

## Validation

Use synthetic fixtures on a non-customer development brain. Do not send client, firm, or employee documents. Do not use the anonymous demo for these writes.

1. Register a policy source, ingest version 1 as text with `skip_enrichment: true`, poll `GET /tasks/{id}` to `completed`, and confirm context with `include_history: false` returns that text.
2. Publish version 2 with different wording. Confirm the catalog has one `current` row. Confirm a draft retrieval returns version 2 and does not return version 1. Confirm `include_history: true` or `list_source_versions` with `source_key` still returns version 1.
3. Repeat with a two-page synthetic PDF through `POST /ingest/file`, then the deterministic triple call. Record whether the search hit exposes `source_key`, a chunk id, or `node_id`. The adapter's PDF binding uses only fields this run actually returns.
4. Force `failed` and `partial_failed` on a disposable version and confirm the previous current row is unchanged.
5. Submit with the wrong `X-Brain-ID` and confirm an immediate task 404 stops the poller.
6. Point a `client_document` at the firm brain and confirm preflight rejects it before any ingest call.
7. Point a regulation at a jurisdiction brain whose id does not match and confirm preflight rejects it.
8. After a synthetic matter clear on the operator path, confirm retrieve on that brain no longer returns the upload, and confirm the application rows for the file and the citation handle still exist.
9. Confirm an application request trace contains a brain-scoped credential and `X-Brain-ID`, and does not contain the system PAT or a `/system/` path.

Search-panel order and citation wording are verified by accountant-gui and grounded-response. This plan verifies that the hits they receive are current and in the correct brain.

## Unresolved decisions

- UD-KM-1. The public write contract does not say that a second ingest with the same `source_key` becomes the current copy and demotes the earlier one. Fixture step 2 decides this. Until it passes, no customer source is published.
- UD-KM-2. The file-task response does not document chunk ids, and file ingest does not document `skip_enrichment` or `meta_keys`. Fixture step 3 decides how a PDF hit is bound. If it cannot be bound, PDF text is extracted by the application and ingested with `POST /ingest/`, while the PDF bytes remain the system of record. That fallback is allowed only after the fixture fails, and it is still not a publisher crawl.
- UD-KM-3. professional-review sets the retention period and whether a signed engagement can outrank a firm policy for that one matter. This plan stores both levels and does not auto-rank them.
- UD-KM-4. Recovery objectives for the application database are not fixed here. The memory requirement is that approvals, citation handles, and file bytes are inside that backup. BrainAPI backups, if the operator takes them, shorten rebuild time and are not the professional record.
- UD-KM-5. firm-boundary chooses the exact brain-id allocator. This plan requires alphanumeric ids that start with a letter, one firm brain, one brain per jurisdiction id, one matter brain per engagement, and no reuse across tenants.

## Task list

### KM-1. Source catalog

Description: Add the application-database catalog for sources and versions: `source_key`, kind, authority level, jurisdiction, brain id, version, status, effective window, content hash, ingest task id, and the citation-handle fields an approval must copy.

Acceptance criteria: A firm can register a source and a first `draft` version without calling BrainAPI. A second `current` row for the same `source_key` is rejected. A `client_document` cannot be stored with a firm or jurisdiction brain id. Null jurisdiction is rejected except for firm-wide firm-brain kinds.

Verification: Migration and constraint tests cover one-current, jurisdiction nullability, kind-to-brain class, and immutable citation copies. No network call.

Dependencies: None inside this plan. professional-review consumes the citation fields. firm-boundary supplies the brain id.

Files likely touched: `app/memory/schema.sql`, `app/memory/catalog.ts`, `app/memory/catalog.test.ts`.

Estimated scope: M.

### KM-2. Placement preflight

Description: Resolve firm, jurisdiction, and matter brains through the tenant map, then refuse ingest when the kind, jurisdiction, or matter does not match that brain.

Acceptance criteria: Preflight returns the `X-Brain-ID` to use or a typed refusal. It does not create a brain and does not read a PAT. Mismatched jurisdiction, a client document aimed at a shared brain, and an unknown matter id fail closed.

Verification: Unit tests with a fake map. A test asserts the refusal happens with zero ingest calls.

Dependencies: KM-1. firm-boundary's map contract.

Files likely touched: `app/memory/placement.ts`, `app/memory/placement.test.ts`.

Estimated scope: S.

### KM-3. Ingest dispatch

Description: Implement the three customer ingest calls: `POST /ingest/` for text, `POST /ingest/file` for one PDF or accepted office file, and `POST /ingest/structured` with `mode: "deterministic"` for known triples. Text sets `skip_enrichment: true` and the version `meta_keys`. No URL ingest.

Acceptance criteria: Each call sends `X-Brain-ID` and the brain-scoped PAT for that brain only. The system PAT is not a parameter of this module. A 202 stores `task_id` on the version and leaves it `ingesting`. A 503 retries the same version. A 4xx leaves the previous current row in place. Identical content hash does not call ingest.

Verification: Contract tests against a local fake of the three endpoints, plus one synthetic text call on a development brain. Assert the outgoing headers exclude any system-token fixture.

Dependencies: KM-1, KM-2.

Files likely touched: `app/memory/ingest.ts`, `app/memory/ingest.test.ts`.

Estimated scope: M.

### KM-4. Task poller

Description: Poll `GET /tasks/{task_id}` on the ingest brain until a terminal status, and apply the status map from this plan.

Acceptance criteria: `completed` is the only success. `failed`, `partial_failed`, `cancelled`, and `rollback_failed` mark that version `failed` without changing the current row. A 404 stops the loop. A 401 stops the loop and does not fall back to another token. `partial_failed` requests `rollback` only when `cancellation_modes` includes it, then polls until `cancelled` or `rollback_failed`.

Verification: Fake task sequences for each terminal status, a 404, a 401, and a 503 on the original submit. No customer payload.

Dependencies: KM-3.

Files likely touched: `app/memory/tasks.ts`, `app/memory/tasks.test.ts`.

Estimated scope: M.

### KM-5. Supersession and draft filter

Description: When version n+1 completes, flip n to `superseded` and n+1 to `current` in one transaction, write the deterministic supersession triple, and mark this application's old relationships `invalid_at` or `deprecated`. Expose one retrieval adapter that calls context with `include_history: false` and drops search hits the catalog does not mark current and effective.

Acceptance criteria: A draft read cannot observe version n after the flip commit. An approval row written before the flip still shows version n and its hash. Withdrawn and not-yet-effective versions are not returned. The adapter never omits `include_history` and never calls graph or MCP for an ordinary draft.

Verification: Database transaction test for the flip, and an adapter test that a stale hit with an old version is removed before the result leaves the module.

Dependencies: KM-1, KM-4. grounded-response must call this adapter rather than `/retrieve/*` directly.

Files likely touched: `app/memory/supersede.ts`, `app/memory/retrieve-adapter.ts`, `app/memory/supersede.test.ts`.

Estimated scope: M.

### KM-6. Current-copy fixture

Description: Run the synthetic text and PDF checks in the validation section on a development brain. Record whether re-ingest demotes the previous copy and which PDF hit fields can bind a version.

Acceptance criteria: The written result says either that `include_history: false` and default search hide version 1, or that they do not. Customer ingest stays disabled until this result is recorded. No customer, client, or employee content is in the fixture.

Verification: The fixture log shows task ids, terminal statuses, and whether version 1 appeared in the draft retrieval. A reviewer can repeat it on an empty brain.

Dependencies: KM-3, KM-4, KM-5. Blocks production use of KM-3.

Files likely touched: `app/memory/fixtures/current-copy.md`, `app/memory/fixtures/run-current-copy.ts`.

Estimated scope: M.

### KM-7. Matter-brain clear handoff

Description: On the retention signal, ask the operator path to clear that matter brain. Do not call `/system/*` from application code.

Acceptance criteria: The handoff carries the matter brain id and no token. The catalog shows `clear_requested` until the operator path reports success, then `cleared`. Ticket, approval, citation, and file-byte rows are untouched. Firm and jurisdiction brains are not eligible inputs.

Verification: Test the state machine with a fake operator result for success, 409, and 503. Assert the application module has no system-route client.

Dependencies: KM-2. professional-review emits the retention signal. firm-boundary performs the clear.

Files likely touched: `app/memory/matter-retention.ts`, `app/memory/matter-retention.test.ts`.

Estimated scope: S.

### KM-8. Redaction gate

Description: Block firm-brain ingest of `approved_pattern` until the application records that client identifiers were removed from that exact content hash.

Acceptance criteria: A pattern version cannot enter `ingesting` without a redaction marker for the same hash. Changing the text invalidates the marker. Other source kinds do not use this gate as a substitute for matter isolation.

Verification: Unit tests for missing marker, stale hash, and a matching marker. The matching case is the only one that reaches the ingest dispatcher.

Dependencies: KM-1, KM-3.

Files likely touched: `app/memory/redaction-gate.ts`, `app/memory/redaction-gate.test.ts`.

Estimated scope: S.
