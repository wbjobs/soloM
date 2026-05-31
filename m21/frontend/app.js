const API_BASE = "http://localhost:5500/api";

function showToast(message, type = "success") {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.className = `toast toast-${type}`;
    setTimeout(() => {
        toast.className = "toast hidden";
    }, 3000);
}

async function fetchJobs() {
    try {
        const res = await fetch(`${API_BASE}/jobs`);
        const data = await res.json();
        renderJobs(data.jobs);
    } catch (e) {
        showToast("获取任务列表失败: " + e.message, "error");
    }
}

function renderJobs(jobs) {
    const container = document.getElementById("jobList");

    if (!jobs || jobs.length === 0) {
        container.innerHTML = '<p class="empty-state">暂无任务，请添加新任务</p>';
        return;
    }

    container.innerHTML = jobs
        .map(
            (job) => `
        <div class="job-card ${job.paused ? "paused" : ""}">
            <div class="job-header">
                <div class="job-info">
                    <div class="job-name">${escapeHtml(job.name)}</div>
                    <div class="job-meta">
                        <span>🕐 ${escapeHtml(job.cron_expr)}</span>
                        <span>💻 ${escapeHtml(job.command)}</span>
                        <span>⏱ ${job.timeout || 30}s</span>
                        <span>
                            <span class="status-badge ${job.paused ? "status-paused" : "status-active"}">
                                ${job.paused ? "已暂停" : "运行中"}
                            </span>
                        </span>
                    </div>
                </div>
                <div class="job-actions">
                    ${
                        job.paused
                            ? `<button class="btn btn-success" onclick="resumeJob('${job.id}')">恢复</button>`
                            : `<button class="btn btn-warning" onclick="pauseJob('${job.id}')">暂停</button>`
                    }
                    <button class="btn btn-danger" onclick="deleteJob('${job.id}')">删除</button>
                </div>
            </div>
            ${renderExecutions(job.executions)}
        </div>
    `
        )
        .join("");
}

function renderExecutions(executions) {
    if (!executions || executions.length === 0) {
        return '<div class="executions"><h4>最近执行记录</h4><p style="color:#64748b;font-size:13px;">暂无执行记录</p></div>';
    }

    const rows = executions
        .map(
            (ex) => {
                let statusClass = "exec-failed";
                let statusText = "失败";
                if (ex.status === "success") { statusClass = "exec-success"; statusText = "成功"; }
                else if (ex.status === "missed") { statusClass = "exec-missed"; statusText = "漏执行"; }
                else if (ex.status === "timeout") { statusClass = "exec-timeout"; statusText = "超时"; }
                return `
        <tr>
            <td>${ex.started_at ? new Date(ex.started_at).toLocaleString("zh-CN") : "-"}</td>
            <td class="${statusClass}">${statusText}</td>
            <td>${ex.status === "missed" ? "-" : ex.duration_s + "s"}</td>
        </tr>
    `;
            }
        )
        .join("");

    return `
        <div class="executions">
            <h4>最近执行记录（最近5次）</h4>
            <table class="exec-table">
                <thead>
                    <tr><th>执行时间</th><th>状态</th><th>耗时</th></tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    `;
}

function escapeHtml(text) {
    const d = document.createElement("div");
    d.textContent = text;
    return d.innerHTML;
}

async function addJob(name, cronExpr, command, timeout) {
    try {
        const res = await fetch(`${API_BASE}/jobs`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, cron_expr: cronExpr, command, timeout }),
        });
        const data = await res.json();
        if (!res.ok) {
            showToast(data.error || "添加失败", "error");
            return;
        }
        showToast("任务添加成功");
        fetchJobs();
    } catch (e) {
        showToast("添加任务失败: " + e.message, "error");
    }
}

async function deleteJob(jobId) {
    if (!confirm("确定要删除此任务吗？")) return;
    try {
        const res = await fetch(`${API_BASE}/jobs/${jobId}`, { method: "DELETE" });
        if (res.ok) {
            showToast("任务已删除");
            fetchJobs();
        } else {
            showToast("删除失败", "error");
        }
    } catch (e) {
        showToast("删除失败: " + e.message, "error");
    }
}

async function pauseJob(jobId) {
    try {
        const res = await fetch(`${API_BASE}/jobs/${jobId}/pause`, { method: "PUT" });
        if (res.ok) {
            showToast("任务已暂停");
            fetchJobs();
        } else {
            showToast("暂停失败", "error");
        }
    } catch (e) {
        showToast("暂停失败: " + e.message, "error");
    }
}

async function resumeJob(jobId) {
    try {
        const res = await fetch(`${API_BASE}/jobs/${jobId}/resume`, { method: "PUT" });
        if (res.ok) {
            showToast("任务已恢复");
            fetchJobs();
        } else {
            showToast("恢复失败", "error");
        }
    } catch (e) {
        showToast("恢复失败: " + e.message, "error");
    }
}

document.getElementById("addJobForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("jobName").value.trim();
    const cronExpr = document.getElementById("jobCron").value.trim();
    const command = document.getElementById("jobCommand").value.trim();
    const timeout = parseInt(document.getElementById("jobTimeout").value, 10) || 30;
    if (name && cronExpr && command) {
        addJob(name, cronExpr, command, timeout);
        e.target.reset();
    }
});

document.getElementById("refreshBtn").addEventListener("click", fetchJobs);

fetchJobs();

setInterval(fetchJobs, 5000);
