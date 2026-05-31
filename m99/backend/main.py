from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
import struct
import io
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient

app = FastAPI(title="SPH Fluid Simulator API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MONGODB_URL = "mongodb://localhost:27017"
MONGODB_DB = "sph_simulator"
MONGODB_COLLECTION = "snapshots"

client: Optional[AsyncIOMotorClient] = None
db = None
snapshots_collection = None


@app.on_event("startup")
async def startup_db_client():
    global client, db, snapshots_collection
    try:
        client = AsyncIOMotorClient(MONGODB_URL)
        db = client[MONGODB_DB]
        snapshots_collection = db[MONGODB_COLLECTION]
        await snapshots_collection.create_index("created_at")
        print("MongoDB connected successfully")
    except Exception as e:
        print(f"MongoDB connection failed: {e}")
        print("Snapshot functionality will be disabled")


@app.on_event("shutdown")
async def shutdown_db_client():
    if client:
        client.close()


class SimulationParams(BaseModel):
    gravity: float = -9.8
    viscosity: float = 0.05
    particle_radius: float = 0.025
    rest_density: float = 1000.0
    smoothing_length: float = 0.1
    stiffness: float = 1000.0
    dt: float = 0.001
    num_particles: int = 100000


current_params = SimulationParams()


class ParticleData(BaseModel):
    positions: List[List[float]]
    colors: List[List[float]]


class SnapshotCreate(BaseModel):
    name: str = Field(..., description="Name of the snapshot")
    description: Optional[str] = Field(None, description="Optional description")
    params: SimulationParams
    particles: ParticleData


class SnapshotResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    num_particles: int
    created_at: datetime
    params: SimulationParams

    class Config:
        from_attributes = True


class SnapshotDetailResponse(SnapshotResponse):
    particles: ParticleData


def str_to_objectid(snapshot_id: str) -> ObjectId:
    try:
        return ObjectId(snapshot_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid snapshot ID format")


@app.get("/api/params")
async def get_params():
    return current_params


@app.post("/api/params")
async def set_params(params: SimulationParams):
    global current_params
    current_params = params
    return {"status": "success", "params": current_params}


@app.post("/api/export/ply")
async def export_ply(data: ParticleData, filename: str = None):
    if len(data.positions) != len(data.colors):
        raise HTTPException(status_code=400, detail="Positions and colors must have the same length")
    
    num_particles = len(data.positions)
    
    header = f"""ply
format ascii 1.0
comment SPH Fluid Simulation Point Cloud
comment Exported on {datetime.now().isoformat()}
element vertex {num_particles}
property float x
property float y
property float z
property uchar red
property uchar green
property uchar blue
end_header
"""
    
    content = io.StringIO()
    content.write(header)
    
    for pos, color in zip(data.positions, data.colors):
        x = float(pos[0])
        y = float(pos[1])
        z = float(pos[2]) if len(pos) > 2 else 0.0
        r = int(color[0] * 255)
        g = int(color[1] * 255)
        b = int(color[2] * 255)
        content.write(f"{x:.6f} {y:.6f} {z:.6f} {r} {g} {b}\n")
    
    if filename is None:
        filename = f"fluid_simulation_{datetime.now().strftime('%Y%m%d_%H%M%S')}.ply"
    
    return Response(
        content=content.getvalue(),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@app.post("/api/export/ply-binary")
async def export_ply_binary(data: ParticleData, filename: str = None):
    if len(data.positions) != len(data.colors):
        raise HTTPException(status_code=400, detail="Positions and colors must have the same length")
    
    num_particles = len(data.positions)
    
    header = f"""ply
format binary_little_endian 1.0
comment SPH Fluid Simulation Point Cloud
comment Exported on {datetime.now().isoformat()}
element vertex {num_particles}
property float x
property float y
property float z
property uchar red
property uchar green
property uchar blue
end_header
"""
    
    binary_data = bytearray()
    for pos, color in zip(data.positions, data.colors):
        x = float(pos[0])
        y = float(pos[1])
        z = float(pos[2]) if len(pos) > 2 else 0.0
        r = int(color[0] * 255)
        g = int(color[1] * 255)
        b = int(color[2] * 255)
        
        binary_data.extend(struct.pack('<fffBBB', x, y, z, r, g, b))
    
    if filename is None:
        filename = f"fluid_simulation_{datetime.now().strftime('%Y%m%d_%H%M%S')}_binary.ply"
    
    return Response(
        content=header.encode('ascii') + binary_data,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@app.get("/api/snapshots", response_model=List[SnapshotResponse])
async def list_snapshots(limit: int = 50, skip: int = 0):
    if snapshots_collection is None:
        raise HTTPException(status_code=503, detail="MongoDB not connected")
    
    cursor = snapshots_collection.find().sort("created_at", -1).skip(skip).limit(limit)
    snapshots = await cursor.to_list(length=limit)
    
    return [
        {
            "id": str(snap["_id"]),
            "name": snap["name"],
            "description": snap.get("description"),
            "num_particles": snap["num_particles"],
            "created_at": snap["created_at"],
            "params": snap["params"]
        }
        for snap in snapshots
    ]


@app.post("/api/snapshots", response_model=SnapshotResponse)
async def create_snapshot(snapshot: SnapshotCreate):
    if snapshots_collection is None:
        raise HTTPException(status_code=503, detail="MongoDB not connected")
    
    if len(snapshot.particles.positions) != len(snapshot.particles.colors):
        raise HTTPException(status_code=400, detail="Positions and colors must have the same length")
    
    document = {
        "name": snapshot.name,
        "description": snapshot.description,
        "num_particles": len(snapshot.particles.positions),
        "created_at": datetime.utcnow(),
        "params": snapshot.params.model_dump(),
        "particles": {
            "positions": snapshot.particles.positions,
            "colors": snapshot.particles.colors
        }
    }
    
    result = await snapshots_collection.insert_one(document)
    document["_id"] = result.inserted_id
    
    return {
        "id": str(document["_id"]),
        "name": document["name"],
        "description": document.get("description"),
        "num_particles": document["num_particles"],
        "created_at": document["created_at"],
        "params": document["params"]
    }


@app.get("/api/snapshots/{snapshot_id}", response_model=SnapshotDetailResponse)
async def get_snapshot(snapshot_id: str):
    if snapshots_collection is None:
        raise HTTPException(status_code=503, detail="MongoDB not connected")
    
    oid = str_to_objectid(snapshot_id)
    snapshot = await snapshots_collection.find_one({"_id": oid})
    
    if snapshot is None:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    
    return {
        "id": str(snapshot["_id"]),
        "name": snapshot["name"],
        "description": snapshot.get("description"),
        "num_particles": snapshot["num_particles"],
        "created_at": snapshot["created_at"],
        "params": snapshot["params"],
        "particles": snapshot["particles"]
    }


@app.delete("/api/snapshots/{snapshot_id}")
async def delete_snapshot(snapshot_id: str):
    if snapshots_collection is None:
        raise HTTPException(status_code=503, detail="MongoDB not connected")
    
    oid = str_to_objectid(snapshot_id)
    result = await snapshots_collection.delete_one({"_id": oid})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    
    return {"status": "success", "message": "Snapshot deleted"}


@app.get("/api/snapshots/{snapshot_id}/export/ply")
async def export_snapshot_ply(snapshot_id: str):
    if snapshots_collection is None:
        raise HTTPException(status_code=503, detail="MongoDB not connected")
    
    oid = str_to_objectid(snapshot_id)
    snapshot = await snapshots_collection.find_one({"_id": oid})
    
    if snapshot is None:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    
    particles = snapshot["particles"]
    data = ParticleData(positions=particles["positions"], colors=particles["colors"])
    
    filename = f"snapshot_{snapshot['name'].replace(' ', '_')}_{snapshot_id[:8]}.ply"
    return await export_ply(data, filename)


@app.get("/api/health")
async def health_check():
    mongo_status = "connected" if snapshots_collection is not None else "disconnected"
    return {
        "status": "healthy",
        "message": "SPH Simulator API is running",
        "mongodb": mongo_status
    }


@app.get("/")
async def root():
    return {
        "message": "SPH Fluid Simulator API",
        "version": "1.1.0",
        "features": [
            "WebGPU SPH fluid simulation",
            "Parameter management API",
            "PLY point cloud export",
            "MongoDB snapshot storage and playback"
        ],
        "endpoints": {
            "GET /api/params": "Get current simulation parameters",
            "POST /api/params": "Set simulation parameters",
            "POST /api/export/ply": "Export point cloud as ASCII PLY",
            "POST /api/export/ply-binary": "Export point cloud as binary PLY",
            "GET /api/snapshots": "List all snapshots",
            "POST /api/snapshots": "Create a new snapshot",
            "GET /api/snapshots/{id}": "Get snapshot details",
            "DELETE /api/snapshots/{id}": "Delete a snapshot",
            "GET /api/snapshots/{id}/export/ply": "Export snapshot as PLY",
            "GET /api/health": "Health check"
        }
    }
