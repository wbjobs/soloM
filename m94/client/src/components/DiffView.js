import React, { useEffect, useRef, useState } from 'react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.main';
import './DiffView.css';

const DiffView = ({
  originalText,
  modifiedText,
  originalName = 'Original',
  modifiedName = 'Modified',
  language = 'javascript',
  onMerge,
  showMergeControls = true,
  conflicts = [],
}) => {
  const diffEditorRef = useRef(null);
  const containerRef = useRef(null);
  const [mergeMode, setMergeMode] = useState(null);
  const [mergedText, setMergedText] = useState('');

  useEffect(() => {
    if (!containerRef.current) return;

    const originalModel = monaco.editor.createModel(
      originalText || '',
      language
    );
    const modifiedModel = monaco.editor.createModel(
      modifiedText || '',
      language
    );

    diffEditorRef.current = monaco.editor.createDiffEditor(containerRef.current, {
      readOnly: !showMergeControls,
      renderSideBySide: true,
      renderIndicators: true,
      wordWrap: 'on',
      minimap: { enabled: true },
      fontSize: 13,
      scrollBeyondLastLine: false,
      automaticLayout: true,
      diffWordWrap: 'on',
      originalEditable: false,
    });

    diffEditorRef.current.setModel({
      original: originalModel,
      modified: modifiedModel,
    });

    return () => {
      if (diffEditorRef.current) {
        diffEditorRef.current.dispose();
      }
      originalModel.dispose();
      modifiedModel.dispose();
    };
  }, [language, showMergeControls]);

  useEffect(() => {
    if (diffEditorRef.current) {
      const models = diffEditorRef.current.getModel();
      if (models) {
        models.original.setValue(originalText || '');
        models.modified.setValue(modifiedText || '');
      }
    }
  }, [originalText, modifiedText]);

  const handleMergeSource = () => {
    setMergedText(modifiedText);
    setMergeMode('source');
  };

  const handleMergeTarget = () => {
    setMergedText(originalText);
    setMergeMode('target');
  };

  const handleMergeBoth = () => {
    const result = modifiedText + '\n\n// === 合并自原分支 ===\n' + originalText;
    setMergedText(result);
    setMergeMode('both');
  };

  const handleMergeManual = () => {
    setMergedText(modifiedText);
    setMergeMode('manual');
    if (diffEditorRef.current) {
      const modifiedModel = diffEditorRef.current.getModel()?.modified;
      if (modifiedModel) {
        setMergedText(modifiedModel.getValue());
      }
    }
  };

  const handleConfirmMerge = () => {
    if (onMerge) {
      let finalText = mergedText;
      if (mergeMode === 'manual' && diffEditorRef.current) {
        const modifiedModel = diffEditorRef.current.getModel()?.modified;
        if (modifiedModel) {
          finalText = modifiedModel.getValue();
        }
      }
      onMerge(finalText, mergeMode || 'source');
    }
  };

  return (
    <div className="diff-view-container">
      <div className="diff-header">
        <div className="diff-title">
          <span className="diff-title-icon">🔀</span>
          分支对比
        </div>
        <div className="diff-labels">
          <span className="diff-label diff-label-original">
            目标分支: <strong>{originalName}</strong>
          </span>
          <span className="diff-label diff-label-arrow">→</span>
          <span className="diff-label diff-label-modified">
            当前分支: <strong>{modifiedName}</strong>
          </span>
        </div>
      </div>

      {conflicts.length > 0 && (
        <div className="conflicts-warning">
          <span className="conflicts-icon">⚠️</span>
          检测到 {conflicts.length} 处潜在冲突。请手动审查后合并。
        </div>
      )}

      <div className="diff-editor-wrapper">
        <div ref={containerRef} className="diff-editor" />
      </div>

      {showMergeControls && (
        <div className="merge-controls">
          <div className="merge-actions">
            <button
              className={`merge-btn ${mergeMode === 'source' ? 'active' : ''}`}
              onClick={handleMergeSource}
            >
              📝 使用当前分支
            </button>
            <button
              className={`merge-btn ${mergeMode === 'target' ? 'active' : ''}`}
              onClick={handleMergeTarget}
            >
              📂 保留目标分支
            </button>
            <button
              className={`merge-btn ${mergeMode === 'both' ? 'active' : ''}`}
              onClick={handleMergeBoth}
            >
              🔗 保留两者
            </button>
            <button
              className={`merge-btn ${mergeMode === 'manual' ? 'active' : ''}`}
              onClick={handleMergeManual}
            >
              ✏️ 手动编辑
            </button>
          </div>
          <div className="merge-confirm">
            <button
              className="merge-confirm-btn"
              onClick={handleConfirmMerge}
              disabled={!mergeMode}
            >
              ✅ 确认合并
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DiffView;
