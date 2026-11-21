# Firm boundary (PLAN-6)

Status: proposal, accepted. `docs/plans/01-coordinator-decisions.md` CD-6 adopts DELETE for matter-brain removal and per-firm jurisdiction brains. Planning only. This file does not provision a BrainAPI account, does not store a token, and does not map TaxDome, Karbon, Canopy, or DATEV fields.

Authoritative inputs: BrainAPI auth constraints in `docs/plans/00-authoritative-brief.md`, locked decisions 1, 2, 3, and 7, and [Brains and auth](https://brainapi.lumen-labs.ai/docs/v2/brains-and-auth.md).

## Recommendation

### Runtime components

Seven runtime components. The secret store stores the system PAT. **Operator control is the only component that may read and use it.**

| Component | Responsibility | BrainAPI credentials |
| --- | --- | --- |
| Staff browser | Staff session. v1 intake is a pasted ticket plus a file upload. | Session cookie only. |
| Desk API | Authenticates the staff session, writes tickets and file bytes to the application database, runs `TenantBrainGate`, performs BrainAPI data calls, and calls the draft model with passages. | Brain-scoped PAT, and only after the gate returns a mapped brain id. |
| Operator control | Creates brains, rotates brain PATs, removes matter brains, and writes binding rows. Separate deployable and separate secret-store identity from the desk API. Same codebase is acceptable. | System PAT (`BRAINPAT_TOKEN`). |
| Application database | System of record for the firm, staff membership, brain bindings, the ticket, the approval, and the file bytes. | None. |
| Secret store | Holds the system PAT, one PAT per brain, and, later, the per-firm handoff HMAC key. | Stored values. Desk API can read brain PATs. Operator control can read the system PAT and write brain PATs. |
| BrainAPI | Data boundary. One brain per bound id. Product data stays off the reserved `system` brain. | Checks the PAT against the selected brain. |
| Draft model | Writes the draft from passages the desk API sends. | None. No system PAT and no brain PAT. |

A BrainAPI 401 reloads that brain's PAT from the secret store once and then fails the call. The desk API has no path that substitutes the system PAT.

BrainAPI selects a brain from `X-Brain-ID`, then a `brain_id` query parameter, then a top-level JSON `brain_id`, then a multipart `brain_id`. The desk outbound client therefore builds its own request. It sends `X-Brain-ID` and `BrainPAT`. It does not copy a brain id from the browser, the ticket body, or a future handoff.

Production calls name the brain on every data call. Operator control creates brains with `POST /system/brains`. The design does not depend on `BRAIN_CREATION_ALLOWED` or `DEFAULT_BRAIN_FALLBACK`.

Anonymous demo brains and the Docs MCP stay on the development path in locked decision 7. Customer material uses an authenticated brain.

### Tenant to brain mapping

The application database is the map. Brain ids are opaque, alphanumeric, and start with a letter. Operator control allocates them. Reserved ids `system` and `default` are rejected. A letter prefix marks class: `f` firm, `j` jurisdiction, `m` matter. The prefix is a check, not the authorization decision.

| Binding | Key | Value |
| --- | --- | --- |
| Firm brain | `firm_id` | one `firm_brain_id` |
| Jurisdiction brain | `firm_id` + `jurisdiction_id` | one `jurisdiction_brain_id` |
| Matter brain | `firm_id` + `matter_id` | one `matter_brain_id` |

Locked decision 2's "one brain per jurisdiction id" applies inside the firm. It keeps a jurisdiction in one brain until volume requires a split. It does not mean one brain shared by every firm. The jurisdiction brain holds documents that firm is allowed to store. A regulation marketplace is out of scope, so v1 has no operator-written global jurisdiction brain.

`TenantBrainGate` in the desk API is the check, and it runs before `X-Brain-ID` is set:

1. Authenticate the caller. v1 is the staff session. The future seam is the firm HMAC below.
2. Read `firm_id` from that credential. Ignore any firm id in the body.
3. Load the ticket, matter, and jurisdiction from the application database. Each row's `firm_id` must equal the credential's firm.
4. Choose the class the operation needs: firm, jurisdiction, or matter.
5. Load that binding. Require a brain id that matches `^[A-Za-z][A-Za-z0-9]+$` and is not `system` or `default`.
6. Load the secret-store entry for that brain id and require it to be marked brain-scoped.
7. The outbound client then sets `X-Brain-ID` to the mapped id and `BrainPAT` to that brain's PAT.

Any failed step returns an error to the caller and makes no BrainAPI call. A caller-supplied `X-Brain-ID` or `brain_id` is a failed step.

Staff membership in v1 is one firm per user. The session is server-side. Accountant GUI owns the pixels for sign-in. This plan owns the firm pinned to the session.

### OD-1

**Accept** the brief's default, jointly with knowledge-memory.

A client's uploaded documents are indexed in a matter-scoped brain created for the engagement. Ingest is asynchronous and uses that matter's brain PAT. The application database remains the system of record for the ticket, the approval, and the file bytes. The firm brain is limited to policies, engagement templates, playbooks, and approved answer patterns with client identifiers removed. A client-upload class is refused on the firm brain and on every jurisdiction brain.

Operator control creates the matter brain when the matter is opened. If operator control is down, the desk API still stores the ticket and the bytes, and retrieval waits. The draft path then sees no matter brain; grounded-response owns how the draft reports missing sources.

When professional-review emits the memory-retention signal, the gate stops resolving that matter brain, and operator control removes it. Removal uses the system PAT. See UD-FB-1 for the verb. File-byte deletion stays on the record-retention clock professional-review sets. This plan does not delete the system-of-record bytes in the brain-removal step.

### Inbound seam (not built in v1)

Name: **`PracticeTicketHandoff`**.

v1 does not mount this route, does not issue the HMAC key, and does not adapt a vendor. v1 intake is an authenticated staff request with a pasted ask and a file upload. That request writes the same internal ticket and file-byte records and carries no brain id.

Auth, when a later release implements the seam:

- Per-firm HMAC secret in the secret store, distinct from every BrainAPI PAT.
- Headers `X-Handoff-Timestamp` and `X-Handoff-Signature`.
- Signature is HMAC-SHA256 over the timestamp, a newline, and the raw body.
- The desk API accepts a clock skew of five minutes and stores `(firm_id, handoff_id)` for idempotency.
- The secret's firm must equal `firm_id` in the payload.

Payload:

| Field | Required | Meaning |
| --- | --- | --- |
| `handoff_id` | yes | Sender idempotency key. |
| `firm_id` | yes | Our firm id. Must match the HMAC secret's firm. |
| `external_ref` | yes | Opaque practice-system reference. |
| `jurisdiction_id` | yes | Our jurisdiction id. |
| `matter_ref` | no | Opaque matter reference. |
| `ask` | yes | Ticket text. |
| `attachments` | no | `{ filename, media_type, locator }`. `locator` is an opaque handle the future adapter can turn into bytes for the application database. |

The schema rejects `brain_id`, `X-Brain-ID`, `pat`, and `authorization`. After the signature check, brain selection still goes through `TenantBrainGate`.

### Deployment and failure

The staff browser talks only to the desk API. The desk API talks to the application database, the secret store (brain PATs), BrainAPI, and the draft model. Operator control talks to the secret store (system PAT and brain PAT writes), BrainAPI `/system/*`, and the binding rows. The future adapter would talk to the desk API on `PracticeTicketHandoff`.

| Failure | Behavior |
| --- | --- |
| Unmapped, malformed, reserved, or cross-firm brain id | Error from the gate. No BrainAPI call. |
| Caller sends a brain id | Reject the request. |
| BrainAPI 401 | Reload the brain PAT once. Then fail. Operator control investigates. |
| BrainAPI 406 | Binding points at a missing brain. Operator control repairs it. The desk API does not create a brain by retrying under a new id. |
| `BRAIN_PAT_CACHE_INVALIDATION_FAILED` (503) on rotate | The new PAT is already saved. Operator control stores that value, alerts, and rotates again after cache health recovers. |
| Operator control down at matter open | Ticket and bytes remain in the application database. Ingest waits. |
| Retention signal fired and delete not finished | Gate stops resolving that matter brain, so retrieval fails closed while retry continues. |
| Draft model call | Separate HTTP client. Passages and citation handles only. |

v1 scale is one desk API deployable, one operator deployable, and a binding table small enough to cache per firm for a short TTL. Operator control enforces a per-firm matter-brain cap supplied as an ops setting.

## Alternatives

1. **Desk API holds the system PAT and uses it on data calls.** Rejected. BrainAPI assigns the system token to trusted operator services and assigns applications a brain-scoped PAT. A desk compromise would then cover every brain, including every matter brain.

2. **Reject OD-1.** Keep client bytes only in the application database and pass a bounded extract to the draft model, with no matter brain. Client bytes stay out of the firm brain, and cleanup is deletion of the database row. Rejected as the default because locked decision 4 expects a matter brain when OD-1 lands there, and a prompt extract has no BrainAPI source version for the reviewer to open. Recorded for knowledge-memory.

3. **One brain per client, shared by that client's matters.** Client bytes stay out of the firm brain. Rejected. Retention and removal are engagement-scoped, and two matters would share one data boundary.

4. **One jurisdiction brain per jurisdiction id, shared by all firms.** Rejected for v1. A write from one firm would enter another firm's retrieval set. The brief leaves a regulation marketplace out of scope. Topic splits inside a jurisdiction wait until volume requires them, which is knowledge-memory's scaling question, not a cross-firm brain.

5. **Build live TaxDome, Karbon, Canopy, or DATEV sync in v1.** Rejected by locked decision 1. `PracticeTicketHandoff` is the seam those adapters would call later.

## Assumptions

- Each v1 staff user belongs to one firm, and the server-side session is the source of `firm_id`.
- Operator control can be deployed with a secret-store identity the desk API does not have.
- The BrainAPI host used for customer data can be operated with explicit brain creation. The gate still sends a mapped `X-Brain-ID` on every data call if that host setting cannot be confirmed before launch.
- knowledge-memory owns ingest bodies, `GET /tasks/{id}` polling, source identity, and freshness. It uses the brain id this plan resolves.
- ticket-desk owns ticket state. Tickets store `firm_id`, `jurisdiction_id`, and `matter_id`. They do not store a caller-writable brain id.
- professional-review owns who may approve, the consent flag, and the retention signals.
- grounded-response reaches BrainAPI only through the desk gate.
- accountant-gui has no field for a BrainAPI token.
- v1 file bytes live in the application database. A later object store would be indexed by that database and would still be outside the firm brain.
- Customer material is not sent to the anonymous demo or the Docs MCP.
- No real token is committed. Examples in deploy config use key names only.

## Dependencies

- knowledge-memory: ingest and source versions for the three brain classes, and agreement that client uploads target the matter brain. Shared owner of OD-1. This plan accepts the default.
- ticket-desk: ticket and matter identifiers the gate joins on. Jurisdiction and risk class stay on the ticket.
- professional-review: memory-retention signal for matter-brain removal, and the separate clock for system-of-record bytes and approval records.
- grounded-response: draft and search calls. This plan supplies the resolved brain ids and withholds PATs from the model client.
- accountant-gui: paste and upload UI. Session cookie only.
- Ops: secret store, two runtime identities, and a per-firm matter-brain cap. BrainAPI account provisioning is outside this plan.
- Coordinator: UD-FB-1 and any conflict if knowledge-memory proposes a shared jurisdiction brain.

## Risks

1. **Highest.** A request path sets `X-Brain-ID` from the caller, omits it and hits a host default brain, or retries a 401 with the system PAT. That crosses firms or puts client material in the wrong brain. The gate, the outbound client, and the desk identity split exist to close this.
2. Client upload ingest is aimed at the firm brain or a jurisdiction brain. Class checks on those paths and the matter binding exist to close this. The firm brain would then mix clients, which the locked firm-brain contents rule forbids.
3. `POST /system/brains/{id}/clear` on a matter brain removes indexed data and leaves the id and PAT in place. A leaked matter PAT would still authenticate. UD-FB-1 prefers delete.
4. PAT rotation returns 503 `BRAIN_PAT_CACHE_INVALIDATION_FAILED`. The new PAT is already live and the old one can linger in BrainAPI's cache. Operator control must keep the new value and retry cache invalidation.
5. Matter-brain count grows with engagements. A stuck retention job leaves client indexes in BrainAPI after the firm expects them gone. The gate fails closed once the signal is due, which limits exposure while the delete retries.
6. `PracticeTicketHandoff` implemented later with a vendor payload that includes a brain id. The schema rejects that field. The HMAC secret must stay out of the practice system logs.
7. Logging, browser analytics, or the draft request capture `BrainPAT` or `X-Brain-ID` from the wrong client. Validation below treats that as a test failure.

## Validation

- Resolver tests: two firms. Firm A cannot resolve firm B's firm, jurisdiction, or matter brain. A missing binding errors. `system`, `default`, and malformed ids error.
- Outbound-client test against a fake BrainAPI: the recorded `X-Brain-ID` equals the mapped id, the recorded PAT is that brain's PAT, and a caller `brain_id` in the query, JSON, or multipart never appears on the wire.
- 401 test: one reload of the brain PAT, then failure, with the system PAT unread by the desk test double.
- Upload test: target class is the matter brain. A client-upload fixture aimed at the firm brain is refused. With operator control stopped, the bytes are still in the application database and no BrainAPI call is made.
- Session test: the body `firm_id` does not change the firm used for the lookup.
- Config lint: the desk deploy spec has no system-PAT secret binding. Fixtures contain key names, not token values.
- Model-client test: the draft HTTP client has no `BrainPAT` header and no `X-Brain-ID`.
- Operator audit, using `GET /meta/login-info` on stored brain PATs: each application entry reports a single-brain token. A system token stored under a brain key fails the audit.
- Route list: `PracticeTicketHandoff` is absent in v1. The schema test rejects a payload that contains `brain_id`.
- No customer data and no live BrainAPI call are part of this planning task.

## Unresolved decisions

- **UD-FB-1.** Matter-brain removal verb. Recommendation: `DELETE /system/brains/{brain_id}` so the data, the brain identity, and the PAT are removed together. The brief's word is "cleared", and BrainAPI `clear` keeps the id and the PAT. Coordinator confirms the verb. professional-review still owns the signal time.
- **UD-FB-2.** If knowledge-memory proposes one jurisdiction brain shared by all firms, the coordinator chooses. This plan binds `(firm_id, jurisdiction_id)` to a private brain.
- **UD-FB-3.** Whether system-of-record file bytes outlive the matter brain. This plan removes the brain on the memory-retention signal and leaves byte deletion to professional-review. The clocks need an explicit pair in that plan.
- **UD-FB-4.** Confirm, before customer data is ingested, that the production host is not required to auto-create brains or fall back to `default`. The gate does not rely on those flags either way.

## Task list

### FB-1. Binding records for firm, jurisdiction, and matter brains

- Description: Add application-database records for one firm brain per firm, one jurisdiction brain per `(firm_id, jurisdiction_id)`, and one matter brain per `(firm_id, matter_id)`. Store staff membership with one firm per user. Reject reserved and malformed brain ids at write time.
- Acceptance criteria: Firm A lookup never returns firm B's ids. A missing row is an error. Inserts of `system`, `default`, and ids that fail `^[A-Za-z][A-Za-z0-9]+$` fail. Ticket rows referenced by the gate carry firm, jurisdiction, and matter ids and have no caller-writable brain id column.
- Verification: Database constraint tests and a two-firm resolver test.
- Dependencies: None. knowledge-memory and ticket-desk consume this map.
- Files likely touched: application schema for firms, memberships, jurisdiction bindings, matters, and brain ids. Resolver module.
- Estimated scope: M

### FB-2. Operator control and system PAT placement

- Description: Deploy operator control as the only runtime identity that can read the system PAT. Limit the desk API identity to brain-scoped PAT reads. Operator control creates a brain, stores the returned brain PAT, and writes the binding row. Include rotate, and a delete command used by FB-4.
- Acceptance criteria: The desk deploy spec has no system-PAT binding. The operator spec has that binding. Config samples contain key names only. A brain created through any other path is out of policy.
- Verification: Policy or config test that fails when the desk environment includes the system PAT key. Dry-run client test against a fake `/system/brains` that the desk test process cannot construct.
- Dependencies: FB-1.
- Files likely touched: desk API deploy spec, operator deploy spec, secret key names, operator BrainAPI admin client.
- Estimated scope: M

### FB-3. TenantBrainGate before X-Brain-ID

- Description: Implement the seven-step check in the recommendation inside the desk API. The outbound client sets `X-Brain-ID` and `BrainPAT` only from the gate result and builds a new request body for BrainAPI.
- Acceptance criteria: Caller brain ids are rejected before any outbound call. The header on the wire matches the binding. A 401 reloads the brain PAT once and does not read the system PAT.
- Verification: Fake BrainAPI tests for cross-firm id, missing binding, query `brain_id`, JSON `brain_id`, multipart `brain_id`, and 401 reload.
- Dependencies: FB-1, FB-2.
- Files likely touched: `TenantBrainGate`, BrainAPI outbound client, request validation on staff intake.
- Estimated scope: M

### FB-4. Matter-brain path for accepted OD-1

- Description: Store client file bytes in the application database. Dispatch ingest only to the mapped matter brain, asynchronously, with the matter PAT. Refuse a client-upload class on firm and jurisdiction brains. On the memory-retention signal, stop resolving the matter brain and call operator control to remove it.
- Acceptance criteria: The upload path's BrainAPI target is the matter brain or no call. Firm-brain and jurisdiction-brain ingest reject a client upload. Bytes remain in the application database when operator control is unavailable and after the brain is removed.
- Verification: Handler tests for target class, refusal, and operator-down. Retention test shows the gate fails closed while delete is incomplete.
- Dependencies: FB-1, FB-2, FB-3. Ingest body and task polling from knowledge-memory. Retention signal from professional-review. Until that signal exists, the operator delete command is callable from a fixture, not from the browser.
- Files likely touched: upload dispatcher, ingest target check, operator delete command, matter binding status.
- Estimated scope: M

### FB-5. Session firm pin

- Description: Issue a server-side staff session bound to one firm. The gate reads that firm id. The browser response carries no BrainAPI credential.
- Acceptance criteria: A second firm's session cannot read the first firm's bindings. A body `firm_id` does not override the session. Responses have no `BrainPAT` value and no bearer PAT.
- Verification: Two-firm authz test and a response snapshot that fails on token-shaped fields.
- Dependencies: FB-1.
- Files likely touched: session middleware, staff membership read path. Screens remain with accountant-gui.
- Estimated scope: S

### FB-6. PracticeTicketHandoff schema, unmounted

- Description: Add the seam schema and HMAC verification function from this plan, and leave the route unregistered. Do not add vendor field mappings or issue a real HMAC secret.
- Acceptance criteria: The schema rejects `brain_id`, `X-Brain-ID`, `pat`, and `authorization`. v1 route registration does not include `PracticeTicketHandoff`. Staff paste plus file upload remains the v1 intake.
- Verification: Schema tests and a route-list test.
- Dependencies: None. ticket-desk's ticket writer is the future consumer of a valid payload.
- Files likely touched: handoff schema and signature checker in the desk API. No edit to `contracts/**` in the planning pass.
- Estimated scope: S

### FB-7. Draft client fence and brain-PAT audit

- Description: Use a distinct HTTP client for the draft model that cannot set a BrainAPI header. In operator control, check stored brain PATs with `GET /meta/login-info` and fail the audit when an entry is the system token.
- Acceptance criteria: The model client fixture fails when `BrainPAT` or `X-Brain-ID` is attached. The audit fixture passes a single-brain token and fails a system token stored under a brain key.
- Verification: Unit tests for both clients using fixtures. No live customer brain.
- Dependencies: FB-2, FB-3.
- Files likely touched: draft model HTTP client, operator PAT audit job.
- Estimated scope: S
