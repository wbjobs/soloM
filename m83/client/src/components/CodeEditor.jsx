import { useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { MonacoBinding } from 'y-monaco';
import * as monaco from 'monaco-editor';

export default function CodeEditor({
  ydoc,
  language = 'javascript',
  theme = 'vs-dark',
  isLoading,
  isTimeTraveling = false,
  previewContent = null,
}) {
  const editorRef = useRef(null);
  const bindingRef = useRef(null);
  const modelRef = useRef(null);
  const ydocRef = useRef(null);
  const [editorReady, setEditorReady] = useState(false);
  const isTimeTravelingRef = useRef(false);
  const previewContentRef = useRef(null);

  const setupBinding = useRef(() => {});

  setupBinding.current = () => {
    if (!ydocRef.current || !editorRef.current) return;

    if (bindingRef.current) {
      bindingRef.current.destroy();
      bindingRef.current = null;
    }

    const ytext = ydocRef.current.getText('monaco');
    const editor = editorRef.current;
    const model = editor.getModel();

    if (model) {
      modelRef.current = model;
      
      const binding = new MonacoBinding(
        ytext,
        model,
        new Set([editor]),
        ydocRef.current.awareness
      );

      bindingRef.current = binding;
    }
  };

  useEffect(() => {
    ydocRef.current = ydoc;
    
    if (ydoc && editorReady && !isTimeTravelingRef.current) {
      setupBinding.current();
    }

    return () => {
      if (bindingRef.current) {
        bindingRef.current.destroy();
        bindingRef.current = null;
      }
    };
  }, [ydoc, editorReady]);

  useEffect(() => {
    isTimeTravelingRef.current = isTimeTraveling;
  }, [isTimeTraveling]);

  useEffect(() => {
    previewContentRef.current = previewContent;

    if (!editorRef.current || !editorReady) return;
    const editor = editorRef.current;
    const model = editor.getModel();
    if (!model) return;

    if (isTimeTraveling) {
      if (bindingRef.current) {
        bindingRef.current.destroy();
        bindingRef.current = null;
      }

      if (previewContent !== null) {
        const fullRange = model.getFullModelRange();
        model.applyEdits([{
          range: fullRange,
          text: previewContent,
        }]);
      }
    } else {
      if (ydocRef.current) {
        setupBinding.current();
      }
    }
  }, [isTimeTraveling, previewContent, editorReady]);

  const handleEditorWillMount = (monacoInstance) => {
    monacoInstance.editor.defineTheme('custom-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#1e1e1e',
      }
    });
  };

  const handleEditorDidMount = (editor, monacoInstance) => {
    editorRef.current = editor;

    const model = editor.getModel();
    if (model) {
      modelRef.current = model;
      model.setValue('');
    }

    setEditorReady(true);

    if (ydocRef.current && !isTimeTravelingRef.current) {
      setupBinding.current();
    }
  };

  useEffect(() => {
    if (!editorRef.current) return;
    
    const editor = editorRef.current;
    const model = editor.getModel();

    if (model && language) {
      monaco.editor.setModelLanguage(model, language);
    }
  }, [language]);

  const isReadOnly = isLoading || isTimeTraveling;

  return (
    <div className="editor-container">
      {isLoading && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(30, 30, 30, 0.9)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10,
          color: '#888',
          fontSize: 14
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ marginBottom: 12 }}>正在同步文档...</div>
            <div style={{ 
              width: 24, 
              height: 24, 
              border: '3px solid #333',
              borderTop: '3px solid #007acc',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto'
            }}></div>
            <style>{`
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
            `}</style>
          </div>
        </div>
      )}

      {isTimeTraveling && !isLoading && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background: 'linear-gradient(90deg, #ff9800, #f44336, #ff9800)',
          backgroundSize: '200% 100%',
          animation: 'timeTravel 2s linear infinite',
          zIndex: 20
        }}>
          <style>{`
            @keyframes timeTravel {
              0% { background-position: 0% 0%; }
              100% { background-position: 200% 0%; }
            }
          `}</style>
        </div>
      )}

      <Editor
        height="100%"
        defaultLanguage={language}
        language={language}
        theme="vs-dark"
        beforeMount={handleEditorWillMount}
        onMount={handleEditorDidMount}
        options={{
          fontSize: 14,
          minimap: { enabled: true },
          automaticLayout: true,
          cursorBlinking: 'smooth',
          smoothScrolling: true,
          renderWhitespace: 'selection',
          tabSize: 2,
          wordWrap: 'on',
          lineNumbers: 'on',
          renderLineHighlight: isTimeTraveling ? 'all' : 'all',
          scrollBeyondLastLine: false,
          padding: { top: 10, bottom: 10 },
          readOnly: isReadOnly,
          scrollbar: isTimeTraveling ? {
            verticalScrollbarSize: 10,
            horizontalScrollbarSize: 10,
          } : undefined,
        }}
      />
    </div>
  );
}
