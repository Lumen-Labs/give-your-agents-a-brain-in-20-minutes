import test from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { extractDocumentText, matchSource, parseMultipart } from "../src/local-files.mjs";

test("a text file is read on this computer", () => {
  const result = extractDocumentText("policy.txt", Buffer.from("Firm policy ENG-9. A reviewer approves the reply before it leaves the desk."));
  assert.match(result.text, /ENG-9/);
  assert.equal(result.trimmed, false);
});

test("a Word file is read from its document text", () => {
  const xml = `<?xml version="1.0"?><w:document><w:p><w:r><w:t>Firm policy ENG-9 stays local.</w:t></w:r></w:p></w:document>`;
  const result = extractDocumentText("policy.docx", storedZip("word/document.xml", xml));
  assert.match(result.text, /ENG-9 stays local/);
});

test("a PDF with compressed text is read without a document parser", () => {
  const content = "BT (Firm policy ENG-9 is approved first.) Tj ET";
  const compressed = deflateSync(Buffer.from(content));
  const pdf = Buffer.concat([
    Buffer.from(`%PDF-1.4\n1 0 obj << /Filter /FlateDecode /Length ${compressed.length} >> stream\n`),
    compressed,
    Buffer.from("\nendstream\nendobj\ntrailer <<>>\n%%EOF"),
  ]);
  const result = extractDocumentText("policy.pdf", pdf);
  assert.match(result.text, /approved first/);
});

test("a scanned-looking PDF is refused", () => {
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj << >> endobj\ntrailer <<>>\n%%EOF\n");
  assert.throws(() => extractDocumentText("scan.pdf", pdf), /Scanned pages stay unread/);
});

test("other file types stay unread", () => {
  assert.throws(() => extractDocumentText("sheet.xlsx", Buffer.from("Firm policy ENG-9 not a spreadsheet")), /Other file types stay unread/);
});

test("a form file is split from its fields", () => {
  const body = Buffer.from(
    "--edge\r\nContent-Disposition: form-data; name=\"title\"\r\n\r\nEngagement replies\r\n--edge\r\nContent-Disposition: form-data; name=\"file\"; filename=\"policy.txt\"\r\nContent-Type: text/plain\r\n\r\nFirm policy ENG-9.\r\n--edge--\r\n",
  );
  const parts = parseMultipart(body, "multipart/form-data; boundary=edge");
  assert.equal(parts[0].data.toString(), "Engagement replies");
  assert.equal(parts[1].filename, "policy.txt");
  assert.match(parts[1].data.toString(), /ENG-9/);
});

test("a passage is matched to the document that contains it", () => {
  const sources = [
    { source_key: "engpolicy1", body: "DOCID engpolicy1. Engagement replies. Firm policy ENG-1." },
    { source_key: "locrule14aa", body: "DOCID locrule14aa. Demonstration rule LOC-14. A deadline needs the official text." },
  ];
  assert.equal(matchSource(sources, "Firm policy ENG-1.").source_key, "engpolicy1");
  assert.equal(matchSource(sources, "A sentence from neither document."), null);
});

function storedZip(name, content) {
  const nameBytes = Buffer.from(name);
  const data = Buffer.from(content);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(nameBytes.length, 26);
  header.writeUInt32LE(data.length, 18);
  header.writeUInt32LE(data.length, 22);
  return Buffer.concat([header, nameBytes, data]);
}
