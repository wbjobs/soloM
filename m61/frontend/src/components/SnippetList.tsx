import { useSnippetStore } from '../store/useSnippetStore';

const SnippetList = () => {
  const { snippets, currentSnippetId, isLoading, setCurrentSnippetId } = useSnippetStore();

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading && snippets.length === 0) {
    return <div className="loading">加载中...</div>;
  }

  if (snippets.length === 0) {
    return (
      <div className="empty-state" style={{ padding: '2rem' }}>
        <p>暂无代码片段</p>
      </div>
    );
  }

  return (
    <div className="snippet-list">
      {snippets.map((snippet) => (
        <div
          key={snippet.ydocId}
          className={`snippet-item ${currentSnippetId === snippet.ydocId ? 'active' : ''}`}
          onClick={() => setCurrentSnippetId(snippet.ydocId)}
        >
          <div className="snippet-title">{snippet.title || 'Untitled Snippet'}</div>
          <div className="snippet-meta">
            <span className="snippet-language">{snippet.language}</span>
            <span>{formatDate(snippet.updatedAt)}</span>
          </div>
        </div>
      ))}
    </div>
  );
};

export default SnippetList;
