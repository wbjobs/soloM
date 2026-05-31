import React, { useState, useCallback, useEffect } from 'react';
import RoomJoin from './components/RoomJoin';
import CodeEditor from './components/CodeEditor';
import UserList from './components/UserList';
import ConnectionStatus from './components/ConnectionStatus';
import BranchSelector from './components/BranchSelector';
import DiffView from './components/DiffView';
import MergeConflictResolver from './components/MergeConflictResolver';
import { useCRDT } from './hooks/useCRDT';
import { useNetworkStatus } from './hooks/useNetworkStatus';
import './App.css';

const VIEW_MODE_EDITOR = 'editor';
const VIEW_MODE_DIFF = 'diff';
const VIEW_MODE_MERGE = 'merge';

function App() {
  const [roomName, setRoomName] = useState('');
  const [language, setLanguage] = useState('javascript');
  const [viewMode, setViewMode] = useState(VIEW_MODE_EDITOR);
  const [diffData, setDiffData] = useState(null);
  const [mergeTargetBranch, setMergeTargetBranch] = useState(null);
  const [mergeSourceBranch, setMergeSourceBranch] = useState(null);
  const [conflicts, setConflicts] = useState([]);
  const { isOnline, wasOffline } = useNetworkStatus();

  const {
    crdtService,
    isConnected,
    isSynced,
    users,
    isLoading,
    userInfo,
    loadingProgress,
    branches,
    activeBranch,
    createBranch,
    switchBranch,
    deleteBranch,
    computeDiff,
    mergeBranch,
    detectConflicts,
    saveCurrentBranch,
  } = useCRDT(roomName);

  const handleJoinRoom = useCallback((room) => {
    setRoomName(room);
    setViewMode(VIEW_MODE_EDITOR);
  }, []);

  const handleLeaveRoom = useCallback(() => {
    setRoomName('');
    setViewMode(VIEW_MODE_EDITOR);
    setDiffData(null);
  }, []);

  const handleEditorMount = useCallback(() => {
    console.log('[App] 编辑器已挂载');
  }, []);

  const handleCreateBranch = useCallback(async (branchName) => {
    createBranch(branchName, activeBranch);
  }, [createBranch, activeBranch]);

  const handleSwitchBranch = useCallback(async (branchName) => {
    await saveCurrentBranch();
    await switchBranch(branchName);
    setViewMode(VIEW_MODE_EDITOR);
    setDiffData(null);
  }, [saveCurrentBranch, switchBranch]);

  const handleDeleteBranch = useCallback(async (branchName) => {
    deleteBranch(branchName);
  }, [deleteBranch]);

  const handleShowDiff = useCallback(async (branchName) => {
    const diff = await computeDiff(branchName, 'main');
    if (diff) {
      setDiffData(diff);
      setViewMode(VIEW_MODE_DIFF);
    }
  }, [computeDiff]);

  const handleMerge = useCallback(async (branchName) => {
    const diff = await computeDiff(branchName, 'main');
    if (diff) {
      const conflictsList = detectConflicts(branchName, 'main');
      setMergeSourceBranch(branchName);
      setMergeTargetBranch('main');
      setDiffData(diff);
      setConflicts(conflictsList);
      setViewMode(VIEW_MODE_MERGE);
    }
  }, [computeDiff, detectConflicts]);

  const handleResolveConflicts = useCallback(async (mergedText, resolutions) => {
    await mergeBranch(mergeSourceBranch, mergeTargetBranch, mergedText);
    setViewMode(VIEW_MODE_EDITOR);
    setDiffData(null);
    setMergeSourceBranch(null);
    setMergeTargetBranch(null);
    setConflicts([]);
  }, [mergeBranch, mergeSourceBranch, mergeTargetBranch]);

  const handleDiffMerge = useCallback(async (mergedText, mode) => {
    await mergeBranch(diffData.sourceBranch, diffData.targetBranch, mergedText);
    setViewMode(VIEW_MODE_EDITOR);
    setDiffData(null);
  }, [mergeBranch, diffData]);

  const handleCancelMerge = useCallback(() => {
    setViewMode(VIEW_MODE_EDITOR);
    setDiffData(null);
    setMergeSourceBranch(null);
    setMergeTargetBranch(null);
    setConflicts([]);
  }, []);

  const handleBackToEditor = useCallback(() => {
    setViewMode(VIEW_MODE_EDITOR);
    setDiffData(null);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (viewMode === VIEW_MODE_EDITOR && activeBranch !== 'main') {
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [viewMode, activeBranch]);

  if (!roomName) {
    return <RoomJoin onJoin={handleJoinRoom} userInfo={userInfo} />;
  }

  if (isLoading) {
    const progressPercent = loadingProgress?.progress || 0;
    const phaseText = {
      init: '正在初始化...',
      snapshot: '正在加载文档快照...',
      incremental: '正在同步增量数据...',
      complete: '加载完成!',
    }[loadingProgress?.phase] || '正在加载编辑器...';

    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p className="loading-text">{phaseText}</p>
        <p className="loading-subtext">房间: {roomName}</p>
        <div className="loading-progress-bar">
          <div
            className="loading-progress-fill"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <p className="loading-percent">{progressPercent}%</p>
      </div>
    );
  }

  const renderMainContent = () => {
    if (viewMode === VIEW_MODE_DIFF && diffData) {
      return (
        <div className="diff-view-container">
          <div className="diff-view-header">
            <button className="back-to-editor-btn" onClick={handleBackToEditor}>
              ← 返回编辑器
            </button>
          </div>
          <DiffView
            originalText={diffData.targetText}
            modifiedText={diffData.sourceText}
            originalName={diffData.targetBranch}
            modifiedName={diffData.sourceBranch}
            language={language}
            onMerge={handleDiffMerge}
            showMergeControls={true}
            conflicts={conflicts}
          />
        </div>
      );
    }

    if (viewMode === VIEW_MODE_MERGE && diffData) {
      return (
        <MergeConflictResolver
          sourceText={diffData.sourceText}
          targetText={diffData.targetText}
          sourceName={diffData.sourceBranch}
          targetName={diffData.targetBranch}
          onResolve={handleResolveConflicts}
          onCancel={handleCancelMerge}
        />
      );
    }

    return (
      <>
        <div className="editor-wrapper">
        {!isOnline && (
            <div className="offline-banner">
              <span className="offline-icon">📴</span>
              当前处于离线模式，所有编辑内容将自动保存到本地。
              恢复网络后将自动同步。
            </div>
          )}
          {activeBranch !== 'main' && (
            <div className="branch-banner">
              <span className="branch-banner-icon">🌿</span>
              你正在编辑分支: <strong>{activeBranch}</strong>
              <button
                className="merge-to-main-btn"
                onClick={() => handleMerge(activeBranch)}
              >
                ↩️ 合并到主分支
              </button>
            </div>
          )}
          <CodeEditor
            crdtService={crdtService}
            language={language}
            onEditorMount={handleEditorMount}
          />
        </div>
        <UserList users={users} currentUserId={userInfo?.userId} />
      </>
    );
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-left">
          <button className="back-button" onClick={handleLeaveRoom}>
            ← 返回
          </button>
          <h1 className="app-title">
            <span className="title-icon">📝</span>
            CRDT 协同编辑器
          </h1>
          <div className="room-badge">
            <span className="room-icon">🚪</span>
            {roomName}
          </div>
          <BranchSelector
            branches={branches}
            activeBranch={activeBranch}
            onSwitchBranch={handleSwitchBranch}
            onCreateBranch={handleCreateBranch}
            onDeleteBranch={handleDeleteBranch}
            onShowDiff={handleShowDiff}
            onMerge={handleMerge}
            isMainBranch={activeBranch === 'main'}
          />
        </div>

        <div className="header-right">
          <select
            className="language-select"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            <option value="javascript">JavaScript</option>
            <option value="typescript">TypeScript</option>
            <option value="python">Python</option>
            <option value="java">Java</option>
            <option value="cpp">C++</option>
            <option value="html">HTML</option>
            <option value="css">CSS</option>
            <option value="json">JSON</option>
            <option value="markdown">Markdown</option>
            <option value="plaintext">纯文本</option>
          </select>

          <ConnectionStatus
            isOnline={isOnline}
            isConnected={isConnected}
            isSynced={isSynced}
            wasOffline={wasOffline}
          />
        </div>
      </header>

      <div className="main-content">
        {renderMainContent()}
      </div>

      <footer className="app-footer">
        <div className="footer-info">
          <span>
            文档状态: {isSynced ? '✓ 已同步' : '⏳ 同步中'}
          </span>
          <span>
            在线用户: {users.length}
          </span>
          <span>
            连接: {isConnected ? '✓ 已连接' : '✗ 未连接'}
          </span>
          <span>
            分支: {activeBranch}</span>
        </div>
        <div className="footer-crdt">
          <span className="crdt-badge">CRDT: Yjs</span>
          <span className="storage-badge">存储: IndexedDB</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
