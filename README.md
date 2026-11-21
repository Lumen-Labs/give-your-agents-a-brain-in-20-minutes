# Give your agents a brain in 20 minutes

A staff desk that drafts a cited reply from official California and San Francisco text, then waits for a person to approve it. Nothing in this demo is sent to a client.

Try it: [reply-desk.d.brain-api.dev](https://reply-desk.d.brain-api.dev)

Ask something a small business would actually ask. “Do I charge California sales tax?” “What does San Francisco require to register a business?” “What is the statewide minimum wage?” The desk retrieves the official passage, shows it beside the draft, and leaves the reply unsent until someone approves it. A question the memory cannot support stays unsupported. That draft cannot be approved.

## What this shows

An agent with a longer prompt still forgets the document the moment the chat ends. This desk keeps three separate memories:

| Memory | What it holds |
| --- | --- |
| `firmdesk` | One firm policy, so the desk can tell a house rule from the statute |
| `jdemolocal` | A fictional local rule, so the demo can show a source that is not official law |
| `jursfca` | 74 official California and San Francisco sections, saved in 142 parts |

The official memory covers business formation, California tax, San Francisco tax, employment, licensing, privacy, commercial contracts, and local business rules. Every section comes from a government host: the Legislature, the Franchise Tax Board, CDTFA, the Secretary of State, the Labor Commissioner, the Attorney General, sf.gov, the Treasurer, and the Office of Labor Standards Enforcement. The loader refuses any other host. If a live page challenges the script, it uses the official copy saved in this repo on 18 November 2026. It never fills a gap with generated statutory text.

Ingestion is the model step. Claude Haiku 5.5 on Amazon Bedrock reads each section into the brain. Embeddings stay local (`nomic-embed-text`, 768 dimensions) so the memory can be searched without sending the corpus to an embedding API. When someone asks a question, the draft is built from the retrieved passages and their citations. The model is not asked to invent the answer at request time.

## What a person sees

The desk is a two-pane reply queue.

- Example questions are one click away.
- The draft and the source passages sit side by side.
- Each passage keeps its citation, jurisdiction, and link back to the official page.
- Approval is a human action. The copied reply says it has not been sent.
- Documents are grouped by statute, with filters for California, San Francisco, and firm policy.

On the public demo, visitors cannot upload documents, and each IP is rate limited. That keeps the shared machine available. A local checkout still accepts documents.

## Run it locally

You need Node 22, a BrainAPI checkout in lightweight mode, Postgres with pgvector, Redis, Ollama with `nomic-embed-text`, and an AWS login that can call Bedrock in `us-east-1`.

```sh
python3 bin/brain-light.py
BRAINAPI_URL=http://127.0.0.1:8010 npm start
```

Open http://localhost:4173.

`bin/brain-light.py` starts the BrainAPI checkout at `~/.brainapi/source` on port 8010. It points both LLM steps at `us.anthropic.claude-haiku-5-5` and leaves embeddings on Ollama. It reads the AWS login profile `brain-api-root` and does not write that profile’s keys into this repo. The desk reads `BRAINPAT_TOKEN` from the environment or from `~/.brainapi/source/.env`.

Load the official corpus after the brain is up:

```sh
BRAINAPI_URL=http://127.0.0.1:8010 \
  JURISDICTION_ID=sanfrancisco \
  JURISDICTION_BRAIN_ID=jursfca \
  npm start
```

In another terminal:

```sh
BRAINAPI_URL=http://127.0.0.1:8010 node bin/load-jurisdiction.mjs
```

`node bin/load-jurisdiction.mjs --dry-run` prints the 74 titles and URLs and writes nothing. Running the loader again skips titles that are already stored.

```sh
node bin/corpus-report.mjs
node --test test/*.test.mjs
```

The report lands in `docs/corpus-coverage.md`. The tests include 30 evaluation questions: questions with one source, questions that need more than one, exceptions, and questions the corpus should refuse.

## What this is

Reply desk is a showcase of a staff workflow: official sources in, a cited draft out, a person in the middle. It is a demonstration of [BrainAPI](https://github.com/Lumen-Labs/brainapi2) as a memory for an agent. It is not a law firm, and a draft on this desk is not advice.
