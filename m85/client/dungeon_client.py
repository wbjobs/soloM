#!/usr/bin/env python3
import socket
import struct
import json
import sys
import time
import argparse
from enum import IntEnum
from typing import Optional, Dict, Tuple, List, Set

try:
    import tkinter as tk
    from tkinter import ttk, messagebox
    TKINTER_AVAILABLE = True
except ImportError:
    TKINTER_AVAILABLE = False

TILE_SIZE = 16
WALL_COLOR = "#1a1a2e"
FLOOR_COLOR = "#16213e"
CORRIDOR_COLOR = "#0f3460"
DOOR_COLOR = "#e94560"
STAIR_UP_COLOR = "#00ff88"
STAIR_DOWN_COLOR = "#ffaa00"
WATER_COLOR = "#0077be"
LAVA_COLOR = "#ff4500"
GRID_COLOR = "#2a2a3a"
FOG_COLOR = "#0a0a0f"
EXPLORED_FOG_COLOR = "#0f0f1a"
PLAYER_COLOR = "#ff4444"
PATH_COLOR = "#44ff44"

class TileType(IntEnum):
    WALL = 0
    FLOOR = 1
    DOOR = 2
    CORRIDOR = 3
    STAIR_UP = 4
    STAIR_DOWN = 5
    WATER = 6
    LAVA = 7

TILE_COLORS = {
    TileType.WALL: WALL_COLOR,
    TileType.FLOOR: FLOOR_COLOR,
    TileType.DOOR: DOOR_COLOR,
    TileType.CORRIDOR: CORRIDOR_COLOR,
    TileType.STAIR_UP: STAIR_UP_COLOR,
    TileType.STAIR_DOWN: STAIR_DOWN_COLOR,
    TileType.WATER: WATER_COLOR,
    TileType.LAVA: LAVA_COLOR,
}

TILE_CHARS = {
    TileType.WALL: '#',
    TileType.FLOOR: '.',
    TileType.DOOR: '+',
    TileType.CORRIDOR: ',',
    TileType.STAIR_UP: '<',
    TileType.STAIR_DOWN: '>',
    TileType.WATER: '~',
    TileType.LAVA: '^',
}

class Tile:
    def __init__(self, tile_type: TileType, passable: bool, opaque: bool):
        self.tile_type = tile_type
        self.passable = passable
        self.opaque = opaque

class MapChunk:
    def __init__(self, coord_x: int, coord_y: int, width: int, height: int, tiles: List[Tile], seed: int):
        self.coord_x = coord_x
        self.coord_y = coord_y
        self.width = width
        self.height = height
        self.tiles = tiles
        self.seed = seed

    def get_tile(self, x: int, y: int) -> Optional[Tile]:
        if 0 <= x < self.width and 0 <= y < self.height:
            return self.tiles[y * self.width + x]
        return None

class DungeonClient:
    def __init__(self, host: str = "127.0.0.1", port: int = 8080, use_json: bool = False):
        self.host = host
        self.port = port
        self.use_json = use_json
        self.socket: Optional[socket.socket] = None
        self.map_width: int = 0
        self.map_height: int = 0
        self.chunk_size: int = 0
        self.chunks: Dict[Tuple[int, int], MapChunk] = {}
        self.player_x: int = 16
        self.player_y: int = 16
        self.player_chunk_x: int = 0
        self.player_chunk_y: int = 0
        self.explored_tiles: Set[Tuple[int, int, int, int]] = set()
        self.current_path: List[Tuple[int, int]] = []
        self.view_radius: int = 8

    def connect(self) -> None:
        self.socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.socket.connect((self.host, self.port))
        self.socket.settimeout(10.0)
        print(f"Connected to {self.host}:{self.port}")
        
        msg = self._recv_message()
        if msg and msg.get("type") == "MapInfo":
            self.map_width = msg["width"]
            self.map_height = msg["height"]
            self.chunk_size = msg["chunk_size"]
            print(f"Map info: {self.map_width}x{self.map_height}, chunk size: {self.chunk_size}")
        else:
            raise RuntimeError("Failed to receive map info")

    def disconnect(self) -> None:
        if self.socket:
            self.socket.close()
            self.socket = None
            print("Disconnected")

    def _send_message(self, msg: dict) -> None:
        if not self.socket:
            raise RuntimeError("Not connected")
        
        if self.use_json:
            data = json.dumps(self._normalize_outgoing_json(msg)).encode('utf-8')
        else:
            data = self._serialize_bincode(msg)

        header = struct.pack('<I', len(data))
        self.socket.sendall(header + data)

    def _normalize_outgoing_json(self, msg: dict) -> dict:
        msg_type = msg.get("type", "")
        if msg_type == "RequestChunk":
            return {"RequestChunk": {"x": msg["x"], "y": msg["y"]}}
        elif msg_type == "PlayerUpdate":
            return {"PlayerUpdate": {
                "position": msg["position"],
                "health": msg["health"]
            }}
        elif msg_type == "RequestPath":
            return {"RequestPath": {
                "chunk_x": msg["chunk_x"],
                "chunk_y": msg["chunk_y"],
                "start_x": msg["start_x"],
                "start_y": msg["start_y"],
                "end_x": msg["end_x"],
                "end_y": msg["end_y"],
            }}
        elif msg_type == "RequestVisibility":
            return {"RequestVisibility": {
                "chunk_x": msg["chunk_x"],
                "chunk_y": msg["chunk_y"],
                "player_x": msg["player_x"],
                "player_y": msg["player_y"],
                "view_radius": msg["view_radius"],
            }}
        elif msg_type == "PlayerMove":
            return {"PlayerMove": {
                "chunk_x": msg["chunk_x"],
                "chunk_y": msg["chunk_y"],
                "new_x": msg["new_x"],
                "new_y": msg["new_y"],
            }}
        else:
            return msg

    def _recv_message(self) -> Optional[dict]:
        if not self.socket:
            raise RuntimeError("Not connected")
        
        header = self._recv_exact(4)
        if not header:
            return None
        
        msg_len = struct.unpack('<I', header)[0]
        
        if msg_len > 10 * 1024 * 1024:
            raise RuntimeError(f"Message too large: {msg_len} bytes")
        
        data = self._recv_exact(msg_len)
        if not data:
            return None
        
        if self.use_json:
            raw = json.loads(data.decode('utf-8'))
            return self._normalize_json_message(raw)
        else:
            return self._deserialize_bincode(data)

    def _normalize_json_message(self, raw: dict) -> dict:
        if "MapInfo" in raw:
            return {
                "type": "MapInfo",
                "width": raw["MapInfo"]["width"],
                "height": raw["MapInfo"]["height"],
                "chunk_size": raw["MapInfo"]["chunk_size"]
            }
        elif "ChunkData" in raw:
            chunk = raw["ChunkData"]
            tiles = []
            tile_type_map = {
                "Wall": TileType.WALL,
                "Floor": TileType.FLOOR,
                "Door": TileType.DOOR,
                "Corridor": TileType.CORRIDOR,
                "StairUp": TileType.STAIR_UP,
                "StairDown": TileType.STAIR_DOWN,
                "Water": TileType.WATER,
                "Lava": TileType.LAVA,
            }
            for t in chunk["tiles"]:
                tile_type_val = t["tile_type"]
                if isinstance(tile_type_val, str):
                    tile_type = tile_type_map.get(tile_type_val, TileType.WALL)
                else:
                    tile_type = TileType(tile_type_val)
                tiles.append(Tile(
                    tile_type,
                    t["passable"],
                    t["opaque"]
                ))
            return {
                "type": "ChunkData",
                "coord": chunk["coord"],
                "width": chunk["width"],
                "height": chunk["height"],
                "tiles": tiles,
                "seed": chunk["seed"]
            }
        elif "Error" in raw:
            return {
                "type": "Error",
                "message": raw["Error"]
            }
        elif "PlayerUpdate" in raw:
            return {
                "type": "PlayerUpdate",
                "position": raw["PlayerUpdate"]["position"],
                "health": raw["PlayerUpdate"]["health"]
            }
        elif "PathResult" in raw:
            return {
                "type": "PathResult",
                "chunk_x": raw["PathResult"]["chunk_x"],
                "chunk_y": raw["PathResult"]["chunk_y"],
                "path": raw["PathResult"]["path"],
                "found": raw["PathResult"]["found"],
            }
        elif "VisibilityData" in raw:
            return {
                "type": "VisibilityData",
                "chunk_x": raw["VisibilityData"]["chunk_x"],
                "chunk_y": raw["VisibilityData"]["chunk_y"],
                "player_position": raw["VisibilityData"]["player_position"],
                "visible_tiles": raw["VisibilityData"]["visible_tiles"],
            }
        elif "RequestChunk" in raw:
            return {
                "type": "RequestChunk",
                "x": raw["RequestChunk"]["x"],
                "y": raw["RequestChunk"]["y"]
            }
        else:
            return raw

    def _recv_exact(self, size: int) -> Optional[bytes]:
        data = b''
        while len(data) < size:
            chunk = self.socket.recv(size - len(data))
            if not chunk:
                return None
            data += chunk
        return data

    def _serialize_bincode(self, msg: dict) -> bytes:
        raise NotImplementedError("Bincode serialization not implemented for new message types")

    def _deserialize_bincode(self, data: bytes) -> dict:
        raise NotImplementedError("Bincode deserialization not implemented for new message types")

    def request_chunk(self, x: int, y: int) -> Optional[MapChunk]:
        msg = {"type": "RequestChunk", "x": x, "y": y}
        self._send_message(msg)
        
        response = self._recv_message()
        if not response:
            return None
        
        if response["type"] == "ChunkData":
            chunk = MapChunk(
                response["coord"]["x"],
                response["coord"]["y"],
                response["width"],
                response["height"],
                response["tiles"],
                response["seed"]
            )
            self.chunks[(x, y)] = chunk
            print(f"Received chunk ({x}, {y}) with {len(chunk.tiles)} tiles")
            return chunk
        elif response["type"] == "Error":
            print(f"Server error: {response['message']}")
            return None
        
        return None

    def request_path(self, chunk_x: int, chunk_y: int, start_x: int, start_y: int, end_x: int, end_y: int) -> Optional[List[Tuple[int, int]]]:
        msg = {
            "type": "RequestPath",
            "chunk_x": chunk_x,
            "chunk_y": chunk_y,
            "start_x": start_x,
            "start_y": start_y,
            "end_x": end_x,
            "end_y": end_y,
        }
        self._send_message(msg)
        
        response = self._recv_message()
        if not response:
            return None
        
        if response["type"] == "PathResult" and response["found"]:
            path = [(p["x"], p["y"]) for p in response["path"]]
            self.current_path = path
            return path
        return None

    def request_visibility(self, chunk_x: int, chunk_y: int, player_x: int, player_y: int, view_radius: int) -> Optional[List[Tuple[int, int]]]:
        msg = {
            "type": "RequestVisibility",
            "chunk_x": chunk_x,
            "chunk_y": chunk_y,
            "player_x": player_x,
            "player_y": player_y,
            "view_radius": view_radius,
        }
        self._send_message(msg)
        
        response = self._recv_message()
        if not response:
            return None
        
        if response["type"] == "VisibilityData":
            visible = [(p["x"], p["y"]) for p in response["visible_tiles"]]
            for (x, y) in visible:
                self.explored_tiles.add((chunk_x, chunk_y, x, y))
            return visible
        return None

    def move_player(self, new_chunk_x: int, new_chunk_y: int, new_x: int, new_y: int) -> None:
        msg = {
            "type": "PlayerMove",
            "chunk_x": new_chunk_x,
            "chunk_y": new_chunk_y,
            "new_x": new_x,
            "new_y": new_y,
        }
        self._send_message(msg)
        
        self.player_chunk_x = new_chunk_x
        self.player_chunk_y = new_chunk_y
        self.player_x = new_x
        self.player_y = new_y
        
        self.request_visibility(new_chunk_x, new_chunk_y, new_x, new_y, self.view_radius)

    def request_all_chunks(self, progress_callback=None) -> int:
        chunks_x = (self.map_width + self.chunk_size - 1) // self.chunk_size
        chunks_y = (self.map_height + self.chunk_size - 1) // self.chunk_size
        total = chunks_x * chunks_y
        received = 0

        print(f"Requesting {chunks_x}x{chunks_y} = {total} chunks...")
        
        for cy in range(chunks_y):
            for cx in range(chunks_x):
                chunk = self.request_chunk(cx, cy)
                if chunk:
                    received += 1
                    if progress_callback:
                        progress_callback(received, total)
        
        print(f"Received {received}/{total} chunks")
        return received

    def print_chunk(self, chunk: MapChunk) -> None:
        print(f"Chunk ({chunk.coord_x}, {chunk.coord_y}):")
        for y in range(chunk.height):
            line = []
            for x in range(chunk.width):
                tile = chunk.get_tile(x, y)
                if tile:
                    line.append(TILE_CHARS.get(tile.tile_type, '?'))
                else:
                    line.append(' ')
            print(''.join(line))
        print()

    def update_player(self, x: int, y: int, health: int = 100) -> None:
        self.player_x = x
        self.player_y = y
        msg = {
            "type": "PlayerUpdate",
            "position": {"x": x, "y": y},
            "health": health
        }
        self._send_message(msg)

    def get_world_tile(self, world_x: int, world_y: int) -> Optional[Tile]:
        chunk_x = world_x // self.chunk_size
        chunk_y = world_y // self.chunk_size
        local_x = world_x % self.chunk_size
        local_y = world_y % self.chunk_size
        
        chunk = self.chunks.get((chunk_x, chunk_y))
        if chunk:
            return chunk.get_tile(local_x, local_y)
        return None

    def is_explored(self, chunk_x: int, chunk_y: int, local_x: int, local_y: int) -> bool:
        return (chunk_x, chunk_y, local_x, local_y) in self.explored_tiles

class DungeonViewer:
    def __init__(self, client: DungeonClient):
        if not TKINTER_AVAILABLE:
            raise RuntimeError("Tkinter is not available")
        
        self.client = client
        self.root = tk.Tk()
        self.root.title("Dungeon Explorer - Fog of War")
        self.root.geometry("1200x900")
        
        self.view_offset_x = 0
        self.view_offset_y = 0
        self.zoom = 1.0
        self.dragging = False
        self.last_mouse_x = 0
        self.last_mouse_y = 0
        self.current_path: List[Tuple[int, int]] = []
        self.target_chunk_x: Optional[int] = None
        self.target_local_x: Optional[int] = None
        self.target_local_y: Optional[int] = None
        
        self._setup_ui()
        self._bind_events()
        self._center_on_player()

    def _setup_ui(self):
        main_frame = ttk.Frame(self.root)
        main_frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)

        control_frame = ttk.Frame(main_frame)
        control_frame.pack(fill=tk.X, pady=(0, 5))

        ttk.Label(control_frame, text=f"Map: {self.client.map_width}x{self.client.map_height}").pack(side=tk.LEFT, padx=5)
        ttk.Label(control_frame, text=f"Chunk Size: {self.client.chunk_size}").pack(side=tk.LEFT, padx=5)
        ttk.Label(control_frame, text=f"View Radius: {self.client.view_radius}").pack(side=tk.LEFT, padx=5)
        
        self.fog_enabled = tk.BooleanVar(value=True)
        ttk.Checkbutton(control_frame, text="Fog of War", variable=self.fog_enabled, command=self._redraw).pack(side=tk.LEFT, padx=5)
        
        self.status_var = tk.StringVar(value="Ready")
        ttk.Label(control_frame, textvariable=self.status_var).pack(side=tk.RIGHT, padx=5)

        button_frame = ttk.Frame(control_frame)
        button_frame.pack(side=tk.LEFT, padx=10)

        ttk.Button(button_frame, text="Load All Chunks", command=self._load_all_chunks).pack(side=tk.LEFT, padx=2)
        ttk.Button(button_frame, text="Zoom In", command=lambda: self._set_zoom(self.zoom * 1.2)).pack(side=tk.LEFT, padx=2)
        ttk.Button(button_frame, text="Zoom Out", command=lambda: self._set_zoom(self.zoom / 1.2)).pack(side=tk.LEFT, padx=2)
        ttk.Button(button_frame, text="Reset View", command=self._reset_view).pack(side=tk.LEFT, padx=2)
        ttk.Button(button_frame, text="Center on Player", command=self._center_on_player).pack(side=tk.LEFT, padx=2)

        move_frame = ttk.Frame(control_frame)
        move_frame.pack(side=tk.LEFT, padx=10)
        ttk.Label(move_frame, text="Move:").pack(side=tk.LEFT)
        ttk.Button(move_frame, text="←", command=lambda: self._move_player(-1, 0)).pack(side=tk.LEFT, padx=1)
        ttk.Button(move_frame, text="→", command=lambda: self._move_player(1, 0)).pack(side=tk.LEFT, padx=1)
        ttk.Button(move_frame, text="↑", command=lambda: self._move_player(0, -1)).pack(side=tk.LEFT, padx=1)
        ttk.Button(move_frame, text="↓", command=lambda: self._move_player(0, 1)).pack(side=tk.LEFT, padx=1)

        self.progress = ttk.Progressbar(control_frame, mode='determinate')
        self.progress.pack(side=tk.RIGHT, padx=5, fill=tk.X, expand=True)

        self.canvas = tk.Canvas(main_frame, bg="#0a0a0f", highlightthickness=0)
        self.canvas.pack(fill=tk.BOTH, expand=True)

        self.canvas.bind("<Configure>", lambda e: self._redraw())

    def _bind_events(self):
        self.canvas.bind("<ButtonPress-1>", self._on_mouse_down)
        self.canvas.bind("<B1-Motion>", self._on_mouse_drag)
        self.canvas.bind("<ButtonRelease-1>", self._on_mouse_up)
        self.canvas.bind("<MouseWheel>", self._on_mouse_wheel)
        self.canvas.bind("<Button-3>", self._on_right_click)
        
        self.root.bind("<Left>", lambda e: self._move_player(-1, 0))
        self.root.bind("<Right>", lambda e: self._move_player(1, 0))
        self.root.bind("<Up>", lambda e: self._move_player(0, -1))
        self.root.bind("<Down>", lambda e: self._move_player(0, 1))
        self.root.bind("<plus>", lambda e: self._set_zoom(self.zoom * 1.2))
        self.root.bind("<minus>", lambda e: self._set_zoom(self.zoom / 1.2))
        self.root.bind("0", lambda e: self._reset_view())
        self.root.bind("c", lambda e: self._center_on_player())

    def _on_right_click(self, event):
        tile_size = TILE_SIZE * self.zoom
        world_x = int((event.x - self.view_offset_x) / tile_size)
        world_y = int((event.y - self.view_offset_y) / tile_size)
        
        chunk_x = world_x // self.client.chunk_size
        chunk_y = world_y // self.client.chunk_size
        local_x = world_x % self.client.chunk_size
        local_y = world_y % self.client.chunk_size
        
        if (chunk_x, chunk_y) in self.client.chunks:
            chunk = self.client.chunks[(chunk_x, chunk_y)]
            tile = chunk.get_tile(local_x, local_y)
            if tile and tile.passable:
                self.status_var.set(f"Calculating path to ({world_x}, {world_y})...")
                self.root.update_idletasks()
                
                player_world_x = self.client.player_chunk_x * self.client.chunk_size + self.client.player_x
                player_world_y = self.client.player_chunk_y * self.client.chunk_size + self.client.player_y
                player_local_x = player_world_x % self.client.chunk_size
                player_local_y = player_world_y % self.client.chunk_size
                
                path = self.client.request_path(
                    chunk_x, chunk_y,
                    player_local_x, player_local_y,
                    local_x, local_y
                )
                
                if path:
                    self.current_path = [
                        (chunk_x * self.client.chunk_size + px, chunk_y * self.client.chunk_size + py)
                        for (px, py) in path
                    ]
                    self.status_var.set(f"Path found: {len(path)} steps")
                    self._redraw()
                else:
                    self.status_var.set("No path found")
            else:
                self.status_var.set("Target is not passable")

    def _move_player(self, dx: int, dy: int):
        new_world_x = self.client.player_chunk_x * self.client.chunk_size + self.client.player_x + dx
        new_world_y = self.client.player_chunk_y * self.client.chunk_size + self.client.player_y + dy
        
        tile = self.client.get_world_tile(new_world_x, new_world_y)
        if tile and tile.passable:
            new_chunk_x = new_world_x // self.client.chunk_size
            new_chunk_y = new_world_y // self.client.chunk_size
            new_local_x = new_world_x % self.client.chunk_size
            new_local_y = new_world_y % self.client.chunk_size
            
            if (new_chunk_x, new_chunk_y) not in self.client.chunks:
                self.client.request_chunk(new_chunk_x, new_chunk_y)
            
            self.client.move_player(new_chunk_x, new_chunk_y, new_local_x, new_local_y)
            self.status_var.set(f"Moved to ({new_world_x}, {new_world_y})")
            self.current_path = []
            self._redraw()
        else:
            self.status_var.set("Cannot move there - blocked!")

    def _on_mouse_down(self, event):
        self.dragging = True
        self.last_mouse_x = event.x
        self.last_mouse_y = event.y
        self.canvas.config(cursor="fleur")

    def _on_mouse_drag(self, event):
        if self.dragging:
            dx = event.x - self.last_mouse_x
            dy = event.y - self.last_mouse_y
            self.view_offset_x += dx / self.zoom
            self.view_offset_y += dy / self.zoom
            self.last_mouse_x = event.x
            self.last_mouse_y = event.y
            self._redraw()

    def _on_mouse_up(self, event):
        self.dragging = False
        self.canvas.config(cursor="")

    def _on_mouse_wheel(self, event):
        if event.delta > 0:
            self._set_zoom(self.zoom * 1.1)
        else:
            self._set_zoom(self.zoom / 1.1)

    def _set_zoom(self, new_zoom):
        self.zoom = max(0.25, min(8.0, new_zoom))
        self._redraw()

    def _reset_view(self):
        self.view_offset_x = 0
        self.view_offset_y = 0
        self.zoom = 1.0
        self._redraw()

    def _center_on_player(self):
        tile_size = TILE_SIZE * self.zoom
        canvas_width = self.canvas.winfo_width()
        canvas_height = self.canvas.winfo_height()
        
        player_world_x = self.client.player_chunk_x * self.client.chunk_size + self.client.player_x
        player_world_y = self.client.player_chunk_y * self.client.chunk_size + self.client.player_y
        
        self.view_offset_x = canvas_width / 2 - player_world_x * tile_size
        self.view_offset_y = canvas_height / 2 - player_world_y * tile_size
        
        self._redraw()

    def _load_all_chunks(self):
        def progress_cb(received, total):
            self.progress['maximum'] = total
            self.progress['value'] = received
            self.status_var.set(f"Loading chunks: {received}/{total}")
            self.root.update_idletasks()
        
        self.status_var.set("Loading chunks...")
        self.root.update_idletasks()
        
        start = time.time()
        received = self.client.request_all_chunks(progress_cb)
        elapsed = time.time() - start
        
        self.status_var.set(f"Loaded {received} chunks in {elapsed:.2f}s")
        self._redraw()

    def _redraw(self):
        self.canvas.delete("all")
        
        width = self.canvas.winfo_width()
        height = self.canvas.winfo_height()
        tile_size = TILE_SIZE * self.zoom
        
        start_x = int(max(0, -self.view_offset_x / tile_size))
        start_y = int(max(0, -self.view_offset_y / tile_size))
        end_x = int(min(self.client.map_width, (width - self.view_offset_x) / tile_size + 1))
        end_y = int(min(self.client.map_height, (height - self.view_offset_y) / tile_size + 1))
        
        player_world_x = self.client.player_chunk_x * self.client.chunk_size + self.client.player_x
        player_world_y = self.client.player_chunk_y * self.client.chunk_size + self.client.player_y
        
        visible_tiles = set()
        if self.fog_enabled.get():
            try:
                chunk = self.client.chunks.get((self.client.player_chunk_x, self.client.player_chunk_y))
                if chunk:
                    for dy in range(-self.client.view_radius, self.client.view_radius + 1):
                        for dx in range(-self.client.view_radius, self.client.view_radius + 1):
                            dist = (dx * dx + dy * dy) ** 0.5
                            if dist <= self.client.view_radius:
                                vx = self.client.player_x + dx
                                vy = self.client.player_y + dy
                                if 0 <= vx < self.client.chunk_size and 0 <= vy < self.client.chunk_size:
                                    tile = chunk.get_tile(vx, vy)
                                    if tile:
                                        wx = self.client.player_chunk_x * self.client.chunk_size + vx
                                        wy = self.client.player_chunk_y * self.client.chunk_size + vy
                                        visible_tiles.add((wx, wy))
                                        if tile.opaque:
                                            break
            except:
                pass
        
        for world_y in range(start_y, end_y):
            for world_x in range(start_x, end_x):
                tile = self.client.get_world_tile(world_x, world_y)
                if tile:
                    screen_x = world_x * tile_size + self.view_offset_x
                    screen_y = world_y * tile_size + self.view_offset_y
                    
                    chunk_x = world_x // self.client.chunk_size
                    chunk_y = world_y // self.client.chunk_size
                    local_x = world_x % self.client.chunk_size
                    local_y = world_y % self.client.chunk_size
                    
                    is_visible = (world_x, world_y) in visible_tiles
                    is_explored = self.client.is_explored(chunk_x, chunk_y, local_x, local_y)
                    
                    if self.fog_enabled.get():
                        if is_visible:
                            color = TILE_COLORS.get(tile.tile_type, "#333333")
                            alpha = 1.0
                        elif is_explored:
                            color = TILE_COLORS.get(tile.tile_type, "#333333")
                            alpha = 0.3
                        else:
                            color = FOG_COLOR
                            alpha = 1.0
                    else:
                        color = TILE_COLORS.get(tile.tile_type, "#333333")
                        alpha = 1.0
                    
                    if tile_size > 4:
                        self.canvas.create_rectangle(
                            screen_x, screen_y,
                            screen_x + tile_size, screen_y + tile_size,
                            fill=color, outline=GRID_COLOR if tile_size > 8 else ""
                        )
                    else:
                        self.canvas.create_rectangle(
                            screen_x, screen_y,
                            screen_x + tile_size + 1, screen_y + tile_size + 1,
                            fill=color, outline=""
                        )
        
        if self.current_path:
            for (px, py) in self.current_path:
                screen_x = px * tile_size + self.view_offset_x
                screen_y = py * tile_size + self.view_offset_y
                self.canvas.create_oval(
                    screen_x + tile_size * 0.25, screen_y + tile_size * 0.25,
                    screen_x + tile_size * 0.75, screen_y + tile_size * 0.75,
                    fill=PATH_COLOR, outline=""
                )
        
        px = player_world_x * tile_size + self.view_offset_x
        py = player_world_y * tile_size + self.view_offset_y
        self.canvas.create_oval(
            px - tile_size * 0.4, py - tile_size * 0.4,
            px + tile_size * 0.4, py + tile_size * 0.4,
            fill=PLAYER_COLOR, outline="#ffffff", width=2
        )

    def run(self):
        self._redraw()
        self.root.mainloop()

def main():
    parser = argparse.ArgumentParser(description="Dungeon Generator Client with Fog of War")
    parser.add_argument("--host", default="127.0.0.1", help="Server host")
    parser.add_argument("--port", type=int, default=8080, help="Server port")
    parser.add_argument("--json", action="store_true", help="Use JSON serialization instead of bincode")
    parser.add_argument("--no-gui", action="store_true", help="Run without GUI, just print to console")
    parser.add_argument("--chunk", nargs=2, type=int, metavar=("X", "Y"), help="Request and print a specific chunk")
    parser.add_argument("--all", action="store_true", help="Request all chunks and print stats")
    parser.add_argument("--view-radius", type=int, default=8, help="Player view radius for fog of war")
    
    args = parser.parse_args()

    client = DungeonClient(args.host, args.port, args.json)
    client.view_radius = args.view_radius
    
    try:
        client.connect()
        
        if args.chunk:
            chunk = client.request_chunk(args.chunk[0], args.chunk[1])
            if chunk:
                client.print_chunk(chunk)
        
        if args.all:
            received = client.request_all_chunks()
            
            total_tiles = 0
            floor_tiles = 0
            wall_tiles = 0
            for chunk in client.chunks.values():
                for tile in chunk.tiles:
                    total_tiles += 1
                    if tile.tile_type in [TileType.FLOOR, TileType.CORRIDOR]:
                        floor_tiles += 1
                    elif tile.tile_type == TileType.WALL:
                        wall_tiles += 1
            
            print("\nStatistics:")
            print(f"  Total chunks: {len(client.chunks)}")
            print(f"  Total tiles: {total_tiles}")
            print(f"  Floor tiles: {floor_tiles} ({floor_tiles/total_tiles*100:.1f}%)")
            print(f"  Wall tiles: {wall_tiles} ({wall_tiles/total_tiles*100:.1f}%)")
        
        if not args.no_gui and not args.chunk and not args.all:
            if (0, 0) not in client.chunks:
                client.request_chunk(0, 0)
            
            client.move_player(0, 0, 16, 16)
            
            viewer = DungeonViewer(client)
            viewer.run()
            
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        client.disconnect()

if __name__ == "__main__":
    main()
