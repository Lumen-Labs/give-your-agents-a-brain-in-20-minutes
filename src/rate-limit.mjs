const windows = new Map();

export const limits = {
  page: { limit: 180, windowMs: 60_000, message: "Too many requests from this network. Wait a moment and try again." },
  api: { limit: 90, windowMs: 60_000, message: "Too many requests from this network. Wait a moment and try again." },
  draft: { limit: 6, windowMs: 60 * 60_000, message: "This network has asked for too many drafts. Wait and try again." },
  ingest: { limit: 4, windowMs: 60 * 60_000, message: "This network has saved too many documents. Wait and try again." },
  pageAll: { limit: 800, windowMs: 60_000, message: "The demo is busy. Wait a moment and try again." },
  apiAll: { limit: 400, windowMs: 60_000, message: "The demo is busy. Wait a moment and try again." },
  draftAll: { limit: 30, windowMs: 60 * 60_000, message: "The demo is busy with drafts. Wait a few minutes and try again." },
  ingestAll: { limit: 12, windowMs: 60 * 60_000, message: "The demo is busy saving documents. Wait a few minutes and try again." },
};

function hit(key, rule, now) {
  const current = windows.get(key);
  const fresh = !current || now - current.start >= rule.windowMs;
  const bucket = fresh ? { start: now, count: 0 } : current;
  bucket.count += 1;
  windows.set(key, bucket);
  if (bucket.count > rule.limit) {
    return {
      ok: false,
      retryAfter: Math.max(1, Math.ceil((bucket.start + rule.windowMs - now) / 1000)),
      message: rule.message,
    };
  }
  return { ok: true };
}

export function allow(address, scope, now = Date.now()) {
  if (!address) return { ok: true };
  if (windows.size > 5000) {
    for (const [key, bucket] of windows) {
      if (now - bucket.start > 60 * 60_000) windows.delete(key);
    }
  }
  const own = hit(`${scope}:${address}`, limits[scope], now);
  if (!own.ok) return own;
  const shared = limits[`${scope}All`];
  if (!shared) return own;
  return hit(`${scope}:*`, shared, now);
}

export function resetLimits() {
  windows.clear();
}

export function clientAddress(request) {
  const remote = String(request.socket?.remoteAddress || "");
  const loopback = remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1";
  if (!loopback) return remote.replace(/^::ffff:/, "");
  const forwarded = String(request.headers?.["x-forwarded-for"] || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return forwarded.at(-1) || "";
}
