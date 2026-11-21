export const CHUNK_TARGET = 6000;

const HOSTS = [
  "leginfo.legislature.ca.gov",
  "sfbos.org",
  "sftreasurer.org",
  "ftb.ca.gov",
  "cdtfa.ca.gov",
  "sos.ca.gov",
  "dir.ca.gov",
  "sf.gov",
  "oag.ca.gov",
  "courts.ca.gov",
  "sfplanning.org",
];

export function assertAllowed(urlString) {
  let url;
  try {
    url = new URL(urlString);
  } catch {
    throw new Error("That address is not an official source for this demo.");
  }
  const host = url.hostname.toLowerCase();
  const allowed = HOSTS.some((item) => host === item || host.endsWith(`.${item}`));
  if (url.protocol !== "https:" || !allowed) {
    throw new Error("That site is not an official source for this demo.");
  }
  return url.toString();
}

export function htmlToText(html) {
  let source = String(html || "");
  source = source.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
  const main = source.match(/<main\b[\s\S]*?<\/main>/i);
  source = main
    ? main[0]
    : source
        .replace(/<nav\b[\s\S]*?<\/nav>/gi, " ")
        .replace(/<header\b[\s\S]*?<\/header>/gi, " ")
        .replace(/<footer\b[\s\S]*?<\/footer>/gi, " ");
  source = source
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h[1-6]|li|tr|div|section)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, value) => String.fromCharCode(Number(value)))
    .replace(/&#x([0-9a-f]+);/gi, (_, value) => String.fromCharCode(parseInt(value, 16)));
  return source.replace(/[ \t]+\n/g, "\n").replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function piecesWithin(text, target) {
  const value = String(text || "").trim();
  if (!value) return [];
  if (value.length <= target) return [value];
  const paragraphs = value.split(/\n{2,}/).flatMap((paragraph) => {
    if (paragraph.length <= target) return [paragraph];
    return paragraph.split(/(?<=[.])\s+/);
  });
  const chunks = [];
  let current = "";
  const push = (part) => {
    if (part.length <= target) {
      chunks.push(part);
      return;
    }
    let rest = part;
    while (rest.length > target) {
      let cut = rest.lastIndexOf(" ", target);
      if (cut < target * 0.6) cut = target;
      chunks.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (rest) chunks.push(rest);
  };
  for (const paragraph of paragraphs.map((item) => item.trim()).filter(Boolean)) {
    if (current && current.length + paragraph.length + 2 > target) {
      push(current);
      current = paragraph;
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
  }
  if (current) push(current);
  return chunks;
}

export function splitLegalText(text, target = CHUNK_TARGET) {
  const blocks = String(text || "")
    .split(/\n(?=(?:Section\s+\d|\(\s*[0-9a-z]+\s*\)\s))/i)
    .flatMap((block) => piecesWithin(block, target));
  return blocks.filter(Boolean);
}

export function prepareOfficialText({ url, html, title, retrievedOn, entry }) {
  const officialUrl = assertAllowed(url);
  const section = htmlToText(html);
  if ((section.match(/[A-Za-z]/g) || []).length < 12) {
    throw new Error("The official page did not include readable section text.");
  }
  const parts = splitLegalText(section);
  const meta = entry || {};
  const chunks = parts.map((part, index) => {
    const label = parts.length > 1 ? `part ${index + 1} of ${parts.length}` : "";
    const heading = label ? `${title} (${label})` : title;
    const header = [
      `Official text retrieved ${retrievedOn} from ${officialUrl}`,
      `Citation: ${meta.citation || title}`,
      `Jurisdiction: ${meta.jurisdiction === "sanfrancisco" ? "San Francisco" : "California"}`,
      `Authority: ${meta.authority_type || "guidance"}`,
      `Document: ${meta.id || ""}`,
      `Section: ${meta.section || ""}`,
      `Effective: ${meta.effective_date || "unknown"}`,
      label ? `Part: ${label}` : "",
    ].filter(Boolean).join("\n");
    return {
      label,
      title: heading,
      text: `${header}\n\n${heading}\n\n${part}`.trim(),
    };
  });
  return { url: officialUrl, text: chunks.map((chunk) => chunk.text).join("\n\n"), chunks, trimmed: false };
}

export function isChallengePage(status, html) {
  const text = String(html || "");
  if (status === 202 || status === 403 || status === 401) return true;
  return /Just a moment|cf-mitigated|Access Denied|enable JavaScript|awsWafCookieDomainList/i.test(text) && text.length < 80000;
}
