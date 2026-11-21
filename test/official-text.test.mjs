import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertAllowed, prepareOfficialText, splitLegalText } from "../src/official-text.mjs";

const fixture = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "leginfo-section.html");
const url = "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=RTC&sectionNum=6051";

test("an allowlisted page yields the section words and the source URL", async () => {
  const html = await readFile(fixture, "utf8");
  const prepared = prepareOfficialText({
    url,
    html,
    title: "California — Sales tax",
    retrievedOn: "2026-11-18",
  });
  assert.match(prepared.text, /tangible personal property at retail/);
  assert.match(prepared.text, new RegExp(url.replace(/[?]/g, "\\?")));
  assert.equal(prepared.text.includes("do not keep this script"), false);
  assert.equal(prepared.text.includes("Footer links"), false);
  assert.equal(prepared.trimmed, false);
});

test("a commercial code host is refused before a request", () => {
  assert.throws(
    () => assertAllowed("https://codelibrary.amlegal.com/codes/san_francisco"),
    /not an official source/,
  );
});

test("a long section is split into embedding-sized parts without dropping the text", () => {
  const phrase = "California sales tax ";
  const html = `<main><p>${phrase.repeat(800)}</p></main>`;
  const prepared = prepareOfficialText({
    url,
    html,
    title: "California — Sales tax",
    retrievedOn: "2026-11-18",
  });
  assert.equal(prepared.trimmed, false);
  const repeated = (prepared.text.match(/California sales tax /g) || []).length;
  assert.ok(repeated >= 797);
  assert.ok(prepared.chunks.length > 1);
  assert.ok(prepared.chunks.every((chunk) => chunk.text.length < 9000));
});

test("a long statute splits on subsection boundaries without dropping text", () => {
  const first = `(a) ${"alpha ".repeat(900)}`;
  const second = `(b) ${"beta ".repeat(900)}`;
  const parts = splitLegalText(`${first}\n${second}`, 4000);
  assert.ok(parts.length >= 2);
  assert.equal(parts.join("\n").includes("alpha"), true);
  assert.equal(parts.join("\n").includes("beta"), true);
  assert.equal(parts.some((part) => part.endsWith(" ")), false);
});

test("the franchise tax board site is an official source", () => {
  assert.equal(
    assertAllowed("https://www.ftb.ca.gov/file/business/types/limited-liability-company/index.html").includes("ftb.ca.gov"),
    true,
  );
});
