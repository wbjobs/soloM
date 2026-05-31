import React, { useState, useRef, useEffect } from 'react';
import './BranchSelector.css';

const BranchSelector = ({
  branches,
  activeBranch,
  onSwitchBranch,
  onCreateBranch,
  onDeleteBranch,
  onShowDiff,
  onMerge,
  isMainBranch,
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCreateBranch = () => {
    if (newBranchName.trim()) {
      onCreateBranch(newBranchName.trim());
      setNewBranchName('');
      setIsCreating(false);
      setIsDropdownOpen(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleCreateBranch();
    } else if (e.key === 'Escape') {
      setIsCreating(false);
      setNewBranchName('');
    }
  };

  return (
    <div className="branch-selector" ref={dropdownRef}>
      <button
        className="branch-toggle-btn"
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
      >
        <span className="branch-icon">🌿</span>
        <span className="branch-name">{activeBranch}</span>
        <span className={`arrow ${isDropdownOpen ? 'open' : ''}`}>▼</span>
      </button>

      {isDropdownOpen && (
        <div className="branch-dropdown">
          <div className="dropdown-header">
            <span>分支列表</span>
            <button
              className="create-branch-btn"
              onClick={() => setIsCreating(true)}
            >
              + 新建分支
            </button>
          </div>

          {isCreating && (
            <div className="create-branch-form">
              <input
                type="text"
                placeholder="输入分支名称..."
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                onKeyPress={handleKeyPress}
                autoFocus
              />
              <div className="form-actions">
                <button
                  className="cancel-btn"
                  onClick={() => {
                    setIsCreating(false);
                    setNewBranchName('');
                  }}
                >
                  取消
                </button>
                <button
                  className="confirm-btn"
                  onClick={handleCreateBranch}
                  disabled={!newBranchName.trim()}
                >
                  创建
                </button>
              </div>
            </div>
          )}

          <div className="branch-list">
            {branches.map((branch) => (
              <div
                key={branch.name}
                className={`branch-item ${branch.isActive ? 'active' : ''}`}
              >
                <div className="branch-info" onClick={() => onSwitchBranch(branch.name)}>
                  <span className="branch-type-icon">
                    {branch.isMain ? '🏠' : '🌿'}
                  </span>
                  <span className="branch-name-text">{branch.name}</span>
                  {branch.isActive && <span className="active-badge">当前</span>}
                </div>

                <div className="branch-actions">
                  {!branch.isMain && (
                    <>
                      <button
                        className="action-btn diff-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          onShowDiff(branch.name);
                        }}
                        title="查看差异"
                      >
                        🔀
                      </button>
                      {!isMainBranch && (
                        <button
                          className="action-btn merge-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            onMerge(branch.name);
                          }}
                          title="合并到主分支"
                        >
                          ↩️
                        </button>
                      )}
                      <button
                        className="action-btn delete-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`确定要删除分支 "${branch.name}" 吗？`)) {
                            onDeleteBranch(branch.name);
                          }
                        }}
                        title="删除分支"
                      >
                        🗑️
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default BranchSelector;
