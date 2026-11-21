import { createHash } from "node:crypto";
import { sourceFacts } from "./rank.mjs";

export function hashText(text) {
  return createHash("sha256").update(text).digest("hex");
}

function sentence(id, text, kind, handles, support) {
  return {
    sentenceId: id,
    text,
    kind,
    handles,
    support,
    containsCalculation: false,
  };
}

export function buildDraft({ ticket, retrievals }) {
  const citations = [];
  const sentences = [];
  const gaps = [];

  for (const run of retrievals) {
    for (const passage of run.passages) {
      const handle = `brain:${run.brainId}:chunk:${passage.chunkId}`;
      const facts = sourceFacts(passage.text);
      citations.push({
        handle,
        brainRole: run.brainRole,
        brainId: run.brainId,
        chunkId: passage.chunkId,
        snippet: passage.text,
        title: run.source?.title || "Saved document",
        sourceKey: run.source?.sourceKey || null,
        sourceVersion: run.source?.version ?? null,
        contentHash: run.source?.contentHash || null,
        authorityLevel: facts.authorityType || run.source?.authorityLevel || null,
        jurisdictionId: run.source?.jurisdictionId ?? null,
        citation: facts.citation || null,
        section: facts.section || null,
        sourceUrl: facts.sourceUrl || null,
        effectiveDate: facts.effectiveDate && facts.effectiveDate !== "unknown" ? facts.effectiveDate : null,
        versionStatus: run.source ? "resolved" : "unresolved",
      });
      if (ticket.riskClass === "conclusion") {
        sentences.push(
          sentence(
            `s${sentences.length + 1}`,
            passage.text,
            "retrieved_rule",
            [handle],
            "cited",
          ),
        );
      }
    }
  }

  if (ticket.riskClass === "status_or_document_chase") {
    sentences.push(
      sentence(
        "s1",
        "No missing document is listed for this question.",
        "status_update",
        [],
        "ticket_record",
      ),
    );
  }

  if (ticket.riskClass === "conclusion" && citations.length === 0) {
    const text =
      "Nothing saved here supports an answer to this question. No rule is stated.";
    sentences.push(sentence("s1", text, "gap", [], "unsupported"));
    gaps.push({ reason: "empty_retrieval", text });
  }

  const ruleSentences = sentences.filter(
    (item) => item.kind === "retrieved_rule" || item.kind === "firm_obligation",
  );
  const signals = {
    states_rule: sentences.some(
      (item) => item.kind === "retrieved_rule" || item.kind === "conclusion",
    ),
    states_firm_obligation: sentences.some((item) => item.kind === "firm_obligation"),
    contains_calculation: sentences.some((item) => item.containsCalculation),
    missing_or_conflict_only: sentences.every(
      (item) =>
        item.kind === "gap" || item.kind === "status_update" || item.kind === "ticket_fact",
    ),
  };

  let outcome = "ready";
  let disposition = signals.states_rule ? "supported_answer" : "status_update";
  if (gaps.length > 0) {
    outcome = "unsupported";
    disposition = "unsupported";
  }

  const bodyText = sentences.map((item) => item.text).join("\n\n");
  return {
    outcome,
    disposition,
    jurisdictionId: ticket.jurisdictionId,
    riskClass: ticket.riskClass,
    clientDelivery: "not_permitted",
    query: ticket.askText,
    citations,
    sentences,
    gaps,
    signals,
    coverage: {
      ruleSentenceCount: ruleSentences.length,
      uncoveredSentenceIds: ruleSentences
        .filter((item) => item.handles.length === 0 || item.support !== "cited")
        .map((item) => item.sentenceId),
    },
    bodyText,
    contentHash: hashText(bodyText),
  };
}

export function effectiveClass(ticket, draft) {
  if (
    draft.signals.states_rule ||
    draft.signals.states_firm_obligation ||
    draft.signals.contains_calculation
  ) {
    return "conclusion";
  }
  return ticket.riskClass;
}

export function approvalBlock(ticket, draft, qualification) {
  if (ticket.disclosureGate !== "cleared") {
    return "Matter authority is not cleared.";
  }
  if (draft.outcome === "unsupported" || draft.outcome === "conflict" || draft.outcome === "failed") {
    return "This draft does not state a supported answer.";
  }
  if (draft.disposition === "unsupported") {
    return "This draft does not state a supported answer.";
  }
  if (!qualification || qualification.jurisdictionId !== ticket.jurisdictionId) {
    return "No live qualification for this jurisdiction.";
  }
  const needed = effectiveClass(ticket, draft);
  if (needed === "conclusion") {
    if (qualification.authorityScope !== "conclusion") {
      return "Conclusion authority is required.";
    }
    if (draft.disposition !== "supported_answer") {
      return "A conclusion needs a supported answer.";
    }
    if (draft.coverage.uncoveredSentenceIds.length > 0) {
      return "Every rule sentence needs a source.";
    }
    if (draft.citations.some((item) => item.versionStatus !== "resolved")) {
      return "Every cited source needs a resolved version.";
    }
    return "";
  }
  if (qualification.authorityScope !== "status" && qualification.authorityScope !== "conclusion") {
    return "Status authority is required.";
  }
  return "";
}
