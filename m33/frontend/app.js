const API_BASE = window.location.origin + "/api/v1";

let currentDriftsOffset = 0;
const DRIFTS_LIMIT = 20;
let currentSyncOffset = 0;
const SYNC_LIMIT = 20;
let currentAuditOffset = 0;
const AUDIT_LIMIT = 50;

function switchTab(tabName) {
    document.querySelectorAll(".tab-content").forEach(el => el.classList.remove("active"));
    document.querySelectorAll(".tab").forEach(el => el.classList.remove("active"));
    document.getElementById("tab-" + tabName).classList.add("active");
    document.querySelector(`.tab[data-tab="${tabName}"]`).classList.add("active");

    if (tabName === "overview") loadSummary();
    if (tabName === "drifts") loadDrifts();
    if (tabName === "scans") loadScans();
    if (tabName === "clusters") loadClusters();
    if (tabName === "sync") loadSyncJobs();
    if (tabName === "audit") loadAuditLogs();
}

async function apiGet(path) {
    const resp = await fetch(API_BASE + path);
    if (!resp.ok) throw new Error(`API error: ${resp.status}`);
    return resp.json();
}

async function apiPost(path, data) {
    const resp = await fetch(API_BASE + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
    if (!resp.ok) throw new Error(`API error: ${resp.status}`);
    return resp.json();
}

async function apiPatch(path, data) {
    const resp = await fetch(API_BASE + path, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: data ? JSON.stringify(data) : undefined,
    });
    if (!resp.ok) throw new Error(`API error: ${resp.status}`);
    return resp.json();
}

async function loadSummary() {
    try {
        const data = await apiGet("/dashboard/summary");
        document.getElementById("summary-clusters").textContent = data.total_clusters;
        document.getElementById("summary-unresolved").textContent = data.unresolved_drifts;
        document.getElementById("summary-total").textContent = data.total_drifts;

        renderBarChart("chart-kind", data.drifts_by_kind, [
            "blue", "red", "green", "orange", "purple"
        ]);
        renderBarChart("chart-cluster", data.drifts_by_cluster, [
            "red", "blue", "purple", "green", "orange"
        ]);
        renderRecentScansTable(data.latest_scans);
    } catch (e) {
        console.error("Failed to load summary:", e);
    }
}

function renderBarChart(containerId, data, colors) {
    const container = document.getElementById(containerId);
    const entries = Object.entries(data);
    if (!entries.length) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-text">No data</div></div>';
        return;
    }
    const maxVal = Math.max(...entries.map(([, v]) => v));
    container.innerHTML = entries.map(([label, value], i) => {
        const pct = maxVal > 0 ? (value / maxVal * 100) : 0;
        const color = colors[i % colors.length];
        return `
            <div class="chart-row">
                <div class="chart-label">${escapeHtml(label)}</div>
                <div class="chart-track">
                    <div class="chart-fill ${color}" style="width:${Math.max(pct, 5)}%">${value}</div>
                </div>
            </div>`;
    }).join("");
}

function renderRecentScansTable(scans) {
    const tbody = document.querySelector("#table-recent-scans tbody");
    if (!scans || !scans.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state-text">No scans yet</td></tr>';
        return;
    }
    tbody.innerHTML = scans.map(s => `
        <tr>
            <td><code>${shortId(s.scan_id)}</code></td>
            <td>${escapeHtml(s.cluster_name)}</td>
            <td>${formatTime(s.timestamp)}</td>
            <td>${s.total_resources}</td>
            <td><span class="badge ${s.drift_count > 0 ? "badge-drift" : "badge-resolved"}">${s.drift_count}</span></td>
        </tr>
    `).join("");
}

async function loadDrifts() {
    const params = new URLSearchParams();
    const cluster = document.getElementById("filter-cluster").value;
    const kind = document.getElementById("filter-kind").value;
    const ns = document.getElementById("filter-namespace").value;
    const driftType = document.getElementById("filter-drift-type").value;
    const resolved = document.getElementById("filter-resolved").value;

    if (cluster) params.set("cluster_name", cluster);
    if (kind) params.set("kind", kind);
    if (ns) params.set("namespace", ns);
    if (driftType) params.set("drift_type", driftType);
    if (resolved !== "") params.set("resolved", resolved);
    params.set("limit", DRIFTS_LIMIT);
    params.set("offset", currentDriftsOffset);

    try {
        const drifts = await apiGet("/drifts?" + params.toString());
        renderDriftsTable(drifts);
        renderDriftsPagination(drifts.length);
        updateFilterOptions(drifts);
    } catch (e) {
        console.error("Failed to load drifts:", e);
    }
}

function renderDriftsTable(drifts) {
    const tbody = document.querySelector("#table-drifts tbody");
    if (!drifts.length) {
        tbody.innerHTML = '<tr><td colspan="9" class="empty-state"><div class="empty-state-icon">&#10003;</div><div class="empty-state-text">No configuration drifts detected</div></td></tr>';
        return;
    }
    tbody.innerHTML = drifts.map(d => {
        const statusBadge = d.resolved
            ? '<span class="badge badge-resolved">Resolved</span>'
            : '<span class="badge badge-unresolved">Open</span>';
        const typeBadge = d.drift_type === "missing_in_cluster"
            ? '<span class="badge badge-missing">Missing</span>'
            : '<span class="badge badge-drift">Drift</span>';
        const actionBtn = d.resolved
            ? ""
            : `<button class="btn btn-sm btn-success" onclick="resolveDrift('${d.id}')">Resolve</button>`;
        const syncBtn = d.resolved
            ? ""
            : `<button class="btn btn-sm btn-primary" onclick="syncDrift('${d.id}')">&#8645; Sync</button>`;
        return `
            <tr>
                <td>${statusBadge}</td>
                <td><strong>${escapeHtml(d.kind)}</strong></td>
                <td><code>${escapeHtml(d.namespace)}/${escapeHtml(d.name)}</code></td>
                <td>${typeBadge}</td>
                <td title="${escapeHtml(d.file || "")}">${escapeHtml(truncate(d.file || "-", 30))}</td>
                <td>${escapeHtml(d.cluster_name)}</td>
                <td>${formatTime(d.created_at)}</td>
                <td>
                    <button class="btn btn-sm" onclick="showDriftDetail('${d.id}')">Detail</button>
                    ${syncBtn}
                    ${actionBtn}
                </td>
            </tr>`;
    }).join("");
}

function renderDriftsPagination(count) {
    const container = document.getElementById("drifts-pagination");
    if (currentDriftsOffset === 0 && count < DRIFTS_LIMIT) {
        container.innerHTML = "";
        return;
    }
    const prevDisabled = currentDriftsOffset === 0;
    const nextDisabled = count < DRIFTS_LIMIT;
    container.innerHTML = `
        <button ${prevDisabled ? "disabled" : ""} onclick="driftsPrev()">&laquo; Prev</button>
        <span style="color:var(--text-secondary);font-size:13px;padding:6px 12px;">Page ${Math.floor(currentDriftsOffset / DRIFTS_LIMIT) + 1}</span>
        <button ${nextDisabled ? "disabled" : ""} onclick="driftsNext()">Next &raquo;</button>
    `;
}

function driftsPrev() {
    currentDriftsOffset = Math.max(0, currentDriftsOffset - DRIFTS_LIMIT);
    loadDrifts();
}

function driftsNext() {
    currentDriftsOffset += DRIFTS_LIMIT;
    loadDrifts();
}

function updateFilterOptions(drifts) {
    const kinds = [...new Set(drifts.map(d => d.kind))];
    const namespaces = [...new Set(drifts.map(d => d.namespace))];
    const kindSelect = document.getElementById("filter-kind");
    const nsSelect = document.getElementById("filter-namespace");
    const currentKind = kindSelect.value;
    const currentNs = nsSelect.value;

    kindSelect.innerHTML = '<option value="">All Kinds</option>' + kinds.map(k =>
        `<option value="${k}" ${k === currentKind ? "selected" : ""}>${k}</option>`
    ).join("");
    nsSelect.innerHTML = '<option value="">All Namespaces</option>' + namespaces.map(n =>
        `<option value="${n}" ${n === currentNs ? "selected" : ""}>${n}</option>`
    ).join("");
}

async function loadClusters() {
    try {
        const clusters = await apiGet("/clusters");
        updateClusterFilter(clusters);
        renderClustersTable(clusters);
    } catch (e) {
        console.error("Failed to load clusters:", e);
    }
}

function updateClusterFilter(clusters) {
    const select = document.getElementById("filter-cluster");
    const current = select.value;
    select.innerHTML = '<option value="">All Clusters</option>' + clusters.map(c =>
        `<option value="${c.name}" ${c.name === current ? "selected" : ""}>${c.name}</option>`
    ).join("");
}

function renderClustersTable(clusters) {
    const tbody = document.querySelector("#table-clusters tbody");
    if (!clusters.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-state-text">No clusters registered</td></tr>';
        return;
    }
    tbody.innerHTML = clusters.map(c => `
        <tr>
            <td><strong>${escapeHtml(c.name)}</strong></td>
            <td>${formatTime(c.last_scan_at)}</td>
            <td><span class="badge ${c.last_drift_count > 0 ? "badge-drift" : "badge-resolved"}">${c.last_drift_count}</span></td>
            <td>${c.total_scans}</td>
        </tr>
    `).join("");
}

async function loadScans() {
    try {
        const scans = await apiGet("/scans?limit=30");
        renderScansTable(scans);
    } catch (e) {
        console.error("Failed to load scans:", e);
    }
}

function renderScansTable(scans) {
    const tbody = document.querySelector("#table-scans tbody");
    if (!scans.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state-text">No scan history</td></tr>';
        return;
    }
    tbody.innerHTML = scans.map(s => `
        <tr>
            <td><code>${shortId(s.scan_id)}</code></td>
            <td>${escapeHtml(s.cluster_name)}</td>
            <td>${formatTime(s.timestamp)}</td>
            <td>${s.total_resources}</td>
            <td><span class="badge ${s.drift_count > 0 ? "badge-drift" : "badge-resolved"}">${s.drift_count}</span></td>
        </tr>
    `).join("");
}

async function resolveDrift(driftId) {
    try {
        await apiPatch(`/drifts/${driftId}/resolve`);
        loadDrifts();
        loadSummary();
    } catch (e) {
        console.error("Failed to resolve drift:", e);
    }
}

const MAX_JSON_PREVIEW_LINES = 100;
const MAX_JSON_PREVIEW_CHARS = 15000;
const MAX_HIGHLIGHT_CHARS = 20000;
const JSON_CACHE = new Map();

async function showDriftDetail(driftId) {
    try {
        const d = await apiGet(`/drifts/${driftId}`);
        const modal = document.getElementById("modal-overlay");
        document.getElementById("modal-title").textContent = `${d.kind}: ${d.namespace}/${d.name}`;

        let body = `
            <div class="drift-meta">
                <div class="meta-item">
                    <span class="meta-label">Kind</span>
                    <span class="meta-value">${escapeHtml(d.kind)}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Namespace</span>
                    <span class="meta-value">${escapeHtml(d.namespace)}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Name</span>
                    <span class="meta-value">${escapeHtml(d.name)}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Drift Type</span>
                    <span class="meta-value">${escapeHtml(d.drift_type)}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">File</span>
                    <span class="meta-value">${escapeHtml(d.file || "N/A")}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Cluster</span>
                    <span class="meta-value">${escapeHtml(d.cluster_name)}</span>
                </div>
            </div>
        `;

        if (!d.resolved) {
            body += `
                <div class="sync-actions">
                    <button class="btn btn-primary" onclick="syncDrift('${d.id}')">
                        &#8645; One-Click Sync to Cluster
                    </button>
                    <button class="btn" onclick="showSyncPreview('${d.id}')">
                        Preview kubectl Command
                    </button>
                </div>
            `;
        }

        if (d.diff && Object.keys(d.diff).length > 0) {
            body += `<div class="diff-section"><h3>Difference Details</h3>`;
            body += renderDiffDetails(d.diff);
            body += `</div>`;
        }

        if (d.git_spec) {
            body += `<div class="diff-section">
                <h3>Git Specification ${renderSpecSizeBadge(d.git_spec)}</h3>
                ${renderLazySpec(d.git_spec, `git-${d.id}`, "Git Spec")}
            </div>`;
        }

        if (d.live_spec) {
            body += `<div class="diff-section">
                <h3>Live Cluster Specification ${renderSpecSizeBadge(d.live_spec)}</h3>
                ${renderLazySpec(d.live_spec, `live-${d.id}`, "Live Spec")}
            </div>`;
        }

        document.getElementById("modal-body").innerHTML = body;
        modal.classList.add("show");

        scheduleLazyLoad(d, "git");
        scheduleLazyLoad(d, "live");
    } catch (e) {
        console.error("Failed to load drift detail:", e);
    }
}

function scheduleLazyLoad(driftData, specType) {
    const spec = specType === "git" ? driftData.git_spec : driftData.live_spec;
    const containerId = `spec-container-${specType}-${driftData.id}`;
    const container = document.getElementById(containerId);
    if (!container) return;

    const size = estimateSize(spec);
    if (size.lines > MAX_JSON_PREVIEW_LINES || size.chars > MAX_JSON_PREVIEW_CHARS) {
        return;
    }

    requestAnimationFrame(() => {
        const jsonStr = safeStringify(spec, null, 2);
        if (jsonStr && jsonStr.length <= MAX_HIGHLIGHT_CHARS) {
            container.innerHTML = syntaxHighlightCached(jsonStr);
        } else {
            container.innerHTML = escapeHtml(jsonStr || "");
        }
    });
}

window.expandFullSpec = function(driftId, specType) {
    const containerId = `spec-container-${specType}-${driftId}`;
    const container = document.getElementById(containerId);
    const btnId = `expand-btn-${specType}-${driftId}`;
    const btn = document.getElementById(btnId);
    if (!container || !btn) return;

    btn.disabled = true;
    btn.innerHTML = "Loading...";

    const apiCall = apiGet(`/drifts/${driftId}`);
    apiCall.then(d => {
        const spec = specType === "git" ? d.git_spec : d.live_spec;
        const size = estimateSize(spec);
        const lines = size.lines;

        requestIdleCallback(() => {
            const start = performance.now();
            const jsonStr = safeStringify(spec, null, 2);
            const stringifyTime = performance.now() - start;

            if (stringifyTime > 1000) {
                console.warn(`[Performance] JSON.stringify took ${stringifyTime}ms for ~${lines} lines`);
            }

            requestIdleCallback(() => {
                const renderStart = performance.now();
                if (jsonStr && jsonStr.length <= MAX_HIGHLIGHT_CHARS) {
                    container.innerHTML = syntaxHighlightCached(jsonStr);
                } else {
                    container.innerHTML = renderVirtualJson(jsonStr);
                }
                const renderTime = performance.now() - renderStart;
                if (renderTime > 500) {
                    console.warn(`[Performance] JSON render took ${renderTime}ms for ${jsonStr?.length || 0} chars`);
                }
                btn.style.display = "none";
            });
        });
    }).catch(e => {
        console.error("Failed to load full spec:", e);
        btn.disabled = false;
        btn.innerHTML = "Expand Full View";
    });
};

function renderLazySpec(spec, id, label) {
    const containerId = `spec-container-${id}`;
    const btnId = `expand-btn-${id}`;
    const size = estimateSize(spec);

    if (size.lines > MAX_JSON_PREVIEW_LINES || size.chars > MAX_JSON_PREVIEW_CHARS) {
        const preview = generatePreview(spec);
        return `
            <div class="json-preview">
                <div class="json-preview-header">
                    <span class="json-preview-info">
                        ${size.lines.toLocaleString()} lines (${formatBytes(size.chars)}) - 
                        Showing first ${Math.min(preview.lineCount, MAX_JSON_PREVIEW_LINES)} lines
                    </span>
                    <button id="${btnId}" class="btn btn-sm btn-primary" onclick="expandFullSpec('${id.split('-').slice(1).join('-')}', '${id.split('-')[0]}')">
                        Expand Full View
                    </button>
                </div>
                <div id="${containerId}" class="diff-json diff-json-preview">${syntaxHighlightCached(preview.content)}</div>
            </div>
        `;
    } else {
        return `<div id="${containerId}" class="diff-json">Loading...</div>`;
    }
}

function estimateSize(obj) {
    if (JSON_CACHE.has(obj)) {
        return JSON_CACHE.get(obj).size;
    }
    let depth = 0;
    let keys = 0;
    let maxDepth = 0;
    const seen = new Set();

    function walk(o, d) {
        if (o === null || o === undefined) return;
        if (typeof o !== "object") return;
        if (seen.has(o)) return;
        seen.add(o);
        if (d > maxDepth) maxDepth = d;
        if (Array.isArray(o)) {
            for (let i = 0; i < o.length; i++) {
                walk(o[i], d + 1);
            }
        } else {
            const k = Object.keys(o);
            keys += k.length;
            for (const key of k) {
                walk(o[key], d + 1);
            }
        }
    }
    walk(obj, 0);

    const estChars = Math.max(keys * 20 + maxDepth * 5, 100);
    const estLines = Math.max(keys * 1.5 + maxDepth, 10);

    return { lines: estLines, chars: estChars, depth: maxDepth, keys };
}

function generatePreview(spec) {
    try {
        let lineCount = 0;
        const truncated = {};

        function walk(o, path, depth) {
            if (lineCount > MAX_JSON_PREVIEW_LINES) return { __truncated: true, _msg: `... (truncated, expand to see full ${estimateSize(spec).lines.toLocaleString()} lines)` };
            if (o === null) return null;
            if (typeof o !== "object") return o;
            if (depth > 8) {
                lineCount += 2;
                return { __truncated: true, _msg: `... (deep nesting, expand to see full)` };
            }

            if (Array.isArray(o)) {
                if (o.length > 50) {
                    lineCount += 3;
                    return [o[0], o[1], { __truncated: true, _msg: `... (${o.length} items total, expand to see all)` }];
                }
                const result = [];
                for (let i = 0; i < o.length; i++) {
                    lineCount++;
                    if (lineCount > MAX_JSON_PREVIEW_LINES) {
                        result.push({ __truncated: true, _msg: `... (truncated)` });
                        break;
                    }
                    result.push(walk(o[i], `${path}[${i}]`, depth + 1));
                }
                return result;
            } else {
                const result = {};
                const keys = Object.keys(o);
                for (let i = 0; i < keys.length; i++) {
                    const key = keys[i];
                    lineCount++;
                    if (lineCount > MAX_JSON_PREVIEW_LINES) {
                        result["__truncated"] = `... (${keys.length - i} more fields, expand to see all)`;
                        break;
                    }
                    const val = o[key];
                    if (typeof val === "object" && val !== null && Object.keys(val).length > 20) {
                        lineCount += 2;
                        result[key] = { __truncated: true, _msg: `... (large object, expand to see full)` };
                    } else {
                        result[key] = walk(val, `${path}.${key}`, depth + 1);
                    }
                }
                return result;
            }
        }

        const preview = walk(spec, "$", 0);
        return {
            content: safeStringify(preview, null, 2),
            lineCount: lineCount,
        };
    } catch (e) {
        console.warn("Preview generation failed:", e);
        return { content: "// Preview unavailable due to size", lineCount: 1 };
    }
}

function safeStringify(obj, replacer, indent) {
    const cacheKey = obj;
    if (JSON_CACHE.has(cacheKey)) {
        const cached = JSON_CACHE.get(cacheKey);
        if (cached.indent === indent) return cached.str;
    }
    try {
        const str = JSON.stringify(obj, (key, value) => {
            if (key === "__truncated") return undefined;
            if (key === "_msg") return value;
            return value;
        }, indent);
        if (JSON_CACHE.size > 50) {
            const firstKey = JSON_CACHE.keys().next().value;
            JSON_CACHE.delete(firstKey);
        }
        JSON_CACHE.set(cacheKey, { str, indent, size: estimateSize(obj) });
        return str;
    } catch (e) {
        console.error("JSON.stringify failed:", e);
        return `// Error serializing object: ${e.message}`;
    }
}

function syntaxHighlightCached(json) {
    if (!json) return "";
    if (json.length > MAX_HIGHLIGHT_CHARS) {
        return escapeHtml(json);
    }
    return syntaxHighlight(json);
}

function renderVirtualJson(jsonStr) {
    if (!jsonStr) return "";
    const maxLines = 2000;
    const lines = jsonStr.split("\n");
    const total = lines.length;

    if (total <= maxLines) {
        return `<pre class="diff-json">${escapeHtml(jsonStr)}</pre>`;
    }

    const head = lines.slice(0, 200).join("\n");
    const tail = lines.slice(total - 100).join("\n");

    return `
        <div class="diff-json">${escapeHtml(head)}
<span class="json-truncate-msg">
... (${(total - 300).toLocaleString()} lines omitted, total ${total.toLocaleString()} lines)
... (Use CLI or API to inspect large resources in detail)
</span>
${escapeHtml(tail)}</div>
    `;
}

function formatBytes(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function renderSpecSizeBadge(spec) {
    const size = estimateSize(spec);
    const cls = size.lines > MAX_JSON_PREVIEW_LINES ? "badge-drift" : "badge-resolved";
    return `<span class="badge ${cls}" style="margin-left:8px;">${size.lines.toLocaleString()} lines</span>`;
}

function renderDiffDetails(diff) {
    let html = "";
    if (diff.values_changed) {
        for (const [path, change] of Object.entries(diff.values_changed)) {
            const newVal = change.new_value !== undefined ? change.new_value : (change.replacement ? "see replacement" : "");
            const oldVal = change.old_value !== undefined ? change.old_value : "";
            html += `
                <div class="diff-change">
                    <div class="diff-change-path">${escapeHtml(path)}</div>
                    <div class="diff-change-values">
                        <span class="diff-old">Git: ${escapeHtml(String(oldVal))}</span>
                        <span class="diff-new">Live: ${escapeHtml(String(newVal))}</span>
                    </div>
                </div>`;
        }
    }
    if (diff.dictionary_item_added) {
        for (const [path, value] of Object.entries(diff.dictionary_item_added)) {
            html += `
                <div class="diff-change added">
                    <div class="diff-change-path">${escapeHtml(path)}</div>
                    <div class="diff-new">Added: ${escapeHtml(String(value))}</div>
                </div>`;
        }
    }
    if (diff.dictionary_item_removed) {
        for (const [path, value] of Object.entries(diff.dictionary_item_removed)) {
            html += `
                <div class="diff-change">
                    <div class="diff-change-path">${escapeHtml(path)}</div>
                    <div class="diff-old">Removed: ${escapeHtml(String(value))}</div>
                </div>`;
        }
    }
    if (diff.type_changes) {
        for (const [path, change] of Object.entries(diff.type_changes)) {
            html += `
                <div class="diff-change">
                    <div class="diff-change-path">${escapeHtml(path)}</div>
                    <div class="diff-change-values">
                        <span class="diff-old">Git (${change.old_type || "?"}): ${escapeHtml(String(change.old_value || ""))}</span>
                        <span class="diff-new">Live (${change.new_type || "?"}): ${escapeHtml(String(change.new_value || ""))}</span>
                    </div>
                </div>`;
        }
    }
    if (!html) {
        html = '<div class="diff-json">' + syntaxHighlight(JSON.stringify(diff, null, 2)) + '</div>';
    }
    return html;
}

function closeModal() {
    document.getElementById("modal-overlay").classList.remove("show");
}

function refreshAll() {
    const activeTab = document.querySelector(".tab.active").dataset.tab;
    switchTab(activeTab);
}

function escapeHtml(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

function truncate(str, len) {
    return str.length > len ? str.substring(0, len) + "..." : str;
}

function shortId(id) {
    if (!id) return "";
    return id.length > 12 ? id.substring(0, 12) + "..." : id;
}

function formatTime(ts) {
    if (!ts) return "-";
    try {
        const d = new Date(ts);
        return d.toLocaleString();
    } catch {
        return ts;
    }
}

function syntaxHighlight(json) {
    if (!json) return "";
    return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
        let cls = "number";
        if (/^"/.test(match)) {
            if (/:$/.test(match)) {
                cls = "key";
            } else {
                cls = "string";
            }
        } else if (/true|false/.test(match)) {
            cls = "string";
        } else if (/null/.test(match)) {
            cls = "null";
        }
        return `<span class="${cls}">${match}</span>`;
    });
}

document.addEventListener("DOMContentLoaded", function () {
    loadSummary();
    loadClusters();
});

async function syncDrift(driftId) {
    if (!confirm("This will apply Git configuration to cluster. Continue?")) return;
    try {
        const result = await apiPost("/sync", { drift_id: driftId, force: true, created_by: "dashboard" });
        alert(`Sync job created: ${result.job_id}\nView Sync Jobs tab for status.`);
        closeModal();
        loadSyncJobs();
    } catch (e) {
        console.error("Failed to create sync job:", e);
        alert("Failed to create sync job");
    }
}

async function showSyncPreview(driftId) {
    try {
        const d = await apiGet(`/drifts/${driftId}`);
        const modal = document.getElementById("modal-overlay");
        document.getElementById("modal-title").textContent = `Sync Preview: ${d.kind} ${d.namespace}/${d.name}`;

        const cmd = `kubectl apply -f - -n ${d.namespace || "default"}${d.resources && d.resources.length > 1 ? "" : " --force"}`;
        const yamlContent = d.git_spec ? typeof d.git_spec === "string" ? d.git_spec : safeStringify(d.git_spec, 2) : "N/A";

        document.getElementById("modal-body").innerHTML = `
            <div class="sync-actions">
                <h3>kubectl Command:</h3>
                <pre><code>${escapeHtml(cmd)}</code></pre>
            </div>
            <div class="diff-section">
                <h3>YAML Content:</h3>
                <pre><code>${escapeHtml(yamlContent)}</code></pre>
            </div>
            <div class="sync-actions">
                <button class="btn btn-primary" onclick="syncDrift('${d.id}')">Execute Sync</button>
                <button class="btn" onclick="closeModal()">Cancel</button>
            </div>
        `;
        modal.classList.add("show");
    } catch (e) {
        console.error("Failed to show sync preview:", e);
        alert("Failed to show sync preview");
    }
}

function getSyncStatusBadge(status) {
    const badgeMap = {
        "pending": 'badge badge-unresolved',
        "picked": 'badge',
        "running": 'badge badge-drift',
        "completed": 'badge badge-resolved',
        "failed": 'badge badge-missing',
        "timeout": 'badge badge-missing',
        "error": 'badge badge-missing',
    };
    const cls = badgeMap[status] || 'badge';
    const icon = status === "running" ? "&#9881; " : status === "completed" ? "&#10003; " : status === "failed" ? "&#10008; " : status === "pending" ? "&#128338; " : "";
    return `<span class="${cls}">${icon}${status}</span>`;
}

async function loadSyncJobs() {
    try {
        const cluster = document.getElementById("filter-sync-cluster").value;
        const status = document.getElementById("filter-sync-status").value;
        const params = new URLSearchParams();
        if (cluster) params.append("cluster", cluster);
        if (status) params.append("status", status);
        params.append("limit", SYNC_LIMIT);
        params.append("offset", currentSyncOffset);
        const data = await apiGet(`/sync/jobs?${params.toString()}`);
        renderSyncJobs(data.items || data);
        renderSyncPagination(data.total || data.length || 0);
    } catch (e) {
        console.error("Failed to load sync jobs:", e);
    }
}

function renderSyncJobs(jobs) {
    const tbody = document.querySelector("#table-sync tbody");
    if (!jobs.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state-text">No sync jobs</td></tr>';
        return;
    }
    tbody.innerHTML = jobs.map(j => {
        const resource = j.resource_kind ? `${j.resource_kind} ${j.resource_namespace}/${j.resource_name}` : "N/A";
        const actions = j.status === "pending"
            ? `<button class="btn btn-sm" onclick="cancelSyncJob('${j.job_id}')">Cancel</button>`
            : `<button class="btn btn-sm" onclick="showSyncJobDetail('${j.job_id}')">Detail</button>`;
        return `
            <tr>
                <td><code>${escapeHtml(j.job_id)}</code></td>
                <td>${getSyncStatusBadge(j.status)}</td>
                <td>${escapeHtml(resource)}</td>
                <td>${escapeHtml(j.cluster_name)}</td>
                <td>${escapeHtml(j.created_by || "N/A")}</td>
                <td>${formatTime(j.created_at)}</td>
                <td>${formatTime(j.completed_at)}</td>
                <td>${actions}</td>
            </tr>
        `;
    }).join("");
}

function renderSyncPagination(count) {
    const container = document.getElementById("sync-pagination");
    if (currentSyncOffset === 0 && count < SYNC_LIMIT) {
        container.innerHTML = "";
        return;
    }
    const prevDisabled = currentSyncOffset === 0;
    const nextDisabled = count < SYNC_LIMIT;
    container.innerHTML = `
        <button ${prevDisabled ? "disabled" : ""} onclick="syncPrev()">&laquo; Prev</button>
        <span style="color:var(--text-secondary);font-size:13px;padding:6px 12px;">Page ${Math.floor(currentSyncOffset / SYNC_LIMIT) + 1}</span>
        <button ${nextDisabled ? "disabled" : ""} onclick="syncNext()">Next &raquo;</button>
    `;
}

function syncPrev() {
    currentSyncOffset = Math.max(0, currentSyncOffset - SYNC_LIMIT);
    loadSyncJobs();
}

function syncNext() {
    currentSyncOffset += SYNC_LIMIT;
    loadSyncJobs();
}

async function showSyncJobDetail(jobId) {
    try {
        const j = await apiGet(`/sync/jobs/${jobId}`);
        const modal = document.getElementById("modal-overlay");
        document.getElementById("modal-title").textContent = `Sync Job: ${j.job_id}`;

        const cmdData = await apiGet(`/sync/jobs/${jobId}/command`).catch(() => null);

        document.getElementById("modal-body").innerHTML = `
            <div class="drift-meta">
                <div class="meta-item">
                    <span class="meta-label">Status</span>
                    <span class="meta-value">${getSyncStatusBadge(j.status)}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Cluster</span>
                    <span class="meta-value">${escapeHtml(j.cluster_name)}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Created By</span>
                    <span class="meta-value">${escapeHtml(j.created_by || "N/A")}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Created At</span>
                    <span class="meta-value">${formatTime(j.created_at)}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Completed At</span>
                    <span class="meta-value">${formatTime(j.completed_at)}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Picked By</span>
                    <span class="meta-value">${escapeHtml(j.picked_by || "N/A")}</span>
                </div>
            </div>
            ${cmdData ? `
                <div class="sync-actions">
                    <h3>Command:</h3>
                    <pre><code>${escapeHtml(cmdData.command || "N/A")}</code></pre>
                </div>
            ` : ""}
            ${j.result ? `
                <div class="diff-section">
                    <h3>Result Output:</h3>
                    <pre><code>${escapeHtml(j.result)}</code></pre>
                </div>
            ` : ""}
            ${j.error_message ? `
                <div class="diff-section">
                    <h3>Error:</h3>
                    <pre style="color:#e06c75;"><code>${escapeHtml(j.error_message)}</code></pre>
                </div>
            ` : ""}
        `;
        modal.classList.add("show");
    } catch (e) {
        console.error("Failed to load sync job detail:", e);
    }
}

async function loadAuditLogs() {
    try {
        const cluster = document.getElementById("filter-audit-cluster").value;
        const action = document.getElementById("filter-audit-action").value;
        const user = document.getElementById("filter-audit-user").value;
        const params = new URLSearchParams();
        if (cluster) params.append("cluster", cluster);
        if (action) params.append("action", action);
        if (user) params.append("user", user);
        params.append("limit", AUDIT_LIMIT);
        params.append("offset", currentAuditOffset);
        const data = await apiGet(`/audit?${params.toString()}`);
        renderAuditLogs(data.items || data);
        renderAuditPagination(data.total || data.length || 0);
    } catch (e) {
        console.error("Failed to load audit logs:", e);
    }
}

function renderAuditLogs(logs) {
    const tbody = document.querySelector("#table-audit tbody");
    if (!logs.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state-text">No audit logs</td></tr>';
        return;
    }
    tbody.innerHTML = logs.map(l => `
        <tr>
            <td>${formatTime(l.timestamp)}</td>
            <td><code>${escapeHtml(l.action)}</code></td>
            <td>${escapeHtml(l.user || "N/A")}</td>
            <td>${escapeHtml(l.cluster_name || "N/A")}</td>
            <td>${escapeHtml(l.resource_name || "N/A")}</td>
            <td><code>${escapeHtml(l.ip_address || "N/A")}</code></td>
            <td>${l.details ? `<button class="btn btn-sm" onclick='showAuditDetail(${JSON.stringify(l.details).replace(/'/g, "&#39;")})'>View</button>` : "N/A"}</td>
        </tr>
    `).join("");
}

function showAuditDetail(details) {
    const modal = document.getElementById("modal-overlay");
    document.getElementById("modal-title").textContent = "Audit Details";
    const content = typeof details === "string" ? details : safeStringify(details, 2);
    document.getElementById("modal-body").innerHTML = `
        <div class="diff-section">
            <pre><code>${escapeHtml(content)}</code></pre>
        </div>
    `;
    modal.classList.add("show");
}

function renderAuditPagination(count) {
    const container = document.getElementById("audit-pagination");
    if (currentAuditOffset === 0 && count < AUDIT_LIMIT) {
        container.innerHTML = "";
        return;
    }
    const prevDisabled = currentAuditOffset === 0;
    const nextDisabled = count < AUDIT_LIMIT;
    container.innerHTML = `
        <button ${prevDisabled ? "disabled" : ""} onclick="auditPrev()">&laquo; Prev</button>
        <span style="color:var(--text-secondary);font-size:13px;padding:6px 12px;">Page ${Math.floor(currentAuditOffset / AUDIT_LIMIT) + 1}</span>
        <button ${nextDisabled ? "disabled" : ""} onclick="auditNext()">Next &raquo;</button>
    `;
}

function auditPrev() {
    currentAuditOffset = Math.max(0, currentAuditOffset - AUDIT_LIMIT);
    loadAuditLogs();
}

function auditNext() {
    currentAuditOffset += AUDIT_LIMIT;
    loadAuditLogs();
}

document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeModal();
});
