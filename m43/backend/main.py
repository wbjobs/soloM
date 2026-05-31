from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from typing import Dict, List
import json
import uuid
from pathlib import Path

app = FastAPI(title="WebRTC P2P Signaling Server")

BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"

app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.rooms: Dict[str, List[str]] = {}

    async def connect(self, websocket: WebSocket, client_id: str):
        await websocket.accept()
        self.active_connections[client_id] = websocket

    def disconnect(self, client_id: str):
        if client_id in self.active_connections:
            del self.active_connections[client_id]
        for room_id, clients in self.rooms.items():
            if client_id in clients:
                clients.remove(client_id)

    async def send_to_client(self, client_id: str, message: dict):
        if client_id in self.active_connections:
            await self.active_connections[client_id].send_json(message)

    async def broadcast_to_room(self, room_id: str, message: dict, exclude: str = None):
        if room_id in self.rooms:
            for client_id in self.rooms[room_id]:
                if client_id != exclude and client_id in self.active_connections:
                    await self.active_connections[client_id].send_json(message)

    def join_room(self, client_id: str, room_id: str):
        if room_id not in self.rooms:
            self.rooms[room_id] = []
        if client_id not in self.rooms[room_id]:
            self.rooms[room_id].append(client_id)

    def get_room_clients(self, room_id: str) -> List[str]:
        return self.rooms.get(room_id, [])


manager = ConnectionManager()


@app.get("/")
async def get_index():
    return FileResponse(str(FRONTEND_DIR / "index.html"))


@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    await manager.connect(websocket, client_id)
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            msg_type = message.get("type")

            if msg_type == "join":
                room_id = message.get("roomId")
                manager.join_room(client_id, room_id)
                await manager.broadcast_to_room(
                    room_id,
                    {
                        "type": "peer-joined",
                        "clientId": client_id,
                        "clients": manager.get_room_clients(room_id)
                    },
                    exclude=client_id
                )
                await manager.send_to_client(
                    client_id,
                    {
                        "type": "joined",
                        "roomId": room_id,
                        "clients": manager.get_room_clients(room_id)
                    }
                )

            elif msg_type == "offer":
                target_id = message.get("targetId")
                await manager.send_to_client(
                    target_id,
                    {
                        "type": "offer",
                        "from": client_id,
                        "sdp": message.get("sdp")
                    }
                )

            elif msg_type == "answer":
                target_id = message.get("targetId")
                await manager.send_to_client(
                    target_id,
                    {
                        "type": "answer",
                        "from": client_id,
                        "sdp": message.get("sdp")
                    }
                )

            elif msg_type == "ice-candidate":
                target_id = message.get("targetId")
                await manager.send_to_client(
                    target_id,
                    {
                        "type": "ice-candidate",
                        "from": client_id,
                        "candidate": message.get("candidate")
                    }
                )

            elif msg_type == "leave":
                room_id = message.get("roomId")
                manager.disconnect(client_id)
                await manager.broadcast_to_room(
                    room_id,
                    {
                        "type": "peer-left",
                        "clientId": client_id
                    }
                )

    except WebSocketDisconnect:
        manager.disconnect(client_id)
        for room_id in manager.rooms:
            if client_id in manager.rooms[room_id]:
                await manager.broadcast_to_room(
                    room_id,
                    {
                        "type": "peer-left",
                        "clientId": client_id
                    }
                )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
