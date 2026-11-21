import test from "node:test";
import assert from "node:assert/strict";
import { rankRetrievals } from "../src/rank.mjs";

const sources = [
  {
    source_key: "sales",
    title: "California — Sales tax",
    body: "California sales tax is imposed when a retailer owes the tax for a retail sale of tangible personal property at the stated rate.",
  },
  {
    source_key: "gross",
    title: "San Francisco — Gross receipts tax",
    body: "San Francisco imposes a gross receipts tax on the gross receipts of a business in the city.",
  },
];

function runs() {
  return sources.map((source) => ({
    source: { sourceKey: source.source_key, title: source.title },
    passages: [{ chunkId: source.source_key, text: source.body }],
  }));
}

test("a sales tax question keeps the sales tax section", () => {
  const kept = rankRetrievals(
    "Does a California retailer owe sales tax on a retail sale?",
    runs(),
    sources,
  );
  assert.deepEqual(kept.map((item) => item.source.sourceKey), ["sales"]);
});

test("a question with no shared topic words keeps nothing", () => {
  const kept = rankRetrievals("How do I renew a dog license?", runs(), sources);
  assert.deepEqual(kept, []);
});

test("a single shared generic word is not enough", () => {
  const kept = rankRetrievals("What is the mansion transfer tax rate?", runs(), sources);
  assert.deepEqual(kept, []);
});

test("a named code section is kept even when the topic words are thin", () => {
  const kept = rankRetrievals(
    "What does Labor Code section 510 require?",
    [
      {
        source: { sourceKey: "overtime" },
        passages: [{ chunkId: "overtime", text: "Eight hours of labor constitutes a day's work." }],
      },
    ],
    [
      {
        source_key: "overtime",
        title: "California — Labor Code section 510",
        section: "510",
        body: "Citation: Labor Code section 510\nSection: 510\nEight hours of labor constitutes a day's work.",
      },
      {
        source_key: "gross",
        title: "San Francisco — Gross receipts tax",
        body: "San Francisco imposes a gross receipts tax on the gross receipts of a business in the city.",
      },
    ],
  );
  assert.deepEqual(kept.map((item) => item.source.sourceKey), ["overtime"]);
});

test("a close second source is kept", () => {
  const extra = [
    ...sources,
    {
      source_key: "salestwo",
      title: "California — Retail sales tax",
      body: "A California retailer owes sales tax on a retail sale of tangible personal property.",
    },
  ];
  const retrievals = extra.map((source) => ({
    source: { sourceKey: source.source_key, title: source.title },
    passages: [{ chunkId: source.source_key, text: source.body }],
  }));
  const kept = rankRetrievals(
    "Does a California retailer owe sales tax on a retail sale?",
    retrievals,
    extra,
  );
  assert.deepEqual(kept.map((item) => item.source.sourceKey).sort(), ["sales", "salestwo"]);
});
