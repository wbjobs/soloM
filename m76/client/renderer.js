const { ipcRenderer } = require('electron');

let currentNoteId = null;
let password = null;
let notes = [];
let searchIndexBuilt = false;
let searchTimeout = null;

const elements = {
  notesList: document.getElementById('notesList'),
  newNoteBtn: document.getElementById('newNoteBtn'),
  saveBtn: document.getElementById('saveBtn'),
  syncBtn: document.getElementById('syncBtn'),
  deleteBtn: document.getElementById('deleteBtn'),
  noteTitle: document.getElementById('noteTitle'),
  editor: document.getElementById('editor'),
  preview: document.getElementById('preview'),
  editTab: document.getElementById('editTab'),
  previewTab: document.getElementById('previewTab'),
  passwordModal: document.getElementById('passwordModal'),
  passwordInput: document.getElementById('passwordInput'),
  passwordSubmit: document.getElementById('passwordSubmit'),
  syncModal: document.getElementById('syncModal'),
  serverUrl: document.getElementById('serverUrl'),
  userId: document.getElementById('userId'),
  syncCancel: document.getElementById('syncCancel'),
  syncSubmit: document.getElementById('syncSubmit'),
  toast: document.getElementById('toast'),
  searchInput: document.getElementById('searchInput'),
  searchResults: document.getElementById('searchResults'),
  useBlindIndex: document.getElementById('useBlindIndex')
};

function showToast(message, type = 'success') {
  elements.toast.textContent = message;
  elements.toast.className = `toast ${type}`;
  setTimeout(() => {
    elements.toast.classList.add('hidden');
  }, 3000);
}

function simpleMarkdown(text) {
  return text
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
    .replace(/\*(.*)\*/gim, '<em>$1</em>')
    .replace(/`(.*?)`/gim, '<code>$1</code>')
    .replace(/^\- (.*$)/gim, '<li>$1</li>')
    .replace(/\n/gim, '<br>');
}

function renderPreview() {
  elements.preview.innerHTML = simpleMarkdown(elements.editor.value);
}

function formatDate(timestamp) {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleString('zh-CN');
}

async function loadNotesList() {
  const result = await ipcRenderer.invoke('list-notes');
  if (result.success) {
    notes = result.notes;
    renderNotesList();
  }
}

function renderNotesList() {
  elements.notesList.innerHTML = '';
  notes.forEach(noteId => {
    const item = document.createElement('div');
    item.className = `note-item ${noteId === currentNoteId ? 'active' : ''}`;
    item.innerHTML = `
      <div class="note-item-title">${decodeNoteId(noteId)}</div>
      <div class="note-item-date">${formatDate(getNoteTimestamp(noteId))}</div>
    `;
    item.addEventListener('click', () => loadNote(noteId));
    elements.notesList.appendChild(item);
  });
}

function decodeNoteId(id) {
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
}

function getNoteTimestamp(noteId) {
  return null;
}

async function loadNote(noteId) {
  if (!password) {
    showPasswordModal();
    return;
  }
  
  const result = await ipcRenderer.invoke('load-note', { noteId, password });
  if (result.success) {
    currentNoteId = noteId;
    elements.noteTitle.value = decodeNoteId(noteId);
    elements.editor.value = result.content;
    renderPreview();
    renderNotesList();
    
    if (result.recovered) {
      showToast('该笔记文件已损坏，已从备份恢复', 'success');
    }
  } else {
    showToast(result.error, 'error');
  }
}

async function saveNote() {
  if (!password) {
    showPasswordModal();
    return;
  }
  
  const title = elements.noteTitle.value.trim();
  if (!title) {
    showToast('请输入笔记标题', 'error');
    return;
  }
  
  const noteId = encodeURIComponent(title);
  const content = elements.editor.value;
  
  const result = await ipcRenderer.invoke('save-note', { noteId, content, password });
  if (result.success) {
    currentNoteId = noteId;
    showToast('笔记已保存');
    await loadNotesList();
    
    if (searchIndexBuilt) {
      await ipcRenderer.invoke('update-search-index', { noteId, content, password });
    }
  } else {
    showToast(result.error, 'error');
  }
}

async function deleteNote() {
  if (!currentNoteId) {
    showToast('请选择要删除的笔记', 'error');
    return;
  }
  
  if (confirm('确定要删除这个笔记吗？')) {
    const result = await ipcRenderer.invoke('delete-note', currentNoteId);
    if (result.success) {
      currentNoteId = null;
      elements.noteTitle.value = '';
      elements.editor.value = '';
      elements.preview.innerHTML = '';
      showToast('笔记已删除');
      await loadNotesList();
    } else {
      showToast(result.error, 'error');
    }
  }
}

function showPasswordModal() {
  elements.passwordModal.classList.remove('hidden');
  elements.passwordInput.focus();
}

function hidePasswordModal() {
  elements.passwordModal.classList.add('hidden');
}

function showSyncModal() {
  elements.syncModal.classList.remove('hidden');
}

function hideSyncModal() {
  elements.syncModal.classList.add('hidden');
}

async function submitPassword() {
  const pwd = elements.passwordInput.value.trim();
  if (!pwd) {
    showToast('请输入密码', 'error');
    return;
  }
  
  password = pwd;
  hidePasswordModal();
  
  if (notes.length > 0 && !currentNoteId) {
    loadNote(notes[0]);
  }
}

async function syncNotes() {
  if (!password) {
    showPasswordModal();
    return;
  }
  
  const serverUrl = elements.serverUrl.value.trim() || 'http://localhost:3000';
  const userId = elements.userId.value.trim() || 'default';
  
  hideSyncModal();
  showToast('正在同步...');
  
  const result = await ipcRenderer.invoke('sync-notes', { password, serverUrl, userId });
  if (result.success) {
    const updatedMsg = result.updatedCount ? `，更新 ${result.updatedCount} 个` : '';
    showToast(`同步成功！共 ${result.syncedCount} 个笔记${updatedMsg}`);
    await loadNotesList();
  } else {
    let errorMsg = result.error || '同步失败';
    if (errorMsg.includes('Network error')) {
      errorMsg = '网络连接失败，本地数据已安全保护';
    }
    showToast(`同步失败: ${errorMsg}`, 'error');
  }
}

function createNewNote() {
  currentNoteId = null;
  elements.noteTitle.value = '';
  elements.editor.value = '';
  elements.preview.innerHTML = '';
  renderNotesList();
  elements.noteTitle.focus();
}

elements.newNoteBtn.addEventListener('click', createNewNote);
elements.saveBtn.addEventListener('click', saveNote);
elements.deleteBtn.addEventListener('click', deleteNote);
elements.syncBtn.addEventListener('click', showSyncModal);
elements.passwordSubmit.addEventListener('click', submitPassword);
elements.passwordInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') submitPassword();
});
elements.syncCancel.addEventListener('click', hideSyncModal);
elements.syncSubmit.addEventListener('click', syncNotes);

elements.editTab.addEventListener('click', () => {
  elements.editTab.classList.add('active');
  elements.previewTab.classList.remove('active');
  elements.editor.classList.remove('hidden');
  elements.preview.classList.add('hidden');
});

elements.previewTab.addEventListener('click', () => {
  elements.previewTab.classList.add('active');
  elements.editTab.classList.remove('active');
  elements.preview.classList.remove('hidden');
  elements.editor.classList.add('hidden');
  renderPreview();
});

async function buildSearchIndex() {
  if (!password || searchIndexBuilt) return;
  
  try {
    const result = await ipcRenderer.invoke('rebuild-search-index', password);
    if (result.success) {
      searchIndexBuilt = true;
      console.log(`Search index built: ${result.indexedCount} notes, ${result.keywordCount} keywords`);
    }
  } catch (error) {
    console.warn('Failed to build search index:', error);
  }
}

async function performSearch(query) {
  if (!query || query.trim().length < 1) {
    elements.searchResults.classList.add('hidden');
    elements.notesList.classList.remove('hidden');
    return;
  }
  
  if (!password) {
    showPasswordModal();
    return;
  }
  
  if (!searchIndexBuilt) {
    await buildSearchIndex();
  }
  
  try {
    let result;
    if (elements.useBlindIndex.checked) {
      result = await ipcRenderer.invoke('search-blind-index', { query, password });
    } else {
      result = await ipcRenderer.invoke('search-notes', query);
    }
    
    if (result.success && result.results.length > 0) {
      renderSearchResults(result.results);
    } else {
      showNoSearchResults();
    }
  } catch (error) {
    console.error('Search error:', error);
    showNoSearchResults();
  }
}

function renderSearchResults(results) {
  elements.searchResults.innerHTML = '';
  elements.searchResults.classList.remove('hidden');
  elements.notesList.classList.add('hidden');
  
  if (results.length === 0) {
    showNoSearchResults();
    return;
  }
  
  results.forEach(item => {
    const resultItem = document.createElement('div');
    resultItem.className = 'search-result-item';
    
    const title = item.title || decodeNoteTitle(item.noteId);
    const score = item.score ? (item.score * 100).toFixed(0) + '%' : '';
    
    resultItem.innerHTML = `
      <div class="search-result-title">${escapeHtml(title)}</div>
      <div class="search-result-preview">${escapeHtml(item.preview || '')}</div>
      ${score ? `<div class="search-result-score">匹配度: ${score}</div>` : ''}
    `;
    
    resultItem.addEventListener('click', () => {
      loadNote(item.noteId);
      clearSearch();
    });
    
    elements.searchResults.appendChild(resultItem);
  });
}

function showNoSearchResults() {
  elements.searchResults.innerHTML = '<div style="padding: 10px; color: #95a5a6; font-size: 12px;">未找到匹配的笔记</div>';
  elements.searchResults.classList.remove('hidden');
}

function clearSearch() {
  elements.searchInput.value = '';
  elements.searchResults.classList.add('hidden');
  elements.notesList.classList.remove('hidden');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

function decodeNoteTitle(noteId) {
  try {
    return decodeURIComponent(noteId);
  } catch {
    return noteId;
  }
}

elements.searchInput.addEventListener('input', (e) => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    performSearch(e.target.value);
  }, 300);
});

elements.searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    clearSearch();
  }
});

elements.searchInput.addEventListener('focus', () => {
  if (!searchIndexBuilt && elements.searchInput.value) {
    performSearch(elements.searchInput.value);
  }
});

async function loadConfig() {
  const config = await ipcRenderer.invoke('get-config');
  elements.serverUrl.value = config.serverUrl || 'http://localhost:3000';
  elements.userId.value = config.userId || '';
}

loadNotesList();
loadConfig();
