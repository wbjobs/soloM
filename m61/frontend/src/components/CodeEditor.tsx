import { useEffect, useState, useRef } from 'react';
import Editor from '@monaco-editor/react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { IndexeddbPersistence } from 'y-indexeddb';
import { useAuthStore } from '../store/useAuthStore';
import { useSnippetStore } from '../store/useSnippetStore';
import { MonacoBinding } from 'y-monaco';
import VersionTimeline from './VersionTimeline';

interface CodeEditorProps {
  snippetId: string;
  initialTitle: string;
  initialLanguage: string;
}

const LANGUAGES = [
  'javascript',
  'typescript',
  'python',
  'java',
  'cpp',
  'c',
  'csharp',
  'go',
  'rust',
  'html',
  'css',
  'json',
  'sql',
  'bash',
  'ruby',
  'php',
];

const CodeEditor = ({ snippetId, initialLanguage }: CodeEditorProps) => {
  const token = useAuthStore((state) => state.token);
  const { deleteSnippet } = useSnippetStore();
  const [title, setTitle] = useState('');
  const [language, setLanguage] = useState(initialLanguage);
  const [isConnected, setIsConnected] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const ydocRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const persistenceRef = useRef<IndexeddbPersistence | null>(null);
  const bindingRef = useRef<MonacoBinding | null>(null);
  const titleTextRef = useRef<Y.Text | null>(null);
  const monacoRef = useRef<any>(null);

  useEffect(() => {
    if (!token) return;

    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    const persistence = new IndexeddbPersistence(snippetId, ydoc);
    persistenceRef.current = persistence;

    const titleText = ydoc.getText('title');
    titleTextRef.current = titleText;

    const contentText = ydoc.getText('content');

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsBase = window.location.host.includes('localhost:3000') 
      ? 'localhost:3001' 
      : window.location.host;
    const wsUrl = `${wsProtocol}//${wsBase}/ws`;

    const provider = new WebsocketProvider(wsUrl, snippetId, ydoc, {
      params: { token },
      connect: true,
    });
    providerRef.current = provider;

    provider.on('status', (event: { status: string }) => {
      setIsConnected(event.status === 'connected');
    });

    const titleObserver = () => {
      setTitle(titleText.toString());
    };
    titleText.observe(titleObserver);
    setTitle(titleText.toString());

    if (monacoRef.current) {
      bindingRef.current = new MonacoBinding(
        contentText,
        monacoRef.current.getModel(),
        new Set([monacoRef.current]),
        provider.awareness
      );
    }

    return () => {
      titleText.unobserve(titleObserver);
      
      if (bindingRef.current) {
        bindingRef.current.destroy();
      }
      if (provider) {
        provider.disconnect();
        provider.destroy();
      }
      if (persistence) {
        persistence.destroy();
      }
      ydoc.destroy();
    };
  }, [snippetId, token]);

  const handleEditorDidMount = (editor: any) => {
    monacoRef.current = editor;
    
    if (ydocRef.current && providerRef.current) {
      const contentText = ydocRef.current.getText('content');
      bindingRef.current = new MonacoBinding(
        contentText,
        editor.getModel(),
        new Set([editor]),
        providerRef.current.awareness
      );
    }
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setTitle(newTitle);
    if (titleTextRef.current) {
      const ytext = titleTextRef.current;
      ytext.delete(0, ytext.length);
      ytext.insert(0, newTitle);
    }
  };

  const handleDelete = async () => {
    if (window.confirm('确定要删除这个代码片段吗？')) {
      await deleteSnippet(snippetId);
    }
  };

  return (
    <>
      <div className="editor-header">
        <input
          type="text"
          className="title-input"
          value={title}
          onChange={handleTitleChange}
          placeholder="输入代码片段标题..."
        />
        <div className="editor-toolbar">
          <div className="connection-status">
            <span className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`} />
            <span>{isConnected ? '已连接' : '离线'}</span>
          </div>
          <select
            className="language-select"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            {LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>
                {lang}
              </option>
            ))}
          </select>
          <button
            className={`history-btn ${showTimeline ? 'active' : ''}`}
            onClick={() => setShowTimeline(!showTimeline)}
            title="版本历史"
          >
            历史
          </button>
          <button className="delete-btn" onClick={handleDelete}>
            删除
          </button>
        </div>
      </div>
      <div className="editor-content">
        <div className={`editor-wrapper ${showTimeline ? 'with-timeline' : ''}`}>
          <Editor
            height="100%"
            language={language}
            theme="vs-dark"
            onMount={handleEditorDidMount}
            options={{
              minimap: { enabled: true },
              fontSize: 14,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
            }}
          />
        </div>
        {showTimeline && (
          <VersionTimeline
            snippetId={snippetId}
            onClose={() => setShowTimeline(false)}
          />
        )}
      </div>
    </>
  );
};

export default CodeEditor;
