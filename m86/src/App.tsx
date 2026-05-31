import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "./api";
import { Note, ConnectionStatus, PowerEvent } from "./types";
import SyncPanel from "./components/SyncPanel";

function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    connected: false,
    error: null,
  });
  const [isRecovering, setIsRecovering] = useState(false);
  const [powerEvent, setPowerEvent] = useState<PowerEvent | null>(null);
  const [showConnectionBanner, setShowConnectionBanner] = useState(false);

  const unlistenRef = useRef<Array<() => void>>([]);

  useEffect(() => {
    setupEventListeners();
    initializeApp();

    return () => {
      unlistenRef.current.forEach((unlisten) => unlisten());
    };
  }, []);

  const setupEventListeners = async () => {
    const unlisten1 = await api.onConnectionStatusChange((status) => {
      console.log("Connection status changed:", status);
      setConnectionStatus(status);
      setShowConnectionBanner(!status.connected);

      if (!status.connected && !isRecovering) {
        setError(status.error || "数据库连接断开");
      } else if (status.connected) {
        setError(null);
        loadNotes();
      }
    });

    const unlisten2 = await api.onPowerEvent((event) => {
      console.log("Power event:", event);
      setPowerEvent(event);
      if (event.event_type === "suspend") {
        setShowConnectionBanner(true);
        setError("系统正在休眠，已断开数据库连接");
      }
    });

    const unlisten3 = await api.onWakeupRecovery((status) => {
      console.log("Wakeup recovery:", status);
      if (status === "success") {
        setIsRecovering(false);
        setPowerEvent(null);
        setTimeout(() => setShowConnectionBanner(false), 3000);
      } else if (status === "failed") {
        setIsRecovering(false);
        setError("系统唤醒后自动恢复失败，请点击手动重连");
      }
    });

    unlistenRef.current = [unlisten1, unlisten2, unlisten3];
  };

  const initializeApp = async () => {
    try {
      setIsLoading(true);
      await api.initializeDatabase();
      setConnectionStatus({ connected: true, error: null });
      await loadNotes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "初始化失败");
      setConnectionStatus({
        connected: false,
        error: err instanceof Error ? err.message : "初始化失败",
      });
      setShowConnectionBanner(true);
    } finally {
      setIsLoading(false);
    }
  };

  const loadNotes = useCallback(async () => {
    try {
      const data = await api.getNotes();
      setNotes(data);
      if (data.length > 0 && !selectedNote) {
        setSelectedNote(data[0]);
        setEditTitle(data[0].title);
        setEditContent(data[0].content);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "加载笔记失败";
      if (!errMsg.includes("Database not connected")) {
        setError(errMsg);
      }
    }
  }, [selectedNote]);

  const handleSearch = async () => {
    if (!connectionStatus.connected) return;

    if (searchQuery.trim()) {
      api.searchNotes(searchQuery).then(setNotes);
    } else {
      loadNotes();
    }
  };

  useEffect(() => {
    const timer = setTimeout(handleSearch, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, connectionStatus.connected]);

  const createNewNote = async () => {
    if (!connectionStatus.connected) {
      setError("数据库未连接，请先重连");
      return;
    }

    try {
      const newNote = await api.createNote({
        title: "新建笔记",
        content: "",
      });
      setNotes([newNote, ...notes]);
      setSelectedNote(newNote);
      setEditTitle(newNote.title);
      setEditContent(newNote.content);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建笔记失败");
    }
  };

  const selectNote = (note: Note) => {
    if (selectedNote?.id !== note.id) {
      setSelectedNote(note);
      setEditTitle(note.title);
      setEditContent(note.content);
    }
  };

  const saveNote = async () => {
    if (!connectionStatus.connected) {
      setError("数据库未连接，请先重连");
      return;
    }
    if (!selectedNote) return;

    try {
      const updated = await api.updateNote(selectedNote.id, {
        title: editTitle,
        content: editContent,
      });
      setNotes(notes.map((n) => (n.id === selectedNote.id ? updated : n)));
      setSelectedNote(updated);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存笔记失败");
    }
  };

  const deleteNote = async () => {
    if (!connectionStatus.connected) {
      setError("数据库未连接，请先重连");
      return;
    }
    if (!selectedNote) return;
    if (!confirm("确定要删除这篇笔记吗？")) return;

    try {
      await api.deleteNote(selectedNote.id);
      const newNotes = notes.filter((n) => n.id !== selectedNote.id);
      setNotes(newNotes);
      if (newNotes.length > 0) {
        setSelectedNote(newNotes[0]);
        setEditTitle(newNotes[0].title);
        setEditContent(newNotes[0].content);
      } else {
        setSelectedNote(null);
        setEditTitle("");
        setEditContent("");
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除笔记失败");
    }
  };

  const handleManualReconnect = async () => {
    setIsRecovering(true);
    setError("正在尝试重新连接...");

    try {
      const result = await api.reconnectDatabase();
      console.log("Reconnect result:", result);
      setConnectionStatus({ connected: true, error: null });
      setShowConnectionBanner(false);
      setError(null);
      setPowerEvent(null);
      await loadNotes();
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "重连失败";
      setError(errMsg);
      setConnectionStatus({ connected: false, error: errMsg });
    } finally {
      setIsRecovering(false);
    }
  };

  const handleSyncCompleted = useCallback(() => {
    loadNotes();
  }, [loadNotes]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const stripHtml = (html: string) => {
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || "";
  };

  if (isLoading) {
    return (
      <div className="loading">
        <div className="loading-spinner"></div>
        <span>正在初始化加密数据库...</span>
      </div>
    );
  }

  return (
    <div className="app">
      {showConnectionBanner && (
        <div
          className={`connection-banner ${
            connectionStatus.connected ? "success" : "error"
          }`}
        >
          <div className="connection-status-icon">
            {connectionStatus.connected ? "✓" : "⚠"}
          </div>
          <div className="connection-status-text">
            {powerEvent?.event_type === "suspend"
              ? "系统休眠中，数据库连接已暂停"
              : powerEvent?.event_type === "resume"
              ? "系统已唤醒，正在恢复数据库连接..."
              : connectionStatus.error || "数据库连接断开"}
          </div>
          {!connectionStatus.connected && (
            <button
              className="reconnect-btn"
              onClick={handleManualReconnect}
              disabled={isRecovering}
            >
              {isRecovering ? "重连中..." : "手动重连"}
            </button>
          )}
          <button
            className="close-banner-btn"
            onClick={() => setShowConnectionBanner(false)}
          >
            ×
          </button>
        </div>
      )}

      <div className="sidebar">
        <div className="sidebar-header">
          <h1>🔒 加密笔记</h1>
          <div className="header-right">
            <div
              className={`connection-indicator ${
                connectionStatus.connected ? "connected" : "disconnected"
              }`}
              title={
                connectionStatus.connected
                  ? "数据库已连接"
                  : "数据库未连接"
              }
            ></div>
            <button
              className="new-note-btn"
              onClick={createNewNote}
              disabled={!connectionStatus.connected}
            >
              + 新建
            </button>
          </div>
        </div>
        <div className="search-bar">
          <input
            type="text"
            placeholder="搜索笔记..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            disabled={!connectionStatus.connected}
          />
        </div>
        <div className="notes-list">
          {notes.length === 0 && connectionStatus.connected ? (
            <div className="empty-notes-list">
              <div className="empty-notes-icon">📝</div>
              <div className="empty-notes-text">
                {searchQuery
                  ? "没有找到匹配的笔记"
                  : "暂无笔记，点击新建开始"}
              </div>
            </div>
          ) : (
            notes.map((note) => (
              <div
                key={note.id}
                className={`note-item ${
                  selectedNote?.id === note.id ? "active" : ""
                }`}
                onClick={() => selectNote(note)}
              >
                <div className="note-item-title">{note.title}</div>
                <div className="note-item-preview">
                  {stripHtml(note.content).substring(0, 50)}
                </div>
                <div className="note-item-date">
                  {formatDate(note.updated_at)}
                </div>
              </div>
            ))
          )}
        </div>
        <SyncPanel onSyncCompleted={handleSyncCompleted} />
      </div>

      {selectedNote ? (
        <div className="editor-container">
          <div className="editor-header">
            <input
              type="text"
              className="editor-title-input"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="笔记标题"
              disabled={!connectionStatus.connected}
            />
            <div className="editor-actions">
              <button
                className="action-btn"
                onClick={saveNote}
                disabled={!connectionStatus.connected}
              >
                保存
              </button>
              <button
                className="action-btn delete"
                onClick={deleteNote}
                disabled={!connectionStatus.connected}
              >
                删除
              </button>
            </div>
          </div>
          <div className="editor-content">
            <textarea
              className="editor-textarea"
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              placeholder={
                connectionStatus.connected
                  ? "开始编写笔记内容..."
                  : "数据库未连接，请先重连后再编辑"
              }
              disabled={!connectionStatus.connected}
            />
          </div>
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-state-icon">📝</div>
          <div className="empty-state-text">
            {!connectionStatus.connected
              ? "数据库未连接，请点击上方手动重连"
              : notes.length === 0
              ? "暂无笔记，点击新建开始"
              : "选择一篇笔记开始编辑"}
          </div>
        </div>
      )}

      {error && (
        <div className="error-toast" onClick={() => setError(null)}>
          <span className="error-toast-message">⚠ {error}</span>
          <span className="error-toast-close">×</span>
        </div>
      )}
    </div>
  );
}

export default App;
