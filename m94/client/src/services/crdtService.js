import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { MonacoBinding } from 'y-monaco';
import { EnhancedIndexedDBPersistence } from './compactionService';

const userColors = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
  '#BB8FCE', '#85C1E9', '#F8B500', '#00CED1',
];

export const generateUserId = () => {
  return 'user_' + Math.random().toString(36).substr(2, 9);
};

export const generateUserName = () => {
  const names = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Henry'];
  return names[Math.floor(Math.random() * names.length)] + '_' + Math.floor(Math.random() * 1000);
};

export const getUserColor = (userId) => {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash % userColors.length);
  return userColors[index];
};

const CURSOR_DEBOUNCE_MS = 30;

export class CRDTService {
  constructor(roomName, userId, userName, userColor) {
    this.roomName = roomName;
    this.userId = userId;
    this.userName = userName;
    this.userColor = userColor;
    this.ydoc = null;
    this.wsProvider = null;
    this.indexeddbProvider = null;
    this.monacoBinding = null;
    this.ytext = null;
    this.listeners = new Map();
    this.isConnected = false;
    this.isSynced = false;
    this.editor = null;
    this.monacoInstance = null;
    this._cursorTimer = null;
    this._pendingCursorUpdate = false;
    this._relativeAnchor = null;
    this._relativeHead = null;
    this._isApplyingRemoteUpdate = false;
    this._localCursorBeforeRemote = null;
  }

  async initialize() {
    this.ydoc = new Y.Doc();
    this.ytext = this.ydoc.getText('monaco');

    this.indexeddbProvider = new EnhancedIndexedDBPersistence(
      this.roomName,
      this.ydoc
    );

    this.indexeddbProvider.on('loadingProgress', (progress) => {
      this.emit('loadingProgress', progress);
    });

    this.indexeddbProvider.on('synced', () => {
      console.log('[IndexedDB] 本地数据已同步（增强模式）');
      this.emit('localSynced');
    });

    await this.indexeddbProvider.initialize();

    this.wsProvider = new WebsocketProvider(
      `ws://localhost:1234?room=${encodeURIComponent(this.roomName)}&userId=${encodeURIComponent(this.userId)}&userName=${encodeURIComponent(this.userName)}&color=${encodeURIComponent(this.userColor)}`,
      this.roomName,
      this.ydoc,
      {
        connect: true,
        maxBackoffTime: 5000,
      }
    );

    this.wsProvider.on('status', (event) => {
      this.isConnected = event.status === 'connected';
      console.log('[WebSocket] 连接状态:', event.status);
      this.emit('connectionStatus', this.isConnected);
    });

    this.wsProvider.on('sync', (isSynced) => {
      this.isSynced = isSynced;
      console.log('[CRDT] 文档同步状态:', isSynced);
      this.emit('syncStatus', isSynced);
    });

    this.ydoc.on('update', (update, origin) => {
      if (origin !== this && origin !== this.wsProvider && origin !== this.indexeddbProvider) {
        this._handleRemoteUpdate(update);
      }
    });

    this.awareness = this.wsProvider.awareness;
    this.awareness.setLocalStateField('user', {
      id: this.userId,
      name: this.userName,
      color: this.userColor,
    });

    this.awareness.on('change', this.handleAwarenessChange.bind(this));

    return new Promise((resolve) => {
      if (this.indexeddbProvider.synced) {
        resolve();
      } else {
        this.indexeddbProvider.on('synced', () => resolve());
      }
    });
  }

  _handleRemoteUpdate(update) {
    this._isApplyingRemoteUpdate = true;

    if (this.editor) {
      this._localCursorBeforeRemote = {
        selection: this.editor.getSelection(),
        scrollPosition: this.editor.getScrollTop(),
      };
    }

    if (this._relativeAnchor && this._relativeHead && this.ytext) {
      this._scheduleCursorCorrection();
    }

    requestAnimationFrame(() => {
      this._isApplyingRemoteUpdate = false;
      this._executeCursorCorrection();
    });
  }

  _scheduleCursorCorrection() {
    if (this._cursorCorrectionTimer) {
      clearTimeout(this._cursorCorrectionTimer);
    }

    this._cursorCorrectionTimer = setTimeout(() => {
      this._executeCursorCorrection();
      this._cursorCorrectionTimer = null;
    }, CURSOR_DEBOUNCE_MS);
  }

  _executeCursorCorrection() {
    if (!this.editor || !this.ytext || !this._relativeAnchor || !this._relativeHead) {
      return;
    }

    try {
      const anchorAbs = Y.createAbsolutePositionFromRelativePosition(this._relativeAnchor, this.ydoc);
      const headAbs = Y.createAbsolutePositionFromRelativePosition(this._relativeHead, this.ydoc);

      if (!anchorAbs || !headAbs) {
        this._updateRelativePositionsFromEditor();
        return;
      }

      const anchorIndex = anchorAbs.index;
      const headIndex = headAbs.index;
      const model = this.editor.getModel();
      if (!model) return;

      const currentSelection = this.editor.getSelection();
      if (!currentSelection) return;

      const currentAnchorOffset = model.getOffsetAt(currentSelection.getStartPosition());
      const currentHeadOffset = model.getOffsetAt(currentSelection.getEndPosition());

      const anchorDiff = Math.abs(currentAnchorOffset - anchorIndex);
      const headDiff = Math.abs(currentHeadOffset - headIndex);

      if (anchorDiff > 2 || headDiff > 2) {
        const anchorPos = model.getPositionAt(anchorIndex);
        const headPos = model.getPositionAt(headIndex);

        const newSelection = new this.monacoInstance.Selection(
          anchorPos.lineNumber,
          anchorPos.column,
          headPos.lineNumber,
          headPos.column
        );

        this.editor.setSelection(newSelection);
        this.editor.revealPositionInCenterIfOutsideViewport(anchorPos);
      }

      this._updateAwarenessCursorFromEditor();
    } catch (err) {
      console.warn('[CRDT] 光标校正失败:', err);
      this._updateRelativePositionsFromEditor();
    }
  }

  _updateRelativePositionsFromEditor() {
    if (!this.editor || !this.ytext) return;

    const selection = this.editor.getSelection();
    if (!selection) return;

    const model = this.editor.getModel();
    if (!model) return;

    const anchorOffset = model.getOffsetAt(selection.getStartPosition());
    const headOffset = model.getOffsetAt(selection.getEndPosition());

    this._relativeAnchor = Y.createRelativePositionFromTypeIndex(this.ytext, anchorOffset);
    this._relativeHead = Y.createRelativePositionFromTypeIndex(this.ytext, headOffset);
  }

  handleAwarenessChange({ added, updated, removed }) {
    const users = [];
    this.awareness.getStates().forEach((state, clientId) => {
      if (state.user) {
        users.push({
          clientId,
          ...state.user,
          cursor: state.cursor,
          selection: state.selection,
        });
      }
    });
    this.emit('usersChange', users);
  }

  bindMonaco(editor, monaco) {
    if (this.monacoBinding) {
      this.monacoBinding.destroy();
    }

    this.editor = editor;
    this.monacoInstance = monaco;

    this.monacoBinding = new MonacoBinding(
      this.ytext,
      editor.getModel(),
      new Set([editor]),
      this.awareness
    );

    editor.onDidChangeCursorPosition((e) => {
      this._debouncedUpdateCursor();
    });

    editor.onDidChangeCursorSelection((e) => {
      this._debouncedUpdateCursor();
    });

    editor.onDidChangeModelContent((e) => {
      this._updateRelativePositionsFromEditor();
    });

    this._updateRelativePositionsFromEditor();
    this.updateAwarenessCursor(editor);
  }

  _debouncedUpdateCursor() {
    this._pendingCursorUpdate = true;

    if (this._cursorTimer) {
      clearTimeout(this._cursorTimer);
    }

    this._cursorTimer = setTimeout(() => {
      if (this._pendingCursorUpdate && this.editor) {
        this._updateRelativePositionsFromEditor();
        this.updateAwarenessCursor(this.editor);
        this._pendingCursorUpdate = false;
      }
      this._cursorTimer = null;
    }, CURSOR_DEBOUNCE_MS);
  }

  updateAwarenessCursor(editor) {
    this._updateAwarenessCursorFromEditor();
  }

  _updateAwarenessCursorFromEditor() {
    if (!this.editor || !this.awareness) return;

    const selection = this.editor.getSelection();
    if (!selection) return;

    const model = this.editor.getModel();
    if (!model) return;

    const anchor = model.getOffsetAt(selection.getStartPosition());
    const head = model.getOffsetAt(selection.getEndPosition());

    this.awareness.setLocalStateField('cursor', {
      anchor,
      head,
    });

    this.awareness.setLocalStateField('selection', {
      startLineNumber: selection.startLineNumber,
      startColumn: selection.startColumn,
      endLineNumber: selection.endLineNumber,
      endColumn: selection.endColumn,
    });
  }

  getText() {
    return this.ytext ? this.ytext.toString() : '';
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  emit(event, ...args) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach((cb) => cb(...args));
    }
  }

  connect() {
    if (this.wsProvider) {
      this.wsProvider.connect();
    }
  }

  disconnect() {
    if (this.wsProvider) {
      this.wsProvider.disconnect();
    }
  }

  destroy() {
    if (this._cursorTimer) {
      clearTimeout(this._cursorTimer);
      this._cursorTimer = null;
    }
    if (this._cursorCorrectionTimer) {
      clearTimeout(this._cursorCorrectionTimer);
      this._cursorCorrectionTimer = null;
    }
    if (this.monacoBinding) {
      this.monacoBinding.destroy();
    }
    if (this.wsProvider) {
      this.wsProvider.destroy();
    }
    if (this.indexeddbProvider) {
      this.indexeddbProvider.destroy();
    }
    if (this.ydoc) {
      this.ydoc.destroy();
    }
    this.editor = null;
    this.monacoInstance = null;
    this._relativeAnchor = null;
    this._relativeHead = null;
    this.listeners.clear();
  }
}

export default CRDTService;
