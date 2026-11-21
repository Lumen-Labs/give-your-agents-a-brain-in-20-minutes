# California and San Francisco corpus coverage

Retrieved on 2026-11-18. This report counts saved official text. A source count is not legal completeness.

## Counts

- Manifest entries: 74
- Saved pages that extract: 74
- Failed extraction: 0
- Ingested into the desk: 13
- Skipped at load: 41
- Not attempted after the load stopped: 20
- Extracted characters: 600,989
- Token estimate (characters / 4): 150,247
- Chunks at the current section boundary: 140
- Duplicate extracted texts: 0
- Missing citation or official URL: 0
- Missing effective date or version: 74

No separate tokenizer is installed. The token figure is characters divided by four.

## Category coverage

| Category | Sources |
| --- | ---: |
| Business formation | 12 |
| California taxation | 18 |
| San Francisco taxation | 9 |
| Employment law | 14 |
| Licensing and permits | 4 |
| Privacy and consumer protection | 7 |
| Commercial contracts | 6 |
| Local business regulations | 4 |

## Scenario coverage

A scenario is inventoried when every required source is in the manifest and its page extracts. Inventory is not a tested answer.

| Scenario | Required sources | Extracted |
| --- | ---: | --- |
| Starting an LLC in San Francisco | 12 | yes (12) |
| A question that needs more than one source | 5 | yes (5) |
| Registering a business with San Francisco | 4 | yes (4) |
| Permits to operate a business | 5 | yes (5) |
| California LLC annual taxes and additional fees | 12 | yes (12) |
| California sales-tax obligations | 6 | yes (6) |
| California rules and additional San Francisco rules | 7 | yes (7) |
| California use-tax obligations | 3 | yes (3) |
| Exemptions and exceptions | 7 | yes (7) |
| San Francisco gross receipts tax | 6 | yes (6) |
| Minimum wage and overtime | 7 | yes (7) |
| Hiring a first employee in San Francisco | 10 | yes (10) |
| Employee versus contractor classification | 2 | yes (2) |
| California privacy obligations | 7 | yes (7) |
| Commercial contract enforceability | 6 | yes (6) |

## What a supported question can use

25 evaluation questions have at least one retrieved official source. 5 are out of scope and must stay unsupported.

The desk can show a cited passage for the supported questions in `corpus/san-francisco/eval.json`. It cannot answer the unsupported questions from this corpus:

- What is the San Francisco mansion transfer tax rate?
- How do I renew a dog license in Oregon?
- What is the federal income tax bracket for 2026?
- What New York City unincorporated business tax applies?
- What is the patent term for a software invention?

## Gaps

- Revenue and Taxation Code sections 6203 and 6010 were not saved. The legislature page did not expose those section headings to the extractor, and no substitute text was written.
- San Francisco zoning and the general business-permit pages on sf.gov returned 404. Physical-permit and zoning questions are not covered.
- The San Francisco Business and Tax Regulations Code itself is not in the corpus. The Treasurer pages are agency guidance and are labeled `guidance`, not statutes.
- The 2025 LLC tax booklet was downloaded and then left out. Publication 3556 is the filing guide that was kept.
- A CDTFA publication PDF returned HTTP 406, and a courts.ca.gov sample PDF returned 404. No commercial publisher was used in their place.
- Most entries have no effective date. The report does not invent one.
- Chat steps use Bedrock Claude Haiku 5.5. Embeddings stay on local nomic at 768 dimensions so the existing `jursfca` vectors remain valid. That embedding model accepts about 2,048 tokens, so long statutes are split into parts of about 6,000 characters at subsection, paragraph, or sentence boundaries. The parts stay tied to the same document id, citation, and URL. The desk's second ranking pass is deterministic word overlap plus citation matching.
- A question that shares only generic business words can still miss the governing statute unless it names the code section. The evaluation set records the questions that currently retrieve the expected sources.
- Ingestion into the brain calls Haiku for each part. The `brain-api-root` session token expired during the load, so later parts were not stored. Refresh that AWS session, restart `python3 bin/brain-light.py`, and run the loader again. Titles already stored are skipped.

## Load

- skipped ca-corp-statement: Bedrock session token expired before this part was stored.
- skipped sos-statements: Bedrock session token expired before this part was stored.
- skipped ca-llc-statement: Bedrock session token expired before this part was stored.
- skipped ca-minimum-franchise: Bedrock session token expired before this part was stored.
- skipped sos-tax-info: Bedrock session token expired before this part was stored.
- skipped ca-llc-management: Bedrock session token expired before this part was stored.
- skipped ca-sellers-permit: Bedrock session token expired before this part was stored.
- skipped ca-llc-fee: Bedrock session token expired before this part was stored.
- skipped ca-gross-receipts-definition: Bedrock session token expired before this part was stored.
- skipped ftb-single-member: Bedrock session token expired before this part was stored.
- skipped ftb-llc: Bedrock session token expired before this part was stored.
- skipped ftb-llc-corp: Bedrock session token expired before this part was stored.
- skipped ftb-corp: Bedrock session token expired before this part was stored.
- skipped ftb-s-corp: Bedrock session token expired before this part was stored.
- skipped ftb-3556: Bedrock session token expired before this part was stored.
- skipped ftb-c-corp: Bedrock session token expired before this part was stored.
- skipped ftb-1060: Bedrock session token expired before this part was stored.
- skipped cdtfa-rates: Bedrock session token expired before this part was stored.
- skipped cdtfa-use-tax: Bedrock session token expired before this part was stored.
- skipped cdtfa-district: Bedrock session token expired before this part was stored.
- skipped cdtfa-sut: Bedrock session token expired before this part was stored.
- skipped sf-renew-registration: Bedrock session token expired before this part was stored.
- skipped sf-first-year-free: Bedrock session token expired before this part was stored.
- skipped sf-business-taxes: Bedrock session token expired before this part was stored.
- skipped sf-commercial-rents: Bedrock session token expired before this part was stored.
- skipped sf-homelessness-gr: Bedrock session token expired before this part was stored.
- skipped sf-overpaid-executive: Bedrock session token expired before this part was stored.
- skipped sf-admin-office-tax: Bedrock session token expired before this part was stored.
- skipped ca-overtime: Bedrock session token expired before this part was stored.
- skipped ca-minimum-wage: Bedrock session token expired before this part was stored.
- skipped ca-paid-sick: Bedrock session token expired before this part was stored.
- skipped ca-classification: Bedrock session token expired before this part was stored.
- skipped ca-wage-statement: Bedrock session token expired before this part was stored.
- skipped ca-exempt-employee: Bedrock session token expired before this part was stored.
- skipped ca-meal-period: Bedrock session token expired before this part was stored.
- skipped dir-minimum-wage: Bedrock session token expired before this part was stored.
- skipped dir-overtime: Bedrock session token expired before this part was stored.
- skipped dir-overtime-exceptions: Bedrock session token expired before this part was stored.
- skipped dir-contractor: Bedrock session token expired before this part was stored.
- skipped dir-paid-sick: Bedrock session token expired before this part was stored.
- skipped dir-fast-food: Bedrock session token expired before this part was stored.
- 20 sections were not attempted after the Bedrock session expired.

