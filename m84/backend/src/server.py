import asyncio
import json
import struct
import websockets
from websockets.server import WebSocketServerProtocol
from typing import Set, Dict, Any

from .simulation import SimulationController


class NBodyWebSocketServer:
    def __init__(self, host: str = '0.0.0.0', port: int = 8765):
        self.host = host
        self.port = port
        self.clients: Set[WebSocketServerProtocol] = set()
        self.controller = SimulationController()
        self._setup_callbacks()
        self._state_cache: Dict[str, Any] = {}
        self._stats_cache: Dict[str, Any] = {}
        self._binary_cache: bytes = b''

    def _setup_callbacks(self) -> None:
        self.controller.on('state_binary', self._broadcast_binary_state)
        self.controller.on('stats', self._broadcast_stats)
        self.controller.on('scene_changed', self._broadcast_scene_changed)

    async def _broadcast_binary_state(self, data: bytes) -> None:
        self._binary_cache = data
        if self.clients:
            results = await asyncio.gather(
                *[self._safe_send_binary(client, data) for client in list(self.clients)],
                return_exceptions=True
            )
            for i, result in enumerate(results):
                if isinstance(result, Exception):
                    client = list(self.clients)[i] if i < len(list(self.clients)) else None

    async def _broadcast_stats(self, stats: Dict[str, Any]) -> None:
        self._stats_cache = stats
        if self.clients:
            message = json.dumps({'type': 'stats', 'data': stats})
            await asyncio.gather(
                *[self._safe_send(client, message) for client in list(self.clients)],
                return_exceptions=True
            )

    async def _broadcast_scene_changed(self, scene_data: Dict[str, Any]) -> None:
        if self.clients:
            message = json.dumps({'type': 'scene_changed', 'data': scene_data})
            await asyncio.gather(
                *[self._safe_send(client, message) for client in list(self.clients)],
                return_exceptions=True
            )

    async def _safe_send(self, websocket: WebSocketServerProtocol, message: str) -> None:
        try:
            await websocket.send(message)
        except Exception:
            pass

    async def _safe_send_binary(self, websocket: WebSocketServerProtocol, data: bytes) -> None:
        try:
            await websocket.send(data)
        except Exception:
            pass

    async def handle_client(self, websocket: WebSocketServerProtocol) -> None:
        self.clients.add(websocket)
        print(f"Client connected. Total clients: {len(self.clients)}")

        try:
            if self._binary_cache:
                await websocket.send(self._binary_cache)
            if self._stats_cache:
                await websocket.send(json.dumps({'type': 'stats', 'data': self._stats_cache}))

            await websocket.send(json.dumps({
                'type': 'scenes',
                'data': self.controller.get_scene_list()
            }))

            async for message in websocket:
                try:
                    if isinstance(message, bytes):
                        continue
                    await self._handle_message(websocket, message)
                except Exception as e:
                    print(f"Error handling message: {e}")
                    error_msg = json.dumps({'type': 'error', 'message': str(e)})
                    await self._safe_send(websocket, error_msg)

        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            self.clients.discard(websocket)
            print(f"Client disconnected. Total clients: {len(self.clients)}")

            if not self.clients:
                print("No clients left, pausing simulation")
                self.controller.pause()

    async def _handle_message(self, websocket: WebSocketServerProtocol, message: str) -> None:
        data = json.loads(message)
        msg_type = data.get('type')

        if msg_type == 'scene':
            scene_id = data.get('sceneId')
            params = data.get('params', {})
            result = self.controller.load_scene(scene_id, **params)
            response = json.dumps({'type': 'scene_loaded', 'data': result})
            await websocket.send(response)

            binary_state = self.controller.get_state_binary()
            await websocket.send(binary_state)

        elif msg_type == 'config':
            config = data.get('config', {})
            self.controller.set_config(config)
            response = json.dumps({
                'type': 'config_updated',
                'data': self.controller.get_config()
            })
            await websocket.send(response)

        elif msg_type == 'control':
            command = data.get('command')

            if command == 'start':
                self.controller.start()
                if not self.controller.is_running:
                    self.controller.start()
                asyncio.create_task(self.controller.run_simulation_loop())

            elif command == 'pause':
                self.controller.pause()

            elif command == 'resume':
                self.controller.resume()

            elif command == 'reset':
                state_dict = self.controller.reset()
                await websocket.send(json.dumps({'type': 'state', 'data': state_dict}))

            elif command == 'step':
                total_time, compute_time = self.controller.step()
                binary_state = self.controller.get_state_binary()
                await websocket.send(binary_state)

            response = json.dumps({
                'type': 'control_ack',
                'data': {
                    'command': command,
                    'isRunning': self.controller.is_running,
                    'isPaused': self.controller.is_paused
                }
            })
            await websocket.send(response)

        elif msg_type == 'get_state':
            binary_state = self.controller.get_state_binary()
            await websocket.send(binary_state)

        elif msg_type == 'get_config':
            config = self.controller.get_config()
            await websocket.send(json.dumps({'type': 'config', 'data': config}))

        elif msg_type == 'get_stats':
            stats = self.controller.get_stats()
            await websocket.send(json.dumps({'type': 'stats', 'data': stats}))

        else:
            raise ValueError(f"Unknown message type: {msg_type}")

    async def start(self) -> None:
        print(f"Starting N-Body WebSocket server on {self.host}:{self.port}")
        async with websockets.serve(self.handle_client, self.host, self.port):
            await asyncio.Future()

    def stop(self) -> None:
        self.controller.cleanup()


async def run_server(host: str = '0.0.0.0', port: int = 8765) -> None:
    server = NBodyWebSocketServer(host, port)
    try:
        await server.start()
    finally:
        server.stop()
