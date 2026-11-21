import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export function openStore(file) {
  mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS sources (
      source_key TEXT PRIMARY KEY,
      brain_id TEXT NOT NULL,
      brain_role TEXT NOT NULL,
      authority_level TEXT NOT NULL,
      jurisdiction_id TEXT,
      version INTEGER NOT NULL,
      content_hash TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tickets (
      ticket_id TEXT PRIMARY KEY,
      firm_id TEXT NOT NULL,
      matter_id TEXT NOT NULL,
      ask_text TEXT NOT NULL,
      jurisdiction_id TEXT NOT NULL,
      topic TEXT NOT NULL,
      risk_class TEXT NOT NULL,
      state TEXT NOT NULL,
      disclosure_gate TEXT NOT NULL,
      assignee_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS drafts (
      draft_id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL,
      revision INTEGER NOT NULL,
      outcome TEXT NOT NULL,
      disposition TEXT NOT NULL,
      body_text TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS approvals (
      approval_id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL,
      draft_id TEXT NOT NULL,
      revision INTEGER NOT NULL,
      content_hash TEXT NOT NULL,
      approver_id TEXT NOT NULL,
      effective_class TEXT NOT NULL,
      approved_text TEXT NOT NULL,
      sources_json TEXT NOT NULL,
      approved_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS review_events (
      event_id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS saved_files (
      file_id TEXT PRIMARY KEY,
      source_key TEXT NOT NULL,
      original_name TEXT NOT NULL,
      media_type TEXT NOT NULL,
      byte_size INTEGER NOT NULL,
      bytes BLOB NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  const sourceColumns = db.prepare("PRAGMA table_info(sources)").all();
  if (!sourceColumns.some((column) => column.name === "file_id")) {
    db.exec("ALTER TABLE sources ADD COLUMN file_id TEXT");
  }

  return {
    listSources() {
      return db.prepare(`
        SELECT sources.*, saved_files.original_name AS original_name, saved_files.byte_size AS byte_size
        FROM sources
        LEFT JOIN saved_files ON saved_files.file_id = sources.file_id
        ORDER BY sources.title
      `).all();
    },
    sourcesForBrain(brainId) {
      return db.prepare("SELECT * FROM sources WHERE brain_id = ? AND status = 'current'").all(brainId);
    },
    getSource(sourceKey) {
      return db.prepare("SELECT * FROM sources WHERE source_key = ?").get(sourceKey);
    },
    saveSource(source) {
      db.prepare(`
        INSERT INTO sources (
          source_key, brain_id, brain_role, authority_level, jurisdiction_id,
          version, content_hash, title, body, status, file_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(source_key) DO UPDATE SET
          version = excluded.version,
          content_hash = excluded.content_hash,
          title = excluded.title,
          body = excluded.body,
          status = excluded.status,
          file_id = COALESCE(excluded.file_id, sources.file_id)
      `).run(
        source.sourceKey,
        source.brainId,
        source.brainRole,
        source.authorityLevel,
        source.jurisdictionId,
        source.version,
        source.contentHash,
        source.title,
        source.body,
        source.status,
        source.fileId || null,
      );
    },
    saveFile(file) {
      db.prepare(`
        INSERT INTO saved_files (
          file_id, source_key, original_name, media_type, byte_size, bytes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        file.fileId,
        file.sourceKey,
        file.originalName,
        file.mediaType,
        file.byteSize,
        file.bytes,
        file.createdAt,
      );
    },
    getFile(fileId) {
      return db.prepare("SELECT * FROM saved_files WHERE file_id = ?").get(fileId);
    },
    currentSourceForBrain(brainId) {
      const rows = db.prepare("SELECT * FROM sources WHERE brain_id = ? AND status = 'current'").all(brainId);
      return rows.length === 1 ? rows[0] : null;
    },
    listTickets() {
      return db.prepare("SELECT * FROM tickets ORDER BY created_at DESC").all();
    },
    getTicket(ticketId) {
      return db.prepare("SELECT * FROM tickets WHERE ticket_id = ?").get(ticketId);
    },
    insertTicket(ticket) {
      db.prepare(`
        INSERT INTO tickets (
          ticket_id, firm_id, matter_id, ask_text, jurisdiction_id, topic,
          risk_class, state, disclosure_gate, assignee_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        ticket.ticketId,
        ticket.firmId,
        ticket.matterId,
        ticket.askText,
        ticket.jurisdictionId,
        ticket.topic,
        ticket.riskClass,
        ticket.state,
        ticket.disclosureGate,
        ticket.assigneeId,
        ticket.createdAt,
      );
    },
    setTicketState(ticketId, state) {
      db.prepare("UPDATE tickets SET state = ? WHERE ticket_id = ?").run(state, ticketId);
    },
    insertDraft(draft) {
      db.prepare(`
        INSERT INTO drafts (
          draft_id, ticket_id, revision, outcome, disposition, body_text,
          content_hash, payload_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        draft.draftId,
        draft.ticketId,
        draft.revision,
        draft.outcome,
        draft.disposition,
        draft.bodyText,
        draft.contentHash,
        JSON.stringify(draft.payload),
        draft.createdAt,
      );
    },
    latestDraft(ticketId) {
      const row = db.prepare(
        "SELECT * FROM drafts WHERE ticket_id = ? ORDER BY revision DESC LIMIT 1",
      ).get(ticketId);
      if (!row) return null;
      return { ...row, payload: JSON.parse(row.payload_json) };
    },
    nextRevision(ticketId) {
      const row = db.prepare("SELECT COALESCE(MAX(revision), 0) AS revision FROM drafts WHERE ticket_id = ?").get(ticketId);
      return row.revision + 1;
    },
    insertApproval(approval) {
      db.prepare(`
        INSERT INTO approvals (
          approval_id, ticket_id, draft_id, revision, content_hash, approver_id,
          effective_class, approved_text, sources_json, approved_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        approval.approvalId,
        approval.ticketId,
        approval.draftId,
        approval.revision,
        approval.contentHash,
        approval.approverId,
        approval.effectiveClass,
        approval.approvedText,
        JSON.stringify(approval.sources),
        approval.approvedAt,
      );
    },
    latestApproval(ticketId) {
      return db.prepare(
        "SELECT * FROM approvals WHERE ticket_id = ? ORDER BY approved_at DESC LIMIT 1",
      ).get(ticketId);
    },
    addEvent(event) {
      db.prepare(
        "INSERT INTO review_events (event_id, ticket_id, event_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?)",
      ).run(event.eventId, event.ticketId, event.eventType, JSON.stringify(event.payload), event.createdAt);
    },
  };
}

export function sourceView(row) {
  if (!row) return null;
  return {
    sourceKey: row.source_key,
    brainId: row.brain_id,
    brainRole: row.brain_role,
    authorityLevel: row.authority_level,
    jurisdictionId: row.jurisdiction_id,
    version: row.version,
    contentHash: row.content_hash,
    title: row.title,
    status: row.status,
    fileId: row.file_id || null,
    fileName: row.original_name || null,
    fileBytes: row.byte_size || null,
  };
}
