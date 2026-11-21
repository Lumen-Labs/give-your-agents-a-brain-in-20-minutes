import test from "node:test";
import assert from "node:assert/strict";
import { approvalBlock, buildDraft } from "../src/draft.mjs";

const qualification = {
  jurisdictionId: "demolocal",
  authorityScope: "conclusion",
};

const source = {
  sourceKey: "engpolicy1",
  version: 1,
  contentHash: "abc",
  authorityLevel: "firm_policy",
  jurisdictionId: null,
  title: "Engagement replies",
};

test("a known passage becomes a cited rule", () => {
  const draft = buildDraft({
    ticket: {
      askText: "What must happen before a conclusion is sent?",
      jurisdictionId: "demolocal",
      riskClass: "conclusion",
    },
    retrievals: [
      {
        brainRole: "firm",
        brainId: "firmdesk",
        source,
        passages: [
          {
            chunkId: "p1",
            text: "Firm policy ENG-1. A qualified reviewer approves the text before it is sent.",
          },
        ],
      },
    ],
  });
  assert.equal(draft.outcome, "ready");
  assert.equal(draft.disposition, "supported_answer");
  assert.equal(draft.clientDelivery, "not_permitted");
  assert.equal(draft.sentences[0].kind, "retrieved_rule");
  assert.equal(draft.sentences[0].handles[0], "brain:firmdesk:chunk:p1");
  assert.equal(draft.coverage.uncoveredSentenceIds.length, 0);
  assert.equal(approvalBlock({ disclosureGate: "cleared", jurisdictionId: "demolocal", riskClass: "conclusion" }, draft, qualification), "");
});

test("an empty corpus states that no rule is supported", () => {
  const draft = buildDraft({
    ticket: {
      askText: "What is the filing deadline?",
      jurisdictionId: "demolocal",
      riskClass: "conclusion",
    },
    retrievals: [
      { brainRole: "firm", brainId: "firmdesk", source, passages: [] },
      { brainRole: "jurisdiction", brainId: "jdemolocal", source: null, passages: [] },
    ],
  });
  assert.equal(draft.outcome, "unsupported");
  assert.equal(draft.sentences.some((item) => item.kind === "retrieved_rule"), false);
  assert.match(draft.bodyText, /No rule is stated/);
  assert.match(
    approvalBlock({ disclosureGate: "cleared", jurisdictionId: "demolocal", riskClass: "conclusion" }, draft, qualification),
    /supported answer/,
  );
});

test("a status reply does not become a conclusion when passages exist", () => {
  const draft = buildDraft({
    ticket: {
      askText: "Which document is still missing?",
      jurisdictionId: "demolocal",
      riskClass: "status_or_document_chase",
    },
    retrievals: [
      {
        brainRole: "firm",
        brainId: "firmdesk",
        source,
        passages: [{ chunkId: "p1", text: "Firm policy ENG-1." }],
      },
    ],
  });
  assert.equal(draft.disposition, "status_update");
  assert.equal(draft.signals.states_rule, false);
  assert.equal(draft.sentences[0].kind, "status_update");
  assert.equal(
    approvalBlock(
      { disclosureGate: "cleared", jurisdictionId: "demolocal", riskClass: "status_or_document_chase" },
      draft,
      { jurisdictionId: "demolocal", authorityScope: "status" },
    ),
    "",
  );
});
