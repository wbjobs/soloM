import React from 'react';
import './UserList.css';

const UserList = ({ users, currentUserId }) => {
  return (
    <div className="user-list">
      <div className="user-list-header">
        <h3>在线用户 ({users.length})</h3>
      </div>
      <div className="user-list-content">
        {users.length === 0 ? (
          <div className="empty-state">暂无在线用户</div>
        ) : (
          users.map((user) => (
            <div
              key={user.clientId}
              className={`user-item ${user.id === currentUserId ? 'current-user' : ''}`}
            >
              <div
                className="user-avatar"
                style={{ backgroundColor: user.color }}
              >
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="user-info">
                <span className="user-name">
                  {user.name}
                  {user.id === currentUserId && ' (你)'}
                </span>
                {user.selection && (
                  <span className="user-cursor">
                    行 {user.selection.startLineNumber}, 列 {user.selection.startColumn}
                  </span>
                )}
              </div>
              <div
                className="user-color-indicator"
                style={{ backgroundColor: user.color }}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default UserList;
