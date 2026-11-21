# Authoritative brief: Accountant Agent Desk

Status: coordinator decision. Planning specialists must treat this file as authoritative input. They may challenge a decision only inside their own `alternatives` and `unresolved decisions` sections. They must not edit this file.

## Product

Accountants receive client tickets about firm policies, engagement documents, and legal or regulatory questions. The product is a staff-facing agent GUI that prepares a cited draft reply from the firm’s own material and a jurisdiction-scoped regulation memory. A qualified person at the firm approves the reply before the client can see it.

Working name: Accountant Agent Desk.

The memory layer is BrainAPI v2 ([developer index](https://brainapi.lumen-labs.ai/docs/llms.txt)). BrainAPI is not the ticket system of record, not a web search engine, and not a substitute for a licensed research publisher.

## Users and jobs

Primary user: an accountant, tax adviser, or reviewer inside a firm who must answer a client about a policy, a document, or a local rule.

Jobs to support in v1:

1. See a queue of client tickets and open one.
2. See the jurisdiction, the ask, the missing facts, and the attached documents.
3. Read a draft that cites firm documents and regulation passages.
4. Edit, reject, request more facts, or approve the draft.
5. Keep a record of who approved which text against which source versions.

Out of scope for v1:

- Filing returns, posting journals, or preparing workpapers.
- Sending the reply automatically, or giving the client a chatbot.
- Replacing Checkpoint, CCH, DATEV LEXinform, Haufe, NWB, or any other licensed publisher.
- Ingesting paywalled or unlicensed corpora.
- A marketplace of regulations maintained by us for every country.

Jurisdiction is data. A ticket, a source, and a reviewer’s qualification each carry a jurisdiction. The first build must not hard-code one country.

## Market gap

Current products cover a neighboring job and stop before this one.

| Lane | Products | What they already do | What they do not do |
| --- | --- | --- | --- |
| Practice queue and portal | TaxDome, Karbon, Canopy, Financial Cents, MyPract, Soraban Collect | Client portal, email, tasks, document chasing. AI is mostly email drafts, file renaming, notice matching, or confirmed record edits. | A cited answer that joins the firm’s policy with a local regulation and waits for sign-off. |
| Tax and legal research | Thomson Reuters CoCounsel Tax on Checkpoint, Blue J, CCH AnswerConnect; in Germany DATEV Copilot with LEXinform, Deubner Tax KI, Haufe, NWB, juris | Cited research inside a publisher corpus. CoCounsel can also read an uploaded client document. | The firm’s ticket queue, the firm’s own policies, and a review record tied to that ticket. |
| Legal workspaces | Harvey, Spellbook, Lexis+ Protégé, Luminance, Fieldguide | Cited document Q&A, playbooks, diligence, audit-request chat. Fieldguide tells users the model is not a substitute for judgment. | An accountant’s inbound policy and regulation desk. |
| Close and filing agents | Basis, Truewind | First-pass close, tax workpapers, citations on the work product. | Inbound client questions about policy and legal text. |

Sources for that map are listed at the end of this brief. Vendor claims about accuracy, “80% automated,” and training opt-out are claims, not measured results for this product.

## Professional constraints

These bind every plan.

- The model output is a draft. A qualified person reviews facts, citations, and calculations before anything reaches a client or a filing. [IRS introductory guidelines, Issue 2026-19](https://www.irs.gov/pub/opr-taxpros/issue-number-2026-19-introductory-guidelines-for-responsible-ai-use-in-federal-tax-practice.pdf); [TPB(GS) 55/2026](https://www.tpb.gov.au/tpbgs-552026-use-artificial-intelligence-and-code-professional-conduct); [ICAEW on AI and complaints](https://www.icaew.com/technical/practice-resources/practice-news/ai-and-complaints-keeping-the-process-human-proportionate-and-professional).
- Client information goes to a third-party model only under the firm’s own authority to do so. Australian tax practitioners need client permission before disclosure to a third party, which can include an AI tool. [TPB(GS) 55/2026](https://www.tpb.gov.au/tpbgs-552026-use-artificial-intelligence-and-code-professional-conduct). German commentary treats an external AI vendor as a service provider that needs a confidentiality undertaking, not only a GDPR processing agreement, and forbids putting client matters into public chat tools. [Deubner, KI für Steuerberater 2026](https://www.deubner-steuern.de/themen/digitalisierung-steuerberatung/ki/); [BStBK FAQ via Haufe, section 9.3](https://www.haufe.de/id/beitrag/ki-im-steuerberatenden-berufsstand-faq-katalog-der-bstbk-93-was-muss-beachtet-werden-wenn-die-kanzlei-ki-systeme-gemeinsam-mit-dem-mandanten-nutzt-HI17138225.html).
- The firm keeps the professional judgment. Shared AI with a client needs a written role split: the client supplies facts, the firm decides. [BStBK FAQ via Haufe](https://www.haufe.de/id/beitrag/ki-im-steuerberatenden-berufsstand-faq-katalog-der-bstbk-93-was-muss-beachtet-werden-wenn-die-kanzlei-ki-systeme-gemeinsam-mit-dem-mandanten-nutzt-HI17138225.html).
- If a later release lets a client talk to the system, the client must be able to tell that the speaker is a system and must be able to reach a person. The Hessian chamber handout dated 28 July 2026 states that EU AI Act transparency duties, including Article 50, apply from 2 August 2026, and that Annex III high-risk dates were deferred. [StBK Hessen handout (PDF)](https://www.stbk-hessen.de/fileadmin/customer/1b._Berufspraxis/Handreichung_KI_Steuerberatung_Recht_Stand_2026-07-28.pdf). v1 has no client-facing agent, so this is a constraint on later work, not a v1 screen.
- Status and document-chase replies are a different risk class from a legal conclusion. A German vendor portal describes answering “what is still missing?” automatically and handing tax judgment to a person. [Flowagenten](https://flowagenten.com/steuerberatung-mandantenportal/). v1 still does not auto-send either class.

## BrainAPI constraints

Use v2. Prefer the smallest surface that produces the needed output. [Choose a path](https://brainapi.lumen-labs.ai/docs/v2/use-cases.md).

- Ingest text, files, public URLs, or structured triples. Text and structured calls return HTTP 202 and a `task_id`. Poll `GET /tasks/{id}` before reading. [Ingestion](https://brainapi.lumen-labs.ai/docs/v2/ingestion.md).
- `POST /retrieve/context` grounds one model call with passages, triples, and history. `POST /retrieve/search` is for the ranked source panel. Graph APIs and the product MCP are for a known traversal or a multi-step investigation, not the default answer. [Retrieval](https://brainapi.lumen-labs.ai/docs/v2/retrieval.md).
- Search needs PostgreSQL and `SEARCH_ENABLED=true`. The Explore API is only on the NetworkX PostgreSQL graph backend.
- A brain is the data boundary. Send `X-Brain-ID` on every data call. Application code uses a brain-scoped PAT. The system PAT stays in a trusted operator path. Brain IDs are alphanumeric and start with a letter. Do not use the `system` brain for product data. Validate the tenant-to-brain mapping in our app before forwarding a brain id. [Brains and auth](https://brainapi.lumen-labs.ai/docs/v2/brains-and-auth.md).
- Product MCP reads include `search_memory`, `traverse_graph`, changelogs, and `list_source_versions`. [Product MCP](https://brainapi.lumen-labs.ai/docs/v2/agentic/MCP.md).
- URL ingest accepts a public `https` URL and returns cleaned page JSON. It is not a license to crawl a publisher.

## Locked v1 decisions

1. Staff GUI only. Inbound fixture is a pasted ticket plus file upload. Live TaxDome, Karbon, Canopy, or DATEV sync is a seam, not a v1 build.
2. Two memories, plus an open client-document question. Firm brain: policies, engagement templates, playbooks, approved answer patterns with client identifiers removed. Jurisdiction brain: documents the firm is allowed to store for that jurisdiction. One brain per jurisdiction id, not one brain per country-and-topic matrix until volume requires it.
3. Open decision OD-1, owned jointly by knowledge-memory and firm-boundary: where a client’s uploaded documents live. Recommended default: a matter-scoped brain created for the engagement, ingested asynchronously, cleared when the retention rule says so. The application database remains the system of record for the ticket, the approval, and the file bytes. Specialists must accept this default or reject it with an alternative.
4. The drafter calls `/retrieve/context` on the firm brain and the relevant jurisdiction brain, and on the matter brain if OD-1 lands there. The GUI source list uses `/retrieve/search` so order and snippets are stable. Escalate to graph or MCP only for “how is this entity related?” questions.
5. Every draft sentence that states a rule or a firm obligation carries a source handle the reviewer can open. If retrieval is empty or conflicting, the draft says what is missing and does not invent a rule.
6. Approve, edit, and reject are recorded events. v1 export is copy or download. It does not call an email API.
7. BrainAPI anonymous demo and Docs MCP are for development against public docs only. Customer material uses an authenticated brain.

## Macro areas

| Id | Subagent | Plan file | Owns | Does not own |
| --- | --- | --- | --- | --- |
| PLAN-1 | `ticket-desk` | `docs/plans/ticket-desk.md` | Ticket lifecycle, classification, missing facts, assignment, escalation states | Pixels, retrieval, auth |
| PLAN-2 | `knowledge-memory` | `docs/plans/knowledge-memory.md` | Brain topology, ingestion, versions, freshness, source identity | Ticket states, screen layout |
| PLAN-3 | `grounded-response` | `docs/plans/grounded-response.md` | Draft contract, citation handles, refusal, when to use context vs search vs graph | Queue UX, PAT storage |
| PLAN-4 | `accountant-gui` | `docs/plans/accountant-gui.md` | Staff screens: queue, ticket, draft, sources, approve | Answer algorithm, brain creation |
| PLAN-5 | `professional-review` | `docs/plans/professional-review.md` | Who may approve, audit record, consent flag, retention, disclosure copy | Visual design, BrainAPI indexing |
| PLAN-6 | `firm-boundary` | `docs/plans/firm-boundary.md` | Tenant, brain mapping, secret placement, future practice-system seam | Draft wording, screen layout |

## Sources

- [BrainAPI llms.txt](https://brainapi.lumen-labs.ai/docs/llms.txt)
- [BrainAPI use cases](https://brainapi.lumen-labs.ai/docs/v2/use-cases.md)
- [BrainAPI retrieval](https://brainapi.lumen-labs.ai/docs/v2/retrieval.md)
- [BrainAPI ingestion](https://brainapi.lumen-labs.ai/docs/v2/ingestion.md)
- [BrainAPI product MCP](https://brainapi.lumen-labs.ai/docs/v2/agentic/MCP.md)
- [BrainAPI brains and auth](https://brainapi.lumen-labs.ai/docs/v2/brains-and-auth.md)
- [IRS Issue 2026-19, introductory guidelines for responsible AI in federal tax practice (PDF)](https://www.irs.gov/pub/opr-taxpros/issue-number-2026-19-introductory-guidelines-for-responsible-ai-use-in-federal-tax-practice.pdf)
- [TPB(GS) 55/2026](https://www.tpb.gov.au/tpbgs-552026-use-artificial-intelligence-and-code-professional-conduct)
- [ICAEW, AI and complaints](https://www.icaew.com/technical/practice-resources/practice-news/ai-and-complaints-keeping-the-process-human-proportionate-and-professional)
- [BStBK FAQ 9.3 via Haufe](https://www.haufe.de/id/beitrag/ki-im-steuerberatenden-berufsstand-faq-katalog-der-bstbk-93-was-muss-beachtet-werden-wenn-die-kanzlei-ki-systeme-gemeinsam-mit-dem-mandanten-nutzt-HI17138225.html)
- [StBK Hessen, KI in der Steuerberatung, stand 2026-07-28 (PDF)](https://www.stbk-hessen.de/fileadmin/customer/1b._Berufspraxis/Handreichung_KI_Steuerberatung_Recht_Stand_2026-07-28.pdf)
- [Deubner, KI für Steuerberater 2026](https://www.deubner-steuern.de/themen/digitalisierung-steuerberatung/ki/)
- [DATEV Copilot](https://www.datev.de/web/de/berufsgruppenuebergreifend/mydatev/cloud-anwendungen/datev-copilot)
- [Flowagenten, Mandanten-Statusportal](https://flowagenten.com/steuerberatung-mandantenportal/)
- [Thomson Reuters, how to choose an AI tax research tool](https://tax.thomsonreuters.com/blog/how-to-choose-the-best-ai-tax-research-tool/)
- [The Crossing Report, CoCounsel Tax vs Blue J vs Checkpoint Edge, 2026](https://crossing.one/blog/cocounsel-tax-vs-blue-j-vs-checkpoint-edge-ai-cpa-firms-2026)
- [r/taxpros, Blue J vs CoCounsel](https://www.reddit.com/r/taxpros/comments/1vmkj3j/bluej_vs_cocouncil_what_is_the_better_ai_tax/)
- [MyPract, AI practice management software for accountants](https://www.mypract.com/blog/best-ai-practice-management-software-for-accountants)
- [PCStacks, TaxDome, Canopy, and Karbon compared](https://www.pcstacks.com/7-tax-practice-management-platforms-compared-taxdome-canopy-and-karbon-for-client-portals-document-collection-and-tax-workflow-automation/)
- [KUMO, Karbon vs TaxDome vs Canopy costs, read 11 Nov 2026](https://www.kumohq.co/blog/karbon-vs-taxdome-vs-canopy-vs-custom-accounting-firm-client-onboarding-2026)
- [Harvey FAQ](https://help.harvey.ai/articles/harvey-faq)
- [Spellbook, Harvey vs LexisNexis](https://spellbook.com/learn/harvey-vs-lexisnexis)
- [Fieldguide AI-native platform](https://www.fieldguide.com/products/platform/overview)
- [Fieldguide, AI chat for requests](https://help.fieldguide.io/en/articles/9370104-ai-chat-for-requests)
- [Basis for Tax](https://www.getbasis.ai/solutions/tax)
- [Truewind vs Basis, compared 12 Nov 2026](https://www.truewind.ai/compare/basis)
- [Soraban Collect](https://www.soraban.com/products/collect)
- [PGH Networks, customer-facing chatbot for accounting firms](https://pghnetworks.com/blog/customer-facing-ai-chatbot-accounting-firms/)
- [Contextric, AI policy clause for accountants](https://contextric.com/guides/ai-policy-for-accountants/)
