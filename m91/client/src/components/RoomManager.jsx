import React, { useState, useEffect } from 'react';

export default function RoomManager({
  onCreateRoom,
  onJoinRoom,
  roomId,
  connected,
  disabled,
}) {
  const [joinRoomId, setJoinRoomId] = useState('');
  const [rooms, setRooms] = useState([]);

  const fetchRooms = async () => {
    try {
      const res = await fetch(`http://${window.location.hostname}:8080/api/rooms`);
      const data = await res.json();
      setRooms(data);
    } catch {
      setRooms([]);
    }
  };

  useEffect(() => {
    fetchRooms();
    const interval = setInterval(fetchRooms, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="room-manager">
      <h3>🏠 房间管理</h3>
      {roomId && (
        <div className="current-room">
          <p>当前房间: <strong>{roomId}</strong></p>
          <p className="room-hint">将房间号告知对方即可加入</p>
        </div>
      )}
      {!roomId && (
        <div className="room-actions">
          <button
            className="btn btn-primary"
            onClick={onCreateRoom}
            disabled={disabled}
          >
            创建房间
          </button>
          <div className="join-section">
            <input
              type="text"
              placeholder="输入房间号"
              value={joinRoomId}
              onChange={(e) => setJoinRoomId(e.target.value)}
              disabled={disabled}
            />
            <button
              className="btn btn-secondary"
              onClick={() => onJoinRoom(joinRoomId)}
              disabled={disabled || !joinRoomId.trim()}
            >
              加入房间
            </button>
          </div>
          {rooms.length > 0 && (
            <div className="room-list">
              <h4>可用房间</h4>
              {rooms.map((room) => (
                <div key={room.id} className="room-item">
                  <span className="room-id">{room.id}</span>
                  <span className="room-info">
                    {room.fileName
                      ? `${room.fileName} (${room.peerCount}/2)`
                      : `${room.peerCount}/2 人`}
                  </span>
                  <button
                    className="btn btn-small"
                    onClick={() => {
                      setJoinRoomId(room.id);
                      onJoinRoom(room.id);
                    }}
                    disabled={disabled || room.peerCount >= 2}
                  >
                    加入
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
