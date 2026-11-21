# PLAN-3 Grounded response

Status: draft proposal for Accountant Agent Desk, accepted with overrides. `docs/plans/01-coordinator-decisions.md` CD-1, CD-2, CD-3, and CD-5 name the risk-class enum, the disposition map, the risk signals, and the citation snapshot. This file owns the draft contract, citation handles, refusal, and the choice among context, search, graph, and product MCP. It does not own queue states, ingestion, screen layout, approval authority, or PAT storage.

Authoritative inputs: `docs/plans/00-authoritative-brief.md`, especially retrieval rules and locked decisions 4 and 5. BrainAPI v2 shapes used here are the public context and search contracts: `POST /retrieve/context` returns `source_passages`, triples with `source_chunk_ids`, and `temporal_conflicts`; `POST /retrieve/search` returns ordered `hits` whose `id` is the chunk id, plus `snippet`, `score`, `channel`, and `extras`.

## Recommendation

The GUI and the approval record store the same immutable draft revision in the application database. BrainAPI is evidence, not the system of record. A new generation inserts a new revision and leaves the previous row unchanged. The approval event, owned by professional-review, points at `draft_id` and `revision` and copies this object into the audit record.

`client_delivery` is the literal `not_permitted` on every revision. The drafter has no email send and no client-portal post. Copy and download read `body_text` from the stored revision.

### Draft object

Top-level fields:

| Field | Meaning |
| --- | --- |
| `draft_id` | New id for each revision. |
| `ticket_id` | Ticket this draft answers. |
| `revision` | Monotonic integer per ticket, starting at 1. |
| `outcome` | `ready`, `unsupported`, `conflict`, `partial`, or `failed`. |
| `jurisdiction_id` | Copied from the ticket. The drafter does not invent one. |
| `risk_class` | Copied from the ticket: `status` or `conclusion`. |
| `generated_at` | Server time when the revision was stored. |
| `query` | Text sent to retrieval: the ticket ask plus the jurisdiction id. |
| `retrieval_runs` | One record per BrainAPI call. |
| `citations` | Openable handles for this revision. |
| `sentences` | Ordered sentences with a kind and zero or more handles. |
| `gaps` | What is missing, and why. |
| `conflicts` | Pairs of handles the draft refuses to choose between. |
| `coverage` | Counts of rule-bearing sentences and how many carry a valid handle. |
| `body_text` | The sentences joined for copy and download. |
| `client_delivery` | Always `not_permitted`. |

`retrieval_runs[]` fields: `surface` (`context`, `search`, `graph`, `mcp`), `brain_role` (`firm`, `jurisdiction`, `matter`), `brain_id`, `query`, `http_status`, `passage_count`, `hit_count`, `temporal_conflict_count`, `empty`, `error_code`. No passage body, no PAT, no model credential.

`citations[]` fields: `handle`, `brain_role`, `brain_id`, `chunk_id`, `snippet`, `rank`, `channel`, `source_key`, `source_version`, `version_status` (`resolved` or `unresolved`).

`sentences[]` fields: `sentence_id`, `text`, `kind`, `handles`, `support`.

`kind` is one of `ticket_fact`, `status_update`, `retrieved_rule`, `firm_obligation`, `conclusion`, `gap`, `conflict_notice`.

`support` is one of `ticket_record`, `cited`, `unsupported`.

`gaps[]` fields: `gap_id`, `reason` (`empty_retrieval`, `ingest_pending`, `missing_firm_obligation`, `missing_authority`, `version_unresolved`, `brain_failed`, `search_unavailable`), `brain_role`, `text`.

`conflicts[]` fields: `conflict_id`, `handles` (exactly two), `text`.

`coverage` fields: `rule_sentence_count`, `cited_rule_sentence_count`, `uncovered_sentence_ids`, `version_gap`.

### Citation handle

A citation handle is the pair the reviewer can open:

`brain:{brain_id}:chunk:{chunk_id}`

`chunk_id` is the search hit `id`. The same pair is the only id a sentence may cite. Building the set:

1. Run search for that brain. Index hits by `hit.id`.
2. The handle is `brain:{brain_id}:chunk:{hit.id}`.
3. Store `hit.snippet` as `snippet`, the 1-based position as `rank`, and `hit.channel` as `channel`. `score` stays off the handle and off the draft. It is comparable only inside one search response and is not a measure of legal support.
4. A context triple may corroborate the handle when one of its `source_chunk_ids` equals `hit.id`. The triple does not create a second handle.
5. A `source_passages` string with no matching search hit id is uncitable. Increment an internal unattached count on the retrieval run. Do not show it as a source.
6. `source_key` and `source_version` are filled when knowledge-memory can resolve the chunk. `version_status` is `unresolved` until then. `coverage.version_gap` is true if any cited rule still has `unresolved`. Professional-review decides whether that blocks approval.

The source panel lists `citations` in search rank order, per brain, in the order firm, jurisdiction, matter. The drafter does not reorder them.

### When each surface is called

Brains for a generation are the firm brain, the jurisdiction brain for `jurisdiction_id`, and the matter brain when the ticket has one (OD-1 default). Firm-boundary supplies those ids after the tenant check. The ticket body cannot add, remove, or replace a brain id. The body `brain_id` and `X-Brain-ID` must be that validated id. If they would differ, store `outcome: failed` and stop.

Default path, one call each, synchronous, no retry loop:

- `POST /retrieve/context` with the ticket query, `include_history: false`, `sufficiency_retry: false`, `profile_stages: false`, and the API defaults for `max_facts` (40) and `max_passages` (8).
- `POST /retrieve/search` with `channels: ["passages"]`, `k: 20`, `mode: default`, no plugin channel, and no rerank plugin.

Set `include_history: true` and keep `historical_limit` at 10 only when the ask is about a prior copy or what changed. A passage marked superseded can support a sentence that says it is a prior copy. It cannot support a current `firm_obligation`.

Graph APIs and product MCP stay off the default path.

Call a graph API only when the ask is how two named entities are related and the application already knows the start entity. Prefer that one traversal. Explore (`GET /retrieve/explore/v1/...`) is allowed only on the NetworkX PostgreSQL backend. HTTP 501 or 409 ends the graph branch; the draft then uses passage handles or a gap. Do not call `/retrieve/recommend`.

Call product MCP only when the next read depends on an earlier result, with a cap of three tool calls:

- `list_source_versions` for a source-history ask, or to resolve `source_version` for a chunk already in the citation set.
- `traverse_graph` when the start node is known and the relationship is still not a cited passage.
- `list_changelogs` and `get_changelog` for an ask about what changed in the graph.

`search_memory` is not the source panel. Docs MCP is not used for customer material. An MCP or graph result that has no `chunk_id` in the search-hit set cannot support a rule; it becomes a gap whose reason is `missing_authority`.

### What the draft is allowed to say

A sentence with kind `retrieved_rule`, `firm_obligation`, or `conclusion` is stored only with `support: cited` and at least one handle from this revision's search hits. Any other output of those kinds is rewritten to kind `gap`, `support: unsupported`, and a gap record before the revision is saved.

`ticket_fact` and `status_update` may cite ticket fields (`ticket.ask`, `ticket.missing_facts`, `ticket.jurisdiction_id`) with `support: ticket_record`. They do not state a rule.

Refusal rule: if retrieval is empty, the sources conflict, or a rule, firm obligation, or conclusion has no handle in this revision's search hits, the draft states the gap or the disagreement and does not invent a rule.

Empty retrieval. Every selected brain returns no search hits, and none is still ingesting. `outcome` is `unsupported`. The only substantive sentence is a gap: "Nothing in the retrieved firm, jurisdiction, or matter passages supports a rule for this question. No rule is stated." `gaps[].reason` is `empty_retrieval`.

Ingest still running. Knowledge-memory reports the matter task unfinished. `outcome` is `partial` for a status ticket and `failed` for a conclusion ticket. The gap reason is `ingest_pending`: "The client file is still processing. No rule is stated from it." This is not treated as an empty corpus.

Conflict. `temporal_conflicts` is non-empty, or two search hits are both offered for incompatible obligations. `outcome` is `conflict`. The draft quotes neither as the winner. It stores both handles and the sentence: "The retrieved sources disagree. Both are listed. This draft does not pick one." An unparsed non-empty `temporal_conflicts` array is still a conflict. A current passage and a superseded copy are a conflict only when the ask is which version applies and the current copy cannot be told apart. When the current copy is identified, cite it and record the superseded handle on the retrieval run, outside `firm_obligation`.

Conclusion without authority. A `conclusion` or `firm_obligation` without a valid handle is rewritten to: "A conclusion needs a retrieved passage. None supports this one, so it is not stated." (`gaps[].reason` `missing_authority`). A jurisdiction passage does not become a firm obligation. If the firm brain has no hit, add `missing_firm_obligation`: "No firm-policy passage supports a firm obligation." The jurisdiction passage may remain a `retrieved_rule` with its own handle.

Status tickets. The draft may restate missing facts from the ticket. It may not add a conclusion. A cited rule that appears on a status ticket sets `coverage` and leaves the ticket state to ticket-desk.

Failed retrieval. Search HTTP 404, or a context or search error on the jurisdiction brain for a conclusion ticket, stores `outcome: failed`, no rule sentence, and `search_unavailable` or `brain_failed`. A status ticket may still contain `ticket_fact` sentences when the firm or jurisdiction call fails; `outcome` is then `partial`.

### Write boundary

Retrieval runs before the database transaction. The transaction inserts the revision, its sentences, citations, gaps, and conflicts. A failed insert retries the insert of that same payload. It does not call BrainAPI or the model again. The idempotency key is `ticket_id` plus the regenerate token from the staff action. The same token returns the stored revision.

Regenerate limit assumption: 10 stored attempts per ticket per hour. The eleventh returns the latest revision and an error code the GUI can show.

Logs carry `draft_id`, `ticket_id`, `brain_role`, `surface`, counts, latency, and `outcome`. They omit passage text, ticket body, PATs, and model credentials.

## Alternatives

- Context-only citations, with the source panel built from `source_passages`. Rejected for v1 because locked decision 4 requires `/retrieve/search` so order and snippets stay stable, and those passage strings have no chunk id in the published response.
- Let the model state a rule and mark it "unverified." Rejected by locked decision 5. The sentence is rewritten to a gap before save.
- Auto-send status replies. Rejected. Locked decision 6 and the professional constraints keep both risk classes inside a human approval, and v1 export is copy or download.
- Use product MCP `search_memory` as the source list. Rejected. The HTTP search response is the ranked panel. MCP remains the history and traversal branch.
- Treat search `score` as confidence and drop hits under a threshold. Rejected. Scores are not comparable across requests. The refusal conditions are an empty hit list, a conflict, or a sentence with no handle.
- Store the draft only in the browser. Rejected. The approval record has to store this same object after the session ends.

## Assumptions

- OD-1 stands: a matter-scoped brain exists for client uploads. If that decision flips, the matter calls are omitted and client-file evidence comes only from chunks knowledge-memory still exposes to search.
- Search is enabled on PostgreSQL (`SEARCH_ENABLED=true`). A 404 fails the draft closed.
- Ticket-desk provides `ticket_id`, `jurisdiction_id`, the ask, `risk_class`, and missing facts before a draft runs.
- Knowledge-memory provides the ready flag for a matter ingest task and, when it can, `source_key` and `source_version` for a chunk id.
- Firm-boundary has already checked the tenant-to-brain mapping. This plan does not choose where the PAT lives.
- The model runs on the server and sees the context pack for the validated brains. Which vendor, and the consent flag for that call, belong to professional-review. This plan names no model credential.
- v1 checks that a rule's handle is one of this revision's search hits and that the stored snippet is that hit's snippet. It does not run a second entailment model.
- `hit.id` and triple `source_chunk_ids` are the same chunk id space. The known-passage fixture confirms or breaks this assumption.

## Dependencies

- Ticket-desk: ticket identity, jurisdiction, ask, risk class, missing facts. This plan does not name queue states.
- Knowledge-memory: firm brain, one jurisdiction brain per jurisdiction id, matter brain under OD-1, ingest task status, source identity and version for a chunk.
- Firm-boundary: validated brain ids and a server-side brain-scoped credential. The browser and the draft model do not receive that credential.
- Accountant-gui: renders `sentences`, `coverage.uncovered_sentence_ids`, and the citation list in stored rank order. Layout is theirs. They need `outcome`, gap text, and `client_delivery`.
- Professional-review: the approval event stores this revision, the person, and the source versions. Who may approve, consent, and retention are theirs. They should refuse to treat a revision as sent, because `client_delivery` is `not_permitted`.

## Risks

- A sentence can cite a real search hit and still say something that snippet does not say. The v1 check proves the handle was retrieved and the snippet was stored. It does not prove entailment. This is the highest risk. The reviewer sees the snippet beside the sentence, and uncovered sentences are listed. A later entailment pass is an unresolved decision, not a v1 task.
- Context can return a useful passage that search did not place in the top 20. That passage cannot be cited, so the draft under-claims. `k: 20` is the v1 bound. Raising it is a one-line change after the fixture shows misses.
- `temporal_conflicts` is an untyped object list. A non-empty list forces `conflict` even when the objects are opaque, which can over-refuse. Over-refusal is the accepted side.
- Ticket text can try to name a brain or demand a send. The brain list comes from firm-boundary, and the schema has no send action. The stored revision still contains the client ask inside `query`, which professional-review retains with the record.
- A matter brain that is still on HTTP 202 can look empty. The `ingest_pending` gap exists so the draft does not claim the corpus has no rule.
- Search rank can change after a reindex. The revision stores snippet and chunk id, so the approval record keeps the text the reviewer saw even if a later search order differs.

## Validation

Use a fake BrainAPI client and fixture tickets. Do not call a customer brain.

- Known passage. The jurisdiction search fixture returns one hit, `id: chunk-vat-threshold`, snippet equal to a fixed sentence about the threshold. The draft sentence that states that threshold uses handle `brain:{jurisdictionBrainId}:chunk:chunk-vat-threshold`, the citation snippet equals the hit snippet, and `body_text` does not add a second rule.
- No supporting passage. Search hits are empty on every brain, ingest is complete, `temporal_conflicts` is empty. `outcome` is `unsupported`, no sentence has kind `retrieved_rule`, `firm_obligation`, or `conclusion`, the empty-retrieval gap text is present, and `client_delivery` is `not_permitted`.
- Conflict. Two hits, and a non-empty `temporal_conflicts` list. `outcome` is `conflict`, both handles are stored, and the conflict sentence does not pick a winner.
- Relationship ask. The router records a graph or MCP call. A policy ask records context and search only.
- Search 404 and matter ingest pending. Outcomes follow the failure rules above, with no invented rule.
- Log line for the known-passage fixture contains `outcome` and `brain_role` and omits the fixture snippet and any token.

## Unresolved decisions

- UD-G1. Entailment. v1 stores the hit snippet beside the sentence and blocks missing handles. A second model pass that checks the sentence against the snippet is not in v1. Professional-review can require the human check. Reopen UD-G1 if fixture review shows frequent true handles on false claims.
- UD-G2. Chunk id join. The published context response does not put ids on `source_passages`. This plan cites only search `hit.id`, corroborated by `source_chunk_ids` when they match. If the known-passage fixture shows those id spaces differ, stop and replace the handle with an id knowledge-memory assigns at ingest. Do not cite raw passage strings.
- UD-G3. Source version required before a sentence counts as cited. This plan still cites the handle when `version_status` is `unresolved`, and sets `coverage.version_gap`. Professional-review may instead refuse approval until `source_version` is present. Knowledge-memory has to say whether every chunk can resolve to a source version in v1.
- UD-G4. OD-1. This plan accepts the matter-scoped brain. If knowledge-memory and firm-boundary reject it, drop the matter retrieval run and keep the same refusal rule for the brains that remain.
- UD-G5. Conflict detection beyond `temporal_conflicts`. v1 also treats two hits as a conflict when the drafter marks them incompatible and both ids are in the hit set. There is no separate deterministic contradiction checker. Add one only after a fixture shows missed conflicts or false conflicts.

## Task list

### T1. Draft revision schema

Description: Add the draft revision type the GUI and the approval record store, including sentences, citations, gaps, conflicts, coverage, and `client_delivery`.

Acceptance criteria: A valid revision round-trips through the schema. A rule, obligation, or conclusion sentence without a handle is rejected. A payload that includes a send or portal action is rejected. `client_delivery` accepts only `not_permitted`.

Verification: Schema tests cover a valid revision, a missing handle, and a rejected send field.

Dependencies: None.

Files likely touched: `app/draft/schema.ts`, `tests/draft/schema.test.ts`.

Estimated scope: M.

### T2. Retrieval router

Description: On each generation, call `/retrieve/context` and `/retrieve/search` on the firm brain, the jurisdiction brain, and the matter brain when the ticket has one. Call graph or product MCP only for a relationship or source-history ask, with the caps in this plan.

Acceptance criteria: A policy fixture records two calls per selected brain and no graph, MCP, recommend, or Docs MCP call. A relationship fixture records one graph or MCP branch and still stores no rule without a search-hit handle. A brain id present only in the ticket text is ignored.

Verification: Tests against a fake BrainAPI client assert the call list and the validated brain ids.

Dependencies: T1. Firm-boundary brain mapping. Knowledge-memory ready flag for the matter brain.

Files likely touched: `app/draft/retrieve.ts`, `tests/draft/retrieve.test.ts`.

Estimated scope: M.

### T3. Citation handle join

Description: Map each search hit to `brain:{brain_id}:chunk:{hit.id}` and attach that hit's snippet, rank, and channel. Corroborate with `source_chunk_ids` only when the id equals a hit id.

Acceptance criteria: The known hit id is the handle on the citation and on the sentence. A context passage with no matching hit id creates no citation. `score` is absent from the stored citation.

Verification: Unit test with one matching hit, one unmatched context passage, and one triple whose `source_chunk_ids` match the hit.

Dependencies: T1, T2.

Files likely touched: `app/draft/citations.ts`, `tests/draft/citations.test.ts`.

Estimated scope: M.

### T4. Refusal and conflict rewrite

Description: Before save, rewrite empty retrieval, conflicting sources, and any conclusion or firm obligation that lacks a valid handle into gap or conflict sentences. Keep jurisdiction text from being stored as a firm obligation.

Acceptance criteria: The empty fixture matches the empty-retrieval sentence and has no rule kind. The conflict fixture stores both handles and does not choose. A conclusion with no handle becomes the missing-authority gap. A firm-obligation sentence with only a jurisdiction handle becomes `missing_firm_obligation`, and the jurisdiction sentence can remain `retrieved_rule`.

Verification: Fixture tests for empty, conflict, uncited conclusion, and jurisdiction-only obligation.

Dependencies: T3.

Files likely touched: `app/draft/refuse.ts`, `tests/draft/refuse.test.ts`.

Estimated scope: M.

### T5. Immutable revision store

Description: Insert each generation as a new revision in the application database. A repeated regenerate token returns the same revision and does not call retrieval again.

Acceptance criteria: Two different tokens create two revisions, and the first revision's `body_text` and handles stay as first stored. The same token returns the first revision. The stored row's `client_delivery` is `not_permitted`.

Verification: Repository test using a temporary database or an in-memory store with the same interface.

Dependencies: T1. Ticket id from ticket-desk.

Files likely touched: `app/draft/store.ts`, `tests/draft/store.test.ts`.

Estimated scope: S.

### T6. Failed search and pending ingest

Description: Map search HTTP 404 and brain errors to `failed` or `partial` without a rule sentence. Map an unfinished matter ingest task to `ingest_pending`.

Acceptance criteria: A 404 on search yields `search_unavailable`, no rule sentence, and no second search attempt. A conclusion ticket with a pending matter task yields `failed` and `ingest_pending`. A status ticket with a failed jurisdiction call can keep ticket-fact sentences and `outcome: partial`.

Verification: Fake-client tests for 404, jurisdiction error, and ingest pending.

Dependencies: T2, T4. Knowledge-memory task status.

Files likely touched: `app/draft/retrieve.ts`, `app/draft/refuse.ts`, `tests/draft/failures.test.ts`.

Estimated scope: S.

### T7. Draft logs

Description: Log identifiers, brain role, surface, counts, latency, and outcome for each revision.

Acceptance criteria: The log line for the known-passage fixture includes `draft_id`, `brain_role`, and `outcome`. It excludes the fixture snippet, the ticket ask, and any credential.

Verification: Logger spy on the known-passage path.

Dependencies: T2, T5.

Files likely touched: `app/draft/log.ts`, `tests/draft/log.test.ts`.

Estimated scope: S.

### T8. Fixture validation for a known passage and an empty corpus

Description: Run the full draft path on a fixture ticket whose search hit is a known passage, and on a fixture ticket with no supporting passage.

Acceptance criteria: The known-passage draft cites `brain:{jurisdictionBrainId}:chunk:chunk-vat-threshold`, the citation snippet equals the fixture passage, and the body does not state an additional rule. The empty draft has `outcome: unsupported`, the empty-retrieval refusal sentence, no rule-bearing sentence, and `client_delivery: not_permitted`.

Verification: `tests/draft/fixtures.test.ts` runs both fixtures through the fake client. The test does not call a live brain.

Dependencies: T2, T3, T4, T5.

Files likely touched: `app/draft/fixtures/known-passage.json`, `app/draft/fixtures/no-passage.json`, `tests/draft/fixtures.test.ts`.

Estimated scope: M.
