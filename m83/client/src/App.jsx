import { useState, useEffect } from 'react';
import { useYjs } from './hooks/useYjs';
import { useTimeMachine } from './hooks/useTimeMachine';
import CodeEditor from './components/CodeEditor';
import TimelineSlider from './components/TimelineSlider';

const LANGUAGES = [
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'java', label: 'Java' },
  { value: 'cpp', label: 'C++' },
  { value: 'csharp', label: 'C#' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'json', label: 'JSON' },
  { value: 'markdown', label: 'Markdown' }
];

function JoinScreen({ onJoin }) {
  const [userName, setUserName] = useState('');
  const [roomId, setRoomId] = useState('');

  useEffect(() => {
    const storedName = localStorage.getItem('userName');
    if (storedName) setUserName(storedName);
    const storedRoom = localStorage.getItem('lastRoom');
    if (storedRoom) setRoomId(storedRoom);
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (userName.trim() && roomId.trim()) {
      localStorage.setItem('userName', userName.trim());
      localStorage.setItem('lastRoom', roomId.trim());
      onJoin(userName.trim(), roomId.trim());
    }
  };

  return (
    <div className="join-screen">
      <div className="join-card">
        <h1 className="join-title">CRDT 协同编辑器</h1>
        <p className="join-subtitle">基于 Yjs 的实时协作代码编辑 · 支持时光机回溯</p>
        
        <form className="join-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">用户名</label>
            <input
              type="text"
              className="form-input"
              placeholder="输入你的名字"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
            />
          </div>
          
          <div className="form-group">
            <label className="form-label">房间 ID</label>
            <input
              type="text"
              className="form-input"
              placeholder="输入或创建房间"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
            />
          </div>
          
          <button
            type="submit"
            className="join-button"
            disabled={!userName.trim() || !roomId.trim()}
          >
            加入房间
          </button>
        </form>

        <div className="features">
          <div className="feature-item">
            <div className="feature-icon">🔄</div>
            <div className="feature-text">实时同步</div>
          </div>
          <div className="feature-item">
            <div className="feature-icon">📴</div>
            <div className="feature-text">离线支持</div>
          </div>
          <div className="feature-item">
            <div className="feature-icon">⏱</div>
            <div className="feature-text">时光机</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EditorScreen({ roomId, userName, onLeave }) {
  const [language, setLanguage] = useState('javascript');
  const [showUserList, setShowUserList] = useState(false);
  const { ydoc, users, status, isLoading, updateUserName, userColor } = useYjs(roomId, userName);
  const {
    timestamps,
    currentIndex,
    isTimeTraveling,
    previewContent,
    historyState,
    loading: timeMachineLoading,
    summary,
    seekTo,
    restoreCurrent,
    backToPresent,
    forceSnapshot,
  } = useTimeMachine(roomId);

  const getStatusText = () => {
    switch (status) {
      case 'connected': return '已连接';
      case 'connecting': return '连接中';
      default: return '未连接';
    }
  };

  return (
    <div className="app-container">
      <header className="header">
        <div className="header-left">
          <h1 className="app-title">CRDT Editor</h1>
          <div className="room-info">
            <span>房间:</span>
            <input
              type="text"
              className="room-input"
              value={roomId}
              readOnly
              onClick={(e) => e.target.select()}
            />
          </div>
        </div>

        <div className="header-right">
          {isTimeTraveling && (
            <span className="time-travel-badge">⏱ 历史预览</span>
          )}

          <div className="status-indicator">
            <span className={`status-dot ${status}`}></span>
            <span>{getStatusText()}</span>
          </div>

          <input
            type="text"
            className="user-name-input"
            value={userName}
            onChange={(e) => {
              updateUserName(e.target.value);
            }}
          />

          <div
            className="user-cursors"
            onMouseEnter={() => setShowUserList(true)}
            onMouseLeave={() => setShowUserList(false)}
          >
            {users.slice(0, 5).map((user) => (
              <div
                key={user.id}
                className="user-avatar"
                style={{ backgroundColor: user.color }}
                title={user.name}
              >
                {user.name.charAt(0).toUpperCase()}
              </div>
            ))}
            {users.length > 5 && (
              <div className="user-avatar" style={{ backgroundColor: '#555' }}>
                +{users.length - 5}
              </div>
            )}
          </div>

          {showUserList && (
            <div className="user-list">
              <div className="user-list-title">在线用户 ({users.length})</div>
              {users.map((user) => (
                <div key={user.id} className="user-list-item">
                  <div
                    className="user-avatar"
                    style={{ backgroundColor: user.color, width: 20, height: 20, fontSize: 10 }}
                  >
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <span>{user.name}</span>
                </div>
              ))}
            </div>
          )}

          <button
            className="join-button"
            style={{ padding: '6px 16px', fontSize: 13 }}
            onClick={onLeave}
          >
            离开
          </button>
        </div>
      </header>

      <div className="toolbar">
        <span className="toolbar-label">语言:</span>
        <select
          className="language-selector"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.value} value={lang.value}>
              {lang.label}
            </option>
          ))}
        </select>
      </div>

      {ydoc && (
        <CodeEditor
          ydoc={ydoc}
          language={language}
          isLoading={isLoading}
          isTimeTraveling={isTimeTraveling}
          previewContent={previewContent}
        />
      )}

      <TimelineSlider
        timestamps={timestamps}
        currentIndex={currentIndex}
        isTimeTraveling={isTimeTraveling}
        loading={timeMachineLoading}
        summary={summary}
        onSeek={seekTo}
        onRestore={restoreCurrent}
        onBackToPresent={backToPresent}
        onForceSnapshot={forceSnapshot}
      />
    </div>
  );
}

export default function App() {
  const [joined, setJoined] = useState(false);
  const [userName, setUserName] = useState('');
  const [roomId, setRoomId] = useState('');

  const handleJoin = (name, room) => {
    setUserName(name);
    setRoomId(room);
    setJoined(true);
  };

  const handleLeave = () => {
    setJoined(false);
    setUserName('');
    setRoomId('');
  };

  if (!joined) {
    return <JoinScreen onJoin={handleJoin} />;
  }

  return <EditorScreen roomId={roomId} userName={userName} onLeave={handleLeave} />;
}
