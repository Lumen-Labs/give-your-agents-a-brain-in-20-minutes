import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { prepareOfficialText } from "../src/official-text.mjs";
import { selectSourceKeys } from "../src/rank.mjs";

const manifest = JSON.parse(readFileSync("corpus/san-francisco/manifest.json", "utf8"));
const questions = JSON.parse(readFileSync("corpus/san-francisco/eval.json", "utf8"));
const sources = [];

for (const entry of manifest.sections) {
  const html = readFileSync(`corpus/san-francisco/${entry.page}`, "utf8");
  const prepared = prepareOfficialText({
    url: entry.source_url,
    html,
    title: entry.title,
    retrievedOn: entry.retrieved_at,
    entry,
  });
  prepared.chunks.forEach((chunk, index) => {
    sources.push({
      source_key: `${entry.id.replace(/-/g, "")}${index}`,
      title: chunk.title,
      body: chunk.text,
      section: entry.section,
      authority_type: entry.authority_type,
      documentId: entry.id,
    });
  });
}

for (const item of questions) {
  test(item.question, () => {
    const keys = selectSourceKeys(item.question, sources);
    const selected = sources.filter((source) => keys.includes(source.source_key));
    const ids = [...new Set(selected.map((source) => source.documentId))];
    if (item.expected_status === "unsupported") {
      assert.deepEqual(ids, [], item.question);
      return;
    }
    for (const id of item.expected_source_ids) {
      assert.ok(ids.includes(id), `${item.question} missed ${id}; got ${ids.join(", ") || "nothing"}`);
    }
    const expectedText = selected
      .filter((source) => item.expected_source_ids.includes(source.documentId))
      .map((source) => source.body)
      .join("\n")
      .toLowerCase();
    for (const concept of item.required_concepts) {
      assert.ok(expectedText.includes(concept.toLowerCase()), `${item.question} missed concept ${concept}`);
    }
    for (const claim of item.must_not_claim) {
      assert.equal(expectedText.includes(claim.toLowerCase()), false, `${item.question} includes ${claim}`);
    }
  });
}
