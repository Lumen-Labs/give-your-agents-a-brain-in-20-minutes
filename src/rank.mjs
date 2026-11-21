const STOP = new Set([
  "a", "an", "the", "of", "to", "and", "or", "for", "in", "on", "is", "are", "was", "be",
  "this", "that", "what", "does", "do", "who", "how", "about", "with", "from", "by", "at",
  "it", "its", "as", "must", "can", "which", "when", "where", "shall", "such", "any", "all",
  "not", "under", "into", "than", "also", "upon", "after", "before", "including", "within",
  "during", "other", "more", "each", "every", "tax", "taxes", "rate", "rates", "law", "laws",
  "code", "section", "sections", "person", "persons", "city", "state",
  "official", "retrieved", "unknown", "document", "effective", "authority", "citation", "jurisdiction",
]);

const PLACE = new Set(["california", "san", "francisco"]);
const MIN_SCORE = 2;
const CLOSE = 0.72;
const COVERAGE = 0.67;
const MAX_SOURCES = 4;
const AUTHORITY_RANK = { statute: 3, regulation: 2, guidance: 1 };

function stem(word) {
  if (word.endsWith("ies") && word.length > 5) return `${word.slice(0, -3)}y`;
  if (word.endsWith("s") && !word.endsWith("ss") && word.length >= 4) return word.slice(0, -1);
  return word;
}

function sameWord(left, right) {
  if (left === right) return true;
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  if (shorter.length < 4 || !longer.startsWith(shorter)) return false;
  return /^(ing|ed|ion|ation|ment)$/.test(longer.slice(shorter.length));
}

export function contentWords(text) {
  return (String(text || "").toLowerCase().match(/[a-z0-9]+/g) || [])
    .filter((word) => word.length > 2 && !STOP.has(word) && !/^(19|20)\d{2}$/.test(word))
    .map(stem);
}

export function topicWords(text) {
  return contentWords(text).filter((word) => !PLACE.has(word));
}

export function overlapScore(question, document) {
  const wanted = new Set(topicWords(question));
  const found = new Set(contentWords(document));
  let score = 0;
  for (const word of wanted) if (found.has(word)) score += 1;
  return score;
}

function wordWeights(sources) {
  const df = new Map();
  for (const source of sources) {
    const words = new Set(contentWords(`${source.title || ""} ${source.body || ""}`));
    for (const word of words) df.set(word, (df.get(word) || 0) + 1);
  }
  const total = Math.max(sources.length, 1);
  const weights = new Map();
  for (const [word, count] of df) weights.set(word, Math.log((total + 1) / (count + 1)));
  return { df, weights };
}

function hitsFor(question, document, weights) {
  const wanted = [...new Set(topicWords(question))];
  const found = contentWords(document);
  let score = 0;
  const matched = [];
  for (const word of wanted) {
    if (!found.some((token) => sameWord(word, token))) continue;
    matched.push(word);
    score += 1 + (weights.get(word) ?? 0);
  }
  return { score, hits: matched.length, matched };
}

export function sourceFacts(body) {
  const text = String(body || "");
  const pick = (label) => {
    const match = new RegExp(`^${label}:\\s*(.+)$`, "m").exec(text);
    return match ? match[1].trim() : "";
  };
  return {
    citation: pick("Citation"),
    jurisdictionLabel: pick("Jurisdiction"),
    authorityType: pick("Authority").toLowerCase(),
    documentId: pick("Document"),
    section: pick("Section"),
    effectiveDate: pick("Effective"),
    sourceUrl: (text.match(/https?:\/\/\S+/) || [""])[0],
  };
}

function citationHit(question, source) {
  const facts = sourceFacts(`${source.citation || ""}\nSection: ${source.section || ""}\n${source.body || ""}`);
  const section = source.section || facts.section;
  const citation = source.citation || facts.citation;
  if (citation && question.toLowerCase().includes(citation.toLowerCase())) return true;
  if (!section) return false;
  const escaped = section.replace(/[.]/g, "\\.");
  return new RegExp(`(?:section|§|sec\\.?)\\s*${escaped}\\b`, "i").test(question);
}

export function selectSourceKeys(question, sources) {
  const asksSf = /san francisco|\bsf\b/i.test(question);
  const { df, weights } = wordWeights(sources);
  const wanted = [...new Set(topicWords(question))];
  const scored = sources
    .map((source) => {
      const facts = sourceFacts(source.body || "");
      const authority = String(source.authorityType || source.authority_type || facts.authorityType || "").toLowerCase();
      const label = `${source.title || ""} ${facts.jurisdictionLabel || ""}`.toLowerCase();
      const isSf = label.includes("san francisco");
      const document = `${source.title || ""} ${source.body || ""} ${facts.citation}`;
      const topic = hitsFor(question, document, weights);
      const title = hitsFor(question, `${source.title || ""} ${facts.citation}`, weights);
      return {
        key: source.source_key || source.sourceKey || "",
        score: topic.score + title.hits * 0.35,
        topic: topic.hits,
        matched: topic.matched,
        titleHits: title.hits,
        authority: AUTHORITY_RANK[authority] || 0,
        jurisdiction: asksSf ? (isSf ? 1 : 0) : isSf ? 0 : 1,
        citation: citationHit(question, { ...source, ...facts }),
        section: source.section || facts.section,
        body: source.body || "",
      };
    })
    .filter((item) => item.key)
    .sort((left, right) =>
      right.score - left.score || right.titleHits - left.titleHits || right.authority - left.authority || right.jurisdiction - left.jurisdiction,
    );
  if (scored.length === 0) return [];
  const keys = [];
  for (const item of scored) {
    if (!item.citation || keys.includes(item.key)) continue;
    if (keys.length >= MAX_SOURCES) break;
    keys.push(item.key);
  }
  const best = scored[0].score;
  const qualified = [];
  for (const item of scored) {
    if (keys.includes(item.key)) continue;
    const coverage = wanted.length ? item.topic / wanted.length : 0;
    const rareWords = wanted.filter((word) => df.get(word) === 1);
    const titled = item.titleHits >= 2;
    const hasRare = titled || rareWords.every((word) => item.matched.includes(word));
    const strong = item.score >= MIN_SCORE || titled;
    const close = item.score >= best * CLOSE || titled;
    if (coverage >= COVERAGE && hasRare && strong && close) qualified.push(item);
  }
  qualified.sort((left, right) =>
    right.titleHits - left.titleHits || right.score - left.score || right.authority - left.authority,
  );
  for (const item of qualified) {
    if (keys.length >= MAX_SOURCES) break;
    keys.push(item.key);
  }
  const selected = new Set(keys);
  const blob = scored.filter((item) => selected.has(item.key)).map((item) => item.body).join("\n");
  for (const match of blob.matchAll(/(?:Section|section)\s+(\d+(?:\.\d+)?)/g)) {
    if (keys.length >= MAX_SOURCES) break;
    const hit = scored.find((item) => item.section === match[1] && !selected.has(item.key) && item.topic >= 1);
    if (hit) {
      selected.add(hit.key);
      keys.push(hit.key);
    }
  }
  return keys;
}

export function rankRetrievals(question, retrievals, sources) {
  const selected = new Set(selectSourceKeys(question, sources));
  if (selected.size === 0) return [];
  return retrievals.filter((run) => selected.has(run.source?.sourceKey));
}
