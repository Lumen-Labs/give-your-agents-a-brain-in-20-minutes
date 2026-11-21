import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { approvalBlock, buildDraft, effectiveClass, hashText } from "./draft.mjs";
import { createBrainClient, passagesFromContext } from "./brain.mjs";
import { demoFixtures } from "./fixtures.mjs";
import { extractDocumentText, makeSourceKey, matchSource, parseMultipart } from "./local-files.mjs";
import { rankRetrievals } from "./rank.mjs";
import { allow, clientAddress } from "./rate-limit.mjs";
import { openStore, sourceView } from "./store.mjs";

const publicDir = join(import.meta.dirname, "..", "public");
const config = {
  port: Number(process.env.DESK_PORT || 4173),
  brainUrl: process.env.BRAINAPI_URL || "http://localhost:8000",
  token: process.env.BRAINPAT_TOKEN || "",
  firmBrainId: process.env.FIRM_BRAIN_ID || "firmdesk",
  jurisdictionId: process.env.JURISDICTION_ID || "demolocal",
  jurisdictionBrainId: process.env.JURISDICTION_BRAIN_ID || "jdemolocal",
  uploads: process.env.DESK_UPLOADS !== "off",
  firmId: "deskfirm",
  matterId: "matterdemo",
  reviewerId: "review-principal",
};

const store = openStore(join(import.meta.dirname, "..", "data", "desk.sqlite"));
const brain = config.token
  ? createBrainClient({ baseUrl: config.brainUrl, token: config.token })
  : null;

const reviewer = {
  userId: config.reviewerId,
  name: "Review principal",
  jurisdictionId: config.jurisdictionId,
  authorityScope: "conclusion",
  credentialLabel: "Desk principal",
};

const fixtures = demoFixtures(config);

function visibleSources() {
  const brains = new Set([config.firmBrainId, config.jurisdictionBrainId]);
  return store.listSources().filter((source) => brains.has(source.brain_id));
}

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

function uploadsClosed(request, response) {
  if (config.uploads) return false;
  request.resume();
  send(response, 403, { error: "Saving documents is turned off on this demo." });
  return true;
}

function limited(request, response, scope) {
  const verdict = allow(clientAddress(request), scope);
  if (verdict.ok) return false;
  request.resume();
  send(response, 429, { error: verdict.message }, "application/json; charset=utf-8", {
    "Retry-After": String(verdict.retryAfter),
  });
  return true;
}

function send(response, status, body, type = "application/json; charset=utf-8", headers = {}) {
  const payload = Buffer.isBuffer(body) || typeof body === "string" ? body : JSON.stringify(body);
  response.writeHead(status, {
    "Content-Type": type,
    "Content-Length": Buffer.byteLength(payload),
    ...headers,
  });
  response.end(payload);
}

async function readRaw(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 8 * 1024 * 1024 + 256 * 1024) {
      throw new Error("This file is larger than 8 MB. Save a smaller copy.");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJson(request) {
  const raw = await readRaw(request);
  if (raw.length === 0) return {};
  return JSON.parse(raw.toString("utf8"));
}

function ticketView(row) {
  const draft = store.latestDraft(row.ticket_id);
  const approval = store.latestApproval(row.ticket_id);
  const payload = draft?.payload || null;
  const live =
    approval &&
    draft &&
    approval.draft_id === draft.draft_id &&
    approval.content_hash === draft.content_hash;
  return {
    ticketId: row.ticket_id,
    askText: row.ask_text,
    jurisdictionId: row.jurisdiction_id,
    topic: row.topic,
    riskClass: row.risk_class,
    state: row.state,
    disclosureGate: row.disclosure_gate,
    createdAt: row.created_at,
    draft: payload
      ? {
          draftId: draft.draft_id,
          revision: draft.revision,
          outcome: draft.outcome,
          disposition: draft.disposition,
          bodyText: draft.body_text,
          contentHash: draft.content_hash,
          sentences: payload.sentences,
          citations: payload.citations,
          gaps: payload.gaps,
          signals: payload.signals,
          coverage: payload.coverage,
          clientDelivery: payload.clientDelivery,
        }
      : null,
    approval: live
      ? {
          approvalId: approval.approval_id,
          effectiveClass: approval.effective_class,
          approvedAt: approval.approved_at,
        }
      : null,
  };
}

async function retrieve(ticket) {
  const targets = [
    { brainRole: "firm", brainId: config.firmBrainId },
    { brainRole: "jurisdiction", brainId: config.jurisdictionBrainId },
  ];
  const retrievals = [];
  const catalog = [];
  for (const target of targets) {
    const payload = await brain.context(target.brainId, ticket.askText);
    const sources = store.sourcesForBrain(target.brainId);
    catalog.push(...sources);
    for (const passage of passagesFromContext(payload)) {
      retrievals.push({
        brainRole: target.brainRole,
        brainId: target.brainId,
        source: sourceView(matchSource(sources, passage.text)),
        passages: [passage],
      });
    }
  }
  return rankRetrievals(ticket.askText, retrievals, catalog);
}

async function publishSource(input) {
  if (!brain) throw new Error("BRAINPAT_TOKEN is not set.");
  const sourceKey = input.sourceKey;
  if (!/^[a-z][a-z0-9]{7,40}$/.test(sourceKey)) {
    throw new Error("Source key must be 8 to 41 lowercase letters and digits, starting with a letter.");
  }
  const body = `DOCID ${sourceKey}. ${input.title}. ${input.body}`.trim();
  await brain.ingestText(input.brainId, body);
  const fileId = input.file ? randomUUID() : null;
  if (input.file) {
    store.saveFile({
      fileId,
      sourceKey,
      originalName: input.file.originalName,
      mediaType: input.file.mediaType,
      byteSize: input.file.bytes.length,
      bytes: input.file.bytes,
      createdAt: new Date().toISOString(),
    });
  }
  const saved = {
    ...input,
    version: 1,
    contentHash: hashText(body),
    status: "current",
    body,
    fileId,
  };
  store.saveSource(saved);
  return sourceView({
    source_key: saved.sourceKey,
    brain_id: saved.brainId,
    brain_role: saved.brainRole,
    authority_level: saved.authorityLevel,
    jurisdiction_id: saved.jurisdictionId,
    version: saved.version,
    content_hash: saved.contentHash,
    title: saved.title,
    status: saved.status,
    file_id: fileId,
    original_name: input.file?.originalName || null,
    byte_size: input.file?.bytes.length || null,
  });
}

async function ensureFixtures() {
  for (const fixture of fixtures) {
    if (!store.getSource(fixture.sourceKey)) await publishSource(fixture);
  }
}

async function handleApi(request, response, url) {
  if (url.pathname === "/api/health") {
    if (!brain) return send(response, 200, { brain: "missing-token", pipeline: "lightweight", uploads: config.uploads });
    try {
      await brain.health();
      return send(response, 200, { brain: "ok", pipeline: "lightweight", search: "off", uploads: config.uploads });
    } catch (error) {
      return send(response, 200, { brain: "down", message: error.message, pipeline: "lightweight", uploads: config.uploads });
    }
  }

  if (url.pathname === "/api/session" && request.method === "GET") {
    return send(response, 200, {
      reviewer,
      jurisdictionId: config.jurisdictionId,
      firmBrainId: config.firmBrainId,
      jurisdictionBrainId: config.jurisdictionBrainId,
      disclosureGate: "cleared",
      authority: "firm_authority for the local BrainAPI host",
    });
  }

  if (url.pathname === "/api/sources" && request.method === "GET") {
    return send(response, 200, { sources: visibleSources().map(sourceView) });
  }

  if (url.pathname === "/api/files" && request.method === "POST") {
    if (uploadsClosed(request, response)) return;
    if (limited(request, response, "ingest")) return;
    try {
      const declared = Number(request.headers["content-length"] || 0);
      if (declared > 8 * 1024 * 1024 + 256 * 1024) {
        return send(response, 413, { error: "This file is larger than 8 MB. Save a smaller copy." });
      }
      const raw = await readRaw(request);
      const header = request.headers["content-type"] || "";
      let title = "";
      let role = "firm";
      let pasted = "";
      let filePart = null;
      if (header.includes("multipart/form-data")) {
        const parts = parseMultipart(raw, header);
        title = fieldText(parts, "title");
        role = fieldText(parts, "role") === "jurisdiction" ? "jurisdiction" : "firm";
        pasted = fieldText(parts, "body");
        filePart = parts.find((part) => part.name === "file" && part.filename && part.data.length > 0) || null;
      } else {
        const body = JSON.parse(raw.length ? raw.toString("utf8") : "{}");
        title = String(body.title || "").trim();
        role = body.role === "jurisdiction" ? "jurisdiction" : "firm";
        pasted = String(body.body || "").trim();
      }
      if (!title) return send(response, 400, { error: "Give the document a name." });
      let extracted = pasted;
      let trimmed = false;
      let file = null;
      if (filePart) {
        const result = extractDocumentText(filePart.filename, filePart.data);
        extracted = result.text;
        trimmed = result.trimmed;
        file = {
          originalName: filePart.filename.replace(/[/\\]/g, "").slice(0, 180) || "document",
          mediaType: filePart.type || "application/octet-stream",
          bytes: Buffer.from(filePart.data),
        };
      }
      if (!String(extracted).trim()) return send(response, 400, { error: "Add a file or paste the words." });
      let sourceKey = makeSourceKey(title);
      while (store.getSource(sourceKey)) sourceKey = makeSourceKey(title);
      const source = await publishSource({
        sourceKey,
        title,
        body: extracted,
        brainRole: role,
        brainId: role === "firm" ? config.firmBrainId : config.jurisdictionBrainId,
        authorityLevel: role === "firm" ? "firm_policy" : "regulation",
        jurisdictionId: role === "jurisdiction" ? config.jurisdictionId : null,
        file,
      });
      return send(response, 201, { source, trimmed });
    } catch (error) {
      const known = /larger than 8 MB|empty|no words|Scanned|Other file types|Word file|did not arrive|Give the document|Add a file/.test(error.message);
      return send(response, known ? 400 : 500, {
        error: known
          ? error.message
          : "The words were read on this computer, but they could not be stored for replies yet. Wait a moment and try again.",
      });
    }
  }

  const savedFile = url.pathname.match(/^\/api\/files\/([^/]+)$/);
  if (savedFile && request.method === "GET") {
    const row = store.getFile(decodeURIComponent(savedFile[1]));
    if (!row) return send(response, 404, { error: "That saved file is not on this computer." });
    const name = String(row.original_name || "document").replace(/["\r\n\\]/g, "");
    return send(response, 200, Buffer.from(row.bytes), row.media_type || "application/octet-stream", {
      "Content-Disposition": `attachment; filename="${name}"`,
    });
  }

  if (url.pathname === "/api/sources" && request.method === "POST") {
    if (uploadsClosed(request, response)) return;
    if (limited(request, response, "ingest")) return;
    const body = await readJson(request);
    const role = body.role === "jurisdiction" ? "jurisdiction" : "firm";
    const source = await publishSource({
      sourceKey: String(body.sourceKey || "").trim(),
      title: String(body.title || "").trim(),
      body: String(body.body || "").trim(),
      brainRole: role,
      brainId: role === "firm" ? config.firmBrainId : config.jurisdictionBrainId,
      authorityLevel: role === "firm" ? "firm_policy" : "regulation",
      jurisdictionId: role === "jurisdiction" ? config.jurisdictionId : null,
    });
    return send(response, 201, { source });
  }

  if (url.pathname === "/api/library/seed" && request.method === "POST") {
    await ensureFixtures();
    return send(response, 200, { sources: visibleSources().map(sourceView) });
  }

  if (url.pathname === "/api/tickets" && request.method === "GET") {
    return send(response, 200, { tickets: store.listTickets().map(ticketView) });
  }

  if (url.pathname === "/api/tickets" && request.method === "POST") {
    if (limited(request, response, "draft")) return;
    const body = await readJson(request);
    const askText = String(body.askText || "").trim();
    const topic = ["policy", "document", "legal_or_regulatory"].includes(body.topic) ? body.topic : "";
    const riskClass = ["conclusion", "status_or_document_chase"].includes(body.riskClass) ? body.riskClass : "";
    if (!askText || !topic || !riskClass) {
      return send(response, 400, { error: "Write the question, choose what it is about, and choose the kind of reply." });
    }
    if (!brain) return send(response, 503, { error: "The document memory is not running." });
    const now = new Date().toISOString();
    const ticket = {
      ticketId: randomUUID(),
      firmId: config.firmId,
      matterId: config.matterId,
      askText,
      jurisdictionId: config.jurisdictionId,
      topic,
      riskClass,
      state: "draft_in_progress",
      disclosureGate: "cleared",
      assigneeId: config.reviewerId,
      createdAt: now,
    };
    store.insertTicket(ticket);
    store.addEvent({
      eventId: randomUUID(),
      ticketId: ticket.ticketId,
      eventType: "ticket.draft_requested",
      payload: { askText, riskClass, topic },
      createdAt: now,
    });
    const retrievals = await retrieve({ askText, jurisdictionId: ticket.jurisdictionId });
    const built = buildDraft({
      ticket: { askText, jurisdictionId: ticket.jurisdictionId, riskClass },
      retrievals,
    });
    const draftId = randomUUID();
    store.insertDraft({
      draftId,
      ticketId: ticket.ticketId,
      revision: 1,
      outcome: built.outcome,
      disposition: built.disposition,
      bodyText: built.bodyText,
      contentHash: built.contentHash,
      payload: built,
      createdAt: now,
    });
    store.setTicketState(ticket.ticketId, "in_review");
    store.addEvent({
      eventId: randomUUID(),
      ticketId: ticket.ticketId,
      eventType: "ticket.draft_attached",
      payload: { draftId, outcome: built.outcome, disposition: built.disposition },
      createdAt: now,
    });
    return send(response, 201, { ticket: ticketView(store.getTicket(ticket.ticketId)) });
  }

  const approvalMatch = url.pathname.match(/^\/api\/tickets\/([^/]+)\/approve$/);
  if (approvalMatch && request.method === "POST") {
    const ticket = store.getTicket(approvalMatch[1]);
    if (!ticket) return send(response, 404, { error: "Ticket not found." });
    const draftRow = store.latestDraft(ticket.ticket_id);
    if (!draftRow) return send(response, 409, { error: "No draft." });
    const block = approvalBlock(
      {
        disclosureGate: ticket.disclosure_gate,
        jurisdictionId: ticket.jurisdiction_id,
        riskClass: ticket.risk_class,
      },
      draftRow.payload,
      reviewer,
    );
    if (block) return send(response, 409, { error: block });
    const now = new Date().toISOString();
    store.insertApproval({
      approvalId: randomUUID(),
      ticketId: ticket.ticket_id,
      draftId: draftRow.draft_id,
      revision: draftRow.revision,
      contentHash: draftRow.content_hash,
      approverId: reviewer.userId,
      effectiveClass: effectiveClass(
        { riskClass: ticket.risk_class },
        draftRow.payload,
      ),
      approvedText: draftRow.body_text,
      sources: draftRow.payload.citations,
      approvedAt: now,
    });
    store.setTicketState(ticket.ticket_id, "approved");
    store.addEvent({
      eventId: randomUUID(),
      ticketId: ticket.ticket_id,
      eventType: "ticket.approved",
      payload: { draftId: draftRow.draft_id, contentHash: draftRow.content_hash },
      createdAt: now,
    });
    return send(response, 200, { ticket: ticketView(store.getTicket(ticket.ticket_id)) });
  }

  const exportMatch = url.pathname.match(/^\/api\/tickets\/([^/]+)\/export$/);
  if (exportMatch && request.method === "POST") {
    const body = await readJson(request);
    if (body.channel !== "copy" && body.channel !== "download") {
      return send(response, 400, { error: "Export is copy or download." });
    }
    const ticket = store.getTicket(exportMatch[1]);
    const draftRow = ticket ? store.latestDraft(ticket.ticket_id) : null;
    const approval = ticket ? store.latestApproval(ticket.ticket_id) : null;
    if (!ticket || !draftRow || !approval || approval.content_hash !== draftRow.content_hash) {
      return send(response, 409, { error: "Export waits for an approval of this text." });
    }
    const now = new Date().toISOString();
    store.addEvent({
      eventId: randomUUID(),
      ticketId: ticket.ticket_id,
      eventType: "ticket.exported",
      payload: { channel: body.channel, contentHash: draftRow.content_hash },
      createdAt: now,
    });
    const text = [
      draftRow.body_text,
      "",
      "Sources",
      ...draftRow.payload.citations.map((item) => `- ${item.title}, version ${item.sourceVersion || 1}`),
      "",
      "This copy has not been sent to the client. Sending it is your act.",
    ].join("\n");
    return send(response, 200, { text, channel: body.channel });
  }

  return send(response, 404, { error: "Not found." });
}

function fieldText(parts, name) {
  const part = parts.find((item) => item.name === name);
  return part ? part.data.toString("utf8").trim() : "";
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      if (url.pathname !== "/api/health" && limited(request, response, "api")) return;
      await handleApi(request, response, url);
      return;
    }
    if (limited(request, response, "page")) return;
    const relative = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const file = join(publicDir, relative);
    if (!file.startsWith(publicDir)) return send(response, 403, { error: "Forbidden." });
    const bytes = await readFile(file);
    const extension = extname(file);
    const cache = extension === ".html" || extension === ".js" || extension === ".css" ? { "Cache-Control": "no-cache" } : {};
    send(response, 200, bytes, types[extension] || "application/octet-stream", cache);
  } catch (error) {
    send(response, 500, { error: error.message });
  }
});

const onListen = () => {
  console.log(`desk http://localhost:${config.port}`);
};
if (process.env.DESK_HOST) server.listen(config.port, process.env.DESK_HOST, onListen);
else server.listen(config.port, onListen);
