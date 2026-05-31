import { Server as SocketIOServer } from 'socket.io';

interface Member {
  id: string;
  username: string;
  color: string;
}

interface Room {
  id: string;
  members: Map<string, Member>;
  createdAt: number;
}

const rooms = new Map<string, Room>();

const COLORS = [
  '#00D68F', '#FF6B6B', '#4ECDC4', '#FFB800',
  '#A371F7', '#FF8A65', '#42A5F5', '#EC407A',
  '#66BB6A', '#FFA726', '#AB47BC', '#26C6DA',
];

function getRandomColor(): string {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

export function setupSocketIO(io: SocketIOServer) {
  io.on('connection', (socket) => {
    console.log(`[Socket] Connected: ${socket.id}`);

    socket.on('room:join', (data: { roomId: string; username: string }) => {
      const { roomId, username } = data;

      socket.join(roomId);

      let room = rooms.get(roomId);
      if (!room) {
        room = {
          id: roomId,
          members: new Map(),
          createdAt: Date.now(),
        };
        rooms.set(roomId, room);
      }

      const member: Member = {
        id: socket.id,
        username,
        color: getRandomColor(),
      };
      room.members.set(socket.id, member);

      const membersList = Array.from(room.members.values());

      socket.emit('room:joined', { roomId, members: membersList });
      socket.to(roomId).emit('room:member_joined', { member });

      console.log(`[Room] ${username} joined room ${roomId} (${membersList.length} members)`);
    });

    socket.on('room:leave', (data: { roomId: string }) => {
      const { roomId } = data;
      const room = rooms.get(roomId);
      if (room) {
        room.members.delete(socket.id);
        socket.to(roomId).emit('room:member_left', { memberId: socket.id });

        if (room.members.size === 0) {
          rooms.delete(roomId);
          console.log(`[Room] Room ${roomId} deleted (empty)`);
        }
      }
      socket.leave(roomId);
    });

    socket.on('doc:update', (data: { docId: string; update: Uint8Array }) => {
      const { docId, update } = data;
      socket.to(docId).emit('doc:update', {
        docId,
        update,
        from: socket.id,
      });
    });

    socket.on('doc:sync_request', (data: { docId: string; stateVector: Uint8Array }) => {
      socket.to(data.docId).emit('doc:sync_request', {
        docId: data.docId,
        stateVector: data.stateVector,
      });
    });

    socket.on('doc:sync_response', (data: { docId: string; diff: Uint8Array }) => {
      socket.to(data.docId).emit('doc:sync_response', {
        docId: data.docId,
        diff: data.diff,
      });
    });

    socket.on('disconnecting', () => {
      for (const roomId of socket.rooms) {
        if (roomId === socket.id) continue;
        const room = rooms.get(roomId);
        if (room) {
          const member = room.members.get(socket.id);
          room.members.delete(socket.id);
          socket.to(roomId).emit('room:member_left', { memberId: socket.id });

          if (room.members.size === 0) {
            rooms.delete(roomId);
          }

          console.log(`[Room] ${member?.username || socket.id} left room ${roomId}`);
        }
      }
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] Disconnected: ${socket.id}`);
    });
  });
}
