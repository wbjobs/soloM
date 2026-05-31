import React, { useRef } from 'react';
import { formatFileSize } from '../services/fileChunker';

export default function FileSelector({ onFileSelected, isChunking, chunkProgress, disabled }) {
  const inputRef = useRef(null);

  const handleChange = (e) => {
    const file = e.target.files[0];
    if (file && onFileSelected) {
      onFileSelected(file);
    }
  };

  return (
    <div className="file-selector">
      <h3>📁 选择文件</h3>
      <div className="file-input-area">
        <input
          ref={inputRef}
          type="file"
          onChange={handleChange}
          disabled={disabled || isChunking}
          style={{ display: 'none' }}
        />
        <button
          className="btn btn-primary"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || isChunking}
        >
          {isChunking ? '分片中...' : '选择文件'}
        </button>
      </div>
      {isChunking && (
        <div className="chunk-progress">
          <p>正在切割分片并计算哈希: {chunkProgress.current} / {chunkProgress.total}</p>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${(chunkProgress.current / chunkProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
