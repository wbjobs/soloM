import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { IndexeddbPersistence } from 'y-indexeddb';
import { MonacoBinding } from 'y-monaco';
import * as monaco from 'monaco-editor';
import * as encoding from 'lib0/encoding';
import * as syncProtocol from 'y-protocols/sync';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === 'json') return new jsonWorker();
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker();
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker();
    if (label === 'typescript' || label === 'javascript') return new tsWorker();
    return new editorWorker();
  }
};

const USER_COLORS = [
  '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7',
  '#dfe6e9', '#fd79a8', '#a29bfe', '#6c5ce7', '#00b894',
  '#e17055', '#0984e3', '#636e72', '#b2bec3', '#74b9ff'
];

function getRandomColor() {
  return USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];
}

function getInitials(name) {
  return name.slice(0, 2).toUpperCase();
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前';
  if (diff < 604800000) return Math.floor(diff / 86400000) + ' 天前';
  return date.toLocaleDateString('zh-CN');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

const params = new URLSearchParams(window.location.search);
const docName = params.get('doc') || 'default';
const userName = params.get('user') || '用户' + Math.floor(Math.random() * 1000);
const userColor = getRandomColor();

document.getElementById('docId').textContent = docName;

const ydoc = new Y.Doc();
const ytext = ydoc.getText('monaco');
const ycomments = ydoc.getArray('comments');

const roomName = docName;
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = wsProtocol + '//localhost:1234/' + roomName;

const provider = new WebsocketProvider(wsUrl, roomName, ydoc, {
  connect: true,
  maxBackoffTime: 3000,
  resyncInterval: 3000
});

const persistence = new IndexeddbPersistence('crdt-editor-' + roomName, ydoc);

const awareness = provider.awareness;

awareness.setLocalStateField('user', {
  name: userName,
  color: userColor,
  colorLight: userColor + '33'
});

const editor = monaco.editor.create(document.getElementById('editor'), {
  value: '',
  language: 'javascript',
  theme: 'vs-dark',
  automaticLayout: true,
  minimap: { enabled: true },
  fontSize: 14,
  fontFamily: 'Consolas, "Courier New", monospace',
  lineNumbers: 'on',
  renderWhitespace: 'selection',
  scrollBeyondLastLine: false,
  wordWrap: 'on',
  tabSize: 2,
  cursorBlinking: 'smooth',
  cursorSmoothCaretAnimation: 'on',
  glyphMargin: true,
  lineDecorationsWidth: 20
});

class CursorUndoManager {
  constructor(ytext, editor) {
    this.ytext = ytext;
    this.editor = editor;
    this.isTracking = true;
    this.debounceTimer = null;
    this.undoManager = new Y.UndoManager(ytext, {
      trackedOrigins: new Set([this]),
      captureTimeout: 300
    });
    this.undoManager.on('stack-item-added', (event) => {
      const position = this.editor.getPosition();
      event.stackItem.meta.set('cursorPosition', position);
    });
    this.undoManager.on('stack-item-popped', (event) => {
      const cursorPosition = event.stackItem.meta.get('cursorPosition');
      if (cursorPosition) {
        setTimeout(() => {
          this.editor.setPosition(cursorPosition);
          this.editor.revealPositionInCenter(cursorPosition);
        }, 0);
      }
    });
  }
  undo() {
    this.isTracking = false;
    this.undoManager.undo();
    setTimeout(() => { this.isTracking = true; }, 50);
  }
  redo() {
    this.isTracking = false;
    this.undoManager.redo();
    setTimeout(() => { this.isTracking = true; }, 50);
  }
  capture() {
    this.undoManager.capture(this.ytext.doc, this);
  }
  clear() {
    this.undoManager.clear();
  }
}

const undoManager = new CursorUndoManager(ytext, editor);

editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyZ, () => {
  undoManager.undo();
});

editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyZ, () => {
  undoManager.redo();
});

editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyY, () => {
  undoManager.redo();
});

editor.onKeyDown((e) => {
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
    if (e.shiftKey) {
      e.preventDefault();
      undoManager.redo();
    } else {
      e.preventDefault();
      undoManager.undo();
    }
  }
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') {
    e.preventDefault();
    undoManager.redo();
  }
});

editor.getModel().onDidChangeContent((event) => {
  if (!undoManager.isTracking) return;
  const isSignificantChange = event.changes.some(change => 
    change.text.length > 1 || change.rangeLength > 1
  );
  if (isSignificantChange) {
    clearTimeout(undoManager.debounceTimer);
    undoManager.debounceTimer = setTimeout(() => {
      undoManager.capture();
    }, 300);
  }
});

const monacoBinding = new MonacoBinding(
  ytext,
  editor.getModel(),
  new Set([editor]),
  awareness
);

class CommentManager {
  constructor(ycomments, editor, userName, userColor) {
    this.ycomments = ycomments;
    this.editor = editor;
    this.userName = userName;
    this.userColor = userColor;
    this.decorations = [];
    this.currentLine = null;
    this.activeCommentId = null;
    this.initEventListeners();
    this.renderComments();
  }
  
  initEventListeners() {
    this.ycomments.observe(() => {
      this.renderComments();
      this.updateLineDecorations();
    });
    
    this.editor.onMouseDown((e) => {
      if (e.target.type === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS ||
          e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
        const lineNumber = e.target.position.lineNumber;
        this.showCommentModal(lineNumber);
      }
    });
    
    this.editor.onDidChangeCursorPosition((e) => {
      const lineNumber = e.position.lineNumber;
      this.highlightLineComments(lineNumber);
    });
    
    document.getElementById('closeCommentModal').addEventListener('click', () => {
      this.hideCommentModal();
    });
    
    document.getElementById('cancelComment').addEventListener('click', () => {
      this.hideCommentModal();
    });
    
    document.getElementById('submitComment').addEventListener('click', () => {
      this.submitComment();
    });
    
    document.getElementById('commentInput').addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        this.submitComment();
      }
    });
  }
  
  showCommentModal(lineNumber) {
    this.currentLine = lineNumber;
    document.getElementById('commentLineInfo').textContent = '第 ' + lineNumber + ' 行';
    document.getElementById('commentInput').value = '';
    document.getElementById('commentModal').classList.add('show');
    document.getElementById('commentInput').focus();
  }
  
  hideCommentModal() {
    this.currentLine = null;
    document.getElementById('commentModal').classList.remove('show');
  }
  
  submitComment() {
    const content = document.getElementById('commentInput').value.trim();
    if (!content || !this.currentLine) return;
    const commentId = 'comment_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const comment = new Y.Map();
    comment.set('id', commentId);
    comment.set('lineNumber', this.currentLine);
    comment.set('content', content);
    comment.set('author', this.userName);
    comment.set('authorColor', this.userColor);
    comment.set('timestamp', Date.now());
    comment.set('resolved', false);
    comment.set('replies', new Y.Array());
    this.ycomments.push([comment]);
    this.hideCommentModal();
  }
  
  addReply(commentId, content) {
    if (!content.trim()) return;
    const comment = this.ycomments.toArray().find(c => c.get('id') === commentId);
    if (!comment) return;
    const replies = comment.get('replies');
    const reply = new Y.Map();
    reply.set('id', 'reply_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9));
    reply.set('content', content.trim());
    reply.set('author', this.userName);
    reply.set('authorColor', this.userColor);
    reply.set('timestamp', Date.now());
    replies.push([reply]);
  }
  
  toggleResolve(commentId) {
    const comment = this.ycomments.toArray().find(c => c.get('id') === commentId);
    if (comment) {
      comment.set('resolved', !comment.get('resolved'));
    }
  }
  
  deleteComment(commentId) {
    const index = this.ycomments.toArray().findIndex(c => c.get('id') === commentId);
    if (index !== -1) {
      this.ycomments.delete(index, 1);
    }
  }
  
  highlightLineComments(lineNumber) {
    const comments = this.ycomments.toArray().filter(c => c.get('lineNumber') === lineNumber);
    if (comments.length > 0) {
      this.activeCommentId = comments[0].get('id');
    } else {
      this.activeCommentId = null;
    }
    this.renderComments();
  }
  
  scrollToComment(commentId) {
    const comment = this.ycomments.toArray().find(c => c.get('id') === commentId);
    if (comment) {
      const lineNumber = comment.get('lineNumber');
      this.editor.revealLineInCenter(lineNumber);
      this.editor.setPosition({ lineNumber, column: 1 });
      this.activeCommentId = commentId;
      this.renderComments();
    }
  }
  
  updateLineDecorations() {
    const linesWithComments = new Set();
    this.ycomments.forEach(comment => {
      if (!comment.get('resolved')) {
        linesWithComments.add(comment.get('lineNumber'));
      }
    });
    const newDecorations = Array.from(linesWithComments).map(lineNumber => ({
      range: new monaco.Range(lineNumber, 1, lineNumber, 1),
      options: {
        isWholeLine: true,
        linesDecorationsClassName: 'line-with-comment',
        glyphMarginClassName: 'comment-glyph',
        hoverMessage: { value: '有评论，点击行号查看' }
      }
    }));
    this.decorations = this.editor.deltaDecorations(this.decorations, newDecorations);
  }
  
  renderComments() {
    const commentsList = document.getElementById('commentsList');
    const commentsCount = document.getElementById('commentsCount');
    const comments = this.ycomments.toArray();
    commentsCount.textContent = comments.length;
    
    if (comments.length === 0) {
      commentsList.innerHTML = '<div class="empty-comments"><div class="empty-comments-icon">💭</div><div>暂无评论</div><div class="add-comment-hint">点击行号可以添加评论</div></div>';
      return;
    }
    
    const sortedComments = [...comments].sort((a, b) => {
      if (a.get('resolved') !== b.get('resolved')) {
        return a.get('resolved') ? 1 : -1;
      }
      return b.get('timestamp') - a.get('timestamp');
    });
    
    let html = '';
    sortedComments.forEach(comment => {
      const id = comment.get('id');
      const lineNumber = comment.get('lineNumber');
      const content = comment.get('content');
      const author = comment.get('author');
      const authorColor = comment.get('authorColor');
      const timestamp = comment.get('timestamp');
      const resolved = comment.get('resolved');
      const replies = comment.get('replies').toArray();
      const isActive = this.activeCommentId === id;
      
      let repliesHtml = '';
      if (replies.length > 0) {
        repliesHtml += '<div class="comment-replies">';
        replies.forEach(reply => {
          repliesHtml += '<div class="reply-item"><div class="reply-avatar" style="background: ' + reply.get('authorColor') + '">' + getInitials(reply.get('author')) + '</div><div class="reply-content"><span class="reply-author">' + reply.get('author') + '</span><span class="reply-time">' + formatTime(reply.get('timestamp')) + '</span><div class="reply-text">' + escapeHtml(reply.get('content')) + '</div></div></div>';
        });
        repliesHtml += '</div>';
      }
      
      html += '<div class="comment-bubble ' + (resolved ? 'resolved' : '') + ' ' + (isActive ? 'active' : '') + '" data-comment-id="' + id + '"><div class="comment-header"><div class="comment-header-info"><div class="comment-avatar" style="background: ' + authorColor + '">' + getInitials(author) + '</div><span class="comment-line" onclick="window.commentManager.scrollToComment(\'' + id + '\')">L' + lineNumber + '</span><span class="comment-author">' + author + '</span><span class="comment-time">' + formatTime(timestamp) + '</span></div><div class="comment-actions"><button class="comment-action-btn resolve-btn" onclick="window.commentManager.toggleResolve(\'' + id + '\')">' + (resolved ? '重新打开' : '解决') + '</button><button class="comment-action-btn delete-btn" onclick="window.commentManager.deleteComment(\'' + id + '\')">删除</button></div></div><div class="comment-content">' + escapeHtml(content) + '</div>' + repliesHtml + '<div class="reply-input-container"><input type="text" class="reply-input" placeholder="回复评论..." data-comment-id="' + id + '"></div></div>';
    });
    
    commentsList.innerHTML = html;
    this.bindReplyEvents();
  }
  
  bindReplyEvents() {
    const self = this;
    const replyInputs = document.querySelectorAll('.reply-input');
    replyInputs.forEach(input => {
      const handleKeydown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          const commentId = e.target.dataset.commentId;
          self.addReply(commentId, e.target.value);
          e.target.value = '';
        }
      };
      input.onkeydown = handleKeydown;
    });
  }
}

const commentManager = new CommentManager(ycomments, editor, userName, userColor);
window.commentManager = commentManager;

const statusEl = document.getElementById('status');
const usersEl = document.getElementById('users');
const syncStatusEl = document.getElementById('syncStatus');
const lineInfoEl = document.getElementById('lineInfo');

let connectionAttempts = 0;
let forceSyncTimer = null;
let lastSyncTime = 0;

function updateStatus(state) {
  statusEl.className = 'status';
  const statusTextEl = document.getElementById('statusText');
  if (state === 'connected') {
    statusEl.classList.add('connected');
    statusTextEl.textContent = '已连接';
  } else if (state === 'connecting') {
    statusEl.classList.add('syncing');
    statusTextEl.textContent = '连接中...';
  } else if (state === 'disconnected') {
    statusTextEl.textContent = '离线 (本地保存)';
  } else if (state === 'syncing') {
    statusEl.classList.add('syncing');
    statusTextEl.textContent = '同步中...';
  } else if (state === 'force-sync') {
    statusEl.classList.add('syncing');
    statusTextEl.textContent = '强制同步中...';
  }
}

function updateUsers() {
  const states = awareness.getStates();
  usersEl.innerHTML = '';
  states.forEach((state, clientId) => {
    if (state.user) {
      const userEl = document.createElement('div');
      userEl.className = 'user-cursor';
      userEl.style.backgroundColor = state.user.color;
      userEl.style.borderColor = state.user.colorLight;
      userEl.textContent = getInitials(state.user.name);
      userEl.title = state.user.name;
      if (clientId === awareness.clientID) {
        userEl.style.border = '2px solid white';
      }
      usersEl.appendChild(userEl);
    }
  });
}

function forceFullSync() {
  if (!provider.wsconnected) return;
  updateStatus('force-sync');
  syncStatusEl.textContent = '强制同步状态...';
  if (provider.ws && provider.ws.readyState === WebSocket.OPEN) {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 0);
    syncProtocol.writeSyncStep1(encoder, ydoc);
    provider.ws.send(encoding.toUint8Array(encoder));
  }
  setTimeout(() => {
    if (provider.wsconnected) {
      syncStatusEl.textContent = '同步完成';
      updateStatus('connected');
    }
  }, 2000);
}

provider.on('status', (event) => {
  updateStatus(event.status);
  if (event.status === 'connected') {
    connectionAttempts = 0;
    syncStatusEl.textContent = '实时同步中';
    setTimeout(() => { forceFullSync(); }, 500);
    forceSyncTimer = setInterval(() => { forceFullSync(); }, 30000);
  } else if (event.status === 'connecting') {
    connectionAttempts++;
    syncStatusEl.textContent = '尝试重连 (第' + connectionAttempts + '次)...';
    if (forceSyncTimer) {
      clearInterval(forceSyncTimer);
      forceSyncTimer = null;
    }
  } else {
    syncStatusEl.textContent = '离线模式 - 更改保存在本地';
    if (forceSyncTimer) {
      clearInterval(forceSyncTimer);
      forceSyncTimer = null;
    }
  }
});

provider.on('sync', (isSynced) => {
  lastSyncTime = Date.now();
  if (isSynced) {
    syncStatusEl.textContent = '已同步';
    setTimeout(() => {
      if (provider.wsconnected) {
        syncStatusEl.textContent = '实时同步中';
      }
    }, 1000);
  } else {
    updateStatus('syncing');
  }
});

provider.on('connection-close', () => {
  console.warn('Connection closed, will retry...');
});

provider.on('connection-error', (err) => {
  console.error('Connection error:', err);
});

awareness.on('change', updateUsers);

persistence.on('synced', () => {
  syncStatusEl.textContent = '本地已加载';
});

editor.onDidChangeCursorPosition((e) => {
  lineInfoEl.textContent = '行 ' + e.position.lineNumber + ', 列 ' + e.position.column;
});

const languageSelect = document.getElementById('languageSelect');
languageSelect.addEventListener('change', (e) => {
  monaco.editor.setModelLanguage(editor.getModel(), e.target.value);
});

document.getElementById('clearBtn').addEventListener('click', async () => {
  if (confirm('确定要清空本地缓存吗？这将删除所有离线保存的更改。')) {
    try {
      await persistence.clearData();
      undoManager.clear();
      alert('本地缓存已清空，刷新页面后将从服务器重新加载。');
      window.location.reload();
    } catch (err) {
      console.error('Failed to clear cache:', err);
      alert('清空缓存失败: ' + err.message);
    }
  }
});

document.getElementById('forceSyncBtn').addEventListener('click', () => {
  forceFullSync();
});

ydoc.on('update', () => {
  syncStatusEl.textContent = '同步中...';
});

let syncTimeout;
ydoc.on('update', () => {
  clearTimeout(syncTimeout);
  syncTimeout = setTimeout(() => {
    if (provider.wsconnected) {
      syncStatusEl.textContent = '实时同步中';
    }
  }, 500);
});

window.addEventListener('online', () => {
  syncStatusEl.textContent = '网络恢复，正在同步...';
  if (!provider.wsconnected) {
    provider.connect();
  }
  setTimeout(() => { forceFullSync(); }, 1000);
});

window.addEventListener('offline', () => {
  updateStatus('disconnected');
  syncStatusEl.textContent = '网络断开 - 更改保存在本地';
});

window.addEventListener('beforeunload', () => {
  if (forceSyncTimer) {
    clearInterval(forceSyncTimer);
  }
  if (provider.wsconnected) {
    provider.disconnect();
  }
  persistence.destroy();
});

window.editor = editor;
window.ydoc = ydoc;
window.provider = provider;
window.undoManager = undoManager;
window.forceFullSync = forceFullSync;

updateUsers();
updateStatus('connecting');
syncStatusEl.textContent = '加载中...';
