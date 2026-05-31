const API_BASE = '';

let chatHistory = [];
let currentStreaming = false;

const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const streamToggle = document.getElementById('streamToggle');
const statsBadge = document.getElementById('statsBadge');
const statusDot = document.getElementById('statusDot');
const statsText = document.getElementById('statsText');
const fileList = document.getElementById('fileList');
const changeList = document.getElementById('changeList');
const settingsModal = document.getElementById('settingsModal');
const toast = document.getElementById('toast');

function showToast(message, type = 'info') {
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatTime(date) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatDate(timestamp) {
    const now = Date.now() / 1000;
    const diff = now - timestamp;
    if (diff < 60) return '刚刚';
    if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
    if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
    return Math.floor(diff / 86400) + ' 天前';
}

function formatMarkdown(text) {
    const tokens = [];
    let i = 0;
    const len = text.length;

    while (i < len) {
        if (text.substr(i, 3) === '```') {
            const start = i;
            i += 3;

            let lang = '';
            while (i < len && text[i] !== '\n' && text[i] !== '\r') {
                lang += text[i];
                i++;
            }
            lang = lang.trim();

            if (i < len && text[i] === '\r') i++;
            if (i < len && text[i] === '\n') i++;

            let code = '';
            const codeStart = i;
            let foundClose = false;

            while (i < len) {
                if (text.substr(i, 3) === '```') {
                    foundClose = true;
                    break;
                }
                code += text[i];
                i++;
            }

            if (foundClose) {
                i += 3;
            }

            tokens.push({
                type: 'code_block',
                lang: lang,
                code: code,
                closed: foundClose
            });
        } else if (text[i] === '`' && i + 1 < len) {
            i++;
            let inlineCode = '';
            while (i < len && text[i] !== '`') {
                inlineCode += text[i];
                i++;
            }
            if (i < len) i++;
            tokens.push({ type: 'inline_code', code: inlineCode });
        } else if (text.substr(i, 2) === '**') {
            i += 2;
            let bold = '';
            while (i < len && text.substr(i, 2) !== '**') {
                bold += text[i];
                i++;
            }
            if (i < len) i += 2;
            tokens.push({ type: 'bold', text: bold });
        } else if (text[i] === '*' && (i + 1 < len && text[i + 1] !== '*')) {
            i++;
            let italic = '';
            while (i < len && text[i] !== '*') {
                italic += text[i];
                i++;
            }
            if (i < len) i++;
            tokens.push({ type: 'italic', text: italic });
        } else {
            let prose = '';
            while (i < len && text.substr(i, 3) !== '```' && text[i] !== '`' && text.substr(i, 2) !== '**' && (text[i] !== '*' || (i + 1 < len && text[i + 1] === '*'))) {
                prose += text[i];
                i++;
            }
            if (prose) {
                tokens.push({ type: 'prose', text: prose });
            }
        }
    }

    let html = '';
    for (const token of tokens) {
        switch (token.type) {
            case 'code_block': {
                const escapedCode = escapeHtml(token.code);
                const langAttr = token.lang ? ` class="language-${escapeHtml(token.lang)}"` : '';
                const borderStyle = token.closed ? '' : ' border-left: 3px solid #d29922;';
                html += `<pre style="background-color:#0d1117;border:1px solid #30363d;border-radius:8px;padding:12px 14px;margin:12px 0;overflow-x:auto;${borderStyle}"><code${langAttr}>${escapedCode}</code></pre>`;
                break;
            }
            case 'inline_code': {
                html += `<code style="background-color:#21262d;padding:2px 6px;border-radius:4px;font-family:Monaco,Menlo,Consolas,monospace;font-size:13px">${escapeHtml(token.code)}</code>`;
                break;
            }
            case 'bold': {
                html += `<strong>${escapeHtml(token.text)}</strong>`;
                break;
            }
            case 'italic': {
                html += `<em>${escapeHtml(token.text)}</em>`;
                break;
            }
            case 'prose': {
                html += renderProse(token.text);
                break;
            }
        }
    }

    return html;
}

function renderProse(text) {
    const lines = text.split('\n');
    const blocks = [];
    let currentList = [];

    for (const line of lines) {
        const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
        const listMatch = line.match(/^[\-\*]\s+(.+)$/);
        const orderedListMatch = line.match(/^\d+\.\s+(.+)$/);

        if (headingMatch) {
            if (currentList.length > 0) {
                blocks.push({ type: 'list', items: currentList });
                currentList = [];
            }
            const level = headingMatch[1].length;
            const content = escapeHtml(headingMatch[2]);
            blocks.push({ type: 'heading', level, content });
        } else if (listMatch) {
            currentList.push(escapeHtml(listMatch[1]));
        } else if (orderedListMatch) {
            currentList.push(escapeHtml(orderedListMatch[1]));
        } else {
            if (currentList.length > 0) {
                blocks.push({ type: 'list', items: currentList });
                currentList = [];
            }
            blocks.push({ type: 'text', content: line });
        }
    }

    if (currentList.length > 0) {
        blocks.push({ type: 'list', items: currentList });
    }

    let html = '';
    for (const block of blocks) {
        switch (block.type) {
            case 'heading': {
                const tag = `h${block.level}`;
                html += `<${tag} style="margin:12px 0 6px;font-weight:600;color:#f0f6fc">${block.content}</${tag}>`;
                break;
            }
            case 'list': {
                html += '<ul style="margin:8px 0;padding-left:24px">';
                for (const item of block.items) {
                    html += `<li style="margin-bottom:4px">${item}</li>`;
                }
                html += '</ul>';
                break;
            }
            case 'text': {
                if (block.content.trim() === '') {
                    html += '<br>';
                } else {
                    html += `<p style="margin:0 0 8px">${escapeHtml(block.content)}</p>`;
                }
                break;
            }
        }
    }

    return html;
}

async function fetchStats() {
    try {
        const response = await fetch(`${API_BASE}/api/health`);
        const data = await response.json();

        if (data.status === 'healthy') {
            statusDot.className = 'dot healthy';
            statsText.textContent = '运行中';
        } else {
            statusDot.className = 'dot error';
            statsText.textContent = '异常';
        }

        const statsResponse = await fetch(`${API_BASE}/api/stats`);
        const stats = await statsResponse.json();

        document.getElementById('totalDocs').textContent = stats.total_documents;
        document.getElementById('totalFiles').textContent = stats.total_files;
        document.getElementById('codeDir').textContent = stats.code_dir;
        document.getElementById('llmProvider').textContent = stats.llm_provider.toUpperCase();
    } catch (error) {
        statusDot.className = 'dot error';
        statsText.textContent = '连接失败';
        console.error('Failed to fetch stats:', error);
    }
}

async function fetchFiles() {
    try {
        const response = await fetch(`${API_BASE}/api/files`);
        const data = await response.json();

        if (data.files.length === 0) {
            fileList.innerHTML = '<div class="empty-state">暂无已索引文件</div>';
            return;
        }

        fileList.innerHTML = data.files.map(file => {
            const fileName = file.split(/[/\\]/).pop();
            return `
                <div class="file-item" title="${file}">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="13 2 13 8 19 8"></polyline>
                    </svg>
                    <span>${fileName}</span>
                </div>
            `;
        }).join('');
    } catch (error) {
        fileList.innerHTML = '<div class="empty-state">加载失败</div>';
        console.error('Failed to fetch files:', error);
    }
}

async function fetchChanges() {
    try {
        const response = await fetch(`${API_BASE}/api/changes`);
        const data = await response.json();

        if (data.changes.length === 0) {
            changeList.innerHTML = '<div class="empty-state">暂无变更</div>';
            return;
        }

        changeList.innerHTML = data.changes.slice(0, 10).map(change => `
            <div class="change-item">
                <span class="change-type ${change.type}">${change.type}</span>
                <span class="change-file" title="${change.file_path}">${change.file_path.split(/[/\\]/).pop()}</span>
                <span class="change-time">${formatDate(change.timestamp)}</span>
            </div>
        `).join('');
    } catch (error) {
        console.error('Failed to fetch changes:', error);
    }
}

function createUserMessage(content) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message user-message';
    messageDiv.innerHTML = `
        <div class="message-avatar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
            </svg>
        </div>
        <div class="message-content">
            <div class="message-header">
                <span class="message-name">你</span>
                <span class="message-time">${formatTime(new Date())}</span>
            </div>
            <div class="message-text"><p>${escapeHtml(content)}</p></div>
        </div>
    `;
    return messageDiv;
}

function createAssistantMessage() {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message assistant-message';
    messageDiv.innerHTML = `
        <div class="message-avatar">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="16 18 22 12 16 6"></polyline>
                <polyline points="8 6 2 12 8 18"></polyline>
            </svg>
        </div>
        <div class="message-content">
            <div class="message-header">
                <span class="message-name">代码助手</span>
                <span class="message-time">${formatTime(new Date())}</span>
            </div>
            <div class="message-text">
                <div class="typing-indicator">
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                </div>
            </div>
        </div>
    `;
    return messageDiv;
}

function updateAssistantMessage(messageDiv, content, references = null) {
    const textDiv = messageDiv.querySelector('.message-text');
    let html = formatMarkdown(content);

    if (references && references.length > 0) {
        html += `
            <div class="references-section">
                <div class="references-title">引用的代码文件</div>
                <div class="reference-list">
                    ${references.map(ref => `
                        <div class="reference-item">
                            <div class="reference-header">
                            <a class="reference-file" title="${ref.file_path}">${ref.file_path.split(/[/\\]/).pop()}</a>
                            <span class="reference-score">${(ref.score * 100).toFixed(1)}%</span>
                            </div>
                            <div class="reference-meta">
                                <span>行 ${ref.start_line}-${ref.end_line}</span>
                                ${ref.name ? `<span>${ref.type}: ${ref.name}</span>` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    textDiv.innerHTML = html;
}

async function sendMessage() {
    const query = messageInput.value.trim();
    if (!query || currentStreaming) return;

    messageInput.value = '';
    sendBtn.disabled = true;
    autoResizeTextarea();

    chatMessages.appendChild(createUserMessage(query));
    scrollToBottom();

    chatHistory.push({ role: 'user', content: query });

    const assistantMessage = createAssistantMessage();
    chatMessages.appendChild(assistantMessage);
    scrollToBottom();

    if (streamToggle.checked) {
        await streamQuery(query, assistantMessage);
    } else {
        await normalQuery(query, assistantMessage);
    }

    fetchFiles();
    fetchChanges();
}

async function normalQuery(query, messageDiv) {
    try {
        const response = await fetch(`${API_BASE}/api/query`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query,
                chat_history: chatHistory.slice(-10)
            })
        });

        const data = await response.json();

        if (response.ok) {
            updateAssistantMessage(messageDiv, data.answer, data.references);
            chatHistory.push({ role: 'assistant', content: data.answer });
        } else {
            updateAssistantMessage(messageDiv, `错误: ${data.detail || '请求失败'}`, null);
        }
    } catch (error) {
        updateAssistantMessage(messageDiv, `错误: ${error.message}`, null);
        console.error('Query error:', error);
    }

    scrollToBottom();
}

async function streamQuery(query, messageDiv) {
    currentStreaming = true;
    let fullAnswer = '';
    let references = null;

    try {
        const response = await fetch(`${API_BASE}/api/query/stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query,
                chat_history: chatHistory.slice(-10)
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));

                        if (data.type === 'references') {
                            references = data.content;
                        } else if (data.type === 'answer_chunk') {
                            fullAnswer += data.content;
                            updateAssistantMessage(messageDiv, fullAnswer, references);
                            scrollToBottom();
                        } else if (data.type === 'final') {
                            fullAnswer = data.content.answer;
                            references = data.content.references;
                            updateAssistantMessage(messageDiv, fullAnswer, references);
                            chatHistory.push({ role: 'assistant', content: fullAnswer });
                        } else if (data.type === 'error') {
                            updateAssistantMessage(messageDiv, `错误: ${data.content}`, null);
                        }
                    } catch (e) {
                            console.error('Parse error:', e);
                        }
                    }
                }
            }

    } catch (error) {
        updateAssistantMessage(messageDiv, `错误: ${error.message}`, null);
        console.error('Stream error:', error);
    } finally {
        currentStreaming = false;
        scrollToBottom();
    }
}

function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function autoResizeTextarea() {
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 150) + 'px';
    sendBtn.disabled = !messageInput.value.trim();
}

async function reindex() {
    if (!confirm('确定要重新索引所有代码文件吗？这可能需要一些时间。')) return;

    try {
        showToast('开始重新索引...', 'info');
        const response = await fetch(`${API_BASE}/api/index`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ force_reindex: true })
        });

        const data = await response.json();

        if (response.ok) {
            showToast(data.message, 'success');
            fetchStats();
            fetchFiles();
        } else {
            showToast(`错误: ${data.detail}`, 'error');
        }
    } catch (error) {
        showToast(`错误: ${error.message}`, 'error');
        console.error('Reindex error:', error);
    }
}

async function clearIndex() {
    if (!confirm('确定要清空所有索引吗？')) return;

    try {
        const response = await fetch(`${API_BASE}/api/index`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (response.ok) {
            showToast('索引已清空', 'success');
            fetchStats();
            fetchFiles();
        } else {
            showToast(`错误: ${data.detail}`, 'error');
        }
    } catch (error) {
        showToast(`错误: ${error.message}`, 'error');
        console.error('Clear index error:', error);
    }
}

function openSettings() {
    settingsModal.style.display = 'flex';
}

function closeSettings() {
    settingsModal.style.display = 'none';
}

messageInput.addEventListener('input', autoResizeTextarea);

messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

sendBtn.addEventListener('click', sendMessage);

document.getElementById('refreshBtn').addEventListener('click', () => {
    fetchStats();
    fetchFiles();
    fetchChanges();
    showToast('已刷新', 'success');
});

document.getElementById('reindexBtn').addEventListener('click', reindex);
document.getElementById('clearBtn').addEventListener('click', clearIndex);

document.getElementById('settingsBtn').addEventListener('click', openSettings);
document.getElementById('closeSettings').addEventListener('click', closeSettings);
document.getElementById('cancelSettings').addEventListener('click', closeSettings);

settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
        closeSettings();
    }
});

document.getElementById('saveSettings').addEventListener('click', () => {
    showToast('设置已保存（前端演示，实际需修改 .env 文件）', 'success');
    closeSettings();
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeSettings();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        messageInput.focus();
    }
});

fetchStats();
fetchFiles();
fetchChanges();

setInterval(() => {
    fetchChanges();
}, 5000);

setInterval(() => {
    fetchStats();
}, 30000);

messageInput.focus();
