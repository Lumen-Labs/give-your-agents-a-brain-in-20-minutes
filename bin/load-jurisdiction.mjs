import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";
import { assertAllowed, htmlToText, isChallengePage, prepareOfficialText } from "../src/official-text.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const corpusDir = join(root, "corpus", "san-francisco");
const dryRun = process.argv.includes("--dry-run");
const brainUrl = process.env.BRAINAPI_URL || "";
const deskUrl = process.env.DESK_URL || "http://127.0.0.1:4173";

if (!dryRun && brainUrl !== "http://127.0.0.1:8010") {
  console.error("Refusing to load. Set BRAINAPI_URL=http://127.0.0.1:8010 so this stays on the lightweight brain.");
  process.exit(1);
}

const manifest = JSON.parse(await readFile(join(corpusDir, "manifest.json"), "utf8"));
for (const section of manifest.sections) {
  section.url = section.source_url || section.url;
  section.retrievedOn = section.retrieved_at || manifest.retrievedOn;
}

function readToken() {
  if (process.env.BRAINPAT_TOKEN) return process.env.BRAINPAT_TOKEN;
  const match = readFileSync(join(homedir(), ".brainapi", "source", ".env"), "utf8").match(
    /^BRAINPAT_TOKEN=["']?([^"'\n]+)["']?/m,
  );
  return match?.[1] || "";
}

async function ensureBrain() {
  const token = readToken();
  if (!token) throw new Error("BRAINPAT_TOKEN is not set.");
  const response = await fetch(`${brainUrl}/system/brains`, {
    method: "POST",
    headers: { "Content-Type": "application/json", BrainPAT: token },
    body: JSON.stringify({ brain_id: "jursfca" }),
  });
  if (response.ok) return;
  const text = await response.text();
  if (response.status === 409 || /already|exists/i.test(text)) return;
  throw new Error(`The jurisdiction brain was not created (${response.status}).`);
}

function sameText(page, marker) {
  const compact = (value) => String(value || "").replace(/\s+/g, " ");
  return compact(htmlToText(page)).includes(compact(marker));
}

async function pageHtml(section) {
  assertAllowed(section.url);
  try {
    const response = await fetch(section.url, {
      headers: { Accept: "text/html", "User-Agent": "AccountantDesk/1.0" },
      redirect: "follow",
    });
    const body = await response.text();
    if (response.ok && !isChallengePage(response.status, body) && sameText(body, section.marker)) {
      return { html: body, from: "live page" };
    }
  } catch {
    // The official host challenged or refused the script. The saved retrieval is next.
  }
  const html = await readFile(join(corpusDir, section.page), "utf8");
  if (!sameText(html, section.marker)) {
    throw new Error("the saved official retrieval does not match this section");
  }
  return { html, from: "official retrieval" };
}

async function storedTitles() {
  const response = await fetch(`${deskUrl}/api/sources`);
  if (!response.ok) throw new Error("The desk is not accepting documents.");
  const payload = await response.json();
  return new Set((payload.sources || []).map((item) => item.title));
}

if (dryRun) {
  for (const section of manifest.sections) {
    assertAllowed(section.url);
    console.log(`${section.title} ${section.url}`);
  }
  process.exit(0);
}

await ensureBrain();
const titles = await storedTitles();
const results = [];
let skipped = 0;

function postJson(url, body) {
  const payload = Buffer.from(JSON.stringify(body));
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: target.hostname,
        port: target.port,
        path: `${target.pathname}${target.search}`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": payload.length,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function storeChunk(title, body) {
  if (titles.has(title)) return "already stored";
  const response = await postJson(`${deskUrl}/api/files`, { title, role: "jurisdiction", body });
  const payload = response.body ? JSON.parse(response.body) : {};
  if (!response.ok) throw new Error(payload.error || "The desk did not store this section.");
  titles.add(title);
  return "saved";
}

const queue = [...manifest.sections];
async function worker() {
  while (queue.length) {
    const section = queue.shift();
    try {
      const loaded = await pageHtml(section);
      const prepared = prepareOfficialText({
        url: section.url,
        html: loaded.html,
        title: section.title,
        retrievedOn: section.retrievedOn,
        entry: section,
      });
      const states = [];
      for (const chunk of prepared.chunks) {
        states.push(await storeChunk(chunk.title, chunk.text));
      }
      const state = states.every((item) => item === "already stored") ? "already stored" : "saved";
      results.push({ id: section.id, title: section.title, status: state, from: loaded.from, chunks: prepared.chunks.length });
      console.log(`${state} ${section.title} (${loaded.from}, ${prepared.chunks.length} part${prepared.chunks.length === 1 ? "" : "s"})`);
    } catch (error) {
      skipped += 1;
      const detail = error.cause?.message ? `${error.message}: ${error.cause.message}` : error.message;
      results.push({ id: section.id, title: section.title, status: "skipped", error: detail });
      console.log(`skipped ${section.title}: ${detail}`);
    }
  }
}

await Promise.all([worker(), worker(), worker()]);
await writeFile(join(corpusDir, "load-results.json"), JSON.stringify({ retrievedOn: manifest.retrievedOn, results }, null, 2));
process.exit(skipped > 0 ? 1 : 0);
