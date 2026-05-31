import { useEffect } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { useSnippetStore } from '../store/useSnippetStore';
import SnippetList from '../components/SnippetList';
import CodeEditor from '../components/CodeEditor';

const MainPage = () => {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const { snippets, currentSnippetId, fetchSnippets, createSnippet, setCurrentSnippetId } = useSnippetStore();

  useEffect(() => {
    fetchSnippets();
  }, []);

  const handleCreateSnippet = async () => {
    const snippetId = await createSnippet();
    setCurrentSnippetId(snippetId);
  };

  const currentSnippet = snippets.find((s) => s.ydocId === currentSnippetId);

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>代码片段管理器</h1>
          <div className="user-info">
            <span>{user?.username}</span>
            <button className="logout-btn" onClick={logout}>
              退出
            </button>
          </div>
          <button className="new-snippet-btn" onClick={handleCreateSnippet}>
            + 新建代码片段
          </button>
        </div>
        <SnippetList />
      </aside>
      <main className="editor-container">
        {currentSnippetId ? (
          <CodeEditor
            snippetId={currentSnippetId}
            initialTitle={currentSnippet?.title || ''}
            initialLanguage={currentSnippet?.language || 'javascript'}
          />
        ) : (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z" />
            </svg>
            <p>选择一个代码片段或创建新的</p>
          </div>
        )}
      </main>
    </div>
  );
};

export default MainPage;
