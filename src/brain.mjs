const TERMINAL = new Set([
  "completed",
  "success",
  "succeeded",
  "failed",
  "partial_failed",
  "cancelled",
  "canceled",
  "rollback_failed",
  "error",
]);

export function createBrainClient({ baseUrl, token, fetchImpl = fetch }) {
  const root = baseUrl.replace(/\/$/, "");

  async function request(path, { method = "GET", brainId, body } = {}) {
    const headers = { BrainPAT: token, Accept: "application/json" };
    if (brainId) headers["X-Brain-ID"] = brainId;
    if (body) headers["Content-Type"] = "application/json";
    const response = await fetchImpl(`${root}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    let payload = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { message: text.slice(0, 500) };
      }
    }
    if (!response.ok) {
      const detail = payload?.error?.message || payload?.detail || payload?.message || response.statusText;
      const error = new Error(`BrainAPI ${response.status}: ${detail}`);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  return {
    async health() {
      await request("/");
      return { ok: true };
    },

    async ingestText(brainId, text) {
      const accepted = await request("/ingest/", {
        method: "POST",
        brainId,
        body: {
          data: { data_type: "text", text_data: text },
          skip_enrichment: true,
        },
      });
      const taskId = accepted?.task_id;
      if (!taskId) throw new Error("BrainAPI accepted ingest without a task id.");
      const task = await pollTask(request, brainId, taskId);
      return { taskId, task };
    },

    async context(brainId, text) {
      return request("/retrieve/context", {
        method: "POST",
        brainId,
        body: { text },
      });
    },
  };
}

async function pollTask(request, brainId, taskId) {
  const started = Date.now();
  while (Date.now() - started < 1200000) {
    const task = await request(`/tasks/${encodeURIComponent(taskId)}`, { brainId });
    const status = String(task?.status || task?.state || "").toLowerCase();
    if (TERMINAL.has(status)) {
      if (status !== "completed" && status !== "success" && status !== "succeeded") {
        throw new Error(`Ingest ${status}: ${task?.error?.message || task?.detail || "task failed"}`);
      }
      return task;
    }
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
  throw new Error("Ingest task did not finish within 20 minutes.");
}

export function passagesFromContext(payload) {
  const found = [];
  const raw = payload?.source_passages || payload?.passages || [];
  if (Array.isArray(raw)) {
    raw.forEach((item, index) => {
      if (typeof item === "string" && item.trim()) {
        found.push({ chunkId: `p${index + 1}`, text: item.trim() });
        return;
      }
      if (item && typeof item === "object") {
        const text = item.text || item.content || item.passage || item.snippet || "";
        if (String(text).trim()) {
          found.push({
            chunkId: String(item.id || item.chunk_id || `p${index + 1}`),
            text: String(text).trim(),
          });
        }
      }
    });
  }
  if (found.length === 0 && typeof payload?.text_context === "string" && payload.text_context.trim()) {
    found.push({ chunkId: "context", text: payload.text_context.trim() });
  }
  return found;
}
