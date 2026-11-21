import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { htmlToText, prepareOfficialText } from "../src/official-text.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const corpusDir = join(root, "corpus", "san-francisco");
const manifest = JSON.parse(readFileSync(join(corpusDir, "manifest.json"), "utf8"));
const scenarios = JSON.parse(readFileSync(join(corpusDir, "scenarios.json"), "utf8"));
const questions = JSON.parse(readFileSync(join(corpusDir, "eval.json"), "utf8"));
const loadPath = join(corpusDir, "load-results.json");
const load = existsSync(loadPath) ? JSON.parse(readFileSync(loadPath, "utf8")) : null;

const categoryNames = {
  formation: "Business formation",
  taxation: "California taxation",
  "sf-taxation": "San Francisco taxation",
  employment: "Employment law",
  licensing: "Licensing and permits",
  privacy: "Privacy and consumer protection",
  contracts: "Commercial contracts",
  local: "Local business regulations",
};

const rows = [];
const hashes = new Map();
let characters = 0;
let chunks = 0;

for (const entry of manifest.sections) {
  const pagePath = join(corpusDir, entry.page);
  const html = existsSync(pagePath) ? readFileSync(pagePath, "utf8") : "";
  let text = "";
  let parts = 0;
  let error = "";
  try {
    const prepared = prepareOfficialText({
      url: entry.source_url,
      html,
      title: entry.title,
      retrievedOn: entry.retrieved_at,
      entry,
    });
    text = prepared.chunks.map((chunk) => chunk.text).join("\n");
    parts = prepared.chunks.length;
  } catch (cause) {
    error = cause.message;
    text = html ? htmlToText(html) : "";
  }
  const hash = createHash("sha256").update(text).digest("hex");
  if (!hashes.has(hash)) hashes.set(hash, []);
  hashes.get(hash).push(entry.id);
  characters += text.length;
  chunks += parts;
  rows.push({ ...entry, characters: text.length, chunks: parts, error, hash });
}

const byCategory = {};
for (const row of rows) byCategory[row.category] = (byCategory[row.category] || 0) + 1;
const duplicates = [...hashes.values()].filter((ids) => ids.length > 1);
const missingCitation = rows.filter((row) => !row.citation || !row.source_url);
const missingVersion = rows.filter((row) => !row.effective_date);
const failed = rows.filter((row) => row.error);
const loaded = new Map((load?.results || []).map((row) => [row.id, row.status]));
const ingested = rows.filter((row) => loaded.get(row.id) === "saved" || loaded.get(row.id) === "already stored");
const skipped = rows.filter((row) => loaded.get(row.id) === "skipped");
const notAttempted = rows.filter((row) => loaded.get(row.id) === "not attempted");

const lines = [];
lines.push("# California and San Francisco corpus coverage");
lines.push("");
lines.push(`Retrieved on ${manifest.retrievedOn}. This report counts saved official text. A source count is not legal completeness.`);
lines.push("");
lines.push("## Counts");
lines.push("");
lines.push(`- Manifest entries: ${rows.length}`);
lines.push(`- Saved pages that extract: ${rows.length - failed.length}`);
lines.push(`- Failed extraction: ${failed.length}`);
lines.push(`- Ingested into the desk: ${load ? ingested.length : "not loaded yet"}`);
lines.push(`- Skipped at load: ${load ? skipped.length : "not loaded yet"}`);
lines.push(`- Not attempted after the load stopped: ${load ? notAttempted.length : "not loaded yet"}`);
lines.push(`- Extracted characters: ${characters.toLocaleString("en-US")}`);
lines.push(`- Token estimate (characters / 4): ${Math.round(characters / 4).toLocaleString("en-US")}`);
lines.push(`- Chunks at the current section boundary: ${chunks}`);
lines.push(`- Duplicate extracted texts: ${duplicates.length}`);
lines.push(`- Missing citation or official URL: ${missingCitation.length}`);
lines.push(`- Missing effective date or version: ${missingVersion.length}`);
lines.push("");
lines.push("No separate tokenizer is installed. The token figure is characters divided by four.");
lines.push("");
lines.push("## Category coverage");
lines.push("");
lines.push("| Category | Sources |");
lines.push("| --- | ---: |");
for (const [key, label] of Object.entries(categoryNames)) {
  lines.push(`| ${label} | ${byCategory[key] || 0} |`);
}
lines.push("");
lines.push("## Scenario coverage");
lines.push("");
lines.push("A scenario is inventoried when every required source is in the manifest and its page extracts. Inventory is not a tested answer.");
lines.push("");
lines.push("| Scenario | Required sources | Extracted |");
lines.push("| --- | ---: | --- |");
for (const scenario of scenarios) {
  const present = scenario.required_source_ids.filter((id) => rows.some((row) => row.id === id && !row.error));
  const ready = present.length === scenario.required_source_ids.length ? "yes" : "gap";
  lines.push(`| ${scenario.title} | ${scenario.required_source_ids.length} | ${ready} (${present.length}) |`);
}
lines.push("");
lines.push("## What a supported question can use");
lines.push("");
const supported = questions.filter((item) => item.expected_status === "supported");
const unsupported = questions.filter((item) => item.expected_status === "unsupported");
lines.push(`${supported.length} evaluation questions have at least one retrieved official source. ${unsupported.length} are out of scope and must stay unsupported.`);
lines.push("");
lines.push("The desk can show a cited passage for the supported questions in `corpus/san-francisco/eval.json`. It cannot answer the unsupported questions from this corpus:");
lines.push("");
for (const item of unsupported) lines.push(`- ${item.question}`);
lines.push("");
lines.push("## Gaps");
lines.push("");
lines.push("- Revenue and Taxation Code sections 6203 and 6010 were not saved. The legislature page did not expose those section headings to the extractor, and no substitute text was written.");
lines.push("- San Francisco zoning and the general business-permit pages on sf.gov returned 404. Physical-permit and zoning questions are not covered.");
lines.push("- The San Francisco Business and Tax Regulations Code itself is not in the corpus. The Treasurer pages are agency guidance and are labeled `guidance`, not statutes.");
lines.push("- The 2025 LLC tax booklet was downloaded and then left out. Publication 3556 is the filing guide that was kept.");
lines.push("- A CDTFA publication PDF returned HTTP 406, and a courts.ca.gov sample PDF returned 404. No commercial publisher was used in their place.");
lines.push("- Most entries have no effective date. The report does not invent one.");
lines.push("- Chat steps use Bedrock Claude Haiku 5.5. Embeddings stay on local nomic at 768 dimensions so the existing `jursfca` vectors remain valid. That embedding model accepts about 2,048 tokens, so long statutes are split into parts of about 6,000 characters at subsection, paragraph, or sentence boundaries. The parts stay tied to the same document id, citation, and URL. The desk's second ranking pass is deterministic word overlap plus citation matching.");
lines.push("- A question that shares only generic business words can still miss the governing statute unless it names the code section. The evaluation set records the questions that currently retrieve the expected sources.");
lines.push("- Ingestion into the brain calls Haiku for each part. The `brain-api-root` session token expired during the load, so later parts were not stored. Refresh that AWS session, restart `python3 bin/brain-light.py`, and run the loader again. Titles already stored are skipped.");
lines.push("");
if (failed.length) {
  lines.push("## Extraction failures");
  lines.push("");
  for (const row of failed) lines.push(`- ${row.id}: ${row.error}`);
  lines.push("");
}
if (duplicates.length) {
  lines.push("## Duplicate texts");
  lines.push("");
  for (const ids of duplicates) lines.push(`- ${ids.join(", ")}`);
  lines.push("");
}
if (load) {
  lines.push("## Load");
  lines.push("");
  for (const row of load.results || []) {
    if (row.status === "skipped") lines.push(`- skipped ${row.id}: ${row.error}`);
  }
  if (!(load.results || []).some((row) => row.status === "skipped")) lines.push("- No skipped sections.");
  if (notAttempted.length) lines.push(`- ${notAttempted.length} sections were not attempted after the Bedrock session expired.`);
  lines.push("");
}

const report = `${lines.join("\n")}\n`;
writeFileSync(join(root, "docs", "corpus-coverage.md"), report);
console.log(report);
