use crate::components::*;
use legion::*;
use rand::{Rng, SeedableRng};
use serde::{Deserialize, Serialize};
use std::collections::{BinaryHeap, HashMap, VecDeque};
use std::cmp::Ordering;

#[derive(Debug, Clone, Copy)]
pub enum GenerationAlgorithm {
    BSP,
    CellularAutomata,
}

#[derive(Debug, Clone)]
pub struct DungeonConfig {
    pub width: u32,
    pub height: u32,
    pub chunk_size: u32,
    pub seed: u64,
    pub algorithm: GenerationAlgorithm,
    pub min_room_size: i32,
    pub max_room_size: i32,
    pub room_padding: i32,
}

impl Default for DungeonConfig {
    fn default() -> Self {
        Self {
            width: 256,
            height: 256,
            chunk_size: 32,
            seed: 42,
            algorithm: GenerationAlgorithm::BSP,
            min_room_size: 6,
            max_room_size: 15,
            room_padding: 2,
        }
    }
}

pub struct ChunkCache {
    chunks: HashMap<ChunkCoord, MapChunk>,
}

impl ChunkCache {
    pub fn new() -> Self {
        Self {
            chunks: HashMap::new(),
        }
    }

    pub fn get(&self, coord: ChunkCoord) -> Option<&MapChunk> {
        self.chunks.get(&coord)
    }

    pub fn insert(&mut self, chunk: MapChunk) {
        self.chunks.insert(chunk.coord, chunk);
    }

    pub fn clear(&mut self) {
        self.chunks.clear();
    }
}

pub fn generate_chunk(
    config: &DungeonConfig,
    cache: &mut ChunkCache,
    coord: ChunkCoord,
) -> MapChunk {
    if let Some(chunk) = cache.get(coord) {
        return chunk.clone();
    }

    let chunk = match config.algorithm {
        GenerationAlgorithm::BSP => generate_bsp_chunk(coord, config),
        GenerationAlgorithm::CellularAutomata => generate_cellular_chunk(coord, config),
    };

    cache.insert(chunk.clone());
    chunk
}

struct BSPNode {
    x: i32,
    y: i32,
    width: i32,
    height: i32,
    left: Option<Box<BSPNode>>,
    right: Option<Box<BSPNode>>,
    room: Option<Room>,
}

impl BSPNode {
    fn new(x: i32, y: i32, width: i32, height: i32) -> Self {
        Self {
            x,
            y,
            width,
            height,
            left: None,
            right: None,
            room: None,
        }
    }

    fn split(&mut self, config: &DungeonConfig, rng: &mut impl Rng) {
        if self.width < config.min_room_size * 2 && self.height < config.min_room_size * 2 {
            return;
        }

        let split_horizontal = if self.width > self.height {
            false
        } else if self.height > self.width {
            true
        } else {
            rng.gen_bool(0.5)
        };

        let max_split = if split_horizontal {
            self.height - config.min_room_size
        } else {
            self.width - config.min_room_size
        };

        if max_split <= config.min_room_size {
            return;
        }

        let split_pos = rng.gen_range(config.min_room_size..=max_split);

        if split_horizontal {
            self.left = Some(Box::new(BSPNode::new(
                self.x, self.y, self.width, split_pos,
            )));
            self.right = Some(Box::new(BSPNode::new(
                self.x,
                self.y + split_pos,
                self.width,
                self.height - split_pos,
            )));
        } else {
            self.left = Some(Box::new(BSPNode::new(
                self.x,
                self.y,
                split_pos,
                self.height,
            )));
            self.right = Some(Box::new(BSPNode::new(
                self.x + split_pos,
                self.y,
                self.width - split_pos,
                self.height,
            )));
        }

        if let Some(left) = &mut self.left {
            left.split(config, rng);
        }
        if let Some(right) = &mut self.right {
            right.split(config, rng);
        }
    }

    fn create_rooms(&mut self, config: &DungeonConfig, rng: &mut impl Rng, rooms: &mut Vec<Room>) {
        if let Some(left) = &mut self.left {
            left.create_rooms(config, rng, rooms);
        }
        if let Some(right) = &mut self.right {
            right.create_rooms(config, rng, rooms);
        }

        if self.left.is_none() && self.right.is_none() {
            let room_width =
                rng.gen_range(config.min_room_size..=self.width.min(config.max_room_size));
            let room_height =
                rng.gen_range(config.min_room_size..=self.height.min(config.max_room_size));
            let room_x = self.x + rng.gen_range(0..=self.width - room_width);
            let room_y = self.y + rng.gen_range(0..=self.height - room_height);

            let room = Room::new(room_x, room_y, room_width, room_height);
            self.room = Some(room);
            rooms.push(room);
        }
    }
}

fn carve_room(chunk: &mut MapChunk, room: &Room) {
    for y in room.y..room.y + room.height {
        for x in room.x..room.x + room.width {
            if x >= 0 && y >= 0 && x < chunk.width as i32 && y < chunk.height as i32 {
                chunk.set_tile_type(x as u32, y as u32, TileType::Floor);
            }
        }
    }
}

fn carve_corridor(chunk: &mut MapChunk, from: &Position, to: &Position, rng: &mut impl Rng) {
    let mut x = from.x;
    let mut y = from.y;

    let horizontal_first = rng.gen_bool(0.5);

    if horizontal_first {
        while x != to.x {
            if x >= 0 && y >= 0 && x < chunk.width as i32 && y < chunk.height as i32 {
                chunk.set_tile_type(x as u32, y as u32, TileType::Corridor);
            }
            x += if x < to.x { 1 } else { -1 };
        }
        while y != to.y {
            if x >= 0 && y >= 0 && x < chunk.width as i32 && y < chunk.height as i32 {
                chunk.set_tile_type(x as u32, y as u32, TileType::Corridor);
            }
            y += if y < to.y { 1 } else { -1 };
        }
    } else {
        while y != to.y {
            if x >= 0 && y >= 0 && x < chunk.width as i32 && y < chunk.height as i32 {
                chunk.set_tile_type(x as u32, y as u32, TileType::Corridor);
            }
            y += if y < to.y { 1 } else { -1 };
        }
        while x != to.x {
            if x >= 0 && y >= 0 && x < chunk.width as i32 && y < chunk.height as i32 {
                chunk.set_tile_type(x as u32, y as u32, TileType::Corridor);
            }
            x += if x < to.x { 1 } else { -1 };
        }
    }
}

pub fn generate_cellular_chunk(coord: ChunkCoord, config: &DungeonConfig) -> MapChunk {
    let mut chunk = MapChunk::new(coord, config.chunk_size, config.chunk_size, config.seed);
    let chunk_seed = config
        .seed
        .wrapping_add((coord.x as u64) << 32)
        .wrapping_add(coord.y as u64);
    let mut rng = rand::rngs::StdRng::seed_from_u64(chunk_seed);

    let width = config.chunk_size as i32;
    let height = config.chunk_size as i32;

    for y in 0..height {
        for x in 0..width {
            let tile_type = if x == 0 || y == 0 || x == width - 1 || y == height - 1 {
                TileType::Wall
            } else if rng.gen_bool(0.45) {
                TileType::Wall
            } else {
                TileType::Floor
            };
            chunk.set_tile_type(x as u32, y as u32, tile_type);
        }
    }

    for _ in 0..5 {
        let mut new_tiles = chunk.tiles.clone();
        for y in 1..height - 1 {
            for x in 1..width - 1 {
                let walls = count_walls(&chunk, x, y, width, height);
                let idx = (y * width + x) as usize;
                if walls >= 5 {
                    new_tiles[idx] = Tile::new(TileType::Wall);
                } else if walls <= 3 {
                    new_tiles[idx] = Tile::new(TileType::Floor);
                }
            }
        }
        chunk.tiles = new_tiles;
    }

    chunk
}

fn count_walls(chunk: &MapChunk, x: i32, y: i32, width: i32, height: i32) -> u32 {
    let mut count = 0;
    for dy in -1..=1 {
        for dx in -1..=1 {
            if dx == 0 && dy == 0 {
                continue;
            }
            let nx = x + dx;
            let ny = y + dy;
            if nx < 0 || ny < 0 || nx >= width || ny >= height {
                count += 1;
            } else {
                if let Some(tile) = chunk.get_tile(nx as u32, ny as u32) {
                    if tile.tile_type == TileType::Wall {
                        count += 1;
                    }
                }
            }
        }
    }
    count
}

pub fn flood_fill(chunk: &MapChunk, start_x: i32, start_y: i32) -> Vec<(i32, i32)> {
    let mut visited = vec![false; (chunk.width * chunk.height) as usize];
    let mut result = Vec::new();
    let mut queue = VecDeque::new();

    let idx = |x: i32, y: i32| (y * chunk.width as i32 + x) as usize;

    if start_x < 0 || start_y < 0 || start_x >= chunk.width as i32 || start_y >= chunk.height as i32 {
        return result;
    }

    let start_idx = idx(start_x, start_y);
    if !chunk.tiles[start_idx].passable {
        return result;
    }

    visited[start_idx] = true;
    queue.push_back((start_x, start_y));

    let directions = [(0, -1), (0, 1), (-1, 0), (1, 0)];

    while let Some((x, y)) = queue.pop_front() {
        result.push((x, y));

        for (dx, dy) in directions.iter() {
            let nx = x + dx;
            let ny = y + dy;

            if nx >= 0 && ny >= 0 && nx < chunk.width as i32 && ny < chunk.height as i32 {
                let nidx = idx(nx, ny);
                if !visited[nidx] && chunk.tiles[nidx].passable {
                    visited[nidx] = true;
                    queue.push_back((nx, ny));
                }
            }
        }
    }

    result
}

pub fn find_all_regions(chunk: &MapChunk) -> Vec<Vec<(i32, i32)>> {
    let mut visited = vec![false; (chunk.width * chunk.height) as usize];
    let mut regions = Vec::new();

    let idx = |x: i32, y: i32| (y * chunk.width as i32 + x) as usize;

    for y in 0..chunk.height as i32 {
        for x in 0..chunk.width as i32 {
            let i = idx(x, y);
            if !visited[i] && chunk.tiles[i].passable {
                let region = flood_fill(chunk, x, y);
                for &(rx, ry) in &region {
                    visited[idx(rx, ry)] = true;
                }
                regions.push(region);
            }
        }
    }

    regions
}

pub fn find_main_region(chunk: &MapChunk) -> Option<Vec<(i32, i32)>> {
    let regions = find_all_regions(chunk);
    regions.into_iter().max_by_key(|r| r.len())
}

pub fn connect_regions(chunk: &mut MapChunk, rng: &mut impl Rng) {
    let regions = find_all_regions(chunk);
    if regions.len() <= 1 {
        return;
    }

    let mut region_centers = Vec::new();
    for region in &regions {
        let sum_x: i32 = region.iter().map(|(x, _)| *x).sum();
        let sum_y: i32 = region.iter().map(|(_, y)| *y).sum();
        let count = region.len() as i32;
        region_centers.push(Position::new(sum_x / count, sum_y / count));
    }

    for i in 0..region_centers.len().saturating_sub(1) {
        carve_corridor(chunk, &region_centers[i], &region_centers[i + 1], rng);
    }
}

pub fn ensure_connected(chunk: &mut MapChunk, rng: &mut impl Rng, max_attempts: u32) {
    for _ in 0..max_attempts {
        let regions = find_all_regions(chunk);
        if regions.len() <= 1 {
            break;
        }
        connect_regions(chunk, rng);
    }
}

pub fn find_random_position_in_region(
    region: &[(i32, i32)],
    rng: &mut impl Rng,
) -> Option<Position> {
    if region.is_empty() {
        return None;
    }
    let idx = rng.gen_range(0..region.len());
    Some(Position::new(region[idx].0, region[idx].1))
}

pub fn connect_all_rooms(chunk: &mut MapChunk, rooms: &[Room], rng: &mut impl Rng) {
    if rooms.is_empty() {
        return;
    }

    let mut connected = vec![false; rooms.len()];
    connected[0] = true;
    let mut connected_count = 1;

    while connected_count < rooms.len() {
        let mut min_dist = f32::INFINITY;
        let mut best_from = 0;
        let mut best_to = 0;

        for i in 0..rooms.len() {
            if !connected[i] {
                continue;
            }
            for j in 0..rooms.len() {
                if connected[j] {
                    continue;
                }
                let dist = rooms[i].center().distance(&rooms[j].center());
                if dist < min_dist {
                    min_dist = dist;
                    best_from = i;
                    best_to = j;
                }
            }
        }

        if min_dist < f32::INFINITY {
            carve_corridor(
                chunk,
                &rooms[best_from].center(),
                &rooms[best_to].center(),
                rng,
            );
            connected[best_to] = true;
            connected_count += 1;
        } else {
            break;
        }
    }
}

pub fn generate_bsp_chunk(coord: ChunkCoord, config: &DungeonConfig) -> MapChunk {
    let mut chunk = MapChunk::new(coord, config.chunk_size, config.chunk_size, config.seed);
    let chunk_seed = config
        .seed
        .wrapping_add((coord.x as u64) << 32)
        .wrapping_add(coord.y as u64);
    let mut rng = rand::rngs::StdRng::seed_from_u64(chunk_seed);

    let mut root = BSPNode::new(0, 0, config.chunk_size as i32, config.chunk_size as i32);
    root.split(config, &mut rng);

    let mut rooms = Vec::new();
    root.create_rooms(config, &mut rng, &mut rooms);

    for room in &rooms {
        carve_room(&mut chunk, room);
    }

    connect_all_rooms(&mut chunk, &rooms, &mut rng);

    ensure_connected(&mut chunk, &mut rng, 3);

    if let Some(main_region) = find_main_region(&chunk) {
        if !main_region.is_empty() {
            if let Some(pos) = find_random_position_in_region(&main_region, &mut rng) {
                chunk.set_tile_type(pos.x as u32, pos.y as u32, TileType::StairUp);
            }

            if let Some(pos) = find_random_position_in_region(&main_region, &mut rng) {
                chunk.set_tile_type(pos.x as u32, pos.y as u32, TileType::StairDown);
            }
        }
    }

    chunk
}

pub fn generate_world(
    world: &mut World,
    config: &DungeonConfig,
    cache: &mut ChunkCache,
) {
    cache.clear();

    let chunks_x = (config.width + config.chunk_size - 1) / config.chunk_size;
    let chunks_y = (config.height + config.chunk_size - 1) / config.chunk_size;

    for cy in 0..chunks_y {
        for cx in 0..chunks_x {
            let coord = ChunkCoord::new(cx as i32, cy as i32);
            let chunk = match config.algorithm {
                GenerationAlgorithm::BSP => generate_bsp_chunk(coord, config),
                GenerationAlgorithm::CellularAutomata => generate_cellular_chunk(coord, config),
            };
            cache.insert(chunk.clone());
            world.push((coord, chunk));
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct AStarNode {
    x: i32,
    y: i32,
    g_cost: i32,
    f_cost: i32,
}

impl PartialOrd for AStarNode {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for AStarNode {
    fn cmp(&self, other: &Self) -> Ordering {
        other.f_cost.cmp(&self.f_cost)
    }
}

fn heuristic(x1: i32, y1: i32, x2: i32, y2: i32) -> i32 {
    (x1 - x2).abs() + (y1 - y2).abs()
}

pub fn astar_pathfinding(
    chunk: &MapChunk,
    start_x: i32,
    start_y: i32,
    end_x: i32,
    end_y: i32,
) -> Option<Vec<Position>> {
    let width = chunk.width as i32;
    let height = chunk.height as i32;

    if start_x < 0 || start_y < 0 || start_x >= width || start_y >= height {
        return None;
    }
    if end_x < 0 || end_y < 0 || end_x >= width || end_y >= height {
        return None;
    }

    let start_idx = (start_y * width + start_x) as usize;
    let end_idx = (end_y * width + end_x) as usize;

    if !chunk.tiles[start_idx].passable || !chunk.tiles[end_idx].passable {
        return None;
    }

    let mut open_set = BinaryHeap::new();
    let mut came_from: HashMap<(i32, i32), (i32, i32)> = HashMap::new();
    let mut g_score: HashMap<(i32, i32), i32> = HashMap::new();

    let start_h = heuristic(start_x, start_y, end_x, end_y);
    open_set.push(AStarNode {
        x: start_x,
        y: start_y,
        g_cost: 0,
        f_cost: start_h,
    });
    g_score.insert((start_x, start_y), 0);

    let directions = [(0, -1), (0, 1), (-1, 0), (1, 0), (-1, -1), (-1, 1), (1, -1), (1, 1)];

    while let Some(current) = open_set.pop() {
        if current.x == end_x && current.y == end_y {
            let mut path = Vec::new();
            let mut cx = end_x;
            let mut cy = end_y;
            path.push(Position::new(cx, cy));

            while let Some(&parent) = came_from.get(&(cx, cy)) {
                cx = parent.0;
                cy = parent.1;
                path.push(Position::new(cx, cy));
            }

            path.reverse();
            return Some(path);
        }

        let current_key = (current.x, current.y);
        if *g_score.get(&current_key).unwrap_or(&i32::MAX) < current.g_cost {
            continue;
        }

        for (dx, dy) in directions.iter() {
            let nx = current.x + dx;
            let ny = current.y + dy;

            if nx < 0 || ny < 0 || nx >= width || ny >= height {
                continue;
            }

            let nidx = (ny * width + nx) as usize;
            if !chunk.tiles[nidx].passable {
                continue;
            }

            let move_cost = if *dx != 0 && *dy != 0 { 14 } else { 10 };
            let tentative_g = current.g_cost + move_cost;
            let neighbor_key = (nx, ny);

            if tentative_g < *g_score.get(&neighbor_key).unwrap_or(&i32::MAX) {
                came_from.insert(neighbor_key, current_key);
                g_score.insert(neighbor_key, tentative_g);

                let f_cost = tentative_g + heuristic(nx, ny, end_x, end_y);
                open_set.push(AStarNode {
                    x: nx,
                    y: ny,
                    g_cost: tentative_g,
                    f_cost,
                });
            }
        }
    }

    None
}

pub fn calculate_visible_tiles(
    chunk: &MapChunk,
    player_x: i32,
    player_y: i32,
    view_radius: i32,
) -> Vec<(i32, i32)> {
    let mut visible = Vec::new();
    let width = chunk.width as i32;
    let height = chunk.height as i32;

    for angle in 0..360 {
        let rad = (angle as f32) * std::f32::consts::PI / 180.0;
        let dx = rad.cos();
        let dy = rad.sin();

        for dist in 0..=view_radius {
            let x = (player_x as f32 + dx * dist as f32).round() as i32;
            let y = (player_y as f32 + dy * dist as f32).round() as i32;

            if x < 0 || y < 0 || x >= width || y >= height {
                break;
            }

            let idx = (y * width + x) as usize;
            visible.push((x, y));

            if chunk.tiles[idx].opaque {
                break;
            }
        }
    }

    visible.sort();
    visible.dedup();
    visible
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PathfindingResult {
    pub path: Vec<Position>,
    pub found: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VisibilityUpdate {
    pub player_position: Position,
    pub visible_tiles: Vec<Position>,
    pub explored_tiles: Vec<Position>,
}
