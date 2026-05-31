use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TileType {
    Wall,
    Floor,
    Door,
    Corridor,
    StairUp,
    StairDown,
    Water,
    Lava,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Position {
    pub x: i32,
    pub y: i32,
}

impl Position {
    pub fn new(x: i32, y: i32) -> Self {
        Self { x, y }
    }

    pub fn distance(&self, other: &Position) -> f32 {
        let dx = (self.x - other.x) as f32;
        let dy = (self.y - other.y) as f32;
        (dx * dx + dy * dy).sqrt()
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Tile {
    pub tile_type: TileType,
    pub passable: bool,
    pub opaque: bool,
}

impl Tile {
    pub fn new(tile_type: TileType) -> Self {
        let (passable, opaque) = match tile_type {
            TileType::Wall => (false, true),
            TileType::Floor => (true, false),
            TileType::Door => (true, false),
            TileType::Corridor => (true, false),
            TileType::StairUp => (true, false),
            TileType::StairDown => (true, false),
            TileType::Water => (false, false),
            TileType::Lava => (false, false),
        };
        Self {
            tile_type,
            passable,
            opaque,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct ChunkCoord {
    pub x: i32,
    pub y: i32,
}

impl ChunkCoord {
    pub fn new(x: i32, y: i32) -> Self {
        Self { x, y }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MapChunk {
    pub coord: ChunkCoord,
    pub width: u32,
    pub height: u32,
    pub tiles: Vec<Tile>,
    pub seed: u64,
}

impl MapChunk {
    pub fn new(coord: ChunkCoord, width: u32, height: u32, seed: u64) -> Self {
        Self {
            coord,
            width,
            height,
            tiles: vec![Tile::new(TileType::Wall); (width * height) as usize],
            seed,
        }
    }

    pub fn get_tile(&self, x: u32, y: u32) -> Option<&Tile> {
        if x < self.width && y < self.height {
            Some(&self.tiles[(y * self.width + x) as usize])
        } else {
            None
        }
    }

    pub fn set_tile(&mut self, x: u32, y: u32, tile: Tile) {
        if x < self.width && y < self.height {
            self.tiles[(y * self.width + x) as usize] = tile;
        }
    }

    pub fn set_tile_type(&mut self, x: u32, y: u32, tile_type: TileType) {
        if x < self.width && y < self.height {
            self.tiles[(y * self.width + x) as usize] = Tile::new(tile_type);
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Room {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

impl Room {
    pub fn new(x: i32, y: i32, width: i32, height: i32) -> Self {
        Self {
            x,
            y,
            width,
            height,
        }
    }

    pub fn center(&self) -> Position {
        Position::new(self.x + self.width / 2, self.y + self.height / 2)
    }

    pub fn intersects(&self, other: &Room, padding: i32) -> bool {
        self.x - padding <= other.x + other.width
            && self.x + self.width + padding >= other.x
            && self.y - padding <= other.y + other.height
            && self.y + self.height + padding >= other.y
    }

    pub fn contains(&self, x: i32, y: i32) -> bool {
        x >= self.x && x < self.x + self.width && y >= self.y && y < self.y + self.height
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Player {
    pub position: Position,
    pub health: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum NetworkMessage {
    RequestChunk {
        x: i32,
        y: i32,
    },
    ChunkData(MapChunk),
    PlayerUpdate(Player),
    MapInfo {
        width: u32,
        height: u32,
        chunk_size: u32,
    },
    Error(String),
    RequestPath {
        chunk_x: i32,
        chunk_y: i32,
        start_x: i32,
        start_y: i32,
        end_x: i32,
        end_y: i32,
    },
    PathResult {
        chunk_x: i32,
        chunk_y: i32,
        path: Vec<Position>,
        found: bool,
    },
    PlayerMove {
        chunk_x: i32,
        chunk_y: i32,
        new_x: i32,
        new_y: i32,
    },
    VisibilityData {
        chunk_x: i32,
        chunk_y: i32,
        player_position: Position,
        visible_tiles: Vec<Position>,
    },
    RequestVisibility {
        chunk_x: i32,
        chunk_y: i32,
        player_x: i32,
        player_y: i32,
        view_radius: i32,
    },
}
