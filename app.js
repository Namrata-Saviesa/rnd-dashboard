const state = {
  data: null,
  view: new URLSearchParams(location.search).get("view") || "executive",
  search: "",
  status: "",
  risk: "",
  owner: "",
};

const executiveOnly = new URLSearchParams(location.search).get("view") === "executive-only";
if (executiveOnly) {
  state.view = "executive";
  document.body.classList.add("executive-only");
}

const viewMeta = {
  executive: ["Executive Dashboard", "Project health, blockers, risks, and library progress."],
  tracker: ["Project Tracker", "Reduced project update view with drill-down details."],
  blockers: ["Blockers View", "Active blockers grouped for management attention."],
  deadlines: ["Upcoming Deadlines", "Milestones, planned work, and delayed timeline items."],
  summary: ["Management Summary", "A concise readout generated from the tracker."],
};

const els = {
  content: document.getElementById("content"),
  viewTitle: document.getElementById("viewTitle"),
  viewSubtitle: document.getElementById("viewSubtitle"),
  refreshBtn: document.getElementById("refreshBtn"),
  searchInput: document.getElementById("searchInput"),
  statusFilter: document.getElementById("statusFilter"),
  riskFilter: document.getElementById("riskFilter"),
  ownerFilter: document.getElementById("ownerFilter"),
  lastRefresh: document.getElementById("lastRefresh"),
  dialog: document.getElementById("detailDialog"),
  dialogTitle: document.getElementById("dialogTitle"),
  dialogBody: document.getElementById("dialogBody"),
  closeDialog: document.getElementById("closeDialog"),
};

function sheet(name) {
  return state.data?.sheets?.[name] || [];
}

function normalize(value) {
  return String(value || "").trim();
}

function chip(value, kind) {
  const text = normalize(value) || "Unknown";
  const cls = `${kind}-${text.toLowerCase().replace(/\s+/g, "-")}`;
  return `<span class="chip ${cls}">${escapeHtml(text)}</span>`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function matchesFilters(row) {
  const searchBlob = Object.values(row).join(" ").toLowerCase();
  if (state.search && !searchBlob.includes(state.search.toLowerCase())) return false;
  if (state.status && normalize(row.Status) !== state.status) return false;
  if (state.risk && normalize(row.Risk) !== state.risk) return false;
  if (state.owner && !normalize(row.Owner).includes(state.owner)) return false;
  return true;
}

function updates() {
  return sheet("Updates").filter((row) => normalize(row.Project)).filter(matchesFilters);
}

function libraryStats() {
  return sheet("Library Stats").filter((row) => normalize(row["Library Type"]));
}

function activeBlockers() {
  return sheet("Blockers")
    .filter((row) => normalize(row.Project) && normalize(row.Project) !== "How to use")
    .filter((row) => {
      const searchBlob = Object.values(row).join(" ").toLowerCase();
      if (state.search && !searchBlob.includes(state.search.toLowerCase())) return false;
      if (state.status && normalize(row.Status) !== state.status) return false;
      if (state.risk && normalize(row.Risk) !== state.risk) return false;
      if (state.owner && !normalize(row.Owner).includes(state.owner)) return false;
      return true;
    });
}

function highRisks() {
  return updates().filter((row) => normalize(row.Risk) === "High");
}

function delayedItems() {
  return updates().filter((row) => normalize(row.Status) === "Delayed");
}

function populateFilters() {
  const allRows = sheet("Updates");
  fillSelect(els.statusFilter, "All statuses", unique(allRows.map((row) => normalize(row.Status))));
  fillSelect(els.riskFilter, "All risks", unique(allRows.map((row) => normalize(row.Risk))));
  fillSelect(els.ownerFilter, "All owners", unique(allRows.map((row) => normalize(row.Owner))));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function fillSelect(select, label, values) {
  const current = select.value;
  select.innerHTML = `<option value="">${label}</option>` + values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
  select.value = values.includes(current) ? current : "";
}

function setView(view) {
  state.view = view;
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  const [title, subtitle] = viewMeta[view];
  els.viewTitle.textContent = title;
  els.viewSubtitle.textContent = subtitle;
  render();
}

function render() {
  if (!state.data) {
    els.content.innerHTML = `<div class="empty">Loading tracker from Excel...</div>`;
    return;
  }
  const renderers = {
    executive: renderExecutive,
    tracker: renderTracker,
    blockers: renderBlockers,
    deadlines: renderDeadlines,
    summary: renderSummary,
  };
  renderers[state.view]();
}

function renderExecutive() {
  const rows = updates();
  const blockers = activeBlockers();
  const decisions = rows.filter((row) => normalize(row["Decision Needed"]) === "Yes");
  els.content.innerHTML = `
    <div class="pie-grid">${renderLibraryPies()}${renderShutterPie()}</div>
    <div class="grid-two">
      ${tablePanel("Critical Blockers", blockers.slice(0, 8), ["Project", "Owner", "Risk", "Next Action"])}
      ${tablePanel("Decisions Needed", decisions.slice(0, 8), ["Project", "Owner", "Risk", "Next Action"])}
    </div>`;
  bindRows(blockers.concat(decisions));
}

function kpi(label, value, note) {
  return `<div class="card"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div><div class="kpi-note">${note}</div></div>`;
}

function renderLibraryPies() {
  return libraryStats()
    .map((row) => {
      const total = Number(row["Unique Reference Libraries"] || 0);
      const created = Number(row["Created Libraries"] || 0);
      const pending = Number(row["Pending Libraries"] || 0);
      const pct = total ? Math.round((created / total) * 100) : 0;
      return `<div class="pie-card">
        <div class="pie-title">${escapeHtml(row["Library Type"])}</div>
        <div class="pie" style="--pct:${pct}%"></div>
        <div class="pie-caption">${created} created / ${pending} pending</div>
      </div>`;
    })
    .join("");
}

function renderShutterPie() {
  const total = 28;
  const created = 2;
  const pending = total - created;
  const pct = Math.round((created / total) * 100);
  return `<div class="pie-card">
    <div class="pie-title">Shutters</div>
    <div class="pie" style="--pct:${pct}%"></div>
    <div class="pie-caption">${created} created / ${pending} pending</div>
  </div>`;
}

function renderTracker() {
  els.content.innerHTML = tablePanel("Project Tracker", updates(), ["Date", "Project", "Category", "Owner", "Status", "Risk", "Next Action"]);
  bindRows(updates());
}

function renderBlockers() {
  els.content.innerHTML = tablePanel("Open Blockers", activeBlockers(), ["Project", "Blocker Type", "Owner", "Risk", "Root Cause", "Next Action"]);
  bindRows(activeBlockers());
}

function renderDeadlines() {
  const rows = sheet("Timeline").filter((row) => Object.values(row).join(" ").toLowerCase().includes(state.search.toLowerCase()));
  els.content.innerHTML = tablePanel("Timeline And Deadlines", rows, ["Project", "Milestone", "Status", "Due Date", "Owner", "Delay / Root Cause", "Next Action"]);
  bindRows(rows);
}

function renderSummary() {
  const blockers = activeBlockers();
  const risks = highRisks();
  const latest = updates().slice(-6).reverse();
  els.content.innerHTML = `
    <div class="summary-panel">
      <h2>Management Summary</h2>
      <p><strong>Current health:</strong> ${blockers.length || risks.length ? "At Risk" : "On Track"}</p>
      <p><strong>Main pressure:</strong> ${blockers.length} open blockers, ${risks.length} high-risk items, ${delayedItems().length} delayed items.</p>
    </div>
    <div class="grid-two">
      <div class="summary-panel">
        <h2>Critical Attention</h2>
        <ul class="summary-list">${blockers.slice(0, 6).map((row) => `<li>${escapeHtml(row.Project)}: ${escapeHtml(row["Next Action"] || row.Update)}</li>`).join("") || "<li>No active blockers in current filters.</li>"}</ul>
      </div>
      <div class="summary-panel">
        <h2>Recent Changes</h2>
        <ul class="summary-list">${latest.map((row) => `<li>${escapeHtml(row.Project)}: ${escapeHtml(row.Update)}</li>`).join("") || "<li>No recent updates visible.</li>"}</ul>
      </div>
    </div>`;
}

function tablePanel(title, rows, columns) {
  if (!rows.length) {
    return `<div class="table-panel"><div class="panel-head"><h2>${title}</h2></div><div class="empty">No matching records.</div></div>`;
  }
  return `<div class="table-panel">
    <div class="panel-head"><h2>${title}</h2><span class="chip status-in-progress">${rows.length} rows</span></div>
    <div class="table-wrap">
      <table>
        <thead><tr>${columns.map((col) => `<th>${escapeHtml(col)}</th>`).join("")}</tr></thead>
        <tbody>${rows.map((row, index) => `<tr class="clickable" data-row="${index}">${columns.map((col) => `<td>${formatCell(col, row[col])}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>
    </div>
  </div>`;
}

function formatCell(column, value) {
  if (column === "Status") return chip(value, "status");
  if (column === "Risk") return chip(value, "risk");
  return escapeHtml(value);
}

function bindRows(rows) {
  document.querySelectorAll("tr.clickable").forEach((rowEl) => {
    rowEl.addEventListener("click", () => showDetails(rows[Number(rowEl.dataset.row)]));
  });
}

function showDetails(row) {
  els.dialogTitle.textContent = row.Project || row.Milestone || row["Library Name"] || "Details";
  els.dialogBody.innerHTML = Object.entries(row)
    .filter(([, value]) => normalize(value))
    .map(([key, value]) => `<div class="field-row"><div class="field-label">${escapeHtml(key)}</div><div>${escapeHtml(value)}</div></div>`)
    .join("");
  els.dialog.showModal();
}

async function loadData(refresh = false) {
  els.refreshBtn.disabled = true;
  els.refreshBtn.textContent = refresh ? "Refreshing..." : "Loading...";
  try {
    let res = await fetch(`/api/tracker${refresh ? "?refresh=1" : ""}`);
    if (!res.ok) throw new Error("API unavailable");
    let data = await res.json();
    state.data = data;
    els.lastRefresh.textContent = data.refreshedAt || "Unknown";
    populateFilters();
    render();
  } catch (error) {
    try {
      const staticRes = await fetch("./tracker-cache.json");
      if (!staticRes.ok) throw new Error("Static tracker snapshot unavailable");
      const data = await staticRes.json();
      state.data = data;
      els.lastRefresh.textContent = `${data.refreshedAt || "Unknown"} (static)`;
      populateFilters();
      render();
    } catch (staticError) {
      els.content.innerHTML = `<div class="empty">Could not read Excel tracker: ${escapeHtml(staticError.message)}</div>`;
    }
  } finally {
    els.refreshBtn.disabled = false;
    els.refreshBtn.textContent = "Refresh Excel";
  }
}

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.view));
});
els.refreshBtn.addEventListener("click", () => loadData(true));
els.searchInput.addEventListener("input", (event) => {
  state.search = event.target.value;
  render();
});
els.statusFilter.addEventListener("change", (event) => {
  state.status = event.target.value;
  render();
});
els.riskFilter.addEventListener("change", (event) => {
  state.risk = event.target.value;
  render();
});
els.ownerFilter.addEventListener("change", (event) => {
  state.owner = event.target.value;
  render();
});
els.closeDialog.addEventListener("click", () => els.dialog.close());

loadData();
