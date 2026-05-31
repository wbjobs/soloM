import React, { useState, useEffect } from 'react';
import { loadRecentRooms, saveRecentRooms } from '../services/storageService';
import './RoomJoin.css';

const RoomJoin = ({ onJoin, userInfo }) => {
  const [roomName, setRoomName] = useState('');
  const [recentRooms, setRecentRooms] = useState([]);
  const [userName, setUserName] = useState('');

  useEffect(() => {
    const fetchRecentRooms = async () => {
      const rooms = await loadRecentRooms();
      setRecentRooms(rooms);
    };
    fetchRecentRooms();

    if (userInfo) {
      setUserName(userInfo.userName);
    }
  }, [userInfo]);

  const handleJoin = async (e) => {
    e.preventDefault();
    const trimmedRoomName = roomName.trim();
    if (!trimmedRoomName) return;

    const updatedRooms = [
      trimmedRoomName,
      ...recentRooms.filter((r) => r !== trimmedRoomName),
    ].slice(0, 10);
    setRecentRooms(updatedRooms);
    await saveRecentRooms(updatedRooms);

    onJoin(trimmedRoomName);
  };

  const handleQuickJoin = async (room) => {
    const updatedRooms = [
      room,
      ...recentRooms.filter((r) => r !== room),
    ].slice(0, 10);
    setRecentRooms(updatedRooms);
    await saveRecentRooms(updatedRooms);

    onJoin(room);
  };

  const handleRemoveRoom = async (room, e) => {
    e.stopPropagation();
    const updatedRooms = recentRooms.filter((r) => r !== room);
    setRecentRooms(updatedRooms);
    await saveRecentRooms(updatedRooms);
  };

  return (
    <div className="room-join-container">
      <div className="room-join-card">
        <div className="app-logo">
          <span className="logo-icon">📝</span>
          <h1>CRDT 协同代码编辑器</h1>
        </div>
        <p className="app-description">
          基于 Yjs CRDT 的离线优先协同编辑器，支持多人实时协作，断网也能编辑
        </p>

        <form onSubmit={handleJoin} className="join-form">
          <div className="form-group">
            <label htmlFor="roomName">房间名称</label>
            <input
              id="roomName"
              type="text"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              placeholder="输入房间名称，例如: project-alpha"
              className="room-input"
              autoFocus
            />
          </div>

          <div className="user-info-display">
            <span className="user-label">你的身份:</span>
            <span
              className="user-badge"
              style={{ backgroundColor: userInfo?.userColor }}
            >
              {userName || '加载中...'}
            </span>
          </div>

          <button type="submit" className="join-button" disabled={!roomName.trim()}>
            加入房间
          </button>
        </form>

        {recentRooms.length > 0 && (
          <div className="recent-rooms">
            <h3>最近访问的房间</h3>
            <div className="room-list">
              {recentRooms.map((room) => (
                <div
                  key={room}
                  className="room-item"
                  onClick={() => handleQuickJoin(room)}
                >
                  <span className="room-name">🚪 {room}</span>
                  <button
                    className="remove-room"
                    onClick={(e) => handleRemoveRoom(room, e)}
                    title="移除"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="features">
          <div className="feature">
            <span className="feature-icon">🔄</span>
            <span>自动同步</span>
          </div>
          <div className="feature">
            <span className="feature-icon">📴</span>
            <span>离线可用</span>
          </div>
          <div className="feature">
            <span className="feature-icon">👥</span>
            <span>多人协作</span>
          </div>
          <div className="feature">
            <span className="feature-icon">💾</span>
            <span>本地存储</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RoomJoin;
