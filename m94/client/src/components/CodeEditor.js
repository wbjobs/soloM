import React, { useRef, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import './CodeEditor.css';

const CodeEditor = ({ crdtService, language = 'javascript', onEditorMount }) => {
  const editorRef = useRef(null);
  const monacoRef = useRef(null);

  const handleEditorDidMount = (editor, monacoInstance) => {
    editorRef.current = editor;
    monacoRef.current = monacoInstance;

    editor.updateOptions({
      fontSize: 14,
      fontFamily: 'Consolas, "Courier New", monospace',
      lineNumbers: 'on',
      minimap: { enabled: true },
      scrollBeyondLastLine: false,
      automaticLayout: true,
      tabSize: 2,
      wordWrap: 'on',
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
    });

    if (crdtService) {
      crdtService.bindMonaco(editor, monacoInstance);
    }

    if (onEditorMount) {
      onEditorMount(editor, monacoInstance);
    }
  };

  useEffect(() => {
    if (crdtService && editorRef.current && monacoRef.current) {
      crdtService.bindMonaco(editorRef.current, monacoRef.current);
    }
  }, [crdtService]);

  return (
    <div className="code-editor-container">
      <Editor
        height="100%"
        language={language}
        theme="vs-dark"
        onMount={handleEditorDidMount}
        loading={<div className="editor-loading">加载编辑器...</div>}
        options={{
          readOnly: false,
        }}
      />
    </div>
  );
};

export default CodeEditor;
