const SVG_NS = "http://www.w3.org/2000/svg";

const ICONS = {
  plus: "M12 5v14M5 12h14",
  check: "M5 12.5l4.5 4.5L19 7.5",
  alert: "M12 3.5L2.8 19.5h18.4zM12 10v4.5M12 17v.01",
  info: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v5M12 8v.01",
  external: "M14 4h6v6M20 4l-9 9M18 14v5H5V6h5",
  file: "M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8zM14 3v5h5",
  search: "M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4",
  back: "M19 12H5M11 6l-6 6 6 6",
  copy: "M8 8h11v12H8zM5 16V4h11",
  upload: "M12 16V4M7 9l5-5 5 5M5 20h14",
  close: "M6 6l12 12M18 6L6 18",
  shield: "M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6z",
};

const EXAMPLES = [
  { label: "Sales tax on a retail sale", ask: "Does a California retailer owe sales tax on a retail sale of tangible personal property?", topic: "legal_or_regulatory" },
  { label: "Forming an LLC", ask: "What does Corporations Code section 17702.01 require to form a limited liability company?", topic: "legal_or_regulatory" },
  { label: "San Francisco registration", ask: "Who must register a business with San Francisco?", topic: "legal_or_regulatory" },
  { label: "A question with no document", ask: "What is the San Francisco mansion transfer tax rate?", topic: "legal_or_regulatory" },
];

const KIND_LABEL = { conclusion: "Answer", status_or_document_chase: "Note about what is missing" };

const STATUS = {
  review: { label: "Waiting for your approval", tone: "warn" },
  needs: { label: "Needs a saved document", tone: "danger" },
  approved: { label: "Approved", tone: "success" },
  unfinished: { label: "Draft did not finish", tone: "danger" },
};

const AUTHORITY_LABEL = {
  statute: "Statute",
  regulation: "Regulation",
  guidance: "Official guidance",
  firm_policy: "Firm policy",
};

const REPLY_FILTERS = [
  ["all", "All"],
  ["review", "To review"],
  ["needs", "Needs a document"],
  ["approved", "Approved"],
];

const DOC_FILTERS = [
  ["all", "All"],
  ["California", "California"],
  ["San Francisco", "San Francisco"],
  ["Firm policy", "Firm policy"],
];

const FILE_HINT = "Choose a file or drop it here";

const $ = (selector) => document.querySelector(selector);

const dom = {
  repliesView: $("#view-replies"),
  documentsView: $("#view-documents"),
  queue: $("#queue"),
  filters: $("#filters"),
  workspace: $("#workspace"),
  composer: $("#composer"),
  intake: $("#intake"),
  ask: $("#ask"),
  askError: $("#ask-error"),
  topic: $("#topic"),
  examples: $("#examples"),
  library: $("#library"),
  librarySummary: $("#library-summary"),
  libraryForm: $("#library-form"),
  libraryMessage: $("#library-message"),
  docSearch: $("#doc-search"),
  docFilters: $("#doc-filters"),
  fileInput: $("#source-file"),
  fileName: $("#file-name"),
  drop: $("#drop-label"),
  sourceTitle: $("#source-title"),
  status: $("#status"),
  statusText: $("#status-text"),
  toasts: $("#toasts"),
  countReplies: $("#count-replies"),
  countDocuments: $("#count-documents"),
};

const state = {
  tickets: [],
  sources: [],
  openId: "",
  composing: false,
  pending: null,
  pane: "list",
  filter: "all",
  docFilter: "all",
  docQuery: "",
  knownDocs: null,
  freshDocs: new Set(),
  copied: {},
  view: "replies",
  loaded: false,
  uploads: false,
};

function el(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === false || value == null) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? "" : value);
  }
  node.append(...kids.flat().filter((kid) => kid != null && kid !== false));
  return node;
}

function icon(name) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.75");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "icon");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", ICONS[name]);
  svg.append(path);
  return svg;
}

for (const slot of document.querySelectorAll("[data-icon]")) {
  slot.replaceWith(icon(slot.dataset.icon));
}

async function api(path, options = {}) {
  const response = await fetch(path, options);
  const type = response.headers.get("content-type") || "";
  const payload = type.includes("application/json") ? await response.json() : null;
  if (!response.ok) throw new Error(payload?.error || "Something went wrong. Try again.");
  return payload;
}

function setStatus(text, tone) {
  dom.status.dataset.tone = tone;
  dom.statusText.textContent = text;
}

function toast(message, tone = "info") {
  const node = el(
    "div",
    { class: "toast", "data-tone": tone, role: tone === "error" ? "alert" : "status" },
    icon(tone === "success" ? "check" : tone === "info" ? "info" : "alert"),
    el("p", { text: message }),
    el("button", { type: "button", "aria-label": "Dismiss", onclick: () => node.remove() }, icon("close")),
  );
  dom.toasts.append(node);
  while (dom.toasts.children.length > 3) dom.toasts.firstElementChild.remove();
  if (tone !== "error") setTimeout(() => node.remove(), 6000);
}

function when(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay ? `Today, ${time}` : `${date.toLocaleDateString([], { month: "short", day: "numeric" })}, ${time}`;
}

function ticketStatus(ticket) {
  if (!ticket.draft) return "unfinished";
  if (ticket.draft.outcome === "unsupported") return "needs";
  if (ticket.state === "approved") return "approved";
  return "review";
}

function baseTitle(title) {
  return String(title || "").replace(/\s*\(part \d+ of \d+\)\s*$/i, "");
}

function cleanPassage(raw, title) {
  let text = String(raw || "");
  text = text.replace(/^\s*DOCID\s+\S+?\.\s*/, "");
  text = text.replace(/^[^\n]*Official text retrieved[^\n]*\n?/m, "");
  text = text.replace(/^(Citation|Jurisdiction|Authority|Document|Section|Effective|Part):[^\n]*\n?/gm, "");
  const heading = baseTitle(title);
  if (heading) {
    const lines = text.replace(/^\s+/, "").split("\n");
    if (lines[0] && lines[0].trim().startsWith(heading)) lines.shift();
    text = lines.join("\n");
    if (text.trimStart().startsWith(`${heading}. `)) text = text.trimStart().slice(heading.length + 2);
  }
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

function currentTicket() {
  return state.tickets.find((item) => item.ticketId === state.openId) || null;
}

function countByStatus() {
  const counts = { all: state.tickets.length, review: 0, needs: 0, approved: 0 };
  for (const ticket of state.tickets) {
    const key = ticketStatus(ticket);
    if (key in counts) counts[key] += 1;
  }
  return counts;
}

function renderNavCounts() {
  const waiting = countByStatus().review;
  dom.countReplies.hidden = waiting === 0;
  dom.countReplies.textContent = String(waiting);
  dom.countReplies.setAttribute("aria-label", `${waiting} waiting for your approval`);
  const documents = groupSources(state.sources).length;
  dom.countDocuments.hidden = documents === 0;
  dom.countDocuments.textContent = String(documents);
  dom.countDocuments.setAttribute("aria-label", `${documents} saved documents`);
}

function renderFilters() {
  const counts = countByStatus();
  dom.filters.replaceChildren(
    ...REPLY_FILTERS.map(([key, label]) =>
      el(
        "button",
        {
          type: "button",
          "aria-pressed": String(state.filter === key),
          onclick: () => {
            state.filter = key;
            renderQueue();
          },
        },
        label,
        el("span", { class: "n", text: String(counts[key] ?? 0) }),
      ),
    ),
  );
}

function renderQueue() {
  renderFilters();
  renderNavCounts();
  dom.queue.replaceChildren();

  if (!state.loaded) {
    for (const width of ["88%", "72%", "80%"]) {
      dom.queue.append(
        el("li", { class: "empty", "aria-hidden": "true" }, el("span", { class: "skeleton", style: `width: ${width}` }), el("span", { class: "skeleton", style: "width: 40%" })),
      );
    }
    return;
  }

  if (state.pending) {
    dom.queue.append(
      el(
        "li",
        {},
        el(
          "div",
          { class: "row", "aria-busy": "true" },
          el("span", { class: "row-ask", text: state.pending }),
          el("span", { class: "row-meta" }, el("span", { class: "badge", "data-tone": "info", text: "Writing the draft…" })),
        ),
      ),
    );
  }

  const visible = state.tickets.filter((ticket) => state.filter === "all" || ticketStatus(ticket) === state.filter);

  if (state.tickets.length === 0 && !state.pending) {
    dom.queue.append(
      el(
        "li",
        { class: "empty" },
        el("strong", { text: "No replies yet" }),
        "Ask a question and the draft will show up here.",
      ),
    );
    return;
  }

  if (visible.length === 0 && state.tickets.length > 0) {
    dom.queue.append(
      el(
        "li",
        { class: "empty" },
        el("strong", { text: "Nothing in this view" }),
        "No replies match this filter.",
        el("br"),
        el("button", { class: "secondary compact", type: "button", onclick: () => { state.filter = "all"; renderQueue(); } }, "Show all replies"),
      ),
    );
    return;
  }

  for (const ticket of visible) {
    const status = STATUS[ticketStatus(ticket)];
    const selected = !state.composing && !state.pending && ticket.ticketId === state.openId;
    dom.queue.append(
      el(
        "li",
        {},
        el(
          "button",
          {
            class: "row",
            type: "button",
            "aria-current": selected ? "true" : false,
            onclick: () => openTicket(ticket.ticketId),
          },
          el("span", { class: "row-ask", text: ticket.askText }),
          el(
            "span",
            { class: "row-meta" },
            el("span", { class: "badge", "data-tone": status.tone, text: status.label }),
            el("span", { text: when(ticket.createdAt) }),
          ),
        ),
      ),
    );
  }
}

function syncStage() {
  const ticket = currentTicket();
  const showComposer = state.loaded && (state.composing || (!state.pending && !ticket));
  dom.composer.hidden = !showComposer;
  dom.workspace.hidden = showComposer;
  dom.repliesView.dataset.pane = state.pane;
}

function openTicket(id) {
  state.openId = id;
  state.composing = false;
  state.pane = "detail";
  renderQueue();
  syncStage();
  renderWorkspace(true);
  if (matchMedia("(max-width: 1023px)").matches) window.scrollTo({ top: 0 });
}

function openComposer(prefill) {
  state.composing = true;
  state.pane = "detail";
  if (prefill) dom.ask.value = prefill;
  renderQueue();
  syncStage();
  dom.ask.focus();
}

function backToList() {
  state.pane = "list";
  syncStage();
}

function groupSources(sources) {
  const groups = new Map();
  for (const source of sources) {
    const name = baseTitle(source.title);
    const key = `${source.brainRole}:${name}`;
    const group = groups.get(key) || { key, name, parts: 0, fileId: null, fileName: null, role: source.brainRole };
    group.parts += 1;
    if (source.fileId && !group.fileId) {
      group.fileId = source.fileId;
      group.fileName = source.fileName;
    }
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => {
      const match = /^(California|San Francisco)\s+—\s+(.*)$/.exec(group.name);
      const area = group.role === "firm" ? "Firm policy" : match ? match[1] : "Rule";
      return { ...group, area, display: match ? match[2] : group.name };
    })
    .sort((a, b) => a.display.localeCompare(b.display, undefined, { numeric: true, sensitivity: "base" }));
}

function renderDocFilters(groups) {
  dom.docFilters.replaceChildren(
    ...DOC_FILTERS.map(([key, label]) => {
      const count = key === "all" ? groups.length : groups.filter((group) => group.area === key).length;
      return el(
        "button",
        {
          type: "button",
          "aria-pressed": String(state.docFilter === key),
          onclick: () => {
            state.docFilter = key;
            renderLibrary();
          },
        },
        label,
        el("span", { class: "n", text: String(count) }),
      );
    }),
  );
}

function renderLibrary() {
  const groups = groupSources(state.sources);
  renderDocFilters(groups);
  renderNavCounts();
  const parts = state.sources.length;
  dom.librarySummary.textContent =
    groups.length === 0
      ? "Nothing is saved yet. Add a policy or a California or San Francisco rule."
      : `${groups.length} ${groups.length === 1 ? "document" : "documents"} saved, in ${parts} ${parts === 1 ? "part" : "parts"}. Replies use these and nothing else.`;

  const query = state.docQuery.trim().toLowerCase();
  const visible = groups.filter(
    (group) =>
      (state.docFilter === "all" || group.area === state.docFilter) &&
      (!query || `${group.display} ${group.area}`.toLowerCase().includes(query)),
  );

  dom.library.replaceChildren();
  if (visible.length === 0) {
    const message = groups.length === 0 ? "No documents yet" : "No documents match";
    const detail =
      groups.length === 0
        ? "Save a policy or a California or San Francisco rule using the form."
        : query
          ? `Nothing is named “${state.docQuery.trim()}” in this view.`
          : "Nothing is saved in this group yet.";
    dom.library.append(
      el(
        "li",
        { class: "empty" },
        el("strong", { text: message }),
        detail,
        groups.length > 0
          ? el(
              "div",
              {},
              el(
                "button",
                {
                  class: "secondary compact",
                  type: "button",
                  onclick: () => {
                    state.docQuery = "";
                    state.docFilter = "all";
                    dom.docSearch.value = "";
                    renderLibrary();
                  },
                },
                "Clear search and filters",
              ),
            )
          : null,
      ),
    );
    return;
  }

  for (const group of visible) {
    const fresh = state.freshDocs.has(group.key);
    dom.library.append(
      el(
        "li",
        {},
        el(
          "div",
          { class: "doc", "data-new": fresh ? "true" : false },
          el("span", { class: "doc-icon" }, icon("file")),
          el(
            "div",
            {},
            el("p", { class: "doc-name", text: group.display }),
            el(
              "div",
              { class: "doc-meta" },
              el("span", { class: "badge", "data-tone": group.area === "Firm policy" ? "info" : "", text: group.area }),
              el("span", { text: group.parts > 1 ? `${group.parts} parts` : "1 part" }),
              group.fileName ? el("span", { text: group.fileName }) : null,
              fresh ? el("span", { class: "badge", "data-tone": "success", text: "Just saved" }) : null,
            ),
          ),
          group.fileId
            ? el(
                "a",
                {
                  class: "file-link",
                  href: `/api/files/${encodeURIComponent(group.fileId)}`,
                  "aria-label": `Open the saved file for ${group.display}`,
                },
                "Open file",
                icon("external"),
              )
            : null,
        ),
      ),
    );
  }
}

function applySources(sources) {
  const next = sources;
  const nextGroups = new Set(groupSources(next).map((group) => group.key));
  if (state.knownDocs) {
    for (const key of nextGroups) if (!state.knownDocs.has(key)) state.freshDocs.add(key);
  }
  state.knownDocs = nextGroups;
  state.sources = next;
  renderLibrary();
}

async function refreshSources() {
  const { sources } = await api("/api/sources");
  if (sources.length !== state.sources.length) applySources(sources);
}

function sourceFlash(node) {
  node.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
  node.dataset.flash = "true";
  setTimeout(() => delete node.dataset.flash, 1400);
}

function sourceHost(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function passageBlock(text) {
  const long = text.length > 900;
  const passage = el("p", { class: "passage", "data-clamped": long ? "true" : false, text });
  if (!long) return [passage];
  const toggle = el(
    "button",
    {
      class: "quiet more",
      type: "button",
      "aria-expanded": "false",
      onclick: () => {
        const open = toggle.getAttribute("aria-expanded") === "true";
        toggle.setAttribute("aria-expanded", String(!open));
        passage.dataset.clamped = String(open);
        toggle.textContent = open ? "Show the full text" : "Show less";
      },
    },
    "Show the full text",
  );
  return [passage, toggle];
}

function renderWorkspace(focusHeading = false) {
  const ticket = currentTicket();
  dom.workspace.replaceChildren();

  if (!state.loaded) {
    dom.workspace.append(
      el(
        "div",
        { "aria-busy": "true", "aria-label": "Loading replies" },
        el("span", { class: "skeleton", style: "width: 70%; height: 1.75rem" }),
        el("span", { class: "skeleton", style: "width: 100%" }),
        el("span", { class: "skeleton", style: "width: 92%" }),
        el("span", { class: "skeleton", style: "width: 60%" }),
      ),
    );
    return;
  }

  if (state.pending) {
    dom.workspace.append(
      el(
        "div",
        { "aria-busy": "true" },
        el("button", { class: "back", type: "button", "data-back": "", onclick: backToList }, icon("back"), "All replies"),
        el("div", { class: "workspace-head" }, el("h2", { text: state.pending }), el("p", { class: "meta", text: "Looking through your saved documents…" })),
        el("span", { class: "skeleton", style: "width: 92%" }),
        el("span", { class: "skeleton", style: "width: 100%" }),
        el("span", { class: "skeleton", style: "width: 78%" }),
        el("span", { class: "skeleton", style: "width: 88%" }),
        el("span", { class: "skeleton", style: "width: 52%" }),
      ),
    );
    return;
  }
  if (!ticket) return;

  const statusKey = ticketStatus(ticket);
  const status = STATUS[statusKey];
  const heading = el("h2", { tabindex: "-1", text: ticket.askText });
  dom.workspace.append(
    el("button", { class: "back", type: "button", onclick: backToList }, icon("back"), "All replies"),
    el(
      "div",
      { class: "workspace-head" },
      heading,
      el(
        "div",
        { class: "meta" },
        el("span", { class: "badge", "data-tone": status.tone, text: status.label }),
        el("span", { text: KIND_LABEL[ticket.riskClass] || "Reply" }),
        el("span", { text: when(ticket.createdAt) }),
      ),
    ),
  );

  if (!ticket.draft) {
    dom.workspace.append(
      el(
        "div",
        { class: "callout", "data-tone": "danger", role: "alert" },
        icon("alert"),
        el(
          "div",
          {},
          el("strong", { text: "This draft did not finish" }),
          el("p", { text: "Nothing was written for this question. Ask it again to get a draft." }),
          el("button", { class: "secondary", type: "button", onclick: () => openComposer(ticket.askText) }, "Ask this question again"),
        ),
      ),
    );
    return;
  }

  const citations = ticket.draft.citations || [];
  const citeNodes = new Map();
  const draft = el("section", { "aria-labelledby": "draft-title" });
  draft.append(el("div", { class: "section-title" }, el("h3", { id: "draft-title", text: "Draft reply" }), el("small", { text: "Not sent" })));

  ticket.draft.sentences.forEach((sentence) => {
    const row = el("article", { class: "sentence" });
    const unsupported = sentence.support !== "cited" && sentence.kind !== "status_update";
    if (sentence.kind === "gap" || unsupported) {
      row.append(
        el(
          "div",
          { class: "callout", "data-tone": "danger" },
          icon("alert"),
          el(
            "div",
            {},
            el("strong", { text: "Not supported by a saved document" }),
            el("p", { text: sentence.text }),
            state.uploads
              ? el("button", { class: "secondary compact", type: "button", onclick: () => { location.hash = "#documents"; } }, "Add a document")
              : null,
          ),
        ),
      );
    } else if (sentence.kind === "status_update") {
      row.append(
        el("div", { class: "callout", "data-tone": "info" }, icon("info"), el("div", {}, el("strong", { text: "From this question" }), el("p", { text: sentence.text }))),
      );
    } else {
      const handles = sentence.handles || [];
      const first = citations.find((item) => item.handle === handles[0]);
      const cites = el("div", { class: "cites" }, "From a saved document");
      for (const handle of handles) {
        const position = citations.findIndex((item) => item.handle === handle);
        if (position < 0) continue;
        cites.append(
          el(
            "button",
            {
              class: "cite",
              type: "button",
              "aria-label": `Go to source ${position + 1}`,
              onclick: () => citeNodes.get(handle) && sourceFlash(citeNodes.get(handle)),
            },
            `Source ${position + 1}`,
          ),
        );
      }
      row.append(cites, ...passageBlock(cleanPassage(sentence.text, first?.title)));
    }
    draft.append(row);
  });
  dom.workspace.append(draft);

  if (citations.length > 0) {
    const list = el("ol", { class: "sources", "aria-label": "Sources" });
    citations.forEach((citation, index) => {
      const node = el(
        "li",
        { class: "source" },
        el("span", { class: "source-n", text: String(index + 1) }),
        el(
          "div",
          {},
          el("p", { class: "source-title", text: citation.title }),
          el(
            "div",
            { class: "source-facts" },
            citation.citation && citation.citation !== citation.title ? el("span", { text: citation.citation }) : null,
            citation.authorityLevel && AUTHORITY_LABEL[citation.authorityLevel] && /^Authority:/m.test(citation.snippet || "")
              ? el("span", { class: "badge", text: AUTHORITY_LABEL[citation.authorityLevel] })
              : null,
            citation.effectiveDate ? el("span", { text: `Effective ${citation.effectiveDate}` }) : null,
            citation.sourceUrl
              ? el(
                  "a",
                  { class: "source-link", href: citation.sourceUrl, target: "_blank", rel: "noopener noreferrer" },
                  `Official source: ${sourceHost(citation.sourceUrl) || "open"}`,
                  icon("external"),
                )
              : null,
          ),
        ),
      );
      citeNodes.set(citation.handle, node);
      list.append(node);
    });
    dom.workspace.append(
      el("div", { class: "section-title" }, el("h3", { text: "Sources" }), el("small", { text: `${citations.length} used` })),
      list,
    );
  }

  if (state.copied[ticket.ticketId]) {
    dom.workspace.append(
      el(
        "div",
        { class: "copied" },
        el("label", { for: "copied-reply", text: "The reply" }),
        el("textarea", { id: "copied-reply", readonly: true, text: state.copied[ticket.ticketId] }),
      ),
    );
  }

  dom.workspace.append(reviewBar(ticket, statusKey));

  if (focusHeading) heading.focus({ preventScroll: true });
}

function reviewBar(ticket, statusKey) {
  const approved = statusKey === "approved";
  const blocked = statusKey === "needs";

  const approve = el("button", { class: "primary", type: "button" }, icon("check"), "Approve this reply");
  approve.disabled = approved || blocked;
  approve.addEventListener("click", async () => {
    approve.disabled = true;
    approve.dataset.busy = "true";
    approve.lastChild.textContent = "Approving…";
    try {
      const payload = await api(`/api/tickets/${ticket.ticketId}/approve`, { method: "POST", body: "{}" });
      toast("Approved. You can copy it now. It has not been sent.", "success");
      replaceTicket(payload.ticket);
    } catch (error) {
      toast(error.message, "error");
      approve.disabled = false;
      delete approve.dataset.busy;
      approve.lastChild.textContent = "Approve this reply";
    }
  });

  const copy = el("button", { class: "secondary", type: "button" }, icon("copy"), "Copy the reply");
  copy.disabled = !approved;
  copy.addEventListener("click", async () => {
    copy.disabled = true;
    try {
      const payload = await api(`/api/tickets/${ticket.ticketId}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: "copy" }),
      });
      state.copied[ticket.ticketId] = payload.text;
      renderWorkspace();
      const box = $("#copied-reply");
      try {
        await navigator.clipboard.writeText(payload.text);
        toast("Copied. This text has not been sent to the client.", "success");
      } catch {
        box?.focus();
        box?.select();
        toast("The reply is in the box on this page. It has not been sent to the client.", "info");
      }
    } catch (error) {
      toast(error.message, "error");
      copy.disabled = false;
    }
  });

  let note;
  if (approved) {
    note = el("p", { class: "review-note", "data-tone": "success" }, icon("shield"), "Approved by the review principal. This has not been sent.");
  } else if (blocked) {
    note = el("p", { class: "review-note", "data-tone": "danger" }, icon("alert"), "This reply cannot be approved until a saved document supports it.");
  } else {
    note = el("p", { class: "review-note" }, icon("shield"), "Not sent. A person approves it here, and sending is your act.");
  }

  return el("div", { class: "review" }, note, el("div", { class: "actions" }, copy, approve));
}

function replaceTicket(ticket) {
  state.tickets = [ticket, ...state.tickets.filter((item) => item.ticketId !== ticket.ticketId)];
  state.openId = ticket.ticketId;
  state.composing = false;
  state.pending = null;
  renderQueue();
  renderWorkspace();
  syncStage();
}

function buildExamples() {
  for (const example of EXAMPLES) {
    dom.examples.append(
      el(
        "button",
        {
          class: "chip",
          type: "button",
          onclick: () => {
            dom.ask.value = example.ask;
            dom.topic.value = example.topic;
            dom.askError.hidden = true;
            dom.ask.removeAttribute("aria-invalid");
            dom.ask.focus();
          },
        },
        example.label,
      ),
    );
  }
}

async function submitQuestion(event) {
  event.preventDefault();
  const form = dom.intake;
  const button = form.querySelector("button[type=submit]");
  const data = new FormData(form);
  const askText = String(data.get("ask") || "").trim();
  if (!askText) {
    dom.askError.textContent = "Write the client’s question first.";
    dom.askError.hidden = false;
    dom.ask.setAttribute("aria-invalid", "true");
    dom.ask.focus();
    return;
  }
  dom.askError.hidden = true;
  dom.ask.removeAttribute("aria-invalid");
  button.disabled = true;
  button.dataset.busy = "true";
  button.textContent = "Writing the draft…";
  state.pending = askText;
  state.composing = false;
  state.pane = "detail";
  renderQueue();
  renderWorkspace();
  syncStage();
  try {
    const payload = await api("/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ askText, topic: data.get("topic"), riskClass: data.get("risk") }),
    });
    form.reset();
    replaceTicket(payload.ticket);
    const heading = dom.workspace.querySelector("h2");
    heading?.focus({ preventScroll: true });
    if (payload.ticket.draft?.outcome === "unsupported") {
      toast("The draft needs a saved document before it can be approved.", "warn");
    } else {
      toast("The draft is ready for your approval. It has not been sent.", "success");
    }
  } catch (error) {
    state.pending = null;
    state.composing = true;
    renderQueue();
    renderWorkspace();
    syncStage();
    dom.askError.textContent = error.message;
    dom.askError.hidden = false;
    toast(error.message, "error");
  } finally {
    button.disabled = false;
    delete button.dataset.busy;
    button.textContent = "Write a draft";
  }
}

function setFile(file) {
  dom.fileName.textContent = file ? file.name : FILE_HINT;
  dom.drop.dataset.hasFile = file ? "true" : "false";
  if (file && !dom.sourceTitle.value.trim()) {
    dom.sourceTitle.value = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
  }
}

async function submitDocument(event) {
  event.preventDefault();
  const form = dom.libraryForm;
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  button.dataset.busy = "true";
  button.textContent = "Saving…";
  dom.libraryMessage.textContent = "Reading the file on this computer. This can take a minute.";
  try {
    const body = new FormData(form);
    const payload = await api("/api/files", { method: "POST", body });
    form.reset();
    setFile(null);
    dom.libraryMessage.textContent = payload.trimmed
      ? "Saved. Only the first part of this long document will be used in replies."
      : "Saved on this computer. The next reply can use it.";
    toast("Document saved. The next reply can use it.", "success");
    applySources((await api("/api/sources")).sources);
  } catch (error) {
    dom.libraryMessage.textContent = error.message;
    toast(error.message, "error");
  } finally {
    button.disabled = false;
    delete button.dataset.busy;
    button.textContent = "Save this document";
  }
}

function route() {
  state.view = location.hash === "#documents" ? "documents" : "replies";
  dom.repliesView.hidden = state.view !== "replies";
  dom.documentsView.hidden = state.view !== "documents";
  for (const link of document.querySelectorAll(".tabs a")) {
    if (link.dataset.view === state.view) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  document.title = state.view === "documents" ? "Documents · Reply desk" : "Reply desk";
  if (state.view === "documents") refreshSources().catch(() => {});
}

function applyUploads(enabled) {
  const next = enabled !== false;
  const changed = state.uploads !== next;
  state.uploads = next;
  dom.documentsView.dataset.uploads = next ? "on" : "off";
  if (changed && !dom.workspace.hidden) renderWorkspace();
}

async function checkHealth(first) {
  try {
    const health = await api("/api/health");
    applyUploads(health.uploads);
    if (health.brain === "ok") {
      setStatus("Ready. Replies use the documents saved here.", "ok");
      if (first) {
        try {
          applySources((await api("/api/library/seed", { method: "POST", body: "{}" })).sources);
        } catch (error) {
          toast(error.message, "error");
          applySources((await api("/api/sources")).sources);
        }
      }
      return;
    }
    setStatus("The document memory is not running. Start it, then refresh this page.", "err");
  } catch {
    setStatus("The desk could not be reached. Check that it is running.", "err");
  }
  if (first) applySources([]);
}

dom.intake.addEventListener("submit", submitQuestion);
dom.libraryForm.addEventListener("submit", submitDocument);

dom.ask.addEventListener("input", () => {
  if (dom.ask.value.trim()) {
    dom.askError.hidden = true;
    dom.ask.removeAttribute("aria-invalid");
  }
});

dom.ask.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    dom.intake.requestSubmit();
  }
});

$("#new-question").addEventListener("click", () => openComposer());

for (const back of document.querySelectorAll("[data-back]")) back.addEventListener("click", backToList);

dom.docSearch.addEventListener("input", () => {
  state.docQuery = dom.docSearch.value;
  renderLibrary();
});

dom.fileInput.addEventListener("change", () => setFile(dom.fileInput.files?.[0] || null));

for (const type of ["dragenter", "dragover"]) {
  dom.drop.addEventListener(type, (event) => {
    event.preventDefault();
    dom.drop.dataset.over = "true";
  });
}
for (const type of ["dragleave", "drop"]) {
  dom.drop.addEventListener(type, (event) => {
    event.preventDefault();
    delete dom.drop.dataset.over;
  });
}
dom.drop.addEventListener("drop", (event) => {
  const file = event.dataTransfer?.files?.[0];
  if (!file) return;
  const transfer = new DataTransfer();
  transfer.items.add(file);
  dom.fileInput.files = transfer.files;
  setFile(file);
});

window.addEventListener("hashchange", route);

setInterval(() => {
  if (document.hidden) return;
  if (state.view === "documents") refreshSources().catch(() => {});
  checkHealth(false);
}, 15000);

$("#shortcut").textContent = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘ Enter" : "Ctrl Enter";

buildExamples();
route();
renderLibrary();
renderQueue();
renderWorkspace();
syncStage();

await checkHealth(true);

try {
  state.tickets = (await api("/api/tickets")).tickets;
  if (state.tickets[0]) state.openId = state.tickets[0].ticketId;
} catch (error) {
  toast(error.message, "error");
} finally {
  state.loaded = true;
  renderQueue();
  renderWorkspace();
  syncStage();
}
