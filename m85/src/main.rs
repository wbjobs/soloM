use clap::{Parser, Subcommand};
use dungeon_generator::*;
use legion::*;
use rand::Rng;
use std::time::Instant;
use tracing_subscriber;

#[derive(Parser)]
#[command(name = "dungeon-generator")]
#[command(about = "ECS-based procedural dungeon generator with TCP streaming", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Generate a dungeon and print it to console
    Generate {
        /// Map width in tiles
        #[arg(short, long, default_value_t = 64)]
        width: u32,
        /// Map height in tiles
        #[arg(short, long, default_value_t = 64)]
        height: u32,
        /// Random seed
        #[arg(short, long, default_value_t = 42)]
        seed: u64,
        /// Algorithm: bsp or cellular
        #[arg(short, long, default_value = "bsp")]
        algorithm: String,
        /// Print the dungeon to console
        #[arg(short, long)]
        print: bool,
    },
    /// Start the TCP server to stream dungeon chunks
    Serve {
        /// Server address
        #[arg(short, long, default_value = "127.0.0.1:8080")]
        addr: String,
        /// Map width in tiles
        #[arg(long, default_value_t = 256)]
        width: u32,
        /// Map height in tiles
        #[arg(long, default_value_t = 256)]
        height: u32,
        /// Chunk size in tiles
        #[arg(long, default_value_t = 32)]
        chunk_size: u32,
        /// Random seed
        #[arg(short, long, default_value_t = 42)]
        seed: u64,
        /// Algorithm: bsp or cellular
        #[arg(short, long, default_value = "bsp")]
        algorithm: String,
        /// Serialization format: bincode or json
        #[arg(long, default_value = "bincode")]
        format: String,
    },
    /// Benchmark dungeon generation
    Benchmark {
        /// Number of iterations
        #[arg(short, long, default_value_t = 10)]
        iterations: u32,
        /// Map width in tiles
        #[arg(long, default_value_t = 256)]
        width: u32,
        /// Map height in tiles
        #[arg(long, default_value_t = 256)]
        height: u32,
    },
    /// Test dungeon connectivity across multiple seeds
    TestConnectivity {
        /// Number of tests to run
        #[arg(short, long, default_value_t = 20)]
        count: u32,
        /// Chunk size in tiles
        #[arg(long, default_value_t = 32)]
        chunk_size: u32,
    },
}

fn print_chunk(chunk: &MapChunk) {
    println!("Chunk ({}, {}):", chunk.coord.x, chunk.coord.y);
    for y in 0..chunk.height {
        let mut line = String::new();
        for x in 0..chunk.width {
            if let Some(tile) = chunk.get_tile(x, y) {
                let c = match tile.tile_type {
                    TileType::Wall => '#',
                    TileType::Floor => '.',
                    TileType::Door => '+',
                    TileType::Corridor => ',',
                    TileType::StairUp => '<',
                    TileType::StairDown => '>',
                    TileType::Water => '~',
                    TileType::Lava => '^',
                };
                line.push(c);
            }
        }
        println!("{}", line);
    }
    println!();
}

fn parse_algorithm(alg: &str) -> GenerationAlgorithm {
    match alg.to_lowercase().as_str() {
        "bsp" => GenerationAlgorithm::BSP,
        "cellular" | "ca" => GenerationAlgorithm::CellularAutomata,
        _ => {
            eprintln!("Unknown algorithm: {}, using BSP", alg);
            GenerationAlgorithm::BSP
        }
    }
}

fn parse_format(fmt: &str) -> SerializationFormat {
    match fmt.to_lowercase().as_str() {
        "bincode" => SerializationFormat::Bincode,
        "json" => SerializationFormat::Json,
        _ => {
            eprintln!("Unknown format: {}, using bincode", fmt);
            SerializationFormat::Bincode
        }
    }
}

fn run_generate(width: u32, height: u32, seed: u64, algorithm: String, print: bool) {
    let algorithm = parse_algorithm(&algorithm);
    let config = DungeonConfig {
        width,
        height,
        chunk_size: 32,
        seed,
        algorithm,
        ..Default::default()
    };

    println!("Generating dungeon with {:?} algorithm...", algorithm);
    println!("Map size: {}x{}, seed: {}", width, height, seed);

    let start = Instant::now();
    let mut world = World::default();
    let mut cache = ChunkCache::new();

    generate_world(&mut world, &config, &mut cache);

    let duration = start.elapsed();
    println!("Generation took: {:?}", duration);

    let chunks_x = (width + config.chunk_size - 1) / config.chunk_size;
    let chunks_y = (height + config.chunk_size - 1) / config.chunk_size;
    println!(
        "Total chunks: {}x{} = {}",
        chunks_x,
        chunks_y,
        chunks_x * chunks_y
    );

    if print {
        let mut query = <(Read<ChunkCoord>, Read<MapChunk>)>::query();
        for (coord, chunk) in query.iter(&world) {
            if coord.x == 0 && coord.y == 0 {
                print_chunk(chunk);
                break;
            }
        }
    }

    let mut query = <(Read<ChunkCoord>, Read<MapChunk>)>::query();
    let mut total_floor = 0;
    let mut total_wall = 0;
    let mut stair_up_count = 0;
    let mut stair_down_count = 0;

    for (_, chunk) in query.iter(&world) {
        for tile in &chunk.tiles {
            match tile.tile_type {
                TileType::Floor | TileType::Corridor => total_floor += 1,
                TileType::Wall => total_wall += 1,
                TileType::StairUp => stair_up_count += 1,
                TileType::StairDown => stair_down_count += 1,
                _ => {}
            }
        }
    }

    let total_rooms = stair_up_count.max(stair_down_count);

    let total_tiles = width * height;
    println!("Statistics:");
    println!("  Total tiles: {}", total_tiles);
    println!(
        "  Floor tiles: {} ({:.1}%)",
        total_floor,
        (total_floor as f64 / total_tiles as f64) * 100.0
    );
    println!(
        "  Wall tiles: {} ({:.1}%)",
        total_wall,
        (total_wall as f64 / total_tiles as f64) * 100.0
    );
    println!("  Total rooms: {}", total_rooms);
}

async fn run_serve(
    addr: String,
    width: u32,
    height: u32,
    chunk_size: u32,
    seed: u64,
    algorithm: String,
    format: String,
) {
    let algorithm = parse_algorithm(&algorithm);
    let format = parse_format(&format);
    let config = DungeonConfig {
        width,
        height,
        chunk_size,
        seed,
        algorithm,
        ..Default::default()
    };

    let server = DungeonServer::new(config, format);
    if let Err(e) = server.run(&addr).await {
        eprintln!("Server error: {}", e);
    }
}

fn run_benchmark(iterations: u32, width: u32, height: u32) {
    println!("Benchmarking dungeon generation...");
    println!("Map size: {}x{}, iterations: {}", width, height, iterations);

    let mut rng = rand::thread_rng();
    let mut total_duration = std::time::Duration::new(0, 0);
    let mut durations = Vec::with_capacity(iterations as usize);

    for i in 0..iterations {
        let seed = rng.gen();
        let config = DungeonConfig {
            width,
            height,
            chunk_size: 32,
            seed,
            algorithm: GenerationAlgorithm::BSP,
            ..Default::default()
        };

        let start = Instant::now();
        let mut world = World::default();
        let mut cache = ChunkCache::new();

        generate_world(&mut world, &config, &mut cache);

        let duration = start.elapsed();
        durations.push(duration);
        total_duration += duration;

        println!("  Iteration {}: {:?}", i + 1, duration);
    }

    let avg = total_duration / iterations;
    durations.sort();
    let min = durations.first().unwrap();
    let max = durations.last().unwrap();
    let median = if iterations % 2 == 0 {
        let mid = (iterations / 2) as usize;
        (durations[mid - 1] + durations[mid]) / 2
    } else {
        durations[(iterations / 2) as usize]
    };

    println!("\nResults:");
    println!("  Total: {:?}", total_duration);
    println!("  Average: {:?}", avg);
    println!("  Min: {:?}", min);
    println!("  Max: {:?}", max);
    println!("  Median: {:?}", median);
    println!(
        "  Throughput: {:.1} tiles/sec",
        (width * height) as f64 / avg.as_secs_f64()
    );
}

fn run_test_connectivity(count: u32, chunk_size: u32) {
    println!("Testing dungeon connectivity...\n");

    let mut rng = rand::thread_rng();

    let mut total_regions = 0;
    let mut total_islands = 0;
    let mut max_regions = 0;

    for i in 0..count {
        let seed: u64 = rng.gen();
        let coord = ChunkCoord::new(0, 0);
        let config = DungeonConfig {
            chunk_size,
            seed,
            algorithm: GenerationAlgorithm::BSP,
            ..Default::default()
        };

        let chunk = generate_bsp_chunk(coord, &config);
        let regions = find_all_regions(&chunk);

        total_regions += regions.len();
        if regions.len() > 1 {
            total_islands += 1;
            if regions.len() > max_regions {
                max_regions = regions.len();
            }
            println!(
                "Test {}/{}: Seed {} - {} regions (has islands!)",
                i + 1,
                count,
                seed,
                regions.len()
            );
        } else {
            println!(
                "Test {}/{}: Seed {} - 1 region (fully connected)",
                i + 1,
                count,
                seed
            );
        }

        if i < 3 {
            if let Some(main_region) = find_main_region(&chunk) {
                println!("  Main region size: {} tiles", main_region.len());
            }
            if regions.len() > 1 {
                for (idx, region) in regions.iter().enumerate() {
                    println!("  Region {}: {} tiles", idx, region.len());
                }
            }
        }
    }

    println!("\n=== Summary ===");
    println!("Total tests: {}", count);
    println!(
        "Chunks with islands: {} ({:.1}%)",
        total_islands,
        (total_islands as f64 / count as f64) * 100.0
    );
    println!(
        "Average regions per chunk: {:.2}",
        total_regions as f64 / count as f64
    );
    println!("Max regions in a single chunk: {}", max_regions);

    if total_islands == 0 {
        println!("\n✅ SUCCESS: All dungeons are fully connected!");
    } else {
        println!("\n⚠️  WARNING: Some dungeons still have isolated regions");
    }
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .init();

    let cli = Cli::parse();

    match cli.command {
        Commands::Generate {
            width,
            height,
            seed,
            algorithm,
            print,
        } => {
            run_generate(width, height, seed, algorithm, print);
        }
        Commands::Serve {
            addr,
            width,
            height,
            chunk_size,
            seed,
            algorithm,
            format,
        } => {
            run_serve(addr, width, height, chunk_size, seed, algorithm, format).await;
        }
        Commands::Benchmark {
            iterations,
            width,
            height,
        } => {
            run_benchmark(iterations, width, height);
        }
        Commands::TestConnectivity { count, chunk_size } => {
            run_test_connectivity(count, chunk_size);
        }
    }
}
