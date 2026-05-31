import React, { useState, useEffect } from 'react';
import './MergeConflictResolver.css';

const MergeConflictResolver = ({
  sourceText,
  targetText,
  sourceName = '当前分支',
  targetName = '目标分支',
  onResolve,
  onCancel,
}) => {
  const [conflictBlocks, setConflictBlocks] = useState([]);
  const [resolutions, setResolutions] = useState({});

  useEffect(() => {
    const blocks = parseConflicts(sourceText, targetText);
    setConflictBlocks(blocks);

    const initialResolutions = {};
    blocks.forEach((block, index) => {
      initialResolutions[index] = 'source';
    });
    setResolutions(initialResolutions);
  }, [sourceText, targetText]);

  const parseConflicts = (source, target) => {
    const sourceLines = source.split('\n');
    const targetLines = target.split('\n');

    const blocks = [];
    const maxLines = Math.max(sourceLines.length, targetLines.length);
    let currentBlock = null;

    for (let i = 0; i < maxLines; i++) {
      const sourceLine = sourceLines[i] || '';
      const targetLine = targetLines[i] || '';

      if (sourceLine !== targetLine) {
        if (!currentBlock) {
          currentBlock = {
            startLine: i + 1,
            sourceLines: [],
            targetLines: [],
          };
        }
        currentBlock.sourceLines.push(sourceLine);
        currentBlock.targetLines.push(targetLine);
        currentBlock.endLine = i + 1;
      } else {
        if (currentBlock) {
          if (currentBlock.sourceLines.some(l => l !== '') || 
              currentBlock.targetLines.some(l => l !== '')) {
            blocks.push(currentBlock);
          }
          currentBlock = null;
        }
      }
    }

    if (currentBlock) {
      blocks.push(currentBlock);
    }

    if (blocks.length === 0 && source !== target) {
      blocks.push({
        startLine: 1,
        endLine: maxLines,
        sourceLines: sourceLines,
        targetLines: targetLines,
      });
    }

    return blocks;
  };

  const handleResolutionChange = (blockIndex, choice) => {
    setResolutions(prev => ({
      ...prev,
      [blockIndex]: choice,
    }));
  };

  const getMergedText = () => {
    const sourceLines = sourceText.split('\n');
    const targetLines = targetText.split('\n');
    const result = [];
    let lineIndex = 0;

    conflictBlocks.forEach((block, blockIndex) => {
      while (lineIndex < block.startLine - 1) {
        result.push(sourceLines[lineIndex] || targetLines[lineIndex] || '');
        lineIndex++;
      }

      const resolution = resolutions[blockIndex] || 'source';
      
      if (resolution === 'source') {
        result.push(...block.sourceLines);
      } else if (resolution === 'target') {
        result.push(...block.targetLines);
      } else if (resolution === 'both') {
        result.push(...block.sourceLines);
        result.push(...block.targetLines);
      }

      lineIndex = block.endLine;
    });

    const maxLines = Math.max(sourceLines.length, targetLines.length);
    while (lineIndex < maxLines) {
      result.push(sourceLines[lineIndex] || targetLines[lineIndex] || '');
      lineIndex++;
    }

    return result.join('\n');
  };

  const handleConfirm = () => {
    const mergedText = getMergedText();
    if (onResolve) {
      onResolve(mergedText, resolutions);
    }
  };

  if (conflictBlocks.length === 0) {
    return (
      <div className="merge-resolver-container">
        <div className="no-conflicts-message">
          <span className="no-conflicts-icon">✅</span>
          <h3>没有检测到冲突</h3>
          <p>两个分支可以自动合并</p>
          <button className="auto-merge-btn" onClick={() => onResolve(sourceText, {})}>
            自动合并
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="merge-resolver-container">
      <div className="merge-header">
        <div className="merge-title">
          <span className="merge-icon">⚔️</span>
          冲突解决
        </div>
        <div className="merge-stats">
          检测到 <strong>{conflictBlocks.length}</strong> 处冲突
        </div>
      </div>

      <div className="conflicts-list">
        {conflictBlocks.map((block, index) => (
          <div key={index} className="conflict-block">
            <div className="conflict-header">
              <span className="conflict-number">冲突 #{index + 1}</span>
              <span className="conflict-lines">
                行 {block.startLine} - {block.endLine}
              </span>
            </div>

            <div className="conflict-content">
              <div className="conflict-side conflict-side-source">
                <div className="conflict-side-header">
                  <span className="conflict-branch-name">{sourceName}</span>
                  <label className="conflict-radio">
                    <input
                      type="radio"
                      name={`conflict-${index}`}
                      checked={resolutions[index] === 'source'}
                      onChange={() => handleResolutionChange(index, 'source')}
                    />
                    选择此版本
                  </label>
                </div>
                <pre className="conflict-code">
                  {block.sourceLines.map((line, i) => (
                    <div key={i} className="conflict-line">
                      <span className="line-number">{block.startLine + i}</span>
                      <span className="line-content">{line || ' '}</span>
                    </div>
                  ))}
                </pre>
              </div>

              <div className="conflict-divider">
                <span>VS</span>
              </div>

              <div className="conflict-side conflict-side-target">
                <div className="conflict-side-header">
                  <span className="conflict-branch-name">{targetName}</span>
                  <label className="conflict-radio">
                    <input
                      type="radio"
                      name={`conflict-${index}`}
                      checked={resolutions[index] === 'target'}
                      onChange={() => handleResolutionChange(index, 'target')}
                    />
                    选择此版本
                  </label>
                </div>
                <pre className="conflict-code">
                  {block.targetLines.map((line, i) => (
                    <div key={i} className="conflict-line">
                      <span className="line-number">{block.startLine + i}</span>
                      <span className="line-content">{line || ' '}</span>
                    </div>
                  ))}
                </pre>
              </div>
            </div>

            <div className="conflict-extra-options">
              <label className="conflict-checkbox">
                <input
                  type="radio"
                  name={`conflict-${index}`}
                  checked={resolutions[index] === 'both'}
                  onChange={() => handleResolutionChange(index, 'both')}
                />
                保留两者
              </label>
            </div>
          </div>
        ))}
      </div>

      <div className="merge-footer">
        <button className="merge-cancel-btn" onClick={onCancel}>
          取消
        </button>
        <button className="merge-confirm-btn" onClick={handleConfirm}>
          ✅ 应用合并结果
        </button>
      </div>
    </div>
  );
};

export default MergeConflictResolver;
