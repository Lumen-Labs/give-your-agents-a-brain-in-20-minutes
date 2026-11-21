# Building a BrainAPI reply desk for accountants

This edited conversation follows the project from the first product brief to the public demo.

## User

Let's create an agent GUI to help accountants handle client support tickets about firm policies, documents, and local regulations. Research comparable products, then split the project into major areas and assign one planning agent to each.

## Assistant

TaxDome, Karbon, and Canopy cover practice management, while products such as CoCounsel Tax and Blue J cover tax research. The proposed desk brings the client question, the firm's own documents, and the applicable rules together in one review screen.

The six planning areas are ticket lifecycle, firm and regulatory memory, cited drafts, the staff workspace, professional review, and separation of firm and client data.

A staff member pastes a question, reviews a draft grounded in BrainAPI, and opens the citations beside it. The design separates three kinds of memory: firm policies and playbooks, official sources for the relevant jurisdiction, and documents for the individual client engagement. If a draft makes a claim the available sources do not support, approval stays disabled. An approved reply can be copied or downloaded for the staff member to send.

## User

Use the lightweight BrainAPI setup and kick-start the project.

## Assistant

The first version runs on BrainAPI's lightweight text ingestion and retrieval pipeline. A sample firm policy and a fictional local rule let us test the workflow from question through draft, review, approval, and copy.

## User

Add local file saving without using BrainAPI Docparser, and make the interface easy to use for someone who isn't technical.

## Assistant

The desk saves the original file locally and sends the extracted words to BrainAPI as plain text. It can read text files, Word documents, and PDFs with selectable text. Scanned PDFs need a text version before they can be indexed.

The interface gives staff a single place to ask a question, review the draft, and open the supporting documents.

## User

Autofill the brain with San Francisco and California regulations and laws for the demo.

## Assistant

The first corpus has six official sources covering California sales tax, use tax, corporation franchise tax, and LLC annual tax, plus San Francisco business registration and gross receipts tax. Each source retains the official URL and retrieval date. The fictional local rule stays out of this jurisdiction's collection.

- “Does a California retailer owe sales tax on a retail sale?” cites the California Legislature's sales-tax provision.
- “What San Francisco tax applies to gross receipts?” cites the San Francisco Treasurer's gross receipts tax page.
- “What is the mansion transfer tax rate?” stays unsupported in the demo, with approval disabled.

## User

Use Claude Haiku through Amazon Bedrock for the language-model steps. Expand the starter corpus into a California and San Francisco business-law collection that can answer realistic follow-up questions and show how multiple sources work together.

Cover business formation, California tax, San Francisco tax, employment, licensing and permits, privacy and consumer protection, commercial contracts, and local business regulations. Include definitions, exceptions, and cross-references where they matter. Preserve the original text, distinguish statutes from agency guidance, and attach an official citation and URL to every source.

Build an evaluation set that includes single-source questions, questions that need several provisions, jurisdiction differences and exceptions, and questions the corpus cannot answer.

## Assistant

The source inventory covers all eight categories and maps to 15 research scenarios, including starting an LLC in San Francisco, hiring a first employee, and comparing statewide requirements with local obligations. It draws on official sources such as the California Legislature, the Franchise Tax Board, the California Department of Tax and Fee Administration, and the San Francisco Treasurer.

Long texts are split at section, subsection, or paragraph boundaries. Each part retains its document identity, legal citation, jurisdiction, and official URL. Retrieval prioritizes named code sections and matching source titles. The sales-tax example cites California Revenue and Taxation Code section 6051.

The test suite includes 30 evaluation questions. Unsupported questions stay flagged, and copying a draft still requires human approval.

## User

Improve the interface while the sources are loading.

## Assistant

The Replies view now has a list and a detail pane, with filters for replies to review, replies that need a document, and approved replies. The draft links each citation to its source and the official page. The review bar keeps Approve and Copy visible and shows that the desk hasn't sent the reply.

The Documents view groups parts under their parent source and supports search and jurisdiction filters. On mobile, the reply list and the open reply use separate screens. The interface also has visible keyboard focus and reduced-motion support.

## User

Deploy the desk as a public demo. Add rate limiting and disable document uploads on the public version. Once the corpus is complete, publish the code and a showcase README under Lumen Labs.

## Assistant

The finished demo includes 74 official California and San Francisco sources stored in 142 parts. Visitors can browse the saved documents, ask a question, and inspect the sources behind a draft. Public requests are rate-limited and the public document library is read-only.

- [Open the public reply desk](https://reply-desk.d.brain-api.dev)
- [Browse the Lumen Labs showcase repository](https://github.com/Lumen-Labs/give-your-agents-a-brain-in-20-minutes)
- [Read the BrainAPI documentation](https://brainapi.lumen-labs.ai/docs/llms.txt)
