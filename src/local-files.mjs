import { randomBytes } from "node:crypto";
import { inflateSync } from "node:zlib";

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_TEXT = 12000;
const READABLE = new Set(["txt", "md", "csv", "rtf", "pdf", "docx"]);

export function makeSourceKey(title) {
  const letters = String(title || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const stem = /^[a-z]/.test(letters) ? letters : `d${letters}`;
  const key = `${stem.slice(0, 28)}${randomBytes(3).toString("hex")}`;
  return (key.length < 8 ? `${key}document` : key).slice(0, 41);
}

export function parseMultipart(buffer, contentType) {
  const match = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(String(contentType || ""));
  if (!match) throw new Error("The file did not arrive in one piece. Choose it again.");
  const boundary = match[1] || match[2];
  const delimiter = Buffer.from(`--${boundary}`);
  const parts = [];
  let cursor = buffer.indexOf(delimiter);
  if (cursor < 0) throw new Error("The file did not arrive in one piece. Choose it again.");
  while (cursor !== -1) {
    if (buffer.subarray(cursor + delimiter.length, cursor + delimiter.length + 2).equals(Buffer.from("--"))) break;
    let start = cursor + delimiter.length;
    if (buffer[start] === 13 && buffer[start + 1] === 10) start += 2;
    const headerEnd = buffer.indexOf(Buffer.from("\r\n\r\n"), start);
    if (headerEnd < 0) break;
    const headers = buffer.subarray(start, headerEnd).toString("utf8");
    const dataStart = headerEnd + 4;
    const next = buffer.indexOf(Buffer.concat([Buffer.from("\r\n"), delimiter]), dataStart);
    const dataEnd = next === -1 ? buffer.length : next;
    parts.push({
      name: /name="([^"]*)"/.exec(headers)?.[1] || "",
      filename: /filename="([^"]*)"/.exec(headers)?.[1] || "",
      type: /Content-Type:\s*([^\r\n]+)/i.exec(headers)?.[1]?.trim() || "",
      data: buffer.subarray(dataStart, dataEnd),
    });
    cursor = next === -1 ? -1 : next + 2;
  }
  return parts;
}

export function extractDocumentText(filename, bytes) {
  const data = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (data.length === 0) throw new Error("That file is empty.");
  if (data.length > MAX_BYTES) throw new Error("This file is larger than 8 MB. Save a smaller copy.");
  const ext = extensionOf(filename);
  if (!READABLE.has(ext)) {
    throw new Error("Use a text file, a Word document, or a PDF. Other file types stay unread.");
  }
  const raw = ext === "pdf" ? extractPdf(data) : ext === "docx" ? extractDocx(data) : ext === "rtf" ? extractRtf(data) : decodePlain(data);
  const text = raw.replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  const letters = (text.match(/[A-Za-z]/g) || []).length;
  if (letters < 12) {
    throw new Error(
      ext === "pdf"
        ? "This PDF has no words the desk can read. Scanned pages stay unread. Save a text file or a PDF that already contains text."
        : "This file has no words the desk can read.",
    );
  }
  const trimmed = text.length > MAX_TEXT;
  return { text: trimmed ? text.slice(0, MAX_TEXT).trim() : text, trimmed };
}

export function matchSource(sources, text) {
  const needle = String(text || "").replace(/\s+/g, " ").trim();
  if (!needle) return null;
  const sample = needle.slice(0, 160);
  const contained = sources.filter((row) => String(row.body || "").replace(/\s+/g, " ").includes(sample));
  if (contained.length === 1) return contained[0];
  const pool = contained.length > 1 ? contained : sources;
  const keyed = pool.filter((row) => row.source_key && needle.includes(row.source_key));
  if (keyed.length === 1) return keyed[0];
  if (contained.length > 1) return null;
  if (sources.length === 1) return sources[0];
  return null;
}

function extensionOf(filename) {
  const match = /\.([A-Za-z0-9]+)$/.exec(String(filename || ""));
  return match ? match[1].toLowerCase() : "";
}

function decodePlain(bytes) {
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const bad = (text.match(/\uFFFD/g) || []).length;
  if (bad > 3) return Buffer.from(bytes).toString("latin1");
  return text.replace(/^\uFEFF/, "");
}

function extractRtf(bytes) {
  return decodePlain(bytes)
    .replace(/\\par[d]?/g, "\n")
    .replace(/\\'[0-9a-fA-F]{2}/g, (item) => String.fromCharCode(parseInt(item.slice(2), 16)))
    .replace(/\\[a-z]+-?\d* ?/gi, "")
    .replace(/[{}]/g, "");
}

function extractDocx(bytes) {
  const xml = readZipEntry(bytes, "word/document.xml");
  if (!xml) throw new Error("This Word file has no readable text. Paste the words instead.");
  return xml
    .toString("utf8")
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<w:br\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, value) => String.fromCharCode(Number(value)));
}

function readZipEntry(buffer, name) {
  let offset = 0;
  while (offset + 30 < buffer.length) {
    if (buffer.readUInt32LE(offset) !== 0x04034b50) return null;
    const flags = buffer.readUInt16LE(offset + 6);
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const entryName = buffer.subarray(nameStart, nameStart + nameLength).toString("utf8");
    if ((flags & 0x8) !== 0 && compressedSize === 0) {
      throw new Error("This Word file could not be read. Paste the words instead.");
    }
    const data = buffer.subarray(dataStart, dataStart + compressedSize);
    if (entryName === name) {
      if (method === 0) return data;
      if (method === 8) return inflateSync(data);
      throw new Error("This Word file could not be read. Paste the words instead.");
    }
    offset = dataStart + compressedSize;
  }
  return null;
}

function extractPdf(bytes) {
  const pieces = [bytes.toString("latin1"), ...pdfStreams(bytes)];
  return pieces.map(textFromPdfContent).filter(Boolean).join("\n");
}

function pdfStreams(buffer) {
  const latin = buffer.toString("latin1");
  const outputs = [];
  let index = 0;
  while (index < latin.length) {
    const found = latin.indexOf("stream", index);
    if (found < 0) break;
    const before = found > 0 ? latin[found - 1] : "";
    if (/[A-Za-z]/.test(before)) {
      index = found + 6;
      continue;
    }
    let start = found + 6;
    if (latin[start] === "\r" && latin[start + 1] === "\n") start += 2;
    else if (latin[start] === "\n") start += 1;
    const end = latin.indexOf("endstream", start);
    if (end < 0) break;
    const dict = latin.slice(Math.max(0, found - 240), found);
    let data = buffer.subarray(start, end);
    if (data.length >= 2 && data[data.length - 2] === 13 && data[data.length - 1] === 10) data = data.subarray(0, -2);
    else if (data.length >= 1 && (data[data.length - 1] === 10 || data[data.length - 1] === 13)) data = data.subarray(0, -1);
    if (/FlateDecode/.test(dict)) {
      try {
        outputs.push(inflateSync(data).toString("latin1"));
      } catch {
        outputs.push("");
      }
    } else if (!/DCTDecode|JPXDecode|CCITTFaxDecode/.test(dict)) {
      outputs.push(data.toString("latin1"));
    }
    index = end + 9;
  }
  return outputs;
}

function textFromPdfContent(content) {
  const parts = [];
  const pattern = /\((?:\\.|[^\\)])*\)\s*Tj|\[(?:\s*(?:\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f\s]+>|-?\d+(?:\.\d+)?)\s*)+\]\s*TJ/g;
  for (const token of content.match(pattern) || []) {
    const trimmed = token.trimEnd();
    if (trimmed.endsWith("Tj") && !trimmed.endsWith("TJ")) {
      const literal = token.match(/\((?:\\.|[^\\)])*\)/);
      if (literal) parts.push(decodePdfString(literal[0]));
    } else {
      for (const bit of token.match(/\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f\s]+>/g) || []) {
        parts.push(bit.startsWith("(") ? decodePdfString(bit) : decodePdfHex(bit));
      }
    }
    parts.push(" ");
  }
  return parts.join("").replace(/[ \t]{2,}/g, " ").trim();
}

function decodePdfString(token) {
  const inner = token.slice(1, -1);
  let out = "";
  for (let index = 0; index < inner.length; index += 1) {
    const char = inner[index];
    if (char !== "\\") {
      out += char;
      continue;
    }
    const next = inner[index + 1];
    index += 1;
    if (next === undefined) break;
    if (next === "n") out += "\n";
    else if (next === "r") out += "\r";
    else if (next === "t") out += "\t";
    else if (next === "b") out += "\b";
    else if (next === "f") out += "\f";
    else if (next === "(" || next === ")" || next === "\\") out += next;
    else if (next >= "0" && next <= "7") {
      let octal = next;
      while (octal.length < 3 && inner[index + 1] >= "0" && inner[index + 1] <= "7") {
        index += 1;
        octal += inner[index];
      }
      out += String.fromCharCode(parseInt(octal, 8));
    } else out += next;
  }
  if (out.charCodeAt(0) === 0xfe && out.charCodeAt(1) === 0xff) {
    let utf = "";
    for (let index = 2; index + 1 < out.length; index += 2) {
      utf += String.fromCharCode((out.charCodeAt(index) << 8) | out.charCodeAt(index + 1));
    }
    return utf;
  }
  return out;
}

function decodePdfHex(token) {
  const hex = token.slice(1, -1).replace(/\s/g, "");
  if (hex.toLowerCase().startsWith("feff")) {
    let utf = "";
    for (let index = 4; index + 3 < hex.length; index += 4) {
      utf += String.fromCharCode(parseInt(hex.slice(index, index + 4), 16));
    }
    return utf;
  }
  let ascii = "";
  for (let index = 0; index + 1 < hex.length; index += 2) {
    ascii += String.fromCharCode(parseInt(hex.slice(index, index + 2), 16));
  }
  return ascii;
}
